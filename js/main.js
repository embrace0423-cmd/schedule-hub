// 스케줄 허브 — 앱 진입점: 라우팅, 렌더링, 이벤트 연결, 동기화 주기
import * as store from './store.js';
import { state } from './store.js';
import * as auth from './auth.js';
import * as gapi from './gapi.js';
import * as db from './db.js';
import { ls } from './db.js';
import { bindActions, on, icon, esc, showToast, openModal, modalOpen, copyText, confirmDlg, isMobile } from './ui.js';
import { parseQuick, describeParse } from './nlp.js';
import { areaList, toggleHidden, DEFAULT_AREAS, hiddenCals, calName, calendarById, isRoutineCal } from './areas.js';
import { openEventEditor, openTaskEditor, openRoutineEditor, createFromParse } from './editors.js';
import { renderToday } from './views/today.js';
import { renderCalendar, ensureForParams, slotTime, calHref, calParams } from './views/calendar.js';
import { renderTasks } from './views/tasks.js';
import { renderRoutines } from './views/routines.js';
import { renderSettings } from './views/settings.js';
import { renderSearch } from './views/search.js';
import { prefs, applyTheme } from './prefs.js';
import { startOfDay, addDays, startOfMonth, addMonths, startOfWeek, ymd, parseYMD, sameDay, WEEKDAYS, localTimeZone, fmtMonth, overlapsDay } from './dates.js';
import { overdueCount } from './views/common.js';
import { isDone } from './routines.js';

const qs = new URLSearchParams(location.search);
const PREVIEW = !!window.SH_PREVIEW; // claude.ai 미리보기용(데모 고정)
const DEMO = PREVIEW || qs.has('demo') || !!ls.get('sh.demo');
const ctx = { demo: DEMO, canInstall: false };
let deferredInstall = null;
let miniMonth = startOfMonth(new Date());

// ───────── 라우팅 ─────────
function route() {
  const h = location.hash || '#/today';
  const [path, q] = h.slice(1).split('?');
  return { path: path || '/today', params: new URLSearchParams(q || '') };
}
const NAV = [
  ['/today', '오늘', 'today'],
  ['/calendar', '캘린더', 'calendar'],
  ['/tasks', '할 일', 'tasks'],
  ['/routines', '루틴', 'routines'],
  ['/settings', '설정', 'settings'],
];
const TITLES = { '/today': '오늘', '/calendar': '캘린더', '/tasks': '할 일', '/routines': '루틴', '/settings': '설정', '/search': '검색' };

// ───────── 렌더 ─────────
function captureKeep(root) {
  const out = { inputs: [], scroll: {} };
  root.querySelectorAll('[data-keep]').forEach((el) => {
    out.inputs.push({
      key: el.dataset.keep,
      value: el.value,
      focused: document.activeElement === el,
      a: el.selectionStart,
      b: el.selectionEnd,
    });
  });
  root.querySelectorAll('[data-keep-scroll]').forEach((el) => (out.scroll[el.dataset.keepScroll] = el.scrollTop));
  return out;
}
function restoreKeep(root, k) {
  for (const it of k.inputs) {
    const el = root.querySelector(`[data-keep="${it.key}"]`);
    if (!el) continue;
    if (it.key !== 'search' && it.key !== 'client') el.value = it.value;
    else if (it.focused) el.value = it.value;
    if (it.focused) {
      el.focus();
      try {
        el.setSelectionRange(it.a, it.b);
      } catch {
        /* type=search 등 */
      }
    }
    if (it.key === 'quick') updatePreview(el);
  }
  for (const [key, top] of Object.entries(k.scroll)) {
    const el = root.querySelector(`[data-keep-scroll="${key}"]`);
    if (el) {
      el.scrollTop = top;
      el.dataset.scrolled = '1';
    }
  }
}

