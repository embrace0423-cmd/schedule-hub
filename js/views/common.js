import { state } from '../store.js';
import { calendarById, calName, colorOf, listMeta } from '../areas.js';
import { esc, icon } from '../ui.js';
import { fmtEventTime, evEnd, isAllDay, dueToDate, daysBetween, relDayLabel, startOfDay } from '../dates.js';
import { taskPriority, notesBody } from '../taskutil.js';

export function eventRow(ev, { now = new Date(), timeLabel } = {}) {
  const c = calendarById(state, ev._cal);
  const color = colorOf(state, ev._cal);
  const past = !isAllDay(ev) && evEnd(ev) < now;
  const pending = String(ev.id).startsWith('tmp_') || state.outbox.some((o) => o.id === ev.id);
  const meta = [`<span class="row" style="gap:5px"><span class="dot" style="background:${esc(color)}"></span>${esc(calName(c) || '')}</span>`];
  if (ev.location) meta.push(`<span>${esc(ev.location)}</span>`);
  if (ev.recurringEventId) meta.push('<span>반복</span>');
  return `<div class="ev ${past ? 'past' : ''} ${pending ? 'pending' : ''}" data-action="open-event" data-cal="${esc(ev._cal)}" data-id="${esc(ev.id)}" role="button" tabindex="0">
    <div class="t">${esc(timeLabel || fmtEventTime(ev))}</div>
    <div class="bar" style="background:${esc(color)}"></div>
    <div class="c"><div class="title">${esc(ev.summary || '(제목 없음)')}</div><div class="meta">${meta.join('')}</div></div>
  </div>`;
}

export function taskRow(t, { showList = true, now = new Date() } = {}) {
  const done = t.status === 'completed';
  const due = dueToDate(t.due);
  const meta = [];
  const prio = taskPriority(t);
  if (prio === 'high') meta.push('<span class="flag">중요</span>');
  if (due) {
    const n = daysBetween(now, due);
    const lbl = relDayLabel(due, now);
    meta.push(`<span class="${!done && n < 0 ? 'danger-t' : n === 0 ? 'ok-t' : ''}">${esc(lbl)}</span>`);
  }
  if (showList) {
    const m = listMeta(state, t._list);
    meta.push(`<span class="row" style="gap:5px"><span class="dot" style="background:${esc(m.color)}"></span>${esc(m.name)}</span>`);
  }
  const nb = notesBody(t);
  if (nb) meta.push(`<span>${esc(nb.split('\n')[0].slice(0, 40))}</span>`);
  if (prio === 'low') meta.push('<span>낮음</span>');
  const pending = String(t.id).startsWith('tmp_') || state.outbox.some((o) => o.id === t.id);
  return `<div class="task ${done ? 'done' : ''} ${t.parent ? 'sub' : ''} ${pending ? 'pending' : ''}" data-action="open-task" data-list="${esc(t._list)}" data-id="${esc(t.id)}" role="button" tabindex="0">
    <button class="chk ${done ? 'on' : ''}" data-action="toggle-task" data-list="${esc(t._list)}" data-id="${esc(t.id)}" aria-label="${done ? '완료 취소' : '완료'}"></button>
    <div class="c"><div class="title">${esc(t.title || '(제목 없음)')}</div>${meta.length ? `<div class="meta">${meta.join('')}</div>` : ''}</div>
  </div>`;
}

// 할 일 정렬: 기한 지난 것 → 마감 빠른 순 → 우선순위 → 제목
export function sortTasks(list) {
  const pr = { high: 0, normal: 1, low: 2 };
  return list.slice().sort((a, b) => {
    const da = a.due ? a.due : '9999';
    const db = b.due ? b.due : '9999';
    if (da !== db) return da < db ? -1 : 1;
    const p = pr[taskPriority(a)] - pr[taskPriority(b)];
    if (p) return p;
    return (a.position || '').localeCompare(b.position || '') || (a.title || '').localeCompare(b.title || '');
  });
}

export function openTasks() {
  const out = [];
  for (const [listId, m] of Object.entries(state.tasks)) for (const t of Object.values(m)) if (t.status !== 'completed' && !t.deleted) out.push({ ...t, _list: listId });
  return out;
}

export function overdueCount(now = new Date()) {
  const today = startOfDay(now);
  return openTasks().filter((t) => t.due && dueToDate(t.due) < today).length;
}
