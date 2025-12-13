import { useState, useEffect, useRef } from 'react';

const CONFIG = {
  INFERENCE_INTERVAL: 250, 
};

function App() {
  const [status, setStatus] = useState('Initializing...');
  const [trafficLight, setTrafficLight] = useState('OFF');
  const [debugInfo, setDebugInfo] = useState({ label: '-', score: 0, mouth: 'Closed' });
  
  // UI용 State
  const [settings, setSettings] = useState({
      confidence: 50,      // 👈 [수정] 기본값 50%
      mouthOpen: 10,       
      lipMovement: 20,     
      strictness: 3        
  });

  const [logs, setLogs] = useState([]);
  const [violationLogs, setViolationLogs] = useState([]);
  
  // 패널 상태
  const [showLogs, setShowLogs] = useState(true);
  const [showVisualizer, setShowVisualizer] = useState(true);
  
  const [logTab, setLogTab] = useState('LIVE');

  // Logic용 Ref
  const settingsRef = useRef({
      confidence: 0.50,    // 👈 [수정] 기본값 0.5
      mouthOpen: 0.01,
      lipMovement: 0.002,
      strictness: 3
  });

  // 시각화용 데이터 Ref
  const visualizerDataRef = useRef({
      gap: 0,
      movement: 0,
      upperLip: { x: 0, y: 0 },
      lowerLip: { x: 0, y: 0 },
      hasFace: false
  });

  const videoRef = useRef(null);
  const canvasRef = useRef(null); 
  const classifierRef = useRef(null);
  const landmarkerRef = useRef(null);
  const historyQueue = useRef([]);
  const isRunning = useRef(false);
  const isInitCalled = useRef(false);

  const modelSettings = useRef({ frequency: 16000, inputSize: 16000 });
  const lipDistanceHistory = useRef([]); 

  useEffect(() => {
    if (isInitCalled.current) return;
    isInitCalled.current = true;

    const loadModels = async () => {
      try {
        console.log("🚀 System Start: Loading...");

        // 1. Audio Model
        let retries = 0;
        while (!window.EdgeImpulseClassifier && retries < 100) {
            await new Promise(r => setTimeout(r, 100));
            retries++;
        }
        if (!window.EdgeImpulseClassifier) throw new Error("Audio Model Timeout");

        const classifier = new window.EdgeImpulseClassifier();
        await classifier.init();
        
        const props = classifier.getProperties();
        modelSettings.current = {
            frequency: props.frequency,             
            inputSize: props.input_features_count   
        };
        
        classifierRef.current = classifier;
        const audioModuleBackup = window.Module;
        window.Module = undefined;

        // 2. Vision Model
        const { FilesetResolver, FaceLandmarker } = await import('@mediapipe/tasks-vision');
        const vision = await FilesetResolver.forVisionTasks("https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0/wasm");
        landmarkerRef.current = await FaceLandmarker.createFromOptions(vision, {
          baseOptions: { modelAssetPath: `https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task` },
          runningMode: "VIDEO",
          numFaces: 1
        });

        window.Module = audioModuleBackup;
        setStatus('Ready to Start! 🚀');

      } catch (error) {
        console.error("❌ Error:", error);
        setStatus('Error: Check Console');
      }
    };

    loadModels();
  }, []);

  // 캔버스 그리기 루프
  useEffect(() => {
      let animationFrameId;
      
      const draw = () => {
          if (showVisualizer && canvasRef.current && videoRef.current && videoRef.current.readyState >= 2) {
              const ctx = canvasRef.current.getContext('2d');
              const { width, height } = canvasRef.current;
              
              ctx.save();
              ctx.scale(-1, 1); 
              ctx.drawImage(videoRef.current, -width, 0, width, height);
              ctx.restore();

              if (visualizerDataRef.current.hasFace) {
                  const { upperLip, lowerLip } = visualizerDataRef.current;
                  
                  const ux = (1 - upperLip.x) * width;
                  const uy = upperLip.y * height;
                  const lx = (1 - lowerLip.x) * width;
                  const ly = lowerLip.y * height;

                  ctx.fillStyle = '#00FF00'; 
                  ctx.beginPath(); ctx.arc(ux, uy, 3, 0, 2 * Math.PI); ctx.fill();
                  ctx.beginPath(); ctx.arc(lx, ly, 3, 0, 2 * Math.PI); ctx.fill();

                  ctx.strokeStyle = 'rgba(0, 255, 0, 0.5)';
                  ctx.lineWidth = 2;
                  ctx.beginPath(); ctx.moveTo(ux, uy); ctx.lineTo(lx, ly); ctx.stroke();
              }
          }
          animationFrameId = requestAnimationFrame(draw);
      };
      
      if (showVisualizer) {
          draw();
      }
      
      return () => cancelAnimationFrame(animationFrameId);
  }, [showVisualizer]); 

  const handleSettingChange = (key, value) => {
      setSettings(prev => ({ ...prev, [key]: value }));
      if (key === 'confidence') settingsRef.current.confidence = value / 100;
      if (key === 'mouthOpen') settingsRef.current.mouthOpen = value / 1000; 
      if (key === 'lipMovement') settingsRef.current.lipMovement = value / 10000; 
      if (key === 'strictness') settingsRef.current.strictness = value;
  };

  const calculateStandardDeviation = (arr) => {
    if (arr.length === 0) return 0;
    const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
    const variance = arr.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / arr.length;
    return Math.sqrt(variance);
  };

  const downsampleBuffer = (buffer, inputRate, outputRate) => {
    if (outputRate === inputRate) return buffer;
    const sampleRateRatio = inputRate / outputRate;
    const newLength = Math.round(buffer.length / sampleRateRatio);
    const result = new Float32Array(newLength);
    let offsetResult = 0;
    let offsetBuffer = 0;
    while (offsetResult < result.length) {
        const nextOffsetBuffer = Math.round((offsetResult + 1) * sampleRateRatio);
        let accum = 0, count = 0;
        for (let i = offsetBuffer; i < nextOffsetBuffer && i < buffer.length; i++) {
            accum += buffer[i];
            count++;
        }
        result[offsetResult] = accum / count;
        offsetResult++;
        offsetBuffer = nextOffsetBuffer;
    }
    return result;
  };

  const startSystem = async () => {
    try {
      setStatus('Starting Sensors...');
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      videoRef.current.srcObject = stream;
      videoRef.current.play();

      const AudioContext = window.AudioContext || window.webkitAudioContext;
      const audioCtx = new AudioContext();
      const actualSampleRate = audioCtx.sampleRate;
      const targetFreq = modelSettings.current.frequency;

      if (audioCtx.state === 'suspended') await audioCtx.resume();
      const source = audioCtx.createMediaStreamSource(stream);
      const processor = audioCtx.createScriptProcessor(16384, 1, 1);
      source.connect(processor);
      processor.connect(audioCtx.destination); 

      const audioBuffer = [];
      
      processor.onaudioprocess = (e) => {
        const input = e.inputBuffer.getChannelData(0);
        const downsampled = downsampleBuffer(input, actualSampleRate, targetFreq);
        for (let i = 0; i < downsampled.length; i++) audioBuffer.push(downsampled[i]);
        const maxBufferSize = modelSettings.current.inputSize * 5;
        if (audioBuffer.length > maxBufferSize) {
            audioBuffer.splice(0, audioBuffer.length - (modelSettings.current.inputSize * 2));
        }
      };

      isRunning.current = true;
      setStatus('Monitoring Active 🟢');

      setInterval(async () => {
        if (!isRunning.current) return;

        const { confidence, mouthOpen, lipMovement, strictness } = settingsRef.current;

        // --- Vision Check ---
        let visualState = 'No Face 🚫';
        let isSpeakingVisual = false;
        let currentGap = 0;
        let movement = 0;

        if (landmarkerRef.current && videoRef.current.currentTime > 0) {
          const result = landmarkerRef.current.detectForVideo(videoRef.current, performance.now());
          
          if (result.faceLandmarks.length > 0) {
            const landmarks = result.faceLandmarks[0];
            const upperLip = landmarks[13];
            const lowerLip = landmarks[14];
            
            visualizerDataRef.current = {
                hasFace: true,
                upperLip: { x: upperLip.x, y: upperLip.y },
                lowerLip: { x: lowerLip.x, y: lowerLip.y },
                gap: 0, 
                movement: 0
            };

            currentGap = lowerLip.y - upperLip.y;
            visualizerDataRef.current.gap = currentGap;

            lipDistanceHistory.current.push(currentGap);
            if (lipDistanceHistory.current.length > 5) lipDistanceHistory.current.shift();
            movement = calculateStandardDeviation(lipDistanceHistory.current);
            visualizerDataRef.current.movement = movement;

            if (currentGap > mouthOpen) {
                if (movement > lipMovement) {
                    visualState = 'Speaking 🗣️';
                    isSpeakingVisual = true;
                } else {
                    visualState = 'Mouth Open 😮';
                }
            } else {
                visualState = 'Closed 😐';
            }
          } else {
             visualizerDataRef.current.hasFace = false;
          }
        }

        // --- Audio Check ---
        let audioLabel = 'noise';
        let audioConfidence = 0;
        const requiredSize = modelSettings.current.inputSize;

        if (classifierRef.current && audioBuffer.length >= requiredSize) {
           const inputData = audioBuffer.slice(audioBuffer.length - requiredSize);
           try {
              const res = classifierRef.current.classify(inputData);
              if (res.results && res.results.length > 0) {
                  const topResult = res.results.reduce((prev, current) => (prev.value > current.value) ? prev : current);
                  audioLabel = topResult.label;
                  audioConfidence = topResult.value;
              }
           } catch(e) {}
        }

        // --- Final Decision ---
        let isKoreanSuspected = 0;
        const isKoreanLabel = audioLabel.toLowerCase() === 'korean';
        
        if (isSpeakingVisual && isKoreanLabel && audioConfidence > confidence) { 
            isKoreanSuspected = 1;
        }

        historyQueue.current.push(isKoreanSuspected);
        if (historyQueue.current.length > 10) historyQueue.current.shift();

        const now = new Date();
        const timeString = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`;

        const logEntry = {
            id: Date.now(),
            time: timeString,
            label: audioLabel.toLowerCase(),
            score: Math.round(audioConfidence * 100),
            mouth: visualState, 
            isSuspect: isKoreanSuspected === 1
        };

        setLogs(prev => [logEntry, ...prev].slice(0, 10));

        if (isKoreanSuspected === 1) {
            setViolationLogs(prev => [logEntry, ...prev]);
        }

        const suspectCount = historyQueue.current.filter(v => v === 1).length;
        if (suspectCount >= strictness) setTrafficLight('RED');
        else if (suspectCount >= 1) setTrafficLight('YELLOW');
        else setTrafficLight('GREEN');

        setDebugInfo({ label: audioLabel, score: audioConfidence, mouth: visualState });

      }, CONFIG.INFERENCE_INTERVAL);

    } catch (err) {
      console.error(err);
      setStatus('Error: Check Permissions');
    }
  };

  const getMouthColor = (state) => {
      if (state.includes('Speaking')) return 'text-red-400 font-bold animate-pulse';
      if (state.includes('Open')) return 'text-yellow-400 font-bold';
      if (state.includes('No Face')) return 'text-gray-500 font-bold';
      return 'text-green-400';
  };

  const getAudioIcon = (label) => {
      if (label === 'korean') return <span className="bg-red-600 text-[10px] px-1 rounded font-bold">KR</span>;
      if (label === 'english') return <span className="bg-blue-600 text-[10px] px-1 rounded font-bold">EN</span>;
      return '🔇';
  };

  const getVisualIcon = (state) => {
      if (state.includes('Speaking')) return '🗣️';
      if (state.includes('Open')) return '😮';
      if (state.includes('Closed')) return '😐';
      return '🚫';
  };

  return (
    // 👇 [핵심 수정] w-screen(화면꽉), overflow-hidden, justify-center(중앙정렬) 적용
    <div className="min-h-screen w-screen bg-gray-900 text-white flex flex-col md:flex-row p-4 gap-4 relative overflow-hidden justify-center items-center">
      
      {/* 1. 좌측 Visualizer 패널 */}
      {showVisualizer && (
          <div className="w-full md:w-64 bg-gray-800 p-4 rounded-xl border border-gray-700 flex flex-col gap-4 shadow-xl animate-fade-in-left z-40 order-2 md:order-1 shrink-0 h-fit">
              <div className="flex justify-between items-center border-b border-gray-600 pb-2">
                  <h2 className="text-lg font-bold text-gray-300">👁️ Visualizer</h2>
                  <button onClick={() => setShowVisualizer(false)} className="text-gray-400 hover:text-white">✕</button>
              </div>

              <div className="relative w-full aspect-[4/3] bg-black rounded-lg overflow-hidden border border-gray-600">
                   <canvas ref={canvasRef} width={320} height={240} className="w-full h-full object-cover" />
                   {!isRunning.current && <div className="absolute inset-0 flex items-center justify-center text-gray-500 text-xs">Camera Off</div>}
              </div>

              <div className="space-y-3">
                  <div>
                      <div className="flex justify-between text-xs mb-1">
                          <span className="text-gray-400">Mouth Gap</span>
                          <span className="font-mono text-green-400">{(visualizerDataRef.current.gap * 100).toFixed(1)}%</span>
                      </div>
                      <div className="h-2 bg-gray-700 rounded-full overflow-hidden relative">
                          <div className="absolute top-0 bottom-0 w-0.5 bg-white z-10" style={{ left: `${(settingsRef.current.mouthOpen / 0.05) * 100}%` }}></div>
                          <div 
                              className={`h-full transition-all duration-100 ${visualizerDataRef.current.gap > settingsRef.current.mouthOpen ? 'bg-green-500' : 'bg-gray-500'}`} 
                              style={{ width: `${Math.min(100, (visualizerDataRef.current.gap / 0.05) * 100)}%` }}
                          ></div>
                      </div>
                  </div>

                  <div>
                      <div className="flex justify-between text-xs mb-1">
                          <span className="text-gray-400">Lip Movement</span>
                          <span className="font-mono text-purple-400">{(visualizerDataRef.current.movement * 1000).toFixed(1)}</span>
                      </div>
                      <div className="h-2 bg-gray-700 rounded-full overflow-hidden relative">
                          <div className="absolute top-0 bottom-0 w-0.5 bg-white z-10" style={{ left: `${(settingsRef.current.lipMovement / 0.01) * 100}%` }}></div>
                          <div 
                              className={`h-full transition-all duration-100 ${visualizerDataRef.current.movement > settingsRef.current.lipMovement ? 'bg-purple-500' : 'bg-gray-500'}`} 
                              style={{ width: `${Math.min(100, (visualizerDataRef.current.movement / 0.01) * 100)}%` }}
                          ></div>
                      </div>
                  </div>
              </div>
          </div>
      )}

      {/* 2. 중앙 메인 패널 (flex-1 대신 max-w로 중앙 배치) */}
      <div className="flex flex-col items-center justify-center transition-all duration-300 order-1 md:order-2 w-full max-w-2xl">
        
        <h1 className="text-4xl font-black mb-6 text-red-500 tracking-tighter uppercase drop-shadow-[0_0_10px_rgba(239,68,68,0.5)] text-center">
          Korean Killer 🇰🇷🚫
        </h1>
        
        <div className={`w-56 h-56 md:w-64 md:h-64 rounded-full border-8 border-gray-700 flex items-center justify-center mb-8 transition-all duration-300
          ${trafficLight === 'RED' ? 'bg-red-600 shadow-[0_0_80px_red] animate-pulse' : 
            trafficLight === 'YELLOW' ? 'bg-yellow-500 shadow-[0_0_40px_yellow]' : 
            trafficLight === 'GREEN' ? 'bg-green-600 shadow-[0_0_40px_green]' : 'bg-gray-800'}`}>
          <span className="text-6xl font-bold">{trafficLight}</span>
        </div>
        
        <p className="text-xl mb-6 text-gray-300 font-mono animate-pulse text-center">{status}</p>
        
        {!isRunning.current && (
          <button onClick={startSystem} className="px-10 py-4 bg-red-600 hover:bg-red-500 rounded-full font-bold text-xl shadow-[0_0_20px_rgba(220,38,38,0.5)] transition-transform active:scale-95">
            👉 START KILLING
          </button>
        )}

        <div className="mt-4 bg-gray-800 p-6 rounded-xl w-full max-w-sm border border-gray-700 space-y-4 shadow-xl">
            <div className="grid grid-cols-2 gap-2 text-sm pb-2">
                <span>Sound:</span> <span className="font-bold text-yellow-300">{debugInfo.label.toUpperCase()}</span>
                <span>Score:</span> <span className="font-mono">{Math.round(debugInfo.score * 100)}%</span>
                <span>Status:</span> <span className={getMouthColor(debugInfo.mouth)}>{debugInfo.mouth}</span>
            </div>
            <div className="border-t border-gray-600"></div>
            
            <div className="space-y-1">
                <div className="flex justify-between text-xs font-bold text-blue-300"><span>AI Confidence</span><span>{settings.confidence}%</span></div>
                <input type="range" min="1" max="99" value={settings.confidence} onChange={(e) => handleSettingChange('confidence', parseInt(e.target.value))} className="w-full h-1 bg-gray-600 rounded-lg appearance-none cursor-pointer accent-blue-500"/>
            </div>
            <div className="space-y-1">
                <div className="flex justify-between text-xs font-bold text-green-300"><span>Mouth Open</span><span>{(settings.mouthOpen / 10).toFixed(1)}%</span></div>
                <input type="range" min="1" max="50" value={settings.mouthOpen} onChange={(e) => handleSettingChange('mouthOpen', parseInt(e.target.value))} className="w-full h-1 bg-gray-600 rounded-lg appearance-none cursor-pointer accent-green-500"/>
            </div>
            <div className="space-y-1">
                <div className="flex justify-between text-xs font-bold text-purple-300"><span>Lip Movement</span><span>Lv {settings.lipMovement}</span></div>
                <input type="range" min="1" max="100" value={settings.lipMovement} onChange={(e) => handleSettingChange('lipMovement', parseInt(e.target.value))} className="w-full h-1 bg-gray-600 rounded-lg appearance-none cursor-pointer accent-purple-500"/>
            </div>
            <div className="space-y-1">
                <div className="flex justify-between text-xs font-bold text-red-300"><span>Strictness</span><span>{settings.strictness} frames</span></div>
                <input type="range" min="1" max="10" value={settings.strictness} onChange={(e) => handleSettingChange('strictness', parseInt(e.target.value))} className="w-full h-1 bg-gray-600 rounded-lg appearance-none cursor-pointer accent-red-500"/>
            </div>

            <div className="flex gap-2 pt-2">
                <button 
                    onClick={() => setShowVisualizer(!showVisualizer)}
                    className={`flex-1 py-2 rounded-lg text-xs font-bold transition-colors border ${showVisualizer ? 'bg-blue-900/50 border-blue-500 text-blue-200' : 'bg-gray-700 border-gray-600 text-gray-400'}`}
                >
                    👁️ Visualizer
                </button>
                <button 
                    onClick={() => setShowLogs(!showLogs)}
                    className={`flex-1 py-2 rounded-lg text-xs font-bold transition-colors border ${showLogs ? 'bg-blue-900/50 border-blue-500 text-blue-200' : 'bg-gray-700 border-gray-600 text-gray-400'}`}
                >
                    📊 Monitor
                </button>
            </div>
        </div>
      </div>

      {/* 3. 우측 로그 패널 */}
      {showLogs && (
          <div className="w-full md:w-80 bg-gray-800 p-4 rounded-xl border border-gray-700 flex flex-col h-64 md:h-[calc(100vh-2rem)] shadow-xl animate-fade-in-right z-40 order-3 shrink-0">
              <div className="flex justify-between items-center mb-2 border-b border-gray-600 pb-2">
                  <h2 className="text-lg font-bold text-gray-300">
                      {logTab === 'LIVE' ? '📊 Live Monitor' : '🚨 Violations'}
                  </h2>
                  <button onClick={() => setShowLogs(false)} className="text-gray-400 hover:text-white">✕</button>
              </div>

              <div className="flex gap-2 mb-2">
                  <button onClick={() => setLogTab('LIVE')} className={`flex-1 py-1 text-xs font-bold rounded ${logTab === 'LIVE' ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-400'}`}>Live ({logs.length})</button>
                  <button onClick={() => setLogTab('HISTORY')} className={`flex-1 py-1 text-xs font-bold rounded ${logTab === 'HISTORY' ? 'bg-red-600 text-white' : 'bg-gray-700 text-gray-400'}`}>Violations ({violationLogs.length})</button>
              </div>
              
              <div className="flex-1 flex flex-col gap-1 overflow-y-auto custom-scrollbar">
                  {(logTab === 'LIVE' ? logs : violationLogs).map((log, idx) => (
                      <div key={logTab === 'LIVE' ? log.id : idx} className={`min-h-[36px] px-3 py-1 rounded-lg text-xs border flex items-center justify-between gap-2 transition-all ${log.isSuspect ? 'bg-red-900/30 border-red-500/50' : 'bg-gray-700/50 border-gray-600'}`}>
                          <div className="font-mono text-gray-400 text-[10px] w-12">{log.time}</div>
                          <div className="flex gap-2 text-lg items-center">
                              <span title={log.mouth}>{getVisualIcon(log.mouth)}</span>
                              <span title={log.label}>{getAudioIcon(log.label)}</span>
                          </div>
                          <div className="text-right w-16">
                              <div className="font-bold text-[10px] text-gray-300">{log.score}%</div>
                              <span className={`font-bold px-1.5 py-0.5 rounded text-[9px] ${log.isSuspect ? 'bg-red-600 text-white' : 'bg-green-600 text-white'}`}>
                                  {log.isSuspect ? 'KILL' : 'SAFE'}
                              </span>
                          </div>
                      </div>
                  ))}
                  {(logTab === 'LIVE' ? logs : violationLogs).length === 0 && (
                      <div className="text-gray-500 text-center mt-10">
                          {logTab === 'LIVE' ? 'Waiting for data...' : 'No violations yet! 😇'}
                      </div>
                  )}
              </div>
              {logTab === 'LIVE' && (
                  <div className="mt-2 pt-2 border-t border-gray-600 text-xs text-gray-400">
                      <p>Queue: <span className="text-white font-bold">{logs.filter(l => l.isSuspect).length}</span> / 10</p>
                  </div>
              )}
          </div>
      )}
      
      <video ref={videoRef} className="hidden" autoPlay playsInline muted></video>
    </div>
  );
}

export default App;
