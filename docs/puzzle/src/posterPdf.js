// Reading the customer's PDF and writing the print file.
//
// Two libraries, because they do different jobs and neither does both:
//
//   pdf.js    draws a page to a picture: for the preview, and at 300 dpi for the print
//             file. It also reports the page size and the pictures inside it.
//   pdf-lib   writes the print file: the poster's picture on a page the size of the
//             panel, and the Spot layers over it.
//
// The print file carries the poster as a 300 dpi CMYK picture, like the designer's
// Photoshop files (Boss, 11 Nov 2026). Placing the customer's page as it is kept it
// vector, but a poster made with transparency effects (the A4 job from CorelDRAW has
// up to 490 transparency groups a page) made the file slow in Acrobat and fell apart
// when CorelDRAW opened it. A browser only draws RGB, so the picture is turned back
// into CMYK before it is saved (cmykJpeg.js); black comes back as K alone.
// buildLayeredPrint can still place a page as it is, should that ever be wanted back.
//
// Both are imported only when somebody actually uploads a poster: about 2 MB that
// the ordinary puzzle tool never needs. Nothing leaves the browser.
//
// A PNG or a JPG comes in too (Boss, 17 Nov 2026). It opens as a one-page document whose
// page is the picture (PicturePage): the browser decodes and draws it, so it keeps its
// EXIF turn and colour profile, and the rest of the tool sees a page like any other.

import { pathToOps } from './exportPdf.js';
import { unionPath } from './geom/keychain.js';
import {
  pictureKind, pictureDpi, printDpi, saysPicture, looksLikePdf, pictureViewport, PICTURE_TYPES,
} from './posterFile.js';

const MM_TO_PT = 72 / 25.4;

let pdfjs = null;
function loadPdfjs() {
  if (!pdfjs) {
    pdfjs = import('../vendor/pdf.min.mjs').then((lib) => {
      lib.GlobalWorkerOptions.workerSrc = new URL('../vendor/pdf.worker.min.mjs', import.meta.url).href;
      return lib;
    });
  }
  return pdfjs;
}

/**
 * A picture as a pdf.js page: the few things the tool asks of a page (getViewport,
 * render, view, rotate), done the same way, so the preview, the print file and the
 * keychain's circle finder all take it as they are. The page is the picture, at `dpi`.
 *
 * The picture is decoded again for each drawing and let go after, rather than held: a
 * job of five A3 pictures held decoded would be 350 MB doing nothing.
 */
class PicturePage {
  constructor(blob, pxW, pxH, dpi) {
    this.blob = blob;
    this.picture = { pxW, pxH, dpi };
    this.view = [0, 0, (pxW * 72) / dpi, (pxH * 72) / dpi];
    this.rotate = 0;
    this.userUnit = 1;
  }

  getViewport({ scale = 1, rotation = this.rotate } = {}) {
    return pictureViewport(this.view[2], this.view[3], scale, rotation);
  }

  /** As pdf.js: the whole canvas white first, then `transform` and the viewport's. */
  render({ canvasContext: ctx, viewport, transform = null, background = null }) {
    const promise = (async () => {
      const bitmap = await createImageBitmap(this.blob, { imageOrientation: 'from-image' });
      ctx.save();
      try {
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.fillStyle = background || '#ffffff';
        ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
        if (transform) ctx.transform(...transform);
        ctx.transform(...viewport.transform);
        // Pixels to page points, the top row at the top of the page.
        const [, , w, hh] = this.view;
        ctx.transform(w / bitmap.width, 0, 0, -hh / bitmap.height, 0, hh);
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(bitmap, 0, 0);
      } finally {
        ctx.restore();
        bitmap.close();
      }
    })();
    return { promise, cancel() {} };
  }
}

/** A picture File as a one-page document. Rejects with code 'picture' when it will not open. */
async function openPicture(file, bytes, lib) {
  const kind = pictureKind(bytes);
  const blob = new Blob([bytes], { type: PICTURE_TYPES[kind] || file.type || '' });
  let bitmap;
  try {
    bitmap = await createImageBitmap(blob, { imageOrientation: 'from-image' });
  } catch {
    throw Object.assign(new Error('This picture does not open in this browser'), { code: 'picture' });
  }
  const { width: pxW, height: pxH } = bitmap;
  bitmap.close();
  if (!pxW || !pxH) throw Object.assign(new Error('An empty picture'), { code: 'picture' });
  const obj = new PicturePage(blob, pxW, pxH, printDpi(pictureDpi(bytes, kind)));
  return {
    name: file.name || 'poster.png',
    kind: 'picture',
    bytes,
    lib,
    doc: { numPages: 1, destroy: () => Promise.resolve() },
    pages: [{
      index: 0,
      obj,
      widthMm: obj.view[2] / MM_TO_PT,
      heightMm: obj.view[3] / MM_TO_PT,
      ticked: true,
    }],
  };
}

