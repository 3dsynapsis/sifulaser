// Inspector, toolbars and dialogs. Pure DOM, re-rendered from the store.

import {
  state, update, setParam, getBox, currentPanel, decorFor, selectedObject,
  MATERIALS, material, canUndo, canRedo, clampDecor, reset, applyDesign,
  setMeasure,
} from './store.js';
import * as gallery from './designs.js';
import { PANEL_LABELS, SCREW, dimMap, insideOf, buildBox } from './geom/box.js';
import {
  makeObject, PROCESSES, objectRings, measureText, patternInfo, patternFitKey,
} from './geom/decor.js';
import { PATTERNS, patternById, patternHoles, angleRange, safeRect } from './geom/pattern.js';
import { FONTS, loadFont } from './fonts.js';
import { SHEETS } from './exportSvg.js';

export const h = (tag, attrs = {}, ...kids) => {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') n.className = v;
    else if (k === 'html') n.innerHTML = v;
    else if (k.startsWith('on')) n.addEventListener(k.slice(2).toLowerCase(), v);
    else n.setAttribute(k, v === true ? '' : String(v));
  }
  for (const kid of kids.flat()) {
    if (kid == null || kid === false) continue;
    n.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  }
  return n;
};

const rnd = (v, p = 2) => Math.round(v * 10 ** p) / 10 ** p;

// While a slider is being dragged the inspector must not be rebuilt underneath it:
// that kills the drag and resets every <details> to its default state.
let sliderDragging = false;

/** A range input that holds the inspector still while it is being dragged. */
function liveRange({ min, max, step, value, onInput, onDisplay }) {
  return h('input', {
    type: 'range', min, max, step, value,
    oninput: (e) => {
      sliderDragging = true;
      const v = parseFloat(e.target.value);
      onDisplay?.(v);
      onInput(v);
    },
    onchange: (e) => {
      sliderDragging = false;
      onInput(parseFloat(e.target.value));
    },
  });
}

/** number input + slider bound to one value */
function numberRow(label, value, { min, max, step = 1, unit, onInput, slider = true }) {
  const num = h('input', {
    type: 'number', value: rnd(value, 3), min, max, step,
    onchange: (e) => {
      sliderDragging = false;
      onInput(clamp(parseFloat(e.target.value), min, max));
    },
  });
  const range = slider
    ? liveRange({ min, max, step, value, onInput, onDisplay: (v) => { num.value = rnd(v, 3); } })
    : null;
  const wrap = h('div', { class: 'field' },
    h('label', {}, label),
    h('div', { class: 'row' },
      range,
      h('div', { class: 'num', style: 'flex:0 0 92px' }, num, unit && h('span', { class: 'unit' }, unit)),
    ));
  return wrap;
}

const clamp = (v, min, max) => {
  if (Number.isNaN(v)) return min ?? 0;
  if (min != null) v = Math.max(min, v);
  if (max != null) v = Math.min(max, v);
  return v;
};

function segmented(options, current, onPick) {
  return h('div', { class: 'seg' }, options.map((o) =>
    h('button', {
      type: 'button', 'aria-pressed': String(o.id === current),
      title: o.hint || '',
      onclick: () => onPick(o.id),
    }, o.label)));
}

// ---- box-style thumbnails -------------------------------------------------
// Isometric illustration built from the same box the app makes, tinted with the
// material you picked so the two cards preview the real thing.
function shade(hex, k) {
  const n = parseInt(hex.slice(1), 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  const f = (c) => Math.max(0, Math.min(255, Math.round(k >= 0 ? c + (255 - c) * k : c * (1 + k))));
  return `#${ch.map((c) => f(c).toString(16).padStart(2, '0')).join('')}`;
}

const P = (pts) => pts.map((p) => p.join(',')).join(' ');
const shift = (p, dx, dy) => [p[0] + dx, p[1] + dy];

function boxThumb(style, base) {
  const c = {
    lid: shade(base, 0.26),
    rim: shade(base, 0.14),
    left: shade(base, -0.04),
    right: shade(base, -0.3),
    inner: shade(base, -0.46),
    innerB: shade(base, -0.36),
    floor: shade(base, -0.16),
    edge: shade(base, -0.62),
  };

  if (style === 'almari') return almariThumb(c);
  if (style === 'mihrab') return mihrabThumb(c);
  if (style === 'mihrab2') return mihrab2Thumb(c);
  if (style === 'round') return roundThumb(c);

  // top rim diamond, its inner opening, and the floor sitting below it
  const T = [48, 26]; const R = [80, 40]; const F = [48, 54]; const L = [16, 40];
  const H = 16;
  const Rb = shift(R, 0, H); const Fb = shift(F, 0, H); const Lb = shift(L, 0, H);
  const iT = [48, 28.6]; const iR = [74, 40]; const iF = [48, 51.4]; const iL = [22, 40];
  const D = 11;
  const fT = shift(iT, 0, D); const fR = shift(iR, 0, D);
  const fL = shift(iL, 0, D); const fF = shift(iF, 0, D);

  // floor mortises punched through the two faces we can see
  const dashL = (u, drop) => {
    const p = [L[0] + (F[0] - L[0]) * u, L[1] + (F[1] - L[1]) * u + drop];
    return P([p, shift(p, 5.5, 2.4), shift(p, 5.5, 4.8), shift(p, 0, 2.4)]);
  };
  const dashR = (u, drop) => {
    const p = [F[0] + (R[0] - F[0]) * u, F[1] + (R[1] - F[1]) * u + drop];
    return P([p, shift(p, 5.5, -2.4), shift(p, 5.5, 0), shift(p, 0, 2.4)]);
  };

  /** A leaf hinged on edge p->q, tilted open along d. */
  const leaf = (p1, q1, d) => {
    const a = shift(p1, d[0], d[1]);
    const b = shift(q1, d[0], d[1]);
    return `<polygon points="${P([p1, q1, b, a])}" fill="${c.lid}"/>` +
      `<polygon points="${P([a, b, shift(b, 0, 2.6), shift(a, 0, 2.6)])}" fill="${c.right}"/>` +
      `<polygon points="${P([p1, q1, b, a])}" fill="none" stroke="${c.edge}" ` +
      `stroke-width=".9" stroke-linejoin="round"/>`;
  };

  // Lift-off: a second tray, drawn hovering clear of the first. Everything the
  // style is about is in the gap, so the gap is what the card shows.
  const liftOff = style === 'shoebox' ? (() => {
    const S = 1.06; const UP = 22; const D = 6;
    const q = (pt) => [48 + (pt[0] - 48) * S, 40 + (pt[1] - 40) * S - UP];
    const lT = q(T); const lR = q(R); const lF = q(F); const lL = q(L);
    const lRb = shift(lR, 0, D); const lFb = shift(lF, 0, D); const lLb = shift(lL, 0, D);
    // The thumb notch sits on the face you would actually lift from, so it has
    // to follow that face's slope rather than sit level.
    const mx = (lLb[0] + lFb[0]) / 2; const my = (lLb[1] + lFb[1]) / 2;
    const deg = Math.atan2(lFb[1] - lLb[1], lFb[0] - lLb[0]) * 180 / Math.PI;
    return `<polygon points="${P([lL, lF, lFb, lLb])}" fill="${c.left}"/>` +
      `<polygon points="${P([lF, lR, lRb, lFb])}" fill="${c.right}"/>` +
      `<polygon points="${P([lT, lR, lF, lL])}" fill="${c.lid}"/>` +
      `<path d="M-3.4 0a3.4 3.4 0 0 0 6.8 0Z" fill="${c.edge}" opacity=".45" ` +
      `transform="translate(${mx} ${my}) rotate(${deg})"/>` +
      `<g fill="none" stroke="${c.edge}" stroke-width=".9" stroke-linejoin="round" opacity=".85">` +
      `<path d="M${P([lL, lF, lFb, lLb])}Z"/><path d="M${P([lF, lR, lRb, lFb])}Z"/>` +
      `<path d="M${P([lT, lR, lF, lL])}Z"/></g>`;
  })() : '';

  const lid = style === 'lidded'
    ? leaf(L, T, [-3, -21]) +
      `<circle cx="${T[0] - 5}" cy="${T[1] - 2}" r="1.7" fill="${c.edge}" opacity=".55"/>`
    : '';
  // Double: two leaves lean apart from the middle, each on its own wall.
  const leafBack = style === 'double' ? leaf(T, R, [11, -14]) : '';
  const leafFront = style === 'double' ? leaf(F, L, [-11, -14]) : '';

  return `<svg viewBox="0 0 96 74" aria-hidden="true">
  ${lid}
  ${leafBack}
  <polygon points="${P([iL, iT, fT, fL])}" fill="${c.inner}"/>
  <polygon points="${P([iT, iR, fR, fT])}" fill="${c.innerB}"/>
  <polygon points="${P([fT, fR, fF, fL])}" fill="${c.floor}"/>
  <path d="M${P([T, R, F, L])}Z M${P([iT, iR, iF, iL])}Z" fill="${c.rim}" fill-rule="evenodd"/>
  <polygon points="${P([L, F, Fb, Lb])}" fill="${c.left}"/>
  <polygon points="${P([F, R, Rb, Fb])}" fill="${c.right}"/>
  <g fill="${c.edge}" opacity=".5">
    <polygon points="${dashL(0.26, 11)}"/><polygon points="${dashL(0.62, 11)}"/>
    <polygon points="${dashR(0.16, 11)}"/><polygon points="${dashR(0.52, 11)}"/>
  </g>
  <g fill="none" stroke="${c.edge}" stroke-width=".9" stroke-linejoin="round" opacity=".8">
    <path d="M${P([L, F, Fb, Lb])}Z"/><path d="M${P([F, R, Rb, Fb])}Z"/>
    <path d="M${P([T, R, F, L])}Z"/><path d="M${P([iT, iR, iF, iL])}Z"/>
  </g>
  ${leafFront}
  ${liftOff}
</svg>`;
}

/** A drum: base, the wall with a hint of its kerf cuts, and the lid lifted off. */
function roundThumb(c) {
  const cx = 48; const rx = 26; const ry = 8;
  const top = 34; const bot = 60;
  const kerf = Array.from({ length: 11 }, (_, i) => {
    const x = cx - rx + 4 + i * ((2 * rx - 8) / 10);
    return `<path d="M${x.toFixed(1)} ${top + 3}V${bot - 3}" stroke="${c.edge}" stroke-width=".5" opacity=".35"/>`;
  }).join('');
  return `<svg viewBox="0 0 96 74" aria-hidden="true">
  <ellipse cx="${cx}" cy="${bot + 2}" rx="${rx + 6}" ry="${ry + 2}" fill="${c.right}"/>
  <ellipse cx="${cx}" cy="${bot}" rx="${rx + 6}" ry="${ry + 2}" fill="${c.rim}"/>
  <path d="M${cx - rx} ${top}V${bot}A${rx} ${ry} 0 0 0 ${cx + rx} ${bot}V${top}Z" fill="${c.left}"/>
  ${kerf}
  <ellipse cx="${cx}" cy="${top}" rx="${rx}" ry="${ry}" fill="${c.inner}"/>
  <ellipse cx="${cx}" cy="${top + 4}" rx="${rx - 3}" ry="${ry - 2}" fill="${c.floor}" opacity=".7"/>
  <ellipse cx="${cx}" cy="${top - 18}" rx="${rx + 6}" ry="${ry + 2}" fill="${c.right}"/>
  <ellipse cx="${cx}" cy="${top - 20}" rx="${rx + 6}" ry="${ry + 2}" fill="${c.lid}"/>
  <g fill="none" stroke="${c.edge}" stroke-width=".9" opacity=".8">
    <path d="M${cx - rx} ${top}V${bot}A${rx} ${ry} 0 0 0 ${cx + rx} ${bot}V${top}"/>
    <ellipse cx="${cx}" cy="${top}" rx="${rx}" ry="${ry}"/>
    <ellipse cx="${cx}" cy="${top - 20}" rx="${rx + 6}" ry="${ry + 2}"/>
  </g>
</svg>`;
}

/**
 * The mihrab, seen square-on from the front with a sliver of the side: the
 * keel arch, the two doors (the left one ajar, so the card says "doors"), and
 * the base plate it stands on.
 */
function mihrabThumb(c) {
  // Keel arch from geom/arch.js proportions, drawn in a 40 x 56 front.
  const x0 = 26; const x1 = 66; const base = 66; const spring = 36; const top = 10;
  const arch = (dx) => `M${x0 + dx} ${base}V${spring}`
    + `C${x0 + dx} ${spring - 12} ${x0 + 9 + dx} ${spring - 16} ${(x0 + x1) / 2 - 3 + dx} ${top + 4}`
    + `Q${(x0 + x1) / 2 + dx} ${top} ${(x0 + x1) / 2 + 3 + dx} ${top + 4}`
    + `C${x1 - 9 + dx} ${spring - 16} ${x1 + dx} ${spring - 12} ${x1 + dx} ${spring}V${base}Z`;
  const mid = (x0 + x1) / 2;
  return `<svg viewBox="0 0 96 74" aria-hidden="true">
  <polygon points="${P([[x0 - 6, base], [x1 + 14, base], [x1 + 20, base + 4], [x0, base + 4]])}" fill="${c.right}"/>
  <polygon points="${P([[x0 - 6, base], [x1 + 14, base], [x1 + 20, base - 2], [x0 - 0, base - 2]])}" fill="${c.rim}"/>
  <path d="${arch(6)}" fill="${c.right}" transform="translate(0 -4)"/>
  <path d="${arch(0)}" fill="${c.left}"/>
  <path d="M${mid} ${top + 2}V${base}" stroke="${c.edge}" stroke-width=".9"/>
  <polygon points="${P([[x0, spring + 2], [x0 - 9, spring + 6], [x0 - 9, base + 1], [x0, base]])}" fill="${c.lid}" opacity=".95"/>
  <circle cx="${mid - 3}" cy="${(spring + base) / 2}" r="1.4" fill="${c.edge}" opacity=".6"/>
  <circle cx="${mid + 3}" cy="${(spring + base) / 2}" r="1.4" fill="${c.edge}" opacity=".6"/>
  <path d="${arch(0)}" fill="none" stroke="${c.edge}" stroke-width=".9" stroke-linejoin="round" opacity=".85"/>
</svg>`;
}

/**
 * Mihrab 2.0, square-on with its depth showing: the arched front with its
 * quatrefoil chain, the sunburst and the medallion over two windowed doors -
 * and behind it the same arch again, the roof bent between them, which is
 * what tells it from the first mihrab at a glance.
 */
function mihrab2Thumb(c) {
  const x0 = 22; const x1 = 62; const base = 68; const spring = 30; const top = 6;
  const mid = (x0 + x1) / 2;
  const arch = (a, b, sp, tp, bot, m = mid) => `M${a} ${bot}V${sp}`
    + `C${a} ${sp - 10} ${a + 8} ${sp - 14} ${m - 2} ${tp + 3}`
    + `Q${m} ${tp} ${m + 2} ${tp + 3}`
    + `C${b - 8} ${sp - 14} ${b} ${sp - 10} ${b} ${sp}V${bot}Z`;
  const fan = [];
  for (let i = 1; i < 8; i++) {
    const a = Math.PI - (i * Math.PI) / 8;
    fan.push(`M${(mid + 3.4 * Math.cos(a)).toFixed(2)} ${(spring + 4 - 3.4 * Math.sin(a)).toFixed(2)}`
      + `L${(mid + 15 * Math.cos(a)).toFixed(2)} ${(spring + 4 - 15 * Math.sin(a)).toFixed(2)}`);
  }
  const win = [];
  for (const dx of [0, 1, 2]) {
    for (const dy of [0, 1, 3, 4]) {
      win.push(`<rect x="${x0 + 7.5 + dx * 4.4 + (dx > 0 ? 0 : 0)}" y="${spring + 9.5 + dy * 4.6}" width="3" height="3.2" fill="${c.inner}" opacity=".75"/>`);
      win.push(`<rect x="${x1 - 10.5 - dx * 4.4}" y="${spring + 9.5 + dy * 4.6}" width="3" height="3.2" fill="${c.inner}" opacity=".75"/>`);
    }
  }
  return `<svg viewBox="0 0 96 74" aria-hidden="true">
  <path d="${arch(x0 + 14, x1 + 14, spring - 6, top - 6, base - 6, mid + 14)}" fill="${c.right}"/>
  <polygon points="${P([[x1, base], [x1 + 14, base - 6], [x1 + 14, spring - 6], [x1, spring]])}" fill="${c.right}"/>
  <path d="${arch(x0, x1, spring, top, base)}" fill="${c.left}" stroke="${c.edge}" stroke-width=".9" stroke-linejoin="round"/>
  <path d="${arch(x0 + 2.6, x1 - 2.6, spring, top + 3.4, base - 2.6)}" fill="none" stroke="${c.edge}" stroke-width="1.6" stroke-dasharray="1.4 1.4" opacity=".55"/>
  <path d="M${x0 + 5} ${spring + 4}H${x1 - 5}" stroke="${c.edge}" stroke-width=".8" opacity=".7"/>
  <path d="${fan.join('')}" stroke="${c.edge}" stroke-width=".8" opacity=".6"/>
  <rect x="${x0 + 6}" y="${spring + 8}" width="${x1 - x0 - 12}" height="${base - spring - 14}" fill="${c.rim}" stroke="${c.edge}" stroke-width=".8"/>
  ${win.join('')}
  <path d="M${mid} ${spring + 8}V${base - 6}" stroke="${c.edge}" stroke-width=".9"/>
  <circle cx="${mid}" cy="${spring + 4}" r="3" fill="${c.lid}" stroke="${c.edge}" stroke-width=".8"/>
</svg>`;
}

/**
 * The drawer cabinet, in the same isometric and the same palette as the other
 * four cards. Two things have to read at 46 px: the top is CLOSED (a solid
 * diamond, where every other card shows the evenodd rim donut of an opening),
 * and the cabinet opens at the FRONT (one drawer sitting inset, one pulled out
 * past the face it came from). The body is taller than the other cards' because
 * an almari is a tall thing and the proportion is half the recognition.
 */
function almariThumb(c) {
  const T = [48, 16]; const R = [80, 30]; const F = [48, 44]; const L = [16, 30];
  const H = 26;                       // bottom lands at y = 70
  const Rb = shift(R, 0, H); const Fb = shift(F, 0, H); const Lb = shift(L, 0, H);

  // Mortise ticks on the side wall, so the card keeps the finger-joint
  // signature that every other card has.
  const dashR = (u, drop) => {
    const p = [F[0] + (R[0] - F[0]) * u, F[1] + (R[1] - F[1]) * u + drop];
    return P([p, shift(p, 5.5, -2.4), shift(p, 5.5, 0), shift(p, 0, 2.4)]);
  };

  // The cabinet face, parameterised: u across the front, v down it. Everything
  // on the front - shelf, drawers, notches - is placed through this, so it all
  // sits on the same slope without a transform.
  const pt = (u, v) => [
    L[0] + (F[0] - L[0]) * u,
    L[1] + (F[1] - L[1]) * u + v,
  ];
  const deg = Math.atan2(F[1] - L[1], F[0] - L[0]) * 180 / Math.PI;
  const quad = (a, b, cc, d, fill) => `<polygon points="${P([a, b, cc, d])}" fill="${fill}"/>`;
  /** A drawer front spanning v0..v1, moved by d. */
  const face = (v0, v1, d = [0, 0]) => [
    shift(pt(0.07, v0), d[0], d[1]), shift(pt(0.93, v0), d[0], d[1]),
    shift(pt(0.93, v1), d[0], d[1]), shift(pt(0.07, v1), d[0], d[1]),
  ];
  /** The thumb notch, on the top edge of a drawer front. */
  const notch = (f) => {
    const mx = (f[0][0] + f[1][0]) / 2;
    const my = (f[0][1] + f[1][1]) / 2;
    return `<path d="M-3.4 0a3.4 3.4 0 0 0 6.8 0Z" fill="${c.edge}" opacity=".45" `
      + `transform="translate(${mx} ${my}) rotate(${deg})"/>`;
  };
  const drawn = (f) => `<polygon points="${P(f)}" fill="${c.rim}"/>`
    + `<polygon points="${P(f)}" fill="none" stroke="${c.edge}" stroke-width=".9" `
    + 'stroke-linejoin="round"/>' + notch(f);

  const upper = face(2, 11.5);
  const lower = face(14.5, 24);
  // Straight out of the cabinet, which in this projection is down and to the
  // left: the same direction the front face's normal points, scaled to about a
  // quarter of the drawer's depth. Anything steeper reads as the drawer falling
  // out rather than sliding.
  const pull = [-7.5, 3.3];
  const out = lower.map((q) => shift(q, pull[0], pull[1]));

  return `<svg viewBox="0 0 96 74" aria-hidden="true">
  <polygon points="${P([L, F, Fb, Lb])}" fill="${c.left}"/>
  <polygon points="${P([F, R, Rb, Fb])}" fill="${c.right}"/>
  <polygon points="${P([T, R, F, L])}" fill="${c.lid}"/>
  <g fill="${c.edge}" opacity=".5">
    <polygon points="${dashR(0.24, 6)}"/><polygon points="${dashR(0.6, 6)}"/>
  </g>
  <path d="M${P([pt(0, 13), pt(1, 13)])}" fill="none" stroke="${c.edge}" stroke-width=".9" opacity=".55"/>
  ${drawn(upper)}
  ${quad(lower[0], lower[1], lower[2], lower[3], c.inner)}
  <g fill="none" stroke="${c.edge}" stroke-width=".9" stroke-linejoin="round" opacity=".8">
    <path d="M${P([L, F, Fb, Lb])}Z"/><path d="M${P([F, R, Rb, Fb])}Z"/>
    <path d="M${P([T, R, F, L])}Z"/>
  </g>
  ${quad(lower[1], lower[2], out[2], out[1], c.right)}
  ${quad(out[0], out[1], lower[1], lower[0], c.innerB)}
  ${drawn(out)}
</svg>`;
}

/**
 * Card art for the divider choice: the same open box, looked into from above,
 * with the interior panels standing in it.
 */
function dividerThumb(count, base) {
  const c = {
    rim: shade(base, 0.14),
    inner: shade(base, -0.46),
    innerB: shade(base, -0.36),
    floor: shade(base, -0.16),
    div: shade(base, -0.02),
    divTop: shade(base, 0.2),
    edge: shade(base, -0.62),
  };

  const T = [48, 26]; const R = [80, 40]; const F = [48, 54]; const L = [16, 40];
  const H = 16;
  const Rb = shift(R, 0, H); const Fb = shift(F, 0, H); const Lb = shift(L, 0, H);
  const iT = [48, 28.6]; const iR = [74, 40]; const iF = [48, 51.4]; const iL = [22, 40];
  const D = 11;
  const fT = shift(iT, 0, D); const fR = shift(iR, 0, D);
  const fL = shift(iL, 0, D); const fF = shift(iF, 0, D);
  const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];

  // Dividers stop short of the rim, so their tops sit below the opening.
  const SUNK = D * 0.4;
  /** A divider standing between the two rim midpoints p and q. */
  const wall = (p0, q0) => {
    const p = shift(p0, 0, SUNK);
    const q = shift(q0, 0, SUNK);
    const a = shift(p0, 0, D);
    const b = shift(q0, 0, D);
    return `<polygon points="${P([p, q, b, a])}" fill="${c.div}"/>` +
      `<polygon points="${P([p, q, shift(q, 0, 2.2), shift(p, 0, 2.2)])}" fill="${c.divTop}"/>` +
      `<polygon points="${P([p, q, b, a])}" fill="none" stroke="${c.edge}" ` +
      `stroke-width=".9" stroke-linejoin="round"/>`;
  };

  // The length divider runs from one long side to the other; the width divider
  // crosses it. Drawing the crossing one last reads as the half-lap.
  const dLength = count >= 2 ? wall(mid(iL, iT), mid(iF, iR)) : '';
  const dWidth = count >= 4 ? wall(mid(iT, iR), mid(iL, iF)) : '';

  return `<svg viewBox="0 0 96 74" aria-hidden="true">
  <polygon points="${P([iL, iT, fT, fL])}" fill="${c.inner}"/>
  <polygon points="${P([iT, iR, fR, fT])}" fill="${c.innerB}"/>
  <polygon points="${P([fT, fR, fF, fL])}" fill="${c.floor}"/>
  ${dLength}
  ${dWidth}
  <path d="M${P([T, R, F, L])}Z M${P([iT, iR, iF, iL])}Z" fill="${c.rim}" fill-rule="evenodd"/>
  <polygon points="${P([L, F, Fb, Lb])}" fill="${shade(base, -0.04)}"/>
  <polygon points="${P([F, R, Rb, Fb])}" fill="${shade(base, -0.3)}"/>
  <g fill="none" stroke="${c.edge}" stroke-width=".9" stroke-linejoin="round" opacity=".8">
    <path d="M${P([L, F, Fb, Lb])}Z"/><path d="M${P([F, R, Rb, Fb])}Z"/>
    <path d="M${P([T, R, F, L])}Z"/><path d="M${P([iT, iR, iF, iL])}Z"/>
  </g>
</svg>`;
}

