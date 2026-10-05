import { state, eventsInRange, ensureRange } from '../store.js';
import { calendarById, colorOf, hiddenCals, isRoutineCal } from '../areas.js';
import { esc, icon, isMobile } from '../ui.js';
import {
  startOfDay, addDays, startOfMonth, addMonths, startOfWeek, sameDay, ymd, parseYMD, isAllDay, evStart, evEnd,
  fmtMonth, fmtTime, WEEKDAYS, overlapsDay, dueToDate, fmtDate, pad,
} from '../dates.js';
import { eventRow, taskRow, sortTasks, openTasks } from './common.js';
import { prefs } from '../prefs.js';

const HOUR = 48;
const isHoliday = (calId) => /holiday/i.test(calId);

function visibleFilter() {
  const hidden = hiddenCals();
  return (e) => !hidden.has(e._cal);
}

export function calParams(params) {
  const v = params.get('v') || prefs.calView || (isMobile() ? 'month' : 'month');
  const d = params.get('d') ? parseYMD(params.get('d')) : startOfDay(new Date());
  const sel = params.get('s') ? parseYMD(params.get('s')) : null;
  return { v, d, sel };
}

export function calHref(v, d, sel) {
  return `#/calendar?v=${v}&d=${ymd(d)}${sel ? `&s=${ymd(sel)}` : ''}`;
}

export function renderCalendar(el, params) {
  const { v, d, sel } = calParams(params);
  const ws = prefs.weekStart;
  let title = fmtMonth(d);
  let prev, next;
  if (v === 'month') {
    prev = addMonths(startOfMonth(d), -1);
    next = addMonths(startOfMonth(d), 1);
  } else if (v === 'week') {
    const s = startOfWeek(d, ws);
    const e = addDays(s, 6);
    title = s.getMonth() === e.getMonth() ? `${fmtMonth(s)} ${s.getDate()}–${e.getDate()}일` : `${s.getMonth() + 1}/${s.getDate()} – ${e.getMonth() + 1}/${e.getDate()}`;
    prev = addDays(d, -7);
    next = addDays(d, 7);
  } else if (v === 'day') {
    title = fmtDate(d, true);
    prev = addDays(d, -1);
    next = addDays(d, 1);
  } else {
    title = `${fmtDate(d)}부터 30일`;
    prev = addDays(d, -30);
    next = addDays(d, 30);
  }
  const VIEWS = [
    ['month', '월'],
    ['week', '주'],
    ['day', '일'],
    ['list', '목록'],
  ];
  const tools = `<div class="cal-tools">
    <button class="btn icon" data-action="nav" data-href="${calHref(v, prev)}" aria-label="이전">${icon('left')}</button>
    <button class="btn" data-action="nav" data-href="${calHref(v, startOfDay(new Date()))}">오늘</button>
    <button class="btn icon" data-action="nav" data-href="${calHref(v, next)}" aria-label="다음">${icon('right')}</button>
    <h2>${title}</h2><span class="grow"></span>
    <div class="seg">${VIEWS.map(([k, l]) => `<button data-action="cal-view" data-v="${k}" data-d="${ymd(d)}" class="${k === v ? 'on' : ''}">${l}</button>`).join('')}</div>
  </div>`;

  let body = '';
  if (v === 'month') body = monthView(d, sel, ws);
  else if (v === 'week') body = timeGrid(startOfWeek(d, ws), 7);
  else if (v === 'day') body = timeGrid(startOfDay(d), 1) + `<div class="card day-panel"><header><h3>할 일 (마감 ${d.getMonth() + 1}/${d.getDate()})</h3></header><div class="body">${dayTasks(d) || '<div class="empty">없음</div>'}</div></div>`;
  else body = listView(d);
  el.innerHTML = tools + body;

  if (v === 'week' || v === 'day') {
    const sc = el.querySelector('.tg-scroll');
    if (sc && !sc.dataset.scrolled) {
      const now = new Date();
      sc.scrollTop = Math.max(0, (sameDay(now, d) || v === 'week' ? Math.max(now.getHours() - 2, 7) : 8) * HOUR - 8);
      sc.dataset.scrolled = '1';
    }
  }
}

// 렌더 이후 필요한 기간을 비동기로 확보
export function ensureForParams(params) {
  const { v, d } = calParams(params);
  const ws = prefs.weekStart;
  if (v === 'month') {
    const s = startOfWeek(startOfMonth(d), ws);
    return ensureRange(s, addDays(s, 42));
  }
  if (v === 'week') {
    const s = startOfWeek(d, ws);
    return ensureRange(s, addDays(s, 7));
  }
  if (v === 'day') return ensureRange(startOfDay(d), addDays(startOfDay(d), 1));
  return ensureRange(startOfDay(d), addDays(startOfDay(d), 30));
}

function dayTasks(d) {
  const ts = sortTasks(openTasks().filter((t) => t.due && sameDay(dueToDate(t.due), d)));
  return ts.map((t) => taskRow(t)).join('');
}

