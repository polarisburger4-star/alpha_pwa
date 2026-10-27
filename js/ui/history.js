// 历史记录
import { esc, signed, cls } from './dom.js';
import { fmtDateTime, weekdayCn } from '../dateutil.js';
import { STATUS_LABEL } from '../scoring.js';
import { TRAINING } from '../rules.js';

const PAGE = 30;
let shown = PAGE;

export function dayCard(d) {
  const r = d.record;
  const kv = [];
  if (r) {
    kv.push(['精神/心理/压力', `${r.mental || '—'} / ${r.psych || '—'} / ${r.stress || '—'}`]);
    kv.push(['睡眠', `${r.sleepHours !== '' && r.sleepHours != null ? r.sleepHours + ' 小时' : '—'}　入睡 ${r.bedTime || '—'}　起床 ${r.wakeTime || '—'}`]);
    kv.push(['健身', r.fitness ? `是 · ${TRAINING[r.trainingQuality] || '未选择'}${r.trainingNote ? '\n' + r.trainingNote : ''}` : '否']);
    if (r.note) kv.push(['备注', r.note]);
  }
  kv.push(['完成项目', d.completed.length ? d.completed.join('、') : '—']);
  d.reports.forEach((p, i) => kv.push([`破戒 #${i + 1}`, `${p.period || '—'} · ${p.medium || '—'} · ${p.trigger || '—'} · 不适：${p.discomfort || '—'}${p.discomfortDesc ? '（' + p.discomfortDesc + '）' : ''}${p.note ? '\n' + p.note : ''}`]));
  if (d.warnings.length) kv.push(['预警', d.warnings.map((w) => w.text).join('；')]);
  const hist = r && r.history ? r.history : [];
  return `<div class="day">
    <div class="day-h"><span class="date">${d.date}</span><span class="muted">${weekdayCn(d.date)}</span>
      <span class="badge ${d.status}">${STATUS_LABEL[d.status]}</span>
      ${d.warnings.length ? '<span class="badge missed">预警</span>' : ''}
      <span class="net ${cls(d.net)}">${signed(d.net)}</span><span class="mono muted" style="font-size:12px">累计 ${d.total}</span></div>
    <div class="day-b">
      <dl class="kv">${kv.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl>
      <details><summary>积分明细（${d.items.length} 项）</summary>
        <table class="ledger">${d.items.length ? d.items.map((i) => `<tr><td>${esc(i.label)}</td><td class="${cls(i.points)}">${signed(i.points)}</td></tr>`).join('') : '<tr><td class="muted">无</td><td></td></tr>'}</table>
      </details>
      ${hist.length ? `<details><summary>编辑时间线（${hist.length}）</summary><ul class="list">${hist.map((h, i) => `<li><span class="d">${esc(fmtDateTime(h))}</span><span>${i === 0 ? '首次创建' : '修改 #' + i}</span></li>`).join('')}</ul></details>` : ''}
      <div class="row" style="margin-top:10px"><a class="btn sm" href="#checkin?date=${d.date}">${r ? '编辑' : d.status === 'pending' ? '去打卡' : '补录（按漏打卡计）'}</a></div>
    </div></div>`;
}

export function render(el, ctx) {
  const days = ctx.state.ledger.days.slice().reverse();
  if (!days.length) { el.innerHTML = '<div class="card muted">暂无记录。完成第一次打卡后，这里将按时间倒序显示每日详情。</div>'; return; }
  const list = days.slice(0, shown);
  el.innerHTML = `<h2>历史记录 <span class="muted" style="font-size:13px;font-weight:400">共 ${days.length} 天 · 总分 ${ctx.state.ledger.total}</span></h2>
    ${list.map(dayCard).join('')}
    ${days.length > shown ? '<button class="btn block" id="more">加载更多</button>' : ''}`;
  const more = el.querySelector('#more');
  if (more) more.onclick = () => { shown += PAGE; ctx.rerender(); };
}
