// 日志导出
import { esc, toast } from './dom.js';
import { ymd, addDays, mondayOf } from '../dateutil.js';
import { buildTxt, downloadTxt, downloadJson, buildBackup, weeklySnapshotsTxt, currentSnapshotTxt } from '../export.js';
import { setMeta } from '../db.js';

let weekStart = null;

export async function exportJson(ctx) {
  const s = ctx.state;
  downloadJson(`阿尔法修炼备份_${ymd()}.json`, buildBackup(s.data));
  s.data.settings = { ...s.data.settings, lastBackupAt: new Date().toISOString() };
  await setMeta('settings', s.data.settings);
  await ctx.refresh({ showMilestones: false });
  toast('JSON 备份已导出');
}

export function render(el, ctx) {
  const L = ctx.state.ledger;
  if (!weekStart) weekStart = mondayOf(ymd());
  const weekEnd = addDays(weekStart, 6);
  const inWeek = L.days.filter((d) => d.date >= weekStart && d.date <= weekEnd);
  el.innerHTML = `
  <div class="card">
    <h3>按周导出（周一至周日）</h3>
    <div class="row" style="margin-bottom:10px">
      <button class="btn sm" id="prev">‹ 上一周</button>
      <input type="date" id="pick" value="${weekStart}" style="width:auto">
      <button class="btn sm" id="next">下一周 ›</button>
    </div>
    <div class="mono" style="margin-bottom:4px">${weekStart} 至 ${weekEnd}</div>
    <div class="hint" style="margin-bottom:12px">该周有 ${inWeek.length} 天数据 · 周净分 ${inWeek.reduce((s, d) => s + d.net, 0)}</div>
    <button class="btn primary" id="wk">导出本周 TXT</button>
  </div>
  <div class="card">
    <h3>全部历史</h3>
    <div class="hint" style="margin-bottom:12px">共 ${L.days.length} 天${L.days.length ? `（${L.days[0].date} 至 ${L.days[L.days.length - 1].date}）` : ''}</div>
    <button class="btn" id="all" ${L.days.length ? '' : 'disabled'}>导出全部 TXT</button>
  </div>
  <div class="card">
    <h3>完整 JSON 备份</h3>
    <div class="hint" style="margin-bottom:12px">包含全部打卡、破戒申报、已解锁里程碑，可在「备份与设置」中导入恢复。</div>
    <button class="btn" id="json">导出 JSON 备份</button>
  </div>
  <div class="hint">TXT 采用 UTF-8（带 BOM）编码，Windows 记事本可正常显示中文。周报开头附【周初快照】与【周末快照】，全部历史开头附【当前快照】（总积分、各连续天数、已解锁里程碑）。每条记录包含：日期时间、精神/心理/压力档位、睡眠时长、入睡/起床时间、健身打卡、训练质量、健身备注、破戒申报、通用备注、完成项目、减分项目、积分收支明细。</div>`;
  const setWeek = (d) => { weekStart = mondayOf(d); ctx.rerender(); };
  el.querySelector('#prev').onclick = () => setWeek(addDays(weekStart, -7));
  el.querySelector('#next').onclick = () => setWeek(addDays(weekStart, 7));
  el.querySelector('#pick').onchange = (e) => e.target.value && setWeek(e.target.value);
  el.querySelector('#wk').onclick = () => {
    downloadTxt(`阿尔法修炼日志_周_${weekStart}至${weekEnd}.txt`, buildTxt(L, weekStart, weekEnd, `周报：${weekStart} 至 ${weekEnd}`, weeklySnapshotsTxt(L, weekStart, weekEnd, ctx.state.data.unlocked)));
    toast('已导出周日志');
  };
  el.querySelector('#all').onclick = () => {
    if (!L.days.length) return;
    downloadTxt(`阿尔法修炼日志_全部_${ymd()}.txt`, buildTxt(L, L.days[0].date, L.days[L.days.length - 1].date, '全部历史', currentSnapshotTxt(L, ctx.state.data.unlocked)));
    toast('已导出全部日志');
  };
  el.querySelector('#json').onclick = () => exportJson(ctx);
}
