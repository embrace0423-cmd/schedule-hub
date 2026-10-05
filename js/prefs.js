// 기기별 보기 설정 (localStorage)
import { CONFIG } from '../config.js';
import { ls } from './db.js';

export const prefs = {
  get theme() {
    return ls.get('sh.theme', 'system');
  },
  set theme(v) {
    ls.set('sh.theme', v);
    applyTheme();
  },
  get weekStart() {
    return ls.get('sh.weekStart', 0); // 0=일요일, 1=월요일
  },
  set weekStart(v) {
    ls.set('sh.weekStart', Number(v));
  },
  get defReminder() {
    const v = ls.get('sh.defRem', null);
    return v == null ? CONFIG.DEFAULT_REMINDER_MIN : v; // -1 = 알림 없음
  },
  set defReminder(v) {
    ls.set('sh.defRem', Number(v));
  },
  get defaultCal() {
    return ls.get('sh.defaultCal', null);
  },
  set defaultCal(v) {
    ls.set('sh.defaultCal', v);
  },
  get calView() {
    return ls.get('sh.calView', null);
  },
  set calView(v) {
    ls.set('sh.calView', v);
  },
  get taskGroup() {
    return ls.get('sh.taskGroup', 'due');
  },
  set taskGroup(v) {
    ls.set('sh.taskGroup', v);
  },
  get showDone() {
    return ls.get('sh.showDone', false);
  },
  set showDone(v) {
    ls.set('sh.showDone', !!v);
  },
  get routinesInMonth() {
    return ls.get('sh.rtMonth', false);
  },
  set routinesInMonth(v) {
    ls.set('sh.rtMonth', !!v);
  },
  get quickMode() {
    return ls.get('sh.quickMode', 'event');
  },
  set quickMode(v) {
    ls.set('sh.quickMode', v);
  },
};

export function applyTheme() {
  const t = prefs.theme;
  if (t === 'light' || t === 'dark') document.documentElement.dataset.theme = t;
  else delete document.documentElement.dataset.theme;
  const dark = t === 'dark' || (t === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', dark ? '#0e1117' : '#f5f6fa');
}
