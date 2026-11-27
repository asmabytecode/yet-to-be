export const AUDIT = {
  REGISTER: 'auth.register',
  LOGIN: 'auth.login',
  LOGIN_FAILED: 'auth.login_failed',
  LOCKED: 'auth.account_locked',
  REFRESH: 'auth.refresh',
  REFRESH_REUSE: 'auth.refresh_reuse_detected',
  LOGOUT: 'auth.logout',
  LOGOUT_ALL: 'auth.logout_all',
} as const;
