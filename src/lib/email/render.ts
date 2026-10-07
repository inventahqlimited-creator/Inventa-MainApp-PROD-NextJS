// Placeholders ({{customer_name}} …) and HTML safety for email bodies.
import sanitizeHtml from 'sanitize-html'

export const PLACEHOLDERS = [
  { key: 'customer_name', label: 'Contact name' },
  { key: 'company_name', label: 'Your company' },
  { key: 'doc_number', label: 'Document number' },
  { key: 'doc_type', label: 'Document type' },
  { key: 'total', label: 'Total' },
  { key: 'due_date', label: 'Due date' },
  { key: 'sender_name', label: 'Your name' },
] as const

export function fillPlaceholders(text: string, vars: Record<string, string>, escape = false): string {
  return text.replace(/\{\{\s*([a-z_]+)\s*\}\}/gi, (_m, k: string) => {
    const v = vars[k.toLowerCase()] ?? ''
    return escape ? v.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string)) : v
  })
}

const ALLOWED = {
  allowedTags: ['p', 'br', 'strong', 'b', 'em', 'i', 'u', 'a', 'ul', 'ol', 'li', 'div', 'span', 'h1', 'h2', 'h3', 'blockquote', 'hr', 'img', 'table', 'tbody', 'thead', 'tr', 'td', 'th'],
  allowedAttributes: { a: ['href', 'target', 'rel'], img: ['src', 'alt', 'width', 'height'], '*': ['style'], td: ['colspan', 'rowspan'], th: ['colspan', 'rowspan'] },
  allowedSchemes: ['http', 'https', 'mailto', 'tel'],
  allowedSchemesByTag: { img: ['https', 'data'] },
  allowedStyles: { '*': { color: [/^[#a-z0-9(),.\s%-]+$/i], 'font-size': [/^\d+(\.\d+)?(px|pt|em|rem|%)$/], 'font-weight': [/^(bold|normal|\d{3})$/], 'text-align': [/^(left|right|center)$/], 'font-style': [/^(italic|normal)$/], 'text-decoration': [/^[a-z\s-]+$/], 'font-family': [/^[a-z0-9\s,'"-]+$/i], 'background-color': [/^[#a-z0-9(),.\s%-]+$/i] } },
  transformTags: { a: sanitizeHtml.simpleTransform('a', { rel: 'noopener noreferrer', target: '_blank' }) },
}
export const cleanHtml = (html: string) => sanitizeHtml(html ?? '', ALLOWED)

export const htmlToText = (html: string) => sanitizeHtml(html ?? '', { allowedTags: [], allowedAttributes: {} }).replace(/\s+/g, ' ').trim()

/** Full email document around the body, with the signature below it. */
export function wrapEmail(bodyHtml: string, signatureHtml: string): string {
  const sig = signatureHtml ? `<div style="margin-top:20px">${cleanHtml(signatureHtml)}</div>` : ''
  return `<!doctype html><html><body style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5;color:#222">${cleanHtml(bodyHtml)}${sig}</body></html>`
}
