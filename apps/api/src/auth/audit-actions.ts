export const AUDIT = {
  REGISTER: 'auth.register',
  LOGIN: 'auth.login',
  LOGIN_FAILED: 'auth.login_failed',
  LOCKED: 'auth.account_locked',
  REFRESH: 'auth.refresh',
  REFRESH_REUSE: 'auth.refresh_reuse_detected',
  LOGOUT: 'auth.logout',
  LOGOUT_ALL: 'auth.logout_all',
  OAUTH_LINKED: 'auth.oauth_linked',
  OAUTH_REGISTER: 'auth.oauth_register',
} as const;
