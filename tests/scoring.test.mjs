// 运行：node tests/scoring.test.mjs
import assert from 'node:assert/strict';
import { computeLedger, anomalies } from '../js/scoring.js';
import { isEarlyBed, isEarlyWake } from '../js/streaks.js';
import { newUnlocks, reachedMilestones, nextScoreMilestone } from '../js/milestones.js';
import { validateBackup, mergeData } from '../js/export.js';
import { addDays, ymd, calcSleepHours } from '../js/dateutil.js';
import { snapshotAsOf } from '../js/snapshot.js';
import { weeklySnapshotsTxt, currentSnapshotTxt, buildTxt, formatDayTxt } from '../js/export.js';
import { computeLedger as legacyComputeLedger } from './legacy-v1.1.0/scoring.js';

let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); pass++; console.log('  ✓', name); }
  catch (e) { fail++; console.log('  ✗', name, '\n    ', e.message); }
}
const at = (date, h, m = 0) => { const [y, mo, d] = date.split('-').map(Number); return new Date(y, mo - 1, d, h, m).toISOString(); };
const rec = (date, o = {}, h = 21, m = 0) => ({
  date, created_at: at(date, h, m), updated_at: at(date, h, m), history: [at(date, h, m)],
  mental: '一般', psych: '一般', stress: '中', sleepHours: '', bedTime: '', wakeTime: '',
  fitness: false, trainingQuality: null, trainingNote: '', note: '', tasks: {}, ...o,
});
const NOW = (date, h = 22) => { const [y, mo, d] = date.split('-').map(Number); return new Date(y, mo - 1, d, h, 0); };
const D0 = '2026-01-01';
const day = (L, d) => L.days.find((x) => x.date === d);
const keys = (dd) => dd.items.map((i) => i.key).sort();

console.log('计分 / 连续 / 打卡 / 破戒 / 里程碑 测试');

test('无数据总分为0', () => {
  const L = computeLedger({ records: [], reports: [], now: NOW(D0) });
  assert.equal(L.total, 0); assert.equal(L.days.length, 0);
});

test('按时打卡：任务+自动加分', () => {
  const r = rec(D0, { mental: '良好', psych: '优秀', sleepHours: 7.5, fitness: true, trainingQuality: 'high',
    tasks: { microHabit: true, noMasturbation: true, study: true, vocab: true } });
  const L = computeLedger({ records: [r], reports: [], now: NOW(D0) });
  // 1+3+6+2 + 5 + 2+2 + 1 + 2 = 24
  assert.equal(L.total, 24); assert.equal(day(L, D0).status, 'ontime');
});

test('部分完成训练 +2；未勾健身不计训练', () => {
  let L = computeLedger({ records: [rec(D0, { fitness: true, trainingQuality: 'partial' })], reports: [], now: NOW(D0) });
  assert.equal(L.total, 3);
  L = computeLedger({ records: [rec(D0, { fitness: false, trainingQuality: 'high' })], reports: [], now: NOW(D0) });
  assert.equal(L.total, 1);
});

test('23:30 截止：23:29 按时，23:30 超时按漏打卡 -2 且无加分', () => {
  const ok = computeLedger({ records: [rec(D0, { mental: '优秀', tasks: { study: true } }, 23, 29)], reports: [], now: NOW(D0, 23) });
  assert.equal(day(ok, D0).status, 'ontime'); assert.equal(ok.total, 9);
  const late = computeLedger({ records: [rec(D0, { mental: '优秀', tasks: { study: true } }, 23, 30)], reports: [], now: NOW(addDays(D0, 1), 10) });
  assert.equal(day(late, D0).status, 'late'); assert.equal(day(late, D0).net, -2);
});

test('次日补录前一天 = 超时', () => {
  const r = rec(D0); r.created_at = at(addDays(D0, 1), 8);
  const L = computeLedger({ records: [r], reports: [], now: NOW(addDays(D0, 1), 9) });
  assert.equal(day(L, D0).status, 'late');
});

test('无记录的漏打卡日自动 -2，重复计算不重复扣分', () => {
  const recs = [rec(D0), rec(addDays(D0, 3))];
  const a = computeLedger({ records: recs, reports: [], now: NOW(addDays(D0, 3)) });
  const b = computeLedger({ records: recs, reports: [], now: NOW(addDays(D0, 3)) });
  assert.equal(day(a, addDays(D0, 1)).net, -2); assert.equal(day(a, addDays(D0, 2)).net, -2);
  assert.equal(a.total, 1 - 2 - 2 + 1); assert.equal(a.total, b.total);
});

test('今日 23:30 前未打卡为待打卡不扣分；23:30 后扣 -2', () => {
  const recs = [rec(D0)];
  const t = addDays(D0, 1);
  let L = computeLedger({ records: recs, reports: [], now: NOW(t, 20) });
  assert.equal(day(L, t).status, 'pending'); assert.equal(L.total, 1);
  L = computeLedger({ records: recs, reports: [], now: new Date(2026, 0, 2, 23, 31) });
  assert.equal(day(L, t).status, 'missed'); assert.equal(L.total, -1);
});

