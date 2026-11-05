// Reading the customer's PDF and writing the print file.
//
// Two libraries, because they do different jobs and neither does both:
//
//   pdf.js    draws a page to a picture for the preview, and reports the page size
//             and the pictures inside it.
//   pdf-lib   places the customer's page, untouched, on a new page for the printer.
//             Their vector artwork stays vector and their images keep every pixel,
//             so the print is as sharp as the file they supplied. Rendering the
//             page to a picture first would throw that away.
//
// Both are imported only when somebody actually uploads a poster: about 2 MB that
// the ordinary puzzle tool never needs. Nothing leaves the browser.

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

/** Open a PDF File and read its pages' sizes. */
export async function openPoster(file) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const lib = await loadPdfjs();
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
  return { name: file.name || 'poster.pdf', bytes, lib, doc, pages };
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

const pdfLib = () => import('../vendor/pdf-lib.esm.min.js');

/**
 * The layers of the print file, top to bottom. FlexiPRINT prints a layer in white
 * going by its name, so these two must be spelled exactly so (Boss, 5 Nov 2026).
 * They used to be added by hand in Photoshop before every print.
 */
export const ART_LAYER = 'Artwork';
export const SPOT_LAYERS = ['Spot 1', 'Spot 2'];

/** Parse the customer's PDF for placing its pages. Throws if it is encrypted. */
export async function openForPrint(bytes) {
  const { PDFDocument } = await pdfLib();
  return PDFDocument.load(bytes, { updateMetadata: false });
}

/**
 * The print file: a page the size of the clear panel with the poster in its place.
 * Lay the panel on the printer bed the same way round as the page and everything
 * lines up. No cut lines on it, and nothing else that could get printed.
 *
 * Three PDF layers: the artwork on top, then Spot 1 and Spot 2, each a solid rectangle
 * exactly the size of the artwork. They stop at the artwork rather than filling the
 * page, because the clear frame around it takes no white.
 *
 * Each Spot rectangle is also painted in a spot colour of the same name. Flexi splits
 * a layered PDF by layer, and then the colour is only a marker: 100% black, the way a
 * spot channel marks full coverage. It must never reach the plate as black ink, so the
 * artwork layer starts with an opaque no-ink rectangle. A poster with bare paper in it
 * (most vector PDFs) then still looks right in any viewer, and a RIP that ignored the
 * layers altogether would print the artwork alone, not a black panel.
 *
 * @param source a document from openForPrint
 * @param plan   result of planPoster
 */
export async function buildPrintPdf(source, pageIndex, plan, { title } = {}) {
  const {
    PDFDocument, PDFName, PDFNumber, PDFOperator, PDFString, degrees,
  } = await pdfLib();
  const out = await PDFDocument.create();
  const srcPage = source.getPage(pageIndex);
  const box = srcPage.getCropBox();
  const embedded = await out.embedPage(srcPage, {
    left: box.x,
    bottom: box.y,
    right: box.x + box.width,
    top: box.y + box.height,
  });

  const panelW = plan.panel.width * MM_TO_PT;
  const panelH = plan.panel.height * MM_TO_PT;
  const page = out.addPage([panelW, panelH]);

  const artW = plan.art.width * MM_TO_PT;
  const artH = plan.art.height * MM_TO_PT;
  const left = plan.art.x * MM_TO_PT;
  const bottom = panelH - plan.art.y * MM_TO_PT - artH;

  const ctx = out.context;
  const name = (text) => PDFName.of(text);
  const op = (operator, ...args) => PDFOperator.of(operator, args);
  const layer = (text) => ctx.register(ctx.obj({ Type: 'OCG', Name: PDFString.of(text) }));

  const artLayer = layer(ART_LAYER);
  const spots = SPOT_LAYERS.map((text, i) => ({ text, key: `Spot${i + 1}`, ref: layer(text) }));
  const panelOrder = [artLayer, ...spots.map((s) => s.ref)];
  out.catalog.set(name('OCProperties'), ctx.obj({
    OCGs: panelOrder,
    D: { Name: PDFString.of('Layers'), BaseState: 'ON', Order: panelOrder },
  }));

  const marker = ctx.register(ctx.obj({
    FunctionType: 2, Domain: [0, 1], C0: [0, 0, 0, 0], C1: [0, 0, 0, 1], N: 1,
  }));
  const resources = page.node.normalizedEntries().Resources;
  resources.set(name('ColorSpace'), ctx.obj(Object.fromEntries(
    spots.map((s) => [s.key, ['Separation', s.text, 'DeviceCMYK', marker]]),
  )));
  resources.set(name('Properties'), ctx.obj({
    Art: artLayer,
    ...Object.fromEntries(spots.map((s) => [s.key, s.ref])),
  }));

  const artRect = () => op('re', PDFNumber.of(left), PDFNumber.of(bottom), PDFNumber.of(artW), PDFNumber.of(artH));

  // Painted from the bottom up, so the last Spot goes first and the artwork last.
  for (const s of [...spots].reverse()) {
    page.pushOperators(
      op('BDC', name('OC'), name(s.key)),
      op('q'),
      op('cs', name(s.key)),
      op('scn', PDFNumber.of(1)),
      artRect(),
      op('f'),
      op('Q'),
      op('EMC'),
    );
  }
  page.pushOperators(
    op('BDC', name('OC'), name('Art')),
    op('q'),
    op('k', PDFNumber.of(0), PDFNumber.of(0), PDFNumber.of(0), PDFNumber.of(0)),
    artRect(),
    op('f'),
  );

  // A page's /Rotate is an instruction to viewers, and an embedded page does not
  // carry it across, so the turn has to be applied here. Each case puts the
  // rotated page's lower-left corner back on the artwork's lower-left corner.
  const turn = ((srcPage.getRotation().angle % 360) + 360) % 360;
  const sideways = turn === 90 || turn === 270;
  const xScale = artW / (sideways ? box.height : box.width);
  const yScale = artH / (sideways ? box.width : box.height);
  const place = {
    0: { x: left, y: bottom, angle: 0 },
    90: { x: left, y: bottom + artH, angle: -90 },
    180: { x: left + artW, y: bottom + artH, angle: 180 },
    270: { x: left + artW, y: bottom, angle: 90 },
  }[turn] || { x: left, y: bottom, angle: 0 };

  page.drawPage(embedded, {
    x: place.x,
    y: place.y,
    xScale: sideways ? yScale : xScale,
    yScale: sideways ? xScale : yScale,
    rotate: degrees(place.angle),
  });
  page.pushOperators(op('Q'), op('EMC'));

  out.setTitle(title || 'Puzzle print file');
  out.setCreator('SifuLaser Puzzle Generator');
  out.setProducer('SifuLaser Puzzle Generator');
  // Object streams stay on (the default), which also tells /shared/brand-core.js
  // to leave this file alone. The cut file carries "by sifulaser.com" in a band
  // below its parts, which is harmless on a sheet that gets cut. On this file the
  // same band would be printed.
  return out.save();
}
