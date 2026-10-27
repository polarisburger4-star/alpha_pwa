// 运行：node tests/scoring.test.mjs
import assert from 'node:assert/strict';
import { computeLedger, anomalies } from '../js/scoring.js';
import { isEarlyBed, isEarlyWake } from '../js/streaks.js';
import { newUnlocks, reachedMilestones, nextScoreMilestone } from '../js/milestones.js';
import { validateBackup, mergeData } from '../js/export.js';
import { addDays, ymd, calcSleepHours } from '../js/dateutil.js';
import { snapshotAsOf } from '../js/snapshot.js';
import { weeklySnapshotsTxt, currentSnapshotTxt, buildTxt } from '../js/export.js';

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

test('早睡早起：7/21/30，超过30天重新计数，60天内两轮奖励', () => {
  const recs = []; for (let i = 0; i < 60; i++) recs.push(rec(addDays(D0, i), { bedTime: '23:00', wakeTime: '07:00' }));
  const L = computeLedger({ records: recs, reports: [], now: NOW(addDays(D0, 59)) });
  assert.deepEqual(L.rewards.filter((x) => x.key === 'earlyRise').map((x) => x.days), [7, 21, 30, 7, 21, 30]);
  assert.equal(L.rewards.filter((x) => x.key === 'earlyRise')[3].date, addDays(D0, 36));
});

test('背单词：7/30 循环；断一天清零', () => {
  const recs = []; for (let i = 0; i < 37; i++) recs.push(rec(addDays(D0, i), { tasks: { vocab: i !== 3 } }));
  const L = computeLedger({ records: recs, reports: [], now: NOW(addDays(D0, 36)) });
  // 第0-2天3天，第3天断，第4天起 33 天：7、30、(31→1..3)
  assert.deepEqual(L.rewards.filter((x) => x.key === 'vocab').map((x) => x.days), [7, 30]);
  assert.equal(L.streaks.vocab.run, 33); assert.equal(L.streaks.vocab.cycle, 3);
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

test('ymd 本地日期格式', () => { assert.match(ymd(new Date()), /^\d{4}-\d{2}-\d{2}$/); });

console.log(`\n通过 ${pass}，失败 ${fail}`);
if (fail) process.exit(1);
