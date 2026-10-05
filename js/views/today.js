import { state, eventsInRange } from '../store.js';
import { calendarById, isRoutineCal, hiddenCals } from '../areas.js';
import { esc, icon } from '../ui.js';
import { startOfDay, addDays, isAllDay, evStart, evEnd, fmtDate, WEEKDAYS, dueToDate, relDayLabel, fmtTime, sameDay } from '../dates.js';
import { eventRow, taskRow, sortTasks, openTasks } from './common.js';
import { todayRoutines, isDone } from '../routines.js';
import { taskPriority } from '../taskutil.js';
import { prefs } from '../prefs.js';

const PH = {
  event: '예) 내일 오후 3시 현장 미팅 #건설 @강남역',
  task: '예) 견적서 보내기 금요일까지 !중요 #외식',
  routine: '예) 평일 7시 아침 운동',
};

export function quickAdd(mode = prefs.quickMode, modes = ['event', 'task', 'routine']) {
  const L = { event: '일정', task: '할 일', routine: '루틴' };
  if (!modes.includes(mode)) mode = modes[0];
  const HINT = { event: '#영역 · @장소 · 매주/평일 반복', task: '#영역 · !중요 · 금요일까지', routine: '매일 · 평일 · 매주 월수금 · 시간' };
  return `<div class="card quick">
    <div class="bar">
      ${
        modes.length > 1
          ? `<div class="seg" role="tablist" aria-label="입력 종류">${modes
              .map((m) => `<button role="tab" data-action="quick-mode" data-mode="${m}" class="${m === mode ? 'on' : ''}">${L[m]}</button>`)
              .join('')}</div>`
          : `<b style="font-size:14px">빠른 ${L[mode]} 추가</b>`
      }
      <span class="hint" style="margin-left:auto">${HINT[mode]}</span>
    </div>
    <div class="bar">
      <input id="quick-input" data-keep="quick" data-mode="${mode}" placeholder="${esc(PH[mode])}" autocomplete="off" enterkeyhint="done" aria-label="빠른 입력">
      <button class="btn primary" data-action="quick-add">${icon('plus')}<span>추가</span></button>
    </div>
    <div class="preview" id="quick-preview"></div>
  </div>`;
}

