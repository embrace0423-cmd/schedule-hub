// Google Tasks 에는 우선순위 필드가 없어 메모 마지막 줄에 "우선순위:높음" 형태로 저장한다.
// (Google Tasks 앱·캘린더에서도 사람이 읽을 수 있는 형태)
const RE = /(?:^|\n)우선순위\s*[:：]\s*(높음|보통|낮음)\s*$/;
const MAP = { 높음: 'high', 보통: 'normal', 낮음: 'low' };
const LABEL = { high: '높음', normal: '보통', low: '낮음' };

export function taskPriority(t) {
  const m = String((t && t.notes) || '').match(RE);
  return m ? MAP[m[1]] : 'normal';
}

export function notesBody(t) {
  return String((t && t.notes) || '').replace(RE, '').trim();
}

export function buildNotes(body, priority) {
  const b = String(body || '').trim();
  if (!priority || priority === 'normal') return b;
  return (b ? b + '\n' : '') + `우선순위:${LABEL[priority]}`;
}

export const PRIORITY_LABEL = LABEL;
