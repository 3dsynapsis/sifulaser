// Page 1 of a PDF, interpreted just far enough to price it: every painted path
// in page space (CTM, Form /Matrix and UserUnit applied), the spot colour it was
// painted in, the optional-content layers it sits in, the clip it was painted
// under, plus live text runs and image counts.
//
// Deliberately NOT walked:
//   * soft masks (ExtGState /SMask). A mask is not ink. pdf.js and MuPDF both put
//     mask geometry in their path lists, and on a real Illustrator 28.1 file that
//     grew the art from 391 x 344 mm to 881 x 427 mm (research report, sec. 3).
//   * pattern cells, Type3 glyph procedures and annotation appearances - none
//     of them can be a cut line.
//
// Shadings (sh) and images are not paths, but when one is painted through a
// clipping path (W n), the clip IS the visible edge of that artwork: a gradient
// background, or a photo in a circle mask. That clip is recorded as a painted
// fill marked clipPainted, so rule (c) and the raster-only check see it. A clip
// nothing is painted through stays invisible, and an image lying wholly inside
// its clip is not shaped by it (its edge is the raster's own edge).
//
// A Form XObject is clipped to its /BBox (ISO 32000-1, 8.10.1).
//
// Units: points x UserUnit, i.e. true 1/72 inch. Money never uses a page box.

import { Lexer, Name, Ref, Kw, Str, Stream, EOF, WS, textOf } from './lexer.js';
import { PdfDoc, PdfError } from './objects.js';
import { mul, apply, cubicExtrema, bezierAt, bbIntersect, bbInside } from '../geom.js';

const CUT_NAMES = new Set(['cutcontour', 'cut', 'thrucut', 'cutline']);

/** Spec rule 2(a): case-insensitive, spaces/hyphens/underscores ignored. */
export const isCutName = (s) => CUT_NAMES.has(String(s ?? '').toLowerCase().replace(/[\s\-_]/g, ''));

/**
 * A colour counts as a cut colour only if EVERY colorant is a cut name.
 * DeviceN [/CutContour /Cyan] is a mixed ink, not a cut line (QA plan C4).
 */
export const isCutColour = (sep) => Array.isArray(sep) && sep.length > 0
  && sep.filter((n) => n !== 'None').length > 0 && sep.filter((n) => n !== 'None').every(isCutName);

const MAX_OPS = 5_000_000;
const MAX_POINTS = 4_000_000;

/**
 * A clip box narrowed by another box. Boxes that do not meet give an empty
 * (zero-size) clip, never "no clip": nothing painted under it is visible.
 */
function narrow(clip, bb) {
  if (!clip) return bb;
  const r = [Math.max(bb[0], clip[0]), Math.max(bb[1], clip[1]), Math.min(bb[2], clip[2]), Math.min(bb[3], clip[3])];
  if (r[2] < r[0]) r[2] = r[0];
  if (r[3] < r[1]) r[3] = r[1];
  return r;
}

export async function readPdf(bytes) {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const doc = new PdfDoc(u8);
  try {
    await doc.open();
    const out = await readPage1(doc);
    // A content stream, form or object stream that page 1 needed was cut short
    // or damaged. What survived would price a smaller piece, so no price.
    if (doc.incomplete) throw new PdfError('corrupt', 'damaged or truncated stream');
    return out;
  } catch (e) {
    return { ok: false, error: e.code || 'corrupt', detail: String(e.message || e) };
  }
}