test('首条记录之前的日期不计漏打卡', () => {
  const L = computeLedger({ records: [rec('2026-03-01')], reports: [], now: NOW('2026-03-01') });
  assert.equal(L.days.length, 1);
});

test('破戒：每份申报 -10，"没有手淫"失效，克制连续中断', () => {
  const recs = [0, 1, 2].map((i) => rec(addDays(D0, i), { tasks: { noMasturbation: true } }));
  const reports = [{ id: 'a', date: addDays(D0, 2), created_at: at(addDays(D0, 2), 1) }, { id: 'b', date: addDays(D0, 2), created_at: at(addDays(D0, 2), 2) }];
  const L = computeLedger({ records: recs, reports, now: NOW(addDays(D0, 2)) });
  const d2 = day(L, addDays(D0, 2));
  assert.equal(d2.items.filter((i) => i.key === 'relapse').length, 2);
  assert.ok(!d2.items.some((i) => i.key === 'noMasturbation'));
  assert.equal(d2.net, 1 - 6 - 20); // 含精神连续一般 -6
  assert.equal(L.streaks.abstinence.run, 0);
});

test('今日待打卡但已有破戒申报：立即 -10 并中断克制连续', () => {
  const recs = [0, 1].map((i) => rec(addDays(D0, i), { tasks: { noMasturbation: true } }));
  const t = addDays(D0, 2);
  const L = computeLedger({ records: recs, reports: [{ id: 'x', date: t, created_at: at(t, 9) }], now: NOW(t, 10) });
  assert.equal(day(L, t).net, -10); assert.equal(L.streaks.abstinence.run, 0);
});

test('克制手淫连续：3/7/23/30 各一次，30天后不重置继续累计；破戒后新周期可再得', () => {
  const recs = []; for (let i = 0; i < 40; i++) recs.push(rec(addDays(D0, i), { tasks: { noMasturbation: true } }));
  let L = computeLedger({ records: recs, reports: [], now: NOW(addDays(D0, 39)) });
  const r = L.rewards.filter((x) => x.key === 'abstinence').map((x) => x.days);
  assert.deepEqual(r, [3, 7, 23, 30]); assert.equal(L.streaks.abstinence.run, 40);
  // 第41-43天：第41天破戒，之后3天重新获得 +5
  for (let i = 40; i < 44; i++) recs.push(rec(addDays(D0, i), { tasks: { noMasturbation: true } }));
  L = computeLedger({ records: recs, reports: [{ id: 'r', date: addDays(D0, 40), created_at: at(addDays(D0, 40), 3) }], now: NOW(addDays(D0, 43)) });
  assert.deepEqual(L.rewards.filter((x) => x.key === 'abstinence').map((x) => x.days), [3, 7, 23, 30, 3]);
  assert.equal(L.streaks.abstinence.run, 3);
});

test('漏打卡中断所有连续', () => {
  const recs = [0, 1, 3, 4].map((i) => rec(addDays(D0, i), { tasks: { noMasturbation: true, vocab: true } }));
  const L = computeLedger({ records: recs, reports: [], now: NOW(addDays(D0, 4)) });
  assert.equal(L.streaks.abstinence.run, 2); assert.equal(L.streaks.vocab.run, 2); assert.equal(L.streaks.checkin.run, 2);
  assert.equal(L.rewards.length, 0);
});

test('早睡早起判定边界', () => {
  assert.equal(isEarlyBed('23:29'), true); assert.equal(isEarlyBed('23:30'), false);
  assert.equal(isEarlyBed('00:30'), false); assert.equal(isEarlyBed('22:00'), true);
  assert.equal(isEarlyWake('07:30'), true); assert.equal(isEarlyWake('07:31'), false);
});

test('早睡早起：7/21/30 各一次，不设30天重置，第31天起无奖励，第37天不再奖励7天节点', () => {
  const recs = []; for (let i = 0; i < 60; i++) recs.push(rec(addDays(D0, i), { bedTime: '23:00', wakeTime: '07:00' }));
  const L = computeLedger({ records: recs, reports: [], now: NOW(addDays(D0, 59)) });
  const er = L.rewards.filter((x) => x.key === 'earlyRise');
  assert.deepEqual(er.map((x) => x.days), [7, 21, 30]);
  assert.deepEqual(er.map((x) => x.date), [addDays(D0, 6), addDays(D0, 20), addDays(D0, 29)]);
  assert.equal(L.streaks.earlyRise.run, 60);
  assert.ok(L.days.slice(30).every((d) => !d.items.some((i) => i.type === 'streak')));
  // 中断后新一轮可再次获得
  const recs2 = recs.slice(0, 45).concat(recs.slice(46));
  const L2 = computeLedger({ records: recs2, reports: [], now: NOW(addDays(D0, 59)) });
  assert.deepEqual(L2.rewards.filter((x) => x.key === 'earlyRise').map((x) => [x.days, x.date]), [[7, addDays(D0, 6)], [21, addDays(D0, 20)], [30, addDays(D0, 29)], [7, addDays(D0, 52)]]);
});