/**
 * Open a PDF or a picture File and read its pages' sizes. pdf.js is loaded either way:
 * the print file is read back with it.
 * @returns { name, kind: 'pdf' | 'picture', bytes, lib, doc, pages }, `bytes` the file's own
 */
export async function openPoster(file) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const lib = await loadPdfjs();
  if (pictureKind(bytes) || (saysPicture(file) && !looksLikePdf(bytes))) return openPicture(file, bytes, lib);
  // pdf.js moves the buffer it is given to its worker, leaving this one empty, and
  // the print file still needs the original bytes. So it gets a copy.
  const doc = await lib.getDocument({ data: bytes.slice(), isEvalSupported: false }).promise;
  const pages = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const obj = await doc.getPage(i);
    const vp = obj.getViewport({ scale: 1 });
    pages.push({
      index: i - 1,
      obj,
      widthMm: vp.width / MM_TO_PT,
      heightMm: vp.height / MM_TO_PT,
      ticked: true,
    });
  }
  return { name: file.name || 'poster.pdf', kind: 'pdf', bytes, lib, doc, pages };
}

/** Draw a page to a JPEG object URL, its long side `maxPx` pixels. */
export async function renderPicture(page, maxPx) {
  const base = page.obj.getViewport({ scale: 1 });
  const scale = maxPx / Math.max(base.width, base.height);
  const viewport = page.obj.getViewport({ scale });
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(viewport.width);
  canvas.height = Math.round(viewport.height);
  await page.obj.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
  const blob = await new Promise((resolve) => { canvas.toBlob(resolve, 'image/jpeg', 0.92); });
  canvas.width = 0;
  return URL.createObjectURL(blob);
}

const multiply = (m, n) => [
  m[0] * n[0] + m[2] * n[1],
  m[1] * n[0] + m[3] * n[1],
  m[0] * n[2] + m[2] * n[3],
  m[1] * n[2] + m[3] * n[3],
  m[0] * n[4] + m[2] * n[5] + m[4],
  m[1] * n[4] + m[3] * n[5] + m[5],
];

/**
 * The pictures on a page: their pixels, and the share of the page each covers.
 * Small ones (a logo, say) are left out, since they do not decide how the poster
 * looks. A poster that is entirely vector returns nothing, which is right: it has
 * no resolution to worry about.
 */
export async function pageImages(lib, page) {
  // A picture page is one picture, all of it.
  if (page.obj.picture) {
    const { pxW, pxH } = page.obj.picture;
    return [{ pxW, pxH, fracW: 1, fracH: 1 }];
  }
  const { OPS } = lib;
  const list = await page.obj.getOperatorList();
  const [x0, y0, x1, y1] = page.obj.view;
  const pageW = x1 - x0;
  const pageH = y1 - y0;
  const sideways = page.obj.rotate % 180 !== 0;
  const out = [];
  const stack = [];
  let m = [1, 0, 0, 1, 0, 0];
  for (let i = 0; i < list.fnArray.length; i++) {
    const fn = list.fnArray[i];
    const args = list.argsArray[i];
    if (fn === OPS.save) stack.push(m);
    else if (fn === OPS.restore) m = stack.pop() || m;
    else if (fn === OPS.transform) m = multiply(m, args);
    else if (fn === OPS.paintFormXObjectBegin) {
      stack.push(m);
      if (args[0]) m = multiply(m, args[0]);
    } else if (fn === OPS.paintFormXObjectEnd) m = stack.pop() || m;
    else if (fn === OPS.paintImageXObject || fn === OPS.paintInlineImageXObject) {
      const pxW = fn === OPS.paintImageXObject ? args[1] : args[0]?.width;
      const pxH = fn === OPS.paintImageXObject ? args[2] : args[0]?.height;
      if (!pxW || !pxH) continue;
      const fracW = Math.hypot(m[0], m[1]) / pageW;
      const fracH = Math.hypot(m[2], m[3]) / pageH;
      if (fracW * fracH >= 0.1) {
        out.push(sideways
          ? { pxW, pxH, fracW: fracH, fracH: fracW }
          : { pxW, pxH, fracW, fracH });
      }
    }
  }
  return out;
}

