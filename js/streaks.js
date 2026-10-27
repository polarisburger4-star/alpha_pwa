// 连续成就的纯函数状态机
import { STREAKS, EARLY_BED_BEFORE, EARLY_WAKE_BY } from './rules.js';
import { timeToMin } from './dateutil.js';

// 早睡早起判定：入睡 12:00–23:29 视为早睡（00:00–11:59 视为凌晨后入睡=晚睡）；起床 ≤ 07:30
export function isEarlyBed(bed) {
  const m = timeToMin(bed);
  if (m == null) return false;
  return m >= 12 * 60 && m < EARLY_BED_BEFORE;
}
export function isEarlyWake(wake) {
  const m = timeToMin(wake);
  if (m == null) return false;
  return m <= EARLY_WAKE_BY;
}
export function isEarlyBirdDay(rec) {
  return !!rec && isEarlyBed(rec.bedTime) && isEarlyWake(rec.wakeTime);
}

export function newStreakState() {
  return {
    abstinence: { run: 0, cycle: 0, best: 0 },
    earlyRise: { run: 0, cycle: 0, best: 0 },
    vocab: { run: 0, cycle: 0, best: 0 },
    coldShower: { run: 0, cycle: 0, best: 0 },
    checkin: { run: 0, cycle: 0, best: 0 },
  };
}

// 推进一个连续项。qualified=true 计数+1并返回本日奖励（若有）；false 则清零
export function stepStreak(state, key, qualified) {
  const s = state[key];
  if (!qualified) { s.run = 0; s.cycle = 0; return null; }
  s.run += 1;
  s.best = Math.max(s.best, s.run);
  const def = STREAKS[key];
  if (!def) { s.cycle = s.run; return null; }
  if (def.cycle) {
    // 超过周期后重新计数：第31天计为新周期第1天
    s.cycle = s.cycle >= def.cycle ? 1 : s.cycle + 1;
  } else {
    s.cycle = s.run; // 不重置，持续累计：每个节点每轮连续只奖励一次
  }
  const pts = def.rewards[s.cycle];
  if (pts) return { key, days: s.cycle, run: s.run, points: pts, label: `${def.label}连续${s.cycle}天` };
  return null;
}