test('背单词：7/30 各一次不重置；断一天清零', () => {
  const recs = []; for (let i = 0; i < 45; i++) recs.push(rec(addDays(D0, i), { tasks: { vocab: i !== 3 } }));
  const L = computeLedger({ records: recs, reports: [], now: NOW(addDays(D0, 44)) });
  // 第0-2天3天，第3天断，第4天起 41 天：仅 7、30；第31天(=第34日)及以后、第37天均无奖励
  assert.deepEqual(L.rewards.filter((x) => x.key === 'vocab').map((x) => [x.days, x.date]), [[7, addDays(D0, 10)], [30, addDays(D0, 33)]]);
  assert.equal(L.streaks.vocab.run, 41); assert.equal(L.streaks.vocab.cycle, 41);
  assert.ok(!day(L, addDays(D0, 40)).items.some((i) => i.type === 'streak')); // 连续第37天
});

test('睡眠 <5 扣 5；≥7 加 2；空值不计', () => {
  let L = computeLedger({ records: [rec(D0, { sleepHours: 4.9 })], reports: [], now: NOW(D0) });
  assert.equal(L.total, 1 - 5);
  L = computeLedger({ records: [rec(D0, { sleepHours: 7 })], reports: [], now: NOW(D0) });
  assert.equal(L.total, 3);
  L = computeLedger({ records: [rec(D0, { sleepHours: '' })], reports: [], now: NOW(D0) });
  assert.equal(L.total, 1);
});

test('精神连续2天一般/差：从第2天起每天 -6；中间漏打卡则不连', () => {
  const recs = [0, 1, 2].map((i) => rec(addDays(D0, i), { mental: i === 0 ? '差' : '一般' }));
  let L = computeLedger({ records: recs, reports: [], now: NOW(addDays(D0, 2)) });
  assert.deepEqual(L.days.map((d) => d.items.some((i) => i.key === 'mentalLow2')), [false, true, true]);
  L = computeLedger({ records: [rec(D0), rec(addDays(D0, 2))], reports: [], now: NOW(addDays(D0, 2)) });
  assert.ok(!L.days.some((d) => d.items.some((i) => i.key === 'mentalLow2')));
});

test('预警：心理差+压力高/EM', () => {
  const L = computeLedger({ records: [rec(D0, { psych: '差', stress: 'EM' })], reports: [], now: NOW(D0) });
  assert.equal(day(L, D0).warnings[0].type, 'mental');
  const L2 = computeLedger({ records: [rec(D0, { psych: '差', stress: '中' })], reports: [], now: NOW(D0) });
  assert.equal(day(L2, D0).warnings.length, 0);
});

test('预警：净分连续三天下降（N-3>N-2>N-1>N）', () => {
  const recs = [
    rec(addDays(D0, 0), { tasks: { study: true } }),   // 7
    rec(addDays(D0, 1), { tasks: { reading: true } }), // 4
    rec(addDays(D0, 2), { tasks: { vocab: true } }),   // 3
    rec(addDays(D0, 3), {}),                           // 1
    rec(addDays(D0, 4), {}),                           // 1（持平，不再预警）
  ];
  const L = computeLedger({ records: recs, reports: [], now: NOW(addDays(D0, 4)) });
  assert.deepEqual(L.days.map((d) => d.warnings.some((w) => w.type === 'decline')), [false, false, false, true, false]);
});

test('历史最高分与异常节点', () => {
  const recs = [rec(D0, { tasks: { study: true } }), rec(addDays(D0, 1), { sleepHours: 3 })];
  const L = computeLedger({ records: recs, reports: [], now: NOW(addDays(D0, 1)) });
  assert.equal(L.maxTotal, 7); assert.equal(L.total, 7 + 1 - 5 - 6);
  assert.ok(anomalies(L).some((a) => a.kind === 'deduction' && a.date === addDays(D0, 1)));
});

test('里程碑：首次达成日期；已解锁不再弹出；克制天数里程碑', () => {
  const recs = []; for (let i = 0; i < 25; i++) recs.push(rec(addDays(D0, i), { tasks: { study: true, noMasturbation: true, approach: true } }));
  const L = computeLedger({ records: recs, reports: [], now: NOW(addDays(D0, 24)) });
  const reached = reachedMilestones(L).map((m) => m.id);
  assert.ok(reached.includes('s200') && reached.includes('a3') && reached.includes('a20'));
  assert.ok(!reached.includes('a30'));
  const fresh = newUnlocks(L, [{ id: 's200', date: D0 }]);
  assert.ok(!fresh.some((m) => m.id === 's200'));
  const n = nextScoreMilestone(250); assert.equal(n.next.score, 300); assert.equal(n.remain, 50);
});

