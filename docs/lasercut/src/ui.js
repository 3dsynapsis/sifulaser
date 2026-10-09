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

import { quote, materialById, groupById, DEFAULT_MATERIAL, MATERIALS, GROUPS } from './pricing.js';
import { errorText, warningText, WHATSAPP_ON_ERROR, MIN_NOTE, DISCLAIMER, ATTACH_NOTE, OVERSIZE, ERRORS } from './messages.js';
import { ROLES, ROLE_LABEL } from './layers.js';
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

/** "85 mm", "1.25 m". */
export const fmtLen = (mm) => (mm >= 1000 ? `${(mm / 1000).toFixed(2)} m` : `${Math.round(mm)} mm`);

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
  const layers = a?.layers || [];
  const pieces = a?.pieces || [];
  const q = pieces.length ? quote(pieces, a?.laser, materialId, s.params.qtyText) : null;

  const out = {
    mode: 'result',
    materialId,
    fileName: s.file.name,
    fileSize: s.file.size,
    source: a?.source || null,
    layers,
    defaults: a?.defaults || null,
    sizeMm: a?.sizeMm || null,
    scale: s.job?.scale || 1,
    working: !!s.working,
    warnings: (a?.warnings || []).map(warningText).filter(Boolean),
    preview: a?.preview || null,
    laser: a?.laser || null,
    quote: q,
    errorCode: null,
    errorText: '',
    priced: false,
    whatsapp: null,
  };

  if (code) {
    out.errorCode = code;
    out.errorText = errorText(code);
    out.quote = null;
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
      sizeMm: chosen ? out.sizeMm : null,
      scale: out.scale,
      layers: chosen ? layers : [],
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
  const SOURCE = { pdf: 'PDF / AI', dxf: 'DXF', image: 'Gambar, dijejak jadi vektor' };
  if (v.source) kids.push(h('p', { class: 'rule-line' }, `Jenis fail: ${SOURCE[v.source] || v.source}`));
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
    const L = v.laser;
    const work = [];
    if (L.cutMm > 0) work.push(`potong ${fmtLen(L.cutMm)}`);
    if (L.scoreMm > 0) work.push(`garisan halus ${fmtLen(L.scoreMm)}`);
    if (L.engraveLines > 0) work.push('ukiran');
    const rows = [
      ['Bahan', `${q.material.label}, ${q.setSqftText} kaki persegi setiap set`],
      ['Kerja setiap set', work.join(', ') || '-'],
      ['Masa laser', `${q.timeText} untuk ${q.qty} set`],
      ['Kos bahan', q.materialText],
      ['Kos masa laser', q.timeCostText],
    ];
    kids.push(h('div', { class: 'total-card' },
      h('div', { class: 'total-row' },
        h('span', { class: 'total-label' }, 'Anggaran harga'),
        h('span', { class: 'total', id: 'totalText' }, q.rangeText)),
      q.minApplied ? h('p', { class: 'min-note' }, MIN_NOTE) : null,
      h('p', { class: 'disclaimer' }, DISCLAIMER),
      ...waButton(v.whatsapp),
      h('details', { class: 'breakdown' },
        h('summary', {}, 'Bagaimana harga dikira'),
        h('dl', { class: 'sum' }, rows.flatMap(([k, val]) => [h('dt', {}, k), h('dd', {}, val)])),
        h('p', { class: 'fineprint' }, `Harga = bahan + masa laser (RM3 seminit), darab ${q.qty} set. Julat ditunjuk kerana masa mesin sebenar boleh berbeza.`))));
  } else if (v.whatsapp) {
    kids.push(h('div', { class: 'total-card' }, ...waButton(v.whatsapp)));
  } else if (v.qtyError) {
    kids.push(h('p', { class: 'banner-inline', role: 'alert' }, v.qtyError));
  }

  // No per-piece table (Boss, 9 Okt 2026): the sizes are on the preview, and an
  // oversize piece is outlined there and named in the banner.
  root.replaceChildren(...kids);
}

// ---------------------------------------------------------------------------
// Material picker: a swatch per material, then its thicknesses. Built once and
// updated in place, so a tap does not rebuild what the finger is on.

export function renderMaterials(root, v, ctx) {
  const current = materialById(v.materialId);
  if (!root.dataset.built) {
    root.dataset.built = '1';
    const cards = h('div', { class: 'mat-grid', role: 'radiogroup', 'aria-label': 'Jenis bahan' },
      GROUPS.map((g) => {
        const first = MATERIALS.find((m) => m.group === g.id);
        const thick = MATERIALS.filter((m) => m.group === g.id).map((m) => m.thick).join(' / ');
        return h('button', {
          type: 'button', class: `mat-card mat-${g.id}`, role: 'radio', 'data-group': g.id,
          onClick: () => {
            // Keep the thickness when the new material comes in it.
            const cur = materialById(root.dataset.current);
            const same = MATERIALS.find((m) => m.group === g.id && cur && m.thick === cur.thick);
            ctx.setMaterial((same || first).id);
          },
        },
        h('span', { class: 'mat-swatch', 'aria-hidden': 'true' }, h('span', { class: 'mat-shine' })),
        h('span', { class: 'mat-text' },
          h('span', { class: 'mat-name' }, g.name),
          h('span', { class: 'mat-sub' }, thick)),
        h('span', { class: 'mat-check', 'aria-hidden': 'true' }, String.fromCharCode(0x2713)));
      }));
    const thick = h('div', { class: 'thick-row', role: 'radiogroup', 'aria-label': 'Ketebalan' });
    root.replaceChildren(cards, thick);
  }
  root.dataset.current = current.id;
  const [cards, thick] = root.children;
  for (const b of cards.children) {
    const on = b.dataset.group === current.group;
    b.classList.toggle('is-on', on);
    b.setAttribute('aria-checked', on ? 'true' : 'false');
  }
  const options = MATERIALS.filter((m) => m.group === current.group);
  const sig = options.map((m) => m.id).join(',');
  if (thick.dataset.sig !== sig) {
    thick.dataset.sig = sig;
    thick.replaceChildren(
      h('span', { class: 'thick-label' }, 'Ketebalan'),
      ...options.map((m) => h('button', {
        type: 'button', class: 'thick-chip', role: 'radio', 'data-id': m.id, onClick: () => ctx.setMaterial(m.id),
      }, m.thick)),
    );
  }
  for (const b of thick.querySelectorAll('.thick-chip')) {
    const on = b.dataset.id === current.id;
    b.classList.toggle('is-on', on);
    b.setAttribute('aria-checked', on ? 'true' : 'false');
  }
}

