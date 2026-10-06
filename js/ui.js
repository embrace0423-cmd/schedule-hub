// UI 공통: 이스케이프, 아이콘, 액션 위임, 모달, 토스트
export const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const P = {
  today: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  calendar: '<rect x="3" y="4.5" width="18" height="17" rx="3"/><path d="M3 9.5h18M8 2.5v4M16 2.5v4"/>',
  tasks: '<rect x="3" y="3" width="18" height="18" rx="4"/><path d="m8 12 3 3 5-6"/>',
  routines: '<path d="M17 2.5 20.5 6 17 9.5"/><path d="M3.5 11V9a3 3 0 0 1 3-3h14"/><path d="M7 21.5 3.5 18 7 14.5"/><path d="M20.5 13v2a3 3 0 0 1-3 3h-14"/>',
  settings: '<path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  refresh: '<path d="M20 11a8 8 0 0 0-14.3-4.9L4 8"/><path d="M4 3v5h5"/><path d="M4 13a8 8 0 0 0 14.3 4.9L20 16"/><path d="M20 21v-5h-5"/>',
  left: '<path d="m15 18-6-6 6-6"/>',
  right: '<path d="m9 18 6-6-6-6"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  trash: '<path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  pin: '<path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>',
  cloudoff: '<path d="m3 3 18 18"/><path d="M8.5 8.6A5 5 0 0 0 6 18h11m3.3-1.8A4 4 0 0 0 17 10h-.5A6 6 0 0 0 11 6.1"/>',
  check: '<path d="m5 12 5 5 9-10"/>',
  download: '<path d="M12 3v12m0 0-4-4m4 4 4-4M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/>',
  link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
  copy: '<rect x="8" y="8" width="13" height="13" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"/>',
  bell: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.9 1.9 0 0 0 3.4 0"/>',
  flag: '<path d="M5 21V4M5 4h11l-2 4 2 4H5"/>',
};
export const icon = (name, cls = '') => `<svg class="i ${cls}" viewBox="0 0 24 24" aria-hidden="true">${P[name] || ''}</svg>`;

// ---------- 액션 위임 ----------
const handlers = {};
export function on(name, fn) {
  handlers[name] = fn;
}
export function bindActions(root = document) {
  root.addEventListener('click', (e) => {
    const el = e.target.closest('[data-action]');
    if (!el || !root.contains(el)) return;
    const fn = handlers[el.dataset.action];
    if (!fn) return;
    e.preventDefault();
    e.stopPropagation();
    fn(el, e);
  });
  root.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const el = e.target.closest('[data-action][role="button"]');
    if (!el) return;
    e.preventDefault();
    const fn = handlers[el.dataset.action];
    if (fn) fn(el, e);
  });
}

// ---------- 모달 ----------
let modalStack = [];
export function modalOpen() {
  return modalStack.length > 0;
}
export function openModal({ title, body, footer = '', onMount, onClose, wide = false }) {
  const root = document.getElementById('modal-root');
  const ov = document.createElement('div');
  ov.className = 'overlay';
  ov.innerHTML = `<div class="dialog" role="dialog" aria-modal="true" aria-label="${esc(title)}" ${wide ? 'style="width:min(720px,100%)"' : ''}>
    <header><h3>${esc(title)}</h3><button class="btn ghost icon" data-close aria-label="닫기">${icon('x')}</button></header>
    <div class="content">${body}</div>
    ${footer ? `<footer>${footer}</footer>` : ''}
  </div>`;
  root.appendChild(ov);
  const dlg = ov.querySelector('.dialog');
  const close = (result) => {
    if (!ov.isConnected) return;
    ov.remove();
    modalStack = modalStack.filter((m) => m !== entry);
    document.removeEventListener('keydown', onKey);
    if (onClose) onClose(result);
  };
  const onKey = (e) => {
    if (e.key === 'Escape' && modalStack[modalStack.length - 1] === entry) close();
  };
  const entry = { close, el: dlg };
  modalStack.push(entry);
  document.addEventListener('keydown', onKey);
  ov.addEventListener('mousedown', (e) => {
    if (e.target === ov) close();
  });
  ov.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => close()));
  if (onMount) onMount(dlg, close);
  const first = dlg.querySelector('[autofocus]');
  if (first && matchMedia('(min-width: 901px)').matches) setTimeout(() => first.focus(), 30);
  return { close, el: dlg };
}

export function choose({ title, message = '', options }) {
  // options: [{label, value, kind}]
  return new Promise((resolve) => {
    let picked = null;
    openModal({
      title,
      body: `${message ? `<div class="hint" style="font-size:14px;color:var(--text-2)">${esc(message)}</div>` : ''}
        <div class="scope-ask">${options
          .map((o, i) => `<button class="btn ${o.kind || ''}" data-i="${i}" style="justify-content:flex-start">${esc(o.label)}</button>`)
          .join('')}</div>`,
      onMount(dlg, close) {
        dlg.querySelectorAll('[data-i]').forEach((b) =>
          b.addEventListener('click', () => {
            picked = options[+b.dataset.i].value;
            close();
          })
        );
      },
      onClose: () => resolve(picked),
    });
  });
}

export function confirmDlg(title, message, okLabel = '확인', kind = 'primary') {
  return choose({ title, message, options: [{ label: okLabel, value: true, kind }, { label: '취소', value: false }] }).then(
    (v) => v === true
  );
}

// ---------- 토스트 ----------
export function showToast(msg, kind = 'info', action) {
  const root = document.getElementById('toast-root');
  if (!root) return;
  const t = document.createElement('div');
  t.className = `toast ${kind}`;
  t.innerHTML = `<span>${esc(msg)}</span>${action ? `<button>${esc(action.label)}</button>` : ''}`;
  if (action) t.querySelector('button').addEventListener('click', () => {
    action.fn();
    t.remove();
  });
  root.appendChild(t);
  setTimeout(() => t.remove(), kind === 'error' ? 6000 : 3200);
}

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    showToast('복사했습니다');
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand('copy');
      showToast('복사했습니다');
    } catch {
      showToast('복사하지 못했습니다. 직접 선택해 복사하세요.', 'error');
    }
    ta.remove();
  }
}

export const isMobile = () => matchMedia('(max-width: 900px)').matches;