// ───────── 월 보기 ─────────
function monthView(d, sel, ws) {
  const start = startOfWeek(startOfMonth(d), ws);
  const end = addDays(start, 42);
  const base = visibleFilter();
  const vis = prefs.routinesInMonth ? base : (e) => base(e) && !isRoutineCal(calendarById(state, e._cal));
  const evs = eventsInRange(start, end, vis);
  const today = startOfDay(new Date());
  const selected = sel || (d.getMonth() === today.getMonth() && d.getFullYear() === today.getFullYear() ? today : startOfMonth(d));
  const maxChips = isMobile() ? 3 : 4;
  let cells = '';
  for (let i = 0; i < 7; i++) {
    const wd = (ws + i) % 7;
    cells += `<div class="wd ${wd === 0 ? 'sun' : wd === 6 ? 'sat' : ''}">${WEEKDAYS[wd]}</div>`;
  }
  for (let i = 0; i < 42; i++) {
    const day = addDays(start, i);
    const de = evs.filter((e) => overlapsDay(e, day));
    const hol = de.filter((e) => isHoliday(e._cal));
    const normal = de
      .filter((e) => !isHoliday(e._cal))
      .sort((a, b) => (isAllDay(b) - isAllDay(a)) || evStart(a) - evStart(b));
    const cls = [
      day.getMonth() !== d.getMonth() ? 'other' : '',
      sameDay(day, today) ? 'today' : '',
      sameDay(day, selected) ? 'sel' : '',
      day.getDay() === 0 ? 'sun' : day.getDay() === 6 ? 'sat' : '',
      hol.length ? 'hol' : '',
    ].join(' ');
    const chips = normal
      .slice(0, maxChips)
      .map((e) => {
        const c = colorOf(state, e._cal);
        if (isAllDay(e))
          return `<div class="mchip allday" style="background:${esc(c)}" data-action="open-event" data-cal="${esc(e._cal)}" data-id="${esc(e.id)}" title="${esc(e.summary || '')}">${esc(e.summary || '(제목 없음)')}</div>`;
        return `<div class="mchip timed" data-action="open-event" data-cal="${esc(e._cal)}" data-id="${esc(e.id)}" title="${esc(e.summary || '')}" style="border-left:3px solid ${esc(c)}"><span class="dot" style="background:${esc(c)}"></span><span class="tm">${fmtTime(evStart(e))}</span>${esc(e.summary || '(제목 없음)')}</div>`;
      })
      .join('');
    const more = normal.length > maxChips ? `<div class="more">+${normal.length - maxChips}</div>` : '';
    cells += `<div class="mcell ${cls}" data-action="sel-day" data-date="${ymd(day)}" data-month="${ymd(d)}" role="button" tabindex="-1" aria-label="${day.getMonth() + 1}월 ${day.getDate()}일 ${normal.length}건">
      <div class="num">${day.getDate()}</div>${hol.length ? `<div class="hname">${esc(hol[0].summary)}</div>` : ''}${chips}${more}</div>`;
  }
  // 선택한 날 패널
  const se = evs.filter((e) => overlapsDay(e, selected));
  const panel = `<section class="card day-panel"><header><h3>${fmtDate(selected)}</h3><span class="sub">${se.length}건</span>
      <button class="btn sm ghost end" data-action="new-event" data-date="${selected.getTime()}">${icon('plus')}일정</button>
      <button class="btn sm ghost" data-action="nav" data-href="${calHref('day', selected)}">일 보기</button></header>
    <div class="body">${se.map((e) => eventRow(e)).join('') || '<div class="empty">일정이 없습니다</div>'}
    ${dayTasks(selected) ? `<div class="group-h">마감 할 일</div>${dayTasks(selected)}` : ''}</div></section>`;
  return `<div class="month">${cells}</div>${panel}`;
}

// ───────── 주/일 보기 (시간표) ─────────
function layoutDay(items) {
  items.sort((a, b) => a.s - b.s || b.e - a.e);
  let cluster = [];
  let colsEnd = [];
  let maxEnd = -1;
  const finalize = () => {
    for (const it of cluster) it.n = colsEnd.length;
    cluster = [];
    colsEnd = [];
    maxEnd = -1;
  };
  for (const it of items) {
    if (cluster.length && it.s >= maxEnd) finalize();
    let c = colsEnd.findIndex((end) => end <= it.s);
    if (c === -1) {
      c = colsEnd.length;
      colsEnd.push(it.e);
    } else colsEnd[c] = it.e;
    it.col = c;
    maxEnd = Math.max(maxEnd, it.e);
    cluster.push(it);
  }
  finalize();
  return items;
}

