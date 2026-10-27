// 计分引擎：对全部数据做纯函数、确定性的重算，输出逐日账本
import { ymd, cutoffOf, dateRange } from './dateutil.js';
import { TASKS, AUTO_BONUS, DEDUCTIONS, MANUAL_DEDUCTIONS, CUTOFF } from './rules.js';
import { newStreakState, stepStreak, isEarlyBirdDay } from './streaks.js';

const LOW_MENTAL = new Set(['差', '一般']);
const GOOD = new Set(['良好', '优秀']);

export function isOnTime(rec) {
  if (!rec || !rec.created_at) return false;
  return new Date(rec.created_at) < cutoffOf(rec.date, CUTOFF.h, CUTOFF.m);
}

export function dayStatus(date, rec, today, now, firstRecord) {
  if (rec) return isOnTime(rec) ? 'ontime' : 'late';
  if (date === today && now < cutoffOf(today, CUTOFF.h, CUTOFF.m)) return 'pending';
  if (!firstRecord || date < firstRecord) return 'untracked';
  return 'missed';
}

export const STATUS_LABEL = {
  ontime: '按时打卡', late: '超时补录（按漏打卡计）', missed: '漏打卡', pending: '今日待打卡', untracked: '未开始记录',
};

/**
 * @param {{records:Array, reports:Array, now?:Date}} input
 */
