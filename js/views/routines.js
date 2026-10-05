import { esc, icon } from '../ui.js';
import { seriesList, isDone, routineCal } from '../routines.js';
import { routineName } from '../areas.js';
import { quickAdd } from './today.js';
import { WEEKDAYS } from '../dates.js';
import { state } from '../store.js';

export function renderRoutines(el) {
  const rc = routineCal();
  if (!rc) {
    el.innerHTML = `${quickAdd('routine', ['routine'])}
      <section class="card" style="margin-top:16px"><div class="body" style="padding:22px">
        <h3 style="margin:0 0 6px">루틴 캘린더가 아직 없습니다</h3>
        <p class="muted" style="margin:0 0 14px">루틴(습관)은 Google 캘린더의 "${esc(routineName())}" 캘린더에 반복 일정으로 저장되어,
        삼성 캘린더에서도 알림을 받을 수 있습니다. 체크 기록과 연속 일수는 이 앱에서 관리됩니다.</p>
        <button class="btn primary" data-action="new-routine" ${state.calendars.length ? '' : 'disabled'}>${icon('plus')}첫 루틴 만들기</button>
        ${state.calendars.length ? '' : '<div class="hint" style="margin-top:8px">먼저 [설정]에서 Google 계정을 연결하세요.</div>'}
      </div></section>`;
    return;
  }
  const list = seriesList();
  const todays = list.filter((s) => s.todayInst);
  const doneToday = todays.filter((s) => isDone(s.todayInst)).length;
  const avg = list.filter((s) => s.rate != null);
  const avgRate = avg.length ? Math.round(avg.reduce((a, s) => a + s.rate, 0) / avg.length) : null;

  const rows = list
    .map((s) => {
      const t = s.todayInst;
      const d = t && isDone(t);
      const strip = s.strip
        .map((x) => `<i class="${x.state === 'none' ? '' : x.state}" title="${x.d.getMonth() + 1}/${x.d.getDate()}(${WEEKDAYS[x.d.getDay()]}) ${{ done: '완료', miss: '놓침', today: '오늘', none: '없음' }[x.state]}"></i>`)
        .join('');
      return `<div class="rt">
        ${
          t
            ? `<button class="chk ${d ? 'on' : ''}" data-action="toggle-routine" data-cal="${esc(s.calId)}" data-id="${esc(t.id)}" aria-label="오늘 체크" style="width:28px;height:28px"></button>`
            : `<span class="chk" style="width:28px;height:28px;opacity:.25;cursor:default" title="오늘은 해당 없음"></span>`
        }
        <div style="min-width:0;cursor:pointer" data-action="open-routine" data-cal="${esc(s.calId)}" data-id="${esc(s.ref.id)}" role="button" tabindex="0">
          <div class="title">${esc(s.title)}</div>
          <div class="meta">${esc(s.days)} · ${esc(s.time)}${s.rate != null ? ` · 30일 달성률 ${s.rate}% (${s.doneN}/${s.totalN})` : ''}</div>
          <div class="strip" aria-label="최근 14일 기록">${strip}</div>
        </div>
        <div class="streak"><b>${s.streak}</b>연속 일수</div>
      </div>`;
    })
    .join('');

  el.innerHTML = `
    <div class="hello">
      <div><div class="date">루틴</div><div class="sum">"${esc(rc.summary)}" 캘린더 · 삼성 캘린더 알림 연동</div></div>
      <div class="stats">
        <div class="stat"><b>${doneToday}/${todays.length}</b><span>오늘 완료</span></div>
        <div class="stat"><b>${avgRate == null ? '–' : avgRate + '%'}</b><span>평균 달성률</span></div>
        <div class="stat"><b>${list.length}</b><span>루틴 수</span></div>
      </div>
    </div>
    ${quickAdd('routine', ['routine'])}
    <div class="cal-tools" style="margin-top:14px"><span class="grow"></span>
      <button class="btn primary" data-action="new-routine">${icon('plus')}새 루틴</button></div>
    <section class="card"><div class="body">${rows || '<div class="empty">루틴이 없습니다. "평일 7시 아침 운동"처럼 입력해 보세요.</div>'}</div></section>
    <p class="hint" style="margin-top:10px">체크 기록은 해당 회차 일정에 저장되어 PC·휴대폰 어디서 체크해도 함께 반영됩니다. 놓친 날은 빨간 테두리로 표시됩니다.</p>`;
}