function timeGrid(start, n) {
  const days = Array.from({ length: n }, (_, i) => addDays(start, i));
  const vis = visibleFilter();
  const evs = eventsInRange(days[0], addDays(days[n - 1], 1), vis);
  const today = startOfDay(new Date());
  const now = new Date();
  const cols = `52px repeat(${n}, minmax(0, 1fr))`;
  const head = `<div class="tg-head" style="grid-template-columns:${cols}"><div></div>${days
    .map(
      (d) => `<div class="${sameDay(d, today) ? 'today' : ''}" data-action="nav" data-href="${calHref('day', d)}" role="button">
        <span style="${d.getDay() === 0 ? 'color:var(--danger)' : d.getDay() === 6 ? 'color:#3b6fd8' : ''}">${WEEKDAYS[d.getDay()]}</span><span class="dn">${d.getDate()}</span></div>`
    )
    .join('')}</div>`;
  const allday = `<div class="tg-allday" style="grid-template-columns:${cols}"><div>종일</div>${days
    .map((d) => {
      const list = evs.filter((e) => (isAllDay(e) || evEnd(e) - evStart(e) >= 86400000) && overlapsDay(e, d));
      return `<div>${list
        .map(
          (e) =>
            `<div class="mchip allday" style="background:${esc(colorOf(state, e._cal))}" data-action="open-event" data-cal="${esc(e._cal)}" data-id="${esc(e.id)}">${esc(e.summary || '(제목 없음)')}</div>`
        )
        .join('')}</div>`;
    })
    .join('')}</div>`;
  const hours = `<div class="tg-hours">${Array.from({ length: 24 }, (_, h) => `<div>${h ? pad(h) + ':00' : ''}</div>`).join('')}</div>`;
  const colsHtml = days
    .map((d) => {
      const d0 = d.getTime();
      const items = evs
        .filter((e) => !isAllDay(e) && evEnd(e) - evStart(e) < 86400000 && overlapsDay(e, d))
        .map((e) => {
          const s = Math.max(0, (evStart(e) - d0) / 60000);
          const en = Math.min(1440, (evEnd(e) - d0) / 60000);
          return { ev: e, s, e: Math.max(en, s + 20) };
        });
      layoutDay(items);
      const blocks = items
        .map((it) => {
          const top = (it.s / 60) * HOUR;
          const h = Math.max(((it.e - it.s) / 60) * HOUR - 2, 18);
          const w = 100 / it.n;
          return `<div class="tg-ev" style="top:${top}px;height:${h}px;left:calc(${it.col * w}% + 2px);width:calc(${w}% - 4px);background:${esc(colorOf(state, it.ev._cal))}"
            data-action="open-event" data-cal="${esc(it.ev._cal)}" data-id="${esc(it.ev.id)}" title="${esc(it.ev.summary || '')}">
            <b>${esc(it.ev.summary || '(제목 없음)')}</b><span>${fmtTime(evStart(it.ev))}–${fmtTime(evEnd(it.ev))}${it.ev.location ? ' · ' + esc(it.ev.location) : ''}</span></div>`;
        })
        .join('');
      const nowLine = sameDay(d, today) ? `<div class="tg-now" style="top:${((now.getHours() * 60 + now.getMinutes()) / 60) * HOUR}px"></div>` : '';
      return `<div class="tg-col ${sameDay(d, today) ? 'today' : ''}" data-action="slot" data-date="${ymd(d)}" style="height:${24 * HOUR}px">${blocks}${nowLine}</div>`;
    })
    .join('');
  return `<div class="timegrid">${head}${allday}<div class="tg-scroll" data-keep-scroll="tg"><div class="tg-body" style="grid-template-columns:${cols}">${hours}${colsHtml}</div></div></div>`;
}

// ───────── 목록 보기 ─────────
function listView(d) {
  const start = startOfDay(d);
  const vis = visibleFilter();
  const evs = eventsInRange(start, addDays(start, 30), vis);
  const tasks = openTasks();
  let html = '';
  for (let i = 0; i < 30; i++) {
    const day = addDays(start, i);
    const de = evs.filter((e) => overlapsDay(e, day));
    const dt = sortTasks(tasks.filter((t) => t.due && sameDay(dueToDate(t.due), day)));
    if (!de.length && !dt.length) continue;
    html += `<div class="day-h">${fmtDate(day)}</div>${de.map((e) => eventRow(e)).join('')}${dt.map((t) => taskRow(t)).join('')}`;
  }
  return `<section class="card"><div class="body">${html || '<div class="empty">30일 동안 일정이 없습니다</div>'}</div></section>`;
}

// 시간표 빈 칸 클릭 → 해당 시각으로 새 일정
export function slotTime(el, e) {
  const r = el.getBoundingClientRect();
  const y = e.clientY - r.top;
  const min = Math.max(0, Math.min(1410, Math.floor(((y / HOUR) * 60) / 30) * 30));
  return { date: parseYMD(el.dataset.date), time: { h: Math.floor(min / 60), m: min % 60 } };
}

export { isHoliday, calendarById };