// ---------------------------------------------------------------------------
// Size: the whole drawing, aspect locked. Typing in one box scales both.

const cm1 = (mm) => (Math.round(mm) / 10).toFixed(1);

export function renderSize(root, v, ctx) {
  if (!root.dataset.built) {
    root.dataset.built = '1';
    const box = (axis, label) => {
      const input = h('input', {
        id: `size${axis}`, type: 'text', inputmode: 'decimal', autocomplete: 'off', enterkeyhint: 'done', 'aria-label': `${label} dalam cm`,
      });
      const commit = () => {
        const n = Number(String(input.value).replace(',', '.'));
        if (Number.isFinite(n) && n > 0 && n <= 1000) ctx.setSize(axis === 'W' ? 'w' : 'h', n);
        else input.value = input.dataset.shown || '';
      };
      input.addEventListener('change', commit);
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); input.blur(); } });
      return h('label', { class: 'size-field' }, h('span', { class: 'size-label' }, label), input, h('span', { class: 'size-unit' }, 'cm'));
    };
    root.replaceChildren(
      h('div', { class: 'size-row' },
        box('W', 'Lebar'),
        h('span', { class: 'size-lock', title: 'Nisbah dikunci', 'aria-hidden': 'true' }, String.fromCharCode(0x00d7)),
        box('H', 'Tinggi')),
      h('p', { class: 'fineprint size-note' },
        h('span', { class: 'size-note-text' }),
        h('button', { type: 'button', class: 'link-btn size-reset', onClick: ctx.resetSize }, 'Kembali ke saiz asal')),
    );
  }
  const w = root.querySelector('#sizeW'), hh = root.querySelector('#sizeH');
  const show = (input, mm) => {
    const t = mm ? cm1(mm) : '';
    input.dataset.shown = t;
    if (document.activeElement !== input) input.value = t;
  };
  show(w, v.sizeMm?.w);
  show(hh, v.sizeMm?.h);
  const scaled = Math.abs(v.scale - 1) > 1e-6;
  root.querySelector('.size-reset').hidden = !scaled;
  root.querySelector('.size-note-text').textContent = scaled
    ? `Design diubah ke ${Math.round(v.scale * 100)}% daripada saiz dalam fail. `
    : 'Saiz keseluruhan design. Taip lebar atau tinggi baharu - nisbah dikunci.';
}

// ---------------------------------------------------------------------------
// Layers: one row per colour, each with its job.

const KIND_TEXT = {
  line: 'garisan', thick: 'garisan tebal', fill: 'isi warna', image: 'gambar', frame: 'bingkai segi empat', spot: 'warna potong', named: 'lapisan fail',
};

export function renderLayers(root, v, ctx) {
  const sig = v.layers.map((L) => `${L.key}=${L.role}`).join('|');
  if (root.dataset.sig === sig) return;
  root.dataset.sig = sig;
  const changed = v.layers.some((L) => v.defaults && v.defaults[L.key] && v.defaults[L.key] !== L.role);
  const rows = v.layers.map((L) => {
    const sel = h('select', { class: 'role-select', 'data-role': L.role, 'aria-label': `Fungsi layer ${L.name} ${KIND_TEXT[L.kind] || ''}` },
      ROLES.map((r) => {
        const o = h('option', { value: r }, ROLE_LABEL[r]);
        if (r === L.role) o.selected = true;
        return o;
      }));
    // 'input' as well as 'change': some mobile pickers and autofill tools only
    // fire one of them. The guard keeps it to one re-price per real change.
    let last = L.role;
    const pick = () => { if (sel.value === last) return; last = sel.value; ctx.setRole(L.key, sel.value); };
    sel.addEventListener('change', pick);
    sel.addEventListener('input', pick);
    const sw = h('span', { class: `layer-swatch sw-${L.kind}`, 'aria-hidden': 'true' });
    if (L.colour) sw.style.setProperty('--sw', L.colour);
    return h('li', { class: `layer-row role-${L.role}` },
      sw,
      h('span', { class: 'layer-text' },
        // A CAD layer is known by its own name; its colour goes underneath.
        h('span', { class: 'layer-name', title: L.file || L.name }, L.file || L.name),
        h('span', { class: 'layer-kind' }, `${L.file ? `${L.name} - ` : ''}${KIND_TEXT[L.kind] || L.kind} - ${L.n} objek`)),
      sel);
  });
  root.replaceChildren(
    h('ul', { class: 'layer-list' }, rows),
    h('p', { class: 'fineprint' }, 'Kami teka fungsi setiap warna. Tukar jika salah - contohnya jika anda guna biru untuk potong. ',
      changed ? h('button', { type: 'button', class: 'link-btn', onClick: ctx.resetLayers }, 'Pulihkan tekaan asal') : null),
  );
}
