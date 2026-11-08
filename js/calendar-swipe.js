// 월 달력의 좌우 터치 스와이프. 기존 이전/다음 버튼의 경로를 재사용한다.
// 일정 데이터는 변경하지 않으며 세로 스크롤·핀치 확대·탭은 그대로 둔다.
const boundRoots = new WeakSet();
const AXIS_SLOP = 12;
const AXIS_RATIO = 1.4;
const MAX_DURATION = 1000;

export function bindMonthSwipe(root) {
  if (!root || boundRoots.has(root)) return;
  boundRoots.add(root);
  let gesture = null;
  let suppressClickUntil = 0;
  const modalOpen = () => !!document.querySelector('#modal-root .dialog');
  const current = (g) => g.grid.isConnected && root.contains(g.grid) &&
    location.hash === g.hash && !modalOpen();

  root.addEventListener('touchstart', (event) => {
    gesture = null;
    if (event.touches.length !== 1 || modalOpen()) return;
    suppressClickUntil = 0; // 새로 시작한 정상 탭은 차단하지 않는다.
    const grid = event.target.closest?.('.month');
    if (!grid || !root.contains(grid) || !location.hash.startsWith('#/calendar')) return;
    if (event.target.closest?.('button, a, input, select, textarea, [contenteditable="true"]')) return;
    const previous = root.querySelector('.cal-tools [data-action="nav"][aria-label="이전"]')?.dataset.href;
    const next = root.querySelector('.cal-tools [data-action="nav"][aria-label="다음"]')?.dataset.href;
    // 월 보기에서만 작동한다. 주/일/목록 보기의 제스처는 가로채지 않는다.
    if (![previous, next].every((href) => href?.startsWith('#/calendar?') &&
      new URLSearchParams(href.split('?')[1]).get('v') === 'month')) return;
    const touch = event.touches[0];
    gesture = {
      grid, previous, next, hash: location.hash, id: touch.identifier,
      x: touch.clientX, y: touch.clientY, at: performance.now(),
      scrollY: window.scrollY, axis: null,
      threshold: Math.max(56, Math.min(96, grid.clientWidth * 0.18)),
    };
  }, { passive: true });

  root.addEventListener('touchmove', (event) => {
    const g = gesture;
    if (!g) return;
    if (event.touches.length !== 1 || !current(g)) {
      gesture = null;
      return;
    }
    const touch = Array.from(event.touches).find((t) => t.identifier === g.id);
    if (!touch) return;
    const x = Math.abs(touch.clientX - g.x);
    const y = Math.abs(touch.clientY - g.y);
    if (!g.axis) {
      if (Math.max(x, y) < AXIS_SLOP) return;
      g.axis = x > y * AXIS_RATIO ? 'x' : 'y';
    }
    // 세로로 시작한 동작은 도중에 방향이 바뀌어도 월을 넘기지 않는다.
    if (g.axis === 'x' && event.cancelable) event.preventDefault();
  }, { passive: false });

  root.addEventListener('touchend', (event) => {
    const g = gesture;
    gesture = null;
    if (!g || event.touches.length || !current(g)) return;
    const touch = Array.from(event.changedTouches).find((t) => t.identifier === g.id);
    if (!touch || g.axis !== 'x') return;
    // 드래그 뒤 합성된 클릭이 일정/날짜를 열지 않게 한다.
    suppressClickUntil = performance.now() + 450;
    const dx = touch.clientX - g.x;
    const dy = touch.clientY - g.y;
    if (performance.now() - g.at > MAX_DURATION ||
      Math.abs(window.scrollY - g.scrollY) > 8 ||
      Math.abs(dx) < g.threshold || Math.abs(dx) <= Math.abs(dy) * AXIS_RATIO) return;
    // 왼쪽 스와이프는 이전 달, 오른쪽 스와이프는 다음 달로 이동한다.
    location.hash = dx < 0 ? g.previous : g.next;
  }, { passive: true });

  root.addEventListener('touchcancel', () => { gesture = null; }, { passive: true });
  root.addEventListener('click', (event) => {
    // detail=0인 키보드/보조기술의 클릭은 항상 허용한다.
    if (event.detail !== 0 && performance.now() < suppressClickUntil) {
      event.preventDefault();
      event.stopImmediatePropagation();
      suppressClickUntil = 0;
    }
  }, true);
  window.addEventListener('hashchange', () => { gesture = null; });
  window.addEventListener('blur', () => { gesture = null; });
}

bindMonthSwipe(document.getElementById('view'));

// 실행 중인 코드의 버전을 표시한다. 서버 배포 버전과 혼동하지 않도록 한다.
export const SWIPE_VERSION = '1.0.8';
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
  label.textContent = `← 이전 달 · 다음 달 → · v${SWIPE_VERSION}`;
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
