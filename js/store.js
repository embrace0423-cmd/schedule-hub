// 상태 저장소 + 동기화 엔진
// - 화면은 항상 로컬 캐시(IndexedDB)에서 즉시 그린다.
// - 변경은 로컬에 먼저 반영(낙관적)하고 outbox 에 쌓은 뒤 Google 로 순차 전송한다.
// - 오프라인/토큰 만료 시 outbox 가 보존되며, 연결되면 자동으로 이어서 전송된다.
import * as db from './db.js';
import * as auth from './auth.js';
import { cal, tasks as tapi, hasToken } from './gapi.js';
import { addDays, addMonths, startOfMonth, overlapsRange, evStart, toRFC3339 } from './dates.js';

export const state = {
  loaded: false,
  calendars: [], // [{id, summary, backgroundColor, accessRole, primary}]
  events: {}, // calId -> { eventId -> event(+_cal) }
  ranges: [], // 캐시된 기간 [[fromMs, toMs]]
  tasklists: [], // [{id, title}]
  tasks: {}, // listId -> { taskId -> task(+_list) }
  outbox: [],
  lastSync: 0,
  syncing: false,
  authState: 'none', // none | ok | expired
  online: typeof navigator === 'undefined' ? true : navigator.onLine !== false,
  error: null,
  rev: 0,
};

// ---------------- 구독 ----------------
const subs = new Set();
export function subscribe(fn) {
  subs.add(fn);
  return () => subs.delete(fn);
}
let queued = false;
export function notify() {
  state.rev++;
  if (queued) return;
  queued = true;
  queueMicrotask(() => {
    queued = false;
    subs.forEach((f) => {
      try {
        f(state);
      } catch (e) {
        console.error(e);
      }
    });
  });
}

const toasts = new Set();
export function onToast(fn) {
  toasts.add(fn);
}
export function toast(msg, kind = 'info') {
  toasts.forEach((f) => f(msg, kind));
}

// ---------------- 영속화 ----------------
let saveTimer = null;
function persist() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    db.set('cache', {
      calendars: state.calendars,
      events: state.events,
      ranges: state.ranges,
      tasklists: state.tasklists,
      tasks: state.tasks,
      lastSync: state.lastSync,
    });
  }, 250);
}
function saveOutbox() {
  db.set('outbox', state.outbox);
}

export async function load() {
  const c = await db.get('cache', null);
  if (c) Object.assign(state, c);
  state.outbox = (await db.get('outbox', [])) || [];
  state.loaded = true;
  notify();
}

export async function resetLocal() {
  state.calendars = [];
  state.events = {};
  state.ranges = [];
  state.tasklists = [];
  state.tasks = {};
  state.outbox = [];
  state.lastSync = 0;
  await db.del('cache');
  await db.del('outbox');
  notify();
}

// ---------------- 유틸 ----------------
const rid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
const isTmp = (id) => String(id).startsWith('tmp_');
export const clone = (o) => (o == null ? o : JSON.parse(JSON.stringify(o)));

export function deepMerge(a, b) {
  if (b === null || typeof b !== 'object' || Array.isArray(b)) return clone(b);
  const out = a && typeof a === 'object' && !Array.isArray(a) ? { ...a } : {};
  for (const [k, v] of Object.entries(b)) {
    out[k] = v && typeof v === 'object' && !Array.isArray(v) ? deepMerge(out[k], v) : clone(v);
  }
  return out;
}

function stripLocal(o) {
  const r = {};
  for (const [k, v] of Object.entries(o || {})) if (!k.startsWith('_')) r[k] = v;
  return r;
}

function pendingIds() {
  const s = new Set();
  for (const op of state.outbox) {
    s.add(op.id);
    if (op.master) s.add(op.master);
  }
  return s;
}

// ---------------- 조회 ----------------
export function allEvents() {
  const out = [];
  for (const [calId, m] of Object.entries(state.events)) {
    for (const ev of Object.values(m)) if (ev.status !== 'cancelled') out.push(ev._cal ? ev : { ...ev, _cal: calId });
  }
  return out;
}

