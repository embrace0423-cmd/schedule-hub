// 한국어 빠른 입력 파서
// 예) "내일 오후 3시 현장 미팅 #건설 @강남역"  → 일정
//     "할일: 견적서 보내기 금요일까지 !중요 #외식" → 할 일
//     "루틴: 평일 7시 아침 운동"                  → 루틴
import { BYDAY, addDays, addMonths, startOfDay, buildRRule } from './dates.js';

const DAYCH = { 일: 0, 월: 1, 화: 2, 수: 3, 목: 4, 금: 5, 토: 6 };
const MER = '(오전|오후|아침|저녁|밤|새벽|낮|점심)';
// 시각 표현: [오전|오후..] 3시 [30분|반]  또는  15:30
const T = `(?:${MER}\\s*)?(\\d{1,2})(?:\\s*:\\s*(\\d{2})|\\s*시(?!간)(?:\\s*(\\d{1,2})\\s*분|\\s*(반))?)`;
const PARTICLE = '(?:까지|부터|에서|에|엔)?';

function applyMeridiem(h, mer, fallbackHeuristic = true) {
  if (mer === '오후' || mer === '저녁' || mer === '밤') return h < 12 ? h + 12 : h;
  if (mer === '오전' || mer === '아침' || mer === '새벽') return h === 12 ? 0 : h;
  if (mer === '낮' || mer === '점심') return h < 6 ? h + 12 : h;
  if (fallbackHeuristic && h >= 1 && h <= 6) return h + 12; // "3시 미팅" → 15시
  return h;
}

function timeFrom(m, i, heuristic = true) {
  // m[i]=meridiem, m[i+1]=hour, m[i+2]=mm(:), m[i+3]=분, m[i+4]=반
  const mer = m[i];
  let h = Number(m[i + 1]);
  const mm = m[i + 2] != null ? Number(m[i + 2]) : m[i + 3] != null ? Number(m[i + 3]) : m[i + 4] ? 30 : 0;
  if (h > 24 || mm > 59) return null;
  h = applyMeridiem(h, mer, heuristic && m[i + 2] == null); // "15:30" 처럼 콜론 표기는 그대로
  if (h === 24) h = 0;
  return { h, m: mm, mer };
}

export function normalizeAreaName(s) {
  return String(s || '')
    .replace(/^대동\s*[·.\-_ ]?\s*/, '')
    .replace(/[\s·.\-_]/g, '')
    .toLowerCase();
}

export function matchArea(token, areas) {
  if (!token || !areas || !areas.length) return null;
  const t = normalizeAreaName(token);
  if (!t) return null;
  const full = String(token).replace(/\s/g, '').toLowerCase();
  return (
    areas.find((a) => String(a.name).replace(/\s/g, '').toLowerCase() === full) ||
    areas.find((a) => normalizeAreaName(a.name) === t) ||
    areas.find((a) => normalizeAreaName(a.name).startsWith(t)) ||
    areas.find((a) => normalizeAreaName(a.name).includes(t)) ||
    null
  );
}

function nextWeekday(from, wd, includeToday = true) {
  const d = startOfDay(from);
  let diff = (wd - d.getDay() + 7) % 7;
  if (diff === 0 && !includeToday) diff = 7;
  return addDays(d, diff);
}

function weekMonday(d) {
  const s = startOfDay(d);
  return addDays(s, -((s.getDay() + 6) % 7));
}

