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
 * What the file holds, against what was asked for.
 *
 * @param found { names: string[], boxes: { [layer]: { x, y, w, h, fill } } }, boxes in mm
 *              from the top-left of the page
 * @param tolMm how far a box may be off, which is a pixel or two of the reading
 * @returns [{ ok, text }]
 */
export function judgeLayers(found, plan, tolMm = 1) {
  const want = [ART_LAYER, ...SPOT_LAYERS];
  const { names, boxes } = found;
  const out = [];

  if (names.length === want.length && want.every((n, i) => names[i] === n)) {
    out.push({ ok: true, text: `${want.length} layer, nama tepat: ${want.join(', ')}` });
  } else {
    const missing = want.filter((n) => !names.includes(n));
    out.push({
      ok: false,
      text: missing.length
        ? `Layer tiada atau salah eja: ${missing.join(', ')}. Dalam file: ${names.join(', ') || 'tiada layer'}`
        : `Susunan layer lain dari biasa: ${names.join(', ')}`,
    });
  }

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
 * @returns { names, boxes, layers: { [layer]: { url } }, tolMm }
 *          url is a PNG of the whole page with only that layer, tinted for Spot layers
 */
export async function inspectPrint(lib, bytes) {
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
    for (const look of LAYER_LOOK) {
      const id = idOf.get(look.name);
      if (id) {
        const { canvas, ctx } = await renderAlone(doc, page, groups, id, viewport);
        const box = opaqueBox(ctx.getImageData(0, 0, canvas.width, canvas.height).data, canvas.width, canvas.height);
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
    return { names, boxes, layers, tolMm: 2 * mmPerPx };
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
