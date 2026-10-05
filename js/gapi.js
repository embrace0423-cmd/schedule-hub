// Google Calendar API v3 / Google Tasks API v1 — 최소 REST 클라이언트
import { getToken } from './auth.js';

export const CAL = 'https://www.googleapis.com/calendar/v3';
export const TASKS = 'https://tasks.googleapis.com/tasks/v1';

export class ApiError extends Error {
  constructor(status, message, body) {
    super(message || `HTTP ${status}`);
    this.status = status;
    this.body = body;
  }
  get isNetwork() {
    return this.status === 0;
  }
  get isAuth() {
    return this.status === 401;
  }
  get isRetryable() {
    return this.status === 0 || this.status === 429 || this.status >= 500;
  }
}

// 데모 모드에서는 transport 를 모의 서버로 교체한다.
let transport = (url, init) => fetch(url, init);
let tokenProvider = getToken;
export const hasToken = () => !!tokenProvider();
export function setTransport(fn, tokenFn) {
  transport = fn;
  if (tokenFn) tokenProvider = tokenFn;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function api(method, url, { query, body, retries = 2 } = {}) {
  const token = tokenProvider();
  if (!token) throw new ApiError(401, 'no_token');
  const u = new URL(url);
  if (query) for (const [k, v] of Object.entries(query)) if (v != null && v !== '') u.searchParams.set(k, v);
  const init = {
    method,
    headers: { Authorization: `Bearer ${token}` },
  };
  if (body !== undefined) {
    init.headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(body);
  }
  for (let attempt = 0; ; attempt++) {
    let res;
    try {
      res = await transport(u.toString(), init);
    } catch (e) {
      throw new ApiError(0, 'network');
    }
    if (res.status === 204) return null;
    let data = null;
    const text = await res.text();
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = text;
    }
    if (res.ok) return data;
    const msg = (data && data.error && (data.error.message || data.error.status)) || `HTTP ${res.status}`;
    const err = new ApiError(res.status, msg, data);
    if ((res.status === 429 || res.status >= 500) && attempt < retries) {
      await sleep(400 * Math.pow(3, attempt));
      continue;
    }
    throw err;
  }
}

async function paged(url, query, key = 'items') {
  const out = [];
  let pageToken;
  let guard = 0;
  do {
    const r = await api('GET', url, { query: { ...query, pageToken } });
    if (r && r[key]) out.push(...r[key]);
    pageToken = r && r.nextPageToken;
  } while (pageToken && ++guard < 40);
  return out;
}

const enc = encodeURIComponent;
const EV_FIELDS =
  'items(id,status,summary,description,location,start,end,recurringEventId,originalStartTime,recurrence,reminders,extendedProperties,colorId,htmlLink,updated),nextPageToken';

// ---------- Calendar ----------
export const cal = {
  listCalendars: () => paged(`${CAL}/users/me/calendarList`, { maxResults: 250 }),
  listEvents: (calId, timeMin, timeMax) =>
    paged(`${CAL}/calendars/${enc(calId)}/events`, {
      singleEvents: 'true',
      orderBy: 'startTime',
      timeMin,
      timeMax,
      maxResults: 2500,
      fields: EV_FIELDS,
    }),
  getEvent: (calId, id) => api('GET', `${CAL}/calendars/${enc(calId)}/events/${enc(id)}`),
  insertEvent: (calId, body) => api('POST', `${CAL}/calendars/${enc(calId)}/events`, { body }),
  patchEvent: (calId, id, body) => api('PATCH', `${CAL}/calendars/${enc(calId)}/events/${enc(id)}`, { body }),
  deleteEvent: async (calId, id) => {
    try {
      return await api('DELETE', `${CAL}/calendars/${enc(calId)}/events/${enc(id)}`);
    } catch (e) {
      if (e.status === 404 || e.status === 410) return null; // 이미 삭제됨
      throw e;
    }
  },
  moveEvent: (calId, id, dest) =>
    api('POST', `${CAL}/calendars/${enc(calId)}/events/${enc(id)}/move`, { query: { destination: dest } }),
  insertCalendar: (summary, timeZone) => api('POST', `${CAL}/calendars`, { body: { summary, timeZone } }),
  setCalendarColor: (id, bg, fg = '#ffffff') =>
    api('PATCH', `${CAL}/users/me/calendarList/${enc(id)}`, {
      query: { colorRgbFormat: 'true' },
      body: { backgroundColor: bg, foregroundColor: fg },
    }),
};

// ---------- Tasks ----------
export const tasks = {
  listLists: () => paged(`${TASKS}/users/@me/lists`, { maxResults: 100 }),
  insertList: (title) => api('POST', `${TASKS}/users/@me/lists`, { body: { title } }),
  list: (listId) =>
    paged(`${TASKS}/lists/${enc(listId)}/tasks`, {
      showCompleted: 'true',
      showHidden: 'true',
      maxResults: 100,
    }),
  insert: (listId, body) => api('POST', `${TASKS}/lists/${enc(listId)}/tasks`, { body }),
  patch: (listId, id, body) => api('PATCH', `${TASKS}/lists/${enc(listId)}/tasks/${enc(id)}`, { body }),
  remove: async (listId, id) => {
    try {
      return await api('DELETE', `${TASKS}/lists/${enc(listId)}/tasks/${enc(id)}`);
    } catch (e) {
      if (e.status === 404 || e.status === 410) return null;
      throw e;
    }
  },
};