export function parseQuick(input, opts = {}) {
  const now = opts.now ? new Date(opts.now) : new Date();
  const today = startOfDay(now);
  let s = ' ' + String(input || '').replace(/\s+/g, ' ').trim() + ' ';
  const out = {
    kind: opts.mode || 'event',
    title: '',
    date: null,
    time: null,
    endTime: null,
    allDay: false,
    durationMin: null,
    rrule: null,
    areaToken: null,
    area: null,
    location: null,
    priority: null,
  };

  const cut = (re, fn) => {
    const m = s.match(re);
    if (!m) return false;
    const r = fn(m);
    if (r === false) return false;
    s = s.slice(0, m.index) + ' ' + s.slice(m.index + m[0].length);
    return true;
  };

  // 0) 종류 접두어
  cut(/^\s*(할\s*일|todo|task)\s*[:：]\s*/i, () => (out.kind = 'task'));
  cut(/^\s*(루틴|습관|routine)\s*[:：]\s*/i, () => (out.kind = 'routine'));
  cut(/^\s*(일정|event)\s*[:：]\s*/i, () => (out.kind = 'event'));

  // 1) #영역, @장소
  cut(/\s#([^\s#@]+)/, (m) => {
    out.areaToken = m[1];
  });
  while (cut(/\s#([^\s#@]+)/, () => {}));
  cut(/\s@([^\s#@]+)/, (m) => {
    out.location = m[1];
  });
  out.area = matchArea(out.areaToken, opts.areas);

  // 2) 우선순위
  cut(/\s(!{2,3}|!높음|!중요|!긴급|긴급|중요)(?=\s)/, () => (out.priority = 'high'));
  cut(/\s!낮음(?=\s)/, () => (out.priority = 'low'));
  cut(/\s!보통(?=\s)/, () => (out.priority = 'normal'));
  cut(/\s!(?=\s)/, () => (out.priority = 'high'));

  // 3) 반복
  let rr = null;
  cut(/\s매주\s*((?:[월화수목금토일](?:요일)?\s*[,·/]?\s*)+)(?=\s|마다)(?:마다)?/, (m) => {
    const days = [...new Set(m[1].replace(/요일/g, '').replace(/[\s,·/]/g, '').split(''))].filter((c) => c in DAYCH);
    if (!days.length) return false;
    rr = { freq: 'WEEKLY', byday: days.map((c) => BYDAY[DAYCH[c]]) };
  });
  if (!rr) cut(/\s(?:매일\s*)?(평일|주중)(?:마다)?(?=\s)/, () => (rr = { freq: 'WEEKLY', byday: ['MO', 'TU', 'WE', 'TH', 'FR'] }));
  if (!rr)
    cut(/\s(매주\s*주말|매주말|주말마다)(?=\s)/, () => (rr = { freq: 'WEEKLY', byday: ['SA', 'SU'] }));
  if (!rr && out.kind === 'routine')
    cut(/\s주말(?=\s)/, () => (rr = { freq: 'WEEKLY', byday: ['SA', 'SU'] }));
  if (!rr) cut(/\s(매일|날마다)(?=\s)/, () => (rr = { freq: 'DAILY' }));
  if (!rr) cut(/\s(매월|매달)(?=\s)/, () => (rr = { freq: 'MONTHLY' }));
  if (!rr) cut(/\s(매년|해마다)(?=\s)/, () => (rr = { freq: 'YEARLY' }));
  if (!rr) cut(/\s(매주|주마다)(?=\s)/, () => (rr = { freq: 'WEEKLY', byday: [] }));

  // 4) 날짜
  const setDate = (d) => {
    if (!out.date && d && !isNaN(d)) out.date = startOfDay(d);
  };
  cut(new RegExp(`\\s(\\d{4})[-./](\\d{1,2})[-./](\\d{1,2})${PARTICLE}(?=\\s)`), (m) =>
    setDate(new Date(+m[1], +m[2] - 1, +m[3]))
  );
  if (!out.date)
    cut(new RegExp(`\\s(\\d{1,2})월\\s*(\\d{1,2})일${PARTICLE}(?=\\s)`), (m) => {
      let d = new Date(today.getFullYear(), +m[1] - 1, +m[2]);
      if ((today - d) / 86400000 > 60) d = new Date(today.getFullYear() + 1, +m[1] - 1, +m[2]);
      setDate(d);
    });
  if (!out.date)
    cut(new RegExp(`\\s(\\d{1,2})/(\\d{1,2})${PARTICLE}(?=\\s)`), (m) => {
      const mo = +m[1];
      const da = +m[2];
      if (mo < 1 || mo > 12 || da < 1 || da > 31) return false;
      let d = new Date(today.getFullYear(), mo - 1, da);
      if ((today - d) / 86400000 > 60) d = new Date(today.getFullYear() + 1, mo - 1, da);
      setDate(d);
    });
  if (!out.date)
    cut(new RegExp(`\\s(오늘|금일|내일|명일|모레|글피|어제)${PARTICLE}(?=\\s)`), (m) => {
      const off = { 오늘: 0, 금일: 0, 내일: 1, 명일: 1, 모레: 2, 글피: 3, 어제: -1 }[m[1]];
      setDate(addDays(today, off));
    });
  if (!out.date)
    cut(new RegExp(`\\s(\\d{1,3})\\s*(일|주|개월|달)\\s*(?:후|뒤)${PARTICLE}(?=\\s)`), (m) => {
      const n = +m[1];
      if (m[2] === '일') setDate(addDays(today, n));
      else if (m[2] === '주') setDate(addDays(today, n * 7));
      else setDate(addMonths(today, n));
    });
  if (!out.date)
    cut(
      new RegExp(`\\s(이번\\s*주|금주|다음\\s*주|담주|차주|다다음\\s*주)?\\s*([월화수목금토일])(?:요일|욜)${PARTICLE}(?=\\s)`),
      (m) => {
        const wd = DAYCH[m[2]];
        const pre = (m[1] || '').replace(/\s/g, '');
        if (!pre) return setDate(nextWeekday(today, wd, true));
        const mon = weekMonday(today);
        const weeks = pre === '이번주' || pre === '금주' ? 0 : pre === '다다음주' ? 2 : 1;
        setDate(addDays(mon, weeks * 7 + ((wd + 6) % 7)));
      }
    );
  if (!out.date)
    cut(new RegExp(`\\s(이번\\s*)?주말${PARTICLE}(?=\\s)`), () => setDate(nextWeekday(today, 6, true)));
  if (!out.date)
    cut(new RegExp(`\\s(다음\\s*주|담주|차주)${PARTICLE}(?=\\s)`), () => setDate(addDays(weekMonday(today), 7)));
  if (!out.date)
    cut(new RegExp(`\\s(다음\\s*달|다음\\s*월)${PARTICLE}(?=\\s)`), () =>
      setDate(new Date(today.getFullYear(), today.getMonth() + 1, 1))
    );
  if (!out.date)
    cut(new RegExp(`\\s(\\d{1,2})일${PARTICLE}(?=\\s)`), (m) => {
      const da = +m[1];
      if (da < 1 || da > 31) return false;
      let d = new Date(today.getFullYear(), today.getMonth(), da);
      if (d < today) d = new Date(today.getFullYear(), today.getMonth() + 1, da);
      setDate(d);
    });

  // 5) 종일 / 소요시간
  cut(/\s(하루\s*종일|종일|올데이)(?=\s)/, () => (out.allDay = true));
  cut(/\s(\d{1,2})\s*시간(?:\s*(\d{1,2})\s*분|\s*(반))?\s*(?:동안|간)?(?=\s)/, (m) => {
    out.durationMin = +m[1] * 60 + (m[2] ? +m[2] : m[3] ? 30 : 0);
  });
  if (out.durationMin == null)
    cut(/\s(\d{1,3})\s*분\s*(?:동안|간)(?=\s)/, (m) => {
      out.durationMin = +m[1];
    });

  // 6) 시각 (범위 → 단일)
  const rangeRe = new RegExp(`\\s${T}\\s*(?:-|~|–|부터)\\s*${T}${PARTICLE}(?=\\s)`);
  cut(rangeRe, (m) => {
    const a = timeFrom(m, 1);
    const b = timeFrom(m, 6, false);
    if (!a || !b) return false;
    if (!m[6] && m[8] == null) {
      // 끝 시각에 오전/오후가 없으면 시작 시각 이후가 되도록 보정
      b.h = applyMeridiem(b.h, null, true);
      if (b.h * 60 + b.m <= a.h * 60 + a.m && b.h < 12) b.h += 12;
    }
    out.time = { h: a.h, m: a.m };
    out.endTime = { h: b.h, m: b.m };
  });
  if (!out.time)
    cut(/\s(정오|자정)(?=\s)/, (m) => {
      out.time = m[1] === '정오' ? { h: 12, m: 0 } : { h: 0, m: 0 };
    });
  if (!out.time)
    cut(new RegExp(`\\s${T}${PARTICLE}(?=\\s)`), (m) => {
      const a = timeFrom(m, 1);
      if (!a) return false;
      out.time = { h: a.h, m: a.m };
    });
  if (out.time) out.allDay = false;

  // 7) 반복 규칙 확정
  if (rr) {
    if (rr.freq === 'WEEKLY' && (!rr.byday || !rr.byday.length)) {
      rr.byday = [BYDAY[(out.date || today).getDay()]];
    }
    out.rrule = buildRRule(rr);
    if (!out.date) {
      // 반복 시작일: 오늘 또는 첫 해당 요일
      if (rr.freq === 'WEEKLY') {
        const wds = rr.byday.map((d) => BYDAY.indexOf(d));
        let best = null;
        for (const wd of wds) {
          const d = nextWeekday(today, wd, true);
          if (!best || d < best) best = d;
        }
        out.date = best;
      } else out.date = today;
    }
    if (out.kind === 'task') out.kind = 'event';
  } else if (out.kind === 'routine') {
    out.rrule = buildRRule({ freq: 'DAILY' });
    if (!out.date) out.date = today;
  }

  // 8) 제목 정리
  out.title = s
    .replace(/\s(까지|부터|에서|에)(?=\s)/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^[\s,.:\-–~]+|[\s,.:\-–~]+$/g, '')
    .trim();

  if (out.kind === 'event' && !out.date) out.date = today;
  if (out.kind === 'event' && !out.time && !out.allDay) out.allDay = true;
  return out;
}

// 파싱 결과를 사람이 읽는 미리보기 문자열로
export function describeParse(p) {
  const parts = [];
  const kindLabel = { event: '일정', task: '할 일', routine: '루틴' }[p.kind];
  parts.push(kindLabel);
  if (p.date) parts.push(`${p.date.getMonth() + 1}/${p.date.getDate()}`);
  if (p.time) {
    const f = (t) => `${String(t.h).padStart(2, '0')}:${String(t.m).padStart(2, '0')}`;
    parts.push(p.endTime ? `${f(p.time)}–${f(p.endTime)}` : f(p.time));
  } else if (p.allDay && p.kind !== 'task') parts.push('종일');
  if (p.durationMin && !p.endTime) parts.push(`${p.durationMin}분`);
  if (p.rrule) parts.push('반복');
  if (p.area) parts.push(p.area.name);
  else if (p.areaToken) parts.push(`#${p.areaToken}(영역 없음)`);
  if (p.location) parts.push(`@${p.location}`);
  if (p.priority === 'high') parts.push('중요');
  return parts.join(' · ');
}
