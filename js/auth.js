// Google OAuth 2.0 — 리디렉션 방식(브라우저 단독, 서버 불필요)
// 설치형 PWA(Windows 앱 창·안드로이드 WebAPK)에서도 팝업 차단 없이 동작한다.
import { CONFIG } from '../config.js';
import { ls } from './db.js';

export const SCOPES = [
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/tasks',
];
const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const K_TOKEN = 'sh.token';
const K_STATE = 'sh.oauthState';
const K_CLIENT = 'sh.clientId';
const K_EMAIL = 'sh.email';
const K_CONNECTED = 'sh.connected';
const K_SILENT = 'sh.silentAt';

export function getClientId() {
  return (ls.get(K_CLIENT) || CONFIG.CLIENT_ID || '').trim();
}
export function setClientId(id) {
  ls.set(K_CLIENT, String(id || '').trim());
}

export function redirectUri() {
  const path = location.pathname.replace(/index\.html$/, '');
  return location.origin + path;
}

export function getToken() {
  const t = ls.get(K_TOKEN);
  if (!t || !t.access_token) return null;
  if (Date.now() > t.expires_at - 60_000) return null;
  return t.access_token;
}
export function tokenInfo() {
  return ls.get(K_TOKEN);
}
export function isConnectedBefore() {
  return !!ls.get(K_CONNECTED);
}
export function setEmail(e) {
  if (e) ls.set(K_EMAIL, e);
}
export function getEmail() {
  return ls.get(K_EMAIL) || CONFIG.LOGIN_HINT || '';
}

export function grantedScopes() {
  const t = ls.get(K_TOKEN);
  return t && t.scope ? t.scope.split(' ') : [];
}
export function missingScopes() {
  const g = grantedScopes();
  return SCOPES.filter((s) => !g.includes(s));
}

function rand() {
  const a = new Uint8Array(16);
  crypto.getRandomValues(a);
  return [...a].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Google 로그인 페이지로 이동. silent=true 이면 화면 없이(prompt=none) 토큰만 갱신 시도 */
export function startLogin({ silent = false, consent = false } = {}) {
  const clientId = getClientId();
  if (!clientId) throw new Error('CLIENT_ID 가 설정되지 않았습니다.');
  const state = rand();
  const route = location.hash && location.hash.startsWith('#/') ? location.hash : '#/today';
  ls.set(K_STATE, { state, silent, route, at: Date.now() });
  if (silent) ls.set(K_SILENT, Date.now());
  const p = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri(),
    response_type: 'token',
    scope: SCOPES.join(' '),
    include_granted_scopes: 'true',
    state,
  });
  const hint = getEmail();
  if (hint) p.set('login_hint', hint);
  if (silent) p.set('prompt', 'none');
  else if (consent) p.set('prompt', 'consent');
  location.assign(`${AUTH_URL}?${p.toString()}`);
}

/** 앱 시작 시 호출: OAuth 응답(#access_token=…)을 처리한다. */
export function handleRedirect() {
  const h = location.hash || '';
  if (!/[#&](access_token|error)=/.test(h)) return null;
  const params = new URLSearchParams(h.slice(1));
  const saved = ls.get(K_STATE) || {};
  ls.del(K_STATE);
  const route = saved.route || '#/today';
  history.replaceState(null, '', location.pathname + location.search + route);
  if (!saved.state || params.get('state') !== saved.state) {
    return { ok: false, error: 'state_mismatch', silent: !!saved.silent };
  }
  const err = params.get('error');
  if (err) return { ok: false, error: err, silent: !!saved.silent };
  const expiresIn = Number(params.get('expires_in') || 3600);
  ls.set(K_TOKEN, {
    access_token: params.get('access_token'),
    expires_at: Date.now() + expiresIn * 1000,
    scope: params.get('scope') || '',
  });
  ls.set(K_CONNECTED, true);
  return { ok: true, silent: !!saved.silent };
}

/** 토큰이 만료됐고 예전에 연결한 적이 있으면 조용히 갱신(리디렉션)할지 판단 */
export function shouldSilentRenew() {
  if (!getClientId() || !isConnectedBefore() || getToken()) return false;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return false;
  const last = ls.get(K_SILENT) || 0;
  return Date.now() - last > 5 * 60_000; // 5분에 한 번까지만 (무한 리디렉션 방지)
}

export function markExpired() {
  const t = ls.get(K_TOKEN);
  if (t) ls.set(K_TOKEN, { ...t, expires_at: 0 });
}

export async function logout() {
  const t = ls.get(K_TOKEN);
  ls.del(K_TOKEN);
  ls.del(K_CONNECTED);
  ls.del(K_SILENT);
  if (t && t.access_token) {
    try {
      await fetch('https://oauth2.googleapis.com/revoke?token=' + encodeURIComponent(t.access_token), {
        method: 'POST',
        mode: 'no-cors',
      });
    } catch {
      /* 오프라인이면 무시 */
    }
  }
}
