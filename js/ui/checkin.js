// 今日打卡
import { $, $$, esc, toast, signed, cls } from './dom.js';
import { showModal } from './modal.js';
import { put } from '../db.js';
import { ymd, fmtDateTime, cutoffOf, weekdayCn, calcSleepHours } from '../dateutil.js';
import { LEVELS, STRESS_LEVELS, TASKS, MANUAL_DEDUCTIONS, CUTOFF } from '../rules.js';
import { computeLedger, isOnTime } from '../scoring.js';
import { isEarlyBirdDay } from '../streaks.js';

const seg = (name, opts, val, danger = false) => `<div class="seg ${danger ? 'danger' : ''}" role="radiogroup">${opts.map((o) =>
  `<label><input type="radio" name="${name}" value="${esc(o)}" ${val === o ? 'checked' : ''}><span>${esc(o)}</span></label>`).join('')}</div>`;

function blank(date) {
  return { date, mental: '', psych: '', stress: '', sleepHours: '', bedTime: '', wakeTime: '', fitness: false,
    trainingQuality: null, trainingNote: '', note: '', tasks: {}, deductions: {} };
}

function statusHtml(date, rec, today) {
  const now = new Date();
  const cut = cutoffOf(date, CUTOFF.h, CUTOFF.m);
  if (rec) {
    const n = Math.max(0, (rec.history || []).length - 1);
    if (isOnTime(rec)) return `<div class="status ok">已按时打卡（首次 ${esc(fmtDateTime(rec.created_at))}）${n ? ` · 已修改 ${n} 次，最后 ${esc(fmtDateTime(rec.updated_at))}` : ''}。可随时修改、增补，保存后自动重算积分。</div>`;
    return `<div class="status bad">该日记录首次创建于 ${esc(fmtDateTime(rec.created_at))}，晚于 23:30 截止：当日按<b>漏打卡</b>计分（-2，不计加分），记录仅存档。</div>`;
  }
  if (date === today && now < cut) {
    const mins = Math.floor((cut - now) / 60000);
    return `<div class="status warn">今日尚未打卡 · 距 23:30 截止还剩 ${Math.floor(mins / 60)} 小时 ${mins % 60} 分。</div>`;
  }
  return `<div class="status bad">已过该日 23:30 截止：现在提交将按<b>漏打卡</b>计分（-2，不计加分），记录仅存档。</div>`;
}

