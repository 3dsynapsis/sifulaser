// The WhatsApp quote message and its wa.me link.
//
// Every value in the message is taken from the same quote object the screen
// renders, so the message cannot say RM25.70 while the screen says RM25.60.
// The file is never attached for the customer - they attach it themselves.
//
// Encoding traps this handles (QA plan section 5):
//   * encodeURIComponent on the whole text, once. "&" would cut the message at
//     the file name, "#" would turn the rest into a fragment, "+" would become a
//     space. No URLSearchParams (it writes spaces as "+").
//   * file names are cut by code point, not UTF-16 unit, so an emoji is never
//     split into a lone surrogate (encodeURIComponent throws URIError on those).
//   * control characters and bidi overrides are removed from the file name.
//   * a long piece list is grouped by size and trimmed to keep the URL under
//     2000 characters, which every WhatsApp client opens.

import { parseQty } from './pricing.js';

export const WA_NUMBER = '60134354118';
export const MAX_URL = 2000;

// Control characters and bidi overrides, built from code points so the source
// file itself stays plain ASCII.
const STRIP = new RegExp('[' + [[0, 0x1f], [0x7f, 0x9f], [0x200e, 0x200f], [0x202a, 0x202e], [0x2066, 0x2069]]
  .map(([a, b]) => `${String.fromCharCode(a)}-${String.fromCharCode(b)}`).join('') + ']', 'g');

export function cleanFileName(name, max = 60) {
  const s = String(name ?? '')
    .replace(/\r\n?|\n/g, ' ')
    .replace(STRIP, '')
    .trim();
  const cps = Array.from(s);
  return cps.length > max ? `${cps.slice(0, max - 3).join('')}...` : s;
}

/** "10.0 x 10.0 cm; 6.0 x 4.0 cm (x5)" - identical sizes grouped, order kept. */
export function groupSizes(lines) {
  const groups = [];
  const at = new Map();
  for (const l of lines) {
    if (at.has(l.sizeText)) groups[at.get(l.sizeText)].n++;
    else { at.set(l.sizeText, groups.length); groups.push({ text: l.sizeText, n: 1 }); }
  }
  return groups.map((g) => (g.n > 1 ? `${g.text} (x${g.n})` : g.text));
}

export const waUrl = (text) => `https://wa.me/${WA_NUMBER}?text=${encodeURIComponent(text)}`;

/**
 * @param fileName  the name as picked
 * @param material  a MATERIALS entry
 * @param q         a quote() result, or null when there is no size to show
 * @param qtyText   the quantity box as typed
 * @param code      an error code when pricing stopped ('too-large', 'too-complex')
 */
export function buildMessage({ fileName, material, q, qtyText, code = null }, maxGroups = Infinity) {
  const lines = ['Salam, saya nak sebut harga UV print akrilik.'];
  lines.push(`Fail: ${cleanFileName(fileName)}`);
  if (material) lines.push(`Bahan: ${material.label}`);
  if (q && q.lines.length) {
    const groups = groupSizes(q.lines);
    const shown = groups.slice(0, maxGroups);
    const more = groups.length - shown.length;
    lines.push(`Kepingan: ${q.lines.length} (${shown.join('; ')}${more > 0 ? `; ... +${more} saiz lagi` : ''})`);
  }
  const qty = q?.state === 'priced' ? { ok: true, value: q.qty } : parseQty(qtyText);
  if (qty.ok) lines.push(`Kuantiti: ${qty.value} set`);
  if (q?.state === 'priced') {
    lines.push(`Jumlah anggaran: ${q.totalText}`);
    if (q.minApplied) lines.push('(Harga minimum RM20 dikenakan)');
  } else if (q?.state === 'oversize') {
    lines.push('Saiz melebihi 90 x 60 cm - mohon sebut harga');
  } else if (code === 'too-large') {
    lines.push('Fail terlalu besar untuk kalkulator - mohon sebut harga');
  } else if (code === 'too-complex') {
    lines.push('Fail terlalu kompleks untuk kalkulator - mohon sebut harga');
  }
  lines.push('Saya akan lampirkan fail di sini.');
  return lines.join('\n');
}

export function whatsappLink(args) {
  let url = waUrl(buildMessage(args));
  let groups = args.q ? groupSizes(args.q.lines).length : 0;
  while (url.length > MAX_URL && groups > 1) {
    groups = Math.max(1, Math.floor(groups / 2));
    url = waUrl(buildMessage(args, groups));
  }
  return url;
}
