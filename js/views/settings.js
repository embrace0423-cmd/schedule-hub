import { state } from '../store.js';
import * as auth from '../auth.js';
import { CONFIG } from '../../config.js';
import { esc, icon } from '../ui.js';
import { hiddenCals, routineName, writableCalendars, calName, isRoutineCal } from '../areas.js';
import { prefs } from '../prefs.js';
import { defaultCalId } from '../editors.js';

export const APP_VERSION = '1.0.0';

function ago(ts) {
  if (!ts) return '없음';
  const s = Math.round((Date.now() - ts) / 1000);
  if (s < 60) return '방금 전';
  if (s < 3600) return `${Math.floor(s / 60)}분 전`;
  if (s < 86400) return `${Math.floor(s / 3600)}시간 전`;
  return new Date(ts).toLocaleString('ko-KR');
}

export function renderSettings(el, ctx) {
  const demo = ctx.demo;
  const clientId = auth.getClientId();
  const connected = !!auth.getToken();
  const email = auth.getEmail();
  const secure = location.protocol === 'https:' || ['localhost', '127.0.0.1'].includes(location.hostname);
  let pill;
  if (demo) pill = '<span class="status-pill">데모 모드</span>';
  else if (connected) pill = `<span class="status-pill ok">${icon('check')}연결됨${email ? ' · ' + esc(email) : ''}</span>`;
  else if (auth.isConnectedBefore()) pill = '<span class="status-pill bad">연결 만료 — 다시 연결 필요</span>';
  else pill = '<span class="status-pill">연결 안 됨</span>';
  const missing = connected ? auth.missingScopes() : [];

  const hidden = hiddenCals();
  const roleL = { owner: '소유', writer: '편집', reader: '읽기', freeBusyReader: '읽기' };
  const calRows = state.calendars
    .map(
      (c) => `<div class="kv"><span class="row" style="min-width:0"><span class="dot" style="background:${esc(c.backgroundColor)}"></span>
        <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(calName(c))}${c.primary ? ` <span class="muted">(${esc(c.summary)})</span>` : ''}</span>
        <span class="chip">${roleL[c.accessRole] || c.accessRole}</span>${isRoutineCal(c) ? '<span class="chip">루틴</span>' : ''}</span>
        <label class="switch" title="이 기기에서 표시"><input type="checkbox" data-action-change="toggle-cal" data-id="${esc(c.id)}" ${hidden.has(c.id) ? '' : 'checked'}><i></i></label></div>`
    )
    .join('');
  const wcals = writableCalendars(state);
  const defCal = defaultCalId();
  const rn = routineName();

  const installed = matchMedia('(display-mode: standalone)').matches || navigator.standalone;

  el.innerHTML = `<div class="settings">
  <section class="card" id="google">
    <header><h3>Google 연결</h3><span class="end">${pill}</span></header>
    <div class="body">
      ${!secure ? `<div class="notice err">이 주소(${esc(location.origin)})는 HTTPS가 아니어서 Google 로그인과 앱 설치가 동작하지 않습니다. GitHub Pages 같은 HTTPS 주소에서 여세요.</div>` : ''}
      ${missing.length ? `<div class="notice warn">일부 권한이 허용되지 않았습니다(${missing.map((s) => s.split('/').pop()).join(', ')}). [다시 연결]을 눌러 모두 체크해 주세요.</div>` : ''}
      <div class="field"><label for="client-id">OAuth 클라이언트 ID</label>
        <div class="row"><input id="client-id" class="inp" data-keep="client" placeholder="xxxxxxxx.apps.googleusercontent.com" value="${esc(clientId)}" spellcheck="false">
        <button class="btn" data-action="save-client">저장</button></div>
        <span class="hint">${CONFIG.CLIENT_ID ? 'config.js 에 설정된 값이 있습니다. 여기서 바꾸면 이 기기에만 적용됩니다.' : '한 번만 입력하면 됩니다. (config.js 에 넣어 두면 모든 기기에 자동 적용)'}</span></div>
      <div class="row wrap" style="margin:12px 0 4px">
        ${
          demo
            ? `<button class="btn primary" data-action="demo-off">데모 종료하고 실제 계정 연결</button>`
            : connected
              ? `<button class="btn" data-action="sync-now">${icon('refresh')}지금 동기화</button><button class="btn" data-action="login" data-consent="1">권한 다시 받기</button><button class="btn danger" data-action="logout">연결 해제</button>`
              : `<button class="btn primary" data-action="login" ${clientId && secure ? '' : 'disabled'}>${icon('google')}Google 계정 연결</button>`
        }
      </div>
      <details ${clientId ? '' : 'open'} style="margin-top:12px">
        <summary style="cursor:pointer;font-weight:650">Google Cloud 설정 방법 (처음 1회, 약 10분)</summary>
        <ol class="steps">
          <li><a href="https://console.cloud.google.com/projectcreate" target="_blank" rel="noopener">Google Cloud 콘솔</a>에서 <b>새 프로젝트</b> 만들기 (예: schedule-hub). 결제 등록은 필요 없습니다.</li>
          <li><b>API 및 서비스 → 라이브러리</b>에서 <a href="https://console.cloud.google.com/apis/library/calendar-json.googleapis.com" target="_blank" rel="noopener">Google Calendar API</a>와 <a href="https://console.cloud.google.com/apis/library/tasks.googleapis.com" target="_blank" rel="noopener">Google Tasks API</a>를 각각 <b>사용</b>.</li>
          <li><b>Google 인증 플랫폼(OAuth 동의 화면) → 시작하기</b>: 앱 이름 "스케줄 허브", 지원 이메일 선택, 대상 <b>외부</b>, 연락처 이메일 입력 후 만들기.</li>
          <li><b>대상(Audience) → 테스트 사용자 → 사용자 추가</b>에 본인 Gmail 주소 추가.</li>
          <li><b>클라이언트 → 클라이언트 만들기</b>: 유형 <b>웹 애플리케이션</b>, 아래 두 값을 그대로 붙여넣기 후 만들기.</li>
          <li>표시된 <b>클라이언트 ID</b>를 위 입력란에 붙여넣고 [저장] → [Google 계정 연결].</li>
          <li>"Google에서 확인하지 않은 앱" 화면이 나오면 <b>고급 → 스케줄 허브(으)로 이동</b>을 누르고, 캘린더·할 일 권한을 <b>모두 체크</b>해 허용하세요(본인만 쓰는 앱이라 정상입니다).</li>
        </ol>
      </details>
      <div class="field" style="margin-top:12px"><span class="lbl">승인된 JavaScript 원본</span>
        <div class="row"><span class="code">${esc(location.origin)}</span><button class="btn sm" data-action="copy" data-text="${esc(location.origin)}">${icon('copy')}</button></div></div>
      <div class="field" style="margin-top:8px"><span class="lbl">승인된 리디렉션 URI</span>
        <div class="row"><span class="code">${esc(auth.redirectUri())}</span><button class="btn sm" data-action="copy" data-text="${esc(auth.redirectUri())}">${icon('copy')}</button></div></div>
    </div>
  </section>

  <section class="card">
    <header><h3>영역 (캘린더)</h3><span class="sub">${state.calendars.length}개</span>
      <button class="btn sm end" data-action="setup-areas" ${connected && !demo ? '' : demo ? '' : 'disabled'}>${icon('plus')}기본 영역 만들기</button></header>
    <div class="body">
      <p class="hint" style="margin:0 0 6px">영역마다 Google 캘린더(일정)와 같은 이름의 할 일 목록이 짝을 이룹니다. 갤럭시 삼성 캘린더에도 같은 색으로 표시됩니다. 스위치는 이 기기에서의 표시 여부입니다.</p>
      ${calRows || '<div class="empty">Google 연결 후 표시됩니다</div>'}
      <div class="field" style="margin-top:12px"><label>새 일정 기본 영역</label>
        <select class="inp" data-action-change="default-cal">${wcals.map((c) => `<option value="${esc(c.id)}" ${c.id === defCal ? 'selected' : ''}>${esc(calName(c))}</option>`).join('')}</select></div>
      <div class="field" style="margin-top:10px"><label>루틴 캘린더</label>
        <select class="inp" data-action-change="routine-cal">
          ${[...new Set([rn, ...wcals.filter((c) => !c.primary).map((c) => c.summary)])].map((n) => `<option ${n === rn ? 'selected' : ''}>${esc(n)}</option>`).join('')}
        </select></div>
    </div>
  </section>

  <section class="card">
    <header><h3>보기 · 알림</h3></header>
    <div class="body">
      <div class="kv"><span class="k">테마</span><div class="seg">${[['system', '시스템'], ['light', '라이트'], ['dark', '다크']]
        .map(([v, l]) => `<button data-action="set-theme" data-v="${v}" class="${prefs.theme === v ? 'on' : ''}">${l}</button>`)
        .join('')}</div></div>
      <div class="kv"><span class="k">주 시작 요일</span><div class="seg">${[[0, '일요일'], [1, '월요일']]
        .map(([v, l]) => `<button data-action="set-weekstart" data-v="${v}" class="${prefs.weekStart === v ? 'on' : ''}">${l}</button>`)
        .join('')}</div></div>
      <div class="kv"><span class="k">새 일정 기본 알림</span>
        <select class="inp" style="width:auto" data-action-change="def-rem">${[[-1, '없음'], [0, '정시'], [5, '5분 전'], [10, '10분 전'], [30, '30분 전'], [60, '1시간 전'], [1440, '1일 전']]
          .map(([v, l]) => `<option value="${v}" ${prefs.defReminder === v ? 'selected' : ''}>${l}</option>`)
          .join('')}</select></div>
      <div class="kv"><span class="k">월 보기에 루틴 표시</span>
        <label class="switch"><input type="checkbox" data-action-change="rt-month" ${prefs.routinesInMonth ? 'checked' : ''}><i></i></label></div>
      <p class="hint">알림은 Google 일정에 저장되므로 갤럭시 S25의 삼성 캘린더가 휴대폰 알림을 보내 줍니다.</p>
    </div>
  </section>

  <section class="card">
    <header><h3>앱 설치</h3>${installed ? '<span class="status-pill ok end">앱으로 실행 중</span>' : ''}</header>
    <div class="body">
      ${ctx.canInstall ? `<button class="btn primary" data-action="install">${icon('download')}이 기기에 앱 설치</button>` : ''}
      <ol class="steps">
        <li><b>Windows</b>: Edge 또는 Chrome 주소창 오른쪽 <b>앱 설치</b> 아이콘 → 설치. 시작 메뉴·작업 표시줄에 고정됩니다. (Edge: <code>edge://apps</code> 에서 "로그인 시 자동 시작" 설정 가능)</li>
        <li><b>갤럭시 S25</b>: Chrome으로 이 주소 열기 → 메뉴(⋮) → <b>앱 설치</b>(또는 홈 화면에 추가) → 앱스 화면에 아이콘이 생깁니다. 삼성 인터넷은 주소창의 설치 아이콘을 누르세요.</li>
        <li>설치 후에는 인터넷이 없어도 열리며, 변경 내용은 연결되면 자동으로 Google에 반영됩니다.</li>
      </ol>
    </div>
  </section>

  <section class="card">
    <header><h3>데이터 · 동기화</h3></header>
    <div class="body">
      <div class="kv"><span class="k">마지막 동기화</span><span>${ago(state.lastSync)}</span></div>
      <div class="kv"><span class="k">전송 대기 중인 변경</span><span>${state.outbox.length}건</span></div>
      <div class="kv"><span class="k">저장 위치</span><span class="muted" style="text-align:right">일정·루틴: Google 캘린더 / 할 일: Google Tasks<br>이 기기: 오프라인용 사본</span></div>
      <div class="row wrap" style="margin-top:12px">
        <button class="btn" data-action="sync-now" ${connected || demo ? '' : 'disabled'}>${icon('refresh')}지금 동기화</button>
        <button class="btn danger" data-action="reset-local">이 기기 사본 초기화</button>
        ${demo ? '' : `<button class="btn ghost" data-action="demo-on">데모 데이터로 둘러보기</button>`}
      </div>
    </div>
  </section>

  <section class="card">
    <header><h3>정보</h3></header>
    <div class="body">
      <div class="kv"><span class="k">버전</span><span>스케줄 허브 v${APP_VERSION}</span></div>
      <div class="kv"><span class="k">단축키 (PC)</span><span class="muted">N 새 일정 · T 할 일 · / 검색 · 1–5 화면 전환</span></div>
      <p class="hint">별도 서버 없이 브라우저에서 Google에 직접 연결합니다. 접근 토큰은 이 기기에만 저장되고 1시간마다 자동 갱신됩니다.</p>
    </div>
  </section>
  </div>`;
}