// ---- viewport cube -------------------------------------------------------
// One cabinet-projection cube; the face that matters is tinted. Faces that would
// be hidden (back, left, bottom) reuse a visible face and mirror the whole cube,
// which reads as "looking from over there".
const CUBE_FACES = {
  front: '4 8 17 8 17 21 4 21',
  top: '4 8 7.5 4.5 20.5 4.5 17 8',
  right: '17 8 20.5 4.5 20.5 17.5 17 21',
};

const CUBE_VIEWS = {
  persp: { shade: { top: 0.3, front: 0.14, right: 0.05 } },
  front: { shade: { front: 0.32 } },
  back: { shade: { front: 0.32 }, flip: 'x' },
  right: { shade: { right: 0.32 } },
  left: { shade: { right: 0.32 }, flip: 'x' },
  top: { shade: { top: 0.32 } },
  bottom: { shade: { top: 0.32 }, flip: 'y' },
};

function cubeIcon(view) {
  const spec = CUBE_VIEWS[view] || CUBE_VIEWS.persp;
  const t = spec.flip === 'x'
    ? ' transform="translate(24 0) scale(-1 1)"'
    : spec.flip === 'y' ? ' transform="translate(0 24) scale(1 -1)"' : '';
  const fills = Object.entries(CUBE_FACES).map(([name, pts]) => {
    const a = spec.shade[name];
    return a ? `<polygon points="${pts}" fill="currentColor" fill-opacity="${a}"/>` : '';
  }).join('');
  const edges = [
    'M4 8 17 8 17 21 4 21Z',          // front face
    'M4 8 7.5 4.5 20.5 4.5 17 8',     // top face
    'M17 8 20.5 4.5 20.5 17.5 17 21', // right face
  ].map((d) => `<path d="${d}"/>`).join('');
  return `<svg viewBox="0 0 24 24" aria-hidden="true"><g${t}>${fills}` +
    `<g fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round">` +
    `${edges}</g></g></svg>`;
}

const STYLES = [
  { id: 'open', label: 'Open', hint: 'Four walls and a floor' },
  {
    id: 'lidded',
    label: 'Lidded',
    hint: 'One lid that pivots on pins in the side walls',
  },
  {
    id: 'double',
    label: 'Double Window',
    hint: 'Two leaves meeting in the middle, each hinged on its own wall and '
      + 'resting on the side walls, with a finger hole where they join',
  },
  {
    id: 'shoebox',
    label: 'Lift-off Lid',
    hint: 'A second tray inverted over the first - it comes off completely, '
      + 'the way a shoe box does',
  },
  {
    id: 'almari',
    label: 'Almari Laci',
    hint: 'Drawer cabinet - one or two equal levels, one drawer each, closed '
      + 'top and back, opens at the front. Try about 200 x 150 x 260 mm.',
  },
  {
    id: 'mihrab',
    label: 'Mihrab',
    hint: 'Keel-arch box (bentuk mihrab) with two arch-topped doors that swing '
      + 'open at the front on wooden pins, on a base plate. The arched roof is '
      + 'one strip of 3 mm board, kerf-cut so it bends over the arch.',
  },
  {
    id: 'mihrab2',
    label: 'Mihrab 2.0',
    hint: 'Mihrab-shaped box built like the ones sold in shops: the same arch front '
      + 'and back, a kerf-bent roof over the arch, and two layers on every face - a '
      + 'quatrefoil chain and a sunburst over a dark backing, doors with windows over '
      + 'a rosette jali, a girih lattice on each side. Four compartments inside.',
  },
  {
    id: 'round',
    label: 'Bulat',
    hint: 'Round box. The wall is a kerf-cut strip bent into a circle and '
      + 'dovetailed shut, standing in a groove on a base plate; the lid plugs '
      + 'into the top and lifts off. Length is the diameter.',
  },
];

const DIVIDERS = [
  { id: 0, label: 'None', hint: 'One open compartment' },
  {
    id: 2,
    label: '2 spaces',
    hint: 'One panel across the middle of the length, tenoned into the front and '
      + 'back walls',
  },
  {
    id: 4,
    label: '4 spaces',
    hint: 'Two panels half-lapped into a cross, each tenoned into its own pair of '
      + 'walls',
  },
];

export const BACKDROPS = [
  {
    id: 'dark',
    label: 'Dark backdrop',
    swatch: 'radial-gradient(120% 110% at 28% 18%, #4c4c50 0%, #2b2b2e 78%)',
  },
  {
    id: 'light',
    label: 'Light backdrop',
    swatch: 'radial-gradient(120% 110% at 28% 18%, #ffffff 0%, #dde1e8 78%)',
  },
];

/** Backdrop is a viewing preference, so it lives on the stage, not the inspector. */
export function renderBackdrop(root, onPick) {
  root.replaceChildren(...BACKDROPS.map((b) => h('button', {
    type: 'button',
    title: b.label,
    'aria-label': b.label,
    'aria-pressed': String(state.backdrop === b.id),
    style: `background:${b.swatch}`,
    onclick: () => onPick(b.id),
  })));
}

// ---------------------------------------------------------------- bottom bar
const CAMERAS = [
  ['persp', 'Persp.'], ['front', 'Front'], ['right', 'Right'],
  ['left', 'Left'], ['back', 'Back'], ['top', 'Top'], ['bottom', 'Bottom'],
];

const faceButton = ({ view, label, pressed, title, onclick, badge }) =>
  h('button', { class: 'face', 'aria-pressed': String(pressed), title, onclick },
    h('span', { class: 'face-ico', html: cubeIcon(view) },
      badge ? h('span', { class: 'badge' }, String(badge)) : null),
    h('span', { class: 'face-label' }, label));

/**
 * Which run of tabs a panel belongs to, so sixteen of them read as 6 + 5 + 5
 * rather than as one undifferentiated strip.
 */
const tabGroup = (id) => (/^d(\d+)/.exec(id)?.[1] ?? 'carcass');

/** 3D mode shows camera presets; 2D mode shows the panel tabs. */
export function renderFaces(root, { onFace, onCamera, camera }) {
  // The strip scrolls now, and renderBar() rebuilds it from every refresh - so
  // without this it would snap back to the first tab on every single click.
  const at = root.scrollLeft;
  root.replaceChildren();
  if (state.view === '3d') {
    for (const [id, label] of CAMERAS) {
      if (id === 'top' && state.params.style === 'open') continue;
      root.append(faceButton({
        view: id,
        label,
        pressed: camera === id,
        title: id === 'persp' ? 'Perspective view' : `View from the ${label.toLowerCase()}`,
        onclick: () => onCamera(id),
      }));
      if (id === 'persp') root.append(h('span', { class: 'face-sep' }));
    }
    root.scrollLeft = at;
    return;
  }
  let run = null;
  for (const panel of getBox().panels) {
    if (panel.noDecor) continue; // the mihrab's kerf-bent roof
    const g = tabGroup(panel.id);
    if (run !== null && g !== run) root.append(h('span', { class: 'face-sep' }));
    run = g;
    root.append(faceButton({
      view: panel.id,
      label: panel.label,
      pressed: state.face === panel.id,
      title: `Edit the ${panel.label.toLowerCase()} face`,
      badge: decorFor(panel).length,
      onclick: () => onFace(panel.id),
    }));
  }
  root.scrollLeft = at;
  // block:'nearest' or the whole page scrolls to bring the strip into view.
  root.querySelector('[aria-pressed="true"]')
    ?.scrollIntoView({ block: 'nearest', inline: 'center' });
}

