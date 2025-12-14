import { initializeApp } from "firebase/app";
import { getDatabase, ref, set, onDisconnect, remove, onValue, update } from "firebase/database";

// 1. Firebase 설정 (기존 설정 유지)
const firebaseConfig = {
  apiKey: "AIzaSyCAdXY6ZAkGez9IzZh4BKnmvHe08uPELSg",
  authDomain: "korean-killer.firebaseapp.com",
  projectId: "korean-killer",
  storageBucket: "korean-killer.firebasestorage.app",
  messagingSenderId: "818861695002",
  appId: "1:818861695002:web:d5c6309bae219c279af1a3",
  measurementId: "G-1Q4NG1F4QF",
  databaseURL: "https://korean-killer-default-rtdb.firebaseio.com"
};

// 2. 초기화
const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

// ---------------------------------------------------------
// 👇 기능 구현
// ---------------------------------------------------------

/**
 * 1. 세션 참가 (Join Class)
 * - 학생이 로그인하면 초기 상태를 DB에 생성합니다.
 * - 'status' 필드를 없애고 'stack: 0'으로 안전 상태를 표시합니다.
 */
export const joinSession = (name, studentId) => {
  const userId = `${studentId}_${name}`; // 고유 ID (예: 2025001_Kim)
  const userRef = ref(db, `session/users/${userId}`);

  // 초기 상태 저장
  set(userRef, {
    name,
    studentId,
    stack: 0,        // 누적 위반 횟수 (0이면 안전)
    score: 0,        // AI 확신도
    label: 'clean',  // 감지된 언어 (initial: clean)
    mouth: 'Closed', // 입 모양
    lastUpdate: Date.now()
  });

  // 연결 끊기면(창 닫으면) 자동 삭제
  onDisconnect(userRef).remove();

  return userId;
};

/**
 * 2. 상세 상태 업데이트 (Realtime Update)
 * - 학생의 현재 상태(스택, 라벨, 입모양 등)를 객체로 받아 업데이트합니다.
 * - App.jsx에서 0.25초마다(또는 변동 시) 호출됩니다.
 */
export const updateStatus = (userId, data) => {
  if (!userId) return;
  
  // data 예시: { stack: 3, label: 'korean', mouth: 'Open', score: 85 }
  const userRef = ref(db, `session/users/${userId}`);
  
  // 기존 데이터에 덮어쓰지 않고, 전달받은 필드만 업데이트 (merge)
  update(userRef, {
    ...data,
    lastUpdate: Date.now()
  });
};

/**
 * 3. [교수님용] 전체 세션 구독 (Dashboard Listener)
 * - DB의 모든 유저 데이터를 실시간으로 받아옵니다.
 */
export const listenToSession = (callback) => {
  const usersRef = ref(db, 'session/users');
  
  return onValue(usersRef, (snapshot) => {
    const data = snapshot.val();
    // 객체(Object)를 배열(Array)로 변환해서 리턴
    const userList = data ? Object.entries(data).map(([key, value]) => ({
      key, 
      ...value 
    })) : [];
    
    callback(userList);
  });
};

/**
 * 4. [교수님용] 전체 초기화 (Reset All)
 * - 모든 학생의 스택을 0으로, 라벨을 'clean'으로 되돌립니다.
 */
export const resetSession = (users) => {
  const updates = {};
  
  users.forEach(user => {
    // 한 번에 여러 경로를 업데이트하기 위한 경로 매핑
    updates[`session/users/${user.key}/stack`] = 0;
    updates[`session/users/${user.key}/score`] = 0;
    updates[`session/users/${user.key}/label`] = 'clean';
    updates[`session/users/${user.key}/mouth`] = 'Closed';
  });

  update(ref(db), updates);
};
