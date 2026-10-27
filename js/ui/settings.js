// 备份与设置
import { esc, toast } from './dom.js';
import { showModal, confirmModal } from './modal.js';
import { replaceAll, clearAll, setMeta } from '../db.js';
import { validateBackup, mergeData } from '../export.js';
import { exportJson } from './exportPage.js';
import { fmtDateTime, ymd, diffDays } from '../dateutil.js';
import { APP_VERSION, SCHEMA_VERSION } from '../version.js';
import { enableReminder, disableReminder, reminderSupport, testNotification } from '../reminder.js';

export function render(el, ctx) {
  const s = ctx.state.data.settings || {};
  const sup = reminderSupport();
  const last = s.lastBackupAt;
  const days = last ? diffDays(ymd(new Date(last)), ymd()) : null;
  const d = ctx.state.data;
  el.innerHTML = `
  <div class="card">
    <h3>数据备份</h3>
    <div style="margin-bottom:6px">上次备份：<b class="${days === null || days > 7 ? 'warn' : ''}">${last ? esc(fmtDateTime(last)) + `（${days} 天前）` : '从未备份'}</b></div>
    <div class="hint" style="margin-bottom:12px">所有数据仅保存在本机浏览器 IndexedDB 中，无云同步。清除浏览器数据、卸载应用或更换设备会导致数据丢失。建议至少每 7 天导出一次 JSON 备份并妥善保存。当前：${d.records.length} 条打卡、${d.reports.length} 份申报、${d.unlocked.length} 个已解锁里程碑。</div>
    <div class="row">
      <button class="btn primary" id="exp">导出 JSON 备份</button>
      <label class="btn" for="imp">导入 JSON…</label>
      <input type="file" id="imp" accept="application/json,.json" hidden>
    </div>
  </div>

  <div class="card">
    <h3>每日 19:30 打卡提醒</h3>
    <label class="switch"><input type="checkbox" id="rem" ${s.reminderEnabled && sup.permission === 'granted' ? 'checked' : ''} ${sup.notification ? '' : 'disabled'}><span>启用提醒（19:30 仍未打卡时通知）</span></label>
    <div class="hint" style="margin-top:8px">通知权限：${esc({ granted: '已授予', denied: '已拒绝（请在浏览器/系统设置中开启）', default: '未请求', unsupported: '不支持' }[sup.permission] || sup.permission)}
      · 已添加到桌面：${sup.standalone ? '是' : '否'} · 定时通知(Triggers)：${sup.triggers ? '支持' : '不支持'} · 周期后台同步：${sup.periodicSync ? '支持' : '不支持'}</div>
    <div class="status warn" style="margin-top:10px;margin-bottom:10px">限制说明：需授予通知权限、需添加到桌面；浏览器完全关闭或系统杀掉后台进程时无法触发，这是浏览器底层限制，无法做到系统原生日历/闹钟级别的强制唤醒。<br>本应用采用尽力而为策略：页面/Service Worker 存活时定时触发；浏览器支持时使用定时通知与周期后台同步；每次打开或切回应用时，若已过 19:30 且今日未打卡会立即补发提醒。如需可靠提醒，建议同时在手机系统闹钟中设置 19:30。</div>
    <button class="btn sm" id="test" ${sup.permission === 'granted' ? '' : 'disabled'}>发送测试通知</button>
  </div>

  <div class="card danger">
    <h3>清空全部数据</h3>
    <div class="hint" style="margin-bottom:12px">删除所有打卡、申报、里程碑与设置，不可恢复。操作前请先导出备份。</div>
    <button class="btn danger" id="clr">清空全部数据</button>
  </div>

  <div class="card">
    <h3>关于</h3>
    <div class="hint">从零开始阿尔法男人的修炼指南（阿尔法修炼）· 版本 ${APP_VERSION} · 数据结构版本 ${SCHEMA_VERSION}<br>纯本地离线 PWA，无账号、无服务器、无追踪。</div>
  </div>`;

  el.querySelector('#exp').onclick = () => exportJson(ctx).then(() => ctx.rerender());

  el.querySelector('#imp').onchange = async (e) => {
    const file = e.target.files[0]; e.target.value = '';
    if (!file) return;
    let obj;
    try { obj = JSON.parse(await file.text()); } catch { return showModal({ title: '导入失败', body: '文件不是有效的 JSON。', tone: 'danger' }); }
    const v = validateBackup(obj);
    if (!v.ok) return showModal({ title: '导入失败：校验未通过', body: v.errors.join('\n'), tone: 'danger' });
    const mode = await showModal({
      title: '导入备份',
      body: `备份时间：${obj.exportedAt ? fmtDateTime(obj.exportedAt) : '未知'}　版本：${obj.appVersion || '—'}\n内容：${obj.records.length} 条打卡、${obj.reports.length} 份申报、${(obj.unlocked || []).length} 个里程碑。\n\n替换：清除当前全部数据后写入备份。\n合并：同日记录保留较新的版本，申报与里程碑取并集。`,
      buttons: [{ label: '取消', value: null }, { label: '合并', value: 'merge' }, { label: '替换', value: 'replace', danger: true }],
    });
    if (!mode) return;
    if (!(await confirmModal('再次确认', mode === 'replace' ? '当前设备上的全部数据将被备份内容覆盖，确定继续？' : '确定将备份合并到当前数据？', { okLabel: '确定导入', danger: mode === 'replace' }))) return;
    const cur = ctx.state.data;
    const next = mode === 'replace'
      ? { records: obj.records, reports: obj.reports, unlocked: obj.unlocked || [] }
      : mergeData(cur, { records: obj.records, reports: obj.reports, unlocked: obj.unlocked || [] });
    await replaceAll({ ...next, settings: { ...cur.settings } });
    await ctx.refresh();
    toast(`导入完成（${mode === 'replace' ? '替换' : '合并'}）· 总分 ${ctx.state.ledger.total}`);
    ctx.rerender();
  };

  el.querySelector('#rem').onchange = async (e) => {
    try {
      if (e.target.checked) { await enableReminder(ctx.state); toast('提醒已开启'); }
      else { await disableReminder(ctx.state); toast('提醒已关闭'); }
    } catch (err) {
      await showModal({ title: '无法开启提醒', body: err.message });
    }
    ctx.rerender();
  };
  el.querySelector('#test').onclick = () => testNotification().catch((err) => toast(err.message));

  el.querySelector('#clr').onclick = async () => {
    if (!(await confirmModal('清空全部数据', '将永久删除所有数据，无法恢复。确定继续？', { okLabel: '继续', danger: true }))) return;
    if (!(await confirmModal('最后确认', '这是最后一次确认。点击「永久删除」后数据将立即清空。', { okLabel: '永久删除', danger: true }))) return;
    await clearAll();
    await setMeta('settings', {});
    await ctx.refresh();
    toast('已清空全部数据');
    ctx.rerender();
  };
}
