import { useState, useEffect, useRef } from 'react';

const CONFIG = {
  INFERENCE_INTERVAL: 250, 
};

function App() {
  const [status, setStatus] = useState('Ready to Start! 🚀');
  const [trafficLight, setTrafficLight] = useState('OFF');
  const [debugInfo, setDebugInfo] = useState({ label: '-', score: 0, mouth: 'Closed' });
  
  // UI용 State
  const [settings, setSettings] = useState({
      confidence: 50,      
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

  // 기능 상태
  const [isDarkMode, setIsDarkMode] = useState(true); 
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isSoundOn, setIsSoundOn] = useState(true); 

  // 리포트 관련 State 👇 [신규]
  const [showReport, setShowReport] = useState(false);
  const [reportData, setReportData] = useState(null);
  const [startTime, setStartTime] = useState(null);

  // 소리 상태 Ref
  const isSoundOnRef = useRef(true);
  useEffect(() => { isSoundOnRef.current = isSoundOn; }, [isSoundOn]);

  // Logic용 Ref
  const settingsRef = useRef({
      confidence: 0.50,
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
  const animationFrameId = useRef(null);
  const intervalId = useRef(null);

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

  const playWarningSound = () => {
    if (!isSoundOnRef.current) return; 
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = 'sawtooth'; 
    osc.frequency.setValueAtTime(880, ctx.currentTime); 
    osc.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 0.1); 
    gain.gain.setValueAtTime(0.1, ctx.currentTime); 
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
    osc.start();
    osc.stop(ctx.currentTime + 0.3);
  };

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen();
      setIsFullscreen(true);
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen();
        setIsFullscreen(false);
      }
    }
  };

  // 캔버스 그리기 (Ref로 제어)
  useEffect(() => {
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
          animationFrameId.current = requestAnimationFrame(draw);
      };
      
      if (showVisualizer) draw();
      return () => cancelAnimationFrame(animationFrameId.current);
  }, [showVisualizer]); 

  // 설정 핸들러
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

  // 👇 [신규] 시스템 종료 및 리포트 생성
  const stopSystem = () => {
      isRunning.current = false;
      setStatus('Stopped 🛑');
      setTrafficLight('OFF');
      if (videoRef.current && videoRef.current.srcObject) {
          videoRef.current.srcObject.getTracks().forEach(track => track.stop());
      }
      clearInterval(intervalId.current);

      // 통계 계산
      const endTime = Date.now();
      const duration = endTime - startTime;
      
      // 1. 총 적발 횟수
      const totalKills = violationLogs.length;

      // 2. 평균 회복 시간 (적발 지속 시간의 평균)
      // count 1 = 250ms. count 4 = 1000ms.
      const totalStack = violationLogs.reduce((acc, log) => acc + log.count, 0);
      const avgRecoveryMs = totalKills > 0 ? (totalStack * 250) / totalKills : 0;

      // 3. 최장 생존 시간 (위반과 위반 사이의 최대 시간)
      let maxStreakMs = 0;
      if (totalKills === 0) {
          maxStreakMs = duration;
      } else {
          // 시작 ~ 첫 위반
          let prevTime = startTime;
          const sortedLogs = [...violationLogs].sort((a, b) => a.id - b.id);
          
          sortedLogs.forEach(log => {
              const diff = log.id - prevTime;
              if (diff > maxStreakMs) maxStreakMs = diff;
              // 위반이 끝난 시간 (id는 감지 시작 시간이지만 간략화를 위해 id를 기준으로 함)
              prevTime = log.id + (log.count * 250); 
          });
          // 마지막 위반 ~ 종료
          if (endTime - prevTime > maxStreakMs) maxStreakMs = endTime - prevTime;
      }

      setReportData({
          duration,
          totalKills,
          avgRecovery: (avgRecoveryMs / 1000).toFixed(1),
          longestStreak: (maxStreakMs / 1000).toFixed(1),
          logs: violationLogs,
          startTime,
          endTime
      });
      setShowReport(true);
  };

  // 👇 [수정] Start/Stop 토글
  const toggleSystem = async () => {
      if (isRunning.current) {
          stopSystem();
      } else {
          // Start
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
            setStartTime(Date.now());
            setLogs([]);
            setViolationLogs([]);
            setStatus('Monitoring Active 🟢');

            intervalId.current = setInterval(async () => {
                if (!isRunning.current) return;
                
                const { confidence, mouthOpen, lipMovement, strictness } = settingsRef.current;
                
                // Vision Logic
                let visualState = 'No Face 🚫';
                let isSpeakingVisual = false;
                if (landmarkerRef.current && videoRef.current.currentTime > 0) {
                    const result = landmarkerRef.current.detectForVideo(videoRef.current, performance.now());
                    if (result.faceLandmarks.length > 0) {
                        const landmarks = result.faceLandmarks[0];
                        const upper = landmarks[13];
                        const lower = landmarks[14];
                        
                        visualizerDataRef.current = { hasFace: true, upperLip: upper, lowerLip: lower, gap: 0, movement: 0 };
                        
                        const gap = lower.y - upper.y;
                        visualizerDataRef.current.gap = gap;
                        
                        lipDistanceHistory.current.push(gap);
                        if (lipDistanceHistory.current.length > 5) lipDistanceHistory.current.shift();
                        const movement = calculateStandardDeviation(lipDistanceHistory.current);
                        visualizerDataRef.current.movement = movement;

                        if (gap > mouthOpen) {
                            if (movement > lipMovement) { visualState = 'Speaking 🗣️'; isSpeakingVisual = true; }
                            else { visualState = 'Mouth Open 😮'; }
                        } else { visualState = 'Closed 😐'; }
                    } else { visualizerDataRef.current.hasFace = false; }
                }

                // Audio Logic
                let audioLabel = 'noise';
                let audioConfidence = 0;
                if (classifierRef.current && audioBuffer.length >= modelSettings.current.inputSize) {
                    const inputData = audioBuffer.slice(audioBuffer.length - modelSettings.current.inputSize);
                    try {
                        const res = classifierRef.current.classify(inputData);
                        if (res.results && res.results.length > 0) {
                            const top = res.results.reduce((p, c) => (p.value > c.value) ? p : c);
                            audioLabel = top.label;
                            audioConfidence = top.value;
                        }
                    } catch(e) {}
                }

                // Decision
                let isKoreanSuspected = 0;
                if (isSpeakingVisual && audioLabel.toLowerCase() === 'korean' && audioConfidence > confidence) {
                    isKoreanSuspected = 1;
                }

                if (isKoreanSuspected === 1) playWarningSound();

                historyQueue.current.push(isKoreanSuspected);
                if (historyQueue.current.length > 10) historyQueue.current.shift();

                const now = new Date();
                const timeString = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`;
                
                const logEntry = {
                    id: Date.now(),
                    lastDetected: Date.now(),
                    time: timeString,
                    label: audioLabel.toLowerCase(),
                    score: Math.round(audioConfidence * 100),
                    mouth: visualState, 
                    isSuspect: isKoreanSuspected === 1,
                    count: 1
                };

                setLogs(prev => [logEntry, ...prev].slice(0, 10));

                if (isKoreanSuspected === 1) {
                    setViolationLogs(prev => {
                        if (prev.length === 0) return [logEntry];
                        const lastLog = prev[0];
                        if (logEntry.id - lastLog.lastDetected < 3000) {
                            const updated = {
                                ...lastLog,
                                count: lastLog.count + 1,
                                lastDetected: logEntry.id,
                                score: Math.max(lastLog.score, logEntry.score)
                            };
                            return [updated, ...prev.slice(1)];
                        } else {
                            return [logEntry, ...prev];
                        }
                    });
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
      }
  };

  const theme = {
      bg: isDarkMode ? 'bg-gray-900' : 'bg-gray-100',
      text: isDarkMode ? 'text-white' : 'text-gray-900',
      panelBg: isDarkMode ? 'bg-gray-800' : 'bg-white',
      panelBorder: isDarkMode ? 'border-gray-700' : 'border-gray-300',
      subText: isDarkMode ? 'text-gray-300' : 'text-gray-600',
      title: isDarkMode ? 'text-red-500' : 'text-red-600',
  };

  // 👇 [신규] 위반 그래프 컴포넌트
  const ViolationGraph = ({ vLogs, start, end, height = "h-16" }) => {
      const duration = end - start;
      if (duration <= 0) return null;

      return (
          <div className={`relative w-full ${height} bg-gray-900/50 rounded-lg overflow-hidden border border-gray-600 mt-2`}>
              {/* 타임라인 가이드라인 */}
              <div className="absolute top-1/2 w-full h-px bg-gray-700"></div>
              
              {vLogs.map((log) => {
                  // 시작 시간으로부터의 위치 (%)
                  const left = ((log.id - start) / duration) * 100;
                  // 스택에 따른 높이 (최소 20%, 최대 100%)
                  const barHeight = Math.min(100, 20 + (log.count * 5)); 
                  // 스택에 따른 색상 강도 (투명도)
                  const opacity = Math.min(1, 0.5 + (log.count * 0.1));

                  return (
                      <div 
                          key={log.id}
                          className="absolute bottom-0 w-1 bg-red-500 hover:bg-red-400 hover:scale-150 transition-all cursor-pointer group"
                          style={{ 
                              left: `${left}%`, 
                              height: `${barHeight}%`,
                              opacity: opacity 
                          }}
                          title={`Time: ${log.time} | Score: ${log.score}% | Stack: x${log.count}`}
                      >
                          {/* 툴팁 (CSS Only) */}
                          <div className="hidden group-hover:block absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-2 py-1 bg-black text-white text-[10px] rounded whitespace-nowrap z-50">
                              {log.time} (x{log.count})
                          </div>
                      </div>
                  );
              })}
          </div>
      );
  };

  // 포맷팅 함수
  const formatDuration = (ms) => {
      const sec = Math.floor(ms / 1000);
      const min = Math.floor(sec / 60);
      const h = Math.floor(min / 60);
      return `${h}h ${min % 60}m ${sec % 60}s`;
  };

  return (
    <div className={`min-h-screen w-screen ${theme.bg} ${theme.text} flex flex-col md:flex-row p-4 gap-4 relative overflow-hidden justify-center items-center transition-colors duration-300`}>
      
      {/* 컨트롤러 */}
      <div className="absolute top-4 right-4 flex gap-2 z-50">
          <button onClick={() => setIsSoundOn(!isSoundOn)} className={`p-2 rounded-lg border ${isSoundOn ? 'bg-green-600/20 border-green-500 text-green-500' : 'bg-gray-500/20 border-gray-500 text-gray-500'}`}>
              {isSoundOn ? '🔊' : '🔇'}
          </button>
          <button onClick={() => setIsDarkMode(!isDarkMode)} className={`p-2 rounded-lg border ${theme.panelBg} ${theme.panelBorder}`}>
              {isDarkMode ? '🌙' : '☀️'}
          </button>
          <button onClick={toggleFullscreen} className={`p-2 rounded-lg border ${theme.panelBg} ${theme.panelBorder}`}>
              {isFullscreen ? '⛶' : '⛶'}
          </button>
      </div>

      {/* 1. Visualizer */}
      {showVisualizer && (
          <div className={`w-full md:w-64 ${theme.panelBg} p-4 rounded-xl border ${theme.panelBorder} flex flex-col gap-4 shadow-xl animate-fade-in-left z-40 order-2 md:order-1 shrink-0 h-fit`}>
              <div className={`flex justify-between items-center border-b ${theme.panelBorder} pb-2`}>
                  <h2 className={`text-lg font-bold ${theme.subText}`}>👁️ Visualizer</h2>
                  <button onClick={() => setShowVisualizer(false)} className="text-gray-400 hover:text-red-500">✕</button>
              </div>
              <div className={`relative w-full aspect-[4/3] bg-black rounded-lg overflow-hidden border ${theme.panelBorder}`}>
                   <canvas ref={canvasRef} width={320} height={240} className="w-full h-full object-cover" />
                   {!isRunning.current && <div className="absolute inset-0 flex items-center justify-center text-gray-500 text-xs">Camera Off</div>}
              </div>
              <div className="space-y-3">
                  <div>
                      <div className="flex justify-between text-xs mb-1"><span className="text-gray-400">Mouth Gap</span><span className="font-mono text-green-500">{(visualizerDataRef.current.gap * 100).toFixed(1)}%</span></div>
                      <div className="h-2 bg-gray-200 rounded-full overflow-hidden relative dark:bg-gray-700"><div className="absolute top-0 bottom-0 w-0.5 bg-red-500 z-10" style={{ left: `${(settingsRef.current.mouthOpen / 0.05) * 100}%` }}></div><div className={`h-full transition-all duration-100 ${visualizerDataRef.current.gap > settingsRef.current.mouthOpen ? 'bg-green-500' : 'bg-gray-400'}`} style={{ width: `${Math.min(100, (visualizerDataRef.current.gap / 0.05) * 100)}%` }}></div></div>
                  </div>
                  <div>
                      <div className="flex justify-between text-xs mb-1"><span className="text-gray-400">Lip Movement</span><span className="font-mono text-purple-500">{(visualizerDataRef.current.movement * 1000).toFixed(1)}</span></div>
                      <div className="h-2 bg-gray-200 rounded-full overflow-hidden relative dark:bg-gray-700"><div className="absolute top-0 bottom-0 w-0.5 bg-red-500 z-10" style={{ left: `${(settingsRef.current.lipMovement / 0.01) * 100}%` }}></div><div className={`h-full transition-all duration-100 ${visualizerDataRef.current.movement > settingsRef.current.lipMovement ? 'bg-purple-500' : 'bg-gray-400'}`} style={{ width: `${Math.min(100, (visualizerDataRef.current.movement / 0.01) * 100)}%` }}></div></div>
                  </div>
              </div>
          </div>
      )}

      {/* 2. Main Panel */}
      <div className="flex flex-col items-center justify-center transition-all duration-300 order-1 md:order-2 w-full max-w-2xl">
        <h1 className={`text-4xl font-black mb-6 ${theme.title} tracking-tighter uppercase drop-shadow-[0_0_10px_rgba(239,68,68,0.5)] text-center`}>Korean Killer 🇰🇷🚫</h1>
        <div className={`w-56 h-56 md:w-64 md:h-64 rounded-full border-8 ${theme.panelBorder} flex items-center justify-center mb-8 transition-all duration-300 ${trafficLight === 'RED' ? 'bg-red-600 shadow-[0_0_80px_red] animate-pulse' : trafficLight === 'YELLOW' ? 'bg-yellow-500 shadow-[0_0_40px_yellow]' : trafficLight === 'GREEN' ? 'bg-green-600 shadow-[0_0_40px_green]' : 'bg-gray-800'}`}>
          <span className="text-6xl font-bold text-white">{trafficLight}</span>
        </div>
        <p className={`text-xl mb-6 ${theme.subText} font-mono animate-pulse text-center`}>{status}</p>
        
        {/* 👇 [수정] Start / Stop 토글 버튼 */}
        <button onClick={toggleSystem} className={`px-10 py-4 rounded-full font-bold text-xl text-white shadow-[0_0_20px_rgba(220,38,38,0.5)] transition-transform active:scale-95 ${isRunning.current ? 'bg-gray-700 hover:bg-gray-600' : 'bg-red-600 hover:bg-red-500'}`}>
            {isRunning.current ? '🛑 STOP & REPORT' : '👉 START KILLING'}
        </button>

        <div className={`mt-4 ${theme.panelBg} p-6 rounded-xl w-full max-w-sm border ${theme.panelBorder} space-y-4 shadow-xl`}>
            {/* 설정 패널 (생략 없이) */}
            <div className="grid grid-cols-2 gap-2 text-sm pb-2"><span>Sound:</span><span className="font-bold text-yellow-500">{debugInfo.label.toUpperCase()}</span><span>Score:</span><span className="font-mono">{Math.round(debugInfo.score * 100)}%</span><span>Status:</span><span className={debugInfo.mouth.includes('Speaking') ? 'text-red-400 font-bold' : 'text-green-400'}>{debugInfo.mouth}</span></div>
            <div className={`border-t ${theme.panelBorder}`}></div>
            <div className="space-y-1"><div className="flex justify-between text-xs font-bold text-blue-400"><span>AI Confidence</span><span>{settings.confidence}%</span></div><input type="range" min="1" max="99" value={settings.confidence} onChange={(e) => handleSettingChange('confidence', parseInt(e.target.value))} className="w-full h-1 bg-gray-600 rounded-lg appearance-none cursor-pointer accent-blue-500"/></div>
            <div className="space-y-1"><div className="flex justify-between text-xs font-bold text-green-400"><span>Mouth Open</span><span>{(settings.mouthOpen / 10).toFixed(1)}%</span></div><input type="range" min="1" max="50" value={settings.mouthOpen} onChange={(e) => handleSettingChange('mouthOpen', parseInt(e.target.value))} className="w-full h-1 bg-gray-600 rounded-lg appearance-none cursor-pointer accent-green-500"/></div>
            <div className="space-y-1"><div className="flex justify-between text-xs font-bold text-purple-400"><span>Lip Movement</span><span>Lv {settings.lipMovement}</span></div><input type="range" min="1" max="100" value={settings.lipMovement} onChange={(e) => handleSettingChange('lipMovement', parseInt(e.target.value))} className="w-full h-1 bg-gray-600 rounded-lg appearance-none cursor-pointer accent-purple-500"/></div>
            <div className="space-y-1"><div className="flex justify-between text-xs font-bold text-red-400"><span>Strictness</span><span>{settings.strictness} frames</span></div><input type="range" min="1" max="10" value={settings.strictness} onChange={(e) => handleSettingChange('strictness', parseInt(e.target.value))} className="w-full h-1 bg-gray-600 rounded-lg appearance-none cursor-pointer accent-red-500"/></div>
            <div className="flex gap-2 pt-2"><button onClick={() => setShowVisualizer(!showVisualizer)} className="flex-1 py-2 rounded-lg text-xs font-bold border bg-gray-500/10 text-gray-500">👁️ Visualizer</button><button onClick={() => setShowLogs(!showLogs)} className="flex-1 py-2 rounded-lg text-xs font-bold border bg-gray-500/10 text-gray-500">📊 Monitor</button></div>
        </div>
      </div>

      {/* 3. Logs Panel */}
      {showLogs && (
          <div className={`w-full md:w-80 ${theme.panelBg} p-4 rounded-xl border ${theme.panelBorder} flex flex-col h-64 md:h-[calc(100vh-2rem)] shadow-xl animate-fade-in-right z-40 order-3 shrink-0`}>
              <div className={`flex justify-between items-center mb-2 border-b ${theme.panelBorder} pb-2`}>
                  <h2 className={`text-lg font-bold ${theme.subText}`}>{logTab === 'LIVE' ? '📊 Live Monitor' : '🚨 Violations'}</h2>
                  <button onClick={() => setShowLogs(false)} className="text-gray-400 hover:text-red-500">✕</button>
              </div>

              {/* 👇 [신규] Violations 탭에 그래프 추가 */}
              {logTab === 'HISTORY' && (
                  <ViolationGraph vLogs={violationLogs} start={startTime} end={Date.now()} height="h-20" />
              )}

              <div className="flex gap-2 my-2">
                  <button onClick={() => setLogTab('LIVE')} className={`flex-1 py-1 text-xs font-bold rounded ${logTab === 'LIVE' ? 'bg-blue-600 text-white' : 'bg-gray-500/20 text-gray-500'}`}>Live ({logs.length})</button>
                  <button onClick={() => setLogTab('HISTORY')} className={`flex-1 py-1 text-xs font-bold rounded ${logTab === 'HISTORY' ? 'bg-red-600 text-white' : 'bg-gray-500/20 text-gray-500'}`}>Violations ({violationLogs.length})</button>
              </div>
              
              <div className="flex-1 flex flex-col gap-1 overflow-y-auto custom-scrollbar">
                  {(logTab === 'LIVE' ? logs : violationLogs).map((log, idx) => (
                      <div key={logTab === 'LIVE' ? log.id : idx} className={`min-h-[36px] px-3 py-1 rounded-lg text-xs border flex items-center justify-between gap-2 transition-all ${log.isSuspect ? 'bg-red-900/30 border-red-500/50' : `${theme.panelBg} ${theme.panelBorder}`}`}>
                          <div className="font-mono text-gray-400 text-[10px] w-12">{log.time}</div>
                          <div className="flex gap-2 text-lg items-center">
                              <span title={log.mouth}>{log.mouth.includes('Speaking') ? '🗣️' : log.mouth.includes('Open') ? '😮' : log.mouth.includes('Closed') ? '😐' : '🚫'}</span>
                              <span title={log.label}>{log.label === 'korean' ? <span className="bg-red-600 text-[10px] px-1 rounded font-bold">KR</span> : log.label === 'english' ? <span className="bg-blue-600 text-[10px] px-1 rounded font-bold">EN</span> : '🔇'}</span>
                              {log.count > 1 && <span className="bg-orange-500 text-white text-[9px] px-1 rounded-full font-bold ml-1">x{log.count}</span>}
                          </div>
                          <div className="text-right w-16">
                              <div className={`font-bold text-[10px] ${theme.subText}`}>{log.score}%</div>
                              <span className={`font-bold px-1.5 py-0.5 rounded text-[9px] ${log.isSuspect ? 'bg-red-600 text-white' : 'bg-green-600 text-white'}`}>{log.isSuspect ? 'KILL' : 'SAFE'}</span>
                          </div>
                      </div>
                  ))}
                  {(logTab === 'LIVE' ? logs : violationLogs).length === 0 && <div className="text-gray-500 text-center mt-10">{logTab === 'LIVE' ? 'Waiting for data...' : 'No violations yet! 😇'}</div>}
              </div>
          </div>
      )}

      {/* 👇 [신규] 수업 종료 리포트 모달 */}
      {showReport && reportData && (
          <div className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
              <div className="bg-gray-800 border border-gray-600 rounded-2xl p-8 max-w-2xl w-full shadow-2xl relative">
                  <button onClick={() => setShowReport(false)} className="absolute top-4 right-4 text-gray-400 hover:text-white text-xl">✕</button>
                  
                  <h2 className="text-3xl font-black text-center mb-2 text-white">MISSION DEBRIEF 📂</h2>
                  <div className="text-center text-gray-400 font-mono mb-8">{formatDuration(reportData.duration)} monitored</div>

                  {/* 메인 통계 그리드 */}
                  <div className="grid grid-cols-3 gap-4 mb-8">
                      <div className="bg-gray-700/50 p-4 rounded-xl text-center border border-gray-600">
                          <div className="text-gray-400 text-xs uppercase font-bold mb-1">Total Kills</div>
                          <div className="text-4xl font-black text-red-500">{reportData.totalKills}</div>
                          <div className="text-xs text-gray-500 mt-1">Violations</div>
                      </div>
                      <div className="bg-gray-700/50 p-4 rounded-xl text-center border border-gray-600">
                          <div className="text-gray-400 text-xs uppercase font-bold mb-1">Avg Recovery</div>
                          <div className="text-4xl font-black text-orange-400">{reportData.avgRecovery}<span className="text-lg text-gray-500">s</span></div>
                          <div className="text-xs text-gray-500 mt-1">Duration</div>
                      </div>
                      <div className="bg-gray-700/50 p-4 rounded-xl text-center border border-gray-600">
                          <div className="text-gray-400 text-xs uppercase font-bold mb-1">Longest Streak</div>
                          <div className="text-4xl font-black text-green-400">{reportData.longestStreak}<span className="text-lg text-gray-500">s</span></div>
                          <div className="text-xs text-gray-500 mt-1">Survival</div>
                      </div>
                  </div>

                  {/* 타임라인 그래프 */}
                  <div className="mb-8">
                      <h3 className="text-gray-300 font-bold mb-2 flex justify-between">
                          <span>Timeline Analysis</span>
                          <span className="text-xs text-gray-500 font-normal">Density represents frequency</span>
                      </h3>
                      <ViolationGraph vLogs={reportData.logs} start={reportData.startTime} end={reportData.endTime} height="h-24" />
                  </div>

                  <div className="flex justify-center">
                      <button onClick={() => setShowReport(false)} className="px-8 py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-full font-bold shadow-lg transition-transform active:scale-95">
                          Confirm & Close
                      </button>
                  </div>
              </div>
          </div>
      )}
      
      <video ref={videoRef} className="hidden" autoPlay playsInline muted></video>
    </div>
  );
}

export default App;