let lastPath = null;
function render() {
  const { path, params } = route();
  const view = document.getElementById('view');
  const keep = path === lastPath ? captureKeep(view) : { inputs: [], scroll: {} };
  try {
    switch (path) {
      case '/calendar':
        renderCalendar(view, params);
        break;
      case '/tasks':
        renderTasks(view);
        break;
      case '/routines':
        renderRoutines(view);
        break;
      case '/settings':
        renderSettings(view, ctx);
        break;
      case '/search':
        renderSearch(view, params);
        break;
      default:
        renderToday(view);
    }
  } catch (e) {
    console.error(e);
    view.innerHTML = `<div class="notice err">화면을 그리는 중 오류가 발생했습니다: ${esc(e.message)}</div>`;
  }
  restoreKeep(view, keep);
  if (path !== lastPath) window.scrollTo(0, 0);
  lastPath = path;
  renderChrome(path, params);
}

function renderChrome(path, params) {
  const od = overdueCount();
  const badge = (p) => (p === '/tasks' && od ? `<span class="count">${od}</span>` : '');
  document.querySelector('.nav').innerHTML = NAV.map(
    ([p, l, ic]) => `<a href="#${p}" class="${path === p ? 'on' : ''}">${icon(ic)}<span>${l}</span>${badge(p)}</a>`
  ).join('');
  document.querySelector('.tabbar').innerHTML = NAV.map(
    ([p, l, ic]) => `<a href="#${p}" class="${path === p ? 'on' : ''}" aria-label="${l}">${icon(ic)}<span>${l}</span>${badge(p)}</a>`
  ).join('');
  document.getElementById('page-title').textContent = TITLES[path] || '스케줄 허브';
  document.title = `${TITLES[path] || ''} · 스케줄 허브`;
  const syncBtn = document.getElementById('sync-btn');
  syncBtn.innerHTML = icon('refresh', state.syncing ? 'spin' : '');
  syncBtn.title = state.lastSync ? `마지막 동기화 ${new Date(state.lastSync).toLocaleTimeString('ko-KR')}` : '동기화';
  document.getElementById('banner').innerHTML = bannerHtml();
  // 사이드바: 미니 달력 + 영역
  if (path === '/calendar') {
    const { d } = calParams(params);
    if (!sameDay(startOfMonth(d), miniMonth) && !renderChrome.miniTouched) miniMonth = startOfMonth(d);
  }
  document.getElementById('mini').innerHTML = miniCal();
  document.getElementById('area-list').innerHTML = areaFilter();
  const pend = state.outbox.length;
  document.getElementById('side-status').innerHTML = `${!state.online ? icon('cloudoff') + '오프라인' : state.syncing ? '동기화 중…' : state.lastSync ? '동기화됨 ' + new Date(state.lastSync).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }) : '동기화 전'}${pend ? ` · 대기 ${pend}건` : ''}`;
  const fab = document.getElementById('fab');
  fab.style.display = path === '/settings' || path === '/search' ? 'none' : '';
}

function bannerHtml() {
  const n = state.outbox.length;
  const box = (cls, text, actions = '') => `<div class="notice ${cls}"><span class="grow">${text}</span>${actions}</div>`;
  if (PREVIEW) return box('', '<b>미리보기</b> — 샘플 데이터로 동작하는 데모입니다. 실제 사용은 설치 가이드대로 배포한 뒤 Google 계정을 연결하세요.');
  if (DEMO) return box('', '<b>데모 모드</b> — 샘플 데이터입니다. 변경 내용은 새로고침하면 초기화됩니다.', `<button class="btn sm" data-action="demo-off">데모 종료</button>`);
  if (!auth.getClientId())
    return box('', '처음 오셨나요? <b>설정 → Google 연결</b>에서 클라이언트 ID를 등록하면 갤럭시 삼성 캘린더와 동기화됩니다.', `<a class="btn sm primary" href="#/settings">설정하기</a><button class="btn sm" data-action="demo-on">데모로 둘러보기</button>`);
  if (!auth.isConnectedBefore() && !gapi.hasToken())
    return box('', '캘린더를 연결하면 일정·할 일이 PC와 휴대폰에서 함께 동기화됩니다. (로그인은 Google 공식 페이지에서 진행되며 이 앱은 비밀번호를 받지 않습니다.)', `<button class="btn sm primary" data-action="login">${icon('link')}캘린더 연결</button>`);
  if (state.authState === 'expired')
    return box('warn', `Google 연결이 만료되었습니다${n ? ` — 전송 대기 ${n}건` : ''}. 다시 연결하면 이어서 동기화합니다.`, `<button class="btn sm primary" data-action="login">다시 연결</button>`);
  if (!state.online) return box('warn', `${icon('cloudoff')} 오프라인 — ${n ? `변경 ${n}건은 연결되면 자동으로 Google에 반영됩니다.` : '저장된 사본을 보여주고 있습니다.'}`);
  return '';
}

