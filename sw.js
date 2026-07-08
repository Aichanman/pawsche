// Pawsche Service Worker - Push通知 & オフラインキャッシュ
const CACHE_NAME = 'pawsche-v3';
const NOTIFY_HOUR = 7; // 朝通知時刻

self.addEventListener('install', e => {
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(clients.claim());
});

// fetch: キャッシュファースト（オフライン対応）
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
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

// ── 通知スケジューリング ──────────────────────────────────────────────
// メインスレッドからスケジュール情報を受け取る
self.addEventListener('message', e => {
  if (e.data && e.data.type === 'SCHEDULE_NOTIFICATIONS') {
    scheduleNotifications(e.data.todos, e.data.events);
  }
});

function localDateStr(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth()+1).padStart(2,'0');
  const day = String(d.getDate()).padStart(2,'0');
  return `${y}-${m}-${day}`;
}

function daysUntil(dateStr) {
  const today = new Date(); today.setHours(0,0,0,0);
  const target = new Date(dateStr + 'T00:00:00');
  return Math.round((target - today) / 86400000);
}

function scheduleNotifications(todos = [], events = []) {
  const now = new Date();
  const todayStr = localDateStr(now);

  // ── TODO通知 ──────────────────────────────────────────────────────
  todos.filter(t => !t.done && t.deadline).forEach(t => {
    const diff = daysUntil(t.deadline);

    // 朝7:00通知（3日前・前日・当日）
    [3, 1, 0].forEach(d => {
      if (diff !== d) return;
      const notifTime = new Date(t.deadline + 'T07:00:00');
      if (notifTime > now) {
        const delay = notifTime - now;
        const label = d === 0 ? '今日が締切！' : d === 1 ? '明日が締切' : '締切まで3日';
        setTimeout(() => {
          self.registration.showNotification(`📌 ${t.text}`, {
            body: label,
            icon: '/icon-192.png',
            badge: '/icon-192.png',
            tag: `todo-deadline-${t.id}-${d}`,
            data: { url: '/', type: 'todo' }
          });
        }, delay);
      }
    });

    // 締切時間設定済み → 2時間前・1時間前
    if (t.deadlineTime && diff === 0) {
      const [hh, mm] = t.deadlineTime.split(':').map(Number);
      [2, 1].forEach(hoursB => {
        const notifTime = new Date();
        notifTime.setHours(hh - hoursB, mm, 0, 0);
        if (notifTime > now) {
          const delay = notifTime - now;
          setTimeout(() => {
            self.registration.showNotification(`⏰ ${t.text}`, {
              body: `締切${hoursB}時間前 (${t.deadlineTime})`,
              icon: '/icon-192.png',
              badge: '/icon-192.png',
              tag: `todo-time-${t.id}-${hoursB}h`,
              data: { url: '/', type: 'todo' }
            });
          }, delay);
        }
      });
    }
  });

  // ── カレンダー予定通知（3日前・前日・当日の朝7:00） ──────────────
  events.forEach(ev => {
    const evDateStr = localDateStr(new Date(ev.date));
    const diff = daysUntil(evDateStr);
    [3, 1, 0].forEach(d => {
      if (diff !== d) return;
      const notifTime = new Date(evDateStr + 'T07:00:00');
      if (notifTime > now) {
        const delay = notifTime - now;
        const evDate = new Date(ev.date);
        const timeStr = `${String(evDate.getHours()).padStart(2,'0')}:${String(evDate.getMinutes()).padStart(2,'0')}`;
        const label = d === 0 ? `今日 ${timeStr}〜` : d === 1 ? `明日 ${timeStr}〜` : `3日後 ${timeStr}〜`;
        setTimeout(() => {
          self.registration.showNotification(`📅 ${ev.title}`, {
            body: label,
            icon: '/icon-192.png',
            badge: '/icon-192.png',
            tag: `event-${ev.id}-${d}`,
            data: { url: '/', type: 'event' }
          });
        }, delay);
      }
    });
  });
}

// 通知タップでアプリを開く
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = e.notification.data?.url || '/';
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) return clients.openWindow(url);
    })
  );
});

// 毎朝定期チェック用（periodicsync or 起動時にメインスレッドから呼ぶ）
self.addEventListener('periodicsync', e => {
  if (e.tag === 'daily-notif-check') {
    e.waitUntil(
      self.clients.matchAll().then(clientList => {
        // クライアントが開いていればメッセージで再スケジュール依頼
        clientList.forEach(c => c.postMessage({ type: 'REQUEST_SCHEDULE' }));
      })
    );
  }
});
