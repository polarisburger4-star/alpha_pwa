// 每日 19:30 打卡提醒（尽力而为：Notification Triggers / periodicSync / 页面与 SW 定时器 / 打开时补检）
import { setMeta } from './db.js';
import { ymd } from './dateutil.js';
import { REMINDER } from './rules.js';

let timer = null;

export function reminderSupport() {
  return {
    notification: 'Notification' in self,
    sw: 'serviceWorker' in navigator,
    triggers: typeof self.TimestampTrigger !== 'undefined' && 'Notification' in self && 'showTrigger' in Notification.prototype,
    periodicSync: 'serviceWorker' in navigator && 'periodicSync' in ServiceWorkerRegistration.prototype,
    permission: 'Notification' in self ? Notification.permission : 'unsupported',
    standalone: matchMedia('(display-mode: standalone)').matches || navigator.standalone === true,
  };
}

function nextFire(from = new Date()) {
  const t = new Date(from); t.setHours(REMINDER.h, REMINDER.m, 0, 0);
  if (t <= from) t.setDate(t.getDate() + 1);
  return t;
}

async function reg() {
  if (!('serviceWorker' in navigator)) return null;
  try { return await Promise.race([navigator.serviceWorker.ready, new Promise((r) => setTimeout(() => r(null), 3000))]); } catch { return null; }
}

async function notify(title, body, tag = 'alpha-reminder') {
  const r = await reg();
  const opts = { body, tag, icon: 'icons/icon-192.png', badge: 'icons/icon-192.png', data: { url: './#checkin' } };
  if (r) return r.showNotification(title, opts);
  if ('Notification' in self) new Notification(title, opts);
}

export async function enableReminder(state) {
  if (!('Notification' in self)) throw new Error('当前浏览器不支持通知');
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') throw new Error('未获得通知权限');
  state.data.settings = { ...state.data.settings, reminderEnabled: true };
  await setMeta('settings', state.data.settings);
  await schedule(state);
  return reminderSupport();
}

export async function disableReminder(state) {
  state.data.settings = { ...state.data.settings, reminderEnabled: false };
  await setMeta('settings', state.data.settings);
  clearTimeout(timer);
  const r = await reg();
  if (r) {
    try { if (r.periodicSync) await r.periodicSync.unregister('alpha-reminder'); } catch {}
    try { const ns = await r.getNotifications({ tag: 'alpha-reminder-scheduled', includeTriggered: false }); ns.forEach((n) => n.close()); } catch {}
    r.active && r.active.postMessage({ type: 'reminder-off' });
  }
}

async function schedule(state) {
  clearTimeout(timer);
  const s = state.data.settings || {};
  if (!s.reminderEnabled) return;
  const today = ymd();
  const done = state.data.records.some((x) => x.date === today);
  const from = new Date(); if (done) { from.setDate(from.getDate() + 1); from.setHours(0, 0, 0, 0); }
  const fire = nextFire(from);
  // 1) 页面内定时器（页面存活时有效）
  timer = setTimeout(() => { checkReminder(state); schedule(state); }, Math.min(fire - Date.now() + 1000, 2147483000));
  const r = await reg();
  if (!r) return;
  // 2) Notification Triggers（实验性，少数 Chromium 版本支持）
  const sup = reminderSupport();
  if (sup.triggers && Notification.permission === 'granted') {
    try {
      const ns = await r.getNotifications({ tag: 'alpha-reminder-scheduled', includeTriggered: false });
      ns.forEach((n) => n.close());
      await r.showNotification('阿尔法修炼 · 打卡提醒', {
        tag: 'alpha-reminder-scheduled', body: '19:30 了。今天的打卡完成了吗？23:30 截止。',
        icon: 'icons/icon-192.png', showTrigger: new self.TimestampTrigger(fire.getTime()), data: { url: './#checkin' },
      });
    } catch {}
  }
  // 3) Periodic Background Sync（Chromium 已安装 PWA 才可能生效，频率由浏览器决定）
  if (sup.periodicSync) {
    try {
      const st = await navigator.permissions.query({ name: 'periodic-background-sync' });
      if (st.state === 'granted') await r.periodicSync.register('alpha-reminder', { minInterval: 60 * 60 * 1000 });
    } catch {}
  }
  // 4) 通知 SW 设置定时器（SW 存活时有效）
  r.active && r.active.postMessage({ type: 'reminder-schedule', at: fire.getTime() });
}

// 打开/切回应用时补检：已过 19:30、今日未打卡、今日尚未提醒 → 发通知
export async function checkReminder(state) {
  const s = (state.data && state.data.settings) || {};
  if (!s.reminderEnabled || !('Notification' in self) || Notification.permission !== 'granted') return;
  const now = new Date(); const today = ymd(now);
  const t = new Date(now); t.setHours(REMINDER.h, REMINDER.m, 0, 0);
  const cut = new Date(now); cut.setHours(23, 30, 0, 0);
  if (now < t || now >= cut) return;
  if (state.data.records.some((r) => r.date === today)) return;
  if (s.lastNotifiedDate === today) return;
  state.data.settings = { ...s, lastNotifiedDate: today };
  await setMeta('settings', state.data.settings);
  await notify('阿尔法修炼 · 打卡提醒', '19:30 已过，今日尚未打卡。23:30 截止，逾期按漏打卡 -2。');
}

export async function testNotification() {
  if (Notification.permission !== 'granted') throw new Error('未获得通知权限');
  await notify('阿尔法修炼 · 测试通知', '通知功能正常。', 'alpha-test');
}

export function initReminder(state) {
  schedule(state).catch(() => {});
  checkReminder(state).catch(() => {});
}