function miniCal() {
  const ws = prefs.weekStart;
  const start = startOfWeek(miniMonth, ws);
  const hidden = hiddenCals();
  const evs = store.eventsInRange(start, addDays(start, 42), (e) => !hidden.has(e._cal) && !/holiday/i.test(e._cal) && !isRoutineCal(calendarById(state, e._cal)));
  const today = startOfDay(new Date());
  let h = '';
  for (let i = 0; i < 7; i++) h += `<span>${WEEKDAYS[(ws + i) % 7]}</span>`;
  for (let i = 0; i < 42; i++) {
    const d = addDays(start, i);
    const has = evs.some((e) => overlapsDay(e, d));
    h += `<button class="${d.getMonth() !== miniMonth.getMonth() ? 'o' : ''} ${sameDay(d, today) ? 'td' : ''} ${has ? 'has' : ''}" data-action="mini-day" data-date="${ymd(d)}">${d.getDate()}</button>`;
  }
  return `<div class="mh"><span>${fmtMonth(miniMonth)}</span><span class="row" style="gap:2px">
    <button class="btn ghost sm icon" style="width:28px" data-action="mini-nav" data-m="-1" aria-label="이전 달">${icon('left')}</button>
    <button class="btn ghost sm icon" style="width:28px" data-action="mini-nav" data-m="1" aria-label="다음 달">${icon('right')}</button></span></div>
    <div class="mg">${h}</div>`;
}

function areaFilter() {
  if (!state.calendars.length) return '<div class="hint" style="padding:0 10px">Google 연결 후 표시됩니다</div>';
  const hidden = hiddenCals();
  return state.calendars
    .map((c) => {
      const on = !hidden.has(c.id);
      return `<label data-action="toggle-cal-side" data-id="${esc(c.id)}"><span class="box ${on ? 'on' : ''}" style="border-color:${esc(c.backgroundColor)};${on ? `background:${esc(c.backgroundColor)}` : ''}"></span><span class="nm">${esc(calName(c))}</span></label>`;
    })
    .join('');
}

// ───────── 빠른 입력 ─────────
function quickParse(input) {
  const mode = input.dataset.mode || 'event';
  return parseQuick(input.value, { mode, areas: areaList(state) });
}
function updatePreview(input) {
  const pv = document.getElementById('quick-preview');
  if (!pv) return;
  if (!input.value.trim()) {
    pv.innerHTML = '<span class="muted">Enter 로 바로 추가 · 날짜/시간/#영역은 자동 인식됩니다</span>';
    return;
  }
  const p = quickParse(input);
  pv.innerHTML = `<b>${esc(describeParse(p))}</b> — ${esc(p.title || '(제목 없음)')} <a href="#" data-action="quick-detail" style="margin-left:6px">자세히 입력</a>`;
}
function doQuickAdd() {
  const input = document.getElementById('quick-input');
  if (!input || !input.value.trim()) return input && input.focus();
  const p = quickParse(input);
  if (createFromParse(p)) {
    input.value = '';
    updatePreview(input);
  }
}

