// POST /auth/forgot  { email }  -> sends a password-reset email.
// Lives under /auth so it is reachable while signed out. Always answers "ok" so it can't be used to find out
// which email addresses have accounts.
import { NextResponse } from 'next/server'
import { sendResetEmail } from '@/lib/auth/send-reset'
import { rateLimit } from '@/lib/rate-limit'

export async function POST(request: Request) {
  let email = ''
  try {
    const body = await request.json()
    email = String(body?.email ?? '').trim()
  } catch { /* fall through */ }

  if (!email || email.length > 254 || !email.includes('@')) {
    return NextResponse.json({ error: 'Please enter a valid email address.' }, { status: 400 })
  }

  // At most 3 reset emails per address per hour, so nobody can flood someone's inbox.
  // Answer "ok" either way so this can't be used to probe which addresses exist.
  if (!rateLimit(`forgot-email:${email.toLowerCase()}`, 3, 60 * 60_000).ok) return NextResponse.json({ ok: true })

  const origin = new URL(request.url).origin
  const { error } = await sendResetEmail(email, origin)
  // Rate-limit errors are worth showing; anything else stays silent.
  if (error && /rate limit|too many/i.test(error.message)) {
    return NextResponse.json({ error: 'Too many requests. Please wait a few minutes and try again.' }, { status: 429 })
  }
  return NextResponse.json({ ok: true })
}