export function eventsInRange(from, to, filterFn) {
  return allEvents()
    .filter((e) => overlapsRange(e, from, to) && (!filterFn || filterFn(e)))
    .sort((a, b) => evStart(a) - evStart(b) || (a.summary || '').localeCompare(b.summary || ''));
}

export function getEvent(calId, id) {
  return (state.events[calId] || {})[id] || null;
}

export function allTasks() {
  const out = [];
  for (const [listId, m] of Object.entries(state.tasks)) {
    for (const t of Object.values(m)) if (!t.deleted) out.push(t._list ? t : { ...t, _list: listId });
  }
  return out;
}

export function getTask(listId, id) {
  return (state.tasks[listId] || {})[id] || null;
}

function putEvent(calId, ev) {
  (state.events[calId] ||= {})[ev.id] = { ...ev, _cal: calId };
}
function removeEvent(calId, id) {
  if (state.events[calId]) delete state.events[calId][id];
}
function putTask(listId, t) {
  (state.tasks[listId] ||= {})[t.id] = { ...t, _list: listId };
}
function removeTask(listId, id) {
  if (state.tasks[listId]) delete state.tasks[listId][id];
}

// ---------------- outbox ----------------
let inflight = null;
function enqueue(op) {
  const ob = state.outbox;
  if (isTmp(op.id) && /\.(patch|delete|move)$/.test(op.t)) {
    const ins = ob.find((o) => o.id === op.id && o.t.endsWith('.insert') && o !== inflight);
    if (ins) {
      if (op.t.endsWith('.delete')) state.outbox = ob.filter((o) => o.id !== op.id);
      else if (op.t.endsWith('.patch')) ins.body = deepMerge(ins.body, op.body);
      else if (op.t === 'ev.move') ins.cal = op.dest;
      saveOutbox();
      persist();
      notify();
      return;
    }
  }
  ob.push({ ...op, at: Date.now(), n: 0 });
  saveOutbox();
  persist();
  notify();
  scheduleFlush();
}

let flushTimer = null;
function scheduleFlush(delay = 50) {
  clearTimeout(flushTimer);
  flushTimer = setTimeout(() => flush(), delay);
}

async function runOp(op) {
  switch (op.t) {
    case 'ev.insert':
      return cal.insertEvent(op.cal, op.body);
    case 'ev.patch':
      return cal.patchEvent(op.cal, op.id, op.body);
    case 'ev.move':
      return cal.moveEvent(op.cal, op.id, op.dest);
    case 'ev.delete':
      return cal.deleteEvent(op.cal, op.id);
    case 'task.insert':
      return tapi.insert(op.list, op.body);
    case 'task.patch':
      return tapi.patch(op.list, op.id, op.body);
    case 'task.delete':
      return tapi.remove(op.list, op.id);
    default:
      throw new Error('unknown op ' + op.t);
  }
}

function rewriteIds(oldId, newId) {
  for (const o of state.outbox) if (o.id === oldId) o.id = newId;
}
function othersPending(id) {
  return state.outbox.some((o) => o !== inflight && o.id === id);
}

function applyResult(op, res) {
  switch (op.t) {
    case 'ev.insert': {
      const local = getEvent(op.cal, op.id);
      removeEvent(op.cal, op.id);
      rewriteIds(op.id, res.id);
      // 이후 대기 중인 변경이 있으면 로컬 내용 유지
      putEvent(op.cal, othersPending(res.id) && local ? { ...local, id: res.id } : res);
      break;
    }
    case 'ev.patch':
      if (!op.series && res && !othersPending(op.id)) putEvent(op.cal, res);
      break;
    case 'ev.move': {
      const local = getEvent(op.cal, op.id) || getEvent(op.dest, op.id);
      removeEvent(op.cal, op.id);
      for (const o of state.outbox) if (o !== inflight && o.id === op.id) o.cal = op.dest;
      if (!op.series) putEvent(op.dest, res && !othersPending(op.id) ? res : local || res);
      break;
    }
    case 'task.insert': {
      const local = getTask(op.list, op.id);
      removeTask(op.list, op.id);
      rewriteIds(op.id, res.id);
      putTask(op.list, othersPending(res.id) && local ? { ...local, id: res.id } : res);
      break;
    }
    case 'task.patch':
      if (res && !othersPending(op.id)) putTask(op.list, res);
      break;
    default:
      break;
  }
}

