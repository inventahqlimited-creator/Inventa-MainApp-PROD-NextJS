import { describe, it, expect } from 'vitest'
import { checkReceiveTracking, type Tracking } from '@/lib/purchases/tracking'

const T = (o: Partial<Tracking>): Tracking => ({ name: 'Milk', batch: false, expiry: false, serial: false, ...o })
describe('receive tracking rules', () => {
  it('passes untracked lines and zero quantities', () => {
    expect(checkReceiveTracking([{ id: 'a', qty_to_receive: 5 }], new Map([['a', T({})]]))).toBeNull()
    expect(checkReceiveTracking([{ id: 'a', qty_to_receive: 0 }], new Map([['a', T({ batch: true })]]))).toBeNull()
  })
  it('needs batch and expiry when tracked', () => {
    const m = new Map([['a', T({ batch: true, expiry: true })]])
    expect(checkReceiveTracking([{ id: 'a', qty_to_receive: 2 }], m)).toMatch(/batch/)
    expect(checkReceiveTracking([{ id: 'a', qty_to_receive: 2, batch_num: 'B1' }], m)).toMatch(/expiry/)
    expect(checkReceiveTracking([{ id: 'a', qty_to_receive: 2, batch_num: 'B1', expiry_date: '2027-01-31' }], m)).toBeNull()
  })
  it('needs one unique serial per unit', () => {
    const m = new Map([['a', T({ serial: true })]])
    expect(checkReceiveTracking([{ id: 'a', qty_to_receive: 2 }], m)).toMatch(/serial/i)
    expect(checkReceiveTracking([{ id: 'a', qty_to_receive: 2, serial_numbers: ['S1'] }], m)).toMatch(/exactly 2/)
    expect(checkReceiveTracking([{ id: 'a', qty_to_receive: 2, serial_numbers: ['S1', 's1'] }], m)).toMatch(/twice/)
    expect(checkReceiveTracking([{ id: 'a', qty_to_receive: 1.5, serial_numbers: ['S1'] }], m)).toMatch(/exactly/)
    expect(checkReceiveTracking([{ id: 'a', qty_to_receive: 2, serial_numbers: ['S1', 'S2'] }], m)).toBeNull()
  })
})
