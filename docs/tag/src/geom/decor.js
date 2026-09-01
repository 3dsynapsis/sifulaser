// Decoration objects (text, shapes, artwork) placed on a panel face.
// Everything here resolves to closed rings in panel millimetres, y-up, so the SVG
// writer, the 2D editor and the 3D preview all consume the same geometry.
//
// Shared verbatim with the Box Maker, deliberately: a fix to the text
// measurement or the kerf handling should land in both tools, and it will not if
// the two copies have drifted. So the `image` type below stays even though this
// tool never creates one - it accepts SVG and nothing raster, because a PDF
// cannot carry a PNG and the export would stop matching the SVG. objectRings()
// has no `image` case in either tool; the raster path lives in the writers.

import {
  bbox, rect, roundedRect, ellipse, star, regularPolygon, rotatePts, translate,
  dedupe, offsetPolygon, isCCW, unloop,
} from './path.js';
import { loadedFont } from '../fonts.js';

export const PROCESSES = [
  { id: 'cut', label: 'Cut', hint: 'Through the material' },
  { id: 'engrave-fill', label: 'Engrave (Fill)', hint: 'Solid raster' },
  { id: 'engrave-line', label: 'Engrave (Line)', hint: 'Outline only' },
];

let seq = 0;
export const nextId = () => `o${Date.now().toString(36)}${(seq++).toString(36)}`;

export function makeObject(type, panel, extra = {}) {
  const w = Math.min(panel.size.w * 0.5, 40);
  const h = Math.min(panel.size.h * 0.5, 20);
  const base = {
    id: nextId(),
    type,
    x: panel.size.w / 2 - w / 2,
    y: panel.size.h / 2 - h / 2,
    w,
    h,
    rot: 0,
    process: type === 'text' ? 'engrave-fill' : 'engrave-line',
    power: 0.6,
  };
  if (type === 'text') {
    Object.assign(base, {
      text: 'Text', font: 'inter', size: 10, letterSpacing: 0,
      process: 'engrave-fill',
    });
  }
  if (type === 'rect') Object.assign(base, { radius: 0, w: h * 2, h });
  if (type === 'ellipse') Object.assign(base, { w: h, h });
  if (type === 'star') Object.assign(base, { points: 5, inner: 0.45, w: h, h });
  if (type === 'polygon') Object.assign(base, { sides: 6, w: h, h });
  if (type === 'image') Object.assign(base, { src: '', threshold: 128, invert: false, process: 'engrave-fill' });
  if (type === 'svg') Object.assign(base, { rings: [], process: 'cut' });
  return { ...base, ...extra };
}

/** Flatten a cubic bezier into line segments. */
function cubic(out, p0, p1, p2, p3, steps) {
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const mt = 1 - t;
    const a = mt * mt * mt;
    const b = 3 * mt * mt * t;
    const c = 3 * mt * t * t;
    const d = t * t * t;
    out.push([
      a * p0[0] + b * p1[0] + c * p2[0] + d * p3[0],
      a * p0[1] + b * p1[1] + c * p2[1] + d * p3[1],
    ]);
  }
}

function quad(out, p0, p1, p2, steps) {
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const mt = 1 - t;
    out.push([
      mt * mt * p0[0] + 2 * mt * t * p1[0] + t * t * p2[0],
      mt * mt * p0[1] + 2 * mt * t * p1[1] + t * t * p2[1],
    ]);
  }
}

/** opentype command list -> rings, flipped to y-up. */
function commandsToRings(commands, curveSteps = 10) {
  const rings = [];
  let cur = null;
  let pos = [0, 0];
  const flush = () => {
    if (cur && cur.length > 2) rings.push(dedupe(cur));
    cur = null;
  };
  for (const c of commands) {
    switch (c.type) {
      case 'M':
        flush();
        pos = [c.x, -c.y];
        cur = [pos];
        break;
      case 'L':
        pos = [c.x, -c.y];
        if (cur) cur.push(pos);
        break;
      case 'C': {
        const p3 = [c.x, -c.y];
        if (cur) cubic(cur, pos, [c.x1, -c.y1], [c.x2, -c.y2], p3, curveSteps);
        pos = p3;
        break;
      }
      case 'Q': {
        const p2 = [c.x, -c.y];
        if (cur) quad(cur, pos, [c.x1, -c.y1], p2, curveSteps);
        pos = p2;
        break;
      }
      case 'Z':
        flush();
        break;
      default:
        break;
    }
  }
  flush();
  return rings;
}

