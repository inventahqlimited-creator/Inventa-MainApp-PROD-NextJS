// POST /auth/forgot  { email }  -> sends a password-reset email.
// Lives under /auth so it is reachable while signed out. Always answers "ok" so it can't be used to find out
// which email addresses have accounts.
import { NextResponse } from 'next/server'
import { sendResetEmail } from '@/lib/auth/send-reset'

export async function POST(request: Request) {
  let email = ''
  try {
    const body = await request.json()
    email = String(body?.email ?? '').trim()
  } catch { /* fall through */ }

  if (!email || email.length > 254 || !email.includes('@')) {
    return NextResponse.json({ error: 'Please enter a valid email address.' }, { status: 400 })
  }

  const origin = request.headers.get('origin') ?? new URL(request.url).origin
  const { error } = await sendResetEmail(email, origin)
  // Rate-limit errors are worth showing; anything else stays silent.
  if (error && /rate limit|too many/i.test(error.message)) {
    return NextResponse.json({ error: 'Too many requests. Please wait a few minutes and try again.' }, { status: 429 })
  }
  return NextResponse.json({ ok: true })
}
