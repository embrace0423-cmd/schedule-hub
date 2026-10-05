import { allEvents, allTasks } from '../store.js';
import { esc } from '../ui.js';
import { evStart, fmtDate } from '../dates.js';
import { eventRow, taskRow } from './common.js';

export function renderSearch(el, params) {
  const q = (params.get('q') || '').trim();
  const ql = q.toLowerCase();
  let html = '';
  if (q) {
    const match = (...xs) => xs.some((x) => String(x || '').toLowerCase().includes(ql));
    const evs = allEvents()
      .filter((e) => match(e.summary, e.location, e.description))
      .sort((a, b) => evStart(b) - evStart(a))
      .slice(0, 80);
    const ts = allTasks().filter((t) => match(t.title, t.notes)).slice(0, 80);
    html += `<div class="group-h">일정 <span class="n">${evs.length}</span></div>`;
    html += evs.map((e) => eventRow(e, { timeLabel: fmtDate(evStart(e)) })).join('') || '<div class="empty">없음</div>';
    html += `<div class="group-h">할 일 <span class="n">${ts.length}</span></div>`;
    html += ts.map((t) => taskRow(t)).join('') || '<div class="empty">없음</div>';
  } else html = '<div class="empty">검색어를 입력하세요. (이 기기에 저장된 일정·할 일에서 찾습니다)</div>';
  el.innerHTML = `<div class="quick card" style="margin-bottom:14px"><div class="bar">
      <input id="search-input" data-keep="search" type="search" placeholder="일정·할 일 검색" value="${esc(q)}" aria-label="검색"></div></div>
    <section class="card"><div class="body">${html}</div></section>`;
}
