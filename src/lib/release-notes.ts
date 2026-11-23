// src/lib/release-notes.ts
// Customer-friendly "What's new" notes. Each release shows up in everyone's notification bell; clicking it opens the notes in a popup.
// To announce a release: add one entry at the TOP of RELEASES (newest first). Keep the wording plain and about what the customer can now do.
export type ReleaseSection = { heading: string; items: string[] }
export type ReleaseNote = { id: string; date: string; title: string; summary: string; sections: ReleaseSection[] }

export const RELEASES: ReleaseNote[] = [
  {
    id: '2026-11-24',
    date: '2026-11-24',
    title: 'Sales Returns & Credit Notes, serials on orders, email history and PDF downloads',
    summary: 'Take returns against your sales orders, see exactly which serials and batches went out, look back at the emails you’ve sent, and download documents as PDFs.',
    sections: [
      {
        heading: 'New: Sales Returns & Credit Notes',
        items: [
          'Open a closed sales order and choose Create Credit Note to return goods. You can only return what was sold on that order, and kits are returned one component at a time.',
          'Give the return a reason, choose the bin for each line, and pick which location the stock goes back into — it can be different from where it was sent from.',
          'Returns start as Open. Click Close (you’ll be asked to confirm) to bring the stock back in and send the credit note to Xero. If Xero can’t be reached, the return still closes and you can retry the Xero sync.',
          'See all your credit notes in the new Returns list on the Sales page, and print or download any of them.',
          'Settings → Sales → Credit Notes: switch credit notes on or off, choose your number format (starts with CN-), choose whether they arrive in Xero as drafts or approved, and edit the Credit Note template just like your sales order.',
          'Damaged goods aren’t handled on the return — adjust them out separately with a stock adjustment.',
        ],
      },
      {
        heading: 'Easier to see what was sent',
        items: [
          'Sales orders have a new Serial / Batch column showing which serial numbers and batches were picked, and which were shipped once the order is closed.',
        ],
      },
      {
        heading: 'Email history and printing',
        items: [
          'In an order’s Order History, hover over an email entry and click View to see exactly what was sent: To, CC, BCC, reply-to, subject, the message and any attachments. Emails sent from now on are saved in full.',
          'When you click Print on an invoice, credit note, purchase order, packing list or pick list, you now choose Download (a PDF file) or Print (your browser’s print window). Use the cross to cancel.',
        ],
      },
    ],
  },
  {
    id: '2026-10-29',
    date: '2026-10-29',
    title: 'Kits & Bundles, and smarter Xero stock adjustments',
    summary: 'Sell and buy bundles of products as one line, see how many you can make, and keep Xero’s stock in step when you adjust it.',
    sections: [
      {
        heading: 'New: Kits & Bundles (add-on)',
        items: [
          'Turn on Kits & Bundles from your Hub, then mark a Non Stock product as a kit and list its components (stock items, non-stock items and services) in the Bill of Materials tab. Give the kit its own selling price; its cost is worked out from the components.',
          'Add a kit to a sales order, purchase order or transfer and its components are added for you, scaled by the quantity. You can change component quantities on the order. Customers are charged the kit price only, and stock moves for the components.',
          'Settings → Kits & Bundles: choose whether components are shown on each order type, and what prints on invoices, pick lists, packing lists, purchase orders and transfers (kit only, kit and components, or components only).',
          'Switch on “Show virtual stock” to see how many kits you can make from the components you hold. It appears in the Products list and on a kit’s Stock Details tab, for the location you’re viewing.',
          'Import lots of kits at once from a CSV in Settings → Kits & Bundles. A template is there to download.',
          'On invoices and pick lists, components are shown in italics and indented so they’re easy to tell from the kit.',
          'Sales reports work out a kit’s cost from its components at the time of sale, so profit stays accurate.',
        ],
      },
      {
        heading: 'Xero',
        items: [
          'If Xero tracks your inventory, completed stock adjustments are now sent to Xero for you: stock added goes as a bill and stock removed as a supplier credit note, each totalling $0.00, so Xero updates its quantity and value automatically. Choose whether they arrive as drafts or approved in Settings → Xero.',
          'Kits on invoices sent to Xero keep the kit price, and their tracked components reduce Xero’s stock.',
          '“Sync everything” now sends contacts, products, stock adjustments, bills and then invoices when Xero tracks your inventory.',
        ],
      },
    ],
  },
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
/** `joined` (the day the person joined, YYYY-MM-DD or a timestamp) hides releases from before they joined. */
export function recentReleases(now: Date = new Date(), max = 3, joined?: string | null): ReleaseNote[] {
  const cutoff = now.getTime() - 45 * 86_400_000
  const since = joined && /^\d{4}-\d{2}-\d{2}/.test(joined) ? joined.slice(0, 10) : ''
  return RELEASES.filter(r => Date.parse(r.date) >= cutoff && (!since || r.date >= since)).slice(0, max)
}
