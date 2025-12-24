// Firebase 설정 및 초기화
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';
import { getFirestore, doc, setDoc, getDoc, getDocs, onSnapshot, collection, query, where, orderBy, limit, updateDoc, increment } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';

// Firebase 프로젝트 설정 (여기에 본인의 Firebase 설정 입력)
const firebaseConfig = {
  apiKey: "여기에_본인의_API_키",
  authDomain: "여기에_본인의_도메인",
  projectId: "여기에_본인의_프로젝트ID",
  storageBucket: "여기에_본인의_스토리지",
  messagingSenderId: "여기에_본인의_메시징ID",
  appId: "여기에_본인의_앱ID"
};

// Firebase 초기화
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

let currentUser = null;

// Firebase 초기화 함수
export async function initFirebase() {
  return new Promise((resolve, reject) => {
    onAuthStateChanged(auth, async (user) => {
      if (user) {
        currentUser = user;
        console.log('✅ Firebase 인증 완료:', user.uid);
        
        // 사용자 프로필 확인/생성
        await ensureUserProfile(user);
        
        // 실시간 동기화 활성화
        setupRealtimeSync(user.uid);
        
        resolve(user);
      } else {
        // 익명 로그인
        try {
          const result = await signInAnonymously(auth);
          currentUser = result.user;
          console.log('✅ Firebase 인증 완료:', result.user.uid);
          
          await ensureUserProfile(result.user);
          setupRealtimeSync(result.user.uid);
          
          resolve(result.user);
        } catch (error) {
          console.error('❌ Firebase 인증 실패:', error);
          reject(error);
        }
      }
    });
  });
}

// 사용자 프로필 확인/생성
async function ensureUserProfile(user) {
  const userRef = doc(db, 'users', user.uid);
  const userSnap = await getDoc(userRef);
  
  if (!userSnap.exists()) {
    // 새 사용자 프로필 생성
    const userName = localStorage.getItem('userName') || '학습자';
    const friendCode = generateFriendCode();
    
    await setDoc(userRef, {
      uid: user.uid,
      name: userName,
      friendCode: friendCode,
      createdAt: Date.now(),
      totalWords: 0,
      totalSessions: 0
    });
    
    console.log('✅ 새 사용자 프로필 생성:', friendCode);
  }
}

// 친구 코드 생성 (6자리 영숫자)
function generateFriendCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // 혼동 가능한 문자 제외
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

// 사용자 프로필 가져오기
export async function getUserProfile() {
  if (!currentUser) return null;
  
  const userRef = doc(db, 'users', currentUser.uid);
  const userSnap = await getDoc(userRef);
  
  if (userSnap.exists()) {
    return { uid: currentUser.uid, ...userSnap.data() };
  }
  return null;
}

// 실시간 동기화 설정
function setupRealtimeSync(uid) {
  console.log('📡 실시간 동기화 활성화');
  
  // studied 데이터 실시간 동기화
  const studiedRef = doc(db, 'users', uid, 'data', 'studied');
  onSnapshot(studiedRef, (doc) => {
    if (doc.exists()) {
      console.log('🔄 실시간 동기화: studied');
      const cloudData = doc.data();
      const localData = JSON.parse(localStorage.getItem('studied') || '{}');
      
      // 클라우드 데이터가 더 최신이면 로컬 업데이트
      const merged = { ...localData, ...cloudData };
      localStorage.setItem('studied', JSON.stringify(merged));
    }
  });
  
  // stats 데이터 실시간 동기화
  const statsRef = doc(db, 'users', uid, 'data', 'stats');
  onSnapshot(statsRef, (doc) => {
    if (doc.exists()) {
      console.log('🔄 실시간 동기화: stats');
      const cloudData = doc.data();
      const localData = JSON.parse(localStorage.getItem('wordswipe_stats') || '{}');
      
      const merged = { ...localData, ...cloudData };
      localStorage.setItem('wordswipe_stats', JSON.stringify(merged));
    }
  });
}

