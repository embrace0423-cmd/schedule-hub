// 월 보기에서 터치/마우스로 왼쪽은 이전 달, 오른쪽은 다음 달로 이동한다.
// 기존 이전/다음 버튼의 경로만 재사용하며 일정 데이터에는 접근하지 않는다.
import { APP_VERSION } from './app-version.js';

const boundRoots = new WeakSet();
const AXIS_SLOP = 12;
const AXIS_RATIO = 1.4;
const MAX_DURATION = 1000;

export function bindMonthSwipe(root) {
  if (!root || boundRoots.has(root)) return;
  boundRoots.add(root);
  let gesture = null;
  let suppressClickUntil = 0;
  let ignoreMouseUntil = 0;
  const modalOpen = () => !!document.querySelector('#modal-root .dialog');
  const current = (g) => g.grid.isConnected && root.contains(g.grid) &&
    location.hash === g.hash && !modalOpen();

  function cancel() {
    if (gesture?.kind === 'mouse') gesture.grid.style.userSelect = gesture.userSelect;
    gesture = null;
  }
  function begin(target, point, kind) {
    cancel();
    if (modalOpen()) return;
    const grid = target?.closest?.('.month');
    if (!grid || !root.contains(grid) || !location.hash.startsWith('#/calendar')) return;
    if (target.closest?.('button, a, input, select, textarea, [contenteditable="true"]')) return;
    const previous = root.querySelector('.cal-tools [data-action="nav"][aria-label="이전"]')?.dataset.href;
    const next = root.querySelector('.cal-tools [data-action="nav"][aria-label="다음"]')?.dataset.href;
    if (![previous, next].every((href) => href?.startsWith('#/calendar?') &&
      new URLSearchParams(href.split('?')[1]).get('v') === 'month')) return;
    suppressClickUntil = 0;
    gesture = {
      kind, grid, previous, next, hash: location.hash, id: point.identifier,
      x: point.clientX, y: point.clientY, at: performance.now(),
      scrollY: window.scrollY, axis: null, userSelect: grid.style.userSelect,
      threshold: Math.max(56, Math.min(96, grid.clientWidth * 0.18)),
    };
  }
  function move(point, event) {
    const g = gesture;
    if (!g || !current(g)) return cancel();
    const x = Math.abs(point.clientX - g.x);
    const y = Math.abs(point.clientY - g.y);
    if (!g.axis) {
      if (Math.max(x, y) < AXIS_SLOP) return;
      // 세로로 시작한 동작은 도중에 방향이 바뀌어도 월을 넘기지 않는다.
      g.axis = x > y * AXIS_RATIO ? 'x' : 'y';
    }
    if (g.axis === 'x') {
      if (g.kind === 'mouse') g.grid.style.userSelect = 'none';
      if (event.cancelable) event.preventDefault();
    }
  }
  function finish(point) {
    const g = gesture;
    cancel();
    if (!g || !point || !current(g) || g.axis !== 'x') return;
    // 드래그 뒤 합성된 클릭으로 날짜/일정이 열리는 것을 막는다.
    suppressClickUntil = performance.now() + 450;
    const dx = point.clientX - g.x;
    const dy = point.clientY - g.y;
    if (performance.now() - g.at > MAX_DURATION ||
      Math.abs(window.scrollY - g.scrollY) > 8 ||
      Math.abs(dx) < g.threshold || Math.abs(dx) <= Math.abs(dy) * AXIS_RATIO) return;
    location.hash = dx < 0 ? g.previous : g.next;
  }

  root.addEventListener('touchstart', (event) => {
    ignoreMouseUntil = performance.now() + 800;
    if (event.touches.length !== 1) return cancel();
    begin(event.target, event.touches[0], 'touch');
  }, { passive: true });
  root.addEventListener('touchmove', (event) => {
    if (gesture?.kind !== 'touch') return;
    if (event.touches.length !== 1) return cancel();
    const touch = Array.from(event.touches).find((t) => t.identifier === gesture.id);
    if (touch) move(touch, event);
  }, { passive: false });
  root.addEventListener('touchend', (event) => {
    ignoreMouseUntil = performance.now() + 800;
    if (gesture?.kind !== 'touch') return;
    if (event.touches.length) return cancel();
    finish(Array.from(event.changedTouches).find((t) => t.identifier === gesture.id));
  }, { passive: true });
  root.addEventListener('touchcancel', () => {
    ignoreMouseUntil = performance.now() + 800;
    cancel();
  }, { passive: true });

  // 기존 터치 전용 구현에서 빠져 있던 PC 마우스 드래그.
  // 터치 뒤 발생하는 호환 마우스 이벤트는 처리하지 않아 중복 이동을 막는다.
  root.addEventListener('mousedown', (event) => {
    if (event.button !== 0 || event.sourceCapabilities?.firesTouchEvents ||
      performance.now() < ignoreMouseUntil) return;
    begin(event.target, event, 'mouse');
  });
  window.addEventListener('mousemove', (event) => {
    if (gesture?.kind !== 'mouse') return;
    if (!(event.buttons & 1)) return cancel();
    move(event, event);
  });
  window.addEventListener('mouseup', (event) => {
    if (gesture?.kind === 'mouse' && event.button === 0) finish(event);
  });
  root.addEventListener('selectstart', (event) => {
    if (gesture?.kind === 'mouse' && gesture.axis === 'x') event.preventDefault();
  });
  root.addEventListener('dragstart', (event) => {
    if (gesture?.kind === 'mouse') event.preventDefault();
  });
  root.addEventListener('click', (event) => {
    // detail=0인 키보드/보조기술의 클릭은 항상 허용한다.
    if (event.detail !== 0 && performance.now() < suppressClickUntil) {
      event.preventDefault();
      event.stopImmediatePropagation();
      suppressClickUntil = 0;
    }
  }, true);
  window.addEventListener('hashchange', cancel);
  window.addEventListener('blur', cancel);
}

bindMonthSwipe(document.getElementById('view'));

// 설정과 달력이 동일한 릴리스 값을 표시한다.
export const SWIPE_VERSION = APP_VERSION;
document.documentElement.dataset.monthSwipeVersion = SWIPE_VERSION;
const view = document.getElementById('view');
function showSwipeHelp() {
  const grid = view?.querySelector('.month');
  if (!grid || view.querySelector('#month-swipe-help')) return;
  const help = document.createElement('div');
  help.id = 'month-swipe-help';
  help.className = 'hint';
  help.style.cssText = 'display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin:8px 0;font-size:12px';
  const label = document.createElement('span');
  label.textContent = `← 이전 달 · 다음 달 → · 터치/마우스 · v${SWIPE_VERSION}`;
  const update = document.createElement('a');
  update.href = new URL('update.html', document.baseURI).href;
  update.textContent = '앱 업데이트';
  help.append(label, update);
  grid.before(help);
  const ids = new Set((grid.getAttribute('aria-describedby') || '').split(/\s+/).filter(Boolean));
  ids.add(help.id);
  grid.setAttribute('aria-describedby', [...ids].join(' '));
}
if (view) {
  new MutationObserver(showSwipeHelp).observe(view, { childList: true, subtree: true });
  showSwipeHelp();
}
