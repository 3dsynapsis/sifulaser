// The panels beside the preview. Pure DOM, rebuilt from the store.
//
// The decisions live in screenOf(), which is plain data and tested under node:
// when a price may be shown, when the WhatsApp button is offered, what the
// message says. The render functions only lay that out.
//
// Two rules the layout must not break:
//   * no RM figure on screen unless the order is priced - an error, an oversize
//     piece or a bad quantity shows no price at all;
//   * the WhatsApp link is a plain <a id="waBtn">, never inside #exportBtn and
//     never inside a dialog: the site's sign-in gate (shared/export-gate.js)
//     only intercepts #exportBtn, and a customer asking for a quote must never
//     be asked to sign in first.
//
// File names, spot names and layer names come from the customer's file, so they
// are only ever set as text. h() has no innerHTML option at all.
// No document at module scope: tools/test-ui.js imports this under node.

import { quote, materialById, DEFAULT_MATERIAL } from './pricing.js';
import { errorText, warningText, ruleText, WHATSAPP_ON_ERROR, MIN_NOTE, DISCLAIMER, ATTACH_NOTE, OVERSIZE, ERRORS } from './messages.js';
import { whatsappLink } from './whatsapp.js';

export const h = (tag, attrs = {}, ...kids) => {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') n.className = v;
    else if (k.startsWith('on')) n.addEventListener(k.slice(2).toLowerCase(), v);
    else n.setAttribute(k, v === true ? '' : String(v));
  }
  for (const kid of kids.flat()) {
    if (kid == null || kid === false) continue;
    n.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  }
  return n;
};

