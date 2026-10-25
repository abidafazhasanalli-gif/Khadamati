const CACHE = 'khadamati-v36';
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
  const cacheable = url.origin === location.origin || /fonts\.(googleapis|gstatic)\.com$/.test(url.hostname);
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


// ردود إشعارات المحاضرات (حضرت / غبت) حتى والتطبيق مغلق
self.addEventListener('notificationclick', (e) => {
  const d = e.notification.data || {};
  e.notification.close();
  const r = e.action || 'open';
  e.waitUntil((async () => {
    const list = await self.clients.matchAll({type: 'window', includeUncontrolled: true});
    if (list.length) {
      list[0].postMessage({type: 'lec-ans', gk: d.gk, r});
      try { await list[0].focus(); } catch (err) {}
    } else {
      await self.clients.openWindow('./?lec=' + r + '&gk=' + encodeURIComponent(d.gk || ''));
    }
  })());
});