// ------------------------------------------------------------- inspector
/**
 * What the dialogs are allowed to see of the store.
 *
 * extra() is what makes this tool different from the others: a box carries
 * the outline of every ornament on it, which is raw geometry rather than a
 * setting. The gallery measures it and decides whether it will fit.
 */
const galleryStore = {
  name: () => state.name,
  params: () => ({ ...state.params }),
  material: () => state.material,
  extra: () => ({ decor: state.decor }),
  rename: (name) => update((s) => { s.name = name; }, { history: false }),
  apply: (row) => applyDesign(row),
};

/** Save without asking - used on the way out of Export. */
export const saveQuietly = () => gallery.saveQuietly(galleryStore);

/** Open a saved design by id, for arrivals from another tool. */
export const openDesignById = (id) => gallery.openById(galleryStore, id);

const dialogFiller = (build) => function fill(dlg, ctx) {
  const close = () => dlg.close();
  const again = () => fill(dlg, ctx);
  dlg.replaceChildren(build(h, galleryStore, () => { close(); ctx.refresh(); }, again));
};

export const fillSaveDialog = dialogFiller(gallery.saveDialogBody);
export const fillFilesDialog = dialogFiller(gallery.filesDialogBody);

export function renderInspector(root, ctx) {
  if (sliderDragging) return; // the live control stays put until the drag ends
  root.replaceChildren();
  const obj = state.view === '2d' ? selectedObject() : null;
  root.append(h('h2', { class: 'insp-title' }, obj ? labelFor(obj) : 'Overall'));
  if (obj) objectInspector(root, obj, ctx);
  else overallInspector(root, ctx);
}

const labelFor = (o) => ({
  text: 'Text', rect: 'Rectangle', ellipse: 'Ellipse', star: 'Star',
  polygon: 'Polygon', image: 'Artwork', svg: 'Vector art', pattern: 'Pattern',
}[o.type] || 'Object');

// Which sections the user left open survives a re-render.
const groupOpen = new Map();

function group(title, open, ...body) {
  const isOpen = groupOpen.has(title) ? groupOpen.get(title) : open;
  const node = h('details', { class: 'group', ...(isOpen ? { open: true } : {}) },
    h('summary', {}, title),
    h('div', { class: 'group-body' }, ...body));
  node.addEventListener('toggle', () => groupOpen.set(title, node.open));
  return node;
}

function overallInspector(root, ctx) {
  const p = state.params;
  const mat = material();

  root.append(group('Box Style', true,
    h('div', { class: 'cards' }, STYLES.map(({ id, label, hint }) =>
      h('button', {
        class: 'card', type: 'button', 'aria-pressed': String(p.style === id),
        title: hint,
        onclick: () => { pickStyle(id); ctx.refresh(); },
      },
      h('span', { class: 'art', html: boxThumb(id, mat.color) }),
      label))),
    ...(p.style === 'shoebox' ? liftOffRows(p, ctx)
      : p.style === 'almari' ? drawerRows(p, ctx)
        : p.style === 'mihrab' ? mihrabRows(p, ctx, mat)
          : p.style === 'mihrab2' ? mihrab2Rows(p, ctx, mat)
          : p.style === 'round' ? roundRows(p, ctx)
            : p.style === 'lidded' || p.style === 'double' ? lidGapRows(p, ctx) : [])));

  // Straight after the style: this is where everyone looks first.
  const presets = patternPresets(mat, ctx);
  if (presets) root.append(presets);

  // Dividers and drawers want the same interior, and the pair cannot be
  // assembled - the geometry already refuses it, so the control should not be
  // sitting there offering.
  if (!['almari', 'mihrab', 'round'].includes(p.style)) root.append(group('Divider', true,
    h('div', { class: 'cards' }, DIVIDERS.map(({ id, label, hint }) =>
      h('button', {
        class: 'card', type: 'button',
        'aria-pressed': String((p.divider || 0) === id),
        title: hint,
        onclick: () => { setParam('divider', id); clampDecor(); ctx.refresh(); },
      },
      h('span', { class: 'art', html: dividerThumb(id, mat.color) }),
      label))),
    (p.divider ? numberRow('Divider height (% of depth)', p.dividerHeight, {
      min: 20, max: 100, step: 5,
      onInput: (v) => { setParam('dividerHeight', Math.round(v)); ctx.refresh(); },
    }) : null),
    h('p', { class: 'hint' }, p.style === 'mihrab2'
      ? 'Behind the doors: the long divider runs back from the doors\' meeting '
        + 'line, so each door opens on its own side, tenoned into the back and down '
        + 'into the floor. With four spaces the cross divider half-laps over it and '
        + 'tenons into both side walls. Both stand clear of the door stop.'
      : 'Dividers tenon through the walls the same way the floor does, and the '
      + 'four-space pair half-laps in the middle so it locks itself square. '
      + 'Keeping them short of the rim leaves room to reach in, and a lid closes '
      + 'over them rather than onto them.')));

  root.append(group('Dimensions', true, ...dimensionRows(p, ctx)));

  const matSel = h('select', {
    onchange: (e) => {
      const m = MATERIALS.find((x) => x.id === e.target.value);
      update((s) => {
        s.material = m.id;
        if (m.id !== 'custom') {
          s.params.thickness = m.t;
          s.params.kerf = m.kerf;
        }
      }, { geometry: true });
      ctx.refresh();
    },
  }, MATERIALS.map((m) => h('option', {
    value: m.id, ...(m.id === state.material ? { selected: true } : {}),
  }, m.id === 'custom' ? m.name : `${m.name} (${m.t} mm)`)));

  root.append(group('Material & Laser', true,
    h('div', { class: 'field' }, h('label', {}, 'Material'), matSel),
    h('div', { class: 'row' },
      h('span', { class: 'swatch', style: `background:${mat.color}` }),
      h('span', { class: 'muted' }, `${mat.name} · ${p.thickness} mm board`)),
    // Thickness removes panels as surely as the style cards do - a millimetre
    // step can gate every drawer off, or every divider - so it repairs the face
    // the same way. Without this the face points at a panel that no longer
    // exists: the 2D view silently draws panels[0] while every edit still writes
    // to the vanished face's decor list, and dragging appears to do nothing.
    numberRow('Board thickness (mm)', p.thickness, {
      min: 0.5, max: 12, step: 0.1,
      onInput: (v) => { setParam('thickness', v); clampDecor(); ctx.refresh(); },
    }),
    // The commonest reason a box that looks right on screen will not go
    // together: the sheet is not the thickness on its label, and every slot,
    // notch and lid fit is cut to the number here.
    h('p', { class: 'hint' },
      'Measure the board with calipers and type what you measure. Plywood sold '
      + 'as 3 mm is often 3.2 to 3.5 mm, and every slot, notch and lid is cut to '
      + 'this number - a sheet thicker than it says is what makes parts too '
      + 'tight to go in.'),
    numberRow('Kerf compensation (mm)', p.kerf, {
      min: 0, max: 0.6, step: 0.01,
      onInput: (v) => { setParam('kerf', v); ctx.refresh(); },
    }),
    h('p', { class: 'hint' },
      'Half the kerf is added to every outline and taken off every slot, so parts '
      + 'finish at nominal size. The preset is a CO2 starting point - cut a 20 mm '
      + 'test square, measure it, and add the shortfall here.'),
  ));

  const fitTicks = ['Looser', 'Loose', 'Standard', 'Tight', 'Tighter'];
  const d = getBox().derived;
  const screwOn = p.joint === 'screw' && !['mihrab', 'mihrab2', 'round'].includes(p.style);
  root.append(group('Joints', false,
    p.style === 'mihrab' ? h('p', { class: 'hint' },
      'The mihrab is glued: its two back corners are finger joints, and the doors '
      + 'are what comes apart. The screw joint is for the four-walled styles.') : null,
    p.style === 'mihrab2' ? h('p', { class: 'hint' },
      'Mihrab 2.0 is glued: every board is tenoned into the next, and the doors are '
      + 'what comes apart. The screw joint is for the four-walled styles.') : null,
    p.style === 'round' ? h('p', { class: 'hint' },
      'A round box has no corners: its wall is held by the groove it stands in and '
      + 'by the dovetails at the seam, glued. The screw joint is for the four-walled styles.') : null,
    ['mihrab', 'mihrab2', 'round'].includes(p.style) ? null : h('div', { class: 'field' },
      h('label', {}, 'Corner joint'),
      h('div', { class: 'seg' }, [
        ['standard', 'Standard'], ['screw', 'Screw'],
      ].map(([id, label]) => h('button', {
        type: 'button', 'aria-pressed': String((p.joint || 'standard') === id),
        title: id === 'standard'
          ? 'Finger joints, glued. Permanent.'
          : 'Finger joints plus M3 screws into captive nuts. Comes apart again.',
        onclick: () => { setParam('joint', id); ctx.refresh(); },
      }, label))),
      screwOn && d.screwTooSmall
        ? h('p', { class: 'warn' },
          'This box is too small for screws: the nut pockets reaching in from '
          + 'opposite edges would run into each other. Make it larger, or use '
          + 'the standard joint.')
        : screwOn
          ? h('p', { class: 'hint' },
            `${d.screwCount} x ${SCREW.name} screws, ${d.screwZs.length} on each `
            + (d.screwCorners === 2
              ? 'of the two back corners - the cabinet is open at the front, so '
                + 'the back is the only jointed pair. '
              : 'of the four corners. ')
            + 'The finger joints hold the box square by '
            + 'themselves, so you press it together first and then drive the '
            + 'screws one-handed. No glue, and it comes apart again.')
          : h('p', { class: 'hint' },
            'Finger joints, glued. Pick Screw to make the box demountable.')),
    screwOn && !d.screwTooSmall
      ? numberRow('Screws per corner', p.screwsPerEdge, {
        min: 1, max: 4, step: 1,
        onInput: (v) => { setParam('screwsPerEdge', Math.round(v)); ctx.refresh(); },
      })
      : null,
    screwOn && d.screwShort
      ? h('p', { class: 'warn' },
        // The same clamp box.js applies, or the sentence quotes a number the
        // geometry never saw.
        `Only ${d.screwZs.length} of the `
        + `${Math.max(1, Math.min(4, Math.round(p.screwsPerEdge ?? 2)))} screws `
        + 'you asked for fit: the finger joint owns most of the edge, and a '
        + 'pocket may not sit in a mortise. Larger fingers, or a taller box, '
        + 'leaves room for the rest.')
      : null,
    screwOn && d.screwEar > 0
      ? h('p', { class: 'hint' },
        `The side walls stand ${rnd(d.screwEar, 1)} mm proud at the corners. `
        + 'That overhang is what gives the screw hole enough edge to hold on to '
        + `at ${p.thickness} mm board - it shrinks on thicker stock and is gone `
        + 'by 7 mm. The box measures that much wider across, front to back.')
      : null,
    h('div', { class: 'field' },
      h('label', {}, 'Interference fit'),
      liveRange({
        min: -0.15, max: 0.25, step: 0.05, value: p.fit,
        onInput: (v) => { setParam('fit', v); ctx.refresh(); },
      }),
      h('div', { class: 'tick-labels' }, fitTicks.map((t) => h('span', {}, t))),
      h('p', { class: 'hint' }, `Slots shrink by ${rnd(p.fit, 2)} mm. Tenons stay nominal and the relief slits let them squeeze in.`)),
    numberRow('Joint module (mm)', p.fingerSize, {
      min: 5, max: 40, step: 0.5,
      onInput: (v) => { setParam('fingerSize', v); ctx.refresh(); },
    }),
    numberRow('Relief slits per tenon', p.reliefSlits, {
      min: 0, max: 4, step: 1,
      onInput: (v) => { setParam('reliefSlits', Math.round(v)); ctx.refresh(); },
    }),
    numberRow('Slit reach past root (mm)', p.slitOvershoot, {
      min: 0.1, max: 2, step: 0.05,
      onInput: (v) => { setParam('slitOvershoot', v); ctx.refresh(); },
    }),
    numberRow('Floor height above base (mm)', p.floorOffset ?? p.thickness, {
      min: 0, max: Math.max(20, getBox().params.height / 3), step: 0.5,
      onInput: (v) => { setParam('floorOffset', v); ctx.refresh(); },
    }),
  ));

  root.append(group('Cut summary', false, ...summaryRows()));

  root.append(h('button', {
    class: 'link', type: 'button',
    onclick: () => {
      if (!confirm('Start over? This clears the dimensions and every decoration.')) return;
      reset();
      ctx.refresh();
    },
  }, 'Start over'));
}

/**
 * Controls for the lift-off lid. Two of the three change how the box FITS rather
 * than how it looks, so each one says in millimetres what it just did - a
 * percentage of a wall height nobody has measured is not a number you can check
 * against the thing on your bench.
 */
function liftOffRows(p, ctx) {
  const d = getBox().derived.lid;
  if (!d) return [];
  const seg = (label, key, on, value) => h('div', { class: 'field' },
    h('label', {}, label),
    h('div', { class: 'seg' }, [[true, 'On'], [false, 'Off']].map(([v, text]) =>
      h('button', {
        type: 'button', 'aria-pressed': String(on === v),
        onclick: () => { setParam(key, v); ctx.refresh(); },
      }, text))),
    value);
  return [
    numberRow('Lid depth (% of the wall)', p.lidDrop ?? 35, {
      min: 10, max: 95, step: 5,
      onInput: (v) => { setParam('lidDrop', Math.round(v)); ctx.refresh(); },
    }),
    numberRow('Lid clearance (mm)', p.lidSlack ?? 0.4, {
      min: 0.1, max: 1.5, step: 0.05,
      onInput: (v) => { setParam('lidSlack', v); ctx.refresh(); },
    }),
    seg('Thumb notch', 'lidNotch', (p.lidNotch ?? true) !== false, null),
    h('p', { class: 'hint' },
      `The skirt covers ${rnd(d.drop, 1)} mm of the wall, and the finished box `
      + `measures ${rnd(d.outerL, 1)} x ${rnd(d.outerW, 1)} mm - the lid rides `
      + 'outside the walls, so it is wider than the Length and Width below.'),
    h('p', { class: 'hint' },
      'Clearance is the gap on each side, and it is the only gap there is: kerf '
      + 'is already compensated on both parts. Too little and the lid will not go '
      + 'on at all, and there is nothing to do about that afterwards but cut '
      + 'another one. Start at 0.4 mm, and open it up on materials that swell.'),
  ];
}

/** A mihrab-shaped box: taller than it is wide, so the arch has room. */
const MIHRAB_SIZE = { length: 200, width: 120, height: 260 };

/**
 * Switching style. The one case that touches the dimensions is the mihrab
 * picked on a box too squat to carry an arch - the app's default tray is half
 * as tall as it is long, and a keel arch on that is a hump. Then, and only
 * then, it takes the stock mihrab size, and its rows say so.
 */
let mihrabResized = false;
function pickStyle(id) {
  const b = getBox().params;
  const was = state.params.style;
  // Mihrab 2.0 carries its doors under an arch AND a transom, so it wants
  // more height for its length than the first one does.
  const stock = id === 'mihrab2' ? MIHRAB2_SIZE : MIHRAB_SIZE;
  const squat = (id === 'mihrab' || id === 'mihrab2') && was !== id
    && b.height < b.length * (id === 'mihrab2' ? 1.2 : 0.9);
  update((s) => {
    s.params.style = id;
    if (squat) {
      Object.assign(s.params, s.params.measure === 'inside'
        ? insideOf({ ...s.params, measure: 'outside' }, stock) : stock);
    }
    // Mihrab 2.0 comes the way the box it was drawn from comes: four
    // compartments behind the doors, and a hook holding them shut.
    if (id === 'mihrab2' && was !== 'mihrab2') {
      if (!s.params.divider) s.params.divider = 4;
      if ((s.params.mihrabLock || 'notch') === 'notch') s.params.mihrabLock = 'hook';
    }
  }, { geometry: true });
  mihrabResized = squat;
  clampDecor();
}

