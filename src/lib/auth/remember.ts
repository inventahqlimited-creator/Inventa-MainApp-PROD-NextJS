// Client-side helpers for the login page's "Remember me" tickbox.
//
// Ticked   -> stay signed in on this device (normal behaviour) and prefill the email next time.
// Unticked -> the session lasts until the browser is closed.
//
// Cookies set by Supabase outlive the browser session, so "session only" is enforced here:
// a flag in localStorage says "don't keep me", and a flag in sessionStorage says "this browser
// session is still the one that signed in". If the first is set but the second is missing,
// the browser was closed in between, so we sign out.
import type { SupabaseClient } from '@supabase/supabase-js'

const EMAIL_KEY = 'inventa_remember_email'
const NO_REMEMBER_KEY = 'inventa_no_remember'
const ACTIVE_KEY = 'inventa_active_session'

function safe<T>(fn: () => T, fallback: T): T {
  try { return fn() } catch { return fallback }
}

export function getRememberedEmail(): string {
  return safe(() => window.localStorage.getItem(EMAIL_KEY) ?? '', '')
}

export function applyRememberChoice(remember: boolean, email: string) {
  safe(() => {
    if (remember) {
      window.localStorage.setItem(EMAIL_KEY, email)
      window.localStorage.removeItem(NO_REMEMBER_KEY)
    } else {
      window.localStorage.removeItem(EMAIL_KEY)
      window.localStorage.setItem(NO_REMEMBER_KEY, '1')
    }
    window.sessionStorage.setItem(ACTIVE_KEY, '1')
  }, undefined)
}

/** Returns true if the user chose not to be remembered and the browser has since been closed. */
export function sessionHasExpired(): boolean {
  return safe(() => (
    window.localStorage.getItem(NO_REMEMBER_KEY) === '1' &&
    window.sessionStorage.getItem(ACTIVE_KEY) !== '1'
  ), false)
}

export async function signOutIfSessionExpired(supabase: SupabaseClient): Promise<boolean> {
  if (!sessionHasExpired()) return false
  await supabase.auth.signOut()
  window.location.replace('/login')
  return true
}