function undoLocal(op) {
  // 영구 실패한 변경은 로컬에서 되돌리고 다음 pull 로 서버 상태를 다시 받는다.
  if (op.t === 'ev.insert') removeEvent(op.cal, op.id);
  if (op.t === 'task.insert') removeTask(op.list, op.id);
}

const OP_LABEL = {
  'ev.insert': '일정 추가',
  'ev.patch': '일정 수정',
  'ev.move': '일정 영역 이동',
  'ev.delete': '일정 삭제',
  'task.insert': '할 일 추가',
  'task.patch': '할 일 수정',
  'task.delete': '할 일 삭제',
};

let flushing = false;
let retryTimer = null;
export async function flush() {
  if (flushing || !state.outbox.length) return;
  if (!hasToken()) {
    if (auth.isConnectedBefore()) setAuth('expired');
    return;
  }
  flushing = true;
  setSyncing(true);
  let needPull = false;
  try {
    while (state.outbox.length) {
      const op = state.outbox[0];
      inflight = op;
      try {
        const res = await runOp(op);
        applyResult(op, res);
        if (op.series || (op.t === 'ev.insert' && op.body && op.body.recurrence)) needPull = true;
        state.outbox.shift();
        setOnline(true);
      } catch (e) {
        if (e.isAuth) {
          onAuthExpired();
          break;
        }
        if (e.isNetwork) {
          setOnline(false);
          break;
        }
        if (e.isRetryable && op.n < 5) {
          op.n++;
          clearTimeout(retryTimer);
          retryTimer = setTimeout(() => flush(), 5000 * op.n);
          break;
        }
        state.outbox.shift();
        undoLocal(op);
        needPull = true;
        toast(`${OP_LABEL[op.t] || '동기화'} 실패: ${e.message}`, 'error');
      } finally {
        inflight = null;
        saveOutbox();
        persist();
        notify();
      }
    }
  } finally {
    flushing = false;
    setSyncing(false);
  }
  if (needPull) {
    if (pulling) repullRequested = true;
    else await pull();
  }
}

// ---------------- 상태 플래그 ----------------
function setSyncing(v) {
  state.syncing = v;
  notify();
}
export function setOnline(v) {
  if (state.online !== v) {
    state.online = v;
    notify();
  }
}
export function setAuth(v) {
  if (state.authState !== v) {
    state.authState = v;
    notify();
  }
}
function onAuthExpired() {
  auth.markExpired();
  setAuth('expired');
}

// ---------------- 가져오기(pull) ----------------
const sessionRanges = [];
export function baseWindow(now = new Date()) {
  const from = addDays(addMonths(startOfMonth(now), -1), -7);
  const to = addMonths(startOfMonth(now), 5);
  return [from.getTime(), to.getTime()];
}

function covered(from, to) {
  return state.ranges.some(([a, b]) => a <= from && b >= to);
}
function addRange(from, to) {
  const rs = [...state.ranges, [from, to]].sort((x, y) => x[0] - y[0]);
  const merged = [];
  for (const r of rs) {
    const last = merged[merged.length - 1];
    if (last && r[0] <= last[1]) last[1] = Math.max(last[1], r[1]);
    else merged.push([...r]);
  }
  state.ranges = merged;
}

async function mapLimit(items, limit, fn) {
  const out = [];
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await fn(items[idx], idx);
    }
  });
  await Promise.all(workers);
  return out;
}

function replaceWindow(calId, from, to, items, pend) {
  const m = (state.events[calId] ||= {});
  for (const [id, ev] of Object.entries(m)) {
    if (pend.has(id) || (ev.recurringEventId && pend.has(ev.recurringEventId))) continue;
    if (overlapsRange(ev, new Date(from), new Date(to))) delete m[id];
  }
  for (const ev of items) {
    if (ev.status === 'cancelled') continue;
    if (pend.has(ev.id)) continue;
    m[ev.id] = { ...ev, _cal: calId };
  }
}