/** A round box people actually picture: a hand-sized drum. */
const ROUND_SIZE = { length: 120, width: 120, height: 90 };

/** Lid, base, and what the wall strip comes to. */
function roundRows(p, ctx) {
  const d = getBox().derived.round;
  if (!d) return [];
  const cab = getBox().params;
  const isStock = Math.abs(cab.length - ROUND_SIZE.length) < 0.01
    && Math.abs(cab.height - ROUND_SIZE.height) < 0.01;
  const strips = d.wall.segments;
  return [
    h('div', { class: 'field' },
      h('label', {}, 'Lid'),
      segmented([{ id: true, label: 'Lift-off lid' }, { id: false, label: 'Open' }],
        p.roundLid !== false, (v) => { setParam('roundLid', v); clampDecor(); ctx.refresh(); })),
    numberRow('Base margin (mm)', p.plinthMargin ?? 8, {
      min: 5, max: 40, step: 0.5,
      onInput: (v) => { setParam('plinthMargin', v); clampDecor(); ctx.refresh(); },
    }),
    d.lid ? numberRow('Lid clearance (mm)', p.lidSlack ?? 0.4, {
      min: 0.1, max: 1.5, step: 0.05,
      onInput: (v) => { setParam('lidSlack', v); ctx.refresh(); },
    }) : null,
    h('button', {
      class: 'ghost', type: 'button', style: 'width:100%',
      onclick: () => {
        update((s) => {
          Object.assign(s.params, s.params.measure === 'inside'
            ? insideOf({ ...s.params, measure: 'outside' }, ROUND_SIZE) : ROUND_SIZE);
        }, { geometry: true });
        clampDecor();
        ctx.refresh();
      },
    }, isStock ? 'Saiz bulat biasa ✓' : 'Saiz bulat biasa · Ø 120 × 90 mm'),
    h('p', { class: 'hint' },
      strips === 1
        ? `The wall is one strip ${rnd(d.wall.length, 1)} × ${rnd(d.wall.height, 1)} mm `
          + `with ${d.wall.rows} rows of kerf cuts. Its two ends dovetail together at the back.`
        : `The wall is ${strips} strips, each ${rnd(d.wall.segL, 1)} × ${rnd(d.wall.height, 1)} mm `
          + '- one would not fit a 600 mm sheet. Every seam is the same dovetail.'),
    h('p', { class: 'hint' },
      'Bend the wall slowly round the floor disc, press the dovetails home and drop it '
      + 'into the groove. Plywood or falcata - MDF and acrylic crack instead of bending.'),
    d.lid ? h('p', { class: 'hint' },
      `The lid is as wide as the base, ${rnd(d.overall.d, 1)} mm across; its plug sits `
      + `${rnd(d.slack, 2)} mm inside the wall all round.`) : null,
  ];
}

/** Arch shape, base plate and what the doors measure. */
// The door locks, with what each one is for. All three hold BOTH doors; the
// finger hole holds nothing and is there for the box that needs no lock.
const MIHRAB_LOCKS = [
  { id: 'notch', label: 'Finger hole', hint: 'A round notch to pull the doors by. No lock.' },
  { id: 'hook', label: 'Hook', hint: 'Cangkuk: a hook on the left door drops over a capped pin on the right. Neat.' },
  { id: 'bolt', label: 'Sliding bolt', hint: 'Selak: a bolt slides from a guide on the left door into a keeper on the right. Minimal.' },
  { id: 'pin', label: 'Mihrab pin', hint: 'Pasak: a little mihrab with two legs drops through an ear on each door. Grand.' },
];

/**
 * Card art for a lock, drawn from the lock the box would actually get: the
 * two doors' meeting edges and every lock part, seen from the front, nearer
 * parts over further ones. Built from the same params as the box on screen,
 * so it is that box's lock at that board's thickness.
 */
const lockArtCache = new Map();
function lockThumb(kind, params, base) {
  const key = `${kind}|${base}|${params.style}|${params.thickness}|${params.length}|${params.height}|${params.width}|${params.archRise}|${params.doorGap}|${params.fit}|${params.m2Frame}`;
  if (lockArtCache.has(key)) return lockArtCache.get(key);
  const box = buildBox({ ...params, mihrabLock: kind });
  const m = box.derived.mihrab || box.derived.mihrab2;
  const L = box.params.length;
  const zK = m.door.lockZ;
  const parts = box.panels.filter((q) => q.id === 'doorLeft' || q.id === 'doorRight' || q.attach || q.lockMove);
  // Front view: world (x, z) of each ring; a part seen edge-on (an ear, a
  // pin) becomes the rectangle it covers.
  const world = (q, [u, v], n = 0) => {
    const { origin: o, U, V, N } = q.frame;
    const uu = u + q.originShift[0];
    const vv = v + q.originShift[1];
    return [0, 1, 2].map((k) => o[k] + U[k] * uu + V[k] * vv + N[k] * n);
  };
  const view = (q) => {
    const t = q.thickness;
    const flat = Math.abs(q.frame.N[1]) > 0.9;
    const rings = [q.outline, ...q.holes].map((r) => r.map((pt) => world(q, pt)));
    if (flat) return { y: rings[0][0][1] - q.frame.N[1] * t / 2, rings: rings.map((r) => r.map(([x, , z]) => [x, z])) };
    const all = [...q.outline.map((pt) => world(q, pt, 0)), ...q.outline.map((pt) => world(q, pt, -t))];
    const xs = all.map((w) => w[0]); const zs = all.map((w) => w[2]); const ys = all.map((w) => w[1]);
    const [x0, x1, z0, z1] = [Math.min(...xs), Math.max(...xs), Math.min(...zs), Math.max(...zs)];
    return { y: (Math.min(...ys) + Math.max(...ys)) / 2, rings: [[[x0, z0], [x1, z0], [x1, z1], [x0, z1]]] };
  };
  const views = parts.map((q) => ({ q, ...view(q) })).sort((a, b) => b.y - a.y);
  // Window: 3:2 round the lock, or round the finger hole.
  // The pin stands tall: from its leg tips a board below the ears to the
  // point of its arch, all of it in the window.
  const tk = box.params.thickness;
  const pinLo = zK - tk;
  const pinHi = zK + tk + (m.lock.size?.[1] || 0);
  const span = kind === 'notch' ? 6 * m.door.notchR
    : kind === 'pin' ? Math.max(2.4 * m.lock.size[0], 2 * (pinHi - pinLo + 8))
      : kind === 'bolt' ? 1.5 * (m.lock.travel + m.lock.length) : 2.6 * m.lock.reach;
  const cz = kind === 'pin' ? (pinLo + pinHi) / 2 : zK;
  const W = Math.max(span, 30); const H = W * (46 / 92);
  const vx = L / 2 - W / 2; const vz = cz + H / 2;
  const c = { door: shade(base, -0.1), part: shade(base, 0.22), edge: shade(base, -0.62) };
  const d = (rings) => rings.map((r) => `M${r.map(([x, z]) => `${(x - vx).toFixed(2)} ${(vz - z).toFixed(2)}`).join('L')}Z`).join('');
  const paths = views.map(({ q, rings }) => {
    const fill = q.hinge ? c.door : c.part;
    return `<path d="${d(rings)}" fill="${fill}" fill-rule="evenodd" stroke="${c.edge}" stroke-width="${(W / 92 * 0.9).toFixed(3)}" stroke-linejoin="round"/>`;
  }).join('');
  const art = `<svg viewBox="0 0 ${W.toFixed(2)} ${H.toFixed(2)}" aria-hidden="true">${paths}</svg>`;
  lockArtCache.set(key, art);
  return art;
}

/**
 * The hinged lid's play, for the Lidded and Double styles. The number was always
 * in the geometry (lidGap) and never on the page, so a lid that was a hair too
 * tight to swing had no remedy short of a knife.
 */
function lidGapRows(p, ctx) {
  const g = getBox().params.lidGap;
  const two = p.style === 'double';
  return [
    numberRow('Lid gap (mm)', p.lidGap ?? 0.3, {
      min: 0.1, max: 2, step: 0.05,
      onInput: (v) => { setParam('lidGap', v); clampDecor(); ctx.refresh(); },
    }),
    h('p', { class: 'hint' },
      `The lid clears each end wall by ${rnd(g, 2)} mm`
      + (two ? ` and the two leaves part by ${rnd(g, 2)} mm in the middle` : '')
      + ', and its pins reach that much further into the hinge holes. Raise it if '
      + 'the lid rubs as it swings; lower it if it rattles.'),
  ];
}

function mihrabRows(p, ctx, mat) {
  const d = getBox().derived.mihrab;
  if (!d) return [];
  const cab = getBox().params;
  const isStock = ['length', 'width', 'height']
    .every((k) => Math.abs(cab[k] - MIHRAB_SIZE[k]) < 0.01);
  return [
    mihrabResized ? h('p', { class: 'note' },
      'Size changed to 200 × 120 × 260 mm: the box was too low for an arch.') : null,
    h('div', { class: 'field' },
      h('label', {}, 'Position'),
      segmented([
        { id: false, label: 'Standing', hint: 'Upright on its base, the doors at the front.' },
        { id: true, label: 'Lying', hint: 'On its back, the doors on top - opened like a lid.' },
      ], p.mihrabLie === true, (v) => { setParam('mihrabLie', v); clampDecor(); ctx.refresh(); })),
    d.lying ? h('p', { class: 'hint' },
      `Lying on its back, base plate included, it is ${rnd(d.overall.l, 1)} wide, `
      + `${rnd(d.overall.w, 1)} long and ${rnd(d.overall.h, 1)} mm high. The base plate `
      + 'stops flush with the back, so the back, the walls and the roof all lie flat '
      + 'on the table.') : null,
    h('div', { class: 'field' },
      h('label', {}, 'Arch carving'),
      segmented([
        { id: false, label: 'Plain', hint: 'The inner arch above the doors is left plain.' },
        { id: true, label: 'Carved layer', hint: 'A second arch board with a pattern cut through it, glued on the inner arch.' },
      ], p.mihrabCarve === true, (v) => { setCarve(v, ctx); })),
    h('div', { class: 'field' },
      h('label', {}, 'Door lock'),
      h('div', { class: 'cards lock-cards' }, MIHRAB_LOCKS.map((k) => h('button', {
        class: 'card', type: 'button', title: k.hint,
        'aria-pressed': String((p.mihrabLock || 'notch') === k.id),
        onclick: () => { setParam('mihrabLock', k.id); clampDecor(); ctx.refresh(); },
      }, h('span', { class: 'art', html: lockThumb(k.id, getBox().params, mat.color) }), k.label)))),
    h('p', { class: 'hint' }, lockHint(d)),
    // Right under the lock: when the doors will not go in, this is the first
    // place anyone looks, and it used not to be here at all.
    numberRow('Door gap (mm)', p.doorGap ?? 0.6, {
      min: 0.2, max: 2, step: 0.05,
      onInput: (v) => { setParam('doorGap', v); clampDecor(); ctx.refresh(); },
    }),
    h('p', { class: 'hint' },
      'The ceiling corner that holds each top pin drops into a slot open to the '
      + `top of the door, ${rnd(d.clear.slot, 1)} mm wide at its outer shoulder`
      + (d.shoulder
        ? ', and a small shoulder piece is glued back into the slot afterwards so '
          + 'the arch is whole again. '
        : '. ')
      + `The corner has ${rnd(d.clear.side, 2)} mm beside it and `
      + `${rnd(d.clear.below, 2)} mm above and below; each door has `
      + `${rnd(d.clear.foot, 2)} mm at its foot, and the two doors `
      + `${rnd(d.clear.middle, 2)} mm between them. If the ceiling will not go down `
      + 'over both pins, raise this rather than paring the slots with a knife.'),
    d.carve ? h('p', { class: 'hint' },
      'An extra arch board sits on the inner arch, a few mm in from its edge. The '
      + 'pattern is cut through it and the plain arch behind shows through, so it '
      + 'reads as carving when the doors open. Change the pattern under Pattern, or '
      + 'in 2D Design on Arch carving.') : null,
    numberRow('Arch height (% of length)', p.archRise ?? 50, {
      min: 25, max: 90, step: 1,
      onInput: (v) => { setParam('archRise', Math.round(v)); clampDecor(); ctx.refresh(); },
    }),
    numberRow('Shoulder roundness (%)', p.archRound ?? 55, {
      min: 20, max: 95, step: 1,
      onInput: (v) => { setParam('archRound', Math.round(v)); clampDecor(); ctx.refresh(); },
    }),
    numberRow('Base plate margin (mm)', p.plinthMargin ?? 8, {
      min: 5, max: 40, step: 0.5,
      onInput: (v) => { setParam('plinthMargin', v); clampDecor(); ctx.refresh(); },
    }),
    d.riseClamped ? h('p', { class: 'warn' },
      `The arch is ${rnd(d.rise, 1)} mm high, not ${rnd(d.riseWant, 1)}: the doors `
      + 'need room below it. Make the box taller for a higher arch.') : null,
    d.roundClamped ? h('p', { class: 'hint' },
      `Shoulders held at ${rnd(d.keel.R, 1)} mm radius - any rounder and they `
      + 'would stand taller than the point of the arch.') : null,
    h('button', {
      class: 'ghost', type: 'button', style: 'width:100%',
      onclick: () => {
        update((s) => {
          Object.assign(s.params, s.params.measure === 'inside'
            ? insideOf({ ...s.params, measure: 'outside' }, MIHRAB_SIZE) : MIHRAB_SIZE);
        }, { geometry: true });
        mihrabResized = false;
        clampDecor();
        ctx.refresh();
      },
    }, isStock ? 'Saiz mihrab biasa ✓' : 'Saiz mihrab biasa · 200 × 120 × 260 mm'),
    h('p', { class: 'hint' },
      `Each door is ${rnd(d.door.w, 1)} × ${rnd(d.door.h, 1)} mm and turns on two `
      + 'square pins: one down into the base, one up into the ceiling corner. The '
      + `base plate is ${rnd(d.overall.l, 1)} × ${rnd(d.overall.w, 1)} mm.`),
    h('p', { class: 'hint' },
      `The roof is one strip ${rnd(d.roof.length, 1)} × ${rnd(d.roof.width, 1)} mm `
      + `with ${d.roof.rows} rows of kerf cuts where it bends. Bend it slowly over `
      + 'the inner arch and the back, and glue it down - plywood or falcata, not MDF '
      + 'or acrylic, which crack instead of bending.'),
  ];
}

/** The stock Mihrab 2.0: room for real doors under a transom and an arch. */
const MIHRAB2_SIZE = { length: 200, width: 100, height: 280 };

/** A labelled drop-down. */
function pickRow(label, value, options, onPick) {
  return h('div', { class: 'field' }, h('label', {}, label),
    h('select', { onchange: (e) => onPick(e.target.value) }, options.map((o) =>
      h('option', { value: o.id, ...(o.id === value ? { selected: true } : {}) }, o.label))));
}