/**
 * Where every picture on a PDF page lies, big or small: boxes in mm from the page's
 * top-left as it shows (its /Rotate applied), with each one's pixels. The UV Plak tab
 * leaves these out when it looks for text to cut (Boss, 28 Nov 2026): a logo or a photo
 * is printed, never cut. A picture page is one picture and has none to leave out.
 */
export async function pageImageBoxes(lib, page) {
  if (page.obj.picture) return [];
  const { OPS } = lib;
  const list = await page.obj.getOperatorList();
  const view = page.obj.getViewport({ scale: 1 });
  const mm = 25.4 / 72;
  const out = [];
  const stack = [];
  let m = [1, 0, 0, 1, 0, 0];
  const paints = [OPS.paintImageXObject, OPS.paintInlineImageXObject, OPS.paintImageMaskXObject];
  for (let i = 0; i < list.fnArray.length; i++) {
    const fn = list.fnArray[i];
    const args = list.argsArray[i];
    if (fn === OPS.save) stack.push(m);
    else if (fn === OPS.restore) m = stack.pop() || m;
    else if (fn === OPS.transform) m = multiply(m, args);
    else if (fn === OPS.paintFormXObjectBegin) {
      stack.push(m);
      if (args[0]) m = multiply(m, args[0]);
    } else if (fn === OPS.paintFormXObjectEnd) m = stack.pop() || m;
    else if (paints.includes(fn)) {
      // An image fills the unit square of its matrix.
      const corners = [[0, 0], [1, 0], [0, 1], [1, 1]].map(([u, v]) => view.convertToViewportPoint(
        m[0] * u + m[2] * v + m[4], m[1] * u + m[3] * v + m[5],
      ));
      const xs = corners.map((c) => c[0]);
      const ys = corners.map((c) => c[1]);
      const x0 = Math.max(0, Math.min(...xs));
      const y0 = Math.max(0, Math.min(...ys));
      const x1 = Math.min(view.width, Math.max(...xs));
      const y1 = Math.min(view.height, Math.max(...ys));
      if (x1 - x0 < 0.5 || y1 - y0 < 0.5) continue;
      const pxW = fn === OPS.paintInlineImageXObject ? args[0]?.width : args[1];
      const pxH = fn === OPS.paintInlineImageXObject ? args[0]?.height : args[2];
      out.push({
        x: x0 * mm, y: y0 * mm, width: (x1 - x0) * mm, height: (y1 - y0) * mm, pxW: pxW || 0, pxH: pxH || 0,
      });
    }
  }
  return out;
}

/** The poster's resolution in the print file: the designer's Photoshop files are 300 dpi. */
export const PRINT_DPI = 300;
// A canvas this many pixels takes about 200 MB while it is drawn. A panel bigger than
// that is drawn at a lower resolution rather than not at all (A2 at 300 dpi is 34
// million; the whole 900 x 600 mm bed comes out at 240 dpi).
const MAX_PICTURE_PX = 48e6;
const MIN_PICTURE_DPI = 150;

/**
 * A canvas of this size that really draws. Browsers fail on big canvases in different
 * ways, iOS Safari by drawing nothing past about 16 million pixels, so one pixel is
 * written in the far corner and read back.
 */
function workingCanvas(width, height) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#010203';
    ctx.fillRect(width - 1, height - 1, 1, 1);
    const [r, g, b] = ctx.getImageData(width - 1, height - 1, 1, 1).data;
    if (r === 1 && g === 2 && b === 3) return { canvas, ctx };
  }
  canvas.width = 0;
  return null;
}

/**
 * One page drawn as the picture the print file carries.
 *
 * @param page a pdf.js page
 * @param art  where the whole page goes, mm from the top-left of the print page
 * @param box  the part of it that is printed, same units: the picture is exactly this
 * @param turn how far the page turns clockwise on top of its own /Rotate, 0 or a
 *             multiple of 90
 * @returns { jpg: Uint8Array, dpi }: a CMYK JPEG, see cmykJpeg.js
 */