async function fetchWindows(calendars, windows) {
  const results = await mapLimit(
    calendars.flatMap((c) => windows.map((w) => [c, w])),
    4,
    async ([c, [from, to]]) => {
      const items = await cal.listEvents(c.id, toRFC3339(new Date(from)), toRFC3339(new Date(to)));
      return { c, from, to, items };
    }
  );
  const pend = pendingIds();
  for (const r of results) replaceWindow(r.c.id, r.from, r.to, r.items, pend);
  for (const [from, to] of windows) addRange(from, to);
}

let pulling = null;
let repullRequested = false;
export function pull() {
  if (pulling) return pulling;
  if (!hasToken()) {
    if (auth.isConnectedBefore()) setAuth('expired');
    return Promise.resolve();
  }
  pulling = (async () => {
    setSyncing(true);
    try {
      if (state.outbox.length && !flushing) await flush();
      const list = await cal.listCalendars();
      state.calendars = list.map((c) => ({
        id: c.id,
        summary: c.summaryOverride || c.summary || c.id,
        backgroundColor: c.backgroundColor || '#4285f4',
        foregroundColor: c.foregroundColor || '#ffffff',
        accessRole: c.accessRole,
        primary: !!c.primary,
        timeZone: c.timeZone,
      }));
      const primary = state.calendars.find((c) => c.primary);
      if (primary) auth.setEmail(primary.id);
      const ids = new Set(state.calendars.map((c) => c.id));
      for (const k of Object.keys(state.events)) if (!ids.has(k)) delete state.events[k];

      const windows = [baseWindow(), ...sessionRanges.slice(-6)];
      state.ranges = [];
      await fetchWindows(state.calendars, windows);

      const lists = await tapi.listLists();
      state.tasklists = lists.map((l) => ({ id: l.id, title: l.title }));
      const lids = new Set(state.tasklists.map((l) => l.id));
      for (const k of Object.keys(state.tasks)) if (!lids.has(k)) delete state.tasks[k];
      const pend = pendingIds();
      await mapLimit(state.tasklists, 3, async (l) => {
        const items = await tapi.list(l.id);
        const m = (state.tasks[l.id] ||= {});
        for (const id of Object.keys(m)) if (!pend.has(id)) delete m[id];
        for (const t of items) if (!pend.has(t.id) && !t.deleted) m[t.id] = { ...t, _list: l.id };
      });

      state.lastSync = Date.now();
      state.error = null;
      setAuth('ok');
      setOnline(true);
      persist();
    } catch (e) {
      if (e.isAuth) onAuthExpired();
      else if (e.isNetwork) setOnline(false);
      else {
        state.error = e.message;
        toast(`동기화 오류: ${e.message}`, 'error');
      }
    } finally {
      setSyncing(false);
      pulling = null;
      notify();
      if (repullRequested) {
        repullRequested = false;
        setTimeout(() => pull(), 300);
      }
    }
  })();
  return pulling;
}

/** 캘린더 화면에서 캐시 밖 기간을 볼 때 호출 */
export async function ensureRange(from, to) {
  const f = from.getTime();
  const t = to.getTime();
  if (covered(f, t)) return;
  if (!hasToken() || !state.calendars.length) return;
  sessionRanges.push([f, t]);
  try {
    setSyncing(true);
    await fetchWindows(state.calendars, [[f, t]]);
    persist();
  } catch (e) {
    if (e.isAuth) onAuthExpired();
    else if (e.isNetwork) setOnline(false);
  } finally {
    setSyncing(false);
  }
}

export async function sync() {
  await flush();
  await pull();
}

// ---------------- 일정 변경 ----------------
export function createEvent(calId, body) {
  const id = 'tmp_' + rid();
  putEvent(calId, { ...clone(body), id, _pending: true });
  enqueue({ t: 'ev.insert', cal: calId, id, body: clone(body) });
  return id;
}