test('备份校验与合并', () => {
  assert.equal(validateBackup({}).ok, false);
  const good = { app: 'alpha-pwa', schemaVersion: 1, records: [rec(D0)], reports: [{ id: 'x', date: D0 }], unlocked: [] };
  assert.equal(validateBackup(good).ok, true);
  assert.equal(validateBackup({ ...good, schemaVersion: 99 }).ok, false);
  assert.equal(validateBackup({ ...good, records: [rec(D0), rec(D0)] }).ok, false);
  const a = rec(D0, { note: 'old' }); const b = { ...rec(D0, { note: 'new' }), updated_at: at(D0, 23) };
  const m = mergeData({ records: [a], reports: [], unlocked: [] }, { records: [b], reports: [{ id: 'y', date: D0 }], unlocked: [] });
  assert.equal(m.records[0].note, 'new'); assert.equal(m.reports.length, 1);
});

test('睡眠自动计算：跨午夜 / 同日 / 空值', () => {
  assert.equal(calcSleepHours('23:10', '07:00'), 7.8);
  assert.equal(calcSleepHours('22:00', '06:30'), 8.5);
  assert.equal(calcSleepHours('00:30', '07:00'), 6.5);   // 同日（凌晨入睡）
  assert.equal(calcSleepHours('13:00', '14:30'), 1.5);   // 同日午睡
  assert.equal(calcSleepHours('01:00', '05:50'), 4.8);
  assert.equal(calcSleepHours('', '07:00'), null);
  assert.equal(calcSleepHours('23:00', ''), null);
  assert.equal(calcSleepHours('', ''), null);
  assert.equal(calcSleepHours(undefined, null), null);
  assert.equal(calcSleepHours('07:00', '07:00'), null);
});

test('自动计算值计分规则不变（≥7 +2，<5 -5）', () => {
  const L = computeLedger({ records: [rec(D0, { sleepHours: calcSleepHours('23:10', '07:00'), bedTime: '23:10', wakeTime: '07:00' })], reports: [], now: NOW(D0) });
  assert.ok(day(L, D0).items.some((i) => i.key === 'sleep7'));
  const L2 = computeLedger({ records: [rec(D0, { sleepHours: calcSleepHours('02:00', '06:30') })], reports: [], now: NOW(D0) });
  assert.ok(day(L2, D0).items.some((i) => i.key === 'sleepLow'));
});

test('快照 as-of：与截至该日结束时重算账本一致；里程碑按日期过滤', () => {
  // 2026-01-05 是周一。D0=周四。连续 20 天克制+背单词+早睡早起，第 10 天破戒，第 12 天漏打卡
  const recs = [];
  for (let i = 0; i < 20; i++) if (i !== 12) recs.push(rec(addDays(D0, i), { bedTime: '23:00', wakeTime: '07:00', sleepHours: 8, tasks: { noMasturbation: true, vocab: true, study: true, approach: true } }));
  const reports = [{ id: 'r1', date: addDays(D0, 10), created_at: at(addDays(D0, 10), 2) }];
  const nowD = addDays(D0, 19);
  const L = computeLedger({ records: recs, reports, now: NOW(nowD) });
  for (const i of [-3, 0, 2, 6, 9, 10, 11, 12, 13, 18]) {
    const d = addDays(D0, i);
    const s = snapshotAsOf(L, d);
    const ref = computeLedger({ records: recs, reports, now: new Date(...d.split('-').map((x, k) => k === 1 ? x - 1 : +x), 23, 59, 59) });
    assert.equal(s.total, ref.total, 'total ' + d);
    assert.equal(s.abstinence, ref.streaks.abstinence.run, 'abst ' + d);
    assert.equal(s.vocab, ref.streaks.vocab.run, 'vocab ' + d);
    assert.equal(s.earlyRise, ref.streaks.earlyRise.run, 'early ' + d);
    assert.equal(s.checkin, ref.streaks.checkin.run, 'checkin ' + d);
    assert.deepEqual(s.milestones.map((m) => m.id).sort(), reachedMilestones(ref).map((m) => m.id).sort(), 'ms ' + d);
  }
  const s9 = snapshotAsOf(L, addDays(D0, 9));
  assert.equal(s9.abstinence, 10); assert.equal(s9.checkin, 10); assert.equal(s9.ongoing, false);
  assert.equal(snapshotAsOf(L, addDays(D0, 10)).abstinence, 0);
  assert.equal(snapshotAsOf(L, addDays(D0, 12)).checkin, 0);
  assert.equal(snapshotAsOf(L, addDays(D0, -1)).total, 0);
  const sNow = snapshotAsOf(L, addDays(D0, 30));
  assert.equal(sNow.ongoing, true); assert.equal(sNow.date, nowD); assert.equal(sNow.total, L.total);
  // 已存储的解锁记录参与合并（取较早日期）
  const extra = snapshotAsOf(L, addDays(D0, 2), [{ id: 's200', date: D0 }]);
  assert.ok(extra.milestones.some((m) => m.id === 's200' && m.date === D0));
});

