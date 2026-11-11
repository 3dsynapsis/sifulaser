// The print file, read back: which layers it has, what each one holds, and a picture
// of each for the layer switches in the preview (Boss, 6 Nov 2026).
//
// Nothing here is drawn from the settings. It all comes from the PDF that Export would
// hand over, opened again with PDF.js, a reader unrelated to the one that wrote it.
// So a layer that is missing, misspelt or the wrong size shows up here, before the
// file goes to FlexiPrint.
//
// The colours are for the eye only and never reach the file. A white-ink layer drawn
// white on a white screen would be invisible, and two of them indistinguishable.

import { ART_LAYER, SPOT_LAYERS } from './posterPdf.js';

/** Top to bottom, as in the file. */
export const LAYER_LOOK = [
  { name: ART_LAYER, colour: null, role: 'Layer normal, warna asal' },
  { name: SPOT_LAYERS[0], colour: '#e6007e', role: 'White, ditunjuk magenta' },
  { name: SPOT_LAYERS[1], colour: '#00a0e9', role: 'White, ditunjuk cyan' },
];

const RENDER_PX = 1400;
const r1 = (v) => Math.round(v * 10) / 10;
const size = (w, h) => `${r1(w)} x ${r1(h)} mm`;

/**
 * Where a layer actually paints: the box around every pixel more than half opaque,
 * and how much of that box is painted. A solid rectangle fills all of it.
 */
