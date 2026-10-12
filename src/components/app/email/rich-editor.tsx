'use client'
import { useEffect, useRef, useState } from 'react'

const btn: React.CSSProperties = { height: 26, minWidth: 26, padding: '0 7px', border: '1px solid var(--gray-200)', background: 'var(--white)', borderRadius: 6, fontSize: 12.5, cursor: 'pointer', color: 'var(--gray-700)' }

/** Small rich-text box (bold, italic, underline, lists, link) that reports HTML. `reset` changes when the content should be replaced from outside. */
export default function RichEditor({ html, onChange, reset, minHeight = 140, placeholders }: {
  html: string; onChange: (html: string) => void; reset?: string | number; minHeight?: number
  placeholders?: { key: string; label: string }[]
}) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => { if (ref.current) ref.current.innerHTML = html }, [reset]) // eslint-disable-line react-hooks/exhaustive-deps
  const cmd = (c: string, v?: string) => { ref.current?.focus(); document.execCommand(c, false, v); onChange(ref.current?.innerHTML ?? '') }
  const link = () => {
    const url = window.prompt('Link address (https://…)')
    if (url && /^(https?:\/\/|mailto:)/i.test(url)) cmd('createLink', url)
  }
  const fileRef = useRef<HTMLInputElement>(null)
  const [imgBusy, setImgBusy] = useState(false)
  const [imgErr, setImgErr] = useState('')
  async function uploadImage(f: File) {
    setImgErr('')
    if (!['image/png', 'image/jpeg', 'image/gif'].includes(f.type)) { setImgErr('Use a PNG, JPG or GIF picture.'); return }
    if (f.size > 1024 * 1024) { setImgErr('The picture must be under 1 MB.'); return }
    setImgBusy(true)
    try {
      const fd = new FormData(); fd.set('file', f)
      const res = await fetch('/api/org/email/image', { method: 'POST', body: fd })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) { setImgErr(d.error ?? 'Could not upload the picture.'); return }
      const w = await new Promise<number>(resolve => { const im = new Image(); im.onload = () => resolve(im.naturalWidth); im.onerror = () => resolve(200); im.src = d.url })
      ref.current?.focus()
      document.execCommand('insertHTML', false, `<img src="${d.url}" alt="" width="${Math.min(w || 200, 300)}" />`)
      onChange(ref.current?.innerHTML ?? '')
    } catch { setImgErr('Network error — please try again.') } finally { setImgBusy(false); if (fileRef.current) fileRef.current.value = '' }
  }
  const insert = (k: string) => { ref.current?.focus(); document.execCommand('insertText', false, `{{${k}}}`); onChange(ref.current?.innerHTML ?? '') }
  return (
    <div style={{ border: '1.5px solid var(--gray-200)', borderRadius: 9, background: 'var(--white)', overflow: 'hidden' }}>
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', padding: 6, borderBottom: '1px solid var(--gray-100)', background: 'var(--gray-50)' }}>
        <button type="button" style={{ ...btn, fontWeight: 700 }} onMouseDown={e => e.preventDefault()} onClick={() => cmd('bold')}>B</button>
        <button type="button" style={{ ...btn, fontStyle: 'italic' }} onMouseDown={e => e.preventDefault()} onClick={() => cmd('italic')}>I</button>
        <button type="button" style={{ ...btn, textDecoration: 'underline' }} onMouseDown={e => e.preventDefault()} onClick={() => cmd('underline')}>U</button>
        <button type="button" style={btn} onMouseDown={e => e.preventDefault()} onClick={() => cmd('insertUnorderedList')}>• List</button>
        <button type="button" style={btn} onMouseDown={e => e.preventDefault()} onClick={link}>Link</button>
        <button type="button" style={btn} disabled={imgBusy} onMouseDown={e => e.preventDefault()} onClick={() => fileRef.current?.click()}>{imgBusy ? 'Uploading…' : 'Image'}</button>
        <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/gif" hidden onChange={e => { const f = e.target.files?.[0]; if (f) void uploadImage(f) }} />
        {placeholders && (
          <select style={{ ...btn, marginLeft: 'auto' }} value="" onChange={e => { if (e.target.value) insert(e.target.value) }}>
            <option value="">Insert field…</option>
            {placeholders.map(p => <option key={p.key} value={p.key}>{p.label}</option>)}
          </select>
        )}
      </div>
      {imgErr && <div style={{ padding: '6px 12px', fontSize: 12, color: '#B91C1C', background: '#FEF2F2' }}>{imgErr}</div>}
      <div ref={ref} contentEditable suppressContentEditableWarning onInput={() => onChange(ref.current?.innerHTML ?? '')}
        style={{ minHeight, padding: '10px 12px', fontSize: 13.5, lineHeight: 1.5, outline: 'none' }} />
    </div>
  )
}
