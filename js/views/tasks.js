import { state, allTasks } from '../store.js';
import { taskAreaList } from '../areas.js';
import { esc, icon } from '../ui.js';
import { startOfDay, addDays, dueToDate, daysBetween } from '../dates.js';
import { taskRow, sortTasks } from './common.js';
import { quickAdd } from './today.js';
import { prefs } from '../prefs.js';

export function renderTasks(el) {
  const now = new Date();
  const today = startOfDay(now);
  const group = prefs.taskGroup;
  const showDone = prefs.showDone;
  const all = allTasks();
  const open = all.filter((t) => t.status !== 'completed');
  const doneRecent = all
    .filter((t) => t.status === 'completed' && t.completed && new Date(t.completed) > addDays(today, -14))
    .sort((a, b) => new Date(b.completed) - new Date(a.completed));

  let html = '';
  const section = (title, list, cls = '') =>
    list.length
      ? `<div class="group-h ${cls}">${title} <span class="n">${list.length}</span></div>${list.map((t) => taskRow(t, { now, showList: group !== 'area' })).join('')}`
      : '';

  if (group === 'area') {
    for (const m of taskAreaList(state)) {
      const list = sortTasks(open.filter((t) => t._list === m.id));
      html += `<div class="group-h"><span class="dot" style="background:${esc(m.color)}"></span>${esc(m.name)} <span class="n">${list.length}</span>
        <button class="btn sm ghost" style="margin-left:auto" data-action="new-task" data-list="${esc(m.id)}">${icon('plus')}</button></div>`;
      html += list.map((t) => taskRow(t, { now, showList: false })).join('') || '<div class="empty" style="padding:6px">비어 있음</div>';
    }
  } else {
    const b = { over: [], today: [], tom: [], week: [], later: [], none: [] };
    for (const t of open) {
      const d = dueToDate(t.due);
      if (!d) b.none.push(t);
      else {
        const n = daysBetween(today, d);
        if (n < 0) b.over.push(t);
        else if (n === 0) b.today.push(t);
        else if (n === 1) b.tom.push(t);
        else if (n <= 7) b.week.push(t);
        else b.later.push(t);
      }
    }
    html += section('기한 지남', sortTasks(b.over), 'danger-t');
    html += section('오늘', sortTasks(b.today));
    html += section('내일', sortTasks(b.tom));
    html += section('7일 이내', sortTasks(b.week));
    html += section('이후', sortTasks(b.later));
    html += section('마감 없음', sortTasks(b.none));
  }
  if (showDone) html += section('완료 (최근 14일)', doneRecent);
  if (!open.length && !(showDone && doneRecent.length)) html += '<div class="empty">할 일이 없습니다. 위 입력창에 바로 적어 보세요.</div>';

  el.innerHTML = `
    ${quickAdd('task', ['task'])}
    <div class="cal-tools" style="margin-top:14px">
      <div class="seg"><button data-action="task-group" data-g="due" class="${group === 'due' ? 'on' : ''}">기한별</button><button data-action="task-group" data-g="area" class="${group === 'area' ? 'on' : ''}">영역별</button></div>
      <label class="switch" style="margin-left:8px"><input type="checkbox" data-action-change="show-done" ${showDone ? 'checked' : ''}><i></i>완료 포함</label>
      <span class="grow"></span>
      <button class="btn primary" data-action="new-task">${icon('plus')}새 할 일</button>
    </div>
    <section class="card"><div class="body">${html}</div></section>`;
}