export function opaqueBox(rgba, width, height) {
  let x0 = width;
  let y0 = height;
  let x1 = -1;
  let y1 = -1;
  let count = 0;
  for (let y = 0; y < height; y++) {
    const row = y * width * 4;
    for (let x = 0; x < width; x++) {
      if (rgba[row + x * 4 + 3] > 127) {
        count++;
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  if (x1 < 0) return null;
  const w = x1 - x0 + 1;
  const h = y1 - y0 + 1;
  return { x: x0, y: y0, w, h, fill: count / (w * h) };
}

/**
 * How much of each area a layer paints, and how much it paints outside them all.
 * Areas are in pixels; each is read a pixel inside its edge, and "outside" a pixel
 * beyond it, so a soft edge counts for neither.
 * @returns { inside: [fraction], outside: fraction of everything painted }
 */
export function coverage(rgba, width, height, areas) {
  const inside = areas.map(() => ({ hit: 0, all: 0 }));
  let painted = 0;
  let stray = 0;
  for (let y = 0; y < height; y++) {
    const row = y * width * 4;
    for (let x = 0; x < width; x++) {
      const on = rgba[row + x * 4 + 3] > 127;
      if (on) painted++;
      let near = false;
      for (let i = 0; i < areas.length; i++) {
        const a = areas[i];
        if (x >= a.x - 1 && x < a.x + a.w + 1 && y >= a.y - 1 && y < a.y + a.h + 1) {
          near = true;
          if (x >= a.x + 1 && x < a.x + a.w - 1 && y >= a.y + 1 && y < a.y + a.h - 1) {
            inside[i].all++;
            if (on) inside[i].hit++;
          }
        }
      }
      if (on && !near) stray++;
    }
  }
  return {
    inside: inside.map((s) => (s.all ? s.hit / s.all : 0)),
    outside: painted ? stray / painted : 0,
  };
}

const namesLine = (names) => {
  const want = [ART_LAYER, ...SPOT_LAYERS];
  if (names.length === want.length && want.every((n, i) => names[i] === n)) {
    return { ok: true, text: `${want.length} layer, nama tepat: ${want.join(', ')}` };
  }
  const missing = want.filter((n) => !names.includes(n));
  return {
    ok: false,
    text: missing.length
      ? `Layer tiada atau salah eja: ${missing.join(', ')}. Dalam file: ${names.join(', ') || 'tiada layer'}`
      : `Susunan layer lain dari biasa: ${names.join(', ')}`,
  };
};

/**
 * The reference cards' print file, against its layout: every layer must fill every
 * card's bleed box and paint nothing on the frame.
 * @param found from inspectPrint, given the cards' clip boxes as areas
 */
export function judgeCards(found, layout) {
  const out = [namesLine(found.names)];
  const n = layout.cards.length;
  const clip = layout.cards[0].clip;
  for (const name of [ART_LAYER, ...SPOT_LAYERS]) {
    const cov = found.coverage?.[name];
    const what = name === ART_LAYER ? 'gambar' : 'white';
    if (!cov) {
      out.push({ ok: false, text: `${name} kosong` });
      continue;
    }
    const thin = cov.inside.map((f, i) => (f < 0.98 ? i + 1 : 0)).filter(Boolean);
    if (thin.length) {
      out.push({ ok: false, text: `${name} tak penuh pada kad ${thin.join(', ')}` });
    } else if (cov.outside > 0.005) {
      out.push({ ok: false, text: `${name} ada ${what} di luar kad, atas frame` });
    } else {
      out.push({ ok: true, text: `${name} penuh pada ${n} kad, ${size(clip.width, clip.height)} setiap satu` });
    }
  }
  return out;
}

/**
 * What the file holds, against what was asked for.
 *
 * @param found { names: string[], boxes: { [layer]: { x, y, w, h, fill } } }, boxes in mm
 *              from the top-left of the page
 * @param tolMm how far a box may be off, which is a pixel or two of the reading
 * @returns [{ ok, text }]
 */
export function judgeLayers(found, plan, tolMm = 1) {
  const { names, boxes } = found;
  const out = [namesLine(names)];

  const { art } = plan;
  const near = (a, b) => Math.abs(a - b) <= tolMm;
  const inPlace = (b) => near(b.x, art.x) && near(b.y, art.y) && near(b.w, art.width) && near(b.h, art.height);

  const artBox = boxes[ART_LAYER];
  if (!artBox) out.push({ ok: false, text: 'Artwork kosong' });
  else if (!inPlace(artBox)) {
    out.push({ ok: false, text: `Artwork ${size(artBox.w, artBox.h)}, sepatutnya ${size(art.width, art.height)}` });
  } else {
    out.push({ ok: true, text: `Artwork ${size(art.width, art.height)}, ${art.x} mm dari kiri dan ${art.y} mm dari atas` });
  }

  for (const name of SPOT_LAYERS) {
    const b = boxes[name];
    if (!b) {
      out.push({ ok: false, text: `${name} kosong, jadi tiada white` });
    } else if (!inPlace(b)) {
      out.push({ ok: false, text: `${name} ${size(b.w, b.h)}, tak sama dengan artwork ${size(art.width, art.height)}` });
    } else if (b.fill < 0.99) {
      out.push({ ok: false, text: `${name} tak penuh, cuma ${Math.round(b.fill * 100)}%` });
    } else {
      out.push({ ok: true, text: `${name} penuh ${size(art.width, art.height)}, sama dengan artwork` });
    }
  }
  return out;
}

/** One layer alone, on a transparent page. */
async function renderAlone(doc, page, groups, id, viewport) {
  const config = await doc.getOptionalContentConfig({ intent: 'print' });
  for (const other of Object.keys(groups)) config.setVisibility(other, other === id);
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(viewport.width);
  canvas.height = Math.round(viewport.height);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  // The print intent draws without waiting for animation frames, which a tab in the
  // background never gets.
  await page.render({
    canvasContext: ctx,
    viewport,
    intent: 'print',
    background: 'rgba(0,0,0,0)',
    optionalContentConfigPromise: Promise.resolve(config),
  }).promise;
  return { canvas, ctx };
}

/**
 * Open a print file and read each layer.
 * @param lib   the PDF.js module
 * @param bytes the PDF; handed to PDF.js, so the caller must not use it afterwards
 * @param areas optional [{ x, y, width, height }] in mm: also measure how much of each
 *              every layer fills, and how much it paints outside them
 * @returns { names, boxes, coverage, layers: { [layer]: { url } }, tolMm }
 *          url is a PNG of the whole page with only that layer, tinted for Spot layers
 */
export async function inspectPrint(lib, bytes, areas = null) {
  const doc = await lib.getDocument({ data: bytes, isEvalSupported: false }).promise;
  const layers = {};
  try {
    const page = await doc.getPage(1);
    const config = await doc.getOptionalContentConfig({ intent: 'print' });
    const groups = config.getGroups() || {};
    const names = Object.values(groups).map((g) => g.name);
    const idOf = new Map(Object.entries(groups).map(([id, g]) => [g.name, id]));
    const base = page.getViewport({ scale: 1 });
    const scale = RENDER_PX / Math.max(base.width, base.height);
    const viewport = page.getViewport({ scale });
    const mmPerPx = 25.4 / 72 / scale;
    const boxes = {};
    const covered = {};
    const pxAreas = areas && areas.map((a) => ({
      x: a.x / mmPerPx, y: a.y / mmPerPx, w: a.width / mmPerPx, h: a.height / mmPerPx,
    }));
    for (const look of LAYER_LOOK) {
      const id = idOf.get(look.name);
      if (id) {
        const { canvas, ctx } = await renderAlone(doc, page, groups, id, viewport);
        const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
        const box = opaqueBox(pixels, canvas.width, canvas.height);
        if (pxAreas) covered[look.name] = coverage(pixels, canvas.width, canvas.height, pxAreas);
        if (box) {
          boxes[look.name] = {
            x: box.x * mmPerPx, y: box.y * mmPerPx, w: box.w * mmPerPx, h: box.h * mmPerPx, fill: box.fill,
          };
        }
        if (look.colour) {
          ctx.globalCompositeOperation = 'source-in';
          ctx.fillStyle = look.colour;
          ctx.fillRect(0, 0, canvas.width, canvas.height);
        }
        const blob = await new Promise((resolve) => { canvas.toBlob(resolve, 'image/png'); });
        layers[look.name] = { url: URL.createObjectURL(blob) };
        canvas.width = 0;
      }
    }
    return {
      names, boxes, coverage: covered, layers, tolMm: 2 * mmPerPx,
    };
  } catch (err) {
    releaseLayers(layers);
    throw err;
  } finally {
    doc.destroy();
  }
}

export function releaseLayers(layers) {
  for (const layer of Object.values(layers || {})) URL.revokeObjectURL(layer.url);
}
