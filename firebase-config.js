// firebase-config.js
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js';
import { getFirestore, doc, setDoc, getDoc, onSnapshot, collection, query, where, orderBy, limit, updateDoc, increment } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';

// ⚠️ Firebase Console에서 복사한 설정값으로 교체하세요!
const firebaseConfig = {
  apiKey: "AIzaSyBU5lC91UCeDadz4IVnd0byy5Ts3wcFAys",
  authDomain: "wordswipe-2f209.firebaseapp.com",
  projectId: "wordswipe-2f209",
  storageBucket: "wordswipe-2f209.firebasestorage.app",
  messagingSenderId: "223111111558",
  appId: "1:223111111558:web:8f058aa9c2afe4d2194207"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

let currentUser = null;
let syncEnabled = false;

// ========================================
// 사용자 초기화
// ========================================

export async function initFirebase() {
  return new Promise((resolve) => {
    onAuthStateChanged(auth, async (user) => {
      if (user) {
        currentUser = user;
        console.log('✅ Firebase 인증 완료:', user.uid);
        
        // 프로필 확인/생성
        await ensureUserProfile();
        
        // 실시간 동기화 시작
        startRealtimeSync();
        
        // 초기 데이터 로드
        await loadFromCloud();
        
        syncEnabled = true;
        resolve(user);
      } else {
        // 익명 로그인
        console.log('🔐 익명 로그인 시작...');
        await signInAnonymously(auth);
      }
    });
  });
}

// ========================================
// 프로필 관리
// ========================================

async function ensureUserProfile() {
  const profileRef = doc(db, 'users', currentUser.uid);
  const profileSnap = await getDoc(profileRef);
  
  if (!profileSnap.exists()) {
    // 새 사용자 - 이름 입력받기
    const userName = prompt('닉네임을 입력하세요 (나중에 변경 가능)', '학습자');
    const friendCode = generateFriendCode();
    
    await setDoc(profileRef, {
      name: userName || '학습자',
      friendCode: friendCode,
      createdAt: new Date().toISOString(),
      totalWords: 0,
      streak: 0,
      lastActive: new Date().toISOString()
    });
    
    console.log('✅ 새 사용자 프로필 생성:', friendCode);
  } else {
    // 기존 사용자 - 마지막 활동 시간 업데이트
    await updateDoc(profileRef, {
      lastActive: new Date().toISOString()
    });
  }
}

export async function updateUserName(newName) {
  if (!currentUser) return;
  
  await updateDoc(doc(db, 'users', currentUser.uid), {
    name: newName
  });
  
  alert('✅ 닉네임이 변경되었습니다!');
}

export async function getUserProfile() {
  if (!currentUser) return null;
  
  const snap = await getDoc(doc(db, 'users', currentUser.uid));
  return snap.exists() ? snap.data() : null;
}

// ========================================
// 친구 코드 생성
// ========================================

function generateFriendCode() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

// ========================================
// 실시간 동기화
// ========================================

function startRealtimeSync() {
  if (!currentUser) return;
  
  // studied 데이터 실시간 감시
  onSnapshot(doc(db, 'users', currentUser.uid, 'data', 'studied'), (snapshot) => {
    if (snapshot.exists()) {
      const cloudData = snapshot.data();
      const localData = JSON.parse(localStorage.getItem('studied') || '{}');
      
      // 병합 (최신 우선)
      const merged = mergeStudiedData(localData, cloudData);
      localStorage.setItem('studied', JSON.stringify(merged));
      
      console.log('🔄 실시간 동기화: studied');
    }
  });
  
  // stats 데이터 실시간 감시
  onSnapshot(doc(db, 'users', currentUser.uid, 'data', 'stats'), (snapshot) => {
    if (snapshot.exists()) {
      const cloudData = snapshot.data();
      localStorage.setItem('wordswipe_stats', JSON.stringify(cloudData));
      
      console.log('🔄 실시간 동기화: stats');
    }
  });
  
  console.log('📡 실시간 동기화 활성화');
}

function mergeStudiedData(local, cloud) {
  const merged = {...cloud};
  
  Object.keys(local).forEach(word => {
    if (!merged[word]) {
      merged[word] = local[word];
    } else {
      // 더 최근 데이터 사용
      const localTime = local[word].lastReview || 0;
      const cloudTime = merged[word].lastReview || 0;
      
      if (localTime > cloudTime) {
        merged[word] = local[word];
      }
    }
  });
  
  return merged;
}

// ========================================
// 클라우드 저장/불러오기
// ========================================

export async function saveToCloud() {
  if (!currentUser || !syncEnabled) return;
  
  try {
    const studied = JSON.parse(localStorage.getItem('studied') || '{}');
    const stats = JSON.parse(localStorage.getItem('wordswipe_stats') || '{}');
    
    // Firestore에 저장
    await setDoc(doc(db, 'users', currentUser.uid, 'data', 'studied'), studied);
    await setDoc(doc(db, 'users', currentUser.uid, 'data', 'stats'), stats);
    
    // 프로필 통계 업데이트
    const totalWords = Object.keys(studied).length;
    await updateDoc(doc(db, 'users', currentUser.uid), {
      totalWords: totalWords,
      lastActive: new Date().toISOString()
    });
    
    console.log('☁️ 클라우드 저장 완료');
  } catch (error) {
    console.error('❌ 저장 실패:', error);
  }
}

export async function loadFromCloud() {
  if (!currentUser) return;
  
  try {
    const studiedSnap = await getDoc(doc(db, 'users', currentUser.uid, 'data', 'studied'));
    const statsSnap = await getDoc(doc(db, 'users', currentUser.uid, 'data', 'stats'));
    
    if (studiedSnap.exists()) {
      const cloudData = studiedSnap.data();
      const localData = JSON.parse(localStorage.getItem('studied') || '{}');
      const merged = mergeStudiedData(localData, cloudData);
      localStorage.setItem('studied', JSON.stringify(merged));
    }
    
    if (statsSnap.exists()) {
      localStorage.setItem('wordswipe_stats', JSON.stringify(statsSnap.data()));
    }
    
    console.log('☁️ 클라우드 불러오기 완료');
  } catch (error) {
    console.error('❌ 불러오기 실패:', error);
  }
}

// ========================================
// 친구 시스템
// ========================================

export async function findFriendByCode(friendCode) {
  const q = query(
    collection(db, 'users'),
    where('friendCode', '==', friendCode.toUpperCase()),
    limit(1)
  );
  
  const snapshot = await getDocs(q);
  
  if (snapshot.empty) {
    return null;
  }
  
  const friendDoc = snapshot.docs[0];
  return {
    id: friendDoc.id,
    ...friendDoc.data()
  };
}

export async function addFriend(friendCode) {
  if (!currentUser) return { success: false, error: '로그인이 필요합니다.' };
  
  const friend = await findFriendByCode(friendCode);
  
  if (!friend) {
    return { success: false, error: '존재하지 않는 친구 코드입니다.' };
  }
  
  if (friend.id === currentUser.uid) {
    return { success: false, error: '자신을 친구로 추가할 수 없습니다.' };
  }
  
  // 친구 목록에 추가
  const friendsRef = doc(db, 'users', currentUser.uid, 'friends', friend.id);
  await setDoc(friendsRef, {
    name: friend.name,
    friendCode: friend.friendCode,
    addedAt: new Date().toISOString()
  });
  
  return { success: true, friend: friend };
}

export async function getFriends() {
  if (!currentUser) return [];
  
  const friendsSnap = await getDocs(collection(db, 'users', currentUser.uid, 'friends'));
  
  const friends = [];
  for (const doc of friendsSnap.docs) {
    const friendData = doc.data();
    
    // 친구의 최신 정보 가져오기
    const friendProfileSnap = await getDoc(db.doc(db, 'users', doc.id));
    if (friendProfileSnap.exists()) {
      friends.push({
        id: doc.id,
        ...friendProfileSnap.data()
      });
    }
  }
  
  return friends;
}

export async function getLeaderboard() {
  const q = query(
    collection(db, 'users'),
    orderBy('totalWords', 'desc'),
    limit(10)
  );
  
  const snapshot = await getDocs(q);
  
  return snapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data()
  }));
}

// ========================================
// 자동 저장 (10초마다)
// ========================================

setInterval(() => {
  if (syncEnabled) {
    saveToCloud();
  }
}, 10000);

// ========================================
// 페이지 종료 시 저장
// ========================================

window.addEventListener('beforeunload', () => {
  if (syncEnabled) {
    saveToCloud();
  }
});

export { currentUser, db, auth };
