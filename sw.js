bash

cat /home/claude/soralog-build/app/public/sw.js
出力

const CACHE_NAME = 'pawsche-v5';

self.addEventListener('install', e => { self.skipWaiting(); });
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => clients.claim())
  );
});

self.addEventListener('fetch', e => {
  // APIリクエストはキャッシュしない
  if (e.request.url.includes('vercel.app') || e.request.url.includes('anthropic.com')) return;
  if (e.request.method !== 'GET') return;
  
  // JSファイルはネットワークファースト
  if (e.request.url.includes('.js')) {
    e.respondWith(
      fetch(e.request).then(res => {
        if (!res || res.status !== 200) return res;
        const clone = res.clone();
        caches.open(CACHE_NAME).then(c => c.put(e.request, clone));
        return res;
      }).catch(() => caches.match(e.request))
    );
    return;
  }

  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached;
      return fetch(e.request).then(res => {
        if (!res || res.status !== 200) return res;
        const clone = res.clone();
        caches.open(CACHE_NAME).then(c => c.put(e.request, clone));
        return res;
      });
    })
  );
});

// プッシュ通知を受信
self.addEventListener('push', e => {
  const data = e.data ? e.data.json() : {};
  const title = data.title || 'Pawsche';
  const options = {
    body: data.body || '',
    icon: '/pawsche/icon-192.png',
    badge: '/pawsche/icon-192.png',
    tag: data.tag || 'pawsche',
    data: { url: data.url || '/pawsche/' }
  };
  e.waitUntil(self.registration.showNotification(title, options));
});

// 通知タップでアプリを開く
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = e.notification.data?.url || '/pawsche/';
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) return client.focus();
      }
      if (clients.openWindow) return clients.openWindow(url);
    })
  );
});
