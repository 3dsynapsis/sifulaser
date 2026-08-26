// Bringing artwork in. SVG becomes real rings (so it can be cut); raster stays
// raster and is engraved.

const SHAPE_SEL = 'path, rect, circle, ellipse, polygon, polyline, line';

export const readAsDataUrl = (file) => new Promise((resolve, reject) => {
  const r = new FileReader();
  r.onload = () => resolve(r.result);
  r.onerror = reject;
  r.readAsDataURL(file);
});

export const readAsText = (file) => new Promise((resolve, reject) => {
  const r = new FileReader();
  r.onload = () => resolve(r.result);
  r.onerror = reject;
  r.readAsText(file);
});

/**
 * Sample every shape element into a polygon. Uses the browser's own path maths via
 * getPointAtLength, so arcs and beziers come out right without a path parser.
 */
export function svgTextToRings(text, { tolerance = 0.35 } = {}) {
  const host = document.createElement('div');
  host.style.cssText = 'position:absolute;left:-99999px;top:0;width:1000px;height:1000px';
  host.innerHTML = text;
  const svg = host.querySelector('svg');
  if (!svg) return [];
  svg.removeAttribute('width');
  svg.removeAttribute('height');
  document.body.appendChild(host);

  const rings = [];
  try {
    const root = svg.getScreenCTM();
    for (const node of svg.querySelectorAll(SHAPE_SEL)) {
      if (typeof node.getTotalLength !== 'function') continue;
      let total = 0;
      try { total = node.getTotalLength(); } catch { continue; }
      if (!total || !Number.isFinite(total)) continue;
      const steps = Math.max(8, Math.min(3000, Math.ceil(total / tolerance)));
      const ctm = node.getScreenCTM();
      const m = root && ctm ? root.inverse().multiply(ctm) : null;
      const pts = [];
      for (let i = 0; i < steps; i++) {
        const p = node.getPointAtLength((i / steps) * total);
        const q = m ? p.matrixTransform(m) : p;
        pts.push([q.x, -q.y]); // svg is y-down, we work y-up
      }
      if (pts.length > 2) rings.push(pts);
    }
  } finally {
    host.remove();
  }
  return rings;
}

/** Render an emoji (or any glyph) to a transparent PNG for raster engraving. */
export function glyphToDataUrl(glyph, px = 256) {
  const c = document.createElement('canvas');
  c.width = px;
  c.height = px;
  const ctx = c.getContext('2d');
  ctx.font = `${Math.floor(px * 0.8)}px "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(glyph, px / 2, px / 2 + px * 0.04);
  return c.toDataURL('image/png');
}

/** Natural size of a data-url image, for keeping the aspect ratio on drop. */
export const imageSize = (src) => new Promise((resolve) => {
  const img = new Image();
  img.onload = () => resolve({ w: img.naturalWidth || 1, h: img.naturalHeight || 1 });
  img.onerror = () => resolve({ w: 1, h: 1 });
  img.src = src;
});

/**
 * Convert a raster image to a 1-bit engrave-friendly PNG. Laser software copes with
 * greyscale, but thresholding here makes the 3D preview honest about what burns.
 */
export const thresholdImage = (src, cut = 128, invert = false) => new Promise((resolve) => {
  const img = new Image();
  img.onload = () => {
    const c = document.createElement('canvas');
    c.width = img.naturalWidth;
    c.height = img.naturalHeight;
    const ctx = c.getContext('2d');
    ctx.drawImage(img, 0, 0);
    const d = ctx.getImageData(0, 0, c.width, c.height);
    const a = d.data;
    for (let i = 0; i < a.length; i += 4) {
      const lum = 0.299 * a[i] + 0.587 * a[i + 1] + 0.114 * a[i + 2];
      const on = invert ? lum > cut : lum <= cut;
      const alpha = a[i + 3] > 8 && on ? 255 : 0;
      a[i] = a[i + 1] = a[i + 2] = 0;
      a[i + 3] = alpha;
    }
    ctx.putImageData(d, 0, 0);
    resolve(c.toDataURL('image/png'));
  };
  img.onerror = () => resolve(src);
  img.src = src;
});
