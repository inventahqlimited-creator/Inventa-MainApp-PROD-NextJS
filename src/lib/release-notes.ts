// src/lib/release-notes.ts
// Customer-friendly "What's new" notes. Each release shows up in everyone's notification bell; clicking it opens the notes in a popup.
// To announce a release: add one entry at the TOP of RELEASES (newest first). Keep the wording plain and about what the customer can now do.
export type ReleaseSection = { heading: string; items: string[] }
export type ReleaseNote = { id: string; date: string; title: string; summary: string; sections: ReleaseSection[] }

export const RELEASES: ReleaseNote[] = [
  {
    id: '2026-10-13',
    date: '2026-10-13',
    title: 'Attachments, serial numbers, payment terms and more',
    summary: 'Attach files to your orders, receive serial-tracked stock more easily, and see exactly which batches, serials and bins you hold.',
    sections: [
      {
        heading: 'New',
        items: [
          'Attachments: open any sales order, purchase order or transfer, choose Actions → Attachments, and upload files (PDF, pictures, Word, Excel, CSV and more, up to 2 MB each). A paperclip with a number appears at the top of the order once it has files. Click a file to open it in a new tab.',
          'Payment terms: set up your own payment terms in Settings and use them on customers and suppliers. Due dates are worked out for you, and terms can be imported from Xero.',
          'Invoices and packing lists can now show tracking number, shipping method, service, and serial / batch / expiry columns. They’re off by default — switch them on in Settings → Sales.',
          'Decimal quantities: choose how many decimal places your quantities show, and it’s applied everywhere, including printed documents and reports.',
        ],
      },
      {
        heading: 'Easier receiving and picking',
        items: [
          'Receiving a serial-tracked product: type or paste serial numbers into one box, one per line. The box grows as you add more, and the quantity follows automatically.',
          'The receive screen now follows each product’s tracking settings (serial, batch, expiry).',
          'Stock you receive now appears by serial, batch, expiry and bin when you pick an order and on the product’s Stock tab.',
          'On the pick screen, choose the stock from the panel on the right — picked quantities can no longer be typed in by mistake.',
          'A Packed order must be unpacked before it can be unpicked, so nothing gets out of step.',
          'The pick list can be printed at any stage once an order exists.',
        ],
      },
      {
        heading: 'Smaller improvements',
        items: [
          '“Close Order” is now “Ship Order”.',
          'Overdue transfer alerts, plus a default BCC address for emails and images in email signatures and templates.',
          'When something can’t be saved — like a product with a SKU that already exists — we now tell you why.',
          'You can choose the stock type when creating a new product.',
        ],
      },
    ],
  },
]

/** Releases still worth announcing: the newest few, from the last 45 days (so a brand-new user isn't shown a long history). */
export function recentReleases(now: Date = new Date(), max = 3): ReleaseNote[] {
  const cutoff = now.getTime() - 45 * 86_400_000
  return RELEASES.filter(r => Date.parse(r.date) >= cutoff).slice(0, max)
}