export function fmtBytes(n) {
  if (!Number.isFinite(n) || n <= 0) return '-';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

/** Everything the screen shows, decided in one place. */
export function screenOf(s) {
  const materialId = materialById(s.params.material) ? s.params.material : DEFAULT_MATERIAL;
  if (!s.file) return { mode: 'empty', materialId, priced: false };
  if (s.busy) return { mode: 'busy', materialId, busy: s.busy, priced: false };
  const a = s.analysis;
  const code = s.error?.code || (a && !a.ok ? a.code : null);
  const pieces = a?.pieces || [];
  const q = pieces.length ? quote(pieces, materialId, s.params.qtyText) : null;

  const out = {
    mode: 'result',
    materialId,
    fileName: s.file.name,
    fileSize: s.file.size,
    rule: a?.rule || null,
    ruleText: a?.rule ? ruleText(a.rule, a.names) : '',
    warnings: (a?.warnings || []).map(warningText).filter(Boolean),
    preview: a?.preview || null,
    quote: q,
    holes: a?.holes || 0,
    errorCode: null,
    errorText: '',
    priced: false,
    whatsapp: null,
  };

  if (code) {
    out.errorCode = code;
    out.errorText = errorText(code);
    out.quote = code === 'cut-overlap' ? q : null;
  } else if (q?.state === 'oversize') {
    out.errorCode = 'oversize';
    out.errorText = OVERSIZE;
  } else if (q?.state === 'bad-qty') {
    out.qtyError = ERRORS[q.qtyCode];
  } else if (q?.state === 'priced') {
    out.priced = true;
  }

  if (out.priced || WHATSAPP_ON_ERROR.has(out.errorCode)) {
    // Material and quantity are only in the message when the customer could
    // see and choose them: a priced or oversize order. A file too large or too
    // complex to read never shows those controls, so it sends neither.
    const chosen = out.priced || out.errorCode === 'oversize';
    out.whatsapp = whatsappLink({
      fileName: s.file.name,
      material: chosen ? materialById(materialId) : null,
      q: chosen ? q : null,
      qtyText: chosen ? s.params.qtyText : null,
      code: out.errorCode,
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// DOM

export function renderFileInfo(root, v, ctx) {
  const kids = [
    h('div', { class: 'file-row' },
      h('span', { class: 'file-name', title: v.fileName }, v.fileName),
      h('span', { class: 'chip' }, fmtBytes(v.fileSize)),
      h('button', { class: 'ghost small', type: 'button', onClick: ctx.pickFile }, 'Tukar Fail')),
  ];
  if (v.ruleText) kids.push(h('p', { class: 'rule-line' }, v.ruleText));
  if (v.warnings.length) {
    kids.push(h('div', { class: 'warn-box', role: 'status' },
      h('h4', {}, 'Sila semak'),
      h('ul', {}, v.warnings.map((t) => h('li', {}, t)))));
  }
  root.replaceChildren(...kids);
}

function waButton(href) {
  return [
    h('a', { id: 'waBtn', class: 'wa-btn', href, target: '_blank', rel: 'noopener' },
      h('span', { class: 'wa-icon', 'aria-hidden': 'true' }, String.fromCharCode(0x2709)),
      'Hantar ke WhatsApp'),
    h('p', { class: 'fineprint center' }, ATTACH_NOTE),
  ];
}

export function renderQuote(root, v) {
  const kids = [];
  const q = v.quote;

  if (v.errorCode) {
    kids.push(h('p', { class: 'banner-inline', role: 'alert' }, v.errorText));
  }

  if (v.priced) {
    const rows = [
      ['Luas satu set', `${q.setSqftText} kaki persegi`],
      ['Kadar', `${q.rateText}`],
      ['Kuantiti', `${q.qty} set`],
      ['Subjumlah', q.subtotalText],
    ];
    kids.push(h('div', { class: 'total-card' },
      h('dl', { class: 'sum' }, rows.flatMap(([k, val]) => [h('dt', {}, k), h('dd', {}, val)])),
      q.minApplied ? h('p', { class: 'min-note' }, MIN_NOTE) : null,
      h('div', { class: 'total-row' },
        h('span', { class: 'total-label' }, 'Jumlah'),
        h('span', { class: 'total', id: 'totalText' }, q.totalText)),
      h('p', { class: 'disclaimer' }, DISCLAIMER),
      ...waButton(v.whatsapp)));
  } else if (v.whatsapp) {
    kids.push(h('div', { class: 'total-card' }, ...waButton(v.whatsapp)));
  } else if (v.qtyError) {
    kids.push(h('p', { class: 'banner-inline', role: 'alert' }, v.qtyError));
  }

  if (q && q.lines.length) {
    const many = q.lines.length > 60;
    kids.push(h('h3', { class: 'block-title' }, `Kepingan (${q.lines.length})`));
    const body = q.lines.slice(0, many ? 60 : undefined).map((l) => h('tr', { class: l.fits ? '' : 'row-bad' },
      h('td', { class: 'num' }, String(l.index)),
      h('td', {}, l.sizeText, l.fits ? null : h('span', { class: 'chip chip-bad' }, 'Melebihi bed')),
      h('td', { class: 'num' }, l.sqftText)));
    kids.push(h('div', { class: 'table-wrap' },
      h('table', { class: 'pieces' },
        h('thead', {}, h('tr', {}, h('th', { class: 'num' }, '#'), h('th', {}, 'Saiz (L x T)'), h('th', { class: 'num' }, 'Luas (kaki persegi)'))),
        h('tbody', {}, body))));
    if (many) kids.push(h('p', { class: 'fineprint' }, `Senarai dipendekkan: ${q.lines.length - 60} kepingan lagi tidak ditunjukkan.`));
    const notes = [];
    if (v.holes) notes.push(`${v.holes} lubang di dalam kepingan tidak dikira sebagai kepingan baru.`);
    notes.push('Luas = lebar x tinggi kotak setiap kepingan. Harga dikira dari saiz sebenar, bukan nombor yang dibundarkan.');
    kids.push(h('p', { class: 'fineprint' }, notes.join(' ')));
  }
  root.replaceChildren(...kids);
}
