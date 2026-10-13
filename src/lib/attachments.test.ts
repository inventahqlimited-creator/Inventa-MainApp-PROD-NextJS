import { describe, expect, it } from 'vitest'
import { attachmentProblem, cleanFileName, fmtSize, MAX_ATTACHMENT_BYTES } from './attachments'

describe('attachmentProblem', () => {
  it('accepts common documents up to 2 MB', () => {
    for (const n of ['a.pdf', 'b.JPG', 'c.docx', 'd.csv', 'e.xlsx']) expect(attachmentProblem({ name: n, size: 1000 })).toBeNull()
    expect(attachmentProblem({ name: 'x.pdf', size: MAX_ATTACHMENT_BYTES })).toBeNull()
  })
  it('rejects too big, empty and unsafe types', () => {
    expect(attachmentProblem({ name: 'x.pdf', size: MAX_ATTACHMENT_BYTES + 1 })).toMatch(/2 MB/)
    expect(attachmentProblem({ name: 'x.pdf', size: 0 })).toMatch(/empty/)
    expect(attachmentProblem({ name: 'x.html', size: 10 })).toMatch(/supported/)
    expect(attachmentProblem({ name: 'x.svg', size: 10 })).toMatch(/supported/)
    expect(attachmentProblem({ name: 'noext', size: 10 })).toMatch(/supported/)
  })
})
describe('cleanFileName / fmtSize', () => {
  it('strips folders and odd characters', () => {
    expect(cleanFileName('C:\\x\\y\\inv<1>.pdf')).toBe('inv1.pdf')
    expect(cleanFileName('')).toBe('file')
  })
  it('formats sizes', () => {
    expect(fmtSize(500)).toBe('500 B'); expect(fmtSize(2048)).toBe('2 KB'); expect(fmtSize(1572864)).toBe('1.5 MB')
  })
})
