// Email sender settings (stored on organisations.email_settings) and the rules for who an email is sent "from".
export type DnsRecord = { record?: string; name: string; type: string; value: string; ttl?: string; priority?: number; status?: string }
export type EmailSettings = {
  from_name: string
  from_local: string          // the bit before @ on the customer's own domain, e.g. "accounts"
  reply_to: string
  default_cc: string[]
  default_recipient: 'billing' | 'shipping' | 'main'   // which contact email the To box starts with
  domain: string              // customer's sending domain, e.g. "acme.co.nz"
  domain_id: string           // Resend's id for that domain
  domain_status: 'none' | 'pending' | 'verified' | 'failed'
  domain_records: DnsRecord[]
}

export const EMPTY_SETTINGS: EmailSettings = { from_name: '', from_local: 'accounts', reply_to: '', default_cc: [], default_recipient: 'billing', domain: '', domain_id: '', domain_status: 'none', domain_records: [] }

const EMAIL_RE = /^[^\s@<>",;]+@[^\s@<>",;]+\.[^\s@<>",;]+$/
export const isEmail = (v: unknown): v is string => typeof v === 'string' && v.length <= 254 && EMAIL_RE.test(v.trim())
const DOMAIN_RE = /^(?=.{4,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/
export const isDomain = (v: unknown): v is string => typeof v === 'string' && DOMAIN_RE.test(v)
const LOCAL_RE = /^[a-z0-9][a-z0-9._+-]{0,63}$/i

/** Picks the contact email to start the To box with: the chosen kind first, then the others. */
export function pickRecipient(c: { email?: string | null; bill_email?: string | null; ship_email?: string | null } | null | undefined, pref: EmailSettings['default_recipient']): string {
  if (!c) return ''
  const order = pref === 'shipping' ? [c.ship_email, c.bill_email, c.email] : pref === 'main' ? [c.email, c.bill_email, c.ship_email] : [c.bill_email, c.email, c.ship_email]
  return order.map(v => (v ?? '').trim()).find(v => isEmail(v)) ?? ''
}

/** Splits "a@x.com, b@y.com; c@z.com" into clean unique addresses; returns the bad ones too. */
export function parseAddresses(input: unknown): { ok: string[]; bad: string[] } {
  const raw = Array.isArray(input) ? input.map(String) : String(input ?? '').split(/[,;\n]/)
  const ok: string[] = [], bad: string[] = []
  for (const r of raw.map(x => x.trim()).filter(Boolean)) {
    if (isEmail(r)) { if (!ok.some(o => o.toLowerCase() === r.toLowerCase())) ok.push(r) } else bad.push(r)
  }
  return { ok, bad }
}

export function readSettings(raw: unknown): EmailSettings {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Partial<EmailSettings>
  return {
    from_name: typeof r.from_name === 'string' ? r.from_name : '',
    from_local: typeof r.from_local === 'string' && r.from_local ? r.from_local : 'accounts',
    reply_to: typeof r.reply_to === 'string' ? r.reply_to : '',
    default_cc: Array.isArray(r.default_cc) ? r.default_cc.filter(isEmail) : [],
    default_recipient: r.default_recipient === 'shipping' || r.default_recipient === 'main' ? r.default_recipient : 'billing',
    domain: typeof r.domain === 'string' ? r.domain : '',
    domain_id: typeof r.domain_id === 'string' ? r.domain_id : '',
    domain_status: (['none', 'pending', 'verified', 'failed'] as const).includes(r.domain_status as never) ? (r.domain_status as EmailSettings['domain_status']) : 'none',
    domain_records: Array.isArray(r.domain_records) ? r.domain_records : [],
  }
}

/** Validates the editable part of the settings from a request body. */
export function validateSettingsInput(body: Record<string, unknown>): { value: Pick<EmailSettings, 'from_name' | 'from_local' | 'reply_to' | 'default_cc' | 'default_recipient'> } | { error: string } {
  const from_name = String(body.from_name ?? '').replace(/[\r\n"<>]/g, '').trim().slice(0, 80)
  const from_local = String(body.from_local ?? 'accounts').trim().toLowerCase()
  if (!LOCAL_RE.test(from_local)) return { error: 'The sending address can only use letters, numbers and . _ + -' }
  const reply_to = String(body.reply_to ?? '').trim()
  if (reply_to && !isEmail(reply_to)) return { error: 'Reply-to isn’t a valid email address.' }
  const cc = parseAddresses(body.default_cc)
  if (cc.bad.length) return { error: `Not a valid email address: ${cc.bad[0]}` }
  if (cc.ok.length > 5) return { error: 'Use five or fewer default CC addresses.' }
  const dr = body.default_recipient
  const default_recipient = dr === 'shipping' || dr === 'main' ? dr : 'billing'
  return { value: { from_name, from_local, reply_to, default_cc: cc.ok, default_recipient } }
}

/** The From header actually used. Own verified domain when there is one, otherwise the shared InventaHQ sender. */
export function effectiveFrom(s: EmailSettings, orgName: string, shared = process.env.EMAIL_SHARED_FROM || ''): { header: string; address: string; verified: boolean } | null {
  const name = (s.from_name || orgName || '').replace(/[\r\n"<>]/g, '').trim()
  if (s.domain_status === 'verified' && s.domain) {
    const address = `${s.from_local || 'accounts'}@${s.domain}`
    return { header: name ? `"${name}" <${address}>` : address, address, verified: true }
  }
  if (!isEmail(shared)) return null
  return { header: name ? `"${name}" <${shared}>` : shared, address: shared, verified: false }
}
