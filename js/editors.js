// 일정 / 할 일 / 루틴 편집기
import * as store from './store.js';
import { state } from './store.js';
import { areaList, taskAreaList, calendarById, isRoutineCal, routineName, writableCalendars, DEFAULT_AREAS } from './areas.js';
import {
  ymd, parseYMD, toRFC3339, addDays, addMinutes, isAllDay, evStart, evEnd, pad, buildRRule, parseRRule,
  BYDAY, WEEKDAYS, localTimeZone, dueToDate, dateToDue, startOfDay, fmtDate,
} from './dates.js';
import { esc, icon, openModal, choose, confirmDlg, showToast } from './ui.js';
import { prefs } from './prefs.js';
import { taskPriority, notesBody, buildNotes } from './taskutil.js';

const hhmm = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
const REM_OPTS = [
  [-1, '알림 없음'],
  [0, '정시'],
  [5, '5분 전'],
  [10, '10분 전'],
  [30, '30분 전'],
  [60, '1시간 전'],
  [120, '2시간 전'],
  [1440, '1일 전'],
];

function remOf(ev) {
  if (!ev || !ev.reminders) return prefs.defReminder;
  if (ev.reminders.useDefault) return 'default';
  const o = (ev.reminders.overrides || []).find((x) => x.method === 'popup') || (ev.reminders.overrides || [])[0];
  return o ? o.minutes : -1;
}
function remBody(v) {
  if (v === 'default') return { useDefault: true };
  const n = Number(v);
  if (n < 0) return { useDefault: false, overrides: [] };
  return { useDefault: false, overrides: [{ method: 'popup', minutes: n }] };
}
function remSelect(cur) {
  const opts = [...REM_OPTS];
  if (cur === 'default') opts.unshift(['default', '캘린더 기본 알림']);
  else if (!opts.some(([v]) => v === Number(cur))) opts.push([Number(cur), `${cur}분 전`]);
  return `<select name="rem">${opts
    .map(([v, l]) => `<option value="${v}" ${String(v) === String(cur) ? 'selected' : ''}>${l}</option>`)
    .join('')}</select>`;
}

function areaPick(list, cur, name = 'cal', disabled = false) {
  return `<div class="areas-pick" data-pick="${name}" ${disabled ? 'aria-disabled="true" style="opacity:.55;pointer-events:none"' : ''}>${list
    .map(
      (a) =>
        `<button type="button" data-v="${esc(a.id)}" class="${a.id === cur ? 'on' : ''}"><span class="dot" style="background:${esc(a.color)}"></span>${esc(a.name)}</button>`
    )
    .join('')}</div>`;
}
function wirePick(dlg, name, onChange) {
  const box = dlg.querySelector(`[data-pick="${name}"]`);
  if (!box) return () => null;
  box.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-v]');
    if (!b) return;
    box.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b));
    if (onChange) onChange(b.dataset.v);
  });
  return () => (box.querySelector('button.on') || {}).dataset?.v || null;
}

function defaultCalId() {
  const list = writableCalendars(state);
  const pref = prefs.defaultCal;
  if (pref && list.some((c) => c.id === pref)) return pref;
  const p = list.find((c) => c.primary);
  return (p || list[0] || {}).id || null;
}

export function routineCalendar() {
  return state.calendars.find((c) => isRoutineCal(c) && (c.accessRole === 'owner' || c.accessRole === 'writer')) || null;
}

function needData() {
  if (!state.calendars.length) {
    showToast('먼저 [설정]에서 Google 계정을 연결하세요.', 'error');
    location.hash = '#/settings';
    return true;
  }
  return false;
}

