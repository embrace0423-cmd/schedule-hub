// 영역(사업·생활 분류) = Google 캘린더 1개 + 같은 이름의 Google 할 일 목록 1개
// 이름으로 짝을 짓기 때문에 데스크톱·휴대폰 어디서든 별도 설정 없이 같은 분류가 보인다.
import { CONFIG } from '../config.js';
import { normalizeAreaName } from './nlp.js';
import { ls } from './db.js';

export const DEFAULT_AREAS = [
  { name: '대동·외식', color: '#F4511E' },
  { name: '대동·건설', color: '#3F51B5' },
  { name: '대동·심리상담', color: '#0B8043' },
  { name: '개인', color: '#039BE5' },
  { name: '가족', color: '#E67C73' },
  { name: '루틴', color: '#8E24AA', routine: true },
];

const norm = (s) => String(s || '').replace(/\s/g, '').toLowerCase();

export function routineName() {
  return ls.get('sh.routineCal') || CONFIG.ROUTINE_CALENDAR_NAME || '루틴';
}

export function isRoutineCal(c) {
  return !!c && norm(c.summary) === norm(routineName());
}

export function calName(c) {
  if (!c) return '';
  if (c.primary) return '기본';
  return c.summary;
}

export function writableCalendars(state) {
  return state.calendars.filter((c) => c.accessRole === 'owner' || c.accessRole === 'writer');
}

export function calendarById(state, id) {
  return state.calendars.find((c) => c.id === id) || null;
}

export function colorOf(state, calId) {
  const c = calendarById(state, calId);
  return (c && c.backgroundColor) || '#9aa0a6';
}

// 영역 목록 (빠른 입력의 #태그 매칭, 편집기의 영역 선택에 사용)
export function areaList(state) {
  return writableCalendars(state).map((c) => ({
    id: c.id,
    name: calName(c),
    rawName: c.summary,
    color: c.backgroundColor,
    primary: c.primary,
    routine: isRoutineCal(c),
    tasklistId: tasklistFor(state, c),
  }));
}

export function tasklistFor(state, c) {
  if (!c) return null;
  const hit = state.tasklists.find((l) => norm(l.title) === norm(c.summary));
  if (hit) return hit.id;
  if (c.primary && state.tasklists.length) return state.tasklists[0].id; // 기본 캘린더 ↔ 기본 할 일 목록
  return null;
}

// 할 일 목록 → 표시용 이름/색상
export function listMeta(state, listId) {
  const l = state.tasklists.find((x) => x.id === listId);
  const title = l ? l.title : '할 일';
  const c =
    state.calendars.find((x) => norm(x.summary) === norm(title)) ||
    (state.tasklists[0] && state.tasklists[0].id === listId ? state.calendars.find((x) => x.primary) : null);
  return { id: listId, name: title, color: c ? c.backgroundColor : '#9aa0a6', calId: c ? c.id : null };
}

export function taskAreaList(state) {
  return state.tasklists.map((l) => listMeta(state, l.id));
}

// 숨긴 캘린더 (기기별 보기 설정)
export function hiddenCals() {
  return new Set(ls.get('sh.hiddenCals', []));
}
export function toggleHidden(id) {
  const h = hiddenCals();
  if (h.has(id)) h.delete(id);
  else h.add(id);
  ls.set('sh.hiddenCals', [...h]);
}

export { normalizeAreaName };
