// 데모/테스트용 모의 Google Calendar·Tasks 서버 (메모리)
// 실제 API와 같은 REST 경로·응답 형식을 흉내 낸다. 브라우저(데모 모드)와 Node(테스트) 양쪽에서 동작.
import { parseRRule, evStart, evEnd, addDays, startOfDay, ymd, toRFC3339, pad, BYDAY, parseYMD } from './dates.js';

const b32 = 'abcdefghijklmnopqrstuv0123456789';
let seq = 0;
function gid(n = 16) {
  let s = '';
  for (let i = 0; i < n; i++) s += b32[Math.floor(Math.random() * 32)];
  return s + (seq++).toString(32);
}
const clone = (o) => JSON.parse(JSON.stringify(o));
function merge(a, b) {
  const out = { ...(a || {}) };
  for (const [k, v] of Object.entries(b || {})) {
    if (v && typeof v === 'object' && !Array.isArray(v) && out[k] && typeof out[k] === 'object' && !Array.isArray(out[k])) out[k] = merge(out[k], v);
    else out[k] = v;
  }
  return out;
}
const utcStamp = (d) =>
  `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;

export function createMock({ now = new Date(), areas = true, tz = 'Asia/Seoul', familyList = true } = {}) {
  const T = startOfDay(now);
  const db = { cals: [], events: {}, overrides: {}, lists: [], tasks: {} };
  const addCal = (id, summary, color, extra = {}) => {
    db.cals.push({ id, summary, backgroundColor: color, foregroundColor: '#ffffff', accessRole: 'owner', timeZone: tz, ...extra });
    db.events[id] = {};
    db.overrides[id] = {};
    return id;
  };
  const at = (dayOff, h, m = 0) => {
    const d = addDays(T, dayOff);
    d.setHours(h, m, 0, 0);
    return d;
  };
  const timed = (cal, summary, dayOff, h, m, durMin, extra = {}) => {
    const s = at(dayOff, h, m);
    const e = new Date(s.getTime() + durMin * 60000);
    return insertEvent(cal, { summary, start: { dateTime: toRFC3339(s), timeZone: tz }, end: { dateTime: toRFC3339(e), timeZone: tz }, ...extra });
  };
  const allday = (cal, summary, dayOff, days = 1, extra = {}) =>
    insertEvent(cal, { summary, start: { date: ymd(addDays(T, dayOff)) }, end: { date: ymd(addDays(T, dayOff + days)) }, ...extra });
  const addList = (title) => {
    const id = gid(10);
    db.lists.push({ id, title, kind: 'tasks#taskList' });
    db.tasks[id] = {};
    return id;
  };
  const addTask = (list, title, dueOff, extra = {}) => {
    const id = gid(12);
    const t = { id, title, status: 'needsAction', position: String(Object.keys(db.tasks[list]).length).padStart(8, '0'), ...extra };
    if (dueOff != null) t.due = `${ymd(addDays(T, dueOff))}T00:00:00.000Z`;
    db.tasks[list][id] = t;
    return t;
  };

  // ---------- 시드 데이터 ----------
  const P = addCal('demo@example.com', 'demo@example.com', '#7986CB', { primary: true });
  const FAM = addCal(gid() + '@group.calendar.google.com', '가족', '#E67C73');
  const HOL = addCal('ko.south_korea#holiday@group.v.calendar.google.com', '대한민국의 휴일', '#0B8043', { accessRole: 'reader' });
  const Y = T.getFullYear();
  for (const [md, n] of [['01-01', '신정'], ['03-01', '삼일절'], ['05-05', '어린이날'], ['06-06', '현충일'], ['08-15', '광복절'], ['10-03', '개천절'], ['10-09', '한글날'], ['12-25', '기독탄신일']]) {
    const d = parseYMD(`${Y}-${md}`);
    insertEvent(HOL, { summary: n, start: { date: ymd(d) }, end: { date: ymd(addDays(d, 1)) } });
  }
  const DEF = addList('내 할 일');
  const LF = familyList ? addList('가족') : null; // familyList:false = 실제 계정처럼 '가족' 캘린더만 있고 할 일 목록은 없는 상태
  timed(P, '주간 경영회의', 0, 10, 0, 60, { location: '본사 회의실' });
  timed(P, '세무사 미팅', -2, 15, 0, 60);
  timed(FAM, '가족 저녁 식사', 0, 19, 0, 120);
  addTask(DEF, '사업자등록 서류 준비', -1, { notes: '우선순위:높음' });
  if (LF) addTask(LF, '어머니 생신 선물 준비', 6);
  if (areas) {
    const F = addCal(gid() + '@group.calendar.google.com', '대동·외식', '#F4511E');
    const C = addCal(gid() + '@group.calendar.google.com', '대동·건설', '#3F51B5');
    const S = addCal(gid() + '@group.calendar.google.com', '대동·심리상담', '#0B8043');
    const ME = addCal(gid() + '@group.calendar.google.com', '개인', '#039BE5');
    const R = addCal(gid() + '@group.calendar.google.com', '루틴', '#8E24AA');
    timed(C, '현장 점검 — 성수동 리모델링', 0, 14, 0, 90, { location: '성수동' });
    timed(F, '신메뉴 시식회', 1, 11, 0, 60, { location: '1호점' });
    timed(S, '상담센터 인테리어 미팅', 1, 15, 0, 60);
    allday(C, '자재 발주 마감', 2);
    timed(ME, '투자 검토 미팅', 3, 9, 30, 60);
    allday(ME, '부산 출장', 5, 2);
    timed(P, '대동 창립 준비 모임', 9, 18, 0, 120);
    const thu = (4 - T.getDay() + 7) % 7;
    timed(C, '주간 현장회의', thu - 14, 10, 0, 60, { recurrence: ['RRULE:FREQ=WEEKLY;BYDAY=TH'] });
    const r1 = timed(R, '아침 운동', -20, 7, 0, 30, { recurrence: ['RRULE:FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR'] });
    const r2 = timed(R, '독서 30분', -20, 22, 0, 30, { recurrence: ['RRULE:FREQ=DAILY'] });
    const sun = (0 - T.getDay() + 7) % 7;
    timed(R, '주간 회고', sun - 21, 20, 0, 30, { recurrence: ['RRULE:FREQ=WEEKLY;BYDAY=SU'] });
    // 지난 회차 체크 기록
    for (const m of [r1, r2]) {
      const inst = expand(R, m, addDays(T, -21), T);
      inst.forEach((ev, i) => {
        if ((i + (m === r1 ? 1 : 0)) % 5 !== 3) db.overrides[R][ev.id] = merge(ev, { extendedProperties: { private: { shDone: '1' } } });
      });
    }
    const LFo = addList('대동·외식');
    const LC = addList('대동·건설');
    const LS = addList('대동·심리상담');
    const LM = addList('개인');
    addTask(LC, '견적서 회신 (성수동)', 0);
    addTask(LFo, '메뉴 원가표 정리', 2);
    addTask(LS, '상담사 채용 공고 작성', 4, { notes: '자격 요건 정리\n우선순위:높음' });
    addTask(LM, '건강검진 예약', null);
    addTask(LC, '인테리어 업체 비교', -2, { status: 'completed', completed: addDays(now, -1).toISOString() });
  }

  // ---------- 이벤트 ----------
  function insertEvent(cal, body) {
    const id = body.id || gid();
    const ev = { kind: 'calendar#event', status: 'confirmed', reminders: { useDefault: true }, ...clone(body), id, htmlLink: `https://calendar.google.com/calendar/event?eid=${id}`, updated: new Date().toISOString() };
    db.events[cal][id] = ev;
    return ev;
  }

  function occurrences(master, from, to) {
    const r = parseRRule(master.recurrence);
    const s0 = evStart(master);
    if (!r) return [s0];
    const out = [];
    const until = r.until ? new Date(r.until.replace(/^(\d{4})(\d\d)(\d\d).*$/, '$1-$2-$3T23:59:59')) : null;
    const count = r.count ? Number(r.count) : Infinity;
    const days = r.byday.length ? r.byday.map((b) => BYDAY.indexOf(b)) : [s0.getDay()];
    const interval = r.interval || 1;
    let n = 0;
    for (let i = 0; i < 3000; i++) {
      const d = addDays(s0, i);
      if (d >= to || (until && d > until) || n >= count) break;
      let hit = false;
      if (r.freq === 'DAILY') hit = i % interval === 0;
      else if (r.freq === 'WEEKLY') hit = days.includes(d.getDay()) && Math.floor(i / 7) % interval === 0;
      else if (r.freq === 'MONTHLY') hit = d.getDate() === s0.getDate();
      else if (r.freq === 'YEARLY') hit = d.getDate() === s0.getDate() && d.getMonth() === s0.getMonth();
      if (hit) {
        n++;
        out.push(d);
      }
    }
    return out;
  }

  function instanceFor(cal, master, os) {
    const allDay = !!master.start.date;
    const dur = evEnd(master) - evStart(master);
    const id = `${master.id}_${allDay ? ymd(os).replace(/-/g, '') : utcStamp(os)}`;
    const base = clone(master);
    delete base.recurrence;
    Object.assign(base, {
      id,
      recurringEventId: master.id,
      originalStartTime: allDay ? { date: ymd(os) } : { dateTime: toRFC3339(os), timeZone: master.start.timeZone },
      start: allDay ? { date: ymd(os) } : { dateTime: toRFC3339(os), timeZone: master.start.timeZone },
      end: allDay ? { date: ymd(addDays(os, Math.round(dur / 86400000))) } : { dateTime: toRFC3339(new Date(os.getTime() + dur)), timeZone: master.end.timeZone },
    });
    const ov = db.overrides[cal][id];
    if (ov && ov.status === 'cancelled') return null;
    return ov ? merge(base, { ...ov, id, recurringEventId: master.id }) : base;
  }

  function expand(cal, master, from, to) {
    if (!master.recurrence) return [master];
    return occurrences(master, from, to)
      .map((os) => instanceFor(cal, master, os))
      .filter(Boolean)
      .filter((ev) => evStart(ev) < to && (evEnd(ev) > from || evStart(ev) >= from));
  }

  function findInstance(cal, id) {
    const [mid] = id.split('_');
    const master = db.events[cal][mid];
    if (!master || !master.recurrence) return null;
    const ov = db.overrides[cal][id];
    if (ov) return ov.status === 'cancelled' ? null : { master, inst: ov };
    const stamp = id.slice(mid.length + 1);
    let os;
    if (/^\d{8}$/.test(stamp)) os = parseYMD(`${stamp.slice(0, 4)}-${stamp.slice(4, 6)}-${stamp.slice(6, 8)}`);
    else os = new Date(`${stamp.slice(0, 4)}-${stamp.slice(4, 6)}-${stamp.slice(6, 8)}T${stamp.slice(9, 11)}:${stamp.slice(11, 13)}:${stamp.slice(13, 15)}Z`);
    const inst = instanceFor(cal, master, os);
    return inst ? { master, inst } : null;
  }

  // ---------- 라우팅 ----------
  const ok = (body, status = 200) => ({ status, body });
  const nf = () => ({ status: 404, body: { error: { code: 404, message: 'Not Found' } } });

  function handle(method, urlStr, bodyText) {
    const u = new URL(urlStr);
    const q = u.searchParams;
    const body = bodyText ? (typeof bodyText === 'string' ? JSON.parse(bodyText) : bodyText) : null;
    const p = decodeURIComponent(u.pathname);
    let m;
    if (method === 'OPTIONS') return { status: 204, body: null };

    // Calendar list
    if (p === '/calendar/v3/users/me/calendarList' && method === 'GET') return ok({ items: clone(db.cals) });
    if ((m = p.match(/^\/calendar\/v3\/users\/me\/calendarList\/(.+)$/)) && method === 'PATCH') {
      const c = db.cals.find((x) => x.id === m[1]);
      if (!c) return nf();
      Object.assign(c, body);
      return ok(clone(c));
    }
    if (p === '/calendar/v3/calendars' && method === 'POST') {
      const id = addCal(gid() + '@group.calendar.google.com', body.summary, '#9E69AF', { timeZone: body.timeZone || tz });
      return ok({ id, summary: body.summary, timeZone: body.timeZone });
    }
    if ((m = p.match(/^\/calendar\/v3\/calendars\/([^/]+)\/events\/([^/]+)\/move$/)) && method === 'POST') {
      const [, cal, id] = m;
      const dest = q.get('destination');
      const ev = db.events[cal] && db.events[cal][id];
      if (!ev || !db.events[dest]) return nf();
      delete db.events[cal][id];
      db.events[dest][id] = ev;
      for (const [k, v] of Object.entries(db.overrides[cal])) if (k.startsWith(id + '_')) {
        db.overrides[dest][k] = v;
        delete db.overrides[cal][k];
      }
      return ok(clone(ev));
    }
    if ((m = p.match(/^\/calendar\/v3\/calendars\/([^/]+)\/events$/))) {
      const cal = m[1];
      if (!db.events[cal]) return nf();
      if (method === 'GET') {
        const from = q.get('timeMin') ? new Date(q.get('timeMin')) : addDays(T, -365);
        const to = q.get('timeMax') ? new Date(q.get('timeMax')) : addDays(T, 365);
        let items = [];
        for (const master of Object.values(db.events[cal])) items.push(...expand(cal, master, from, to));
        items = items.filter((ev) => evStart(ev) < to && (evEnd(ev) > from || evStart(ev) >= from));
        items.sort((a, b) => evStart(a) - evStart(b));
        return ok({ items: clone(items) });
      }
      if (method === 'POST') return ok(clone(insertEvent(cal, body)));
    }
    if ((m = p.match(/^\/calendar\/v3\/calendars\/([^/]+)\/events\/([^/]+)$/))) {
      const [, cal, id] = m;
      if (!db.events[cal]) return nf();
      const master = db.events[cal][id];
      if (method === 'GET') {
        if (master) return ok(clone(master));
        const f = findInstance(cal, id);
        return f ? ok(clone(f.inst)) : nf();
      }
      if (method === 'PATCH') {
        if (master) {
          db.events[cal][id] = merge(master, body);
          if (body.recurrence) db.events[cal][id].recurrence = body.recurrence;
          db.events[cal][id].updated = new Date().toISOString();
          return ok(clone(db.events[cal][id]));
        }
        const f = findInstance(cal, id);
        if (!f) return nf();
        const merged = merge(f.inst, body);
        db.overrides[cal][id] = merged;
        return ok(clone(merged));
      }
      if (method === 'DELETE') {
        if (master) {
          delete db.events[cal][id];
          for (const k of Object.keys(db.overrides[cal])) if (k.startsWith(id + '_')) delete db.overrides[cal][k];
          return { status: 204, body: null };
        }
        const f = findInstance(cal, id);
        if (!f) return { status: 410, body: { error: { code: 410, message: 'Resource has been deleted' } } };
        db.overrides[cal][id] = { status: 'cancelled' };
        return { status: 204, body: null };
      }
    }

    // Tasks
    if (p === '/tasks/v1/users/@me/lists') {
      if (method === 'GET') return ok({ items: clone(db.lists) });
      if (method === 'POST') {
        const id = addList(body.title);
        return ok(clone(db.lists.find((l) => l.id === id)));
      }
    }
    if ((m = p.match(/^\/tasks\/v1\/lists\/([^/]+)\/tasks$/))) {
      const l = m[1];
      if (!db.tasks[l]) return nf();
      if (method === 'GET') return ok({ items: clone(Object.values(db.tasks[l])) });
      if (method === 'POST') {
        const t = addTask(l, body.title, null, body);
        return ok(clone(t));
      }
    }
    if ((m = p.match(/^\/tasks\/v1\/lists\/([^/]+)\/tasks\/([^/]+)$/))) {
      const [, l, id] = m;
      const t = db.tasks[l] && db.tasks[l][id];
      if (!t) return nf();
      if (method === 'PATCH') {
        for (const [k, v] of Object.entries(body)) {
          if (v === null) delete t[k];
          else t[k] = v;
        }
        if (body.status === 'needsAction') delete t.completed;
        return ok(clone(t));
      }
      if (method === 'DELETE') {
        delete db.tasks[l][id];
        return { status: 204, body: null };
      }
    }
    return { status: 400, body: { error: { code: 400, message: `mock: unsupported ${method} ${p}` } } };
  }

  return { handle, db };
}

// 브라우저 fetch 대체 (데모 모드)
export function mockTransport(mock, { latency = 120 } = {}) {
  return async (url, init = {}) => {
    await new Promise((r) => setTimeout(r, latency));
    const r = mock.handle(init.method || 'GET', url, init.body);
    return new Response(r.body == null ? null : JSON.stringify(r.body), {
      status: r.status,
      headers: { 'Content-Type': 'application/json' },
    });
  };
}
