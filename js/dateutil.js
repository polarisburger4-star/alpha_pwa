// 日期工具：全部基于本地时区，日期键格式 YYYY-MM-DD
export const pad2 = (n) => String(n).padStart(2, '0');

export function ymd(d = new Date()) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

export function parseYmd(s) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(s, n) {
  const d = parseYmd(s);
  d.setDate(d.getDate() + n);
  return ymd(d);
}

export function diffDays(a, b) {
  // b - a，单位：天
  return Math.round((parseYmd(b) - parseYmd(a)) / 86400000);
}

export function dateRange(from, to) {
  const out = [];
  if (!from || !to || from > to) return out;
  let cur = from;
  while (cur <= to) { out.push(cur); cur = addDays(cur, 1); }
  return out;
}

// 某日的打卡截止时间（本地 23:30）
export function cutoffOf(s, h = 23, m = 30) {
  const d = parseYmd(s);
  d.setHours(h, m, 0, 0);
  return d;
}

export function mondayOf(s) {
  const d = parseYmd(s);
  const wd = (d.getDay() + 6) % 7; // 周一=0
  d.setDate(d.getDate() - wd);
  return ymd(d);
}

export function timeToMin(t) {
  if (!t || !/^\d{1,2}:\d{2}/.test(t)) return null;
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

export function fmtDateTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return `${ymd(d)} ${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
}

const WD = ['日', '一', '二', '三', '四', '五', '六'];
export function weekdayCn(s) { return '周' + WD[parseYmd(s).getDay()]; }