/** Two layers, the frame band, the sunburst, the lattice, the doors. */
function mihrab2Rows(p, ctx, mat) {
  const d = getBox().derived.mihrab2;
  if (!d) return [];
  const cab = getBox().params;
  const isStock = ['length', 'width', 'height']
    .every((k) => Math.abs(cab[k] - MIHRAB2_SIZE[k]) < 0.01);
  const set = (k, v) => { setParam(k, v); clampDecor(); ctx.refresh(); };
  const fills = [
    { id: 'sunburst', label: 'Sunburst' },
    ...PATTERNS.map((x) => ({ id: x.id, label: x.name })),
    { id: 'plain', label: 'Open - for a print or calligraphy' },
  ];
  const sides = [
    ...PATTERNS.map((x) => ({ id: x.id, label: x.name })),
    { id: 'plain', label: 'Open panel' },
  ];
  const jalis = [
    ...PATTERNS.map((x) => ({ id: x.id, label: x.name })),
    { id: 'plain', label: 'Plain - a print in every window' },
  ];
  return [
    mihrabResized ? h('p', { class: 'note' },
      'Size changed to 200 × 100 × 280 mm: the box was too low for an arch over its doors.') : null,
    h('p', { class: 'hint' },
      'Every face is two layers: a cut-through layer glued over a solid one. Stain '
      + 'the backing boards dark (the 3D view shows them so), or put coloured film or '
      + 'printed paper between the layers - it shows through every opening.'),
    pickRow('Over the doors', d.tympanum.fill, fills, (v) => set('m2Tympanum', v)),
    pickRow('Door jali', d.door.jali, jalis, (v) => set('m2Door', v)),
    h('div', { class: 'field' },
      h('label', {}, 'Tall window in each door'),
      segmented([
        { id: true, label: 'For a print', hint: 'The middle windows join into a tall one with no jali behind, for a printed panel.' },
        { id: false, label: 'All jali', hint: 'Every window has its rosette.' },
      ], p.m2DoorPrint !== false, (v) => set('m2DoorPrint', v))),
    pickRow('Side lattice', d.lattice ? d.lattice.pattern : (p.m2Side || 'khatim8'), sides,
      (v) => set('m2Side', v)),
    numberRow('Frame band (% of length)', p.m2Frame ?? 10, {
      min: 6, max: 16, step: 0.5,
      onInput: (v) => set('m2Frame', v),
    }),
    h('p', { class: 'hint' },
      `The band is ${rnd(d.B, 1)} mm wide, a chain of quatrefoils and links; the side `
      + 'walls\' tenons and the roof\'s tabs go through the backing only between two '
      + 'quatrefoils, so the frame hides every one. The frame\'s opening is '
      + `${rnd(d.r, 1)} mm wider all round than the backing's.`
      + (d.tympanum.fill === 'sunburst' && d.tympanum.burst
        ? ` The sunburst has ${d.tympanum.burst.rays} rays round a ${rnd(2 * d.Rm, 1)} mm medallion.`
        : '')),
    h('div', { class: 'field' },
      h('label', {}, 'Door lock'),
      h('div', { class: 'cards lock-cards' }, MIHRAB_LOCKS.map((k) => h('button', {
        class: 'card', type: 'button', title: k.hint,
        'aria-pressed': String((p.mihrabLock || 'notch') === k.id),
        onclick: () => set('mihrabLock', k.id),
      }, h('span', { class: 'art', html: lockThumb(k.id, getBox().params, mat.color) }), k.label)))),
    d.lock.wanted ? h('p', { class: 'warn' },
      `No room for the ${lockName(d.lock.wanted)} in this door opening - it would `
      + `catch the front as the doors open - so the doors get the ${lockName(d.lock.kind)}. `
      + 'A bigger box, a narrower frame band or thinner board makes room for it.') : null,
    h('p', { class: 'hint' }, lockHint(d)),
    numberRow('Door gap (mm)', p.doorGap ?? 0.6, {
      min: 0.2, max: 2, step: 0.05,
      onInput: (v) => set('doorGap', v),
    }),
    h('p', { class: 'hint' },
      `Each door clears the opening by ${rnd(d.clear.gap, 2)} mm all round and the `
      + `other door by ${rnd(d.clear.middle, 2)} mm. They stand ${rnd(d.clear.behind, 1)} mm `
      + 'behind the front board, so there is wood in front of every pin hole, and '
      + `they open to about ${Math.round(d.door.swing)}°, where the frame stops them. `
      + 'Shut, their jali rests on the door stop under the ceiling. Nothing of a door '
      + 'is above the ceiling, so the ceiling goes straight down onto both top pins.'),
    numberRow('Arch height (% of length)', p.archRise ?? 50, {
      min: 25, max: 90, step: 1,
      onInput: (v) => set('archRise', Math.round(v)),
    }),
    numberRow('Shoulder roundness (%)', p.archRound ?? 55, {
      min: 20, max: 95, step: 1,
      onInput: (v) => set('archRound', Math.round(v)),
    }),
    d.riseClamped ? h('p', { class: 'warn' },
      `The arch is ${rnd(d.rise, 1)} mm high, not ${rnd(d.riseWant, 1)}: the doors `
      + 'need room below it. Make the box taller for a higher arch.') : null,
    d.roundClamped ? h('p', { class: 'hint' },
      `Shoulders held at ${rnd(d.keel.R, 1)} mm radius - any rounder and they `
      + 'would stand taller than the point of the arch.') : null,
    d.roundRaised ? h('p', { class: 'hint' },
      `Shoulders kept at ${rnd(d.keel.R, 1)} mm radius, round enough for the frame `
      + 'band to follow them.') : null,
    h('button', {
      class: 'ghost', type: 'button', style: 'width:100%',
      onclick: () => {
        update((s) => {
          Object.assign(s.params, s.params.measure === 'inside'
            ? insideOf({ ...s.params, measure: 'outside' }, MIHRAB2_SIZE) : MIHRAB2_SIZE);
        }, { geometry: true });
        mihrabResized = false;
        clampDecor();
        ctx.refresh();
      },
    }, isStock ? 'Saiz Mihrab 2.0 biasa ✓' : 'Saiz Mihrab 2.0 biasa · 200 × 100 × 280 mm'),
    h('p', { class: 'hint' },
      `Each door is ${rnd(d.door.w, 1)} × ${rnd(d.door.h, 1)} mm with ${d.door.windows} `
      + 'windows, a solid rail across the middle for the lock, and a jali board glued '
      + 'behind it. It turns on two square pins: one down into the floor, one up into '
      + 'the ceiling.'),
    h('p', { class: 'hint' },
      `The roof is one strip ${rnd(d.roof.length, 1)} × ${rnd(d.roof.width, 1)} mm with `
      + `${d.roof.rows} rows of kerf cuts where it bends, and ${d.roof.tabs} tabs on each `
      + 'edge into the face and the back. Plywood or falcata - MDF and acrylic crack '
      + 'instead of bending.'),
  ];
}

/**
 * Turn the carving layer on or off. On, it gets the pattern the doors have -
 * a plain board would be nothing to look at - or Star 12 when they have none.
 */
function setCarve(on, ctx) {
  const before = getBox();
  const want = activePreset(before);
  let keep = null;
  for (const p of before.panels) {
    const o = decorFor(p).find((x) => x.preset);
    if (o) { keep = { motif: o.motif, strut: o.strut, angle: o.angle }; break; }
  }
  setParam('mihrabCarve', on);
  const panel = on && getBox().panels.find((q) => q.id === 'ribFace');
  if (panel && !decorFor(panel).some((x) => x.type === 'pattern')) {
    update((s) => {
      const o = makeObject('pattern', panel, {
        pattern: want === 'none' ? 'bintang12' : want, preset: true, ...(keep || {}),
      });
      if (o.fit) (s.decor.ribFace ||= []).push(o);
    }, { history: false });
  }
  clampDecor();
  ctx.refresh();
}

/** A lock's name as the cards give it, in lower case for a sentence. */
const lockName = (id) => (MIHRAB_LOCKS.find((k) => k.id === id)?.label || id).toLowerCase();

/** What the chosen lock is, how to work it, and what it is cut as. */
function lockHint(d) {
  const k = d.lock;
  if (k.kind === 'hook') {
    return 'Cangkuk. The hook turns on a pin through the left door and its finger drops '
      + 'over a capped pin on the right door, so neither door can open. Lift it a '
      + 'quarter turn to open. Five small parts; the pins are pressed into square '
      + 'holes, the hook turns on its round one.';
  }
  if (k.kind === 'bolt') {
    return `Selak. Slide the knob right and the bolt shoots ${rnd(k.engage, 1)} mm into the `
      + 'keeper on the right door; slide it back to open. Guide and keeper are glued '
      + 'on, each a spacer with a cover over it - the bolt runs between them.';
  }
  if (k.kind === 'pin') {
    return `Pasak mihrab. A ${rnd(k.size[0], 1)} × ${rnd(k.size[1], 1)} mm mihrab with two `
      + 'legs drops through an ear on each door. Lift it out to open. The ears are '
      + 'tenoned through the doors and glued. Lying down, only friction holds the pin.';
  }
  return 'A round finger hole between the doors to pull them by. Pick a lock to keep '
    + 'them shut.';
}

/** The cabinet everybody actually pictures when they say almari laci. */
const ALMARI_SIZE = { length: 200, width: 150, height: 260 };

/**
 * Controls for the drawer cabinet. Every single one of these changes how the
 * thing FITS, so the rule from liftOffRows applies with more force here, not
 * less: each hint says in millimetres what the control just did. A drawer that
 * is 0.4 mm tight does not go in at all, and there is nothing to do about it
 * afterwards but cut another one - so a percentage of a dimension nobody has
 * measured is not a number anyone can check against the part on their bench.
 */
function drawerRows(p, ctx) {
  const d = getBox().derived.almari;
  if (!d) return [];
  const dr = d.drawer;
  const seg = (label, key, on) => h('div', { class: 'field' },
    h('label', {}, label),
    h('div', { class: 'seg' }, [[true, 'On'], [false, 'Off']].map(([v, text]) =>
      h('button', {
        type: 'button', 'aria-pressed': String(on === v),
        onclick: () => { setParam(key, v); ctx.refresh(); },
      }, text))));

  // The cabinet as built, always an outside size - with the Inside switch on,
  // p.length is a drawer's inside and says nothing about the cabinet.
  const cab = getBox().params;
  const isStock = ['length', 'width', 'height']
    .every((k) => Math.abs(cab[k] - ALMARI_SIZE[k]) < 0.01);

  const rows = [
    h('div', { class: 'field' },
      h('label', {}, 'Levels'),
      // Exactly two legal states, so a segment rather than a slider or a number
      // box: the level arithmetic would happily accept 3 and the panel ids
      // would not. clampDecor before the refresh, the way the style cards do -
      // setParam alone leaves the face pointing at a panel that just vanished.
      segmented([{ id: 1, label: '1 tingkat' }, { id: 2, label: '2 tingkat' }],
        d.tingkat,
        (id) => { setParam('tingkat', id); clampDecor(); ctx.refresh(); })),
    h('p', { class: 'hint' },
      // How many drawers a level holds is the columns' business, so this says
      // the height and leaves the count to the Columns hint below - two rows
      // that both claim to know the drawer count will disagree the moment one
      // of them is edited.
      (d.tingkat === 1
        ? `One level, ${rnd(d.cellH, 1)} mm of clear height. `
        : `Two equal levels of ${rnd(d.cellH, 1)} mm clear height inside `
          + `${rnd(d.intH, 1)} mm. `)
      // The decor clamp lets an object hang off an edge on purpose, so halving a
      // panel really can park artwork clear of it. Say that, rather than
      // promising a nudge that keeps it on the part - it does not.
      + 'Changing the level count halves or doubles the height of every drawer '
      + 'part, so check any artwork on a drawer front afterwards: it keeps its '
      + 'position, which on a shorter part can put it off the edge.'),
    h('div', { class: 'field' },
      h('label', {}, 'Columns'),
      segmented([{ id: 1, label: '1 lajur' }, { id: 2, label: '2 lajur' }],
        d.lajur,
        (id) => { setParam('lajur', id); clampDecor(); ctx.refresh(); })),
    h('p', { class: 'hint' },
      (d.lajur === 1
        ? `One column, ${rnd(d.cellL, 1)} mm of clear width. `
        : `Two equal columns of ${rnd(d.cellL, 1)} mm clear width, divided by `
          + 'an upright per level that is tenoned into the boards above and '
          + 'below it. ')
      + `${d.drawers} drawer${d.drawers === 1 ? '' : 's'} in all, numbered along `
      + 'the front from the bottom left.'),
    dr && dr.rack > 1.3
      ? h('p', { class: 'warn' },
        `These drawers are ${rnd(dr.rack, 2)} times as wide as they are deep. `
        + 'Past about 1.3 a drawer goes in visibly crooked when you push one '
        + 'side of it, however much running gap you give it - that is the '
        + 'proportion, not the clearance. Two lajur halves the width and '
        + 'fixes it.')
      : null,
    h('button', {
      class: 'ghost', type: 'button',
      disabled: isStock,
      // The only control here that touches a number the user typed, which is why
      // it is a button they press rather than something that happens to them.
      onclick: () => {
        // ALMARI_SIZE is the cabinet. With the Inside switch on the fields
        // hold a drawer, so write the drawer that cabinet gives rather than
        // flipping the switch back behind the user's back.
        update((s) => {
          Object.assign(s.params, s.params.measure === 'inside'
            ? insideOf(s.params, ALMARI_SIZE) : ALMARI_SIZE);
        }, { geometry: true });
        clampDecor();
        ctx.refresh();
      },
    }, isStock ? 'Saiz almari biasa ✓' : 'Saiz almari biasa · 200 × 150 × 260 mm'),
    h('p', { class: 'hint' },
      `This one is ${rnd(cab.length, 1)} × ${rnd(cab.width, 1)} × ${rnd(cab.height, 1)} mm `
      + "outside. The app's default "
      + 'box is a small shallow tray, and a tray split into levels gives drawers '
      + 'a couple of centimetres deep - correct, but not what anyone means by an '
      + 'almari. The button sets a cabinet-shaped 200 × 150 × 260 mm; nothing '
      + 'else on this page changes a dimension behind your back.'),
  ];

  // Asked for two columns and got one: the control will have snapped back on
  // its own, and a control that moves without saying why reads as a bug.
  if (d.lajurWhy) rows.push(h('p', { class: 'warn' }, d.lajurWhy));

  if (!dr) {
    rows.push(h('p', { class: 'warn' }, d.drawerWhy));
    return rows;
  }

  rows.push(
    numberRow('Drawer side gap (mm)', p.drawerSide ?? 0.4, {
      min: 0, max: 2, step: 0.05,
      onInput: (v) => { setParam('drawerSide', v); ctx.refresh(); },
    }),
    h('p', { class: 'hint' },
      `Each side clears by ${rnd(dr.side, 2)} mm, so the drawer finishes `
      + `${rnd(dr.outer.l, 1)} mm wide in a ${rnd(d.interior.l, 1)} mm opening. `
      + 'This is a real running gap - kerf is already compensated on both parts. '
      + `It survives board ${rnd(dr.side, 2)} mm over nominal and no more. The `
      + 'opening itself does not move: it is the back wall\'s cut width, so it '
      + 'measures the same whatever the sheet turns out to be. The drawer is what '
      + 'grows - its front butts the side walls, so each wall stands proud by the '
      + 'whole error, once per side.'),
    dr.side < 0.005
      ? h('p', { class: 'warn' },
        'A zero running gap is a press fit: the drawer is cut exactly as wide as '
        + 'its opening and will not slide. Give it something.')
      : null,
    numberRow('Drawer top gap (mm)', p.drawerTop ?? 0.8, {
      min: 0, max: 3, step: 0.05,
      onInput: (v) => { setParam('drawerTop', v); ctx.refresh(); },
    }),
    h('p', { class: 'hint' },
      'The drawer rests on the board below it, so all of this is headroom: '
      + `${rnd(dr.top, 2)} mm above, nothing underneath. A gap underneath would `
      + 'be a step it falls off when pulled and has to climb going back in.'
      + (dr.thumbR > 0
        ? ` With the notch that gives ${rnd(dr.fingerGap, 1)} mm of finger room.`
        : '')),
    dr.top < 0.005
      ? h('p', { class: 'warn' },
        'A zero top gap fills the level exactly: the drawer binds on the board '
        + 'above it. Give it something.')
      : null,
    dr.top > dr.outer.w / 100
      ? h('p', { class: 'warn' },
        `More than about ${rnd(dr.outer.w / 100, 2)} mm on a drawer this deep and `
        + 'a loaded one tips nose-down as it comes out, then catches on the '
        + 'board edge going back.')
      : null,
    numberRow('Drawer inset (mm)', p.drawerInset ?? 2, {
      min: 0.5, max: 8, step: 0.5,
      onInput: (v) => { setParam('drawerInset', v); ctx.refresh(); },
    }),
    h('p', { class: 'hint' },
      'The drawer stops on its back against the cabinet\'s back wall, so the '
      + `${rnd(dr.inset, 1)} mm you see at the front is the same `
      + `${rnd(dr.inset, 1)} mm behind it - one number doing two jobs. About one `
      + `board thickness (${p.thickness} mm here) reads as a deliberate shadow `
      + 'line; much less and it reads as a flush fit that failed.'),
    seg('Thumb notch', 'drawerNotch', (p.drawerNotch ?? true) !== false),
    // thumbR is 0 for two quite different reasons - the notch is switched off,
    // or it was too small to be worth cutting - and blaming the cabinet's size
    // for a switch the user just flicked sends them off resizing a cabinet that
    // was never the problem. Read the parameter first, the derived value second.
    h('p', { class: 'hint' }, (p.drawerNotch ?? true) === false
      ? 'Notch off. Each drawer opens by the edge of its front. Switch it back on '
        + 'for a dip you can hook a finger into.'
      : dr.thumbR > 0
        ? `${/^8/.test(rnd(dr.thumbR, 1)) ? 'An' : 'A'} ${rnd(dr.thumbR, 1)} mm `
          + 'dip in the top edge of each drawer front. It is not only a handle: '
          + 'pulling from the middle is what keeps the drawer square in its '
          + 'opening.'
        : 'No notch here. On a drawer front this short it would run into the '
          + 'drawer\'s own base mortises, so nothing under about 2.5 mm of radius '
          + 'is cut. A taller level gives it room.'),
    dr.rack > 1.3
      ? h('p', { class: 'warn' },
        `This drawer is ${rnd(dr.rack, 2)} times as wide as it is deep. Past `
        + 'about 1.3 it sits visibly crooked whatever the clearance is - that is '
        + 'geometry, not a number you can tune. A deeper cabinet is the fix.')
      : null,
    h('p', { class: 'hint' },
      `Each drawer holds ${rnd(dr.inner.l, 1)} × ${rnd(dr.inner.w, 1)} × `
      + `${rnd(dr.inner.h, 1)} mm inside. Plywood forgives being a tenth tight `
      + 'and burnishes free in twenty pulls. Acrylic does not - it stick-slips '
      + 'and crazes at the corner - so open the side and top gaps by about half '
      + 'again on acrylic, and measure the sheet rather than trusting the label.'),
  );
  return rows;
}

