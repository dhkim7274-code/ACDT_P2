import { initializeApp } from "firebase/app";
import { getDatabase, ref, set, onDisconnect, remove } from "firebase/database";

// 1. 방금 받으신 설정값 (여기에 databaseURL을 제가 추가했습니다)
const firebaseConfig = {
  apiKey: "AIzaSyCAdXY6ZAkGez9IzZh4BKnmvHe08uPELSg",
  authDomain: "korean-killer.firebaseapp.com",
  projectId: "korean-killer",
  storageBucket: "korean-killer.firebasestorage.app",
  messagingSenderId: "818861695002",
  appId: "1:818861695002:web:d5c6309bae219c279af1a3",
  measurementId: "G-1Q4NG1F4QF",
  // 👇 [중요] 실시간 DB를 쓰기 위해 이 줄이 꼭 필요합니다!
  databaseURL: "https://korean-killer-default-rtdb.firebaseio.com" 
};

// 2. 파이어베이스 초기화
const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

// ---------------------------------------------------------
// 👇 기능 구현: 여기서부터는 우리가 쓸 함수들입니다.
// ---------------------------------------------------------

/**
 * 1. 세션 참가 (로그인 개념)
 * - 이름과 학번을 받아서 DB에 등록합니다.
 * - 인터넷 창을 닫으면(연결이 끊기면) 자동으로 명단에서 삭제됩니다.
 */
export const joinSession = (name, studentId) => {
  // 학번_이름 형태로 고유 ID 생성 (예: 20240001_Kim)
  const userId = `${studentId}_${name}`; 
  const userRef = ref(db, `session/users/${userId}`);

  // 1) 내 정보 저장 (살아있음 상태로 시작)
  set(userRef, {
    name: name,
    studentId: studentId,
    status: 'ALIVE', 
    score: 0,
    lastActive: Date.now()
  });

  // 2) [핵심] 창 닫거나 연결 끊기면 자동으로 삭제 (청소)
  onDisconnect(userRef).remove();

  return userId;
};

/**
 * 2. 상태 업데이트 (실시간 감시)
 * - 한국어를 써서 적발되거나(DEAD), 다시 조용해지면(ALIVE) 호출합니다.
 * - 교수님 화면(대시보드)에 내 상태가 즉시 반영됩니다.
 */
export const updateStatus = (userId, isSuspect, score) => {
  if (!userId) return;
  
  const userRef = ref(db, `session/users/${userId}`);
  
  // 상태 업데이트
  // set은 덮어쓰기지만, 필요한 필드만 보내면 부분 업데이트 효과를 낼 수 있게 구조를 짰습니다.
  // (더 정확히는 update를 써야 하지만, 간단한 구조라 set으로 전체 정보를 갱신합니다)
  // 여기서는 기존 정보를 모르니 status와 score만 갱신하는 별도 경로를 쓰거나
  // 간단하게 status만 바꿉니다.
  
  // *주의: set은 전체를 덮어씁니다. updateStatus가 자주 호출되므로
  // 트래픽 절약을 위해 status 필드만 콕 집어서 업데이트하는 게 좋습니다.
  // 아래 코드는 'status'와 'score' 필드만 업데이트합니다.
  
  // 하지만 update 함수를 import 안 했으니, 경로를 구체적으로 지정해서 set을 씁니다.
  set(ref(db, `session/users/${userId}/status`), isSuspect ? 'DEAD' : 'ALIVE');
  set(ref(db, `session/users/${userId}/score`), score);
};
// ... (위쪽 코드는 그대로 유지) ...
import { onValue, update } from "firebase/database"; // 👈 맨 윗줄 import에 onValue, update 추가 필요!

// ... (중간 코드 생략) ...

/**
 * 3. [교수님용] 전체 세션 구독 (실시간 모니터링)
 * - DB의 모든 유저 데이터를 실시간으로 받아옵니다.
 * - 데이터가 바뀔 때마다 callback 함수를 실행합니다.
 */
export const listenToSession = (callback) => {
  const usersRef = ref(db, 'session/users');
  
  // onValue는 데이터가 변할 때마다 즉시 발동합니다.
  return onValue(usersRef, (snapshot) => {
    const data = snapshot.val();
    // 객체(Object)를 배열(Array)로 변환해서 돌려줍니다.
    const userList = data ? Object.entries(data).map(([key, value]) => ({
      key, 
      ...value 
    })) : [];
    
    callback(userList);
  });
};

/**
 * 4. [교수님용] 전체 초기화 (Reset All)
 * - 모든 학생의 상태를 'ALIVE'로 되돌립니다.
 */
export const resetSession = (users) => {
  const updates = {};
  users.forEach(user => {
    updates[`session/users/${user.key}/status`] = 'ALIVE';
    updates[`session/users/${user.key}/score`] = 0;
  });
  update(ref(db), updates);
};