export function computeLedger({ records = [], reports = [], now = new Date() }) {
  const today = ymd(now);
  const recMap = new Map();
  for (const r of records) if (r && r.date && r.date <= today) recMap.set(r.date, r);
  const repMap = new Map();
  for (const p of reports) {
    if (!p || !p.date || p.date > today) continue;
    if (!repMap.has(p.date)) repMap.set(p.date, []);
    repMap.get(p.date).push(p);
  }
  const recDates = [...recMap.keys()].sort();
  const repDates = [...repMap.keys()].sort();
  const firstRecord = recDates[0] || null;
  const start = [recDates[0], repDates[0]].filter(Boolean).sort()[0] || null;

  const result = {
    today, firstRecord, days: [], total: 0, maxTotal: 0, maxTotalDate: null,
    streaks: newStreakState(), rewards: [],
  };
  if (!start) return result;

  const st = result.streaks;
  let total = 0;
  let prevMentalLow = false;
  const settledNets = []; // 已结算日（非 pending）的净分，用于“连续三天下降”

  for (const date of dateRange(start, today)) {
    const rec = recMap.get(date) || null;
    const reps = (repMap.get(date) || []).slice().sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
    const status = dayStatus(date, rec, today, now, firstRecord);
    const items = [];
    const warnings = [];
    const completed = [];
    const deducted = []; // 当日勾选并计入的减分项
    const add = (key, label, points, type) => items.push({ key, label, points, type });

    if (status === 'ontime') {
      const t = rec.tasks || {};
      for (const task of TASKS) {
        if (!t[task.key]) continue;
        if (task.key === 'noMasturbation' && reps.length) continue; // 有破戒申报则无效
        add(task.key, task.label, task.points, 'bonus');
        completed.push(task.label);
      }
      if (rec.fitness && rec.trainingQuality === 'high') { add('trainingHigh', AUTO_BONUS.trainingHigh.label, 5, 'bonus'); completed.push('健身（高质量）'); }
      else if (rec.fitness && rec.trainingQuality === 'partial') { add('trainingPartial', AUTO_BONUS.trainingPartial.label, 2, 'bonus'); completed.push('健身（部分完成）'); }
      else if (rec.fitness) completed.push('健身（未选质量）');
      if (GOOD.has(rec.mental)) add('mentalGood', AUTO_BONUS.mentalGood.label, 2, 'bonus');
      if (GOOD.has(rec.psych)) add('psychGood', AUTO_BONUS.psychGood.label, 2, 'bonus');
      add('onTime', AUTO_BONUS.onTime.label, 1, 'bonus');
      const sh = Number(rec.sleepHours);
      if (rec.sleepHours !== '' && rec.sleepHours != null && Number.isFinite(sh)) {
        if (sh >= 7) add('sleep7', AUTO_BONUS.sleep7.label, 2, 'bonus');
        if (sh < 5) add('sleepLow', DEDUCTIONS.sleepLow.label, -5, 'deduction');
      }
      const low = LOW_MENTAL.has(rec.mental);
      if (low && prevMentalLow) add('mentalLow2', DEDUCTIONS.mentalLow2.label, -6, 'deduction');
      prevMentalLow = low;
      // 每日减分项（手动勾选，每日最多一次；旧记录无 deductions 字段视为全部未勾选）
      const dd = rec.deductions || {};
      for (const d of MANUAL_DEDUCTIONS) {
        if (!dd[d.key]) continue;
        add(d.key, d.label, d.points, 'deduction');
        deducted.push(d.label);
      }
      if (isEarlyBirdDay(rec)) completed.push('早睡早起');
    } else if (status === 'late' || status === 'missed') {
      add('missed', status === 'late' ? '漏打卡（23:30后补录，不计加分）' : DEDUCTIONS.missed.label, -2, 'deduction');
      prevMentalLow = false;
    } else if (status === 'untracked') {
      prevMentalLow = false;
    }
    // pending：不改变 prevMentalLow（当日尚未结束）

    reps.forEach((p, i) => add('relapse', `${DEDUCTIONS.relapse.label}${reps.length > 1 ? ' #' + (i + 1) : ''}`, -10, 'deduction'));

    // 心理差 + 压力高/EM 预警（只要有记录即判定）
    if (rec && rec.psych === '差' && (rec.stress === '高' || rec.stress === 'EM')) {
      warnings.push({ type: 'mental', text: '心理状态差且压力高/EM' });
    }

    // 连续成就
    if (status === 'pending') {
      if (reps.length) stepStreak(st, 'abstinence', false);
    } else {
      const ok = status === 'ontime';
      const t = (rec && rec.tasks) || {};
      const rewards = [
        stepStreak(st, 'abstinence', ok && !!t.noMasturbation && reps.length === 0),
        stepStreak(st, 'earlyRise', ok && isEarlyBirdDay(rec)),
        stepStreak(st, 'vocab', ok && !!t.vocab),
        stepStreak(st, 'coldShower', ok && !!t.coldShower),
      ];
      stepStreak(st, 'checkin', ok);
      for (const r of rewards) if (r) {
        add('streak_' + r.key, `成就：${r.label}`, r.points, 'streak');
        result.rewards.push({ date, ...r });
      }
    }

    const net = items.reduce((s, x) => s + x.points, 0);
    total += net;
    if (total > result.maxTotal) { result.maxTotal = total; result.maxTotalDate = date; }

    if (status !== 'pending') {
      settledNets.push(net);
      const n = settledNets.length;
      if (n >= 4 && settledNets[n - 4] > settledNets[n - 3] && settledNets[n - 3] > settledNets[n - 2] && settledNets[n - 2] > settledNets[n - 1]) {
        warnings.push({ type: 'decline', text: '净积分已连续三天下降' });
      }
    }

    result.days.push({
      date, status, record: rec, reports: reps, items, net, total, warnings, completed, deducted,
      streakSnapshot: {
        abstinence: st.abstinence.run, earlyRise: st.earlyRise.run, vocab: st.vocab.run, coldShower: st.coldShower.run, checkin: st.checkin.run,
      },
    });
  }
  result.total = total;
  return result;
}

// 异常节点：预警、大额扣分、成就奖励（里程碑解锁日期由调用方合并）
export function anomalies(ledger) {
  const out = [];
  for (const d of ledger.days) {
    for (const w of d.warnings) out.push({ date: d.date, kind: 'warning', text: w.text });
    const bigDeduct = d.items.filter((i) => i.points <= -5);
    if (d.net <= -5 || bigDeduct.length) {
      out.push({ date: d.date, kind: 'deduction', text: `大额扣分：当日净分 ${d.net}` + (bigDeduct.length ? `（${bigDeduct.map((i) => i.label + ' ' + i.points).join('；')}）` : '') });
    }
    for (const i of d.items) if (i.type === 'streak') out.push({ date: d.date, kind: 'reward', text: `${i.label} +${i.points}` });
  }
  return out;
}