const REPEAT_OPTS = [
  ['NONE', '반복 안 함'],
  ['DAILY', '매일'],
  ['WEEKDAYS', '평일(월–금)'],
  ['WEEKLY', '매주 (같은 요일)'],
  ['MONTHLY', '매월'],
  ['YEARLY', '매년'],
];
function repeatToRule(v, date) {
  switch (v) {
    case 'DAILY':
      return buildRRule({ freq: 'DAILY' });
    case 'WEEKDAYS':
      return buildRRule({ freq: 'WEEKLY', byday: ['MO', 'TU', 'WE', 'TH', 'FR'] });
    case 'WEEKLY':
      return buildRRule({ freq: 'WEEKLY', byday: [BYDAY[date.getDay()]] });
    case 'MONTHLY':
      return buildRRule({ freq: 'MONTHLY' });
    case 'YEARLY':
      return buildRRule({ freq: 'YEARLY' });
    default:
      return null;
  }
}
function ruleToRepeat(rule) {
  const r = parseRRule(rule);
  if (!r) return 'NONE';
  if (r.freq === 'DAILY') return 'DAILY';
  if (r.freq === 'WEEKLY' && r.byday.length === 5 && !r.byday.includes('SA') && !r.byday.includes('SU')) return 'WEEKDAYS';
  if (r.freq === 'WEEKLY' && r.byday.length <= 1) return 'WEEKLY';
  if (r.freq === 'MONTHLY') return 'MONTHLY';
  if (r.freq === 'YEARLY') return 'YEARLY';
  return 'CUSTOM';
}