const mm3 = (o) => `${rnd(o.l, 1)} × ${rnd(o.w, 1)} × ${rnd(o.h, 1)} mm`;

/**
 * The Dimensions group: the switch that says what the three numbers mean, the
 * numbers, and the same box read the other way.
 *
 * Both readings are always on screen. Somebody boxing a book thinks in the size
 * of the book; somebody fitting a shelf thinks in the size of the box; and the
 * commonest mistake with this tool was typing the first into a field that meant
 * the second. The line under the fields is what would have caught it.
 *
 * Everything shown here is read off the box that was built (derived.dims), not
 * recomputed from the fields, so a size the geometry had to clamp shows as the
 * size it became.
 */
function dimensionRows(p, ctx) {
  const dims = getBox().derived.dims;
  const inside = dims.measure === 'inside';
  const drawer = dims.what === 'drawer';
  const rows = [
    h('div', { class: 'field' },
      h('label', {}, 'These three sizes are the'),
      segmented([
        { id: 'outside', label: 'Outside', hint: 'The space the finished box takes up.' },
        {
          id: 'inside',
          label: drawer ? 'Inside each drawer' : 'Inside',
          hint: 'The clear space for whatever goes in it.',
        },
      ], dims.measure, (id) => { setMeasure(id); clampDecor(); ctx.refresh(); })),
    ...(p.style === 'round'
      ? [dimRow('Diameter', 'length', ctx), dimRow('Height', 'height', ctx)]
      // A mihrab on its back: the arch's height is now its length along the
      // table, and its depth is how high it stands. Same numbers, new names.
      : p.style === 'mihrab' && p.mihrabLie === true
        ? [dimRow('Width', 'length', ctx), dimRow('Length, base to arch tip', 'height', ctx),
          dimRow('Height lying down', 'width', ctx)]
        : [dimRow('Length', 'length', ctx), dimRow('Width', 'width', ctx), dimRow('Height', 'height', ctx)]),
    h('div', { class: 'stat dims-other' },
      h('span', {}, inside
        ? (drawer ? 'Cabinet outside' : 'Outside')
        : (drawer ? 'Each drawer inside' : 'Inside')),
      h('b', {}, inside ? mm3(dims.outer) : (dims.inner ? mm3(dims.inner) : 'no drawer'))),
    dims.cell
      ? h('div', { class: 'stat' },
        h('span', {}, `Each of the ${dims.cell.count} spaces`),
        h('b', {}, `${rnd(dims.cell.l, 1)} × ${rnd(dims.cell.w, 1)} mm`))
      : null,
  ];

  // Asked for a space and the box could not be that space. The fields still
  // show what was typed, so without this the box would be quietly wrong.
  if (inside && !dims.met) {
    rows.push(h('p', { class: 'warn' }, dims.inner
      ? `This ${drawer ? 'drawer' : 'box'} holds ${mm3(dims.inner)}, not the `
        + `${mm3(dims.asked)} asked for. `
        + (drawer
          ? 'The cabinet could not be built around that drawer - the note under '
            + 'Box Style says which part gave way.'
          : 'A jointed wall needs at least eight board thicknesses of length and '
            + 'six of height, so a very small space gets a larger box than it asked for.')
      : 'No drawer fits this cabinet, so there is no inside to measure. The note '
        + 'under Box Style says why.'));
  }

  rows.push(h('p', { class: 'hint' }, inside
    ? (drawer
      ? 'Inside each drawer: wall to wall, front to back, and from the drawer\'s '
        + 'floor up to its rim. Every drawer is the same size. '
      : p.style === 'mihrab2'
        ? 'Inside: side wall to side wall, the back of the shut doors to the back, '
          + 'and the floor up to the ceiling - what fits behind the doors. '
      : 'Inside: the clear space wall to wall, and from the floor up to the rim'
        + (p.style === 'open' ? '. ' : ', which is where the lid sits. '))
      + 'Type the size of what goes in and add 2-3 mm each way so it slides in '
      + 'and out - nothing is added for you. Change the board and the space '
      + 'stays; the box grows around it.'
    : (drawer
      ? 'Outside: across the front, front to back, and floor to the top. '
      : p.style === 'mihrab2'
        ? 'Outside: the space the finished box takes up, the arch included. '
      : 'Outside: the space the finished box takes up, including the lid. ')
      + (p.style === 'mihrab2'
        ? 'Boxing something? Switch to Inside and type its size instead - the front, '
          + 'the frame band and the arch over the doors all take their share of the outside.'
        : 'Boxing something? Switch to Inside and type its size instead - the '
          + 'walls take two board thicknesses off whatever is typed here.')));
  return rows;
}

const DIM_AXIS = { length: 'x', width: 'y', height: 'z' };

function dimRow(label, key, ctx) {
  const p = state.params;
  const maxima = { length: 900, width: 900, height: 600 };
  // The limits are limits on the BOX: eight boards is the least a jointed wall
  // can be, and the maxima are what fits a bed. Read as an inside size the same
  // two limits land somewhere else, and they move when the board changes.
  let min = p.thickness * 8;
  let max = maxima[key];
  if (p.measure === 'inside') {
    const { k, c } = dimMap(p)[DIM_AXIS[key]];
    min = Math.max(1, Math.ceil((min - c) / k));
    max = Math.max(min, Math.floor((max - c) / k));
  }
  return numberRow(`${label} (mm)`, p[key], {
    min,
    max,
    step: 1,
    onInput: (v) => {
      // A round box's width follows its diameter, so switching to another
      // style afterwards finds a square rather than a stale width.
      const val = clamp(v, min, max);
      if (p.style === 'round' && key === 'length') {
        update((s) => { s.params.length = val; s.params.width = val; }, { geometry: true });
      } else setParam(key, val);
      clampDecor();
      ctx.refresh();
    },
  });
}

function summaryRows() {
  const box = getBox();
  let cut = 0;
  let area = 0;
  for (const panel of box.panels) {
    for (const ring of [panel.outline, ...panel.holes]) cut += perimeter(ring);
    area += panel.size.w * panel.size.h;
    for (const o of decorFor(panel)) {
      for (const r of objectRings(o, { panel, decor: decorFor(panel) })) cut += perimeter(r);
    }
  }
  return [
    h('div', { class: 'stat' }, h('span', {}, 'Panels'), h('b', {}, String(box.panels.length))),
    h('div', { class: 'stat' }, h('span', {}, 'Path length'), h('b', {}, `${(cut / 1000).toFixed(2)} m`)),
    h('div', { class: 'stat' }, h('span', {}, 'Board area'), h('b', {}, `${(area / 100).toFixed(0)} cm²`)),
    h('div', { class: 'stat' }, h('span', {}, 'Wall height'), h('b', {}, `${rnd(box.derived.wallH, 1)} mm`)),
    // Both readings, whichever was typed. A drawer cabinet has its own line
    // further down, because there the inside that matters is the drawer's.
    !box.derived.almari && box.derived.dims.inner
      ? h('div', { class: 'stat' }, h('span', {}, 'Inside'), h('b', {}, mm3(box.derived.dims.inner)))
      : null,
    box.derived.round
      ? h('div', { class: 'stat' },
        h('span', {}, 'On its base'),
        h('b', {}, `Ø ${rnd(box.derived.round.overall.d, 1)} x ${rnd(box.params.height, 1)} mm`))
      : null,
    box.derived.mihrab
      ? h('div', { class: 'stat' },
        h('span', {}, 'On its base'),
        h('b', {}, `${rnd(box.derived.mihrab.overall.l, 1)} x ${rnd(box.derived.mihrab.overall.w, 1)} `
          + `x ${rnd(box.params.height, 1)} mm`))
      : null,
    box.derived.lid
      ? h('div', { class: 'stat' },
        h('span', {}, 'Overall size'),
        h('b', {}, `${rnd(box.derived.lid.outerL, 1)} x ${rnd(box.derived.lid.outerW, 1)} `
          + `x ${rnd(box.params.height, 1)} mm`))
      : null,
    // The one measurement somebody deciding what will fit in this cabinet
    // actually needs, and the only place in the UI that reports it. The outside
    // size tells you where it will stand, not what will go in it.
    box.derived.almari?.drawer
      ? h('div', { class: 'stat' },
        h('span', {}, 'Drawer inside'),
        h('b', {}, `${rnd(box.derived.almari.drawer.inner.l, 1)} x `
          + `${rnd(box.derived.almari.drawer.inner.w, 1)} x `
          + `${rnd(box.derived.almari.drawer.inner.h, 1)} mm`))
      : null,
    box.derived.screwCount
      ? h('div', { class: 'stat' },
        h('span', {}, 'Hardware'),
        h('b', {}, `${box.derived.screwCount} x ${SCREW.name}x${box.derived.screwLength} `
          + `+ ${box.derived.screwCount} nuts`))
      : null,
    box.derived.screwCount
      ? h('p', { class: 'hint' },
        'Button head or pan head, not countersunk - a flat head needs a '
        + 'countersink drilled by hand afterwards, which the laser cannot do.')
      : null,
    h('p', { class: 'hint' }, 'Path length counts every cut and outline once - a fill engrave takes far longer than its outline suggests.'),
  ];
}

function perimeter(ring) {
  let d = 0;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % ring.length];
    d += Math.hypot(b[0] - a[0], b[1] - a[1]);
  }
  return d;
}

// ------------------------------------------------------- object inspector
function objectInspector(root, obj, ctx) {
  const set = (patch, geometry = false) => {
    update((s) => {
      const list = s.decor[state.face];
      const target = list.find((o) => o.id === obj.id);
      Object.assign(target, patch);
    }, { geometry });
    ctx.refresh();
  };

  root.append(group('Laser Settings', true,
    h('div', { class: 'field' },
      h('label', {}, 'Process type'),
      segmented(PROCESSES.map((p) => ({ id: p.id, label: p.label, hint: p.hint })),
        obj.process, (id) => set({ process: id }))),
    h('div', { class: 'field' },
      h('label', {}, `Power ${Math.round(obj.power * 100)}%`),
      liveRange({
        min: 0.05, max: 1, step: 0.05, value: obj.power,
        onInput: (v) => set({ power: v }),
      }),
      h('div', { class: 'tick-labels' }, ['Low', 'Medium', 'High'].map((t) => h('span', {}, t)))),
    obj.process === 'cut'
      ? h('p', { class: 'hint' }, 'Cuts become real holes in the 3D preview and in the exported outline.')
      : null));

  if (obj.type === 'pattern') root.append(patternGroup(obj, set));

  const attrs = [];
  if (obj.type === 'text') {
    attrs.push(h('div', { class: 'field' },
      h('label', {}, 'Text'),
      h('textarea', {
        oninput: (e) => {
          const target = state.decor[state.face].find((o) => o.id === obj.id);
          target.text = e.target.value;
          const m = measureText(target);
          target.w = m.w || target.w;
          target.h = m.h || target.h;
          update(() => {}, { history: false });
          ctx.refresh({ keepFocus: e.target });
        },
      }, obj.text)));
    attrs.push(h('div', { class: 'field' },
      h('label', {}, 'Font'),
      h('select', {
        onchange: async (e) => {
          await loadFont(e.target.value);
          const target = state.decor[state.face].find((o) => o.id === obj.id);
          target.font = e.target.value;
          const m = measureText(target);
          target.w = m.w || target.w;
          target.h = m.h || target.h;
          update(() => {});
          ctx.refresh();
        },
      }, FONTS.map((f) => h('option', {
        value: f.id, ...(f.id === obj.font ? { selected: true } : {}),
      }, f.name)))));
    attrs.push(numberRow('Size (mm)', obj.size, {
      min: 2, max: 200, step: 0.5,
      onInput: (v) => {
        const target = state.decor[state.face].find((o) => o.id === obj.id);
        target.size = v;
        const m = measureText(target);
        target.w = m.w || target.w;
        target.h = m.h || target.h;
        update(() => {});
        ctx.refresh();
      },
    }));
    attrs.push(numberRow('Letter spacing (mm)', obj.letterSpacing || 0, {
      min: -2, max: 10, step: 0.1,
      onInput: (v) => {
        const target = state.decor[state.face].find((o) => o.id === obj.id);
        target.letterSpacing = v;
        const m = measureText(target);
        target.w = m.w || target.w;
        target.h = m.h || target.h;
        update(() => {});
        ctx.refresh();
      },
    }));
  }
  if (obj.type === 'rect') {
    attrs.push(numberRow('Corner radius (mm)', obj.radius || 0, {
      min: 0, max: Math.min(obj.w, obj.h) / 2, step: 0.5,
      onInput: (v) => set({ radius: v }),
    }));
  }
  if (obj.type === 'star') {
    attrs.push(numberRow('Points', obj.points, {
      min: 3, max: 16, step: 1, onInput: (v) => set({ points: Math.round(v) }),
    }));
    attrs.push(numberRow('Inner radius', obj.inner, {
      min: 0.1, max: 0.9, step: 0.05, onInput: (v) => set({ inner: v }),
    }));
  }
  if (obj.type === 'polygon') {
    attrs.push(numberRow('Sides', obj.sides, {
      min: 3, max: 16, step: 1, onInput: (v) => set({ sides: Math.round(v) }),
    }));
  }

  const panel = currentPanel();
  attrs.push(h('div', { class: 'row' },
    h('div', { class: 'field', style: 'flex:1' },
      h('label', {}, 'Width (mm)'),
      h('input', {
        type: 'number', value: rnd(obj.w), step: 0.5, min: 0.5,
        onchange: (e) => set({ w: Math.max(0.5, parseFloat(e.target.value)) }),
      })),
    h('div', { class: 'field', style: 'flex:1' },
      h('label', {}, 'Height (mm)'),
      h('input', {
        type: 'number', value: rnd(obj.h), step: 0.5, min: 0.5,
        onchange: (e) => set({ h: Math.max(0.5, parseFloat(e.target.value)) }),
      }))));
  attrs.push(h('div', { class: 'row' },
    h('div', { class: 'field', style: 'flex:1' },
      h('label', {}, 'X (mm)'),
      h('input', {
        type: 'number', value: rnd(obj.x), step: 0.5,
        onchange: (e) => set({ x: parseFloat(e.target.value) }),
      })),
    h('div', { class: 'field', style: 'flex:1' },
      h('label', {}, 'Y (mm)'),
      h('input', {
        type: 'number', value: rnd(obj.y), step: 0.5,
        onchange: (e) => set({ y: parseFloat(e.target.value) }),
      }))));
  attrs.push(numberRow('Rotation (deg)', obj.rot || 0, {
    min: 0, max: 359, step: 1, onInput: (v) => set({ rot: v }),
  }));
  attrs.push(h('div', { class: 'row' },
    h('button', {
      class: 'ghost', style: 'flex:1', type: 'button',
      onclick: () => set({ x: panel.size.w / 2 - obj.w / 2 }),
    }, 'Centre H'),
    h('button', {
      class: 'ghost', style: 'flex:1', type: 'button',
      onclick: () => set({ y: panel.size.h / 2 - obj.h / 2 }),
    }, 'Centre V')));

  root.append(group('Attribute', true, ...attrs));

  root.append(group('Arrange', false,
    h('div', { class: 'row' },
      h('button', {
        class: 'ghost', style: 'flex:1', type: 'button',
        onclick: () => {
          update((s) => {
            const list = s.decor[state.face];
            const copy = { ...obj, id: makeObject(obj.type, panel).id, x: obj.x + 4, y: obj.y - 4 };
            list.push(copy);
            s.selection = copy.id;
          });
          ctx.refresh();
        },
      }, 'Duplicate'),
      h('button', {
        class: 'ghost', style: 'flex:1', type: 'button',
        onclick: () => {
          update((s) => {
            const list = s.decor[state.face];
            const i = list.findIndex((o) => o.id === obj.id);
            list.push(list.splice(i, 1)[0]);
          });
          ctx.refresh();
        },
      }, 'Bring to front')),
    h('button', {
      class: 'ghost', type: 'button', style: `color:var(--danger)`,
      onclick: () => ctx.deleteSelected(),
    }, 'Delete object')));
}

