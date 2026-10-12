// src/lib/attachments.ts
// Files attached to sales orders, purchase orders and transfers. Safe to import from client and server code.

export type AttachmentEntity = 'sales' | 'purchases' | 'transfers'
export const ATTACHMENT_ENTITIES: AttachmentEntity[] = ['sales', 'purchases', 'transfers']

export const MAX_ATTACHMENT_BYTES = 2 * 1024 * 1024 // 2 MB
export const MAX_ATTACHMENTS_PER_ORDER = 20

/** Allowed file types: extension → the type the file is served as. Anything that can run in a browser (html, svg, js) is left out on purpose. */
export const ATTACHMENT_TYPES: Record<string, string> = {
  pdf: 'application/pdf',
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp',
  doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt: 'application/vnd.ms-powerpoint', pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  csv: 'text/csv', txt: 'text/plain', rtf: 'application/rtf', zip: 'application/zip',
}
export const ATTACHMENT_ACCEPT = Object.keys(ATTACHMENT_TYPES).map(e => `.${e}`).join(',')

export const extOf = (name: string) => (name.split('.').pop() ?? '').toLowerCase()

/** Checks a file before it is uploaded. Returns a plain-language problem, or null when it is fine. */
export function attachmentProblem(file: { name: string; size: number }): string | null {
  if (!ATTACHMENT_TYPES[extOf(file.name)]) return `“${file.name}” isn’t a supported file type. You can attach PDF, pictures (JPG, PNG, GIF), Word, Excel, PowerPoint, CSV and text files.`
  if (file.size <= 0) return `“${file.name}” is empty.`
  if (file.size > MAX_ATTACHMENT_BYTES) return `“${file.name}” is ${(file.size / 1024 / 1024).toFixed(1)} MB. Files can be up to 2 MB.`
  return null
}

/** A file name that is safe to store and show: no folders, no odd characters, not too long */
export function cleanFileName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? 'file'
  const cleaned = base.replace(/[\u0000-\u001f<>:"|?*]/g, '').replace(/\s+/g, ' ').trim()
  return (cleaned || 'file').slice(-120)
}

export const fmtSize = (b: number) => (b < 1024 ? `${b} B` : b < 1024 * 1024 ? `${Math.round(b / 1024)} KB` : `${(b / 1024 / 1024).toFixed(1)} MB`)