test('周报 TXT 含周初/周末快照，本周解锁标注；全部历史含当前快照', () => {
  const recs = []; for (let i = 0; i < 14; i++) recs.push(rec(addDays(D0, i), { tasks: { noMasturbation: true } }));
  const L = computeLedger({ records: recs, reports: [], now: NOW(addDays(D0, 13)) }); // 至 01-14（周三）
  const done = weeklySnapshotsTxt(L, '2026-01-05', '2026-01-11');
  assert.match(done, /【周初快照】截至 2026-01-04 周日 结束/);
  assert.match(done, /【周末快照】截至 2026-01-11 周日 结束/);
  assert.match(done, /克制手淫 7 天.*【本周解锁】/);
  assert.doesNotMatch(done.split('【周末快照】')[0], /【本周解锁】/);
  const cur = weeklySnapshotsTxt(L, '2026-01-12', '2026-01-18');
  assert.match(cur, /【周末快照】截至当前（今日 2026-01-14 周三，本周尚未结束）/);
  const txt = buildTxt(L, '2026-01-05', '2026-01-11', '周报', done);
  assert.ok(txt.indexOf('【周初快照】') < txt.indexOf('日期：2026-01-05'));
  assert.match(currentSnapshotTxt(L), /【当前快照】/);
});

// ───────────── v1.2.0：新增任务 / 每日减分项 / 洗冷水澡连续 ─────────────
test('新任务：洗冷水澡 +2、帮助他人或传递善意 +3、英语口语练习30分钟 +2', () => {
  let L = computeLedger({ records: [rec(D0, { tasks: { coldShower: true } })], reports: [], now: NOW(D0) });
  assert.equal(L.total, 1 + 2); assert.ok(day(L, D0).items.some((i) => i.key === 'coldShower' && i.points === 2));
  L = computeLedger({ records: [rec(D0, { tasks: { kindness: true } })], reports: [], now: NOW(D0) });
  assert.equal(L.total, 1 + 3); assert.ok(day(L, D0).items.some((i) => i.key === 'kindness' && i.points === 3));
  L = computeLedger({ records: [rec(D0, { tasks: { speaking: true } })], reports: [], now: NOW(D0) });
  assert.equal(L.total, 1 + 2); assert.ok(day(L, D0).items.some((i) => i.key === 'speaking' && i.points === 2));
  L = computeLedger({ records: [rec(D0, { tasks: { coldShower: true, kindness: true, speaking: true } })], reports: [], now: NOW(D0) });
  assert.equal(L.total, 1 + 2 + 3 + 2);
  assert.deepEqual(day(L, D0).completed, ['洗冷水澡', '帮助他人或传递善意', '英语口语练习30分钟']);
  // 英语口语练习：无连续奖励
  const recs = []; for (let i = 0; i < 30; i++) recs.push(rec(addDays(D0, i), { tasks: { speaking: true } }));
  L = computeLedger({ records: recs, reports: [], now: NOW(addDays(D0, 29)) });
  assert.equal(L.rewards.length, 0); assert.equal(L.total, 30 * 3 - 29 * 6); // 精神一般连续 -6
});

test('每日减分项：眼神闪躲 -2、小动作 -3（按时日计入，每日一次）', () => {
  let L = computeLedger({ records: [rec(D0, { deductions: { eyeAvoid: true } })], reports: [], now: NOW(D0) });
  assert.equal(L.total, 1 - 2);
  assert.ok(day(L, D0).items.some((i) => i.key === 'eyeAvoid' && i.points === -2 && i.type === 'deduction'));
  L = computeLedger({ records: [rec(D0, { deductions: { fidget: true } })], reports: [], now: NOW(D0) });
  assert.equal(L.total, 1 - 3);
  L = computeLedger({ records: [rec(D0, { tasks: { kindness: true }, deductions: { eyeAvoid: true, fidget: true } })], reports: [], now: NOW(D0) });
  assert.equal(L.total, 1 + 3 - 2 - 3);
  assert.equal(day(L, D0).items.filter((i) => i.key === 'eyeAvoid').length, 1);
  assert.deepEqual(day(L, D0).deducted, ['和他人对话时眼神闪躲', '站立时乱动或坐立时抖腿等小动作']);
  // 未勾选 / 字段缺失 = 不扣分
  L = computeLedger({ records: [rec(D0, { deductions: { eyeAvoid: false, fidget: false } })], reports: [], now: NOW(D0) });
  assert.equal(L.total, 1);
});