// ───────── 액션 ─────────
function registerActions() {
  on('nav', (el) => (location.hash = el.dataset.href));
  on('open-event', (el) => {
    const c = calendarById(state, el.dataset.cal);
    if (isRoutineCal(c)) openRoutineEditor({ calId: el.dataset.cal, instanceId: el.dataset.id });
    else openEventEditor({ calId: el.dataset.cal, id: el.dataset.id });
  });
  on('open-task', (el) => openTaskEditor({ listId: el.dataset.list, id: el.dataset.id }));
  on('open-routine', (el) => openRoutineEditor({ calId: el.dataset.cal, instanceId: el.dataset.id }));
  on('toggle-task', (el) => {
    const t = store.getTask(el.dataset.list, el.dataset.id);
    if (!t) return;
    const done = t.status !== 'completed';
    const newId = store.setTaskDone(el.dataset.list, el.dataset.id, done);
    if (done) showToast(`완료: ${t.title}`, 'info', { label: '실행 취소', fn: () => store.setTaskDone(el.dataset.list, newId || el.dataset.id, false) });
  });
  on('toggle-routine', (el) => {
    const ev = store.getEvent(el.dataset.cal, el.dataset.id);
    if (!ev) return;
    const done = !isDone(ev);
    store.setRoutineDone(el.dataset.cal, el.dataset.id, done);
    if (done) showToast(`${ev.summary} 완료`);
  });
  on('new-event', (el) => openEventEditor({ defaults: { date: el.dataset.date ? new Date(+el.dataset.date) : undefined } }));
  on('new-task', (el) => openTaskEditor({ defaults: { listId: el.dataset.list } }));
  on('new-routine', () => openRoutineEditor());
  on('fab', () => {
    const { path } = route();
    if (path === '/tasks') return openTaskEditor();
    if (path === '/routines') return openRoutineEditor();
    if (path === '/calendar') {
      const { d, sel } = calParams(route().params);
      return openEventEditor({ defaults: { date: sel || d } });
    }
    newChooser();
  });
  on('new-any', () => newChooser());
  on('quick-mode', (el) => {
    prefs.quickMode = el.dataset.mode;
    const input = document.getElementById('quick-input');
    const v = input ? input.value : '';
    render();
    const ni = document.getElementById('quick-input');
    if (ni) {
      ni.value = v;
      ni.focus();
      updatePreview(ni);
    }
  });
  on('quick-add', doQuickAdd);
  on('quick-detail', () => {
    const input = document.getElementById('quick-input');
    const p = quickParse(input);
    if (p.kind === 'task') openTaskEditor({ defaults: { title: p.title, date: p.date, priority: p.priority, listId: p.area && p.area.tasklistId } });
    else if (p.kind === 'routine') openRoutineEditor({ defaults: p });
    else openEventEditor({ defaults: { ...p, calId: p.area && p.area.id } });
    input.value = '';
    updatePreview(input);
  });
  on('cal-view', (el) => {
    prefs.calView = el.dataset.v;
    location.hash = calHref(el.dataset.v, parseYMD(el.dataset.d));
  });
  on('sel-day', (el) => {
    const day = parseYMD(el.dataset.date);
    const month = parseYMD(el.dataset.month);
    const target = day.getMonth() === month.getMonth() ? month : day;
    history.replaceState(null, '', calHref('month', target, day));
    render();
  });
  on('slot', (el, e) => {
    if (e.target.closest('.tg-ev')) return;
    const { date, time } = slotTime(el, e);
    openEventEditor({ defaults: { date, time } });
  });
  on('mini-nav', (el) => {
    miniMonth = addMonths(miniMonth, +el.dataset.m);
    renderChrome.miniTouched = true;
    document.getElementById('mini').innerHTML = miniCal();
  });
  on('mini-day', (el) => {
    renderChrome.miniTouched = false;
    const d = parseYMD(el.dataset.date);
    location.hash = calHref(prefs.calView === 'week' || prefs.calView === 'day' ? prefs.calView : 'month', d, d);
  });
  on('toggle-cal-side', (el) => {
    toggleHidden(el.dataset.id);
    render();
  });
  on('task-group', (el) => {
    prefs.taskGroup = el.dataset.g;
    render();
  });
  on('set-theme', (el) => {
    prefs.theme = el.dataset.v;
    render();
  });
  on('set-weekstart', (el) => {
    prefs.weekStart = +el.dataset.v;
    render();
  });
  on('save-client', () => {
    const v = document.getElementById('client-id').value.trim();
    if (v && !/\.apps\.googleusercontent\.com$/.test(v)) return showToast('클라이언트 ID는 ".apps.googleusercontent.com" 으로 끝나야 합니다.', 'error');
    auth.setClientId(v);
    showToast(v ? '클라이언트 ID를 저장했습니다. 이제 [캘린더 동기화 연결]을 누르세요.' : '클라이언트 ID를 지웠습니다.');
    render();
  });
  on('login', (el) => {
    if (DEMO) return showToast('데모 모드에서는 연결할 수 없습니다. 데모를 종료하세요.');
    if (!auth.getClientId()) {
      location.hash = '#/settings';
      return showToast('먼저 클라이언트 ID를 입력하세요.', 'error');
    }
    try {
      auth.startLogin({ consent: el.dataset.consent === '1' });
    } catch (e) {
      showToast(e.message, 'error');
    }
  });
  on('logout', async () => {
    if (!(await confirmDlg('연결 해제', '이 기기에서 Google 연결을 해제하고 저장된 사본을 지울까요? (Google의 데이터는 그대로 유지됩니다)', '연결 해제', 'danger'))) return;
    await auth.logout();
    await store.resetLocal();
    store.setAuth('none');
    showToast('연결을 해제했습니다');
  });
  on('sync-now', async () => {
    if (!gapi.hasToken()) {
      if (auth.isConnectedBefore() && auth.getClientId()) return auth.startLogin({});
      return showToast('먼저 Google 계정을 연결하세요.', 'error');
    }
    await store.sync();
    if (!state.error) showToast('동기화했습니다');
  });
  on('reset-local', async () => {
    if (!(await confirmDlg('사본 초기화', `이 기기에 저장된 사본을 지우고 Google에서 다시 받습니다.${state.outbox.length ? ` 전송 대기 중인 변경 ${state.outbox.length}건도 함께 삭제됩니다.` : ''}`, '초기화', 'danger'))) return;
    await store.resetLocal();
    store.sync();
  });
  on('demo-on', () => {
    ls.set('sh.demo', true);
    location.href = location.pathname + '?demo#/today';
  });
  on('demo-off', () => {
    if (PREVIEW) return showToast('미리보기에서는 데모만 사용할 수 있습니다.');
    ls.del('sh.demo');
    location.href = location.pathname + '#/settings';
  });
  on('copy', (el) => copyText(el.dataset.text));
  on('install', async () => {
    if (!deferredInstall) return showToast('브라우저 메뉴에서 "앱 설치"를 선택하세요.');
    deferredInstall.prompt();
    await deferredInstall.userChoice;
    deferredInstall = null;
    ctx.canInstall = false;
    render();
  });
  on('setup-areas', () => setupAreasDialog());
  on('sync-btn', () => handlersSync());
  on('search-mobile', () => (location.hash = '#/search'));
}

