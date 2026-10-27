// IndexedDB 封装：records(按日期) / reports(破戒申报) / meta(设置、已解锁里程碑等)
const DB_NAME = 'alpha-pwa-db';
const DB_VER = 1;
let dbp = null;

export function openDB() {
  if (dbp) return dbp;
  dbp = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VER);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('records')) db.createObjectStore('records', { keyPath: 'date' });
      if (!db.objectStoreNames.contains('reports')) {
        const s = db.createObjectStore('reports', { keyPath: 'id' });
        s.createIndex('date', 'date');
      }
      if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta', { keyPath: 'key' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbp;
}

function wrap(req) {
  return new Promise((res, rej) => { req.onsuccess = () => res(req.result); req.onerror = () => rej(req.error); });
}
function done(tx) {
  return new Promise((res, rej) => { tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error); tx.onabort = () => rej(tx.error); });
}

export async function getAll(store) {
  const db = await openDB();
  return wrap(db.transaction(store).objectStore(store).getAll());
}
export async function get(store, key) {
  const db = await openDB();
  return wrap(db.transaction(store).objectStore(store).get(key));
}
export async function put(store, value) {
  const db = await openDB();
  const tx = db.transaction(store, 'readwrite');
  tx.objectStore(store).put(value);
  return done(tx);
}
export async function del(store, key) {
  const db = await openDB();
  const tx = db.transaction(store, 'readwrite');
  tx.objectStore(store).delete(key);
  return done(tx);
}

export async function getMeta(key, fallback = null) {
  const r = await get('meta', key);
  return r ? r.value : fallback;
}
export async function setMeta(key, value) { return put('meta', { key, value }); }

export async function loadAll() {
  const [records, reports, meta] = await Promise.all([getAll('records'), getAll('reports'), getAll('meta')]);
  const m = Object.fromEntries(meta.map((x) => [x.key, x.value]));
  return { records, reports, unlocked: m.unlocked || [], settings: m.settings || {} };
}

// 原子替换全部数据（导入/清空用）
export async function replaceAll({ records = [], reports = [], unlocked = [], settings }) {
  const db = await openDB();
  const tx = db.transaction(['records', 'reports', 'meta'], 'readwrite');
  const rs = tx.objectStore('records'); const ps = tx.objectStore('reports'); const ms = tx.objectStore('meta');
  rs.clear(); ps.clear();
  records.forEach((r) => rs.put(r));
  reports.forEach((p) => ps.put(p));
  ms.put({ key: 'unlocked', value: unlocked });
  if (settings !== undefined) ms.put({ key: 'settings', value: settings });
  return done(tx);
}

export async function clearAll() {
  const db = await openDB();
  const tx = db.transaction(['records', 'reports', 'meta'], 'readwrite');
  ['records', 'reports', 'meta'].forEach((s) => tx.objectStore(s).clear());
  return done(tx);
}

export function uid() {
  return (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));
}
