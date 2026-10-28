const CACHE = 'khadamati-v61';
const SHELL = ['./', './index.html', './manifest.webmanifest', './icon-192.png', './icon-512.png', './apple-touch-icon.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Page loads: try the network first so updates arrive, fall back to cache offline.
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put('./index.html', copy));
          return res;
        })
        .catch(() => caches.match('./index.html'))
    );
    return;
  }

  // Same-origin files and Google Fonts: serve from cache, refresh in the background.
  const cacheable = url.origin === location.origin || /(fonts\.(googleapis|gstatic)|cdnjs\.cloudflare)\.com$/.test(url.hostname);
  if (!cacheable) return;
  e.respondWith(
    caches.match(req).then((hit) => {
      const net = fetch(req)
        .then((res) => {
          if (res && (res.ok || res.type === 'opaque')) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(() => hit);
      return hit || net;
    })
  );
});


// ===== تنبيهات خارج التطبيق (Web Push) =====
const PUSH_URL = 'https://khadamati-push.abid-afaz-hasan-alli.workers.dev';

self.addEventListener('push', (e) => {
  e.waitUntil((async () => {
    const wins = await self.clients.matchAll({type: 'window', includeUncontrolled: true});
    const visible = wins.some((c) => c.visibilityState === 'visible');
    let notes = [];
    try {
      const sub = await self.registration.pushManager.getSubscription();
      const r = await fetch(PUSH_URL + '/pull', {method: 'POST', headers: {'Content-Type': 'text/plain'}, body: JSON.stringify({endpoint: sub && sub.endpoint})});
      notes = (await r.json()).notes || [];
    } catch (err) {}
    if (visible && notes.length) { wins.forEach((c) => c.postMessage({type: 'push-refresh'})); return; }  // التطبيق مفتوح: يعرضها بنفسه
    if (!notes.length) notes = [{title: 'خدماتي', body: 'لديك تنبيه جديد', tag: 'khadamati-generic'}];
    for (const n of notes) {
      await self.registration.showNotification(n.title, {
        body: n.body, tag: n.tag || undefined, icon: 'icon-192.png', badge: 'icon-192.png', lang: 'ar', dir: 'rtl',
        data: n.data || {}, actions: n.actions || [], requireInteraction: !!n.sticky
      });
    }
  })());
});

// ردود الإشعارات (حضرت / غبت) حتى والتطبيق مغلق
self.addEventListener('notificationclick', (e) => {
  const d = e.notification.data || {};
  e.notification.close();
  const r = e.action || 'open';
  e.waitUntil((async () => {
    const list = await self.clients.matchAll({type: 'window', includeUncontrolled: true});
    if (list.length) {
      list[0].postMessage({type: 'lec-ans', gk: d.gk, r, course: d.course, n: d.n});
      try { await list[0].focus(); } catch (err) {}
    } else {
      await self.clients.openWindow('./?lec=' + r + '&gk=' + encodeURIComponent(d.gk || '') + '&course=' + encodeURIComponent(d.course || '') + '&n=' + (d.n || ''));
    }
  })());
});
