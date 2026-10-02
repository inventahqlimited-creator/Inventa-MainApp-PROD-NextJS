// src/lib/xero/crypto.ts
// Xero tokens are stored encrypted (AES-256-GCM). The key lives only in the server environment (XERO_TOKEN_KEY).
import { createCipheriv, createDecipheriv, createHmac, randomBytes, timingSafeEqual } from 'crypto'

function key(): Buffer {
  const raw = process.env.XERO_TOKEN_KEY
  if (!raw) throw new Error('XERO_TOKEN_KEY is not set')
  const k = Buffer.from(raw, 'base64')
  if (k.length !== 32) throw new Error('XERO_TOKEN_KEY must be 32 bytes, base64 encoded')
  return k
}

export function encrypt(plain: string): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key(), iv)
  const body = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  return [iv, cipher.getAuthTag(), body].map(b => b.toString('base64')).join('.')
}

export function decrypt(packed: string): string {
  const [iv, tag, body] = packed.split('.').map(p => Buffer.from(p, 'base64'))
  const decipher = createDecipheriv('aes-256-gcm', key(), iv)
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(body), decipher.final()]).toString('utf8')
}

/** Signs a value so a returned OAuth state can be proven to come from this server and this user. */
export function sign(value: string): string {
  return createHmac('sha256', key()).update(`xero-state:${value}`).digest('hex')
}

export function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a)
  const y = Buffer.from(b)
  return x.length === y.length && timingSafeEqual(x, y)
}

export const newState = () => randomBytes(16).toString('hex')
