import { useState, useEffect, useRef } from 'react';
import { listenToSession, resetSession } from './firebase';

// ----------------------------------------------------------------------
// 1. [하위 컴포넌트] 실시간 그래프 (SVG)
// ----------------------------------------------------------------------
const SessionGraph = ({ data, totalStudents, isFullView = false }) => {
    if (!data || data.length < 2) {
        return (
            <div className="h-full w-full bg-gray-800/50 rounded-xl border border-gray-700 flex items-center justify-center text-gray-500 font-mono">
                {isFullView ? 'No data recorded.' : 'Waiting for session start... (Press START)'}
            </div>
        );
    }

    const height = 100;
    const width = 1000;
    const maxVal = Math.max(totalStudents, 5);

    const points = data.map((val, idx) => {
        const x = (idx / (data.length - 1)) * width;
        const y = height - (val / maxVal) * height;
        return `${x},${y}`;
    }).join(' ');

    const fillPath = `M 0,${height} ${points} L ${width},${height} Z`;

    return (
        <div className={`w-full bg-gray-800/50 rounded-xl border border-gray-700 p-4 relative overflow-hidden ${isFullView ? 'h-64' : 'h-full'}`}>
            {!isFullView && (
                <h3 className="text-xs font-bold text-gray-400 mb-2 uppercase tracking-wider flex justify-between">
                    <span>Timeline: Concurrent Violations</span>
                    <span className="text-red-400 animate-pulse">Live Feed 🔴</span>
                </h3>
            )}
            <div className="relative w-full h-full pb-4">
                {/* 그리드 라인 */}
                <div className="absolute inset-0 flex flex-col justify-between opacity-20 pointer-events-none pb-6">
                    <div className="border-t border-gray-400 w-full h-0"></div>
                    <div className="border-t border-gray-400 w-full h-0"></div>
                    <div className="border-t border-gray-400 w-full h-0"></div>
                    <div className="border-t border-gray-400 w-full h-0"></div>
                </div>
                <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-full overflow-visible" preserveAspectRatio="none">
                    <defs>
                        <linearGradient id="grad1" x1="0%" y1="0%" x2="0%" y2="100%">
                            <stop offset="0%" style={{ stopColor: 'rgb(239, 68, 68)', stopOpacity: 0.6 }} />
                            <stop offset="100%" style={{ stopColor: 'rgb(239, 68, 68)', stopOpacity: 0 }} />
                        </linearGradient>
                    </defs>
                    <path d={fillPath} fill="url(#grad1)" />
                    <polyline fill="none" stroke="#ef4444" strokeWidth="2" points={points} vectorEffect="non-scaling-stroke" />
                </svg>
            </div>
        </div>
    );
};