// 클라우드에 데이터 저장
export async function saveToCloud() {
  if (!currentUser) {
    console.log('⚠️ 로그인 필요 - 클라우드 저장 건너뜀');
    return;
  }
  
  try {
    const studied = JSON.parse(localStorage.getItem('studied') || '{}');
    const stats = JSON.parse(localStorage.getItem('wordswipe_stats') || '{}');
    
    // studied 저장
    const studiedRef = doc(db, 'users', currentUser.uid, 'data', 'studied');
    await setDoc(studiedRef, studied, { merge: true });
    
    // stats 저장
    const statsRef = doc(db, 'users', currentUser.uid, 'data', 'stats');
    await setDoc(statsRef, stats, { merge: true });
    
    // 사용자 프로필 업데이트 (통계)
    const userRef = doc(db, 'users', currentUser.uid);
    const totalWords = Object.keys(studied).length;
    const totalSessions = Object.values(stats).reduce((sum, day) => sum + day.sessions, 0);
    
    await updateDoc(userRef, {
      totalWords: totalWords,
      totalSessions: totalSessions,
      lastSync: Date.now()
    });
    
    console.log('☁️ 클라우드 저장 완료');
  } catch (error) {
    console.error('❌ 클라우드 저장 실패:', error);
  }
}

// 클라우드에서 데이터 불러오기
export async function loadFromCloud() {
  if (!currentUser) {
    console.log('⚠️ 로그인 필요 - 클라우드 불러오기 건너뜀');
    return;
  }
  
  try {
    // studied 불러오기
    const studiedRef = doc(db, 'users', currentUser.uid, 'data', 'studied');
    const studiedSnap = await getDoc(studiedRef);
    
    if (studiedSnap.exists()) {
      const cloudStudied = studiedSnap.data();
      const localStudied = JSON.parse(localStorage.getItem('studied') || '{}');
      
      // 병합 (클라우드 우선)
      const merged = { ...localStudied, ...cloudStudied };
      localStorage.setItem('studied', JSON.stringify(merged));
    }
    
    // stats 불러오기
    const statsRef = doc(db, 'users', currentUser.uid, 'data', 'stats');
    const statsSnap = await getDoc(statsRef);
    
    if (statsSnap.exists()) {
      const cloudStats = statsSnap.data();
      const localStats = JSON.parse(localStorage.getItem('wordswipe_stats') || '{}');
      
      const merged = { ...localStats, ...cloudStats };
      localStorage.setItem('wordswipe_stats', JSON.stringify(merged));
    }
    
    console.log('☁️ 클라우드 불러오기 완료');
  } catch (error) {
    console.error('❌ 클라우드 불러오기 실패:', error);
  }
}

// 친구 코드로 친구 찾기
export async function findFriendByCode(code) {
  if (!currentUser) {
    throw new Error('로그인이 필요합니다');
  }
  
  const usersRef = collection(db, 'users');
  const q = query(usersRef, where('friendCode', '==', code));
  const querySnapshot = await getDocs(q);
  
  if (querySnapshot.empty) {
    throw new Error('친구를 찾을 수 없습니다');
  }
  
  const friendDoc = querySnapshot.docs[0];
  return { uid: friendDoc.id, ...friendDoc.data() };
}

// 친구 추가
export async function addFriendByCode(code) {
  if (!currentUser) {
    throw new Error('로그인이 필요합니다');
  }
  
  const profile = await getUserProfile();
  if (profile.friendCode === code) {
    throw new Error('자기 자신은 추가할 수 없습니다');
  }
  
  const friend = await findFriendByCode(code);
  const friendRef = doc(db, 'users', currentUser.uid, 'friends', friend.uid);
  
  await setDoc(friendRef, {
    uid: friend.uid,
    name: friend.name,
    friendCode: friend.friendCode,
    addedAt: Date.now()
  });
}

// 친구 목록 가져오기
export async function getFriends() {
  if (!currentUser) return [];
  
  const friendsRef = collection(db, 'users', currentUser.uid, 'friends');
  const snapshot = await getDocs(friendsRef);
  
  const friends = [];
  for (const docSnap of snapshot.docs) {
    const friendData = docSnap.data();
    const friendProfileRef = doc(db, 'users', friendData.uid);
    const friendProfile = await getDoc(friendProfileRef);
    
    if (friendProfile.exists()) {
      friends.push({
        ...friendData,
        ...friendProfile.data()
      });
    }
  }
  
  return friends;
}

// 리더보드 가져오기
export async function getLeaderboard() {
  if (!currentUser) return [];
  
  const friends = await getFriends();
  const profile = await getUserProfile();
  
  const allUsers = [profile, ...friends];
  
  return allUsers
    .sort((a, b) => (b.totalWords || 0) - (a.totalWords || 0))
    .slice(0, 10);
}

// 초기 로드 시 클라우드 데이터 불러오기
loadFromCloud();