async function handlersSync() {
  if (!gapi.hasToken()) {
    if (auth.isConnectedBefore() && auth.getClientId() && !DEMO) return auth.startLogin({});
    return showToast('먼저 Google 계정을 연결하세요.', 'error');
  }
  await store.sync();
}

function newChooser() {
  openModal({
    title: '새로 만들기',
    body: `<div class="scope-ask">
      <button class="btn" data-k="event" style="justify-content:flex-start">${icon('calendar')}일정</button>
      <button class="btn" data-k="task" style="justify-content:flex-start">${icon('tasks')}할 일</button>
      <button class="btn" data-k="routine" style="justify-content:flex-start">${icon('routines')}루틴</button></div>`,
    onMount(dlg, close) {
      dlg.querySelectorAll('[data-k]').forEach((b) =>
        b.addEventListener('click', () => {
          close();
          ({ event: () => openEventEditor(), task: () => openTaskEditor(), routine: () => openRoutineEditor() })[b.dataset.k]();
        })
      );
    },
  });
}

function setupAreasDialog() {
  const existing = new Set(state.calendars.map((c) => c.summary));
  const rows = DEFAULT_AREAS.map(
    (a, i) => `<label class="kv" style="cursor:pointer"><span class="row"><span class="dot" style="background:${a.color}"></span>
      <input type="text" class="inp" data-name="${i}" value="${esc(a.name)}" style="height:34px;width:180px" ${existing.has(a.name) ? 'disabled' : ''}>
      ${a.routine ? '<span class="chip">루틴용</span>' : ''}</span>
      ${existing.has(a.name) ? '<span class="chip">이미 있음</span>' : `<label class="switch"><input type="checkbox" data-pick="${i}" checked><i></i></label>`}</label>`
  ).join('');
  openModal({
    title: '기본 영역 만들기',
    body: `<p class="hint" style="margin:0">각 영역마다 Google 캘린더 1개와 같은 이름의 할 일 목록 1개를 만듭니다. 이름은 바꿀 수 있습니다. 갤럭시 삼성 캘린더에서는 <b>메뉴 → 캘린더 관리</b>에서 새 캘린더가 켜져 있는지 확인하세요.</p>${rows}`,
    footer: `<span class="grow"></span><button class="btn" data-close>취소</button><button class="btn primary" data-create>만들기</button>`,
    onMount(dlg, close) {
      dlg.querySelector('[data-create]').addEventListener('click', async (e) => {
        const defs = [];
        dlg.querySelectorAll('[data-pick]').forEach((c) => {
          if (!c.checked) return;
          const i = +c.dataset.pick;
          const name = dlg.querySelector(`[data-name="${i}"]`).value.trim();
          if (name) defs.push({ ...DEFAULT_AREAS[i], name });
        });
        if (!defs.length) return close();
        e.target.disabled = true;
        e.target.textContent = '만드는 중…';
        try {
          const made = await store.createAreas(defs, localTimeZone());
          showToast(made.length ? `영역 ${made.length}개를 만들었습니다` : '할 일 목록을 맞췄습니다');
          close();
        } catch (err) {
          showToast('영역을 만들지 못했습니다: ' + err.message, 'error');
          e.target.disabled = false;
          e.target.textContent = '만들기';
        }
      });
    },
  });
}

