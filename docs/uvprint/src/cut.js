// Which paths are the cut line, and how many pieces does that make?
//
// Rules, first match wins, and the screen always says which one fired:
//   (a) painted in a Separation/DeviceN spot colour named CutContour, Cut,
//       ThruCut, Thru-cut or Cut Line (case, spaces, hyphens, underscores ignored)
//   (b) inside an optional-content layer whose name contains "cut"
//   (c) the outermost closed paths of everything on the page
//
// Pieces and holes (spec rule 5): each outermost cut outline is one piece, and
// every cut outline nested inside it - a hole, or an island inside a hole, at
// any depth - belongs to that outer piece and is never a new piece. Its area
// is already inside the outer piece's box, so pricing it again would charge
// the same acrylic twice. Under (c) the same holds: only the outermost outlines
// count, and the shapes inside are artwork.
//
// Containment is decided by geometry, not bounding boxes: a box inside the
// notch of an L-shape is inside the L's box but not inside the L (QA plan C24).
//
// All coordinates here are page points (x UserUnit). Nothing reads a page box
// for size: the MediaBox is only used under (c) to drop pasteboard leftovers.

import { isCutColour, isCutName } from './pdf/content.js';
import { insidePoly, bbInside, bbOverlap, bbIntersect, bbUnion, outlinesCross } from './geom.js';

export const MM_PER_PT = 25.4 / 72;
export const MIN_PIECE_MM = 0.5;
const TOL = 0.01 / MM_PER_PT; // 0.01 mm
const MAX_CANDIDATES = 20000;
const MANY_PIECES = 50;

const wMm = (bb) => (bb[2] - bb[0]) * MM_PER_PT;
const hMm = (bb) => (bb[3] - bb[1]) * MM_PER_PT;

function sampleInside(inner, outerPts) {
  const n = inner.length / 2;
  const step = Math.max(1, Math.floor(n / 64));
  let tot = 0, ins = 0;
  for (let i = 0; i < n; i += step) {
    tot++;
    if (insidePoly(inner[i * 2], inner[i * 2 + 1], outerPts)) ins++;
  }
  return tot > 0 && ins >= 0.9 * tot;
}

const contains = (outer, inner) => bbInside(inner.bb, outer.bb, TOL) && sampleInside(inner.pts, outer.pts);

/** Closed subpaths big enough to be real, with their (optionally clipped) box. */
function candidatesOf(paths, { clip = false, skipHidden = false, mediaBox = null } = {}) {
  const out = [];
  let dropped = 0;
  for (const p of paths) {
    if (skipHidden && p.oc.some((g) => g.off)) continue;
    for (const s of p.subs) {
      if (!s.closed) continue;
      let bb = s.bb;
      if (clip && p.clip) {
        bb = bbIntersect(bb, p.clip);
        if (!bb) { if (wMm(s.bb) >= MIN_PIECE_MM && hMm(s.bb) >= MIN_PIECE_MM) dropped++; continue; }
      }
      if (wMm(bb) < MIN_PIECE_MM || hMm(bb) < MIN_PIECE_MM) continue; // stray points (QA D15)
      if (mediaBox && !bbOverlap(bb, mediaBox)) { dropped++; continue; }
      out.push({ bb, pts: s.pts, area: (bb[2] - bb[0]) * (bb[3] - bb[1]), path: p });
    }
  }
  return { cands: out, dropped };
}

/** Same outline twice (a fill copy and a stroke copy is very common): keep one. */
function dedupe(sorted) {
  const kept = [];
  for (const c of sorted) {
    const slack = ((c.bb[2] - c.bb[0]) + (c.bb[3] - c.bb[1])) * 2 * TOL + 1e-9;
    let dup = false;
    for (let j = kept.length - 1; j >= 0 && kept[j].area - c.area <= slack; j--) {
      const k = kept[j].bb;
      if (Math.abs(k[0] - c.bb[0]) <= TOL && Math.abs(k[1] - c.bb[1]) <= TOL && Math.abs(k[2] - c.bb[2]) <= TOL && Math.abs(k[3] - c.bb[3]) <= TOL) { dup = true; break; }
    }
    if (!dup) kept.push(c);
  }
  return kept;
}

function nest(cands) {
  for (let i = 0; i < cands.length; i++) {
    const c = cands[i];
    c.parent = -1;
    // Sorted largest first, so the nearest earlier container is the smallest
    // one - the immediate parent.
    for (let j = i - 1; j >= 0; j--) {
      if (contains(cands[j], c)) { c.parent = j; break; }
    }
    c.depth = c.parent < 0 ? 0 : cands[c.parent].depth + 1;
    // The outermost outline this one sits in: the piece it belongs to.
    c.root = c.parent < 0 ? c : cands[c.parent].root;
  }
}

function outermostOnly(cands) {
  const roots = [];
  for (const c of cands) {
    if (!roots.some((r) => contains(r, c))) roots.push(c);
  }
  return roots;
}

function union(n) {
  const p = Array.from({ length: n }, (_, i) => i);
  const find = (i) => { while (p[i] !== i) { p[i] = p[p[i]]; i = p[i]; } return i; };
  return { find, join: (a, b) => { p[find(a)] = find(b); } };
}