export async function pagePicture(page, art, box, turn = 0) {
  const rotation = (((page.rotate + turn) % 360) + 360) % 360;
  const view = page.getViewport({ scale: 1, rotation });
  const squareInches = (box.width / 25.4) * (box.height / 25.4);
  let surface = null;
  let dpi = Math.min(PRINT_DPI, Math.sqrt(MAX_PICTURE_PX / squareInches));
  let width = 0;
  let height = 0;
  for (; dpi >= MIN_PICTURE_DPI && !surface; dpi *= 0.8) {
    width = Math.max(1, Math.round((box.width / 25.4) * dpi));
    height = Math.max(1, Math.round((box.height / 25.4) * dpi));
    surface = workingCanvas(width, height);
  }
  if (!surface) throw Object.assign(new Error('The print picture is too big for this browser'), { code: 'canvas' });
  // pdf.js lays the page out at one pixel a point; this stretches it over the artwork
  // and moves it so the box starts at the canvas corner.
  const pxX = width / box.width;
  const pxY = height / box.height;
  let pixels;
  try {
    await page.render({
      canvasContext: surface.ctx,
      viewport: view,
      transform: [(art.width * pxX) / view.width, 0, 0, (art.height * pxY) / view.height,
        (art.x - box.x) * pxX, (art.y - box.y) * pxY],
      // The print intent draws without waiting for animation frames, which a tab in
      // the background never gets.
      intent: 'print',
      annotationMode: 0,   // AnnotationMode.DISABLE: the page's own drawing only
    }).promise;
    pixels = surface.ctx.getImageData(0, 0, width, height).data;
  } finally {
    surface.canvas.width = 0;
  }
  const jpg = await toCmykJpeg(pixels, width, height);
  return { jpg, dpi: Math.round(width / (box.width / 25.4)) };
}

// ---- the Keychain UV tab (Boss, 17 Nov 2026) --------------------------------------

/**
 * A page drawn whole as pixels, its long side `maxPx`: what the keychain tab looks at to
 * find the design's circle and its border line.
 * @returns { rgba, width, height, mmPerPx }
 */
export async function pageRaster(page, maxPx) {
  const view = page.getViewport({ scale: 1 });
  const scale = maxPx / Math.max(view.width, view.height);
  const viewport = page.getViewport({ scale });
  const surface = workingCanvas(Math.round(viewport.width), Math.round(viewport.height));
  if (!surface) throw Object.assign(new Error('No canvas'), { code: 'canvas' });
  try {
    await page.render({
      canvasContext: surface.ctx, viewport, intent: 'print', annotationMode: 0,
    }).promise;
    const { width, height } = surface.canvas;
    return {
      rgba: surface.ctx.getImageData(0, 0, width, height).data, width, height, mmPerPx: 25.4 / 72 / scale,
    };
  } finally {
    surface.canvas.width = 0;
  }
}

/**
 * One keychain's picture: a square the size of the keychain and its bleed, the design's
 * circle filling the keychain, and the bleed finished as geom/keychain.js says (made from
 * the edge colour where the design has none, a thin border line taken out).
 *
 * @param page pdf.js page
 * @param o    { circle: { cx, cy, r } mm on the page, sizeMm, bleedMm, reachMm, kind,
 *             border, removeBorder }: reachMm is half the picture's side, past the bleed
 *             where a hook stands out
 * @param mode 'print': a 300 dpi CMYK JPEG, { jpg, dpi }. 'preview': an RGB JPEG of
 *             `px` pixels as an object URL, { url }.
 */