export function updateEvent(calId, id, patch, { moveTo } = {}) {
  const ev = getEvent(calId, id);
  if (!ev) return;
  putEvent(calId, { ...deepMerge(ev, patch), _pending: true });
  enqueue({ t: 'ev.patch', cal: calId, id, body: clone(patch) });
  if (moveTo && moveTo !== calId) {
    const moved = getEvent(calId, id);
    removeEvent(calId, id);
    putEvent(moveTo, moved);
    enqueue({ t: 'ev.move', cal: calId, id, dest: moveTo });
  }
}

/** 반복 일정 전체 수정: 원본(master)을 패치하고, 화면엔 시간 외 필드만 즉시 반영 */
export function updateSeries(calId, masterId, patch, { moveTo } = {}) {
  const textual = {};
  for (const k of ['summary', 'description', 'location', 'reminders']) if (k in patch) textual[k] = patch[k];
  for (const ev of Object.values(state.events[calId] || {})) {
    if (ev.recurringEventId === masterId || ev.id === masterId) putEvent(calId, { ...deepMerge(ev, textual), _pending: true });
  }
  enqueue({ t: 'ev.patch', cal: calId, id: masterId, body: clone(patch), series: true });
  if (moveTo && moveTo !== calId) {
    for (const ev of Object.values(state.events[calId] || {})) {
      if (ev.recurringEventId === masterId || ev.id === masterId) {
        removeEvent(calId, ev.id);
        putEvent(moveTo, ev);
      }
    }
    enqueue({ t: 'ev.move', cal: calId, id: masterId, dest: moveTo, series: true });
  }
}

export function deleteEvent(calId, id) {
  removeEvent(calId, id);
  enqueue({ t: 'ev.delete', cal: calId, id });
}

export function deleteSeries(calId, masterId) {
  for (const ev of Object.values(state.events[calId] || {})) {
    if (ev.recurringEventId === masterId || ev.id === masterId) removeEvent(calId, ev.id);
  }
  enqueue({ t: 'ev.delete', cal: calId, id: masterId, series: true });
}

export async function fetchMaster(calId, masterId) {
  return cal.getEvent(calId, masterId);
}

// 루틴 체크 (반복 일정의 해당 회차에 완료 표시)
export function setRoutineDone(calId, instanceId, done) {
  updateEvent(calId, instanceId, { extendedProperties: { private: { shDone: done ? '1' : '0' } } });
}

// ---------------- 할 일 변경 ----------------
export function createTask(listId, body) {
  const id = 'tmp_' + rid();
  putTask(listId, { ...clone(body), id, status: body.status || 'needsAction', _pending: true });
  enqueue({ t: 'task.insert', list: listId, id, body: clone(body) });
  return id;
}

export function updateTask(listId, id, patch, { moveTo } = {}) {
  const t = getTask(listId, id);
  if (!t) return;
  if (moveTo && moveTo !== listId) {
    const full = { ...stripLocal(t), ...patch };
    const body = { title: full.title, notes: full.notes || undefined, due: full.due || undefined, status: full.status };
    if (full.status === 'completed' && full.completed) body.completed = full.completed;
    deleteTask(listId, id);
    return createTask(moveTo, body);
  }
  putTask(listId, { ...t, ...clone(patch), _pending: true });
  enqueue({ t: 'task.patch', list: listId, id, body: clone(patch) });
  return id;
}

export function setTaskDone(listId, id, done) {
  return updateTask(
    listId,
    id,
    done ? { status: 'completed', completed: new Date().toISOString() } : { status: 'needsAction', completed: null }
  );
}

export function deleteTask(listId, id) {
  removeTask(listId, id);
  enqueue({ t: 'task.delete', list: listId, id });
}

// ---------------- 영역(캘린더 + 할 일 목록) 만들기 ----------------
export async function createAreas(defs, timeZone) {
  const created = [];
  for (const d of defs) {
    let c = state.calendars.find((x) => x.summary === d.name);
    if (!c) {
      const res = await cal.insertCalendar(d.name, timeZone);
      try {
        await cal.setCalendarColor(res.id, d.color);
      } catch {
        /* 색상 실패는 무시 */
      }
      created.push(d.name);
    }
    if (!d.routine && !state.tasklists.find((l) => l.title === d.name)) {
      await tapi.insertList(d.name);
    }
  }
  await pull();
  return created;
}
