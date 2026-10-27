// 模态框：串行队列，避免多个弹窗叠加
import { esc } from './dom.js';

let chain = Promise.resolve();

function open({ title = '', body = '', html = null, tone = '', buttons = [{ label: '确定', value: true, primary: true }], dismissable = true }) {
  return new Promise((resolve) => {
    const root = document.getElementById('modalRoot');
    const mask = document.createElement('div');
    mask.className = 'modal-mask';
    mask.setAttribute('role', 'dialog');
    mask.setAttribute('aria-modal', 'true');
    const content = html != null ? html : `<h4>${esc(title)}</h4><div class="mb">${esc(body)}</div>`;
    mask.innerHTML = `<div class="modal ${tone}">${content}<div class="mf"></div></div>`;
    const mf = mask.querySelector('.mf');
    const close = (v) => { document.removeEventListener('keydown', onKey); mask.remove(); resolve(v); };
    buttons.forEach((b) => {
      const el = document.createElement('button');
      el.className = 'btn' + (b.primary ? ' primary' : '') + (b.danger ? ' danger' : '');
      el.textContent = b.label;
      el.onclick = () => close(b.value);
      mf.appendChild(el);
    });
    const onKey = (e) => { if (e.key === 'Escape' && dismissable) close(null); };
    document.addEventListener('keydown', onKey);
    if (dismissable) mask.addEventListener('click', (e) => { if (e.target === mask) close(null); });
    root.appendChild(mask);
    const pri = mf.querySelector('.primary, .danger') || mf.querySelector('button');
    if (pri) pri.focus();
  });
}

export function showModal(opts) {
  const p = chain.then(() => open(opts));
  chain = p.catch(() => {});
  return p;
}

export function alertModal(title, body, tone = '') { return showModal({ title, body, tone }); }

export function confirmModal(title, body, { okLabel = '确定', danger = false } = {}) {
  return showModal({
    title, body, tone: danger ? 'danger' : '',
    buttons: [{ label: '取消', value: false }, { label: okLabel, value: true, primary: !danger, danger }],
  }).then((v) => v === true);
}

export function milestoneModal(m) {
  const k = m.type === 'score' ? `里程碑 · 总积分 ${m.score}` : `里程碑 · 克制 ${m.days} 天`;
  return showModal({
    tone: 'solemn', dismissable: false,
    html: `<div class="ms-k">${esc(k)}</div><div class="ms-1">「${esc(m.line1)}」</div><div class="ms-2">${esc(m.line2)}</div>`,
    buttons: [{ label: '继续前进', value: true, primary: true }],
  });
}