export async function keychainPicture(page, o, { mode = 'print', px: previewPx = 900 } = {}) {
  const side = 2 * (o.reachMm ?? o.sizeMm / 2 + o.bleedMm);
  const px = mode === 'print' ? Math.round((side / 25.4) * PRINT_DPI) : previewPx;
  const surface = workingCanvas(px, px);
  if (!surface) throw Object.assign(new Error('No canvas'), { code: 'canvas' });
  let pixels;
  try {
    const view = page.getViewport({ scale: 1 });
    const scale = (o.sizeMm / 2) / o.circle.r;     // keychain mm per page mm
    const perMm = px / side;
    const k = (25.4 / 72) * scale * perMm;          // canvas pixels per page point
    await page.render({
      canvasContext: surface.ctx,
      viewport: view,
      transform: [k, 0, 0, k, px / 2 - o.circle.cx * scale * perMm, px / 2 - o.circle.cy * scale * perMm],
      intent: 'print',
      annotationMode: 0,
    }).promise;
    const image = surface.ctx.getImageData(0, 0, px, px);
    pixels = image.data;
    const { bleedPlan, bleedOut } = await import('./geom/keychain.js');
    bleedOut(pixels, px, px, bleedPlan({ ...o, px }));
    if (mode !== 'print') {
      surface.ctx.putImageData(image, 0, 0);
      const blob = await new Promise((resolve) => { surface.canvas.toBlob(resolve, 'image/jpeg', 0.9); });
      return { url: URL.createObjectURL(blob) };
    }
  } finally {
    surface.canvas.width = 0;
  }
  return { jpg: await toCmykJpeg(pixels, px, px), dpi: PRINT_DPI };
}

// ---- RGB pixels to a CMYK JPEG, in a worker ------------------------------------

const JPEG_QUALITY = 92;
let workerReady = null;
let nextJob = 0;
const jobs = new Map();

/**
 * The worker, once it has said it is running, or null where none can start (an old
 * browser, or a module that would not load): then the work is done on the page.
 */
function cmykWorker() {
  if (!workerReady) {
    workerReady = new Promise((resolve) => {
      let worker;
      try {
        worker = new Worker(new URL('./cmykWorker.js', import.meta.url), { type: 'module' });
      } catch {
        resolve(null);
        return;
      }
      const give = (value) => { clearTimeout(timer); resolve(value); };
      const timer = setTimeout(() => { worker.terminate(); give(null); }, 15000);
      worker.onerror = () => { worker.terminate(); give(null); };
      worker.onmessage = ({ data }) => {
        if (!data.ready) return;
        worker.onmessage = ({ data: done }) => {
          const job = jobs.get(done.id);
          if (!job) return;
          jobs.delete(done.id);
          if (done.error) job.reject(new Error(done.error));
          else job.resolve(new Uint8Array(done.jpg));
        };
        worker.onerror = () => {
          for (const job of jobs.values()) job.reject(new Error('The CMYK worker stopped'));
          jobs.clear();
          workerReady = null;
        };
        give(worker);
      };
      worker.postMessage({ ping: true });
    });
  }
  return workerReady;
}

async function toCmykJpeg(pixels, width, height) {
  const worker = await cmykWorker();
  if (!worker) {
    const { rgbaToCmyk, encodeCmykJpeg } = await import('./cmykJpeg.js');
    return encodeCmykJpeg(rgbaToCmyk(pixels, width * height), width, height, JPEG_QUALITY);
  }
  const id = ++nextJob;
  return new Promise((resolve, reject) => {
    jobs.set(id, { resolve, reject });
    worker.postMessage({ id, rgba: pixels.buffer, width, height, quality: JPEG_QUALITY }, [pixels.buffer]);
  });
}

const pdfLib = () => import('../vendor/pdf-lib.esm.min.js');

/**
 * The layers of the print file. FlexiPRINT prints white from the spot colours named
 * Spot 1 and Spot 2, so these two must be spelled exactly so (Boss, 5 Nov 2026).
 * They used to be added by hand in Photoshop before every print.
 */
export const ART_LAYER = 'Artwork';
export const SPOT_LAYERS = ['Spot 1', 'Spot 2'];

// How a Spot looks on a screen that does not separate inks: red, tint t giving
// (1, 1-t, 1-t) in CalRGB. These are the exact function and colour space in the
// designer's Photoshop samples, which FlexiPRINT reads. Only the name turns into white.
const SPOT_SCREEN_COLOUR = '{dup dup -1.000000 mul 1.0 add 3 1 roll -1.000000 mul 1.0 add 3 1 roll 0.000000 mul 1.0 add 3 1 roll}';
const CAL_RGB = {
  BlackPoint: [0, 0, 0],
  Gamma: [2.2, 2.2, 2.2],
  Matrix: [0.412384, 0.212646, 0.0193176, 0.35759, 0.715164, 0.119171, 0.180496, 0.0721893, 0.950546],
  WhitePoint: [0.950455, 1, 1.08905],
};