/**
 * Pattern settings: which motif, how big, the contact angle that shapes the
 * stars, and the strut - the wood left between holes, which is what decides
 * whether the panel survives the laser and the post.
 */
function patternGroup(obj, set) {
  const panel = currentPanel();
  const t = panel.thickness || 3;
  const info = patternInfo(obj, { panel, decor: decorFor(panel) });
  const st = info.stats;
  const [lo, hi] = angleRange(obj.pattern);
  const motifMin = Math.max(10, Math.ceil(obj.strut * 6));
  const motifMax = Math.max(motifMin + 10, Math.round(Math.max(obj.w, obj.h)));

  const notes = [];
  if (obj.strut < 1.5) {
    notes.push(h('p', { class: 'warn' },
      `Struts under 1.5 mm are likely to burn through or snap. Use at least ${t} mm on ${t} mm board.`));
  } else if (obj.strut < t) {
    notes.push(h('p', { class: 'warn' },
      `Struts thinner than the ${t} mm board can warp or break when handled. ${t} mm or more is safer.`));
  }
  if (st.holes === 0) {
    notes.push(h('p', { class: 'warn' }, 'No holes fit. Make the pattern area bigger, the motif bigger or the strut thinner.'));
  } else if (st.holes > 800) {
    notes.push(h('p', { class: 'hint' }, `${st.holes} holes is a long cut. A bigger motif cuts faster.`));
  }

  return group('Pattern', true,
    h('div', { class: 'field' },
      h('label', {}, 'Pattern'),
      h('select', {
        onchange: (e) => {
          const def = patternById(e.target.value);
          set({ pattern: def.id, angle: null });
        },
      }, PATTERNS.map((d) => h('option', {
        value: d.id, ...(d.id === obj.pattern ? { selected: true } : {}),
      }, `${d.name} (${d.note})`)))),
    numberRow('Motif size (mm)', st.motif, {
      min: motifMin, max: motifMax, step: 1, onInput: (v) => set({ motif: v }),
    }),
    numberRow('Star angle (deg)', st.angle, {
      min: lo, max: hi, step: 0.5, onInput: (v) => set({ angle: v }),
    }),
    numberRow('Strut width (mm)', obj.strut, {
      min: 0.5, max: 10, step: 0.1, onInput: (v) => set({ strut: v }),
    }),
    h('label', { class: 'check' },
      h('input', {
        type: 'checkbox', ...(obj.clear !== false ? { checked: true } : {}),
        onchange: (e) => set({ clear: e.target.checked }),
      }),
      ' Keep clear of other objects on this face'),
    h('button', {
      class: 'ghost', type: 'button',
      onclick: () => {
        const win = safeRect(panel, t + obj.strut / 2);
        if (win) set({ ...win, rot: 0, fit: true, fitKey: patternFitKey(panel) });
      },
    }, 'Fill face'),
    h('p', { class: 'hint' },
      `${st.holes} holes` +
      (st.nearJoint ? ` · ${st.nearJoint} left out near joints or objects` : '') +
      '. Holes stay a full strut away from each other, the joints and the edge.'),
    ...notes);
}

// ---- pattern presets ------------------------------------------------------
// One tap on the Overall panel cuts a pattern through every wall, without
// knowing that the 2D editor exists. Nobody goes looking for a feature they
// have not seen, so the presets sit next to Box Style where everyone looks.

const WALL_IDS = ['front', 'back', 'left', 'right', 'lidFront', 'lidBack', 'lidLeft', 'lidRight'];
const LID_IDS = ['top', 'lidTop', 'leafFront', 'leafBack', 'cabTop'];
let presetFaces = 'walls';

// The mihrab's doors are its face - the jali in a mosque window is in the
// doors, not the walls - so there the choice is doors, or doors and walls.
// The carving layer above the doors, when there is one, goes with them.
const DOOR_IDS = ['doorLeft', 'doorRight', 'ribFace'];
const MIHRAB_WALLS = ['back', 'left', 'right'];

const presetTargets = (box, faces) => {
  // A round box's wall is a living hinge - a pattern through it would break
  // the bend - so the lid is the face.
  if (box.params.style === 'round') return box.panels.filter((p) => p.id === 'lidTop');
  const mihrab = box.params.style === 'mihrab' || box.params.style === 'mihrab2';
  // Mihrab 2.0's side walls already wear their lattice: the back is the wall.
  const walls = box.params.style === 'mihrab2' ? ['back'] : MIHRAB_WALLS;
  const ids = mihrab
    ? (faces === 'all' ? [...DOOR_IDS, ...walls] : DOOR_IDS)
    : faces === 'all' ? [...WALL_IDS, ...LID_IDS] : WALL_IDS;
  return box.panels.filter((p) => ids.includes(p.id));
};

/** The preset now on the box, or 'none'. Only presets count, not hand-placed patterns. */
function activePreset(box) {
  for (const p of box.panels) {
    const o = decorFor(p).find((x) => x.preset);
    if (o) return o.pattern;
  }
  return 'none';
}

function applyPreset(id, faces, ctx) {
  const box = getBox();
  // Switching which faces it is cut on keeps the size that was set for it.
  let keepSize = null;
  for (const p of box.panels) {
    const o = decorFor(p).find((x) => x.preset && x.pattern === id);
    if (o) { keepSize = { motif: o.motif, strut: o.strut, angle: o.angle }; break; }
  }
  update((s) => {
    for (const p of box.panels) {
      const list = s.decor[p.id];
      if (!list) continue;
      for (let i = list.length - 1; i >= 0; i--) {
        if (!list[i].preset) continue;
        if (list[i].id === s.selection) s.selection = null;
        list.splice(i, 1);
      }
    }
    if (id === 'none') return;
    for (const p of presetTargets(box, faces)) {
      const o = makeObject('pattern', p, { pattern: id, preset: true, ...(keepSize || {}) });
      if (o.fit) (s.decor[p.id] ||= []).push(o); // no room for a pattern on this face
    }
  });
  ctx.refresh();
}

function patternPresets(mat, ctx) {
  const box = getBox();
  // Mihrab 2.0's doors are windows over a jali and its sides a lattice
  // already: its patterns are chosen in its own rows, not cut over the top.
  if (box.params.style === 'mihrab2') return null;
  const active = activePreset(box);
  const mihrab = box.params.style === 'mihrab' || box.params.style === 'mihrab2';
  const round = box.params.style === 'round';
  if (round && !box.panels.some((p) => p.id === 'lidTop')) return null; // nothing to cut it on
  const hasLid = !round && (mihrab || box.panels.some((p) => LID_IDS.includes(p.id)));
  if (!hasLid) presetFaces = 'walls';
  const card = (id, label, art) => h('button', {
    class: 'card', type: 'button', 'aria-pressed': String(active === id),
    onclick: () => applyPreset(id, presetFaces, ctx),
  }, h('span', { class: 'art', html: art }), label);
  return group('Pattern', true,
    h('div', { class: 'cards' },
      card('none', 'None', patternThumbSvg(null, mat.color)),
      PATTERNS.map((d) => card(d.id, d.name, patternThumbSvg(d, mat.color)))),
    hasLid ? h('div', { class: 'field' },
      h('label', {}, 'Cut on'),
      segmented(mihrab
        ? [{ id: 'walls', label: 'Doors' }, { id: 'all', label: 'Doors + walls' }]
        : [{ id: 'walls', label: 'Walls' }, { id: 'all', label: 'Walls + lid' }],
        presetFaces, (f) => {
          presetFaces = f;
          if (active !== 'none') applyPreset(active, f, ctx);
          else ctx.refresh();
        })) : null,
    active !== 'none' ? presetSizeRows(box, ctx) : null,
    h('p', { class: 'hint' }, round
      ? 'Tap a pattern to cut it through the lid. The wall is a living hinge, and a '
        + 'pattern through it would break the bend.'
      : active === 'none'
      ? (mihrab
        ? 'Tap a pattern to cut it through both doors, the way a mosque window is. '
          + (box.params.style === 'mihrab2'
            ? 'It keeps clear of the hinge pins and the lock by itself.'
            : 'It follows the arch and keeps clear of the hinge pins by itself.')
        : 'Tap a pattern to cut it through the walls. It keeps clear of the joints and slots by itself.')
      : (mihrab && presetFaces === 'walls' ? 'Cut through both doors' : 'Cut through every wall')
        + ', clear of the joints. Size and bar width here change every face at once. '
        + 'For one face alone, the angle, or room for a logo, open 2D Design and '
        + 'tap the pattern.'));
}

/**
 * Size and bar width for every preset pattern at once. The same two sliders
 * live on each pattern in 2D Design, one face at a time; here they move the
 * whole set, so the stars on both doors and every wall stay the same size.
 */
function presetSizeRows(box, ctx) {
  const objs = [];
  for (const p of box.panels) for (const o of decorFor(p)) if (o.preset) objs.push(o);
  if (!objs.length) return null;
  const first = objs[0];
  const strut = first.strut;
  const motif = Math.round(first.motif || 30);
  const t = box.params.thickness;
  const setAll = (patch) => {
    update((s) => {
      for (const p of box.panels) for (const o of s.decor[p.id] || []) if (o.preset) Object.assign(o, patch);
    });
    ctx.refresh();
  };
  return h('div', {},
    numberRow('Pattern size (mm)', motif, {
      min: Math.max(10, Math.ceil(strut * 6)), max: 150, step: 1,
      onInput: (v) => setAll({ motif: Math.round(v) }),
    }),
    numberRow('Bar width (mm)', strut, {
      min: 1, max: 8, step: 0.1,
      onInput: (v) => setAll({ strut: Math.round(v * 10) / 10 }),
    }),
    strut < t ? h('p', { class: 'warn' },
      `Bars thinner than the ${t} mm board can warp or snap when handled.`) : null);
}

const thumbCache = new Map();
/** A small live preview of one pattern (null = plain board), in the board's colour. */
function patternThumbSvg(def, color = '#d8b47e') {
  const key = `${def ? def.id : 'none'}|${color}`;
  if (thumbCache.has(key)) return thumbCache.get(key);
  const W = 64, H = 40;
  const rings = def ? patternHoles({ x: 0, y: 0, w: W, h: H }, {
    pattern: def.id, strut: 1.6, motif: W / Math.max(1.3, def.across * 0.5), minHole: 0.5,
  }).rings : [];
  const d = rings.map((r) =>
    `M${r.map(([x, y]) => `${x.toFixed(2)} ${(H - y).toFixed(2)}`).join('L')}Z`).join('');
  const svg = `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">`
    + `<rect width="${W}" height="${H}" rx="3" fill="${color}"/>`
    + (d ? `<path d="${d}" fill="#2b2118"/>` : '') + '</svg>';
  thumbCache.set(key, svg);
  return svg;
}

export function patternMenu(onPick) {
  return h('div', {},
    h('div', { class: 'pop-title' }, 'Pattern'),
    h('div', { class: 'shape-list pattern-list' }, PATTERNS.map((d) =>
      h('button', { type: 'button', onclick: () => onPick(d.id) },
        h('span', { class: 'pattern-thumb', html: patternThumbSvg(d) }),
        h('span', {}, d.name, h('small', {}, ` ${d.note}`))))),
    h('p', { class: 'hint', style: 'margin:8px 4px 0' },
      'Fills the face and cuts through. Joints, slots and other objects are kept clear.'));
}

// ------------------------------------------------------------- popovers
const SHAPES = [
  ['ellipse', '◯', 'Ellipse'],
  ['star', '★', 'Star'],
  ['polygon', '⬟', 'Polygon'],
  ['rect', '▭', 'Rectangle'],
];

const EMOJI = ('😀 😁 😂 🤣 😊 😍 😎 🤩 🥳 😴 🤔 🙃 👍 👎 👏 🙌 💪 ✌️ 🤝 ❤️ 🧡 💛 💚 💙 💜 ⭐ 🌟 ✨ ⚡ 🔥 💧 🌈 ☀️ 🌙 ☁️ ❄️ 🌸 🌼 🌻 🌵 🍀 🌲 🐶 🐱 🐭 🐰 🦊 🐻 🐼 🐨 🦁 🐮 🐷 🐸 🐵 🐔 🐧 🦄 🐝 🦋 🐙 🐳 🍎 🍊 🍋 🍉 🍇 🍓 🥑 🌽 🍕 🍔 🍟 🌮 🍣 🍰 🍪 ☕ 🍺 🎁 🎈 🎉 🎂 🏆 🎯 🎮 🎧 🎸 📷 💡 🔧 🔨 ⚙️ 🔒 🔑 📦 📌 ✏️ 📐 🧩 🚀 ✈️ 🚗 🏠 🌍 ⏰ 💎 ♻️').split(' ');

export function openPopover(anchor, node, popEl) {
  popEl.replaceChildren(node);
  popEl.hidden = false;
  const r = anchor.getBoundingClientRect();
  popEl.style.left = `${r.right + 8}px`;
  popEl.style.top = `${Math.min(r.top, window.innerHeight - popEl.offsetHeight - 12)}px`;
  const close = (e) => {
    if (popEl.contains(e.target) || anchor.contains(e.target)) return;
    popEl.hidden = true;
    document.removeEventListener('pointerdown', close);
  };
  setTimeout(() => document.addEventListener('pointerdown', close));
}

export function shapeMenu(onPick) {
  return h('div', {},
    h('div', { class: 'pop-title' }, 'Shape'),
    h('div', { class: 'shape-list' }, SHAPES.map(([id, icon, label]) =>
      h('button', { type: 'button', onclick: () => onPick(id) },
        h('span', { style: 'font-size:16px;width:20px' }, icon), label))));
}

