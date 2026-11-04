// src/lib/auth/session-cookies.ts
// Sign-in cookies only last until the browser is closed.
//
// Supabase gives its auth cookies a 400-day lifetime, which keeps people signed in for good. Removing the
// lifetime (maxAge / expires) turns them into session cookies, so closing the browser signs the person out.
// Deletions (maxAge 0, or an expiry in the past) are passed through untouched so signing out still works.
// Safe to import from client and server code.

type CookieOpts = { maxAge?: number; expires?: Date }

export function sessionOnly<T extends CookieOpts>(options: T): T
export function sessionOnly<T extends CookieOpts>(options: T | undefined): T | undefined
export function sessionOnly<T extends CookieOpts>(options: T | undefined): T | undefined {
  if (!options) return options
  const { maxAge, expires } = options
  if (typeof maxAge === 'number' && maxAge <= 0) return options
  if (expires instanceof Date && expires.getTime() <= Date.now()) return options
  const rest = { ...options }
  delete rest.maxAge
  delete rest.expires
  return rest
}
