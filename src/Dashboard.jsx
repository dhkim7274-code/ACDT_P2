import { useState, useEffect } from 'react';
import { listenToSession, resetSession } from './firebase';

const Dashboard = ({ onBack }) => {
    const [students, setStudents] = useState([]);
    const [stats, setStats] = useState({ total: 0, dead: 0, alive: 0 });

    useEffect(() => {
        // 파이어베이스 데이터 구독 시작
        const unsubscribe = listenToSession((data) => {
            setStudents(data);
            
            // 통계 계산
            const deadCount = data.filter(s => s.status === 'DEAD').length;
            setStats({
                total: data.length,
                dead: deadCount,
                alive: data.length - deadCount
            });
        });

        // 컴포넌트가 꺼질 때 구독 해제 (메모리 누수 방지)
        return () => unsubscribe(); 
    }, []);

    const handleReset = () => {
        if (window.confirm("모든 학생의 상태를 초기화하시겠습니까?")) {
            resetSession(students);
        }
    };

    return (
        <div className="min-h-screen w-screen bg-gray-900 text-white p-6 flex flex-col">
            {/* 상단 헤더 */}
            <div className="flex justify-between items-center mb-8 border-b border-gray-700 pb-4">
                <div className="flex items-center gap-4">
                    <h1 className="text-3xl font-black text-red-600 tracking-tighter">OVERWATCH 🛰️</h1>
                    <div className="flex gap-2 text-sm font-mono">
                        <span className="bg-gray-800 px-3 py-1 rounded border border-gray-600">TOTAL: {stats.total}</span>
                        <span className="bg-green-900/50 text-green-400 px-3 py-1 rounded border border-green-700">ALIVE: {stats.alive}</span>
                        <span className="bg-red-900/50 text-red-400 px-3 py-1 rounded border border-red-700 animate-pulse">DEAD: {stats.dead}</span>
                    </div>
                </div>
                <div className="flex gap-2">
                    <button onClick={handleReset} className="px-4 py-2 bg-yellow-600 hover:bg-yellow-500 rounded font-bold text-sm shadow-lg">
                        🔄 RESET ALL
                    </button>
                    <button onClick={onBack} className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded font-bold text-sm">
                        🚪 EXIT
                    </button>
                </div>
            </div>

            {/* 메인 그리드 */}
            {students.length === 0 ? (
                <div className="flex-1 flex items-center justify-center text-gray-500 text-xl font-mono">
                    Waiting for signals...
                </div>
            ) : (
                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4 overflow-y-auto custom-scrollbar p-2">
                    {students.map((student) => (
                        <div 
                            key={student.key}
                            className={`relative p-4 rounded-xl border-2 transition-all duration-300 ${
                                student.status === 'DEAD' 
                                ? 'bg-red-900/40 border-red-500 shadow-[0_0_20px_rgba(220,38,38,0.3)] scale-105' 
                                : 'bg-gray-800 border-gray-700 hover:border-gray-500'
                            }`}
                        >
                            {/* 상태 배지 */}
                            <div className="absolute top-2 right-2">
                                {student.status === 'DEAD' ? (
                                    <span className="animate-ping absolute inline-flex h-3 w-3 rounded-full bg-red-400 opacity-75"></span>
                                ) : null}
                                <span className={`relative inline-flex rounded-full h-3 w-3 ${student.status === 'DEAD' ? 'bg-red-500' : 'bg-green-500'}`}></span>
                            </div>

                            <div className="mt-2">
                                <h3 className="font-bold text-lg truncate">{student.name}</h3>
                                <p className="text-gray-400 text-sm font-mono">{student.studentId}</p>
                            </div>

                            {/* 점수 게이지 */}
                            <div className="mt-4">
                                <div className="flex justify-between text-xs mb-1">
                                    <span className="text-gray-500">Risk Level</span>
                                    <span className={`font-mono ${student.status === 'DEAD' ? 'text-red-400' : 'text-gray-400'}`}>
                                        {student.score || 0}%
                                    </span>
                                </div>
                                <div className="h-1.5 bg-gray-700 rounded-full overflow-hidden">
                                    <div 
                                        className={`h-full transition-all duration-500 ${student.status === 'DEAD' ? 'bg-red-500' : 'bg-blue-500'}`}
                                        style={{ width: `${student.score || 0}%` }}
                                    ></div>
                                </div>
                            </div>

                            {student.status === 'DEAD' && (
                                <div className="absolute inset-0 flex items-center justify-center bg-black/60 rounded-lg backdrop-blur-[1px] animate-pulse">
                                    <span className="text-red-500 font-black text-2xl rotate-[-15deg] border-4 border-red-500 px-2 rounded">
                                        DETECTED
                                    </span>
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

export default Dashboard;