export function renderToday(el) {
  const now = new Date();
  const today = startOfDay(now);
  const hidden = hiddenCals();
  const visible = (e) => !hidden.has(e._cal) && !isRoutineCal(calendarById(state, e._cal));
  const evs = eventsInRange(today, addDays(today, 1), visible);
  const allDay = evs.filter(isAllDay);
  const timed = evs.filter((e) => !isAllDay(e));

  const open = openTasks();
  const overdue = sortTasks(open.filter((t) => t.due && dueToDate(t.due) < today));
  const dueToday = sortTasks(open.filter((t) => t.due && sameDay(dueToDate(t.due), today)));
  const important = sortTasks(open.filter((t) => !t.due && taskPriority(t) === 'high')).slice(0, 5);
  const rts = todayRoutines(now);
  const rDone = rts.filter((r) => isDone(r.todayInst)).length;

  // 일정 목록 + 현재 시각 표시선
  let schedule = '';
  if (!evs.length) schedule = '<div class="empty">오늘 일정이 없습니다</div>';
  else {
    schedule += allDay.map((e) => eventRow(e, { now })).join('');
    let nowShown = false;
    for (const e of timed) {
      if (!nowShown && evStart(e) > now) {
        schedule += `<div class="nowline">${fmtTime(now)}</div>`;
        nowShown = true;
      }
      schedule += eventRow(e, { now });
    }
    if (!nowShown && timed.length) schedule += `<div class="nowline">${fmtTime(now)}</div>`;
  }

  // 할 일
  const taskHtml =
    (overdue.length ? `<div class="group-h danger-t">기한 지남 <span class="n">${overdue.length}</span></div>${overdue.map((t) => taskRow(t, { now })).join('')}` : '') +
    (dueToday.length ? `<div class="group-h">오늘 마감 <span class="n">${dueToday.length}</span></div>${dueToday.map((t) => taskRow(t, { now })).join('')}` : '') +
    (important.length ? `<div class="group-h">중요 (마감 없음)</div>${important.map((t) => taskRow(t, { now })).join('')}` : '');

  // 루틴
  const rtHtml = rts.length
    ? `<div class="progress" style="margin:4px 6px 8px"><i style="width:${Math.round((rDone / rts.length) * 100)}%"></i></div>` +
      rts
        .map((r) => {
          const d = isDone(r.todayInst);
          return `<div class="task ${d ? 'done' : ''}" data-action="open-routine" data-cal="${esc(r.calId)}" data-id="${esc(r.todayInst.id)}" role="button" tabindex="0">
            <button class="chk ${d ? 'on' : ''}" data-action="toggle-routine" data-cal="${esc(r.calId)}" data-id="${esc(r.todayInst.id)}" aria-label="루틴 체크"></button>
            <div class="c"><div class="title">${esc(r.title)}</div><div class="meta"><span>${esc(r.time)}</span>${r.streak ? `<span class="ok-t">연속 ${r.streak}일</span>` : ''}</div></div>
          </div>`;
        })
        .join('')
    : '<div class="empty">오늘 예정된 루틴이 없습니다</div>';

  // 다가오는 7일
  let upcoming = '';
  for (let i = 1; i <= 7; i++) {
    const d = addDays(today, i);
    const de = eventsInRange(d, addDays(d, 1), visible).filter((e) => !(isAllDay(e) && evStart(e) < d));
    const dt = open.filter((t) => t.due && sameDay(dueToDate(t.due), d));
    if (!de.length && !dt.length) continue;
    upcoming += `<div class="day-h">${relDayLabel(d, now)} <span class="muted">${d.getMonth() + 1}/${d.getDate()} (${WEEKDAYS[d.getDay()]})</span></div>`;
    upcoming += de.map((e) => eventRow(e, { now })).join('');
    upcoming += sortTasks(dt).map((t) => taskRow(t, { now })).join('');
  }
  if (!upcoming) upcoming = '<div class="empty">7일 이내 예정이 없습니다</div>';

  const nextEv = timed.find((e) => evEnd(e) > now);
  const sumParts = [];
  if (nextEv) sumParts.push(`다음: ${fmtTime(evStart(nextEv))} ${esc(nextEv.summary || '')}`);
  else if (evs.length) sumParts.push('오늘 남은 일정 없음');

  el.innerHTML = `
    <div class="hello">
      <div><div class="date">${fmtDate(now)}</div><div class="sum">${sumParts.join(' · ') || '좋은 하루 보내세요'}</div></div>
      <div class="stats">
        <div class="stat"><b>${evs.length}</b><span>오늘 일정</span></div>
        <div class="stat ${overdue.length ? 'alert' : ''}"><b>${dueToday.length + overdue.length}</b><span>할 일${overdue.length ? ` (지남 ${overdue.length})` : ''}</span></div>
        <div class="stat"><b>${rDone}/${rts.length}</b><span>루틴</span></div>
      </div>
    </div>
    ${quickAdd()}
    <div class="grid2" style="margin-top:16px">
      <div class="stack">
        <section class="card o1"><header><h3>오늘 일정</h3><span class="sub">${evs.length}건</span>
          <button class="btn sm ghost end" data-action="new-event" data-date="${today.getTime()}">${icon('plus')}일정</button></header>
          <div class="body">${schedule}</div></section>
        <section class="card o4"><header><h3>다가오는 7일</h3><a class="btn sm ghost end" href="#/calendar">캘린더</a></header>
          <div class="body">${upcoming}</div></section>
      </div>
      <div class="stack">
        <section class="card o2"><header><h3>할 일</h3><span class="sub">미완료 ${open.length}건</span>
          <a class="btn sm ghost end" href="#/tasks">모두 보기</a></header>
          <div class="body">${taskHtml || '<div class="empty">오늘 처리할 할 일이 없습니다</div>'}</div></section>
        <section class="card o3"><header><h3>오늘의 루틴</h3><span class="sub">${rDone}/${rts.length}</span>
          <a class="btn sm ghost end" href="#/routines">관리</a></header>
          <div class="body">${rtHtml}</div></section>
      </div>
    </div>`;
}
