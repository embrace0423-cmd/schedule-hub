// 출처는 등록자가 남긴 값으로만 판별한다. 같은 계정이 GPT와 Claude를 모두 쓸 수 있다.
export const SOURCE_LABELS = Object.freeze({ all: '전체', gpt: 'GPT', claude: 'Claude', unknown: '미표시' });

export function sourceFilter(value) {
  return Object.hasOwn(SOURCE_LABELS, value) ? value : 'all';
}

function known(value) {
  const name = String(value || '').trim().toLowerCase();
  return name === 'gpt' || name === 'claude' ? name : null;
}

const sourceMarker = /^\[ScheduleHub-Source:[ \t]*(GPT|Claude)\]$/i;

function descriptionParts(value) {
  const note = String(value ?? '');
  const parts = [];
  // 주석이나 스크립트 내부 줄바꿈은 보이는 메모의 경계가 아니다.
  const boundaries = /<!--[\s\S]*?-->|<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>|(\r\n|[\r\n]|<\/?(?:br|div|p|li)\b[^>]*>)/gi;
  let start = 0;
  for (const match of note.matchAll(boundaries)) {
    if (!match[2]) continue;
    parts.push(note.slice(start, match.index), match[2]);
    start = match.index + match[0].length;
  }
  parts.push(note.slice(start));
  return parts;
}

function lineSource(part) {
  if (!/\[ScheduleHub-Source:/i.test(part)) return null;
  const visible = part.replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, '')
    .replace(/<[^>\n]+>/g, '').replace(/&nbsp;|&#160;/gi, ' ').trim();
  return sourceMarker.exec(visible)?.[1].toLowerCase();
}

export function eventSource(event) {
  const stored = known(event?.extendedProperties?.private?.scheduleHubSource);
  if (stored) return stored;
  if (!event?.description || !/\[ScheduleHub-Source:/i.test(event.description)) return 'unknown';
  const markers = new Set(descriptionParts(event.description).map(lineSource).filter(Boolean));
  if (markers.size === 1) return [...markers][0];
  return 'unknown';
}

export function descriptionWithSource(description, origin) {
  const parts = descriptionParts(description);
  const markers = parts.filter(part => lineSource(part));
  const marker = known(origin) ? '[ScheduleHub-Source: ' + SOURCE_LABELS[origin] + ']' : null;
  // 이미 올바른 표식 하나만 있으면 원래 서식을 그대로 유지한다.
  if (marker && markers.length === 1 && lineSource(markers[0]) === origin && markers[0].includes(marker)) return String(description);
  const note = parts.filter(part => !lineSource(part)).join('');
  if (!marker) return note;
  const separator = note && !/[\r\n]$/.test(note) ? '\n' : '';
  return note + separator + marker;
}

export function sourceBadge(event, compact = false) {
  const source = eventSource(event);
  if (compact && source === 'unknown') return '';
  const label = SOURCE_LABELS[source];
  if (compact) return `<abbr class="source-badge compact" aria-label="등록 경로: ${label}" title="등록 경로: ${label}">${label[0]}</abbr>`;
  return `<span class="source-badge" title="등록 경로: ${label}">${label}</span>`;
}
