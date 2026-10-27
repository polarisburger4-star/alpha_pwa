// 应用入口：路由、全局状态、重算
import { loadAll, setMeta } from './db.js';
import { computeLedger } from './scoring.js';
import { newUnlocks } from './milestones.js';
import { ymd, weekdayCn, diffDays } from './dateutil.js';
import { showModal, milestoneModal } from './ui/modal.js';
import { esc } from './ui/dom.js';
import * as checkin from './ui/checkin.js';
import * as stats from './ui/stats.js';
import * as historyView from './ui/history.js';
import * as exportPage from './ui/exportPage.js';
import * as rules from './ui/rulesPage.js';
import * as settings from './ui/settings.js';
import * as relapse from './ui/relapse.js';
import { initReminder, checkReminder } from './reminder.js';

const VIEWS = { checkin, stats, history: historyView, export: exportPage, rules, settings, relapse };
const state = { data: null, ledger: null, pendingMilestones: [], dayKey: ymd() };
let current = { tab: 'checkin', params: {} };
let cleanup = null;

async function refresh({ showMilestones = true, rerender = false } = {}) {
  state.data = await loadAll();
  state.ledger = computeLedger({ records: state.data.records, reports: state.data.reports, now: new Date() });
  const fresh = newUnlocks(state.ledger, state.data.unlocked);
  if (fresh.length) {
    const at = new Date().toISOString();
    state.data.unlocked = [...state.data.unlocked, ...fresh.map((m) => ({ id: m.id, date: m.date, unlockedAt: at }))];
    await setMeta('unlocked', state.data.unlocked);
    state.pendingMilestones.push(...fresh);
  }
  updateChrome();
  const doneToday = state.data.records.some((r) => r.date === ymd());
  if (state.lastDone !== undefined && state.lastDone !== doneToday) initReminder(state);
  state.lastDone = doneToday;
  if (rerender) renderView();
  if (showMilestones) await showPendingMilestones();
  return fresh;
}

async function showPendingMilestones() {
  const list = state.pendingMilestones.splice(0);
  if (!list.length) return;
  if (list.length > 3) {
    // 批量（如导入历史数据）时合并为一个弹窗
    await showModal({
      tone: 'solemn', dismissable: false,
      html: `<div class="ms-k">里程碑 · 共解锁 ${list.length} 项</div>${list.map((m) => `<div style="margin-bottom:10px"><div class="muted" style="font-size:12px">${esc(m.heading)} · ${esc(m.date)}</div><div>${esc(m.line2)}</div></div>`).join('')}`,
      buttons: [{ label: '继续前进', value: true, primary: true }],
    });
    return;
  }
  for (const m of list) await milestoneModal(m);
}

function updateChrome() {
  const today = ymd();
  const done = state.data.records.some((r) => r.date === today);
  document.getElementById('brandSub').textContent = `${today} ${weekdayCn(today)} · ${done ? '今日已打卡' : '今日未打卡 · 23:30 截止'}`;
  const pill = document.getElementById('scorePill');
  pill.textContent = state.ledger.total;
  pill.style.color = state.ledger.total < 0 ? 'var(--red2)' : '';
  const s = state.data.settings || {};
  const banner = document.getElementById('banner');
  const hasData = state.data.records.length || state.data.reports.length;
  const days = s.lastBackupAt ? diffDays(ymd(new Date(s.lastBackupAt)), today) : null;
  if (hasData && (days === null || days > 7)) {
    banner.innerHTML = `<div class="banner"><span>${days === null ? '尚未备份过数据' : `距上次备份已 ${days} 天`}。数据仅存于本机浏览器，请定期导出 JSON 备份。</span><a class="btn sm" href="#settings">去备份</a></div>`;
  } else banner.innerHTML = '';
}

function parseHash() {
  const h = location.hash.replace(/^#/, '');
  const [tab, q] = h.split('?');
  return { tab: VIEWS[tab] ? tab : 'checkin', params: Object.fromEntries(new URLSearchParams(q || '')) };
}

function renderView() {
  if (cleanup) { try { cleanup(); } catch {} cleanup = null; }
  document.querySelectorAll('#tabs a').forEach((a) => a.classList.toggle('active', a.dataset.tab === current.tab));
  const el = document.getElementById('view');
  el.innerHTML = '';
  const r = VIEWS[current.tab].render(el, ctx);
  if (typeof r === 'function') cleanup = r;
  const act = document.querySelector('#tabs a.active');
  if (act && act.scrollIntoView) act.scrollIntoView({ block: 'nearest', inline: 'nearest' });
}

function go(tab, params = {}, replace = false) {
  const q = new URLSearchParams(params).toString();
  const hash = '#' + tab + (q ? '?' + q : '');
  if (location.hash === hash) { current = parseHash(); renderView(); window.scrollTo(0, 0); return; }
  if (replace) history.replaceState(null, '', hash); else history.pushState(null, '', hash);
  current = parseHash(); renderView(); window.scrollTo(0, 0);
}

const ctx = {
  state, refresh, go, showPendingMilestones,
  get params() { return current.params; },
  rerender: () => renderView(),
};

window.addEventListener('hashchange', () => { current = parseHash(); renderView(); window.scrollTo(0, 0); });
window.addEventListener('popstate', () => { current = parseHash(); renderView(); });

document.addEventListener('visibilitychange', async () => {
  if (document.visibilityState !== 'visible') return;
  const dayChanged = state.dayKey !== ymd();
  state.dayKey = ymd();
  await refresh({ rerender: dayChanged || current.tab !== 'checkin' });
  checkReminder(state);
});

// 每分钟检查跨日/截止，必要时重算（不打断正在填写的表单）
setInterval(async () => {
  if (document.visibilityState !== 'visible') return;
  if (state.dayKey !== ymd()) { state.dayKey = ymd(); await refresh({ rerender: true }); }
  else { const n = new Date(); if (n.getHours() === 23 && n.getMinutes() === 30) await refresh({ rerender: current.tab !== 'checkin' }); }
  checkReminder(state);
}, 60000);

async function boot() {
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname))) {
    navigator.serviceWorker.register('sw.js').catch((e) => console.warn('SW 注册失败', e));
  }
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
  try {
    await refresh({ showMilestones: false });
  } catch (e) {
    document.getElementById('view').innerHTML = `<div class="card danger">数据库打开失败：${esc(e && e.message)}。<br>请确认未处于禁用存储的隐私模式。</div>`;
    return;
  }
  current = parseHash();
  renderView();
  await showPendingMilestones();
  initReminder(state);
}
boot();