// ───────── 입력·변경 이벤트 ─────────
function setupListeners() {
  document.addEventListener('input', (e) => {
    const t = e.target;
    if (t.id === 'quick-input') updatePreview(t);
    if (t.id === 'search-input') {
      clearTimeout(setupListeners.st);
      setupListeners.st = setTimeout(() => {
        history.replaceState(null, '', `#/search?q=${encodeURIComponent(t.value)}`);
        render();
      }, 200);
    }
  });
  document.addEventListener('keydown', (e) => {
    const t = e.target;
    if (t.id === 'quick-input' && e.key === 'Enter' && !e.isComposing && e.keyCode !== 229) {
      e.preventDefault();
      doQuickAdd();
      return;
    }
    if (t.id === 'top-search' && e.key === 'Enter' && !e.isComposing) {
      location.hash = `#/search?q=${encodeURIComponent(t.value)}`;
      t.value = '';
      t.blur();
      return;
    }
    // 단축키 (입력 중·모달 중 제외)
    if (modalOpen() || /INPUT|TEXTAREA|SELECT/.test(t.tagName) || e.ctrlKey || e.metaKey || e.altKey) return;
    const k = e.key.toLowerCase();
    if (k === 'n') {
      e.preventDefault();
      openEventEditor();
    } else if (k === 't') {
      e.preventDefault();
      openTaskEditor();
    } else if (k === '/') {
      e.preventDefault();
      const s = document.getElementById('top-search');
      if (s && s.offsetParent) s.focus();
      else location.hash = '#/search';
    } else if (/^[1-5]$/.test(k)) location.hash = '#' + NAV[+k - 1][0];
  });
  document.addEventListener('change', (e) => {
    const t = e.target;
    const a = t.dataset.actionChange;
    if (!a) return;
    if (a === 'toggle-cal') toggleHidden(t.dataset.id);
    if (a === 'show-done') prefs.showDone = t.checked;
    if (a === 'default-cal') prefs.defaultCal = t.value;
    if (a === 'routine-cal') ls.set('sh.routineCal', t.value);
    if (a === 'def-rem') prefs.defReminder = +t.value;
    if (a === 'rt-month') prefs.routinesInMonth = t.checked;
    render();
  });
  window.addEventListener('hashchange', () => {
    render();
    const { path, params } = route();
    if (path === '/calendar') ensureForParams(params);
  });
  window.addEventListener('online', () => {
    store.setOnline(true);
    if (gapi.hasToken()) store.sync();
  });
  window.addEventListener('offline', () => store.setOnline(false));
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    if (gapi.hasToken()) {
      if (Date.now() - state.lastSync > 2 * 60_000 || state.outbox.length) store.sync();
    } else if (!DEMO && auth.shouldSilentRenew() && !modalOpen() && !/INPUT|TEXTAREA/.test(document.activeElement?.tagName || '')) {
      auth.startLogin({ silent: true });
    }
    render();
  });
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredInstall = e;
    ctx.canInstall = true;
    if (route().path === '/settings') render();
  });
  window.addEventListener('appinstalled', () => showToast('앱이 설치되었습니다'));
  matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', () => applyTheme());
  let lastWide = !isMobile();
  window.addEventListener('resize', () => {
    const w = !isMobile();
    if (w !== lastWide) {
      lastWide = w;
      render();
    }
  });
}

