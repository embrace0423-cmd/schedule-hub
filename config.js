// ─────────────────────────────────────────────────────────────
// 스케줄 허브 설정 파일
// CLIENT_ID 에 Google Cloud 에서 발급받은 "웹 애플리케이션" OAuth 클라이언트 ID를 넣으세요.
// (비워 두면 앱의 [설정 → Google 연결] 화면에서 직접 입력할 수 있습니다.)
// ─────────────────────────────────────────────────────────────
export const CONFIG = {
  CLIENT_ID: '', // 예: '1234567890-abcdefg.apps.googleusercontent.com'
  LOGIN_HINT: '', // 선택: 로그인할 Google 계정 이메일 (예: 'you@gmail.com')
  ROUTINE_CALENDAR_NAME: '루틴', // 루틴(습관)을 저장할 캘린더 이름
  DEFAULT_REMINDER_MIN: 10, // 새 일정의 기본 알림 (분 전). 삼성 캘린더 알림으로 울립니다.
};