// ----------------------------------------------------------------------
// 2. [하위 컴포넌트] 리포트 모달 (수업 종료 시 표시)
// ----------------------------------------------------------------------
const SessionReportModal = ({ duration, peak, graphData, violators, totalStudents, onClose }) => {
    const formatTime = (totalSeconds) => {
        const m = Math.floor(totalSeconds / 60).toString().padStart(2, '0');
        const s = (totalSeconds % 60).toString().padStart(2, '0');
        return `${m}m ${s}s`;
    };

    return (
        <div className="fixed inset-0 z-[100] bg-black/90 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
            <div className="bg-gray-900 border border-gray-700 rounded-2xl p-8 max-w-4xl w-full shadow-2xl relative flex flex-col max-h-[90vh] overflow-y-auto">
                <button onClick={onClose} className="absolute top-4 right-4 text-gray-400 hover:text-white text-xl">✕</button>
                
                <h2 className="text-3xl font-black text-center mb-1 text-white italic tracking-tighter">SESSION REPORT 📂</h2>
                <p className="text-center text-gray-500 font-mono text-sm mb-8">{new Date().toLocaleString()}</p>

                <div className="grid grid-cols-2 gap-4 mb-8">
                    <div className="bg-gray-800 p-4 rounded-xl text-center border border-gray-700">
                        <div className="text-gray-400 text-xs uppercase font-bold mb-1">Total Duration</div>
                        <div className="text-4xl font-black text-white">{formatTime(duration)}</div>
                    </div>
                    <div className="bg-gray-800 p-4 rounded-xl text-center border border-gray-700">
                        <div className="text-gray-400 text-xs uppercase font-bold mb-1">Peak Violations</div>
                        <div className="text-4xl font-black text-red-500">{peak} <span className="text-lg text-gray-500">/ {totalStudents}</span></div>
                    </div>
                </div>

                <div className="mb-8">
                    <h3 className="text-gray-300 font-bold mb-3 flex justify-between border-b border-gray-700 pb-2">
                        <span>🌊 Full Timeline Analysis</span>
                    </h3>
                    <SessionGraph data={graphData} totalStudents={totalStudents} isFullView={true} />
                </div>

                <div className="mb-8">
                    <h3 className="text-gray-300 font-bold mb-3 border-b border-gray-700 pb-2">
                        🚨 Top Violators (Most Frequent)
                    </h3>
                    <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
                        {violators.length === 0 ? (
                            <div className="p-6 text-center text-gray-500">No violations recorded during this session! 🎉</div>
                        ) : (
                            <table className="w-full text-left border-collapse">
                                <thead>
                                    <tr className="bg-gray-700/50 text-gray-400 text-xs uppercase">
                                        <th className="p-3">Rank</th>
                                        <th className="p-3">Name</th>
                                        <th className="p-3">ID</th>
                                        <th className="p-3 text-right">Violation Time (approx.)</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {violators.slice(0, 5).map((v, idx) => (
                                        <tr key={v.key} className="border-b border-gray-700 last:border-0 hover:bg-white/5">
                                            <td className="p-3 font-bold text-gray-500">#{idx + 1}</td>
                                            <td className="p-3 font-bold text-red-400">{v.name}</td>
                                            <td className="p-3 text-gray-400 font-mono text-sm">{v.studentId}</td>
                                            <td className="p-3 text-right font-mono text-white">{v.count}s</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                    </div>
                </div>

                <div className="flex justify-center mt-auto">
                    <button onClick={onClose} className="px-8 py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-full font-bold shadow-lg transition-transform active:scale-95">
                        Confirm & Close
                    </button>
                </div>
            </div>
        </div>
    );
};

// ----------------------------------------------------------------------
// 3. [하위 컴포넌트] 개별 학생 카드
// ----------------------------------------------------------------------
const StudentCard = ({ data }) => {
    const [history, setHistory] = useState([]);
    const prevStackRef = useRef(0); 

    useEffect(() => {
        const currentStack = data.stack || 0;
        const prevStack = prevStackRef.current;

        // 위반 기록 로직 (1스택 이상이면 기록)
        if (prevStack > 0 && currentStack === 0) {
            if (prevStack >= 1) {
                setHistory(prev => [...prev, prevStack].slice(-7)); 
            }
        }
        // 리셋 신호 감지
        if (data.stack === 0 && data.score === 0 && data.label === 'clean') {
             if (history.length > 0) setHistory([]);
        }
        prevStackRef.current = currentStack;
    }, [data.stack, data.score, data.label]);

    const stack = data.stack || 0;
    const label = data.label || '-';
    const mouth = data.mouth || 'Closed';
    const score = data.score || 0;
    const status = data.status || 'GREEN'; 

    let borderColor = 'border-gray-700';
    let bgColor = 'bg-gray-800';
    let statusPing = null;

    if (status === 'RED') { 
        borderColor = 'border-red-500';
        bgColor = 'bg-red-900/20';
        statusPing = 'bg-red-500';
    } else if (status === 'YELLOW') { 
        borderColor = 'border-yellow-500';
        bgColor = 'bg-yellow-900/10';
        statusPing = 'bg-yellow-500';
    } else { 
        borderColor = 'border-green-800 hover:border-green-500';
        bgColor = 'bg-gray-800';
        statusPing = 'bg-green-500';
    }

    const getGaugeColor = (m, l) => {
        if (m === 'Closed' || l === 'noise' || l === 'background') return 'bg-gray-600';
        if (l === 'english') return 'bg-blue-500';
        if (l === 'korean') return 'bg-red-500';
        return 'bg-gray-600';
    };

    return (
        <div className={`relative p-5 rounded-xl border-2 transition-all duration-300 flex flex-col justify-between min-h-[220px] ${borderColor} ${bgColor} ${status === 'RED' ? 'shadow-[0_0_20px_rgba(220,38,38,0.4)] scale-105 z-10' : ''}`}>
            <div>
                <div className="absolute top-3 right-3 flex gap-1">
                    {status === 'RED' && <span className="animate-ping absolute inline-flex h-3 w-3 rounded-full bg-red-400 opacity-75"></span>}
                    <span className={`relative inline-flex rounded-full h-3 w-3 ${statusPing}`}></span>
                </div>
                <div className="mb-4">
                    <h3 className="font-bold text-xl text-white truncate tracking-tight">{data.name}</h3>
                    <p className="text-gray-400 text-xs font-mono uppercase tracking-wider">{data.studentId}</p>
                </div>
                <div className="flex flex-wrap gap-2 mb-4 relative z-20">
                    <span className={`text-[10px] px-2 py-1 rounded font-bold uppercase border ${
                        label === 'korean' ? 'bg-red-500/20 border-red-500 text-red-400' : 
                        label === 'english' ? 'bg-blue-500/20 border-blue-500 text-blue-400' : 
                        'bg-gray-700 border-gray-600 text-gray-400'
                    }`}>
                        {label === 'noise' ? '🔊 NOISE' : label === 'background' ? '🔇 BG' : label}
                    </span>
                    <span className={`text-[10px] px-2 py-1 rounded font-bold uppercase border ${
                        mouth === 'Open' ? 'bg-yellow-500/20 border-yellow-500 text-yellow-400' : 
                        'bg-gray-700 border-gray-600 text-gray-400'
                    }`}>
                        {mouth === 'Open' ? '🗣️ OPEN' : '😐 CLOSED'}
                    </span>
                </div>
                <div className="relative z-20 mb-4">
                    <div className="flex justify-between text-xs mb-1 font-mono">
                        <span className="text-gray-500 font-bold">CONFIDENCE</span>
                        <span className={`${status === 'RED' ? 'text-red-400' : 'text-gray-400'}`}>{score}%</span>
                    </div>
                    <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
                        <div className={`h-full transition-all duration-300 ease-out ${getGaugeColor(mouth, label)}`} style={{ width: `${score}%` }}></div>
                    </div>
                </div>
            </div>
            <div className="relative z-20 pt-2 border-t border-gray-700/50">
                <div className="text-[10px] text-gray-500 mb-1 font-mono uppercase">Violations Log</div>
                <div className="flex flex-wrap gap-1">
                    {history.length === 0 ? (
                        <span className="text-xs text-gray-600">- Clean Record -</span>
                    ) : (
                        history.map((hStack, idx) => (
                            <span key={idx} className="flex items-center justify-center w-6 h-6 rounded bg-red-900/50 border border-red-500/30 text-red-400 text-xs font-bold font-mono" title={`Violation Stack: ${hStack}`}>
                                {hStack}
                            </span>
                        ))
                    )}
                </div>
            </div>
            {stack > 0 && (
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none z-50 flex items-center justify-center w-full h-full">
                    <span className={`font-black tracking-tighter drop-shadow-2xl select-none transition-all ${
                        stack >= 3 
                        ? 'text-7xl text-red-500/90 animate-pulse' 
                        : 'text-5xl text-yellow-500/60'
                    }`}>
                        x{stack}
                    </span>
                </div>
            )}
        </div>
    );
};

// ----------------------------------------------------------------------
// 4. [메인] 대시보드 컴포넌트
// ----------------------------------------------------------------------
const Dashboard = ({ onBack }) => {
    const [students, setStudents] = useState([]);
    const [stats, setStats] = useState({ total: 0, dead: 0, warning: 0, alive: 0 });
    
    // 그래프 및 세션 제어용 State
    const [isSessionActive, setIsSessionActive] = useState(false);
    const [sessionTime, setSessionTime] = useState(0); 
    const [graphData, setGraphData] = useState([]);
    
    // 리포트용 데이터
    const [showReport, setShowReport] = useState(false);
    const [sessionViolations, setSessionViolations] = useState({}); // { studentKey: 누적시간 }

    // setInterval 내부 접근용 Ref
    const statsRef = useRef(stats);
    const studentsRef = useRef(students); // 학생 데이터도 Ref로 접근
    
    useEffect(() => { statsRef.current = stats; }, [stats]);
    useEffect(() => { studentsRef.current = students; }, [students]);

    // 실시간 데이터 구독
    useEffect(() => {
        const unsubscribe = listenToSession((data) => {
            setStudents(data);
            let dead = 0, warning = 0, alive = 0;
            data.forEach(s => {
                const st = s.status || 'GREEN';
                if (st === 'RED') dead++;
                else if (st === 'YELLOW') warning++;
                else alive++;
            });
            setStats({ total: data.length, dead, warning, alive });
        });
        return () => unsubscribe(); 
    }, []);

    // ⏱️ 수업 타이머 및 데이터 집계 (1초마다 실행)
    useEffect(() => {
        let interval;
        if (isSessionActive) {
            interval = setInterval(() => {
                const currentStats = statsRef.current;
                const currentStudents = studentsRef.current;
                const currentViolatorsCount = currentStats.dead + currentStats.warning;
                
                // 1. 시간 증가
                setSessionTime(prev => prev + 1);

                // 2. 그래프 데이터 추가 (최근 5분 유지)
                setGraphData(prev => {
                    const newData = [...prev, currentViolatorsCount];
                    if (newData.length > 300) return newData.slice(1);
                    return newData;
                });

                // 3. 누적 위반자 집계 (세션 중에만)
                // 현재 'RED' 상태인 학생들의 카운트를 1씩 올림 (1초 지남 = 1점)
                const newViolations = {};
                currentStudents.forEach(s => {
                    if (s.status === 'RED') {
                        newViolations[s.key] = (newViolations[s.key] || 0) + 1;
                    }
                });

                setSessionViolations(prev => {
                    const updated = { ...prev };
                    Object.entries(newViolations).forEach(([key, count]) => {
                        updated[key] = (updated[key] || 0) + count;
                    });
                    return updated;
                });

            }, 1000);
        }
        return () => clearInterval(interval);
    }, [isSessionActive]);

    const handleReset = () => {
        if (window.confirm("모든 학생의 상태와 기록을 초기화하시겠습니까?")) {
            resetSession(students);
            // 주의: 세션 진행 중 리셋을 눌러도 누적 통계는 유지할지, 날릴지 결정.
            // 여기선 '화면' 리셋이므로 세션 통계는 유지하는 게 안전하지만,
            // 사용자가 원하면 아래 주석 해제.
            // setGraphData([]); setSessionTime(0); setSessionViolations({});
        }
    };

    const toggleSession = () => {
        if (isSessionActive) {
            // STOP: 리포트 보여주기
            setIsSessionActive(false);
            setShowReport(true);
        } else {
            // START: 데이터 초기화 후 시작
            setGraphData([0]); 
            setSessionTime(0);
            setSessionViolations({});
            setIsSessionActive(true);
        }
    };

    const formatTime = (totalSeconds) => {
        const m = Math.floor(totalSeconds / 60).toString().padStart(2, '0');
        const s = (totalSeconds % 60).toString().padStart(2, '0');
        return `${m}:${s}`;
    };

    // 실시간 플로팅 창용: 현재 활성 위반자
    const activeViolators = students
        .filter(s => (s.stack || 0) >= 3)
        .sort((a, b) => b.stack - a.stack)
        .slice(0, 5);

    // 리포트용: 누적 위반자 랭킹 변환
    const sortedViolators = Object.entries(sessionViolations)
        .map(([key, count]) => {
            const student = students.find(s => s.key === key) || { name: 'Unknown', studentId: '?' };
            return { key, name: student.name, studentId: student.studentId, count };
        })
        .sort((a, b) => b.count - a.count);

    return (
        <div className="min-h-screen w-screen bg-gray-900 text-white p-6 flex flex-col font-sans overflow-hidden relative">
            {/* Header */}
            <div className="flex justify-between items-center mb-6 border-b border-gray-700 pb-4 shrink-0">
                <div className="flex items-center gap-4">
                    <h1 className="text-3xl font-black text-white tracking-tighter">Real-time Dashboard (Professor)</h1>
                    <div className="flex gap-2 text-sm font-mono font-bold">
                        <span className="bg-gray-800 px-3 py-1 rounded border border-gray-600 text-gray-300">TOTAL: {stats.total}</span>
                        <span className="bg-green-900/30 text-green-400 px-3 py-1 rounded border border-green-800">SAFE: {stats.alive}</span>
                        <span className="bg-yellow-900/30 text-yellow-400 px-3 py-1 rounded border border-yellow-800">WARN: {stats.warning}</span>
                        <span className="bg-red-900/30 text-red-400 px-3 py-1 rounded border border-red-800 animate-pulse">VIOLATION: {stats.dead}</span>
                    </div>
                </div>
                <div className="flex gap-2">
                    <button 
                        onClick={toggleSession} 
                        className={`px-6 py-2 rounded font-bold text-sm shadow-lg transition-transform active:scale-95 flex items-center gap-2 ${isSessionActive ? 'bg-red-600 hover:bg-red-500 animate-pulse' : 'bg-green-600 hover:bg-green-500'}`}
                    >
                        {isSessionActive ? '⏹ STOP RECORDING' : '▶ START CLASS'}
                    </button>
                    <div className="w-px h-8 bg-gray-700 mx-2"></div>
                    <button onClick={handleReset} className="px-4 py-2 bg-yellow-600 hover:bg-yellow-500 text-white rounded font-bold text-sm transition-transform active:scale-95">🔄 RESET</button>
                    <button onClick={onBack} className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded font-bold text-sm transition-transform active:scale-95">🚪 EXIT</button>
                </div>
            </div>

            {/* Grid */}
            <div className="flex-1 overflow-y-auto custom-scrollbar mb-4 relative z-0">
                {students.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-gray-500 font-mono animate-pulse">
                        <div className="text-4xl mb-4">📡</div>
                        <p>Waiting for class connection...</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 pb-4">
                        {students.map((student) => (
                            <StudentCard key={student.key} data={student} />
                        ))}
                    </div>
                )}
            </div>

            {/* Bottom Graph */}
            <div className="h-48 shrink-0 relative animate-fade-in-up z-10">
                <SessionGraph data={graphData} totalStudents={stats.total} />

                {/* 실시간 플로팅 현황판 */}
                {isSessionActive && (
                    <div className="absolute bottom-52 right-4 w-64 bg-black/80 backdrop-blur-md border border-gray-600 rounded-xl p-4 shadow-2xl z-50 animate-fade-in-up">
                        <div className="flex items-center justify-between mb-3 border-b border-gray-600 pb-2">
                            <span className="text-gray-400 text-xs font-bold uppercase tracking-wider">Elapsed Time</span>
                            <span className="text-2xl font-mono font-black text-white">{formatTime(sessionTime)}</span>
                        </div>
                        <div>
                            <span className="text-gray-400 text-xs font-bold uppercase mb-2 block tracking-wider">Active Alerts</span>
                            <ul className="space-y-2 max-h-32 overflow-y-auto custom-scrollbar">
                                {activeViolators.length === 0 ? (
                                    <li className="text-gray-500 text-xs italic text-center py-2">No active violations...</li>
                                ) : (
                                    activeViolators.map(s => (
                                        <li key={s.key} className="flex justify-between items-center text-sm p-1 rounded hover:bg-white/5 transition-colors">
                                            <span className="text-red-400 font-bold truncate w-32">{s.name}</span>
                                            <span className="bg-red-900/60 text-red-300 px-2 py-0.5 rounded text-xs font-mono font-bold border border-red-500/30">
                                                x{s.stack}
                                            </span>
                                        </li>
                                    ))
                                )}
                            </ul>
                        </div>
                    </div>
                )}
            </div>

            {/* 결과 리포트 모달 */}
            {showReport && (
                <SessionReportModal 
                    duration={sessionTime}
                    peak={Math.max(...graphData, 0)}
                    graphData={graphData}
                    violators={sortedViolators}
                    totalStudents={stats.total}
                    onClose={() => setShowReport(false)}
                />
            )}
        </div>
    );
};

export default Dashboard;



