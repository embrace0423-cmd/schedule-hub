// 일정 완료 처리 UI 확장
// Google Calendar의 private extendedProperties에 완료 상태를 저장한다.
import { getEvent, updateEvent } from './store.js';
import { icon, showToast } from './ui.js';

const DONE_KEY = 'scheduleHubDone';
let activeEvent = null;

function isDone(ev) {
  return ev?.extendedProperties?.private?.[DONE_KEY] === '1';
}

function rememberEventTarget(target) {
  const el = target?.closest?.('[data-action="open-event"][data-cal][data-id]');
  if (!el) return;
  activeEvent = { calId: el.dataset.cal, id: el.dataset.id };
}

// 클릭/키보드로 일정 편집기를 여는 순간 현재 일정 ID를 기억한다.
document.addEventListener('click', (e) => rememberEventTarget(e.target), true);
document.addEventListener(
  'keydown',
  (e) => {
    if (e.key === 'Enter' || e.key === ' ') rememberEventTarget(e.target);
  },
  true
);

function setDone(calId, id, done) {
  const ev = getEvent(calId, id);
  if (!ev) return false;
  const extendedProperties = JSON.parse(JSON.stringify(ev.extendedProperties || {}));
  extendedProperties.private = {
    ...(extendedProperties.private || {}),
    [DONE_KEY]: done ? '1' : '0',
  };
  updateEvent(calId, id, { extendedProperties });
  return true;
}

function injectCompleteButton(dlg) {
  if (!dlg || dlg.dataset.eventCompleteReady === '1') return;
  const title = dlg.querySelector('header h3')?.textContent?.trim();
  if (title !== '일정 수정' || !activeEvent) return;

  const ev = getEvent(activeEvent.calId, activeEvent.id);
  if (!ev) return;

  const footer = dlg.querySelector('footer');
  const grow = footer?.querySelector('.grow');
  if (!footer || !grow) return;

  const done = isDone(ev);
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = `btn event-complete-btn ${done ? 'on' : ''}`;
  btn.dataset.eventComplete = '1';
  btn.innerHTML = `${icon('check')}${done ? '완료 취소' : '완료'}`;
  btn.setAttribute('aria-pressed', done ? 'true' : 'false');
  grow.before(btn);
  dlg.dataset.eventCompleteReady = '1';

  btn.addEventListener('click', () => {
    const current = getEvent(activeEvent.calId, activeEvent.id);
    if (!current) return showToast('일정을 찾을 수 없습니다.', 'error');
    const next = !isDone(current);
    if (!setDone(activeEvent.calId, activeEvent.id, next)) return;
    dlg.querySelector('[data-close]')?.click();
    showToast(next ? '일정을 완료 처리했습니다.' : '일정 완료 처리를 취소했습니다.');
  });
}

function decorateCompletedEvents() {
  document.querySelectorAll('[data-action="open-event"][data-cal][data-id]').forEach((el) => {
    const ev = getEvent(el.dataset.cal, el.dataset.id);
    el.classList.toggle('event-completed', isDone(ev));
  });
}

const style = document.createElement('style');
style.textContent = `
  .event-complete-btn.on { font-weight: 700; }
  [data-action="open-event"].event-completed { opacity: .58; }
  [data-action="open-event"].event-completed .title,
  [data-action="open-event"].event-completed b,
  .mchip.event-completed { text-decoration: line-through; }
`;
document.head.appendChild(style);

const modalRoot = document.getElementById('modal-root');
if (modalRoot) {
  new MutationObserver(() => {
    modalRoot.querySelectorAll('.dialog').forEach(injectCompleteButton);
  }).observe(modalRoot, { childList: true, subtree: true });
}

const view = document.getElementById('view');
if (view) {
  new MutationObserver(decorateCompletedEvents).observe(view, { childList: true, subtree: true });
  decorateCompletedEvents();
}
