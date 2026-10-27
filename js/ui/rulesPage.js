// 积分规则（只读，由 rules.js 与 milestones-config.js 生成）
import { esc } from './dom.js';
import { TASKS, AUTO_BONUS, DEDUCTIONS, MANUAL_DEDUCTIONS, STREAKS } from '../rules.js';
import { SCORE_MILESTONES, ABSTINENCE_MILESTONES, scoreLine2, abstinenceLine2 } from '../milestones-config.js';

const tbl = (head, rows) => `<table><tr>${head.map((h) => `<th>${h}</th>`).join('')}</tr>${rows.map((r) => `<tr>${r.map((c, i) => `<td class="${i === r.length - 1 && /^[+-]?\d/.test(String(c)) ? 'n' : ''}">${c}</td>`).join('')}</tr>`).join('')}</table>`;

export function render(el) {
  const streakRows = Object.values(STREAKS).flatMap((s) => Object.entries(s.rewards).map(([d, p]) => [esc(s.label), `连续 ${d} 天`, '+' + p]));
  el.innerHTML = `<div class="prose">
  <div class="card"><h3>一、每日加分（手动勾选）</h3>${tbl(['项目', '分值'], TASKS.map((t) => [esc(t.label), '+' + t.points]))}</div>
  <div class="card"><h3>二、每日加分（自动结算）</h3>${tbl(['项目', '分值'], [
    ['健身打卡 · 训练质量高质量', '+5'], ['健身打卡 · 训练质量部分完成', '+2'],
    ['精神状态为良好或优秀', '+2'], ['心理状态为良好或优秀', '+2'], ['按时打卡（23:30 前首次创建当日记录）', '+1'], ['睡眠时长 ≥ 7 小时', '+2']])}
    <p class="muted">训练只分「高质量 / 部分完成」两档，不做 1–10 量化；未勾选健身打卡则不计训练分。</p></div>
  <div class="card"><h3>三、扣分（自动）</h3>${tbl(['项目', '分值'], [
    ['手淫：每提交一份破戒申报（同日多份分别扣分）', '-10'], ['漏打卡（当日 23:30 前无记录）', '-2'], ['睡眠时长 < 5 小时', '-5'], ['精神状态连续 2 天为一般或差', '-6']])}</div>
  <div class="card"><h3>四、每日减分项（手动勾选）</h3>${tbl(['项目', '分值'], MANUAL_DEDUCTIONS.map((d) => [esc(d.label), String(d.points)]))}
    <p class="muted">在打卡页「今日减分项」中如实勾选，每项每日最多扣一次。仅按时打卡日计入；超时补录日只计 -2 及破戒扣分。</p></div>
  <div class="card"><h3>五、连续成就（自动计入总分）</h3>${tbl(['项目', '节点', '奖励'], streakRows)}
    <ul>
      <li><b>克制手淫</b>：当日按时打卡、勾选「当天没有手淫」、且当日无破戒申报，计为克制 1 天。</li>
      <li><b>早睡早起 / 背单词 / 洗冷水澡</b>：当日按时打卡且达成对应项目（早睡早起按入睡/起床时间判定；背单词、洗冷水澡按勾选），计为 1 天。洗冷水澡只有连续天数奖励，不设里程碑。</li>
      <li><b>不设 30 天重置</b>：所有连续天数持续累计，每个节点在同一轮不间断的连续中只奖励一次；达到最高节点后（如第 31 天及以后）不再有连续奖励，直到中断后开始新一轮，新一轮可再次获得各节点。</li>
      <li>任一天中断（未达成、漏打卡、超时补录）即清零对应连续。</li>
    </ul></div>
  <div class="card"><h3>六、判定口径与边界</h3><ul>
    <li><b>一天一条记录</b>：可无限次修改、增补，每次保存记录修改时间线；保存后对全部数据重新计算。</li>
    <li><b>按时打卡</b>：当日记录首次创建时间早于当日 23:30（本地时间）即为按时，+1；之后的修改不影响按时状态。</li>
    <li><b>23:30 之后</b>：视为未打卡。截止后才创建的当日记录（含次日补录）仅存档，当日只计 -2 及破戒扣分，不计任何加分、睡眠/精神扣分及每日减分项，并中断全部连续。</li>
    <li><b>漏打卡自动扣分</b>：从第一条记录的日期开始，每个无记录且已过 23:30 的日子自动 -2；所有分数每次由全部数据确定性重算，不会重复扣分。今天 23:30 前未打卡显示为「待打卡」，不扣分、不中断连续。</li>
    <li><b>早睡早起</b>：入睡时间早于 23:30（00:00–11:59 的入睡视为凌晨后入睡，即晚睡）且起床时间不晚于 07:30。</li>
    <li><b>精神连续 2 天一般/差</b>：凡某天精神为一般/差、且前一天（按时打卡）精神也为一般/差，当天扣 6 分。即连续 3 天则第 2、3 天各扣 6 分。前一天漏打卡/超时则不构成连续。</li>
    <li><b>破戒申报</b>：提交即自动扣 10 分（同日多份逐份扣分），并自动取消、锁定当日「当天没有手淫」，克制连续清零。删除申报后自动重算恢复。</li>
    <li><b>预警</b>：心理状态为「差」且压力为「高」或「EM」时，保存后弹出红色预警；当日净分出现连续三次下降（第 N-3 天 > N-2 > N-1 > N）时弹出下滑预警。</li>
    <li><b>大额扣分</b>（统计页标注）：当日净分 ≤ -5，或任一单项扣分 ≥ 5。</li>
    <li><b>历史最高分</b>：累计总分曲线上出现过的最大值。</li>
  </ul></div>
  <div class="card"><h3>七、积分里程碑（首次达到时弹出，仅一次）</h3>${tbl(['总分', '文案'], SCORE_MILESTONES.map((m) => [String(m.score), `「${esc(m.line1)}」<br>${esc(scoreLine2(m))}`]))}
    <p class="muted">以累计总分首次达到为准；已解锁的里程碑即使之后总分回落也保留，不会再次弹出。</p></div>
  <div class="card"><h3>八、克制里程碑（以真实、不重置的克制连续天数为准）</h3>${tbl(['天数', '文案'], ABSTINENCE_MILESTONES.map((m) => [m.days + ' 天', `「${esc(m.line1)}」<br>${esc(abstinenceLine2(m))}`]))}</div>
  </div>`;
}
