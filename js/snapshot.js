// 快照：基于同一确定性账本，计算“截至某日结束时”的状态（总积分、各连续天数、已解锁里程碑）
import { ymd } from './dateutil.js';
import { reachedMilestones, allMilestones } from './milestones.js';

/**
 * @param {object} ledger computeLedger 的结果（账本逐日确定，过去某日的条目即该日结束时的状态）
 * @param {string} date YYYY-MM-DD；晚于账本 today 时按 today（截至当前）计算
 * @param {Array} unlocked 已存储的解锁记录 [{id,date}]（可选，与账本推导结果合并，取较早日期）
 */
export function snapshotAsOf(ledger, date, unlocked = []) {
  const today = ledger.today || ymd();
  const asOf = date > today ? today : date;
  const ongoing = asOf === today; // 今日尚未结束
  let day = null;
  for (const d of ledger.days) { if (d.date <= asOf) day = d; else break; }
  const ss = day ? day.streakSnapshot : { abstinence: 0, earlyRise: 0, vocab: 0, coldShower: 0, checkin: 0 };
  const byId = new Map();
  for (const m of reachedMilestones(ledger)) if (m.date <= asOf) byId.set(m.id, { id: m.id, date: m.date });
  for (const u of unlocked || []) {
    if (!u || !u.id || !u.date || u.date > asOf) continue;
    const a = byId.get(u.id);
    if (!a || String(u.date) < String(a.date)) byId.set(u.id, { id: u.id, date: u.date });
  }
  const defs = allMilestones();
  const milestones = defs.filter((m) => byId.has(m.id)).map((m) => ({
    id: m.id, name: m.heading + (m.title ? `「${m.title}」` : ''), date: byId.get(m.id).date,
  })).sort((a, b) => a.date.localeCompare(b.date)); // 稳定排序：同日按配置顺序
  return {
    date: asOf, requested: date, ongoing,
    total: day ? day.total : 0,
    abstinence: ss.abstinence, vocab: ss.vocab, coldShower: ss.coldShower || 0, earlyRise: ss.earlyRise, checkin: ss.checkin,
    milestones,
  };
}
