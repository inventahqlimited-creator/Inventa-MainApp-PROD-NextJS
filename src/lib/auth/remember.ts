// Client-side helpers for the login page's "Remember me" tickbox.
//
// "Remember me" only remembers the email address and fills it in next time. Saving the password is left to the
// browser's own password manager (the form uses autocomplete="username" / "current-password"); we never store it.
//
// It does NOT keep anyone signed in: sign-in cookies end when the browser closes (src/lib/auth/session-cookies.ts),
// and the organisation's session timeout signs people out after the set time away.
const EMAIL_KEY = 'inventa_remember_email'
// Left over from the old "session only" mode; removed when someone next signs in.
const OLD_KEYS = { local: 'inventa_no_remember', session: 'inventa_active_session' }

function safe<T>(fn: () => T, fallback: T): T {
  try { return fn() } catch { return fallback }
}

export function getRememberedEmail(): string {
  return safe(() => window.localStorage.getItem(EMAIL_KEY) ?? '', '')
}

export function applyRememberChoice(remember: boolean, email: string) {
  safe(() => {
    if (remember) window.localStorage.setItem(EMAIL_KEY, email)
    else window.localStorage.removeItem(EMAIL_KEY)
    window.localStorage.removeItem(OLD_KEYS.local)
    window.sessionStorage.removeItem(OLD_KEYS.session)
  }, undefined)
}

