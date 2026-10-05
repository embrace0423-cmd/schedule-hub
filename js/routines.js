// 루틴(습관) 모델 — '루틴' 캘린더의 반복 일정 회차들로부터 통계를 계산한다.
import { state } from './store.js';
import { isRoutineCal } from './areas.js';
import { evStart, startOfDay, addDays, sameDay, BYDAY, WEEKDAYS, fmtTime, isAllDay, evEnd } from './dates.js';

export const isDone = (ev) => !!(ev && ev.extendedProperties && ev.extendedProperties.private && ev.extendedProperties.private.shDone === '1');

export function routineCal() {
  return state.calendars.find((c) => isRoutineCal(c)) || null;
}

export function routineInstances() {
  const rc = routineCal();
  if (!rc) return [];
  return Object.values(state.events[rc.id] || {})
    .filter((e) => e.status !== 'cancelled')
    .map((e) => ({ ...e, _cal: rc.id }));
}

function daysLabel(set) {
  const arr = [...set];
  if (arr.length === 7) return '매일';
  const s = new Set(arr);
  if (arr.length === 5 && [1, 2, 3, 4, 5].every((d) => s.has(d))) return '평일';
  if (arr.length === 2 && s.has(0) && s.has(6)) return '주말';
  return '매주 ' + [1, 2, 3, 4, 5, 6, 0].filter((d) => s.has(d)).map((d) => WEEKDAYS[d]).join('·');
}

export function seriesList(now = new Date()) {
  const today = startOfDay(now);
  const groups = new Map();
  for (const ev of routineInstances()) {
    const key = ev.recurringEventId || ev.id;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(ev);
  }
  const out = [];
  for (const [key, list] of groups) {
    list.sort((a, b) => evStart(a) - evStart(b));
    const todayInst = list.find((e) => sameDay(evStart(e), today)) || null;
    const future = list.filter((e) => startOfDay(evStart(e)) >= today);
    const past = list.filter((e) => startOfDay(evStart(e)) <= today);
    // 요일 패턴 (최근·향후 4주 회차 기준)
    const wd = new Set(
      list
        .filter((e) => Math.abs(startOfDay(evStart(e)) - today) <= 28 * 86400000)
        .map((e) => evStart(e).getDay())
    );
    // 연속 달성
    let streak = 0;
    for (let i = past.length - 1; i >= 0; i--) {
      const e = past[i];
      if (sameDay(evStart(e), today) && !isDone(e)) continue; // 오늘 미완료는 아직 끊긴 게 아님
      if (isDone(e)) streak++;
      else break;
    }
    // 최근 30일 달성률
    const from = addDays(today, -29);
    const win = past.filter((e) => startOfDay(evStart(e)) >= from && !(sameDay(evStart(e), today) && !isDone(e)));
    const doneN = win.filter(isDone).length;
    const rate = win.length ? Math.round((doneN / win.length) * 100) : null;
    // 최근 14일 스트립
    const strip = [];
    for (let i = 13; i >= 0; i--) {
      const d = addDays(today, -i);
      const e = list.find((x) => sameDay(evStart(x), d));
      strip.push({ d, state: !e ? 'none' : isDone(e) ? 'done' : i === 0 ? 'today' : 'miss' });
    }
    const ref = todayInst || future[0] || list[list.length - 1];
    out.push({
      key,
      calId: ref._cal,
      title: ref.summary || '(제목 없음)',
      ref,
      todayInst,
      next: future.find((e) => !sameDay(evStart(e), today)) || null,
      days: wd.size ? daysLabel(wd) : '',
      time: isAllDay(ref) ? '시간 미지정' : `${fmtTime(evStart(ref))}–${fmtTime(evEnd(ref))}`,
      sortKey: isAllDay(ref) ? -1 : evStart(ref).getHours() * 60 + evStart(ref).getMinutes(),
      streak,
      rate,
      doneN,
      totalN: win.length,
      strip,
    });
  }
  return out.sort((a, b) => a.sortKey - b.sortKey || a.title.localeCompare(b.title));
}

export function todayRoutines(now = new Date()) {
  return seriesList(now).filter((s) => s.todayInst);
}

export { BYDAY };
