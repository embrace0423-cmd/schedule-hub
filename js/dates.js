// 날짜·시간 유틸리티 (로컬 시간대 기준, 외부 의존성 없음)

export const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];
export const BYDAY = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
export const MS_DAY = 86400000;

export const pad = (n) => String(n).padStart(2, '0');

export function ymd(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function parseYMD(s) {
  const [y, m, d] = s.slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function startOfDay(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export function addDays(d, n) {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

export function addMinutes(d, n) {
  return new Date(d.getTime() + n * 60000);
}

export function addMonths(d, n) {
  const r = new Date(d.getFullYear(), d.getMonth() + n, 1);
  const last = new Date(r.getFullYear(), r.getMonth() + 1, 0).getDate();
  r.setDate(Math.min(d.getDate(), last));
  return r;
}

export function startOfMonth(d) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

export function startOfWeek(d, weekStart = 0) {
  const s = startOfDay(d);
  const diff = (s.getDay() - weekStart + 7) % 7;
  return addDays(s, -diff);
}

export function sameDay(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

export function daysBetween(a, b) {
  return Math.round((startOfDay(b) - startOfDay(a)) / MS_DAY);
}

// 2026-10-05T15:00:00+09:00 형식 (Google API 전송용)
export function toRFC3339(d) {
  const off = -d.getTimezoneOffset();
  const sign = off >= 0 ? '+' : '-';
  const a = Math.abs(off);
  return `${ymd(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}:00${sign}${pad(Math.floor(a / 60))}:${pad(a % 60)}`;
}

export function localTimeZone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Seoul';
  } catch {
    return 'Asia/Seoul';
  }
}

// ---- Google Calendar 이벤트 해석 ----
export function isAllDay(ev) {
  return !!(ev.start && ev.start.date);
}

export function evStart(ev) {
  if (!ev.start) return new Date(NaN);
  return ev.start.dateTime ? new Date(ev.start.dateTime) : parseYMD(ev.start.date);
}

export function evEnd(ev) {
  if (!ev.end) return evStart(ev);
  return ev.end.dateTime ? new Date(ev.end.dateTime) : parseYMD(ev.end.date); // 종일 일정의 end.date는 배타적
}

// 해당 날짜(로컬 0시~24시)에 걸치는지
export function overlapsDay(ev, day) {
  const s = evStart(ev);
  const e = evEnd(ev);
  const d0 = startOfDay(day);
  const d1 = addDays(d0, 1);
  if (isAllDay(ev)) return s < d1 && e > d0;
  if (e.getTime() === s.getTime()) return s >= d0 && s < d1;
  return s < d1 && e > d0;
}

export function overlapsRange(ev, from, to) {
  const s = evStart(ev);
  const e = evEnd(ev);
  return s < to && (e > from || (e.getTime() === s.getTime() && s >= from));
}

// ---- 표시 형식 ----
export function fmtTime(d) {
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function fmtDate(d, withYear = false) {
  const base = `${d.getMonth() + 1}월 ${d.getDate()}일 (${WEEKDAYS[d.getDay()]})`;
  return withYear ? `${d.getFullYear()}년 ${base}` : base;
}

export function fmtMonth(d) {
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월`;
}

export function relDayLabel(d, now = new Date()) {
  const n = daysBetween(now, d);
  if (n === 0) return '오늘';
  if (n === 1) return '내일';
  if (n === 2) return '모레';
  if (n === -1) return '어제';
  if (n < 0) return `${-n}일 지남`;
  if (n < 7) return `${WEEKDAYS[d.getDay()]}요일`;
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

export function fmtEventTime(ev) {
  if (isAllDay(ev)) {
    const s = evStart(ev);
    const e = addDays(evEnd(ev), -1);
    return sameDay(s, e) ? '종일' : `종일 · ~${e.getMonth() + 1}/${e.getDate()}`;
  }
  const s = evStart(ev);
  const e = evEnd(ev);
  if (sameDay(s, e)) return `${fmtTime(s)}–${fmtTime(e)}`;
  return `${fmtTime(s)} – ${e.getMonth() + 1}/${e.getDate()} ${fmtTime(e)}`;
}

// ---- Google Tasks 마감일 (날짜만 의미 있음, UTC 자정으로 저장됨) ----
export function dueToDate(due) {
  if (!due) return null;
  return parseYMD(due.slice(0, 10));
}

export function dateToDue(d) {
  return `${ymd(d)}T00:00:00.000Z`;
}

// ---- 반복 규칙 ----
export function buildRRule({ freq, byday, interval } = {}) {
  if (!freq || freq === 'NONE') return null;
  let r = `RRULE:FREQ=${freq}`;
  if (interval && interval > 1) r += `;INTERVAL=${interval}`;
  if (byday && byday.length) r += `;BYDAY=${byday.join(',')}`;
  return r;
}

export function parseRRule(rule) {
  if (!rule) return null;
  const line = (Array.isArray(rule) ? rule.find((x) => x.startsWith('RRULE:')) : rule) || '';
  if (!line) return null;
  const out = {};
  line.replace(/^RRULE:/, '').split(';').forEach((kv) => {
    const [k, v] = kv.split('=');
    out[k] = v;
  });
  return {
    freq: out.FREQ,
    byday: out.BYDAY ? out.BYDAY.split(',').map((x) => x.replace(/^[-+\d]+/, '')) : [],
    interval: out.INTERVAL ? Number(out.INTERVAL) : 1,
    until: out.UNTIL,
    count: out.COUNT,
  };
}

const WEEKDAY_SET = ['MO', 'TU', 'WE', 'TH', 'FR'];
export function describeRRule(rule) {
  const r = parseRRule(rule);
  if (!r) return '';
  const every = r.interval > 1 ? `${r.interval}` : '';
  switch (r.freq) {
    case 'DAILY':
      return every ? `${every}일마다` : '매일';
    case 'WEEKLY': {
      const days = r.byday;
      if (days.length === 7) return '매일';
      if (days.length === 5 && WEEKDAY_SET.every((d) => days.includes(d))) return every ? `${every}주마다 평일` : '평일';
      if (days.length === 2 && days.includes('SA') && days.includes('SU')) return '주말';
      const names = days
        .slice()
        .sort((a, b) => ((BYDAY.indexOf(a) + 6) % 7) - ((BYDAY.indexOf(b) + 6) % 7))
        .map((d) => WEEKDAYS[BYDAY.indexOf(d)])
        .join('·');
      return `${every ? every + '주마다' : '매주'}${names ? ' ' + names : ''}`;
    }
    case 'MONTHLY':
      return every ? `${every}개월마다` : '매월';
    case 'YEARLY':
      return '매년';
    default:
      return '반복';
  }
}
