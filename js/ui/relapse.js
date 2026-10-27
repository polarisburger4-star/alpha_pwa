// 破戒申报
import { esc, toast } from './dom.js';
import { confirmModal } from './modal.js';
import { put, del, uid } from '../db.js';
import { ymd, fmtDateTime } from '../dateutil.js';
import { QUICK_PICKS } from '../rules.js';

const field = (id, label, picks) => `<div class="field"><label for="${id}">${label}</label>
  <input type="text" id="${id}" name="${id}" maxlength="40" placeholder="可直接输入，或点选下方快捷项">
  <div class="chips">${picks.map((p) => `<button type="button" class="chip" data-for="${id}">${esc(p)}</button>`).join('')}</div></div>`;

export function render(el, ctx) {
  const today = ymd();
  const reps = ctx.state.data.reports.slice().sort((a, b) => (b.date + b.created_at).localeCompare(a.date + a.created_at));
  el.innerHTML = `
  <div class="status bad">如实申报。每提交一份申报自动扣 10 分（同日多份逐份扣分），当日「当天没有手淫」自动取消，克制连续清零。</div>
  <form class="card danger" id="rf" autocomplete="off">
    <div class="field"><label for="date">日期</label><input type="date" id="date" name="date" value="${today}" max="${today}" required></div>
    ${field('period', '破戒时段', QUICK_PICKS.period)}
    ${field('medium', '自慰媒介', QUICK_PICKS.medium)}
    ${field('trigger', '诱因', QUICK_PICKS.trigger)}
    <div class="field"><span class="label">事后身体有无不适</span>
      <div class="seg" style="max-width:200px"><label><input type="radio" name="discomfort" value="无" checked><span>无</span></label><label><input type="radio" name="discomfort" value="有"><span>有</span></label></div>
      <input type="text" name="discomfortDesc" id="dd" placeholder="不适描述（可选）" style="margin-top:8px" hidden maxlength="200"></div>
    <div class="field"><label for="note2">其他备注信息</label><textarea id="note2" name="note" maxlength="2000"></textarea></div>
    <button class="btn danger block" type="submit">提交破戒申报（-10）</button>
  </form>
  <h2 style="margin-top:18px">申报记录 <span class="muted" style="font-size:13px;font-weight:400">共 ${reps.length} 份</span></h2>
  ${reps.length ? reps.map((p) => `<div class="day"><div class="day-h"><span class="date">${p.date}</span><span class="badge missed">-10</span><span class="muted" style="font-size:12px">提交于 ${esc(fmtDateTime(p.created_at))}</span><button class="btn sm ghost" style="margin-left:auto" data-del="${esc(p.id)}">删除</button></div>
    <div class="day-b"><dl class="kv"><dt>时段</dt><dd>${esc(p.period || '—')}</dd><dt>媒介</dt><dd>${esc(p.medium || '—')}</dd><dt>诱因</dt><dd>${esc(p.trigger || '—')}</dd>
    <dt>事后不适</dt><dd>${esc(p.discomfort || '—')}${p.discomfortDesc ? '：' + esc(p.discomfortDesc) : ''}</dd>${p.note ? `<dt>备注</dt><dd>${esc(p.note)}</dd>` : ''}</dl></div></div>`).join('') : '<div class="card muted">暂无申报。</div>'}`;

  const form = el.querySelector('#rf');
  el.querySelectorAll('.chip').forEach((c) => { c.onclick = () => { el.querySelector('#' + c.dataset.for).value = c.textContent; }; });
  form.addEventListener('change', () => { el.querySelector('#dd').hidden = form.discomfort.value !== '有'; });
  form.onsubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const date = fd.get('date');
    if (!date || date > today) return toast('日期无效');
    const ok = await confirmModal('确认提交破戒申报', `日期：${date}\n提交后立即扣 10 分，当日「当天没有手淫」取消，克制连续清零。`, { okLabel: '确认提交', danger: true });
    if (!ok) return;
    const now = new Date().toISOString();
    const rep = {
      id: uid(), date, created_at: now,
      period: String(fd.get('period') || '').trim(), medium: String(fd.get('medium') || '').trim(), trigger: String(fd.get('trigger') || '').trim(),
      discomfort: fd.get('discomfort') || '无', discomfortDesc: fd.get('discomfort') === '有' ? String(fd.get('discomfortDesc') || '').trim() : '',
      note: String(fd.get('note') || '').trim(),
    };
    await put('reports', rep);
    // 同步取消当日记录中的「当天没有手淫」
    const rec = ctx.state.data.records.find((r) => r.date === date);
    if (rec && rec.tasks && rec.tasks.noMasturbation) await put('records', { ...rec, tasks: { ...rec.tasks, noMasturbation: false } });
    await ctx.refresh();
    toast(`已申报 · -10 · 总分 ${ctx.state.ledger.total}`);
    ctx.rerender();
  };
  el.querySelectorAll('[data-del]').forEach((b) => {
    b.onclick = async () => {
      if (!(await confirmModal('删除申报', '删除后将撤销该份申报的 -10 扣分并重算积分。\n注意：当日「当天没有手淫」不会自动恢复勾选，如属实请到打卡页手动勾选。', { okLabel: '删除', danger: true }))) return;
      await del('reports', b.dataset.del);
      await ctx.refresh();
      toast('已删除');
      ctx.rerender();
    };
  });
}