// ═════════════════════ 일정 편집기 ═════════════════════
export function openEventEditor({ calId, id, defaults = {} } = {}) {
  if (needData()) return;
  const ev = id ? store.getEvent(calId, id) : null;
  if (id && !ev) return showToast('일정을 찾을 수 없습니다.', 'error');
  const isNew = !ev;
  const recurringInstance = !!(ev && ev.recurringEventId);
  const areas = areaList(state);
  let curCal = isNew ? defaults.calId || defaultCalId() : calId;
  const readOnly = ev && !areas.some((a) => a.id === calId);

  // 기본값 계산
  let s, e, allDay;
  if (ev) {
    allDay = isAllDay(ev);
    s = evStart(ev);
    e = allDay ? addDays(evEnd(ev), -1) : evEnd(ev);
  } else {
    const d = defaults.date ? startOfDay(defaults.date) : startOfDay(new Date());
    allDay = !!defaults.allDay;
    if (defaults.time) {
      s = new Date(d);
      s.setHours(defaults.time.h, defaults.time.m, 0, 0);
    } else {
      const now = new Date();
      s = new Date(d);
      s.setHours(Math.min(now.getHours() + 1, 23), 0, 0, 0);
    }
    if (defaults.endTime) {
      e = new Date(d);
      e.setHours(defaults.endTime.h, defaults.endTime.m, 0, 0);
      if (e <= s) e = addDays(e, 1);
    } else e = addMinutes(s, defaults.durationMin || 60);
    if (allDay) e = new Date(d);
  }
  const repeatCur = isNew ? (defaults.rrule ? ruleToRepeat(defaults.rrule) : 'NONE') : recurringInstance ? 'KEEP' : 'NONE';
  const repeatOpts = recurringInstance ? [['KEEP', '기존 반복 유지'], ...REPEAT_OPTS.slice(1)] : REPEAT_OPTS;
  const customRule = isNew && repeatCur === 'CUSTOM' ? defaults.rrule : null;

  const body = `
    <div class="field"><input type="text" name="title" class="title-input" placeholder="일정 제목" value="${esc(ev ? ev.summary || '' : defaults.title || '')}" autofocus ${readOnly ? 'disabled' : ''}></div>
    <div class="field"><span class="lbl">영역</span>${
      readOnly
        ? `<div class="chip">${esc((calendarById(state, calId) || {}).summary || '읽기 전용')}</div>`
        : areaPick(areas, curCal, 'cal', recurringInstance)
    }${recurringInstance ? '<span class="hint">반복 일정의 영역 변경은 "모든 반복 일정"에만 적용됩니다. 아래에서 저장 시 선택하세요.</span>' : ''}</div>
    <label class="switch"><input type="checkbox" name="allDay" ${allDay ? 'checked' : ''}><i></i>종일</label>
    <div class="two">
      <div class="field"><label>시작</label><input type="date" name="sd" value="${ymd(s)}"></div>
      <div class="field t-only"><label>시간</label><input type="time" name="st" value="${hhmm(s)}" step="300"></div>
    </div>
    <div class="two">
      <div class="field"><label>종료</label><input type="date" name="ed" value="${ymd(e)}"></div>
      <div class="field t-only"><label>시간</label><input type="time" name="et" value="${hhmm(e)}" step="300"></div>
    </div>
    <div class="two">
      <div class="field"><label>반복</label><select name="repeat">${
        customRule ? `<option value="CUSTOM" selected>사용자 지정 (빠른 입력)</option>` : ''
      }${repeatOpts.map(([v, l]) => `<option value="${v}" ${v === repeatCur ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
      <div class="field"><label>알림</label>${remSelect(ev ? remOf(ev) : prefs.defReminder)}</div>
    </div>
    <div class="field"><label>장소</label><input type="text" name="loc" placeholder="장소" value="${esc(ev ? ev.location || '' : defaults.location || '')}"></div>
    <div class="field"><label>메모</label><textarea name="desc" placeholder="메모">${esc(ev ? ev.description || '' : '')}</textarea></div>
    ${ev && ev.htmlLink ? `<a class="hint" href="${esc(ev.htmlLink)}" target="_blank" rel="noopener">${icon('link')} Google 캘린더에서 열기</a>` : ''}
  `;
  const footer = `${!isNew && !readOnly ? `<button class="btn danger" data-del>${icon('trash')}삭제</button>` : ''}<span class="grow"></span>
    <button class="btn" data-close>취소</button>${readOnly ? '' : `<button class="btn primary" data-save>저장</button>`}`;

  openModal({
    title: isNew ? '새 일정' : readOnly ? '일정 (읽기 전용)' : '일정 수정',
    body,
    footer,
    onMount(dlg, close) {
      const f = (n) => dlg.querySelector(`[name="${n}"]`);
      const getCal = wirePick(dlg, 'cal', (v) => (curCal = v));
      const syncAllDay = () => dlg.querySelectorAll('.t-only').forEach((x) => (x.style.display = f('allDay').checked ? 'none' : ''));
      f('allDay').addEventListener('change', syncAllDay);
      syncAllDay();
      // 시작 변경 시 종료를 같은 간격으로 이동
      let lastS = new Date(`${f('sd').value}T${f('st').value || '00:00'}`);
      const shift = () => {
        const ns = new Date(`${f('sd').value}T${f('st').value || '00:00'}`);
        const ce = new Date(`${f('ed').value}T${f('et').value || '00:00'}`);
        if (isNaN(ns) || isNaN(ce) || isNaN(lastS)) return;
        const ne = new Date(ce.getTime() + (ns - lastS));
        f('ed').value = ymd(ne);
        f('et').value = hhmm(ne);
        lastS = ns;
      };
      f('sd').addEventListener('change', shift);
      f('st').addEventListener('change', shift);
      f('title').addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.isComposing) dlg.querySelector('[data-save]')?.click();
      });

      const collect = () => {
        const ad = f('allDay').checked;
        const sd = parseYMD(f('sd').value || ymd(new Date()));
        let ed = parseYMD(f('ed').value || f('sd').value);
        const tz = localTimeZone();
        const out = {
          summary: f('title').value.trim() || '(제목 없음)',
          location: f('loc').value.trim(),
          description: f('desc').value.trim(),
          reminders: remBody(f('rem').value),
        };
        let start, end;
        if (ad) {
          if (ed < sd) ed = sd;
          out.start = { date: ymd(sd) };
          out.end = { date: ymd(addDays(ed, 1)) };
          start = sd;
        } else {
          start = new Date(`${f('sd').value}T${f('st').value || '09:00'}`);
          end = new Date(`${f('ed').value || f('sd').value}T${f('et').value || f('st').value || '10:00'}`);
          if (!(end > start)) {
            end = addMinutes(start, 60);
            showToast('종료가 시작보다 빨라 1시간 일정으로 맞췄습니다.');
          }
          out.start = { dateTime: toRFC3339(start), timeZone: tz };
          out.end = { dateTime: toRFC3339(end), timeZone: tz };
        }
        const rep = f('repeat').value;
        return { out, rep, start, allDay: ad };
      };

      dlg.querySelector('[data-save]')?.addEventListener('click', async () => {
        const { out, rep, start } = collect();
        const target = getCal() || curCal;
        if (isNew) {
          const rule = rep === 'CUSTOM' ? customRule : repeatToRule(rep, start);
          if (rule) out.recurrence = [rule];
          store.createEvent(target, out);
          close();
          showToast('일정을 추가했습니다');
          return;
        }
        if (!recurringInstance) {
          if (rep !== 'NONE') out.recurrence = [repeatToRule(rep, start)];
          store.updateEvent(calId, id, out, { moveTo: target });
          close();
          showToast('저장했습니다');
          return;
        }
        // 반복 일정의 한 회차
        const scope = await choose({
          title: '반복 일정 수정',
          options: [
            { label: '이 일정만', value: 'one' },
            { label: '모든 반복 일정', value: 'all', kind: 'primary' },
          ],
        });
        if (!scope) return;
        if (scope === 'one') {
          store.updateEvent(calId, id, out);
          close();
          showToast('이 일정만 저장했습니다');
          return;
        }
        await saveSeries(calId, ev, out, rep, start, target);
        close();
      });

      dlg.querySelector('[data-del]')?.addEventListener('click', async () => {
        if (recurringInstance) {
          const scope = await choose({
            title: '반복 일정 삭제',
            options: [
              { label: '이 일정만 삭제', value: 'one' },
              { label: '모든 반복 일정 삭제', value: 'all', kind: 'danger' },
            ],
          });
          if (!scope) return;
          if (scope === 'one') store.deleteEvent(calId, id);
          else store.deleteSeries(calId, ev.recurringEventId);
        } else {
          if (!(await confirmDlg('일정 삭제', `"${ev.summary || '(제목 없음)'}" 일정을 삭제할까요?`, '삭제', 'danger'))) return;
          store.deleteEvent(calId, id);
        }
        close();
        showToast('삭제했습니다');
      });
    },
  });
}

// 반복 일정 전체 수정: 원본의 시작 날짜는 유지하고 시간·길이·내용·반복만 바꾼다.
async function saveSeries(calId, inst, out, rep, newStart, targetCal) {
  const masterId = inst.recurringEventId;
  const patch = { summary: out.summary, location: out.location, description: out.description, reminders: out.reminders };
  const timeChanged = JSON.stringify(out.start) !== JSON.stringify(inst.start) || JSON.stringify(out.end) !== JSON.stringify(inst.end);
  if (timeChanged || rep !== 'KEEP') {
    let master;
    try {
      master = await store.fetchMaster(calId, masterId);
    } catch (e) {
      showToast('반복 일정 전체의 시간·반복 변경은 온라인에서만 가능합니다. 내용만 저장합니다.', 'error');
    }
    if (master) {
      if (timeChanged) {
        if (out.start.date) {
          const ms = parseYMD(master.start.date || master.start.dateTime.slice(0, 10));
          const days = Math.round((parseYMD(out.end.date) - parseYMD(out.start.date)) / 86400000);
          patch.start = { date: ymd(ms) };
          patch.end = { date: ymd(addDays(ms, Math.max(1, days))) };
        } else {
          const ms = master.start.dateTime ? new Date(master.start.dateTime) : parseYMD(master.start.date);
          const ns = new Date(ms);
          ns.setHours(newStart.getHours(), newStart.getMinutes(), 0, 0);
          const dur = new Date(out.end.dateTime) - new Date(out.start.dateTime);
          patch.start = { dateTime: toRFC3339(ns), timeZone: out.start.timeZone };
          patch.end = { dateTime: toRFC3339(new Date(ns.getTime() + dur)), timeZone: out.end.timeZone };
        }
      }
      if (rep !== 'KEEP') {
        const ms = master.start.dateTime ? new Date(master.start.dateTime) : parseYMD(master.start.date);
        const rule = repeatToRule(rep, ms);
        const rest = (master.recurrence || []).filter((r) => !r.startsWith('RRULE:'));
        patch.recurrence = rule ? [rule, ...rest] : [];
      }
    }
  }
  store.updateSeries(calId, masterId, patch, { moveTo: targetCal });
  showToast('모든 반복 일정에 저장했습니다');
}

// ═════════════════════ 할 일 편집기 ═════════════════════
export function openTaskEditor({ listId, id, defaults = {} } = {}) {
  if (!state.tasklists.length) return needData() || showToast('할 일 목록이 없습니다.', 'error');
  const t = id ? store.getTask(listId, id) : null;
  const isNew = !t;
  const lists = taskAreaList(state);
  let curList = isNew ? defaults.listId || (areaList(state).find((a) => a.id === defaultCalId()) || {}).tasklistId || lists[0].id : listId;
  const due = t ? dueToDate(t.due) : defaults.date || null;
  let prio = t ? taskPriority(t) : defaults.priority || 'normal';

  const body = `
    <div class="field"><input type="text" name="title" class="title-input" placeholder="할 일" value="${esc(t ? t.title || '' : defaults.title || '')}" autofocus></div>
    <div class="field"><span class="lbl">영역</span>${areaPick(lists, curList, 'list')}</div>
    <div class="field"><label>마감일</label>
      <div class="row wrap"><input type="date" name="due" class="inp" style="max-width:190px" value="${due ? ymd(due) : ''}">
        <button type="button" class="btn sm" data-d="0">오늘</button><button type="button" class="btn sm" data-d="1">내일</button>
        <button type="button" class="btn sm" data-d="7">1주 후</button><button type="button" class="btn sm ghost" data-d="x">없음</button></div>
    </div>
    <div class="field"><span class="lbl">우선순위</span><div class="prio-pick areas-pick">
      ${[['high', '높음'], ['normal', '보통'], ['low', '낮음']].map(([v, l]) => `<button type="button" data-p="${v}" class="${v === prio ? 'on' : ''}">${l}</button>`).join('')}
    </div></div>
    <div class="field"><label>메모</label><textarea name="notes" placeholder="메모">${esc(t ? notesBody(t) : '')}</textarea></div>
    ${t ? `<label class="switch"><input type="checkbox" name="done" ${t.status === 'completed' ? 'checked' : ''}><i></i>완료</label>` : ''}
    <div class="hint">할 일은 Google Tasks 에 저장되어 PC·휴대폰(이 앱, Google 캘린더/Tasks 앱)에서 함께 보입니다.</div>
  `;
  const footer = `${!isNew ? `<button class="btn danger" data-del>${icon('trash')}삭제</button>` : ''}<span class="grow"></span>
    <button class="btn" data-close>취소</button><button class="btn primary" data-save>저장</button>`;

  openModal({
    title: isNew ? '새 할 일' : '할 일 수정',
    body,
    footer,
    onMount(dlg, close) {
      const f = (n) => dlg.querySelector(`[name="${n}"]`);
      const getList = wirePick(dlg, 'list', (v) => (curList = v));
      dlg.querySelectorAll('[data-d]').forEach((b) =>
        b.addEventListener('click', () => {
          f('due').value = b.dataset.d === 'x' ? '' : ymd(addDays(new Date(), +b.dataset.d));
        })
      );
      dlg.querySelectorAll('[data-p]').forEach((b) =>
        b.addEventListener('click', () => {
          prio = b.dataset.p;
          dlg.querySelectorAll('[data-p]').forEach((x) => x.classList.toggle('on', x === b));
        })
      );
      f('title').addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.isComposing) dlg.querySelector('[data-save]').click();
      });
      dlg.querySelector('[data-save]').addEventListener('click', () => {
        const title = f('title').value.trim();
        if (!title) return showToast('할 일을 입력하세요.', 'error');
        const body = {
          title,
          notes: buildNotes(f('notes').value, prio),
          due: f('due').value ? dateToDue(parseYMD(f('due').value)) : null,
        };
        const target = getList() || curList;
        if (isNew) {
          if (!body.due) delete body.due;
          store.createTask(target, body);
          showToast('할 일을 추가했습니다');
        } else {
          const done = f('done').checked;
          if (done !== (t.status === 'completed')) {
            body.status = done ? 'completed' : 'needsAction';
            body.completed = done ? new Date().toISOString() : null;
          }
          store.updateTask(listId, id, body, { moveTo: target });
          showToast('저장했습니다');
        }
        close();
      });
      dlg.querySelector('[data-del]')?.addEventListener('click', async () => {
        if (!(await confirmDlg('할 일 삭제', `"${t.title}" 을(를) 삭제할까요?`, '삭제', 'danger'))) return;
        store.deleteTask(listId, id);
        close();
        showToast('삭제했습니다');
      });
    },
  });
}

// ═════════════════════ 루틴 편집기 ═════════════════════
const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0];
export async function openRoutineEditor({ calId, instanceId, defaults = {} } = {}) {
  if (needData()) return;
  let rc = routineCalendar();
  if (!rc) {
    const ok = await confirmDlg(
      '루틴 캘린더 만들기',
      `루틴은 Google 캘린더의 "${routineName()}" 캘린더에 반복 일정으로 저장됩니다. 지금 만들까요? (삼성 캘린더에도 표시됩니다)`,
      '만들기'
    );
    if (!ok) return;
    try {
      const def = DEFAULT_AREAS.find((a) => a.routine) || { color: '#8E24AA' };
      await store.createAreas([{ name: routineName(), color: def.color, routine: true }], localTimeZone());
    } catch (e) {
      return showToast('루틴 캘린더를 만들지 못했습니다: ' + e.message, 'error');
    }
    rc = routineCalendar();
    if (!rc) return showToast('루틴 캘린더를 찾을 수 없습니다. 잠시 후 다시 시도하세요.', 'error');
  }
  const inst = instanceId ? store.getEvent(calId, instanceId) : null;
  const isNew = !inst;
  let days = new Set();
  let master = null;
  if (inst && inst.recurringEventId) {
    try {
      master = await store.fetchMaster(calId, inst.recurringEventId);
      const r = parseRRule(master.recurrence);
      if (r && r.freq === 'DAILY') DAY_ORDER.forEach((d) => days.add(d));
      else if (r && r.byday.length) r.byday.forEach((b) => days.add(BYDAY.indexOf(b)));
    } catch {
      /* 오프라인 */
    }
  }
  if (!days.size) {
    const r = parseRRule(defaults.rrule);
    if (isNew && r && r.freq === 'WEEKLY' && r.byday.length) r.byday.forEach((b) => days.add(BYDAY.indexOf(b)));
    else if (isNew) DAY_ORDER.forEach((d) => days.add(d));
    else if (inst) days.add(evStart(inst).getDay());
  }
  const allDay = inst ? isAllDay(inst) : !defaults.time;
  const st = inst && !allDay ? hhmm(evStart(inst)) : defaults.time ? `${pad(defaults.time.h)}:${pad(defaults.time.m)}` : '07:00';
  const dur = inst && !allDay ? Math.round((evEnd(inst) - evStart(inst)) / 60000) : defaults.durationMin || 30;

  const body = `
    <div class="field"><input type="text" name="title" class="title-input" placeholder="루틴 이름 (예: 아침 운동)" value="${esc(inst ? inst.summary || '' : defaults.title || '')}" autofocus></div>
    <div class="field"><span class="lbl">요일</span>
      <div class="days-pick">${DAY_ORDER.map((d) => `<button type="button" data-day="${d}" class="${days.has(d) ? 'on' : ''}">${WEEKDAYS[d]}</button>`).join('')}</div>
      <div class="row"><button type="button" class="btn sm ghost" data-preset="all">매일</button><button type="button" class="btn sm ghost" data-preset="wk">평일</button><button type="button" class="btn sm ghost" data-preset="we">주말</button></div>
    </div>
    <label class="switch"><input type="checkbox" name="allDay" ${allDay ? 'checked' : ''}><i></i>시간 지정 안 함</label>
    <div class="two t-only">
      <div class="field"><label>시작 시간</label><input type="time" name="st" value="${st}" step="300"></div>
      <div class="field"><label>소요 시간</label><select name="dur">${[10, 15, 20, 30, 45, 60, 90, 120]
        .map((m) => `<option value="${m}" ${m === dur ? 'selected' : ''}>${m < 60 ? m + '분' : m / 60 + '시간'}</option>`)
        .join('')}</select></div>
    </div>
    <div class="field"><label>알림</label>${remSelect(inst ? remOf(inst) : prefs.defReminder)}</div>
    <div class="field"><label>메모</label><textarea name="desc" placeholder="목표, 방법 등">${esc(inst ? inst.description || '' : '')}</textarea></div>
    <div class="hint">"${esc(rc.summary)}" 캘린더에 반복 일정으로 저장되어 삼성 캘린더 알림으로도 받을 수 있습니다.${inst && !master ? ' (오프라인 상태: 요일 변경은 온라인에서 가능합니다)' : ''}</div>
  `;
  const footer = `${!isNew ? `<button class="btn danger" data-del>${icon('trash')}삭제</button>` : ''}<span class="grow"></span>
    <button class="btn" data-close>취소</button><button class="btn primary" data-save>저장</button>`;

  openModal({
    title: isNew ? '새 루틴' : '루틴 수정',
    body,
    footer,
    onMount(dlg, close) {
      const f = (n) => dlg.querySelector(`[name="${n}"]`);
      const sync = () => {
        dlg.querySelectorAll('[data-day]').forEach((b) => b.classList.toggle('on', days.has(+b.dataset.day)));
        dlg.querySelector('.t-only').style.display = f('allDay').checked ? 'none' : '';
      };
      dlg.querySelectorAll('[data-day]').forEach((b) =>
        b.addEventListener('click', () => {
          const d = +b.dataset.day;
          days.has(d) ? days.delete(d) : days.add(d);
          sync();
        })
      );
      dlg.querySelectorAll('[data-preset]').forEach((b) =>
        b.addEventListener('click', () => {
          days = new Set({ all: DAY_ORDER, wk: [1, 2, 3, 4, 5], we: [6, 0] }[b.dataset.preset]);
          sync();
        })
      );
      f('allDay').addEventListener('change', sync);
      sync();
      dlg.querySelector('[data-save]').addEventListener('click', async () => {
        const title = f('title').value.trim();
        if (!title) return showToast('루틴 이름을 입력하세요.', 'error');
        if (!days.size) return showToast('요일을 하나 이상 고르세요.', 'error');
        const rule =
          days.size === 7
            ? buildRRule({ freq: 'DAILY' })
            : buildRRule({ freq: 'WEEKLY', byday: DAY_ORDER.filter((d) => days.has(d)).map((d) => BYDAY[d]) });
        const ad = f('allDay').checked;
        const tz = localTimeZone();
        const durMin = Number(f('dur').value);
        const mkTimes = (baseDate) => {
          if (ad) return { start: { date: ymd(baseDate) }, end: { date: ymd(addDays(baseDate, 1)) } };
          const [h, m] = (f('st').value || '07:00').split(':').map(Number);
          const s = new Date(baseDate);
          s.setHours(h, m, 0, 0);
          return {
            start: { dateTime: toRFC3339(s), timeZone: tz },
            end: { dateTime: toRFC3339(addMinutes(s, durMin)), timeZone: tz },
          };
        };
        const common = {
          summary: title,
          description: f('desc').value.trim(),
          reminders: remBody(f('rem').value),
        };
        if (isNew) {
          // 첫 회차: 오늘부터 해당 요일 중 가장 빠른 날
          let first = startOfDay(new Date());
          for (let i = 0; i < 7 && !days.has(first.getDay()); i++) first = addDays(first, 1);
          store.createEvent(rc.id, { ...common, ...mkTimes(first), recurrence: [rule] });
          showToast('루틴을 추가했습니다');
          close();
          return;
        }
        const masterId = inst.recurringEventId || inst.id;
        const patch = { ...common };
        if (master) {
          const ms = master.start.dateTime ? new Date(master.start.dateTime) : parseYMD(master.start.date);
          Object.assign(patch, mkTimes(startOfDay(ms)));
          const rest = (master.recurrence || []).filter((r) => !r.startsWith('RRULE:'));
          patch.recurrence = [rule, ...rest];
        }
        if (inst.recurringEventId) store.updateSeries(calId, masterId, patch);
        else store.updateEvent(calId, masterId, patch);
        showToast('루틴을 저장했습니다');
        close();
      });
      dlg.querySelector('[data-del]')?.addEventListener('click', async () => {
        if (!(await confirmDlg('루틴 삭제', `"${inst.summary}" 루틴과 모든 기록을 삭제할까요?`, '삭제', 'danger'))) return;
        if (inst.recurringEventId) store.deleteSeries(calId, inst.recurringEventId);
        else store.deleteEvent(calId, inst.id);
        close();
        showToast('루틴을 삭제했습니다');
      });
    },
  });
}

// 빠른 입력 결과로 바로 만들기
export function createFromParse(p) {
  if (needData()) return false;
  const areas = areaList(state);
  if (p.kind === 'task') {
    const lists = taskAreaList(state);
    let listId = (p.area && p.area.tasklistId) || null;
    if (p.area && !listId) showToast(`"${p.area.name}" 할 일 목록이 없어 기본 목록에 추가합니다.`);
    if (!listId) listId = (areas.find((a) => a.id === defaultCalId()) || {}).tasklistId || (lists[0] || {}).id;
    if (!listId) return showToast('할 일 목록이 없습니다.', 'error'), false;
    const body = { title: p.title || '(제목 없음)', notes: buildNotes('', p.priority || 'normal') };
    if (p.date) body.due = dateToDue(p.date);
    store.createTask(listId, body);
    showToast(`할 일 추가: ${body.title}`);
    return true;
  }
  if (p.kind === 'routine') {
    const rc = routineCalendar();
    if (!rc) {
      openRoutineEditor({ defaults: p });
      return true;
    }
    const tz = localTimeZone();
    const d = p.date || startOfDay(new Date());
    const body = { summary: p.title || '(제목 없음)', recurrence: [p.rrule], reminders: remBody(prefs.defReminder) };
    if (p.time) {
      const s = new Date(d);
      s.setHours(p.time.h, p.time.m, 0, 0);
      const e = p.endTime ? new Date(new Date(d).setHours(p.endTime.h, p.endTime.m, 0, 0)) : addMinutes(s, p.durationMin || 30);
      Object.assign(body, { start: { dateTime: toRFC3339(s), timeZone: tz }, end: { dateTime: toRFC3339(e), timeZone: tz } });
    } else Object.assign(body, { start: { date: ymd(d) }, end: { date: ymd(addDays(d, 1)) } });
    store.createEvent(rc.id, body);
    showToast(`루틴 추가: ${body.summary}`);
    return true;
  }
  // 일정
  const calId = (p.area && p.area.id) || defaultCalId();
  const tz = localTimeZone();
  const d = p.date || startOfDay(new Date());
  const body = { summary: p.title || '(제목 없음)', reminders: remBody(prefs.defReminder) };
  if (p.location) body.location = p.location;
  if (p.time) {
    const s = new Date(d);
    s.setHours(p.time.h, p.time.m, 0, 0);
    let e;
    if (p.endTime) {
      e = new Date(d);
      e.setHours(p.endTime.h, p.endTime.m, 0, 0);
      if (e <= s) e = addDays(e, 1);
    } else e = addMinutes(s, p.durationMin || 60);
    body.start = { dateTime: toRFC3339(s), timeZone: tz };
    body.end = { dateTime: toRFC3339(e), timeZone: tz };
  } else {
    body.start = { date: ymd(d) };
    body.end = { date: ymd(addDays(d, 1)) };
  }
  if (p.rrule) body.recurrence = [p.rrule];
  store.createEvent(calId, body);
  showToast(`일정 추가: ${fmtDate(d)} ${body.summary}`);
  return true;
}

export { defaultCalId };