test('超时补录日：新加分与每日减分项均不计，仅 -2 及破戒', () => {
  const o = { mental: '优秀', tasks: { coldShower: true, kindness: true, speaking: true }, deductions: { eyeAvoid: true, fidget: true } };
  let L = computeLedger({ records: [rec(D0, o, 23, 30)], reports: [], now: NOW(addDays(D0, 1), 10) });
  let d = day(L, D0);
  assert.equal(d.status, 'late'); assert.equal(d.net, -2); assert.deepEqual(keys(d), ['missed']);
  assert.deepEqual(d.completed, []); assert.deepEqual(d.deducted, []);
  const r = rec(D0, o); r.created_at = at(addDays(D0, 1), 8); // 次日补录
  L = computeLedger({ records: [r], reports: [{ id: 'z', date: D0, created_at: at(D0, 3) }], now: NOW(addDays(D0, 1), 9) });
  d = day(L, D0);
  assert.equal(d.status, 'late'); assert.equal(d.net, -2 - 10); assert.deepEqual(keys(d), ['missed', 'relapse']);
});

test('洗冷水澡连续：第7天 +7、第30天 +50；不重置，第31天起无奖励，第37天不再奖励7天节点', () => {
  const recs = []; for (let i = 0; i < 60; i++) recs.push(rec(addDays(D0, i), { tasks: { coldShower: true } }));
  let L = computeLedger({ records: recs, reports: [], now: NOW(addDays(D0, 59)) });
  const cs = L.rewards.filter((x) => x.key === 'coldShower');
  assert.deepEqual(cs.map((x) => x.days), [7, 30]);
  assert.deepEqual(cs.map((x) => x.points), [7, 50]);
  assert.deepEqual(cs.map((x) => x.date), [addDays(D0, 6), addDays(D0, 29)]);
  assert.equal(cs[0].label, '洗冷水澡连续7天'); assert.equal(cs[1].label, '洗冷水澡连续30天');
  assert.equal(L.streaks.coldShower.run, 60);
  assert.equal(L.rewards.filter((x) => x.key !== 'coldShower').length, 0);
  assert.equal(day(L, addDays(D0, 6)).items.find((i) => i.key === 'streak_coldShower').points, 7);
  assert.equal(day(L, addDays(D0, 29)).items.find((i) => i.key === 'streak_coldShower').points, 50);
  for (let i = 30; i < 60; i++) assert.ok(!day(L, addDays(D0, i)).items.some((x) => x.type === 'streak'), 'day ' + (i + 1));
  assert.equal(day(L, addDays(D0, 36)).streakSnapshot.coldShower, 37);
  // 每日分值：30 天前后只差奖励
  assert.equal(day(L, addDays(D0, 36)).net, 1 + 2 - 6);
  // 中断（未勾选）后清零，新一轮可再得 7 天节点
  const recs2 = recs.map((r, i) => (i === 40 ? rec(r.date, { tasks: {} }) : r));
  L = computeLedger({ records: recs2, reports: [], now: NOW(addDays(D0, 59)) });
  assert.deepEqual(L.rewards.filter((x) => x.key === 'coldShower').map((x) => [x.days, x.date]), [[7, addDays(D0, 6)], [30, addDays(D0, 29)], [7, addDays(D0, 47)]]);
  assert.equal(L.streaks.coldShower.run, 19);
  // 不产生任何新里程碑
  assert.ok(reachedMilestones(L).every((m) => m.type === 'score' || m.type === 'abstinence'));
});

test('超时补录 / 漏打卡中断洗冷水澡连续', () => {
  const recs = [];
  for (let i = 0; i < 10; i++) {
    const r = rec(addDays(D0, i), { tasks: { coldShower: true } });
    if (i === 5) r.created_at = at(addDays(D0, 6), 8); // 第6天次日补录
    recs.push(r);
  }
  let L = computeLedger({ records: recs, reports: [], now: NOW(addDays(D0, 9)) });
  assert.equal(day(L, addDays(D0, 5)).streakSnapshot.coldShower, 0);
  assert.equal(L.streaks.coldShower.run, 4);
  assert.equal(L.rewards.filter((x) => x.key === 'coldShower').length, 0); // 5 天 + 4 天，均未到 7
  // 23:30 超时同样中断
  const recs2 = []; for (let i = 0; i < 8; i++) recs2.push(rec(addDays(D0, i), { tasks: { coldShower: true } }, i === 6 ? 23 : 21, i === 6 ? 45 : 0));
  L = computeLedger({ records: recs2, reports: [], now: NOW(addDays(D0, 7)) });
  assert.equal(L.streaks.coldShower.run, 1); assert.equal(L.rewards.filter((x) => x.key === 'coldShower').length, 0);
  // 漏打卡中断
  L = computeLedger({ records: recs.filter((_, i) => i !== 3).map((r, i) => (i === 4 ? { ...r, created_at: at(r.date, 21) } : r)), reports: [], now: NOW(addDays(D0, 9)) });
  assert.equal(L.streaks.coldShower.run, 6);
});