/** Parse the customer's PDF for placing its pages. Throws if it is encrypted. */
export async function openForPrint(bytes) {
  const { PDFDocument } = await pdfLib();
  return PDFDocument.load(bytes, { updateMetadata: false });
}

/**
 * The print file: a page the size of the panel with the poster in its place.
 * Lay the panel on the printer bed the same way round as the page and everything
 * lines up. No cut lines on it, and nothing else that could get printed.
 *
 * Three PDF layers: the artwork, and Spot 1 and Spot 2, each a solid rectangle exactly
 * the size of the artwork. They stop at the artwork rather than filling the page,
 * because the frame around it takes no white.
 *
 * FlexiPRINT takes its white from the spot colours, not from the PDF layers: it splits
 * the page into one plate per ink, and the plates named Spot 1 and Spot 2 become white
 * (the designer's Photoshop samples, 11 Nov 2026). So each Spot rectangle is painted in
 * a spot colour of its name, and overprint keeps every plate whole: whatever is painted
 * later leaves the plates it does not use alone.
 *
 * Until 11 Nov 2026 the Spots were painted under the poster with no overprint, and the
 * poster erased them: both plates came out empty and Flexi found no white.
 *
 * Now, as Photoshop saves spot channels, the Spots go under the poster and the poster
 * overprints them. Any viewer then shows the poster (Boss did not want two red boxes),
 * and the plates come out whole. That holds for the tool's own pictures. A customer's
 * page placed as it is can turn overprint off again inside itself (CorelDRAW does) and
 * erase the white, so with any such page the Spots go on top instead.
 *
 * The artwork layer starts with an opaque no-ink rectangle, so the layer covers its
 * whole box even where the poster is bare paper, which the layer check relies on.
 *
 * @param source a document from openForPrint
 * @param plan   result of planPoster
 */
export function buildPrintPdf(source, pageIndex, plan, opts = {}) {
  return buildLayeredPrint(plan.panel, [{
    doc: source, pageIndex, art: plan.art, box: plan.art, turn: opts.turn || 0,
  }], opts);
}

/**
 * The reference cards' print file (Boss, 11 Nov 2026): one sheet, every card's
 * picture clipped to the card and its bleed, and the same three layers. The Spot
 * white fills each card's bleed box, not the sheet: the frame stays clear.
 *
 * @param layout  result of layoutCards
 * @param resolve (page index in the job) => { doc, pageIndex, turn }: where that page's
 *                picture comes from, and how far to turn it
 */
export function buildCardPrintPdf(layout, resolve, opts = {}) {
  return buildLayeredPrint(layout.sheet, layout.cards.map((c) => ({
    ...resolve(c.index), art: c.art, box: c.clip,
  })), { title: 'Kad rujukan A6', ...opts });
}

/**
 * One page with pictures placed on it, in three layers.
 *
 * @param size       { width, height } of the page, mm
 * @param placements [{ jpg, box }]: a picture from pagePicture, laid exactly over `box`,
 *                   { x, y, width, height } in mm from the page's top-left. This is
 *                   what the tool writes.
 *                   Or [{ doc, pageIndex, art, box, turn }] to place a page as it is:
 *                   `doc` is a document from openForPrint, so one page can carry pages
 *                   from several PDFs, `art` is where the page goes and `box` what is
 *                   printed of it, and `turn` how far it is turned clockwise, 0 or a
 *                   multiple of 90. A page bigger than its box is clipped to it.
 *                   Either way the Spot white and the no-ink base fill `box`.
 *                   A picture may also carry `shape`: { cx, cy, r, tab, hole }, mm, a disc
 *                   with a hole through it, and a smaller disc `tab` standing out over its
 *                   edge for a hook (the Keychain UV tab, Boss, 17 Nov 2026). Then the
 *                   picture is clipped to it, and the white and the base fill it instead of
 *                   the box: no ink outside the bleed, none in the hole.
 *                   Placements given the same jpg share one copy of it in the file.
 */
