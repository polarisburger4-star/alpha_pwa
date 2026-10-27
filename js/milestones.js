// 里程碑判定（纯函数）
import { SCORE_MILESTONES, ABSTINENCE_MILESTONES, scoreLine2, abstinenceLine2 } from './milestones-config.js';

export function allMilestones() {
  return [
    ...SCORE_MILESTONES.map((m) => ({ ...m, type: 'score', heading: `总积分 ${m.score}`, line2: scoreLine2(m) })),
    ...ABSTINENCE_MILESTONES.map((m) => ({ ...m, type: 'abstinence', heading: `克制手淫 ${m.days} 天`, line2: abstinenceLine2(m) })),
  ];
}

// 返回账本中每个里程碑首次达成的日期
export function reachedMilestones(ledger) {
  const out = [];
  for (const m of allMilestones()) {
    const day = ledger.days.find((d) =>
      m.type === 'score' ? d.total >= m.score : d.streakSnapshot.abstinence >= m.days);
    if (day) out.push({ ...m, date: day.date });
  }
  return out;
}

// unlocked: [{id, date, unlockedAt}]；只返回从未解锁过的
export function newUnlocks(ledger, unlocked = []) {
  const have = new Set(unlocked.map((u) => u.id));
  return reachedMilestones(ledger).filter((m) => !have.has(m.id));
}

export function nextScoreMilestone(total) {
  const next = SCORE_MILESTONES.find((m) => m.score > total) || null;
  const idx = next ? SCORE_MILESTONES.indexOf(next) : -1;
  const prevScore = idx > 0 ? SCORE_MILESTONES[idx - 1].score : 0;
  return next ? { next, prevScore, remain: next.score - total, pct: Math.max(0, Math.min(100, ((total - prevScore) / (next.score - prevScore)) * 100)) } : null;
}

export function nextAbstinenceMilestone(run) {
  const next = ABSTINENCE_MILESTONES.find((m) => m.days > run) || null;
  const idx = next ? ABSTINENCE_MILESTONES.indexOf(next) : -1;
  const prev = idx > 0 ? ABSTINENCE_MILESTONES[idx - 1].days : 0;
  return next ? { next, remain: next.days - run, pct: Math.max(0, Math.min(100, ((run - prev) / (next.days - prev)) * 100)) } : null;
}
