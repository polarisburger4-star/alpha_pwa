// 导出/导入：TXT 日志、JSON 备份、校验与合并（纯逻辑 + 下载）
import { APP_ID, APP_VERSION, SCHEMA_VERSION } from './version.js';
import { fmtDateTime, weekdayCn, addDays } from './dateutil.js';
import { snapshotAsOf } from './snapshot.js';
import { STATUS_LABEL } from './scoring.js';
import { TRAINING } from './rules.js';

export function buildBackup({ records, reports, unlocked, settings }) {
  return {
    app: APP_ID, schemaVersion: SCHEMA_VERSION, appVersion: APP_VERSION, exportedAt: new Date().toISOString(),
    records, reports, unlocked, settings: { reminderEnabled: !!(settings && settings.reminderEnabled) },
  };
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const LV = ['差', '一般', '良好', '优秀'];
const SV = ['轻', '中', '高', 'EM'];

export function validateBackup(obj) {
  const errors = [];
  if (!obj || typeof obj !== 'object') return { ok: false, errors: ['不是有效的 JSON 对象'] };
  if (obj.app !== APP_ID) errors.push('app 标识不匹配（应为 alpha-pwa）');
  if (typeof obj.schemaVersion !== 'number') errors.push('缺少 schemaVersion');
  else if (obj.schemaVersion > SCHEMA_VERSION) errors.push(`备份 schemaVersion=${obj.schemaVersion} 高于当前支持的 ${SCHEMA_VERSION}，请升级应用`);
  if (!Array.isArray(obj.records)) errors.push('records 必须为数组');
  if (!Array.isArray(obj.reports)) errors.push('reports 必须为数组');
  if (obj.unlocked != null && !Array.isArray(obj.unlocked)) errors.push('unlocked 必须为数组');
  if (errors.length) return { ok: false, errors };
  const seen = new Set();
  obj.records.forEach((r, i) => {
    if (!r || !DATE_RE.test(r.date || '')) errors.push(`records[${i}] 日期无效`);
    else if (seen.has(r.date)) errors.push(`records[${i}] 日期重复：${r.date}`);
    else seen.add(r.date);
    if (r && !r.created_at) errors.push(`records[${i}] 缺少 created_at`);
    if (r && r.mental && !LV.includes(r.mental)) errors.push(`records[${i}] 精神状态值无效`);
    if (r && r.psych && !LV.includes(r.psych)) errors.push(`records[${i}] 心理状态值无效`);
    if (r && r.stress && !SV.includes(r.stress)) errors.push(`records[${i}] 压力值无效`);
  });
  obj.reports.forEach((p, i) => {
    if (!p || !p.id) errors.push(`reports[${i}] 缺少 id`);
    if (!p || !DATE_RE.test(p.date || '')) errors.push(`reports[${i}] 日期无效`);
  });
  return { ok: errors.length === 0, errors: errors.slice(0, 20), data: obj };
}

// 合并：同日记录取 updated_at 较新者（其编辑历史取并集）；申报按 id 并集；已解锁里程碑按 id 并集取较早日期
export function mergeData(cur, inc) {
  const recs = new Map(cur.records.map((r) => [r.date, r]));
  for (const r of inc.records) {
    const a = recs.get(r.date);
    if (!a) { recs.set(r.date, r); continue; }
    const newer = String(r.updated_at || r.created_at) > String(a.updated_at || a.created_at) ? r : a;
    const created = [a.created_at, r.created_at].filter(Boolean).sort()[0];
    const history = [...new Set([...(a.history || []), ...(r.history || [])])].sort();
    recs.set(r.date, { ...newer, created_at: created, history });
  }
  const reps = new Map(cur.reports.map((p) => [p.id, p]));
  for (const p of inc.reports) if (!reps.has(p.id)) reps.set(p.id, p);
  const un = new Map((cur.unlocked || []).map((u) => [u.id, u]));
  for (const u of inc.unlocked || []) {
    const a = un.get(u.id);
    if (!a || String(u.date) < String(a.date)) un.set(u.id, u);
  }
  return { records: [...recs.values()], reports: [...reps.values()], unlocked: [...un.values()] };
}

const tq = (r) => (r && r.fitness ? (TRAINING[r.trainingQuality] || '未选择') : '—');

export function formatDayTxt(day) {
  const r = day.record;
  const L = [];
  L.push('════════════════════════════════════');
  L.push(`日期：${day.date} ${weekdayCn(day.date)}　状态：${STATUS_LABEL[day.status]}`);
  if (r) {
    L.push(`打卡时间：${fmtDateTime(r.created_at)}${r.updated_at && r.updated_at !== r.created_at ? `　最后修改：${fmtDateTime(r.updated_at)}` : ''}`);
    if ((r.history || []).length > 1) L.push(`修改记录：${r.history.map(fmtDateTime).join('；')}`);
    L.push(`精神档位：${r.mental || '—'}　心理档位：${r.psych || '—'}　压力档位：${r.stress || '—'}`);
    L.push(`睡眠时长：${r.sleepHours !== '' && r.sleepHours != null ? r.sleepHours + ' 小时' : '—'}　入睡：${r.bedTime || '—'}　起床：${r.wakeTime || '—'}`);
    L.push(`健身打卡：${r.fitness ? '是' : '否'}　训练质量：${tq(r)}`);
    L.push(`健身备注：${(r.fitness && r.trainingNote) || '—'}`);
  } else {
    L.push('（当日无打卡记录）');
  }
  if (day.reports.length) {
    day.reports.forEach((p, i) => {
      L.push(`破戒申报#${i + 1}：时段 ${p.period || '—'}｜媒介 ${p.medium || '—'}｜诱因 ${p.trigger || '—'}｜事后不适 ${p.discomfort || '—'}${p.discomfortDesc ? '（' + p.discomfortDesc + '）' : ''}｜备注 ${p.note || '—'}｜提交 ${fmtDateTime(p.created_at)}`);
    });
  } else L.push('破戒申报：无');
  L.push(`通用备注：${(r && r.note) || '—'}`);
  L.push(`完成项目：${day.completed.length ? day.completed.join('、') : '—'}`);
  L.push(`减分项目：${day.deducted && day.deducted.length ? day.deducted.join('、') : '—'}`);
  L.push('积分收支明细：');
  if (day.items.length) day.items.forEach((i) => L.push(`  ${i.points > 0 ? '+' : ''}${i.points}　${i.label}`));
  else L.push('  （无）');
  L.push(`当日净分：${day.net > 0 ? '+' : ''}${day.net}　累计总分：${day.total}`);
  if (day.warnings.length) L.push(`预警：${day.warnings.map((w) => w.text).join('；')}`);
  return L.join('\r\n');
}

// 快照文本：title 如“周初快照”；newSince 给定时，解锁日期 >= newSince 的里程碑标注【本周解锁】
export function formatSnapshot(title, label, snap, newSince = null) {
  const L = [];
  L.push(`【${title}】${label}`);
  L.push(`  总积分：${snap.total}`);
  L.push(`  手淫连续克制天数：${snap.abstinence} 天`);
  L.push(`  背单词连续天数：${snap.vocab} 天`);
  L.push(`  洗冷水澡连续天数：${snap.coldShower || 0} 天`);
  L.push(`  早睡早起连续天数：${snap.earlyRise} 天`);
  L.push(`  连续打卡天数：${snap.checkin} 天`);
  if (snap.milestones.length) {
    L.push(`  已解锁里程碑（${snap.milestones.length}）：`);
    for (const m of snap.milestones) L.push(`    · ${m.name}　解锁日期 ${m.date}${newSince && m.date >= newSince ? '　【本周解锁】' : ''}`);
  } else L.push('  已解锁里程碑：无');
  return L.join('\r\n');
}

// 周报快照：周初 = 本周一前的周日结束时；周末 = 本周日结束时（若本周未结束则截至当前）
export function weeklySnapshotsTxt(ledger, weekStart, weekEnd, unlocked = []) {
  const pre = addDays(weekStart, -1);
  const s0 = snapshotAsOf(ledger, pre, unlocked);
  const s1 = snapshotAsOf(ledger, weekEnd, unlocked);
  const l0 = s0.ongoing ? `截至当前（${s0.date} 尚未结束）` : `截至 ${pre} ${weekdayCn(pre)} 结束`;
  const l1 = s1.ongoing ? `截至当前（今日 ${s1.date} ${weekdayCn(s1.date)}，本周尚未结束）` : `截至 ${weekEnd} ${weekdayCn(weekEnd)} 结束`;
  return [formatSnapshot('周初快照', l0, s0), formatSnapshot('周末快照', l1, s1, weekStart)].join('\r\n');
}

export function currentSnapshotTxt(ledger, unlocked = []) {
  const s = snapshotAsOf(ledger, ledger.today, unlocked);
  return formatSnapshot('当前快照', `截至当前（${s.date} ${weekdayCn(s.date)}）`, s);
}

export function buildTxt(ledger, from, to, title, snapshotText = '') {
  const days = ledger.days.filter((d) => d.date >= from && d.date <= to);
  const head = [
    '从零开始阿尔法男人的修炼指南 —— 修炼日志',
    title,
    `导出时间：${fmtDateTime(new Date().toISOString())}`,
    `范围：${from} 至 ${to}　共 ${days.length} 天`,
    `范围内净分：${days.reduce((s, d) => s + d.net, 0)}　当前总积分：${ledger.total}　历史最高分：${ledger.maxTotal}`,
    '',
  ];
  if (snapshotText) head.push(snapshotText, '');
  const body = days.length ? days.map(formatDayTxt).join('\r\n') : '（该范围内无记录）';
  return head.join('\r\n') + '\r\n' + body + '\r\n';
}

export function download(filename, content, mime, bom = false) {
  const parts = bom ? ['\uFEFF', content] : [content];
  const blob = new Blob(parts, { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
export const downloadTxt = (name, text) => download(name, text, 'text/plain;charset=utf-8', true);
export const downloadJson = (name, obj) => download(name, JSON.stringify(obj, null, 2), 'application/json;charset=utf-8');
