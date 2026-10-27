// Service Worker：离线缓存应用外壳 + 尽力而为的 19:30 提醒
const VERSION = 'alpha-v1.1.0';
const SHELL = [
  './', './index.html', './manifest.json', './css/style.css', './vendor/chart.umd.min.js',
  './js/app.js', './js/db.js', './js/dateutil.js', './js/rules.js', './js/scoring.js', './js/streaks.js',
  './js/milestones.js', './js/milestones-config.js', './js/export.js', './js/charts.js', './js/reminder.js', './js/version.js', './js/snapshot.js',
  './js/ui/dom.js', './js/ui/modal.js', './js/ui/checkin.js', './js/ui/stats.js', './js/ui/history.js', './js/ui/exportPage.js',
  './js/ui/rulesPage.js', './js/ui/settings.js', './js/ui/relapse.js',
  './icons/icon-192.png', './icons/icon-512.png', './icons/icon-maskable-512.png', './icons/apple-touch-icon.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL.map((u) => new Request(u, { cache: 'reload' })))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

// 缓存优先，后台更新（stale-while-revalidate）；导航请求离线回落到 index.html
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  e.respondWith((async () => {
    const cache = await caches.open(VERSION);
    const hit = await cache.match(req, { ignoreSearch: req.mode === 'navigate' });
    const net = fetch(req).then((res) => { if (res && res.ok) cache.put(req, res.clone()); return res; }).catch(() => null);
    if (hit) { e.waitUntil(net); return hit; }
    const res = await net;
    if (res) return res;
    if (req.mode === 'navigate') return (await cache.match('./index.html')) || Response.error();
    return Response.error();
  })());
});

// ---- 提醒 ----
const pad = (n) => String(n).padStart(2, '0');
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

function idb() {
  return new Promise((res, rej) => { const r = indexedDB.open('alpha-pwa-db'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
}
function getKey(db, store, key) {
  return new Promise((res) => {
    try { const q = db.transaction(store).objectStore(store).get(key); q.onsuccess = () => res(q.result); q.onerror = () => res(null); } catch { res(null); }
  });
}
function putKey(db, store, val) {
  return new Promise((res) => { try { const tx = db.transaction(store, 'readwrite'); tx.objectStore(store).put(val); tx.oncomplete = () => res(); tx.onerror = () => res(); } catch { res(); } });
}

async function maybeRemind() {
  const now = new Date();
  const start = new Date(now); start.setHours(19, 30, 0, 0);
  const cut = new Date(now); cut.setHours(23, 30, 0, 0);
  if (now < start || now >= cut) return;
  const db = await idb();
  if (!db.objectStoreNames.contains('meta')) return;
  const s = ((await getKey(db, 'meta', 'settings')) || {}).value || {};
  const today = ymd(now);
  if (!s.reminderEnabled || s.lastNotifiedDate === today) return;
  if (await getKey(db, 'records', today)) return;
  await putKey(db, 'meta', { key: 'settings', value: { ...s, lastNotifiedDate: today } });
  await self.registration.showNotification('阿尔法修炼 · 打卡提醒', {
    body: '19:30 已过，今日尚未打卡。23:30 截止，逾期按漏打卡 -2。', tag: 'alpha-reminder',
    icon: 'icons/icon-192.png', badge: 'icons/icon-192.png', data: { url: './#checkin' },
  });
}

let timer = null;
self.addEventListener('message', (e) => {
  const m = e.data || {};
  if (m.type === 'reminder-schedule' && m.at) {
    clearTimeout(timer);
    const ms = m.at - Date.now();
    if (ms > 0 && ms < 2147483000) timer = setTimeout(() => { maybeRemind(); }, ms + 1000); // SW 被回收后失效（浏览器限制）
  } else if (m.type === 'reminder-off') clearTimeout(timer);
});

self.addEventListener('periodicsync', (e) => { if (e.tag === 'alpha-reminder') e.waitUntil(maybeRemind()); });

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || './';
  e.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of all) { if ('focus' in c) { c.navigate && c.navigate(url).catch(() => {}); return c.focus(); } }
    return self.clients.openWindow(url);
  })());
});