export async function buildLayeredPrint(size, placements, { title } = {}) {
  const {
    PDFDocument, PDFName, PDFNumber, PDFOperator, PDFString, degrees,
  } = await pdfLib();
  const out = await PDFDocument.create();
  const pageW = size.width * MM_TO_PT;
  const pageH = size.height * MM_TO_PT;
  const page = out.addPage([pageW, pageH]);

  const ctx = out.context;
  const name = (text) => PDFName.of(text);
  const op = (operator, ...args) => PDFOperator.of(operator, args);
  const layer = (text) => ctx.register(ctx.obj({ Type: 'OCG', Name: PDFString.of(text) }));

  const artLayer = layer(ART_LAYER);
  const spots = SPOT_LAYERS.map((text, i) => ({ text, key: `Spot${i + 1}`, ref: layer(text) }));
  // The tool's own pictures overprint the Spots from above; a page placed as it is
  // cannot be trusted to, so then the Spots go on top (see buildPrintPdf).
  const spotsUnder = placements.every((p) => p.jpg);
  // Acrobat's layers panel lists them top first.
  const spotRefs = spots.map((s) => s.ref);
  out.catalog.set(name('OCProperties'), ctx.obj({
    OCGs: [artLayer, ...spotRefs],
    D: { Name: PDFString.of('Layers'), BaseState: 'ON', Order: spotsUnder ? [artLayer, ...spotRefs] : [...spotRefs, artLayer] },
  }));

  const screenColour = ctx.register(ctx.stream(SPOT_SCREEN_COLOUR, {
    FunctionType: 4, Domain: [0, 1], Range: [0, 1, 0, 1, 0, 1],
  }));
  const calRgb = ctx.obj(['CalRGB', ctx.obj(CAL_RGB)]);
  const resources = page.node.normalizedEntries().Resources;
  resources.set(name('ColorSpace'), ctx.obj(Object.fromEntries(
    spots.map((s) => [s.key, ctx.register(ctx.obj(['Separation', s.text, calRgb, screenColour]))]),
  )));
  resources.set(name('ExtGState'), ctx.obj({
    Overprint: ctx.obj({ Type: 'ExtGState', OP: true, op: true }),
  }));
  resources.set(name('Properties'), ctx.obj({
    Art: artLayer,
    ...Object.fromEntries(spots.map((s) => [s.key, s.ref])),
  }));

  // mm from the top-left -> points from the bottom-left
  const rect = (r) => op('re', PDFNumber.of(r.x * MM_TO_PT), PDFNumber.of(pageH - (r.y + r.height) * MM_TO_PT),
    PDFNumber.of(r.width * MM_TO_PT), PDFNumber.of(r.height * MM_TO_PT));
  const same = (a, b) => a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;

  // A circle as four curves, mm from the top-left, in page points.
  const KAPPA = 0.5522847498;
  const num = (v) => PDFNumber.of(Math.round(v * 1000) / 1000);
  const circle = (cMm, rMm) => {
    const x = cMm.cx * MM_TO_PT;
    const y = pageH - cMm.cy * MM_TO_PT;
    const r = rMm * MM_TO_PT;
    const k = r * KAPPA;
    return [
      op('m', num(x), num(y + r)),
      op('c', num(x + k), num(y + r), num(x + r), num(y + k), num(x + r), num(y)),
      op('c', num(x + r), num(y - k), num(x + k), num(y - r), num(x), num(y - r)),
      op('c', num(x - k), num(y - r), num(x - r), num(y - k), num(x - r), num(y)),
      op('c', num(x - r), num(y + k), num(x - k), num(y + r), num(x), num(y + r)),
      op('h'),
    ];
  };
  // A hook's outline, the disc and its tab as one path, in page points.
  const outline = (s) => pathToOps(unionPath(s, s.tab), size.height).map((line) => {
    const parts = line.split(' ');
    const name = parts.pop();
    return op(name, ...parts.map((v) => PDFNumber.of(Number(v))));
  });
  // The disc (and its hook) and the hole together; filled or clipped even-odd, the hole
  // stays empty.
  const shapePath = (s) => [
    ...(s.tab ? outline(s) : circle(s, s.r)),
    ...(s.hole ? circle(s.hole, s.hole.r) : []),
  ];
  const fillArea = (p) => (p.shape ? [...shapePath(p.shape), op('f*')] : [rect(p.box), op('f')]);

  // Each Spot with overprint on, so Spot 1 leaves Spot 2's plate whole, and either one
  // painted over the poster leaves the poster's plates whole.
  const paintSpots = () => {
    for (const s of [...spots].reverse()) {
      page.pushOperators(
        op('BDC', name('OC'), name(s.key)),
        op('q'),
        op('gs', name('Overprint')),
        op('cs', name(s.key)),
        op('scn', PDFNumber.of(1)),
      );
      for (const p of placements) page.pushOperators(...fillArea(p));
      page.pushOperators(op('Q'), op('EMC'));
    }
  };

  // Painted from the bottom up: Spot 2, Spot 1, then the poster over them, overprinting;
  // or with a page placed as it is, the poster first and the Spots over it.
  if (spotsUnder) paintSpots();
  page.pushOperators(op('BDC', name('OC'), name('Art')), op('q'));
  if (spotsUnder) page.pushOperators(op('gs', name('Overprint')));
  const noInkBase = (p) => page.pushOperators(
    op('k', PDFNumber.of(0), PDFNumber.of(0), PDFNumber.of(0), PDFNumber.of(0)),
    ...fillArea(p),
  );
  const embedded = new Map();   // doc -> page index -> embedded page, each one once
  const pictures = new Map();   // jpg -> embedded picture, each one once
  for (const p of placements) {
    if (p.jpg) {
      if (!pictures.has(p.jpg)) pictures.set(p.jpg, await out.embedJpg(p.jpg));
      const picture = pictures.get(p.jpg);
      page.pushOperators(op('q'));
      if (p.shape) page.pushOperators(...shapePath(p.shape), op('W*'), op('n'));
      noInkBase(p);
      page.drawImage(picture, {
        x: p.box.x * MM_TO_PT,
        y: pageH - (p.box.y + p.box.height) * MM_TO_PT,
        width: p.box.width * MM_TO_PT,
        height: p.box.height * MM_TO_PT,
      });
      page.pushOperators(op('Q'));
      continue;
    }
    const srcPage = p.doc.getPage(p.pageIndex);
    const crop = srcPage.getCropBox();
    if (!embedded.has(p.doc)) embedded.set(p.doc, new Map());
    const embeddedPages = embedded.get(p.doc);
    if (!embeddedPages.has(p.pageIndex)) {
      embeddedPages.set(p.pageIndex, await out.embedPage(srcPage, {
        left: crop.x,
        bottom: crop.y,
        right: crop.x + crop.width,
        top: crop.y + crop.height,
      }));
    }
    page.pushOperators(op('q'));
    if (!same(p.box, p.art)) page.pushOperators(rect(p.box), op('W'), op('n'));
    noInkBase(p);

    const artW = p.art.width * MM_TO_PT;
    const artH = p.art.height * MM_TO_PT;
    const left = p.art.x * MM_TO_PT;
    const bottom = pageH - p.art.y * MM_TO_PT - artH;
    // A page's /Rotate is an instruction to viewers, and an embedded page does not
    // carry it across, so the turn has to be applied here, with any turn the job
    // asks for on top. Each case puts the turned page's lower-left corner back on
    // the artwork's lower-left corner.
    const turn = (((srcPage.getRotation().angle + (p.turn || 0)) % 360) + 360) % 360;
    const sideways = turn === 90 || turn === 270;
    const xScale = artW / (sideways ? crop.height : crop.width);
    const yScale = artH / (sideways ? crop.width : crop.height);
    const place = {
      0: { x: left, y: bottom, angle: 0 },
      90: { x: left, y: bottom + artH, angle: -90 },
      180: { x: left + artW, y: bottom + artH, angle: 180 },
      270: { x: left + artW, y: bottom, angle: 90 },
    }[turn] || { x: left, y: bottom, angle: 0 };

    page.drawPage(embeddedPages.get(p.pageIndex), {
      x: place.x,
      y: place.y,
      xScale: sideways ? yScale : xScale,
      yScale: sideways ? xScale : yScale,
      rotate: degrees(place.angle),
    });
    page.pushOperators(op('Q'));
  }
  page.pushOperators(op('Q'), op('EMC'));
  if (!spotsUnder) paintSpots();

  out.setTitle(title || 'Puzzle print file');
  out.setCreator('SifuLaser Puzzle Generator');
  out.setProducer('SifuLaser Puzzle Generator');
  // Object streams stay on (the default), which also tells /shared/brand-core.js
  // to leave this file alone. The cut file carries "by sifulaser.com" in a band
  // below its parts, which is harmless on a sheet that gets cut. On this file the
  // same band would be printed.
  return out.save();
}