const AUTH_ERR = {
  access_denied: '권한 요청이 거부되었습니다. 캘린더·할 일 권한을 모두 허용해 주세요.',
  state_mismatch: '보안 확인에 실패했습니다. 다시 시도하세요.',
  invalid_client: '클라이언트 ID가 올바르지 않습니다.',
  unauthorized_client: '이 클라이언트 ID에 리디렉션 URI가 등록되지 않았습니다.',
};

function registerSW() {
  if (!('serviceWorker' in navigator) || !/^https?:$/.test(location.protocol)) return;
  try {
    navigator.serviceWorker
      .register('sw.js')
      .then((reg) => {
        reg.addEventListener('updatefound', () => {
          const nw = reg.installing;
          nw &&
            nw.addEventListener('statechange', () => {
              if (nw.state === 'installed' && navigator.serviceWorker.controller)
                showToast('새 버전이 준비되었습니다', 'info', { label: '새로고침', fn: () => location.reload() });
            });
        });
      })
      .catch(() => {});
  } catch {
    /* 지원 안 함 */
  }
}

async function setupDemo() {
  db.setDbName('schedule-hub-demo');
  await db.clearAll();
  const { createMock, mockTransport } = await import('./mock.js');
  const mock = createMock({ now: new Date(), tz: localTimeZone() });
  gapi.setTransport(mockTransport(mock), () => 'demo-token');
  window.__mock = mock;
}

// ───────── 시작 ─────────
async function boot() {
  applyTheme();
  bindActions(document);
  registerActions();
  setupListeners();
  if (DEMO) await setupDemo();
  const r = DEMO ? null : auth.handleRedirect();
  await store.load();
  store.subscribe(() => render());
  store.onToast((m, k) => showToast(m, k));
  render();
  document.getElementById('app').removeAttribute('aria-busy');

  if (r && !r.ok && !r.silent) showToast(`Google 연결 실패: ${AUTH_ERR[r.error] || r.error}`, 'error');
  if (r && r.ok && !r.silent) showToast('Google 계정이 연결되었습니다');

  if (DEMO) {
    store.setAuth('ok');
    await store.sync();
  } else if (gapi.hasToken()) {
    store.setAuth('ok');
    store.sync();
  } else if (auth.shouldSilentRenew() && !(r && !r.ok)) {
    auth.startLogin({ silent: true });
    return;
  } else if (auth.isConnectedBefore()) store.setAuth('expired');

  const { path, params } = route();
  if (path === '/calendar') ensureForParams(params);
  registerSW();

  let ticks = 0;
  setInterval(() => {
    ticks++;
    if (document.visibilityState !== 'visible') return;
    if (!modalOpen()) render(); // 현재 시각 표시선 갱신
    if (ticks % 5 === 0 && gapi.hasToken()) store.sync();
  }, 60_000);
}

boot();