test('历史 / TXT / 快照：完成项、减分项、积分明细与洗冷水澡连续', () => {
  const recs = []; for (let i = 0; i < 14; i++) recs.push(rec(addDays(D0, i), { tasks: { coldShower: i >= 2, kindness: i === 5, speaking: i === 5 }, deductions: { eyeAvoid: i === 5, fidget: i === 5 } }));
  const L = computeLedger({ records: recs, reports: [], now: NOW(addDays(D0, 13)) }); // 至 01-14（周三）
  const t5 = formatDayTxt(day(L, addDays(D0, 5)));
  assert.match(t5, /完成项目：洗冷水澡、帮助他人或传递善意、英语口语练习30分钟/);
  assert.match(t5, /减分项目：和他人对话时眼神闪躲、站立时乱动或坐立时抖腿等小动作/);
  assert.match(t5, /\+3　帮助他人或传递善意/); assert.match(t5, /\+2　英语口语练习30分钟/);
  assert.match(t5, /-2　和他人对话时眼神闪躲/); assert.match(t5, /-3　站立时乱动或坐立时抖腿等小动作/);
  assert.match(formatDayTxt(day(L, D0)), /减分项目：—/);
  const t8 = formatDayTxt(day(L, addDays(D0, 8)));
  assert.match(t8, /\+7　成就：洗冷水澡连续7天/);
  const wk = weeklySnapshotsTxt(L, '2026-01-05', '2026-01-11');
  assert.match(wk.split('【周末快照】')[0], /洗冷水澡连续天数：2 天/);   // 截至 01-04：第3、4天
  assert.match(wk.split('【周末快照】')[1], /洗冷水澡连续天数：9 天/);   // 截至 01-11
  assert.match(currentSnapshotTxt(L), /洗冷水澡连续天数：12 天/);
  assert.equal(snapshotAsOf(L, addDays(D0, -1)).coldShower, 0);
});