/** Natural (unscaled, unpositioned) rings for a text object at its font size. */
export function textRings(obj) {
  const font = loadedFont(obj.font) || loadedFont('inter');
  if (!font) return null;
  const size = Math.max(1, obj.size || 10);
  const spacing = obj.letterSpacing || 0;
  let rings = [];
  if (spacing) {
    let x = 0;
    const scale = size / font.unitsPerEm;
    for (const ch of Array.from(obj.text || '')) {
      const glyph = font.charToGlyph(ch);
      const p = glyph.getPath(x, 0, size);
      rings = rings.concat(commandsToRings(p.commands));
      x += glyph.advanceWidth * scale + spacing;
    }
  } else {
    const p = font.getPath(obj.text || '', 0, 0, size);
    rings = commandsToRings(p.commands);
  }
  return rings;
}

/** Rings in panel coordinates, honouring x/y/w/h/rot. */
export function objectRings(obj) {
  let rings = [];
  switch (obj.type) {
    case 'text': {
      const raw = textRings(obj);
      if (!raw || !raw.length) return [];
      const bb = bbox(raw.flat());
      // Text keeps its own aspect: w/h on the object mirror the measured bounds.
      rings = raw.map((r) => translate(r, obj.x - bb.x0, obj.y - bb.y0));
      break;
    }
    case 'rect':
      rings = [roundedRect(obj.x, obj.y, obj.w, obj.h, obj.radius || 0)];
      break;
    case 'ellipse':
      rings = [ellipse(obj.x + obj.w / 2, obj.y + obj.h / 2, obj.w / 2, obj.h / 2, 72)];
      break;
    case 'star':
      rings = [star(obj.x + obj.w / 2, obj.y + obj.h / 2,
        Math.min(obj.w, obj.h) / 2, (Math.min(obj.w, obj.h) / 2) * (obj.inner ?? 0.45),
        obj.points || 5)];
      break;
    case 'polygon':
      rings = [regularPolygon(obj.x + obj.w / 2, obj.y + obj.h / 2,
        Math.min(obj.w, obj.h) / 2, obj.sides || 6)];
      break;
    case 'svg': {
      if (!obj.rings || !obj.rings.length) return [];
      const bb = bbox(obj.rings.flat());
      const sx = bb.w ? obj.w / bb.w : 1;
      const sy = bb.h ? obj.h / bb.h : 1;
      rings = obj.rings.map((r) =>
        r.map(([x, y]) => [obj.x + (x - bb.x0) * sx, obj.y + (y - bb.y0) * sy]));
      break;
    }
    default:
      return [];
  }
  if (obj.rot) {
    const cx = obj.x + obj.w / 2;
    const cy = obj.y + obj.h / 2;
    rings = rings.map((r) => rotatePts(r, cx, cy, obj.rot));
  }
  return rings;
}

/** Measured bounds of a text object at its current font size. */
export function measureText(obj) {
  const raw = textRings(obj);
  if (!raw || !raw.length) return { w: 0, h: 0 };
  const bb = bbox(raw.flat());
  return { w: bb.w, h: bb.h };
}

/**
 * Cut objects become real holes in the panel. Kerf is applied the same way as for
 * structural holes: the path shrinks by half a kerf so the finished hole is nominal.
 *
 * unloop() is not optional here, and this is the layer where leaving it out
 * costs material. offsetPolygon folds the path through itself wherever a corner
 * is sharper than the offset can turn - a wing tip, a roof apex, the point of a
 * star. Nine of the bundled icons do it at the default 0.2 mm kerf. The head
 * cuts what it is given, so a self-crossing outline is gouged into the sheet as
 * drawn and the part can fall out in pieces.
 *
 * The engraved border in tag.js already guarded against this. The cut layer -
 * the one that actually severs - did not.
 */
export function cutRings(objects, kerf) {
  const k = Math.max(0, kerf) / 2;
  const out = [];
  for (const o of objects) {
    if (o.process !== 'cut') continue;
    for (const ring of objectRings(o)) {
      const ccw = isCCW(ring) ? ring : ring.slice().reverse();
      out.push(k > 0 ? unloop(offsetPolygon(ccw, -k)) : ccw);
    }
  }
  return out;
}

export { rect, bbox };