export function detectCut(read) {
  const warnings = [];
  const warn = (code, extra = {}) => warnings.push({ code, ...extra });
  if (read.pageCount > 1) warn('multi-page', { pages: read.pageCount });
  if (read.repaired) warn('repaired');

  // Live text can never be a cut line. Invisible OCR text (render mode 3) is
  // not the customer's doing, so it does not warn.
  const visibleText = read.texts.filter((t) => t.mode !== 3);
  if (visibleText.some((t) => isCutColour(t.fillSep) || isCutColour(t.strokeSep))) warn('live-text-cut-colour');
  else if (visibleText.length) warn('live-text');
  if (read.page.annots) warn('annotations');

  const paths = read.paths;
  const ruleA = paths.filter((p) => isCutColour(p.strokeSep) || isCutColour(p.fillSep));
  // A clip painted through by an image or gradient is artwork, never a cut line.
  const ruleB = paths.filter((p) => !p.clipPainted && p.oc.some((g) => /cut/i.test(g.name)));
  const attempts = [
    ['a', ruleA],
    ['b', ruleB],
    ['c', paths],
  ];

  for (const [rule, set] of attempts) {
    if (!set.length) continue;
    const { cands: raw, dropped } = rule === 'c'
      ? candidatesOf(set, { clip: true, skipHidden: true, mediaBox: read.page.mediaBox })
      : candidatesOf(set);
    if (!raw.length) {
      if (rule !== 'c') warn('open-cut', { rule });
      continue;
    }
    if (raw.length > MAX_CANDIDATES) return { rule, pieces: [], holes: 0, warnings, error: 'too-complex', names: [] };
    if (rule !== 'c') {
      const openCount = set.reduce((a, p) => a + p.subs.filter((s) => !s.closed && wMm(s.bb) + hMm(s.bb) >= 1).length, 0);
      if (openCount) warn('open-cut-some', { rule, n: openCount });
    }
    raw.sort((A, B) => B.area - A.area);
    const cands = dedupe(raw);

    let pieces;
    let holes = 0;
    let error = null;
    let overlap = [];
    if (rule === 'c') {
      const roots = outermostOnly(cands);
      // Overlapping artwork shapes under (c) make one silhouette, so crossing
      // outlines are merged into one piece rather than counted twice.
      const u = union(roots.length);
      for (let i = 0; i < roots.length; i++) {
        for (let j = i + 1; j < roots.length; j++) {
          if (bbOverlap(roots[i].bb, roots[j].bb, TOL) && outlinesCross(roots[i].pts, roots[i].bb, roots[j].pts, roots[j].bb)) u.join(i, j);
        }
      }
      const groups = new Map();
      roots.forEach((r, i) => {
        const k = u.find(i);
        if (!groups.has(k)) groups.set(k, { bb: r.bb, outlines: [], holes: [] });
        const g = groups.get(k);
        g.bb = bbUnion(g.bb, r.bb);
        g.outlines.push(r.pts);
      });
      pieces = [...groups.values()];
      warn('fallback-outline');
      if (dropped) warn('outside-artboard', { n: dropped });
    } else {
      if (cands.length > 4000) return { rule, pieces: [], holes: 0, warnings, error: 'too-complex', names: [] };
      nest(cands);
      const byCand = new Map();
      pieces = [];
      for (const c of cands) {
        if (c.depth === 0) {
          const piece = { bb: c.bb, outlines: [c.pts], holes: [], cand: c };
          byCand.set(c, piece);
          pieces.push(piece);
        } else {
          // A hole, or an island inside a hole: part of the outer piece.
          holes++;
          byCand.get(c.root)?.holes.push(c.pts);
        }
      }
      // Cut outlines that cross each other cannot be cut cleanly (QA plan D6).
      for (let i = 0; i < pieces.length; i++) {
        for (let j = i + 1; j < pieces.length; j++) {
          const A = pieces[i], B = pieces[j];
          if (bbOverlap(A.bb, B.bb, TOL) && outlinesCross(A.cand.pts, A.bb, B.cand.pts, B.bb)) overlap.push(i, j);
        }
      }
      if (overlap.length) {
        error = 'cut-overlap';
        overlap = [...new Set(overlap)];
      }
      // Closed artwork shapes outside every cut outline are not priced (W5).
      const inCut = new Set(set);
      const others = candidatesOf(paths.filter((p) => !inCut.has(p)), { clip: true, skipHidden: true }).cands;
      if (others.some((o) => !pieces.some((pc) => bbOverlap(o.bb, pc.bb)))) warn('outside-cut');
      for (const pc of pieces) delete pc.cand;
    }

    if (pieces.length > MANY_PIECES) warn('many-pieces', { n: pieces.length });
    const names = rule === 'a'
      ? [...new Set(set.flatMap((p) => [...(isCutColour(p.strokeSep) ? p.strokeSep : []), ...(isCutColour(p.fillSep) ? p.fillSep : [])]).filter(isCutName))]
      : rule === 'b'
        ? [...new Set(set.flatMap((p) => p.oc.filter((g) => /cut/i.test(g.name)).map((g) => g.name)))]
        : [];
    return { rule, names, pieces, holes, warnings, error, overlap };
  }

  const painted = paths.length > 0;
  return {
    rule: null, names: [], pieces: [], holes: 0, warnings,
    error: !painted && read.images > 0 ? 'raster-only' : 'no-closed-path',
  };
}