export function emojiMenu(onPick) {
  const grid = h('div', { class: 'emoji-grid' }, EMOJI.map((e) =>
    h('button', { type: 'button', onclick: () => onPick(e) }, e)));
  const search = h('input', {
    type: 'text', placeholder: 'Filter…',
    oninput: (e) => {
      const q = e.target.value.trim();
      grid.replaceChildren(...EMOJI.filter((x) => !q || x.includes(q))
        .map((x) => h('button', { type: 'button', onclick: () => onPick(x) }, x)));
    },
  });
  return h('div', {}, h('div', { class: 'pop-title' }, 'Emoji'), search, grid);
}

export function imageMenu(onFile) {
  const input = h('input', {
    type: 'file', accept: '.png,.jpg,.jpeg,.svg,image/*', style: 'display:none',
    onchange: (e) => e.target.files[0] && onFile(e.target.files[0]),
  });
  const drop = h('div', {
    class: 'drop',
    ondragover: (e) => { e.preventDefault(); drop.classList.add('over'); },
    ondragleave: () => drop.classList.remove('over'),
    ondrop: (e) => {
      e.preventDefault();
      drop.classList.remove('over');
      const f = e.dataTransfer.files[0];
      if (f) onFile(f);
    },
    onclick: () => input.click(),
  }, 'Drop a PNG, JPG or SVG here', h('br'), h('span', { class: 'muted' }, 'or click to browse · max 10 MB'));
  return h('div', {}, h('div', { class: 'pop-title' }, 'Artwork'), drop, input);
}

// --------------------------------------------------------------- dialogs
export function fillExportDialog(dlg, box) {
  const sel = dlg.querySelector('#sheetSel');
  sel.replaceChildren(...SHEETS.map((s) => h('option', {
    value: s.id, ...(s.id === state.sheet ? { selected: true } : {}),
  }, `${s.w} × ${s.h} mm`)));
  sel.onchange = (e) => update((s) => { s.sheet = e.target.value; }, { history: false });
  // A lift-off lid rides outside the walls, so the box that comes off the bed is
  // wider than the Length and Width that were typed in. This line is the last
  // thing anyone reads before cutting, so it names the size they will measure.
  // The drawer cabinet finishes at exactly the size that was typed - its top is
  // captured between the walls rather than sitting on them - with one honest
  // exception: the screw joint's fingers stand proud at the back.
  const a = box.derived.almari;
  const mi = box.derived.mihrab;
  const ro = box.derived.round;
  const outer = ro
    ? `Ø ${box.params.length} × ${box.params.height} mm (base Ø ${rnd(ro.overall.d, 1)} mm)`
    : mi
    ? `${rnd(mi.overall.l, 1)} × ${rnd(mi.overall.w, 1)} × ${box.params.height} mm on its base`
    : box.derived.lid
    ? `${rnd(box.derived.lid.outerL, 1)} × ${rnd(box.derived.lid.outerW, 1)} × ${box.params.height} mm overall`
    : a && a.outerW > box.params.width
      ? `${box.params.length} × ${rnd(a.outerW, 1)} × ${box.params.height} mm overall `
        + '(the screw fingers stand proud at the back)'
      : `${box.params.length} × ${box.params.width} × ${box.params.height} mm`;
  // Outside tells you where it will stand; inside tells you what will go in it.
  const inside = a?.drawer
    ? ` · drawer inside ${rnd(a.drawer.inner.l, 1)} × ${rnd(a.drawer.inner.w, 1)}`
      + ` × ${rnd(a.drawer.inner.h, 1)} mm`
    : !a && box.derived.dims.inner
      ? ` · inside ${mm3(box.derived.dims.inner)}`
      : '';
  dlg.querySelector('#exportSummary').textContent =
    `${box.panels.length} panels · ${outer} · ${box.params.thickness} mm board${inside}`;
  // Placed images cannot go into the PDF. A PDF image is an XObject with its own
  // encoding, and a PNG cannot be carried across as it stands. Saying so is the
  // whole point: artwork that silently fails to appear is worse than artwork
  // that was never offered.
  const art = box.panels.reduce(
    (n, p) => n + decorFor(p).filter((o) => o.type === 'image').length, 0);
  dlg.querySelector('#exportNote').textContent =
    `Kerf ${box.params.kerf} mm and a ${rnd(box.params.fit, 2)} mm interference fit are already baked into the paths — cut as-is.`
    + (art
      ? ` The PDF holds the vectors only — ${art} placed image${art === 1 ? '' : 's'}`
        + ` ${art === 1 ? 'is' : 'are'} in the SVG alone.`
      : '');
}

/**
 * The assembly list, filtered by style rather than concatenated.
 *
 * `only` names the styles a step belongs to; `skip` names the ones it does not;
 * neither means every style. The list already carried style-specific advice
 * ("lidded and double") that every box owner had to read past, and a drawer
 * cabinet is assembled in a genuinely different order - it has no front wall to
 * start from - so filtering is what keeps the list eight lines instead of
 * twelve, six of which do not apply.
 */
const STEPS = [
  { t: 'Clean the parts', d: 'Wipe the soot off every edge or the joints will feel tight for the wrong reason.' },
  {
    t: 'Lay them out',
    d: 'Two long walls (front/back), two short walls (left/right), the floor, and the lid if you made one.',
    skip: ['almari', 'mihrab', 'mihrab2', 'round'],
  },
  {
    t: 'Lay them out',
    d: 'The base plate, the arched back, two side walls, the ceiling, the inner '
      + 'arch, two doors, and the long kerf-cut roof strip.',
    only: ['mihrab'],
  },
  {
    t: 'Lay them out',
    d: 'The face (the front frame and the front board), the back, two side walls and '
      + 'their two lattices, the floor, the ceiling and its door stop, two doors and '
      + 'their two jali boards, the long kerf-cut roof strip, the medallion, and the '
      + 'dividers.',
    only: ['mihrab2'],
  },
  {
    t: 'Glue the layers first',
    d: 'The front frame onto the front board, outlines flush; each lattice onto the '
      + 'outside of its side wall, flush with its front and back edges; each jali board '
      + 'onto the back of its door, half a millimetre in from the door\'s edges. Film, '
      + 'prints or patterned paper go in between before you glue - the tall door '
      + 'windows are made for a printed panel. Weigh them flat until dry.',
    only: ['mihrab2'],
  },
  {
    t: 'Floor, dividers and the side walls',
    d: "Push the floor's slitted tenons into one side wall. Stand the long divider "
      + 'in the slots in the floor; with four spaces drop the cross divider over it, '
      + 'its tenons into the side wall. Then bring the second side wall in over every '
      + 'tenon at once.',
    only: ['mihrab2'],
  },
  {
    t: 'Doors before the ceiling',
    d: "Drop each door's bottom pin into its hole at the front corner of the floor "
      + 'and stand it up, shut. The ceiling holds the top pins, so it goes on after '
      + 'the doors, not before.',
    only: ['mihrab2'],
  },
  {
    t: 'Ceiling straight down',
    d: 'Glue the door stop into the slots under the ceiling first. Then lower the '
      + "ceiling flat: its side tenons slide down the channels in the walls' tops until "
      + 'they sit at the bottom, its two front holes go down over the door pins, and '
      + 'the stop passes just behind the doors. Glue the tenons, never the pins.',
    only: ['mihrab2'],
  },
  {
    t: 'The back',
    d: 'Push the back on from behind over every tenon at once - the side walls\', the '
      + "floor's, the ceiling's and the long divider's - and glue it.",
    only: ['mihrab2'],
  },
  {
    t: 'The roof',
    d: 'Bend the strip slowly over the arch, kerf cuts on the inside, its two ends '
      + "standing on the side walls' tops. Slide it back so its back tabs go into "
      + 'the slots in the back, and glue it along the walls and the back.',
    only: ['mihrab2'],
  },
  {
    t: 'The face goes on last',
    d: "Push the face straight on from the front, over the side walls' tenons and the "
      + "roof's front tabs, until it sits against everything, and glue it. The doors "
      + 'are behind it and swing out through the opening.',
    only: ['mihrab2'],
  },
  {
    t: 'The medallion',
    d: 'Glue it on the transom, centred at the foot of the sunburst. Paint it gold '
      + 'first if you want it to shine.',
    only: ['mihrab2'],
  },
  {
    t: 'Lay them out',
    d: 'The base plate, the floor disc, the ring, the wall strip (or strips), and '
      + 'the two lid discs if you made the lid.',
    only: ['round'],
  },
  {
    t: 'Glue the groove',
    d: 'Glue the floor disc and the ring onto the base plate, centred - the gap '
      + 'between them is the groove the wall stands in. Let it set before the wall goes in.',
    only: ['round'],
  },
  {
    t: 'Bend the wall',
    d: 'Kerf cuts on the inside. Roll it slowly round the floor disc rather than '
      + 'forcing it into a circle in the air, press the dovetails together at the '
      + 'back, and glue the seam. Then push the whole wall down into the groove.',
    only: ['round'],
  },
  {
    t: 'The lid',
    d: 'Glue the plug disc to the underside of the lid disc, dead centre. It locates '
      + 'the lid inside the wall, so the lid lifts straight off and drops back on.',
    only: ['round'],
    when: (p) => p.roundLid !== false,
  },
  {
    t: 'Back and sides into the base',
    d: 'The tenons on the bottom edges push down through the base plate. The '
      + "back's fingers lock into the back ends of the two side walls.",
    only: ['mihrab'],
  },
  {
    t: 'Doors before the ceiling',
    d: "Drop each door's bottom pin into its hole at the front corner of the base "
      + 'and stand it up. The ceiling holds the top pins, so it has to go on after '
      + 'the doors, not before.',
    only: ['mihrab'],
  },
  {
    t: 'Ceiling goes on last',
    d: 'Hook its back tabs into the slots in the back, then lower the front: the '
      + 'side tabs drop into the notches on top of the walls, and the two front '
      + 'corners drop into the slots at the top of the doors, their holes going '
      + 'down over the door pins. Glue the tabs, not the pins.',
    only: ['mihrab'],
  },
  {
    t: 'Glue the shoulders back',
    d: 'Press each small shoulder piece into the slot at the top of its door, '
      + 'dovetail first, so the arch is whole again. Glue it to the door only - '
      + 'never to the ceiling corner underneath it, or the door will not open.',
    only: ['mihrab'],
  },
  {
    t: 'Crown: inner arch, then the roof',
    d: 'Stand the inner arch in the ceiling slots behind the doors. Bend the roof '
      + 'strip slowly over it and the back, kerf cuts on the inside of the bend, '
      + 'and glue it along both arches and onto the tops of the walls.',
    only: ['mihrab'],
  },
  {
    t: 'The hook',
    d: 'Press the hook pin through the square hole in the left door from the front, '
      + 'hang the hook on it - it turns on its round hole - and press the star cap '
      + "on the pin's end. Press the catch pin into the right door the same way and "
      + 'cap it with the round cap. Shut both doors and drop the hook over the catch '
      + 'pin. Glue nothing that turns.',
    only: ['mihrab', 'mihrab2'],
    when: (p) => p.mihrabLock === 'hook',
  },
  {
    t: 'The sliding bolt',
    d: 'Glue the bolt guide on the left door with its open end flush with the door '
      + "edge, and the keeper on the right door the same way, level with it. Lay the "
      + "bolt in the guide's channel and glue the cover over the guide - not onto the "
      + "bolt. Push the knob pin through the cover's slot into the bolt and press the "
      + 'knob on. Glue the keeper cover on last.',
    only: ['mihrab', 'mihrab2'],
    when: (p) => p.mihrabLock === 'bolt',
  },
  {
    t: 'The ears and the mihrab pin',
    d: "Push each ear's tenon through the slot in its door from the front, flat side "
      + 'up, and glue it. Closed, the two ears meet at the gap with their square holes '
      + "level. Drop the mihrab pin's legs through both holes to lock.",
    only: ['mihrab', 'mihrab2'],
    when: (p) => p.mihrabLock === 'pin',
  },
  {
    t: 'The carving layer',
    d: 'Glue the Arch carving onto the front face of the inner arch, ideally before '
      + 'you stand it in: straight edges level, so both sit on the ceiling, and the '
      + 'same margin all round the curve. Weigh it down flat until dry - the bars '
      + 'are fragile until they are glued.',
    only: ['mihrab'],
    when: (p) => p.mihrabCarve === true,
  },
  {
    t: 'Lying down',
    d: "Built the same way, except the base plate stops flush with the back: the "
      + "back's tabs sit in open notches in its edge rather than slots - glue them. "
      + 'Lay it on its back and the doors open upwards, like a lid.',
    only: ['mihrab'],
    when: (p) => p.mihrabLie === true,
  },
  {
    t: 'Lay them out',
    d: 'The back, the two sides, and three horizontal boards that are the same '
      + 'part cut three times - bottom, shelf and top are interchangeable, and '
      + 'only the etched label tells them apart. Then five parts per drawer.',
    only: ['almari'],
  },
  {
    t: 'Floor into the front wall',
    d: 'The slitted tenons push through the mortises. They should click, not fight.',
    skip: ['almari', 'mihrab', 'mihrab2', 'round'],
  },
  {
    t: 'Add a side wall',
    d: 'The tabs on the front wall drop into the notches on the side wall; the floor tenon goes in at the same time.',
    skip: ['almari', 'mihrab', 'mihrab2', 'round'],
  },
  {
    t: 'Bottom into a side wall',
    d: 'There is no front wall to start from, so start with a board. Its tenons '
      + 'push through the mortises in the side wall, and the front edges of all '
      + 'three boards finish flush with the cabinet face.',
    only: ['almari'],
  },
  {
    t: 'Shelf before the second side',
    d: 'The shelf is trapped by closed mortises in both sides and in the back. '
      + 'Once the second side is on it cannot go in.',
    only: ['almari'],
    when: (p) => p.tingkat !== 1,   // a one-level cabinet has no shelf to fit
  },
  {
    t: 'Screw joints: nuts in first',
    d: 'Drop an M3 nut into each pocket before you close that corner up. Once '
      + 'the box is together you cannot reach them. They stay put on their own - '
      + 'the pocket is cut to the nut, not to a gap.',
    skip: ['mihrab', 'mihrab2', 'round'],
  },
  {
    t: 'Dividers before the far walls',
    d: 'Stand the long divider in the front wall mortises, drop the crossing one '
      + 'onto it, then bring the side walls in over their tenons. Once the box is '
      + 'closed they cannot go in.',
    skip: ['almari', 'mihrab', 'mihrab2', 'round'],
  },
  {
    t: 'Lid pins first',
    d: 'Slot each lid or leaf pin into the hole in the side wall boss before you '
      + 'close the second side. The double style has two of them per side.',
    only: ['lidded', 'double'],
  },
  {
    t: 'Close it up',
    d: 'Fit the remaining side and the back wall, then press the whole box square on a flat surface.',
    skip: ['almari', 'mihrab', 'mihrab2', 'round'],
  },
  {
    t: 'Top drops in last',
    d: 'Its tenons sit in open notches cut down from the top edges of the sides '
      + 'and the back, so it drops in from above once everything else is square. '
      + 'Nothing traps it - glue is what holds it down.',
    only: ['almari'],
  },
  {
    t: 'Each drawer is its own little box',
    d: 'Five parts, the same joints as the carcass. The base tenons finish flush '
      + 'on the drawer face, so small rectangles of end grain show there - that '
      + 'is the joint, not a mistake. Build them square or they will bind, and '
      + 'the drawer rests straight on the board below it with no gap underneath.',
    only: ['almari'],
  },
];

const stepsFor = (p) => STEPS.filter((s) => (!s.only || s.only.includes(p.style))
  && !(s.skip || []).includes(p.style)
  && (!s.when || s.when(p)));

export function fillAssembleDialog(dlg) {
  dlg.querySelector('#assembleSteps').replaceChildren(
    ...stepsFor(state.params).map(({ t, d }) =>
      h('li', {}, t, h('br'), h('span', {}, d))));
}

export { rnd };
