// 数据统计
import { $, esc, signed, cls } from './dom.js';
import { ymd, addDays, dateRange } from '../dateutil.js';
import { LEVEL_VALUE, STRESS_VALUE } from '../rules.js';
import { anomalies } from '../scoring.js';
import { allMilestones, nextScoreMilestone, nextAbstinenceMilestone } from '../milestones.js';
import { lineChart, barChart, pieChart } from '../charts.js';

let range = 7;
const KIND = { warning: '预警', deduction: '扣分', reward: '成就', milestone: '里程碑' };

function countBy(reports, key) {
  const m = new Map();
  for (const p of reports) { const k = String(p[key] || '').trim() || '未填写'; m.set(k, (m.get(k) || 0) + 1); }
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
}

export function render(el, ctx) {
  const { state } = ctx;
  const L = state.ledger;
  const today = ymd();
  const st = L.streaks;
  const ms = allMilestones();
  const unlocked = state.data.unlocked.map((u) => ({ ...u, m: ms.find((x) => x.id === u.id) })).filter((u) => u.m)
    .sort((a, b) => String(a.date).localeCompare(String(b.date)));
  const ns = nextScoreMilestone(L.total);
  const na = nextAbstinenceMilestone(st.abstinence.run);

  const anoms = anomalies(L).concat(unlocked.map((u) => ({ date: u.date, kind: 'milestone', text: `${u.m.heading}：${u.m.line2}` })))
    .sort((a, b) => b.date.localeCompare(a.date));
  const from = addDays(today, -(range - 1));
  const dates = dateRange(from, today);
  const byDate = new Map(L.days.map((d) => [d.date, d]));
  const marks = new Set(anoms.filter((a) => a.date >= from).map((a) => a.date));
  const recOf = (d) => (byDate.get(d) || {}).record || null;
  const hasFitness = dates.some((d) => recOf(d) && recOf(d).fitness);
  const reps = state.data.reports;

  el.innerHTML = `
  <div class="grid3">
    <div class="stat"><div class="k">当前总积分</div><div class="v ${L.total < 0 ? 'neg' : ''}">${L.total}</div></div>
    <div class="stat"><div class="k">历史最高分</div><div class="v">${L.maxTotal}<small>${L.maxTotalDate ? L.maxTotalDate.slice(5) : ''}</small></div></div>
    <div class="stat"><div class="k">手淫连续克制</div><div class="v">${st.abstinence.run}<small>天</small></div></div>
    <div class="stat"><div class="k">背单词连续</div><div class="v">${st.vocab.run}<small>天</small></div></div>
    <div class="stat"><div class="k">洗冷水澡连续</div><div class="v">${st.coldShower.run}<small>天</small></div></div>
    <div class="stat"><div class="k">连续打卡</div><div class="v">${st.checkin.run}<small>天</small></div></div>
    <div class="stat"><div class="k">早睡早起连续</div><div class="v">${st.earlyRise.run}<small>天</small></div></div>
  </div>
  <div class="hint" style="margin-top:6px">连续天数均为真实累计天数，不设 30 天重置；各连续奖励节点在一轮不间断的连续中只奖励一次，中断后清零重新开始。</div>

  <div class="card" style="margin-top:12px">
    <h3>积分里程碑</h3>
    ${ns ? `<div class="row" style="justify-content:space-between"><span>下一节点：<b>${ns.next.score}</b> · ${esc(ns.next.title)}</span><span class="mono">还差 <b>${ns.remain}</b> 分</span></div>
      <div class="bar"><i style="width:${ns.pct.toFixed(1)}%"></i></div>` : '<div>全部积分里程碑已达成。</div>'}
    <h3 style="margin-top:14px">克制里程碑</h3>
    ${na ? `<div class="row" style="justify-content:space-between"><span>下一节点：<b>${na.next.days} 天</b></span><span class="mono">还差 <b>${na.remain}</b> 天</span></div>
      <div class="bar red"><i style="width:${na.pct.toFixed(1)}%"></i></div>` : '<div>已完成全部克制里程碑。</div>'}
    <h3 style="margin-top:14px">已解锁（${unlocked.length}）</h3>
    ${unlocked.length ? `<ul class="list">${unlocked.map((u) => `<li><span class="d">${esc(u.date)}</span><span><b>${esc(u.m.heading)}</b>　${esc(u.m.line2)}</span></li>`).join('')}</ul>` : '<div class="muted">尚未解锁任何里程碑。</div>'}
  </div>

  <div class="row" style="justify-content:space-between;margin:16px 0 10px">
    <h2 style="margin:0">趋势</h2>
    <div class="seg" style="width:160px">
      <label><input type="radio" name="rg" value="7" ${range === 7 ? 'checked' : ''}><span>近7天</span></label>
      <label><input type="radio" name="rg" value="30" ${range === 30 ? 'checked' : ''}><span>近30天</span></label>
    </div>
  </div>
  <div class="hint" style="margin:-4px 0 10px">红色大点、红/琥珀色柱 = 异常节点（预警、大额扣分、成就奖励、里程碑解锁）。档位：1=差/轻 … 4=优秀/EM。</div>
  <div class="card"><h3>每日净分</h3><div class="chart-box"><canvas id="cNet"></canvas></div></div>
  <div class="card"><h3>精神 / 心理 / 压力</h3><div class="chart-box"><canvas id="cLv"></canvas></div></div>
  <div class="card"><h3>睡眠时长（小时）</h3><div class="chart-box"><canvas id="cSleep"></canvas></div></div>
  ${hasFitness ? '<div class="card"><h3>训练质量（2=高质量，1=部分完成）</h3><div class="chart-box"><canvas id="cFit"></canvas></div></div>' : ''}

  <div class="card"><h3>异常节点</h3>
    ${anoms.length ? `<ul class="list">${anoms.slice(0, 80).map((a) => `<li><span class="d">${esc(a.date)}</span><span class="kind ${a.kind}">${KIND[a.kind]}</span><span>${esc(a.text)}</span></li>`).join('')}</ul>` : '<div class="muted">暂无。</div>'}
  </div>

  <h2 style="margin-top:16px">破戒统计 <span class="muted" style="font-size:13px;font-weight:400">共 ${reps.length} 次</span></h2>
  ${reps.length ? `<div class="grid2" style="grid-template-columns:repeat(auto-fit,minmax(260px,1fr))">
    <div class="card"><h3>自慰媒介</h3><div class="chart-box pie"><canvas id="pMedium"></canvas></div></div>
    <div class="card"><h3>破戒时段</h3><div class="chart-box pie"><canvas id="pPeriod"></canvas></div></div>
    <div class="card"><h3>诱因</h3><div class="chart-box pie"><canvas id="pTrigger"></canvas></div></div>
  </div>` : '<div class="card muted">暂无破戒申报。</div>'}
  `;

  el.querySelectorAll('input[name=rg]').forEach((i) => { i.onchange = () => { range = Number(i.value); ctx.rerender(); }; });

  const charts = [];
  const val = (d, f) => { const r = recOf(d); return r ? f(r) : null; };
  charts.push(barChart($('#cNet', el), dates, dates.map((d) => (byDate.get(d) ? byDate.get(d).net : null)), { marks }));
  charts.push(lineChart($('#cLv', el), dates, [
    { label: '精神', data: dates.map((d) => val(d, (r) => LEVEL_VALUE[r.mental] ?? null)) },
    { label: '心理', data: dates.map((d) => val(d, (r) => LEVEL_VALUE[r.psych] ?? null)), borderDash: [4, 3] },
    { label: '压力', data: dates.map((d) => val(d, (r) => STRESS_VALUE[r.stress] ?? null)) },
  ], { yMin: 1, yMax: 4, yTicks: { 1: '1', 2: '2', 3: '3', 4: '4' }, marks }));
  charts.push(lineChart($('#cSleep', el), dates, [
    { label: '睡眠', data: dates.map((d) => val(d, (r) => (r.sleepHours === '' || r.sleepHours == null ? null : Number(r.sleepHours)))) },
  ], { yMin: 0, marks }));
  if (hasFitness) charts.push(lineChart($('#cFit', el), dates, [
    { label: '训练质量', data: dates.map((d) => val(d, (r) => (r.fitness ? (r.trainingQuality === 'high' ? 2 : r.trainingQuality === 'partial' ? 1 : null) : null))), showLine: false, pointRadius: 5 },
  ], { yMin: 0, yMax: 2, yTicks: { 0: '', 1: '部分', 2: '高质量' } }));
  if (reps.length) {
    for (const [id, key] of [['pMedium', 'medium'], ['pPeriod', 'period'], ['pTrigger', 'trigger']]) {
      const c = countBy(reps, key);
      charts.push(pieChart($('#' + id, el), c.map((x) => x[0]), c.map((x) => x[1])));
    }
  }
  return () => charts.forEach((c) => c && c.destroy());
}