export function render(el, ctx) {
  const { state } = ctx;
  const today = ymd();
  let date = ctx.params.date && ctx.params.date <= today ? ctx.params.date : today;
  const rec = state.data.records.find((r) => r.date === date) || null;
  const reps = state.data.reports.filter((p) => p.date === date);
  const r = rec ? structuredClone(rec) : blank(date);
  r.tasks = r.tasks || {};
  r.deductions = r.deductions || {}; // 旧记录无此字段，视为未勾选
  const hasRelapse = reps.length > 0;

  el.innerHTML = `
  <div class="row" style="justify-content:space-between;margin-bottom:10px">
    <h2 style="margin:0">${date === today ? '今日打卡' : '编辑打卡'} · <span class="mono">${date}</span> <span class="muted">${weekdayCn(date)}</span></h2>
    <input type="date" id="ciDate" value="${date}" max="${today}" style="width:auto">
  </div>
  ${statusHtml(date, rec, today)}
  ${hasRelapse ? `<div class="status bad">当日已有 ${reps.length} 份破戒申报（每份 -10），「当天没有手淫」已自动取消并锁定。</div>` : ''}
  <form id="ciForm" autocomplete="off">
    <div class="card">
      <div class="field"><span class="label">精神状态 *</span>${seg('mental', LEVELS, r.mental)}</div>
      <div class="field"><span class="label">心理状态 *</span>${seg('psych', LEVELS, r.psych)}</div>
      <div class="field" style="margin-bottom:0"><span class="label">压力表现 *</span>${seg('stress', STRESS_LEVELS, r.stress, true)}</div>
    </div>
    <div class="card">
      <div class="grid3">
        <div class="field"><label for="sleepHours">睡眠时长（小时）</label><input type="number" id="sleepHours" name="sleepHours" min="0" max="24" step="0.1" inputmode="decimal" value="${esc(r.sleepHours)}"><div class="hint" id="sleepAutoHint" hidden>已根据入睡/起床时间自动计算，可手动修改</div></div>
        <div class="field"><label for="bedTime">入睡时间（选填）</label><input type="time" id="bedTime" name="bedTime" value="${esc(r.bedTime)}"></div>
        <div class="field"><label for="wakeTime">起床时间（选填）</label><input type="time" id="wakeTime" name="wakeTime" value="${esc(r.wakeTime)}"></div>
      </div>
      <div class="hint" id="earlyHint"></div>
    </div>
    <div class="card">
      <label class="check" style="border:1px solid var(--line);border-radius:4px"><input type="checkbox" name="fitness" id="fitness" ${r.fitness ? 'checked' : ''}><b>健身打卡</b></label>
      <div id="fitBox" ${r.fitness ? '' : 'hidden'} style="margin-top:12px">
        <div class="field"><span class="label">训练质量 *</span>${seg('trainingQuality', ['高质量', '部分完成'], r.trainingQuality === 'high' ? '高质量' : r.trainingQuality === 'partial' ? '部分完成' : '')}</div>
        <div class="field" style="margin-bottom:0"><label for="trainingNote">训练备注</label><textarea id="trainingNote" name="trainingNote" placeholder="动作、组数、感受…">${esc(r.trainingNote)}</textarea></div>
      </div>
    </div>
    <div class="card">
      <h3>每日任务</h3>
      <div class="checks">
        ${TASKS.map((t) => {
          const dis = t.key === 'noMasturbation' && hasRelapse;
          const on = !dis && !!r.tasks[t.key];
          return `<label class="check ${dis ? 'disabled' : ''} ${on ? 'on' : ''}"><input type="checkbox" name="task_${t.key}" ${on ? 'checked' : ''} ${dis ? 'disabled' : ''}><span>${esc(t.label)}</span><span class="pts">+${t.points}</span></label>`;
        }).join('')}
      </div>
      <h3 style="margin-top:14px">自动结算</h3>
      <div class="checks" id="autoList"></div>
    </div>
    <div class="card danger">
      <h3>今日减分项 <span class="muted" style="font-size:12px;font-weight:400">如实勾选，每项每日最多一次</span></h3>
      <div class="checks deductions">
        ${MANUAL_DEDUCTIONS.map((d) => {
          const on = !!r.deductions[d.key];
          return `<label class="check ded ${on ? 'on' : ''}"><input type="checkbox" name="ded_${d.key}" ${on ? 'checked' : ''}><span>${esc(d.label)}</span><span class="pts">${d.points}</span></label>`;
        }).join('')}
      </div>
    </div>
    <div class="card">
      <div class="field" style="margin-bottom:0"><label for="note">通用备注</label><textarea id="note" name="note" placeholder="今日复盘、想法…">${esc(r.note)}</textarea></div>
    </div>
    ${rec && (rec.history || []).length ? `<div class="card"><h3>编辑时间线</h3><ul class="list">${rec.history.map((h, i) => `<li><span class="d">${esc(fmtDateTime(h))}</span><span>${i === 0 ? '首次创建' : '修改 #' + i}</span></li>`).join('')}</ul></div>` : ''}
    <div class="savebar">
      <div class="row" style="justify-content:space-between;margin-bottom:8px;font-size:13px"><span class="muted">预计当日净分</span><span class="mono" id="preview">—</span></div>
      <button type="submit" class="btn primary block">${rec ? '保存修改' : '提交打卡'}</button>
    </div>
  </form>`;

  const form = $('#ciForm', el);
  $('#ciDate', el).onchange = (e) => { if (e.target.value) ctx.go('checkin', { date: e.target.value }); };

  function readForm() {
    const fd = new FormData(form);
    const tq = fd.get('trainingQuality');
    const out = {
      date,
      mental: fd.get('mental') || '', psych: fd.get('psych') || '', stress: fd.get('stress') || '',
      sleepHours: fd.get('sleepHours') === '' ? '' : Number(fd.get('sleepHours')),
      bedTime: fd.get('bedTime') || '', wakeTime: fd.get('wakeTime') || '',
      fitness: !!fd.get('fitness'),
      trainingQuality: tq === '高质量' ? 'high' : tq === '部分完成' ? 'partial' : null,
      trainingNote: (fd.get('trainingNote') || '').trim(),
      note: (fd.get('note') || '').trim(),
      tasks: {},
    };
    for (const t of TASKS) out.tasks[t.key] = !!fd.get('task_' + t.key);
    out.deductions = {};
    for (const d of MANUAL_DEDUCTIONS) out.deductions[d.key] = !!fd.get('ded_' + d.key);
    if (hasRelapse) out.tasks.noMasturbation = false;
    if (!out.fitness) out.trainingQuality = null;
    return out;
  }

  function draftRecord() {
    const now = new Date().toISOString();
    const f = readForm();
    return { ...(rec || {}), ...f, created_at: rec ? rec.created_at : now, updated_at: now, history: [...((rec && rec.history) || []), now] };
  }

  function updateLive() {
    const d = draftRecord();
    $('#fitBox', el).hidden = !d.fitness;
    $$('.check', el).forEach((c) => { const i = c.querySelector('input'); if (i) c.classList.toggle('on', i.checked && !i.disabled); });
    const eb = isEarlyBirdDay(d);
    $('#earlyHint', el).innerHTML = d.bedTime && d.wakeTime
      ? (eb ? '<span class="pos">✓ 早睡早起达成</span>（入睡早于 23:30 且 07:30 前起床）' : '<span class="neg">✗ 未达成早睡早起</span>（入睡须早于 23:30，凌晨入睡视为晚睡；起床须 ≤ 07:30）')
      : '早睡早起：入睡早于 23:30 且起床不晚于 07:30（填写两个时间后判定）';
    const recs = state.data.records.filter((x) => x.date !== date).concat([d]);
    const L = computeLedger({ records: recs, reports: state.data.reports, now: new Date() });
    const day = L.days.find((x) => x.date === date);
    const autos = (day ? day.items : []).filter((i) => !TASKS.some((t) => t.key === i.key) && !MANUAL_DEDUCTIONS.some((d) => d.key === i.key));
    $('#autoList', el).innerHTML = autos.length
      ? autos.map((i) => `<div class="check auto"><span class="tag">自动</span><span>${esc(i.label)}</span><span class="pts ${cls(i.points)}">${signed(i.points)}</span></div>`).join('')
      : '<div class="check auto"><span class="muted">暂无</span></div>';
    $('#preview', el).innerHTML = day ? `<span class="${cls(day.net)}">${signed(day.net)}</span>` : '—';
  }
  // 睡眠时长自动计算：入睡/起床都填写时自动填入；手动修改睡眠时长后保留手动值，直到再次修改入睡/起床时间
  const sleepEl = $('#sleepHours', el), bedEl = $('#bedTime', el), wakeEl = $('#wakeTime', el), sleepHint = $('#sleepAutoHint', el);
  let lastTimes = bedEl.value + '|' + wakeEl.value;
  {
    const c = calcSleepHours(bedEl.value, wakeEl.value);
    sleepHint.hidden = !(c != null && sleepEl.value !== '' && Number(sleepEl.value) === c);
  }
  const onTimeChange = () => {
    const key = bedEl.value + '|' + wakeEl.value;
    if (key === lastTimes) return;
    lastTimes = key;
    const c = calcSleepHours(bedEl.value, wakeEl.value);
    if (c == null) return;
    sleepEl.value = String(c);
    sleepHint.hidden = false;
    updateLive();
  };
  for (const t of [bedEl, wakeEl]) { t.addEventListener('input', onTimeChange); t.addEventListener('change', onTimeChange); }
  sleepEl.addEventListener('input', () => { sleepHint.hidden = true; });

  form.addEventListener('input', updateLive);
  form.addEventListener('change', updateLive);
  updateLive();

  form.onsubmit = async (e) => {
    e.preventDefault();
    const d = draftRecord();
    const miss = [];
    if (!d.mental) miss.push('精神状态'); if (!d.psych) miss.push('心理状态'); if (!d.stress) miss.push('压力表现');
    if (d.fitness && !d.trainingQuality) miss.push('训练质量');
    if (miss.length) return showModal({ title: '信息不完整', body: '请填写：' + miss.join('、') });
    if (d.sleepHours !== '' && (!Number.isFinite(d.sleepHours) || d.sleepHours < 0 || d.sleepHours > 24)) return showModal({ title: '睡眠时长无效', body: '请输入 0–24 之间的小时数。' });
    await put('records', d);
    await ctx.refresh({ showMilestones: false, rerender: false });
    const day = state.ledger.days.find((x) => x.date === date);
    for (const w of (day ? day.warnings : [])) {
      if (w.type === 'mental') {
        await showModal({ tone: 'danger', title: '红色预警', body: '心理状态：差　压力：' + d.stress + '\n\n你正处于高风险状态。立即降低消耗：离开屏幕，喝水，深呼吸，散步或冲澡；今晚优先睡眠。\n若持续低落或出现危险念头，请联系信任的人或专业心理援助。', buttons: [{ label: '我已知晓', value: true, danger: true }] });
      }
      if (w.type === 'decline') {
        const i = state.ledger.days.indexOf(day);
        const nets = state.ledger.days.slice(Math.max(0, i - 3), i + 1).map((x) => signed(x.net)).join(' → ');
        await showModal({ tone: 'danger', title: '下滑预警', body: `净积分已连续三天下降：${nets}\n\n趋势正在恶化。找出失守的环节，明天先拿回最容易的分。`, buttons: [{ label: '我已知晓', value: true, danger: true }] });
      }
    }
    toast(`已保存 · 当日净分 ${day ? signed(day.net) : '—'} · 总分 ${state.ledger.total}`);
    await ctx.showPendingMilestones();
    ctx.go('checkin', { date }, true);
  };
}
