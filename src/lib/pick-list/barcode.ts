// src/lib/pick-list/barcode.ts
// A real Code 128 (subset B) barcode as inline SVG, so the printed pick list can be scanned.
// No dependencies. Each pattern is bar/space/bar/space/bar/space module widths (11 modules per symbol).

const PATTERNS = [
  '212222', '222122', '222221', '121223', '121322', '131222', '122213', '122312', '132212', '221213', '221312',
  '231212', '112232', '122132', '122231', '113222', '123122', '123221', '223211', '221132', '221231', '213212',
  '223112', '312131', '311222', '321122', '321221', '312212', '322112', '322211', '212123', '212321', '232121',
  '111323', '131123', '131321', '112313', '132113', '132311', '211313', '231113', '231311', '112133', '112331',
  '132131', '113123', '113321', '133121', '313121', '211331', '231131', '213113', '213311', '213131', '311123',
  '311321', '331121', '312113', '312311', '332111', '314111', '221411', '431111', '111224', '111422', '121124',
  '121421', '141122', '141221', '112214', '112412', '122114', '122411', '142112', '142211', '241211', '221114',
  '413111', '241112', '134111', '111242', '121142', '121241', '114212', '124112', '124211', '411212', '421112',
  '421211', '212141', '214121', '412121', '111143', '111341', '131141', '114113', '114311', '411113', '411311',
  '113141', '114131', '311141', '411131', '211412', '211214', '211232',
]
const STOP = '2331112'
const START_B = 104

/** The module widths (alternating bar, space, bar…) for a text, including start, checksum and stop. */
export function code128Widths(text: string): number[] {
  const values: number[] = []
  for (const ch of text) {
    const c = ch.charCodeAt(0)
    values.push(c >= 32 && c <= 126 ? c - 32 : '?'.charCodeAt(0) - 32)
  }
  let sum = START_B
  values.forEach((v, i) => { sum += v * (i + 1) })
  const symbols = [START_B, ...values, sum % 103]
  const out: number[] = []
  for (const s of symbols) for (const d of PATTERNS[s]) out.push(Number(d))
  for (const d of STOP) out.push(Number(d))
  return out
}

/** Inline SVG of the barcode, stretched to the given size (with a 10-module quiet zone either side). */
export function barcodeSvg(text: string, width: number, height: number): string {
  const w = code128Widths(text)
  const quiet = 10
  let x = quiet
  let bars = ''
  w.forEach((m, i) => {
    if (i % 2 === 0) bars += `<rect x="${x}" y="0" width="${m}" height="1"/>`
    x += m
  })
  const total = x + quiet
  return `<svg class="bc" xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${total} 1" preserveAspectRatio="none" shape-rendering="crispEdges" fill="#000" role="img" aria-label="Barcode ${text.replace(/[<>&"]/g, '')}">${bars}</svg>`
}
