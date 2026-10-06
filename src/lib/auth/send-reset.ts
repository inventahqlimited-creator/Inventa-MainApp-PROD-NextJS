// Sends a password-reset email whose link works on ANY device or browser.
//
// The normal browser/SSR Supabase client uses the PKCE flow, which only works if the link is opened in the
// same browser that asked for it (the "code verifier" lives in that browser's cookies). An admin sending a
// reset to someone else, or a user opening the email on their phone, would therefore land on a failed
// exchange. The implicit flow puts the tokens in the link itself, so it always works.
import { createClient } from '@supabase/supabase-js'

/** The site address reset links point at. Never taken from request headers, which an attacker controls. */
export function trustedOrigin(fallback: string): string {
  const configured = (process.env.NEXT_PUBLIC_APP_URL || '').trim().replace(/\/+$/, '')
  return configured || fallback
}

export async function sendResetEmail(email: string, requestOrigin: string) {
  const origin = trustedOrigin(requestOrigin)
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { flowType: 'implicit', persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } }
  )
  return supabase.auth.resetPasswordForEmail(email, { redirectTo: `${origin}/auth/confirm` })
}
