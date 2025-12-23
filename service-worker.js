const CACHE_NAME = 'wordswipe-v1.0.0';
const urlsToCache = [
  '/',
  '/index.html',
  '/wordsets.html',
  '/review.html',
  '/completed.html',
  '/stats.html',
  '/onboarding.html',
  '/common.css',
  '/words.json',
  '/firebase-config.js',
  '/manifest.json'
];

// 설치 이벤트
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('✅ 캐시 저장 완료');
        return cache.addAll(urlsToCache);
      })
  );
  self.skipWaiting();
});

// 활성화 이벤트
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            console.log('🗑️ 오래된 캐시 삭제:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// Fetch 이벤트 (오프라인 지원)
self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        // 캐시에 있으면 반환
        if (response) {
          return response;
        }

        // 없으면 네트워크 요청
        return fetch(event.request).then(response => {
          // 유효한 응답이 아니면 그냥 반환
          if (!response || response.status !== 200 || response.type !== 'basic') {
            return response;
          }

          // 응답 복제해서 캐시에 저장
          const responseToCache = response.clone();
          caches.open(CACHE_NAME)
            .then(cache => {
              cache.put(event.request, responseToCache);
            });

          return response;
        });
      })
      .catch(() => {
        // 오프라인 폴백
        return caches.match('/index.html');
      })
  );
});

// 백그라운드 동기화 (나중에 추가 가능)
self.addEventListener('sync', event => {
  if (event.tag === 'sync-data') {
    event.waitUntil(syncData());
  }
});

async function syncData() {
  // Firebase 동기화 로직
  console.log('🔄 백그라운드 동기화 시작');
}

// 푸시 알림 (나중에 추가 가능)
self.addEventListener('push', event => {
  const options = {
    body: event.data ? event.data.text() : '새로운 단어를 학습할 시간입니다!',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    vibrate: [200, 100, 200]
  };

  event.waitUntil(
    self.registration.showNotification('WordSwipe', options)
  );
});