async function readPage1(doc) {
  const root = await doc.get(doc.trailer.Root);
  const pagesRoot = await doc.get(root?.Pages);
  if (!pagesRoot) throw new PdfError('corrupt', 'no page tree');

  // Walk down to the first page, inheriting what pages inherit.
  let node = pagesRoot;
  const inherit = {};
  const seen = new Set();
  for (let depth = 0; node && depth < 64; depth++) {
    if (seen.has(node)) break;
    seen.add(node);
    for (const k of ['Resources', 'MediaBox', 'CropBox', 'Rotate']) if (node[k] !== undefined) inherit[k] = node[k];
    if (node.Type?.n === 'Page' || !node.Kids) break;
    const kids = await doc.get(node.Kids);
    if (!Array.isArray(kids) || !kids.length) { node = null; break; }
    node = await doc.get(kids[0]);
  }
  if (!node || node.Kids) throw new PdfError('corrupt', 'no page');

  let pageCount = await doc.get(pagesRoot.Count);
  pageCount = Number.isInteger(pageCount) && pageCount > 0 ? pageCount : 1;
  let userUnit = await doc.get(node.UserUnit);
  if (!(typeof userUnit === 'number' && userUnit > 0 && Number.isFinite(userUnit))) userUnit = 1;
  const resources = await doc.get(inherit.Resources);
  const box = async (v) => {
    const a = await doc.get(v);
    if (!Array.isArray(a) || a.length < 4) return null;
    const n = await Promise.all(a.map((x) => doc.get(x)));
    if (!n.every((x) => typeof x === 'number')) return null;
    return [Math.min(n[0], n[2]) * userUnit, Math.min(n[1], n[3]) * userUnit, Math.max(n[0], n[2]) * userUnit, Math.max(n[1], n[3]) * userUnit];
  };
  const mediaBox = (await box(inherit.MediaBox)) || [0, 0, 612 * userUnit, 792 * userUnit];
  let rotate = await doc.get(inherit.Rotate);
  rotate = Number.isInteger(rotate) ? (((rotate % 360) + 360) % 360) : 0;
  if (rotate % 90) rotate = 0;

  // Optional content groups: name, and whether the default view hides it.
  const ocInfo = new Map();
  const ocp = await doc.get(root.OCProperties);
  const off = new Set();
  const dcfg = await doc.get(ocp?.D);
  for (const r of (await doc.get(dcfg?.OFF)) || []) if (r instanceof Ref) off.add(r.num);
  for (const r of (await doc.get(ocp?.OCGs)) || []) {
    const g = await doc.get(r);
    if (r instanceof Ref && g) ocInfo.set(r.num, { name: textOf(await doc.get(g.Name)), off: off.has(r.num) });
  }

  // Annotations other than links, form widgets and popups (QA plan C34/W8).
  let annots = 0;
  for (const r of (await doc.get(node.Annots)) || []) {
    const a = await doc.get(r);
    const st = a?.Subtype?.n;
    if (st && !['Link', 'Widget', 'Popup'].includes(st)) annots++;
  }

  const out = {
    ok: true,
    pageCount,
    page: { mediaBox, userUnit, rotate, annots },
    paths: [],
    texts: [],
    textSample: '',
    images: 0,
    repaired: doc.repaired,
    encrypted: !!doc.crypt,
    illustrator: !!(await doc.get((await doc.get(node.PieceInfo))?.Illustrator)),
  };
  let ops = 0, points = 0;

  const csCache = new Map();
  async function colourSpace(res, operand) {
    if (!(operand instanceof Name)) return null;
    if (['DeviceGray', 'DeviceRGB', 'DeviceCMYK', 'G', 'RGB', 'CMYK', 'Pattern', 'I'].includes(operand.n)) return null;
    const csDict = await doc.get(res?.ColorSpace);
    const raw = csDict?.[operand.n];
    const key = raw instanceof Ref ? `r${raw.num}` : null;
    if (key && csCache.has(key)) return csCache.get(key);
    const cs = await doc.get(raw);
    let sep = null;
    if (Array.isArray(cs)) {
      const fam = (await doc.get(cs[0]))?.n;
      if (fam === 'Separation') sep = [(await doc.get(cs[1]))?.n];
      else if (fam === 'DeviceN') sep = ((await doc.get(cs[1])) || []).map((n) => n?.n);
      else if (fam === 'Indexed') {
        const base = await doc.get(cs[1]);
        if (Array.isArray(base) && (await doc.get(base[0]))?.n === 'Separation') sep = [(await doc.get(base[1]))?.n];
      }
    }
    if (key) csCache.set(key, sep);
    return sep;
  }

  async function ocFor(props) {
    const ref = props;
    props = await doc.get(props);
    if (ref instanceof Ref && ocInfo.has(ref.num)) return [ocInfo.get(ref.num)];
    if (!props) return [];
    if (props.Type?.n === 'OCMD') {
      let g = props.OCGs;
      if (!Array.isArray(g)) g = [g];
      const outList = [];
      for (const r of g) {
        if (r instanceof Ref && ocInfo.has(r.num)) outList.push(ocInfo.get(r.num));
        else { const d = await doc.get(r); if (d?.Name) outList.push({ name: textOf(await doc.get(d.Name)), off: false }); }
      }
      return outList;
    }
    if (props.Name !== undefined) return [{ name: textOf(await doc.get(props.Name)), off: false }];
    return [];
  }

  async function contentBytes(c) {
    c = await doc.get(c);
    if (c instanceof Stream) return (await doc.decode(c)) || new Uint8Array(0);
    if (Array.isArray(c)) {
      const parts = [];
      for (const r of c) {
        const s = await doc.get(r);
        if (s instanceof Stream) parts.push((await doc.decode(s)) || new Uint8Array(0), Uint8Array.of(10));
      }
      const n = parts.reduce((a, p) => a + p.length, 0);
      const o = new Uint8Array(n);
      let q = 0;
      for (const p of parts) { o.set(p, q); q += p.length; }
      return o;
    }
    return new Uint8Array(0);
  }

  async function run(bytesC, res, gs0, depth, formRefs, mcOuter) {
    const lx = new Lexer(bytesC);
    const operands = [];
    let gs = { ...gs0 };
    const gstack = [];
    const mc = [];
    let subpaths = [], cur = null, clipPending = false;

    const pt = (x, y) => apply(gs.ctm, x, y);
    const begin = (x, y) => {
      const p = pt(x, y);
      cur = { pts: [p[0], p[1]], closed: false, bb: [p[0], p[1], p[0], p[1]], start: [x, y], last: [x, y] };
      subpaths.push(cur);
    };
    const grow = (x, y) => {
      const b = cur.bb;
      if (x < b[0]) b[0] = x;
      if (y < b[1]) b[1] = y;
      if (x > b[2]) b[2] = x;
      if (y > b[3]) b[3] = y;
    };
    const lineTo = (x, y) => {
      if (!cur) begin(x, y);
      const p = pt(x, y);
      cur.pts.push(p[0], p[1]);
      grow(p[0], p[1]);
      cur.last = [x, y];
    };
    // The bounding box of a curve comes from where its derivative is zero, on
    // the TRANSFORMED control points - never from the control points themselves
    // (a control-point box of "0 0 m 0 100 100 100 100 0 c" is 100x100; the
    // curve is 100x75). The 8 samples are only for the inside/outside tests.
    const curveTo = (x1, y1, x2, y2, x3, y3) => {
      if (!cur) begin(x1, y1);
      const P0 = pt(cur.last[0], cur.last[1]), P1 = pt(x1, y1), P2 = pt(x2, y2), P3 = pt(x3, y3);
      for (const t of cubicExtrema(P0, P1, P2, P3)) { const q = bezierAt(P0, P1, P2, P3, t); grow(q[0], q[1]); }
      for (let i = 1; i <= 8; i++) { const q = bezierAt(P0, P1, P2, P3, i / 8); cur.pts.push(q[0], q[1]); }
      grow(P3[0], P3[1]);
      cur.last = [x3, y3];
    };
    const ocNow = () => [...mcOuter, ...mc.flat().filter(Boolean)];
    // An image or shading painted through the current clip: the clip's outline
    // is the edge of what gets printed. `extent` is the painted object's own
    // box (an image's unit square), or null for a shading, which fills the clip.
    const paintThroughClip = (extent) => {
      if (!gs.clip || !gs.clipSubs || !gs.clipSubs.length) return;
      if (extent && bbInside(extent, gs.clip, 0)) return; // the clip does not shape it
      const clip = extent ? (bbIntersect(gs.clip, extent) || [extent[0], extent[1], extent[0], extent[1]]) : gs.clip;
      for (const s of gs.clipSubs) points += s.pts.length / 2;
      out.paths.push({
        subs: gs.clipSubs, stroke: false, fill: true, strokeSep: null, fillSep: null,
        oc: ocNow(), clip, clipPainted: true,
      });
      if (points > MAX_POINTS) throw Object.assign(new Error('too many points'), { code: 'too-complex' });
    };
    const unitSquare = () => {
      const c = [apply(gs.ctm, 0, 0), apply(gs.ctm, 1, 0), apply(gs.ctm, 0, 1), apply(gs.ctm, 1, 1)];
      const xs = c.map((p) => p[0]), ys = c.map((p) => p[1]);
      return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
    };
    const endPath = (stroke, fill, close) => {
      if (close && cur) cur.closed = true;
      if (stroke || fill) {
        const subs = [];
        for (const s of subpaths) {
          let closed = s.closed;
          if (!closed) {
            const n = s.pts.length;
            // A fill closes its subpath implicitly; a stroke counts as closed
            // when it ends within 0.01 mm of where it started.
            if (fill || Math.hypot(s.pts[0] - s.pts[n - 2], s.pts[1] - s.pts[n - 1]) < 0.0283) closed = true;
          }
          points += s.pts.length / 2;
          subs.push({ pts: s.pts, bb: s.bb, closed });
        }
        if (subs.length) {
          out.paths.push({
            subs, stroke, fill,
            strokeSep: stroke ? gs.strokeSep : null,
            fillSep: fill ? gs.fillSep : null,
            oc: ocNow(),
            clip: gs.clip,
          });
        }
      }
      if (clipPending && subpaths.length) {
        // The new clip is the old clip narrowed by this path's box. The path
        // itself is kept too, in case an image or shading is painted through it.
        let bb = null;
        for (const s of subpaths) bb = bb ? [Math.min(bb[0], s.bb[0]), Math.min(bb[1], s.bb[1]), Math.max(bb[2], s.bb[2]), Math.max(bb[3], s.bb[3])] : [...s.bb];
        gs.clip = narrow(gs.clip, bb);
        gs.clipSubs = subpaths.map((s) => ({ pts: s.pts, bb: s.bb, closed: true }));
      }
      subpaths = []; cur = null; clipPending = false;
      if (points > MAX_POINTS) throw Object.assign(new Error('too many points'), { code: 'too-complex' });
    };

    for (;;) {
      const t = lx.next();
      if (t === EOF) break;
      if (!(t instanceof Kw)) { operands.push(t); continue; }
      if (t.k === '[' || t.k === '<<') { operands.push(lx.obj(false, t)); continue; }
      if (t.k === 'true' || t.k === 'false' || t.k === 'null') { operands.push(t.k === 'true'); continue; }
      if (++ops > MAX_OPS) throw Object.assign(new Error('too many operators'), { code: 'too-complex' });
      const a = operands;
      const num = (i) => (typeof a[i] === 'number' ? a[i] : 0);
      switch (t.k) {
        case 'q': gstack.push(gs); gs = { ...gs }; break;
        case 'Q': if (gstack.length) gs = gstack.pop(); break; // an extra Q is ignored, not fatal
        case 'cm': if (a.length >= 6 && a.slice(-6).every((v) => typeof v === 'number')) gs.ctm = mul(gs.ctm, a.slice(-6)); break;
        case 'm': begin(num(0), num(1)); break;
        case 'l': lineTo(num(0), num(1)); break;
        case 'c': if (a.length >= 6) curveTo(...a.slice(-6).map((v) => (typeof v === 'number' ? v : 0))); break;
        case 'v': if (cur && a.length >= 4) curveTo(cur.last[0], cur.last[1], num(0), num(1), num(2), num(3)); break;
        case 'y': if (a.length >= 4) curveTo(num(0), num(1), num(2), num(3), num(2), num(3)); break;
        case 'h': if (cur) { cur.closed = true; cur.pts.push(cur.pts[0], cur.pts[1]); cur.last = cur.start; } break;
        case 're': {
          const x = num(0), y = num(1), w = num(2), hh = num(3);
          begin(x, y); lineTo(x + w, y); lineTo(x + w, y + hh); lineTo(x, y + hh);
          cur.closed = true; cur.pts.push(cur.pts[0], cur.pts[1]); cur.last = [x, y]; cur.start = [x, y];
          break;
        }
        case 'S': endPath(true, false, false); break;
        case 's': endPath(true, false, true); break;
        case 'f': case 'F': case 'f*': endPath(false, true, true); break;
        case 'B': case 'B*': endPath(true, true, false); break;
        case 'b': case 'b*': endPath(true, true, true); break;
        case 'n': endPath(false, false, false); break;
        case 'W': case 'W*': clipPending = true; break;
        case 'CS': gs.strokeSep = await colourSpace(res, a[0]); break;
        case 'cs': gs.fillSep = await colourSpace(res, a[0]); break;
        case 'G': case 'RG': case 'K': gs.strokeSep = null; break;
        case 'g': case 'rg': case 'k': gs.fillSep = null; break;
        case 'Tr': gs.tr = num(0); break;
        case 'Tj': case 'TJ': case "'": case '"': {
          out.texts.push({ mode: gs.tr, fillSep: gs.fillSep, strokeSep: gs.strokeSep });
          if (out.textSample.length < 4000) {
            const strs = a.flat().filter((v) => v instanceof Str).map((v) => v.s).join('');
            out.textSample += strs + ' ';
          }
          break;
        }
        case 'BMC': mc.push(null); break;
        case 'BDC': {
          const tag = a[0]?.n;
          if (tag !== 'OC') { mc.push(null); break; }
          let props = a[1];
          if (props instanceof Name) props = (await doc.get(res?.Properties))?.[props.n] ?? null;
          mc.push(await ocFor(props));
          break;
        }
        case 'EMC': if (mc.length) mc.pop(); break;
        case 'Do': {
          const xo = await doc.get(res?.XObject);
          const ref = xo?.[a[0]?.n];
          const x = await doc.get(ref);
          if (!(x instanceof Stream)) break;
          const st = x.dict.Subtype?.n;
          if (st === 'Image') { out.images++; paintThroughClip(unitSquare()); }
          else if (st === 'Form' && depth < 12 && !(ref instanceof Ref && formRefs.has(ref.num))) {
            let m = await doc.get(x.dict.Matrix);
            if (!(Array.isArray(m) && m.length === 6 && m.every((v) => typeof v === 'number'))) m = [1, 0, 0, 1, 0, 0];
            const fres = (await doc.get(x.dict.Resources)) || res;
            const formOc = x.dict.OC ? await ocFor(x.dict.OC) : [];
            const data = await doc.decode(x);
            if (data) {
              // A form inherits the graphics state it is painted in (colour
              // included) and runs as if wrapped in q/Q, clipped to its /BBox.
              const ctm = mul(gs.ctm, m);
              const fgs = { ...gs, ctm };
              let bbox = await doc.get(x.dict.BBox);
              bbox = Array.isArray(bbox) && bbox.length >= 4 ? await Promise.all(bbox.slice(0, 4).map((v) => doc.get(v))) : null;
              if (bbox && bbox.every((v) => typeof v === 'number' && Number.isFinite(v))) {
                const [x0, y0, x1, y1] = bbox;
                const flat = [];
                for (const [px, py] of [[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]]) flat.push(...apply(ctm, px, py));
                const xs = flat.filter((_, i) => i % 2 === 0), ys = flat.filter((_, i) => i % 2 === 1);
                const bb = [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
                fgs.clip = narrow(gs.clip, bb);
                fgs.clipSubs = [{ pts: flat, bb, closed: true }];
              }
              await run(data, fres, fgs, depth + 1,
                new Set([...formRefs, ref instanceof Ref ? ref.num : -1]), [...ocNow(), ...formOc]);
            }
          }
          break;
        }
        case 'sh': paintThroughClip(null); break;
        case 'BI': { // inline image: skip to EI
          for (;;) { const k = lx.next(); if (k === EOF || (k instanceof Kw && k.k === 'ID')) break; }
          const b = bytesC;
          let p = lx.p + 1;
          while (p < b.length - 1 && !(WS[b[p - 1]] && b[p] === 69 && b[p + 1] === 73 && (p + 2 >= b.length || WS[b[p + 2]]))) p++;
          lx.p = p + 2;
          out.images++;
          paintThroughClip(unitSquare());
          break;
        }
        default: break; // w J j M d ri i gs BX EX MP DP BT ET Tf Tm Td TD T* Tc Tw Tz TL Ts SC SCN sc scn d0 d1
      }
      operands.length = 0;
    }
  }

  const data = await contentBytes(node.Contents);
  const gs0 = { ctm: [userUnit, 0, 0, userUnit, 0, 0], strokeSep: null, fillSep: null, tr: 0, clip: null, clipSubs: null };
  await run(data, resources, gs0, 0, new Set(), []);
  return out;
}