// 向后兼容：用 v1.1.0 原版计分引擎（tests/legacy-v1.1.0 原样副本）对比多周旧数据
function mulberry32(a) { return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function oldSample(seed = 42, nDays = 84, longAbst = false) {
  const rnd = mulberry32(seed); const pick = (a) => a[Math.floor(rnd() * a.length)];
  const OLD_TASKS = ['microHabit', 'noMasturbation', 'chores', 'study', 'reading', 'vocab', 'approach', 'podcast', 'horseStance', 'meditation'];
  const LV = ['差', '一般', '良好', '优秀']; const SV = ['轻', '中', '高', 'EM'];
  const records = []; const reports = []; const start = '2026-02-02';
  for (let i = 0; i < nDays; i++) {
    const d = addDays(start, i); const x = rnd();
    if (!longAbst && x < 0.06) continue; // 漏打卡
    const tasks = {}; for (const k of OLD_TASKS) if (rnd() < (k === 'noMasturbation' || k === 'vocab' ? 0.85 : 0.5)) tasks[k] = true;
    if (longAbst) { tasks.noMasturbation = true; if (i % 12 === 11) delete tasks.vocab; } // 克制连续 >30；背单词每 12 天必断
    const good = rnd() < 0.7 && !(longAbst && i % 15 === 14);
    const r = rec(d, {
      mental: pick(LV), psych: pick(LV), stress: pick(SV),
      sleepHours: rnd() < 0.15 ? '' : Math.round((3 + rnd() * 6) * 10) / 10,
      bedTime: good ? '22:50' : pick(['23:40', '00:30', '23:10']), wakeTime: good ? '07:00' : pick(['07:30', '08:10']),
      fitness: rnd() < 0.5, trainingQuality: pick(['high', 'partial', null]), tasks,
    }, !longAbst && x < 0.12 ? 23 : 21, !longAbst && x < 0.12 ? 50 : 0); // 约 6% 超时
    if (!longAbst && x >= 0.12 && x < 0.15) r.created_at = at(addDays(d, 1), 9); // 次日补录
    if (rnd() < 0.03) delete r.tasks; // 极旧记录可能无 tasks
    records.push(r);
    if (longAbst ? i === 50 : rnd() < 0.08) reports.push({ id: 'p' + i, date: d, created_at: at(d, 2), period: '深夜' });
    if (!longAbst && rnd() < 0.02) reports.push({ id: 'q' + i, date: d, created_at: at(d, 3) });
  }
  return { records, reports, now: NOW(addDays(start, nDays - 1), 20) }; // 最后一天待打卡
}
const OLD_STREAK_KEYS = ['abstinence', 'earlyRise', 'vocab', 'checkin'];
// v1.2.0 取消早睡早起/背单词的 30 天重置：仅当旧数据中这两项连续从未超过 30 天时，新旧账本才应完全一致
const maxRun = (L, k) => Math.max(0, ...L.days.map((d) => d.streakSnapshot[k]));
function assertLedgerSame(a, b) {
  assert.equal(b.days.length, a.days.length);
  assert.equal(b.total, a.total); assert.equal(b.maxTotal, a.maxTotal); assert.equal(b.maxTotalDate, a.maxTotalDate);
  assert.deepEqual(b.rewards, a.rewards);
  for (const k of OLD_STREAK_KEYS) assert.deepEqual(b.streaks[k], a.streaks[k], k);
  a.days.forEach((x, i) => {
    const y = b.days[i];
    assert.equal(y.date, x.date); assert.equal(y.status, x.status, x.date);
    assert.equal(y.net, x.net, 'net ' + x.date); assert.equal(y.total, x.total, 'total ' + x.date);
    assert.deepEqual(y.items, x.items, 'items ' + x.date);
    assert.deepEqual(y.warnings, x.warnings); assert.deepEqual(y.completed, x.completed);
    assert.deepEqual(y.deducted, []);
    for (const k of OLD_STREAK_KEYS) assert.equal(y.streakSnapshot[k], x.streakSnapshot[k]);
    assert.equal(y.streakSnapshot.coldShower, 0);
  });
}

test('向后兼容：12 周旧数据新旧账本逐日完全一致（多个随机种子 + 克制连续>30天样本）', () => {
  for (const seed of [1, 7, 42, 2026, 99991]) {
    const { records, reports, now } = oldSample(seed);
    const a = legacyComputeLedger({ records, reports, now });
    const b = computeLedger({ records, reports, now });
    assert.ok(a.days.length >= 80 && a.days.some((d) => d.status === 'late') && a.days.some((d) => d.status === 'missed') && a.rewards.length > 0);
    assert.ok(maxRun(a, 'earlyRise') <= 30 && maxRun(a, 'vocab') <= 30, 'sample must not contain >30-day earlyRise/vocab streaks');
    assertLedgerSame(a, b);
    assert.deepEqual(reachedMilestones(b), reachedMilestones(a));
  }
  const s = oldSample(5, 84, true);
  const a = legacyComputeLedger(s); const b = computeLedger(s);
  assert.ok(maxRun(a, 'abstinence') > 30 && maxRun(a, 'earlyRise') <= 30 && maxRun(a, 'vocab') <= 30);
  assertLedgerSame(a, b);
  assert.deepEqual(reachedMilestones(b), reachedMilestones(a));
});

test('规则变更（有意）：旧数据中早睡早起/背单词连续 >30 天时，第31天后不再循环奖励', () => {
  const recs = []; for (let i = 0; i < 40; i++) recs.push(rec(addDays(D0, i), { tasks: { vocab: true } }));
  const a = legacyComputeLedger({ records: recs, reports: [], now: NOW(addDays(D0, 39)) });
  const b = computeLedger({ records: recs, reports: [], now: NOW(addDays(D0, 39)) });
  assert.deepEqual(a.rewards.map((x) => x.days), [7, 30, 7]); // v1.1.0：第37天再得 +7
  assert.deepEqual(b.rewards.map((x) => x.days), [7, 30]);    // v1.2.0：不再奖励
  assert.equal(a.total - b.total, 7);
  assert.equal(day(a, addDays(D0, 35)).total, day(b, addDays(D0, 35)).total); // 差异前完全一致
});

test('向后兼容：v1.1.0 JSON 备份可导入（替换/合并），分数不变', () => {
  const { records, reports, now } = oldSample(42);
  const backup = JSON.parse(JSON.stringify({ app: 'alpha-pwa', schemaVersion: 1, appVersion: '1.1.0', exportedAt: '2026-04-27T12:00:00.000Z', records, reports, unlocked: [{ id: 's200', date: '2026-03-01' }], settings: { reminderEnabled: false } }));
  const v = validateBackup(backup); assert.equal(v.ok, true, v.errors.join(';'));
  const ref = legacyComputeLedger({ records, reports, now });
  assertLedgerSame(ref, computeLedger({ records: backup.records, reports: backup.reports, now }));
  const merged = mergeData({ records: [], reports: [], unlocked: [] }, backup);
  assertLedgerSame(ref, computeLedger({ records: merged.records, reports: merged.reports, now }));
  // 与含新字段的新记录合并：新记录（较新 updated_at）生效，其余旧日不受影响
  const d = records[3].date; const newer = { ...records[3], tasks: { ...(records[3].tasks || {}), coldShower: true }, deductions: { eyeAvoid: true }, updated_at: at(addDays(d, 30), 9) };
  const m2 = mergeData({ records: [newer], reports: [], unlocked: [] }, backup);
  assert.equal(m2.records.find((r) => r.date === d).deductions.eyeAvoid, true);
});

test('ymd 本地日期格式', () => { assert.match(ymd(new Date()), /^\d{4}-\d{2}-\d{2}$/); });

console.log(`\n通过 ${pass}，失败 ${fail}`);
if (fail) process.exit(1);
