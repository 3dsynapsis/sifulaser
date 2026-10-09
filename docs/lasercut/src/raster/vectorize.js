/**
 * Sifu Vector — client-side reconstruction engine.
 *
 * Turns a flat JPG/PNG into separated layers:
 *   1. quantize the picture down to a small palette (median cut)
 *   2. find the blocks that are photographic and keep those as raster
 *   3. for every remaining palette colour, trace the mask into vector paths
 *      (directed boundary segments -> loops -> Chaikin smooth -> Douglas-Peucker)
 *   4. name each layer from its colour and its role in the design
 *
 * Everything runs in the browser, no dependencies. The output uses exactly the
 * same Element shape as the demo project, so the workspace UI does not care
 * whether a layer came from here or from the mock data.
 */

// Copied from 11_Image to Vector/src/lib/vectorize.js for the laser quote.
// Changes, and only these: the two constants below instead of the demo-data
// import; a canvas that also works inside a Web Worker (OffscreenCanvas); and
// photographic areas returned as boxes (the quote engraves their box) instead
// of cropped data-URL images. Fix tracing bugs in both copies.
const ELEMENT_TYPE = { VECTOR: 'VECTOR', RASTER_IMAGE: 'RASTER_IMAGE' }
const CLASSIFICATION = { BACKGROUND: 'background', GRAPHIC: 'graphic', RASTER_EFFECT: 'raster-effect' }
const makeCanvas = (w, h) => {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h)
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  return c
}

const TRACE_MAX = 560 // longest edge used for tracing — keeps it fast and smooth
const TRACE_MIN = 480 // small uploads are scaled up so outlines are not blocky
const BLOCK = 16 // photographic-detection block size

export const DETAIL_PRESETS = {
  low: { colors: 6, minArea: 0.0016, epsilon: 2.2, smooth: 2 },
  medium: { colors: 10, minArea: 0.0007, epsilon: 1.5, smooth: 2 },
  high: { colors: 16, minArea: 0.00028, epsilon: 1.0, smooth: 3 },
}

const yieldToUi = () => new Promise((r) => setTimeout(r, 0))

/* ------------------------------------------------------------------ helpers */

/**
 * Trace at a consistent working size. Big files come down so tracing stays fast;
 * small files (a 280px photo off a phone) are interpolated *up* so the traced
 * outlines are smooth curves instead of visible pixel steps.
 */
function drawToImageData(img, maxEdge, minEdge) {
  const longest = Math.max(img.width, img.height)
  const scale = longest > maxEdge ? maxEdge / longest : Math.max(1, minEdge / longest)
  const w = Math.max(1, Math.round(img.width * scale))
  const h = Math.max(1, Math.round(img.height * scale))
  const canvas = makeCanvas(w, h)
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(img, 0, 0, w, h)
  return { data: ctx.getImageData(0, 0, w, h), canvas, ctx, w, h, scale }
}

/**
 * 3x3 median filter. Unlike a blur this removes the one-pixel anti-aliased
 * seams between flat colours without softening the edges themselves, which is
 * exactly what a flat print design needs before it is quantized.
 */
function median3(src, w, h) {
  const out = new Uint8ClampedArray(src.length)
  const b = new Uint8Array(9)
  // 19 compare-exchanges — the standard 9-element median network. No
  // allocation, no comparator call, ~20x faster than slice().sort().
  const sw = (i, j) => { const t = b[i]; if (b[j] < t) { b[i] = b[j]; b[j] = t } }
  for (let y = 0; y < h; y += 1) {
    const y0 = Math.max(0, y - 1), y1 = y, y2 = Math.min(h - 1, y + 1)
    for (let x = 0; x < w; x += 1) {
      const x0 = Math.max(0, x - 1), x1 = x, x2 = Math.min(w - 1, x + 1)
      const o = (y * w + x) * 4
      for (let c = 0; c < 3; c += 1) {
        b[0] = src[(y0 * w + x0) * 4 + c]; b[1] = src[(y0 * w + x1) * 4 + c]; b[2] = src[(y0 * w + x2) * 4 + c]
        b[3] = src[(y1 * w + x0) * 4 + c]; b[4] = src[(y1 * w + x1) * 4 + c]; b[5] = src[(y1 * w + x2) * 4 + c]
        b[6] = src[(y2 * w + x0) * 4 + c]; b[7] = src[(y2 * w + x1) * 4 + c]; b[8] = src[(y2 * w + x2) * 4 + c]
        sw(0, 1); sw(3, 4); sw(6, 7); sw(1, 2); sw(4, 5); sw(7, 8)
        sw(0, 1); sw(3, 4); sw(6, 7); sw(0, 3); sw(3, 6); sw(0, 3)
        sw(1, 4); sw(4, 7); sw(1, 4); sw(2, 5); sw(5, 8); sw(2, 5)
        sw(1, 3); sw(5, 7); sw(2, 6); sw(4, 6); sw(2, 4); sw(2, 3)
        out[o + c] = b[4]
      }
      out[o + 3] = src[o + 3]
    }
  }
  return out
}

/** Small box blur so JPEG noise does not shatter the palette. */
function blur(src, w, h) {
  const out = new Uint8ClampedArray(src.length)
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      let r = 0, g = 0, b = 0, a = 0, n = 0
      for (let dy = -1; dy <= 1; dy += 1) {
        const yy = y + dy
        if (yy < 0 || yy >= h) continue
        for (let dx = -1; dx <= 1; dx += 1) {
          const xx = x + dx
          if (xx < 0 || xx >= w) continue
          const i = (yy * w + xx) * 4
          r += src[i]; g += src[i + 1]; b += src[i + 2]; a += src[i + 3]; n += 1
        }
      }
      const o = (y * w + x) * 4
      out[o] = r / n; out[o + 1] = g / n; out[o + 2] = b / n; out[o + 3] = a / n
    }
  }
  return out
}

/* ------------------------------------------------------- median-cut palette */

function medianCut(pixels, count) {
  let boxes = [pixels]
  while (boxes.length < count) {
    boxes.sort((a, b) => b.length * spread(b) - a.length * spread(a))
    const box = boxes.shift()
    if (!box || box.length < 8) {
      if (box) boxes.push(box)
      break
    }
    const ch = longestChannel(box)
    box.sort((a, b) => a[ch] - b[ch])
    const mid = box.length >> 1
    boxes.push(box.slice(0, mid), box.slice(mid))
  }
  return boxes
    .filter((b) => b.length)
    .map((b) => {
      let r = 0, g = 0, bl = 0
      for (const p of b) { r += p[0]; g += p[1]; bl += p[2] }
      return [Math.round(r / b.length), Math.round(g / b.length), Math.round(bl / b.length)]
    })
}

function longestChannel(box) {
  const min = [255, 255, 255]
  const max = [0, 0, 0]
  for (const p of box) {
    for (let c = 0; c < 3; c += 1) {
      if (p[c] < min[c]) min[c] = p[c]
      if (p[c] > max[c]) max[c] = p[c]
    }
  }
  const ranges = [max[0] - min[0], (max[1] - min[1]) * 1.1, max[2] - min[2]]
  return ranges.indexOf(Math.max(...ranges))
}

function spread(box) {
  const min = [255, 255, 255]
  const max = [0, 0, 0]
  for (const p of box) {
    for (let c = 0; c < 3; c += 1) {
      if (p[c] < min[c]) min[c] = p[c]
      if (p[c] > max[c]) max[c] = p[c]
    }
  }
  return Math.max(max[0] - min[0], max[1] - min[1], max[2] - min[2]) + 1
}

const dist2 = (a, b) => {
  const dr = a[0] - b[0], dg = a[1] - b[1], db = a[2] - b[2]
  return dr * dr * 0.9 + dg * dg * 1.2 + db * db * 0.7
}

/**
 * Per-pixel gradient magnitude. Anti-aliased edges sit between two real
 * colours, so sampling only the flat pixels keeps invented "halo" colours
 * (muddy violets between blue and white) out of the palette entirely.
 */
function gradientMap(px, w, h) {
  const g = new Uint16Array(w * h)
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const i = y * w + x
      let m = 0
      if (x + 1 < w) {
        m = Math.max(m,
          Math.abs(px[i * 4] - px[(i + 1) * 4]) +
          Math.abs(px[i * 4 + 1] - px[(i + 1) * 4 + 1]) +
          Math.abs(px[i * 4 + 2] - px[(i + 1) * 4 + 2]))
      }
      if (y + 1 < h) {
        const j = i + w
        m = Math.max(m,
          Math.abs(px[i * 4] - px[j * 4]) +
          Math.abs(px[i * 4 + 1] - px[j * 4 + 1]) +
          Math.abs(px[i * 4 + 2] - px[j * 4 + 2]))
      }
      g[i] = m
    }
  }
  return g
}

/** Merge palette entries that are visually the same colour. */
function mergePalette(palette, threshold = 1500) {
  const kept = []
  const remap = []
  palette.forEach((c) => {
    const hit = kept.findIndex((k) => dist2(k, c) < threshold)
    if (hit >= 0) remap.push(hit)
    else { kept.push(c); remap.push(kept.length - 1) }
  })
  return { palette: kept, remap }
}

/* --------------------------------------------------- photographic detection */

function detectPhotoBlocks(px, w, h) {
  const bx = Math.ceil(w / BLOCK)
  const by = Math.ceil(h / BLOCK)
  const score = new Float32Array(bx * by)
  const distinct = new Uint16Array(bx * by)

  for (let b = 0; b < bx * by; b += 1) {
    const ox = (b % bx) * BLOCK
    const oy = Math.floor(b / bx) * BLOCK
    const seen = new Set()
    let energy = 0
    let n = 0
    for (let y = oy; y < Math.min(oy + BLOCK, h); y += 1) {
      for (let x = ox; x < Math.min(ox + BLOCK, w); x += 1) {
        const i = y * w + x
        if (px[i * 4 + 3] < 128) continue
        // distinct *source* tones, not palette entries — a photo keeps many
        // even after the artwork has been reduced to a handful of flat colours
        seen.add((px[i * 4] >> 4) << 8 | (px[i * 4 + 1] >> 4) << 4 | (px[i * 4 + 2] >> 4))
        if (x + 1 < w) {
          energy += Math.abs(px[i * 4] - px[(i + 1) * 4]) +
            Math.abs(px[i * 4 + 1] - px[(i + 1) * 4 + 1]) +
            Math.abs(px[i * 4 + 2] - px[(i + 1) * 4 + 2])
        }
        n += 1
      }
    }
    score[b] = n ? energy / n : 0
    distinct[b] = seen.size
  }

  const sorted = [...score].filter((v) => v > 0).sort((a, b) => a - b)
  const median = sorted.length ? sorted[sorted.length >> 1] : 0
  const cut = Math.max(24, median * 2.2)

  const flag = new Uint8Array(bx * by)
  for (let b = 0; b < bx * by; b += 1) {
    if (score[b] > cut && distinct[b] >= 10) flag[b] = 1
  }

  // keep only clusters of at least 4 connected blocks
  const groups = []
  const seen = new Uint8Array(bx * by)
  for (let b = 0; b < bx * by; b += 1) {
    if (!flag[b] || seen[b]) continue
    const stack = [b]
    const cells = []
    seen[b] = 1
    while (stack.length) {
      const c = stack.pop()
      cells.push(c)
      const cx = c % bx, cy = Math.floor(c / bx)
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = cx + dx, ny = cy + dy
        if (nx < 0 || ny < 0 || nx >= bx || ny >= by) continue
        const nb = ny * bx + nx
        if (flag[nb] && !seen[nb]) { seen[nb] = 1; stack.push(nb) }
      }
    }
    if (cells.length >= 10) groups.push(cells)
  }

  // Only the single densest cluster is kept. Photographic renders trip this
  // detector all over the artwork; the designer can convert anything else by
  // hand with "Keep as Image".
  groups.sort((a, b) => b.length - a.length)
  groups.splice(1)
  // A cluster that sprawls over most of the artwork means the whole source is
  // photographic, not that there is a photo inset to lift out.
  if (!groups.length || groups[0].length > bx * by * 0.5) {
    return { mask: new Uint8Array(w * h), boxes: [] }
  }

  const mask = new Uint8Array(w * h)
  const boxes = groups.map((cells) => {
    let x0 = w, y0 = h, x1 = 0, y1 = 0
    for (const c of cells) {
      const ox = (c % bx) * BLOCK
      const oy = Math.floor(c / bx) * BLOCK
      x0 = Math.min(x0, ox); y0 = Math.min(y0, oy)
      x1 = Math.max(x1, Math.min(ox + BLOCK, w)); y1 = Math.max(y1, Math.min(oy + BLOCK, h))
      for (let y = oy; y < Math.min(oy + BLOCK, h); y += 1) {
        for (let x = ox; x < Math.min(ox + BLOCK, w); x += 1) mask[y * w + x] = 1
      }
    }
    return { x0, y0, x1, y1, blocks: cells.length }
  })

  return { mask, boxes }
}

/* --------------------------------------------------------- contour tracing */

/**
 * Boundary of a binary mask as closed loops of half-integer points.
 *
 * Every filled pixel contributes a directed edge for each side that faces
 * outside, so the mask is always on the same hand of the walk. Where two
 * regions touch diagonally a vertex carries two outgoing edges; picking the
 * wrong one links separate contours into one loop that encircles unrelated
 * geometry, and the shape then floods when filled. Always taking the sharpest
 * right turn keeps each walk on its own contour.
 */
function traceLoops(mask, w, h) {
  const key = (x, y) => x * 100000 + y
  const starts = new Map()
  const add = (x0, y0, x1, y1) => {
    const k = key(x0, y0)
    const list = starts.get(k)
    if (list) list.push([x1, y1])
    else starts.set(k, [[x1, y1]])
  }

  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      if (!mask[y * w + x]) continue
      if (y === 0 || !mask[(y - 1) * w + x]) add(x + 1, y, x, y)
      if (y === h - 1 || !mask[(y + 1) * w + x]) add(x, y + 1, x + 1, y + 1)
      if (x === 0 || !mask[y * w + x - 1]) add(x, y, x, y + 1)
      if (x === w - 1 || !mask[y * w + x + 1]) add(x + 1, y + 1, x + 1, y)
    }
  }

  // Rank a candidate step against the direction we arrived in: right turn
  // first, then straight on, then left, and only reverse as a last resort.
  const rank = (idx, idy, dx, dy) => {
    if (idx === 0 && idy === 0) return 0
    if (dx === -idy && dy === idx) return 0 // right
    if (dx === idx && dy === idy) return 1 // straight
    if (dx === idy && dy === -idx) return 2 // left
    return 3 // back the way we came
  }

  const loops = []
  for (const [k, list] of starts) {
    while (list.length) {
      const startX = Math.floor(k / 100000)
      const startY = k % 100000
      const loop = []
      let cx = startX
      let cy = startY
      let idx = 0
      let idy = 0
      while (true) {
        const nexts = starts.get(key(cx, cy))
        if (!nexts || !nexts.length) break
        let pick = 0
        let bestRank = 9
        for (let n = 0; n < nexts.length; n += 1) {
          const r = rank(idx, idy, nexts[n][0] - cx, nexts[n][1] - cy)
          if (r < bestRank) { bestRank = r; pick = n }
        }
        const [nx, ny] = nexts.splice(pick, 1)[0]
        loop.push([cx, cy])
        idx = nx - cx
        idy = ny - cy
        cx = nx
        cy = ny
        if (cx === startX && cy === startY) break
      }
      if (loop.length > 3) loops.push(loop)
    }
  }
  return loops
}

/** Chaikin corner cutting — turns the pixel staircase into a smooth outline. */
function chaikin(points, iterations) {
  let pts = points
  for (let it = 0; it < iterations; it += 1) {
    if (pts.length < 4) return pts
    const out = []
    for (let i = 0; i < pts.length; i += 1) {
      const p = pts[i]
      const q = pts[(i + 1) % pts.length]
      out.push([p[0] * 0.75 + q[0] * 0.25, p[1] * 0.75 + q[1] * 0.25])
      out.push([p[0] * 0.25 + q[0] * 0.75, p[1] * 0.25 + q[1] * 0.75])
    }
    pts = out
  }
  return pts
}

function simplify(points, epsilon) {
  if (points.length < 4) return points
  const keep = new Uint8Array(points.length)
  keep[0] = 1
  keep[points.length - 1] = 1
  const stack = [[0, points.length - 1]]
  while (stack.length) {
    const [a, b] = stack.pop()
    let maxD = 0
    let idx = -1
    const [ax, ay] = points[a]
    const [bx, by] = points[b]
    const dx = bx - ax
    const dy = by - ay
    const len = Math.hypot(dx, dy) || 1
    for (let i = a + 1; i < b; i += 1) {
      const d = Math.abs((points[i][0] - ax) * dy - (points[i][1] - ay) * dx) / len
      if (d > maxD) { maxD = d; idx = i }
    }
    if (maxD > epsilon && idx > 0) {
      keep[idx] = 1
      stack.push([a, idx], [idx, b])
    }
  }
  return points.filter((_, i) => keep[i])
}

const fmt = (n) => Math.round(n * 10) / 10

function loopsToPath(loops, scale, epsilon, smooth) {
  let d = ''
  let nodes = 0
  for (const loop of loops) {
    // Thin the pixel staircase before Chaikin so smoothing does not blow the
    // point count up by 2^smooth. The pre-pass epsilon stays well under a pixel:
    // at 0.9 it collapses the two sides of a 1px rule into one line and a thin
    // frame renders as a filled rectangle.
    const coarse = loop.length > 200 ? simplify(loop, 0.34) : loop
    const pts = simplify(chaikin(coarse, smooth), epsilon)
    if (pts.length < 3) continue
    nodes += pts.length
    d += `M${fmt(pts[0][0] * scale)} ${fmt(pts[0][1] * scale)}`
    for (let i = 1; i < pts.length; i += 1) {
      d += `L${fmt(pts[i][0] * scale)} ${fmt(pts[i][1] * scale)}`
    }
    d += 'Z'
  }
  return { d, nodes }
}

/* -------------------------------------------------------------- naming ---- */

function rgbToHsl([r, g, b]) {
  const rr = r / 255, gg = g / 255, bb = b / 255
  const max = Math.max(rr, gg, bb), min = Math.min(rr, gg, bb)
  const l = (max + min) / 2
  if (max === min) return [0, 0, l]
  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  let hue
  if (max === rr) hue = ((gg - bb) / d + (gg < bb ? 6 : 0)) / 6
  else if (max === gg) hue = ((bb - rr) / d + 2) / 6
  else hue = ((rr - gg) / d + 4) / 6
  return [hue * 360, s, l]
}

const HUES = [
  [15, 'Red'], [45, 'Orange'], [65, 'Yellow'], [100, 'Lime'], [160, 'Green'],
  [195, 'Teal'], [250, 'Blue'], [285, 'Violet'], [330, 'Magenta'], [360, 'Red'],
]

export function colourName(rgb) {
  const [h, s, l] = rgbToHsl(rgb)
  if (s < 0.12) {
    if (l > 0.92) return 'White'
    if (l > 0.7) return 'Light Grey'
    if (l > 0.35) return 'Grey'
    if (l > 0.12) return 'Dark Grey'
    return 'Black'
  }
  const base = HUES.find(([max]) => h <= max)?.[1] ?? 'Red'
  if (l > 0.78) return `Pale ${base}`
  if (l < 0.24) return `Deep ${base}`
  if (l < 0.42) return `Dark ${base}`
  if (s > 0.7 && l < 0.6) return base === 'Blue' ? 'Royal Blue' : `Bright ${base}`
  return base
}

const hex = ([r, g, b]) =>
  `#${[r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('')}`

/* -------------------------------------------------------------- main entry */

export async function reconstructImage(img, { detail = 'medium' } = {}, onProgress = () => {}) {
  const preset = DETAIL_PRESETS[detail] ?? DETAIL_PRESETS.medium

  onProgress({ step: 'Reading image', percent: 6 })
  await yieldToUi()
  const { data, w, h } = drawToImageData(img, TRACE_MAX, TRACE_MIN)
  const px = median3(median3(blur(data.data, w, h), w, h), w, h)
  const artW = img.width
  const artH = img.height
  const upscale = artW / w

  onProgress({ step: 'Building colour palette', percent: 20 })
  await yieldToUi()
  const grad = gradientMap(px, w, h)
  const flat = []
  const all = []
  for (let i = 0; i < w * h; i += 1) {
    if (px[i * 4 + 3] < 128) continue
    const c = [px[i * 4], px[i * 4 + 1], px[i * 4 + 2]]
    all.push(c)
    if (grad[i] < 26) flat.push(c)
  }
  if (!all.length) throw new Error('The image is fully transparent — nothing to reconstruct.')
  // Fall back to every pixel if the artwork is mostly gradients.
  const samples = flat.length > all.length * 0.25 ? flat : all

  const raw = medianCut(samples, preset.colors)
  const { palette } = mergePalette(raw)

  const indexMap = new Int16Array(w * h).fill(-1)
  const counts = new Uint32Array(palette.length)
  const cache = new Map()
  for (let i = 0; i < w * h; i += 1) {
    if (px[i * 4 + 3] < 128) continue
    const r = px[i * 4], g = px[i * 4 + 1], b = px[i * 4 + 2]
    const ck = (r >> 3) << 10 | (g >> 3) << 5 | (b >> 3)
    let best = cache.get(ck)
    if (best === undefined) {
      let bd = Infinity
      best = 0
      for (let p = 0; p < palette.length; p += 1) {
        const d = dist2(palette[p], [r, g, b])
        if (d < bd) { bd = d; best = p }
      }
      cache.set(ck, best)
    }
    indexMap[i] = best
    counts[best] += 1
  }

  onProgress({ step: 'Cleaning up edge colours', percent: 34 })
  await yieldToUi()
  dropHaloColours(palette, indexMap, counts, grad, w * h)
  maskFrame(indexMap, counts, w, h)
  majorityFilter(indexMap, counts, palette.length, w, h, 2)
  dissolveNoiseColours(px, palette, indexMap, counts, w, h)
  majorityFilter(indexMap, counts, palette.length, w, h, 1)
  dropBorderColours(palette, indexMap, counts, w, h)

  onProgress({ step: 'Finding photographic areas', percent: 44 })
  await yieldToUi()
  const photo = detectPhotoBlocks(px, w, h)

  // Hand the photographic pixels to the raster crop so nothing traces them —
  // but only when that region is a genuine inset. Photographic *sources* (3D
  // renders, phone snaps of a physical medal) trip the detector across most of
  // the artwork, and punching that out would leave the design with no shapes.
  let photoPixels = 0
  for (let i = 0; i < w * h; i += 1) photoPixels += photo.mask[i]
  const photoShare = photoPixels / (w * h)
  if (photoShare > 0 && photoShare < 0.15) {
    for (let i = 0; i < w * h; i += 1) {
      if (photo.mask[i] && indexMap[i] >= 0) {
        counts[indexMap[i]] -= 1
        indexMap[i] = -1
      }
    }
  }

  onProgress({ step: 'Tracing vector shapes', percent: 55 })
  await yieldToUi()

  const total = w * h
  const order = [...palette.keys()]
    .filter((p) => counts[p] / total > 0.0025)
    .sort((a, b) => counts[b] - counts[a])

  const elements = []
  const minPixels = preset.minArea * total
  const usedNames = new Map()
  const uniqueName = (base) => {
    const n = (usedNames.get(base) ?? 0) + 1
    usedNames.set(base, n)
    return n === 1 ? base : `${base} ${n}`
  }

  for (let oi = 0; oi < order.length; oi += 1) {
    const p = order[oi]
    onProgress({ step: `Tracing shape ${oi + 1} of ${order.length}`, percent: 55 + (oi / order.length) * 30 })
    await yieldToUi()

    const mask = new Uint8Array(w * h)
    let count = 0
    for (let i = 0; i < w * h; i += 1) {
      if (indexMap[i] !== p) continue
      mask[i] = 1
      count += 1
    }
    if (count < minPixels) continue

    despeckle(mask, w, h, Math.max(6, minPixels * 0.25))

    // Extents are measured after despeckle, so a stray speck can't inflate the
    // bounding box that drives the selection frame and the source highlight.
    count = 0
    let x0 = w, y0 = h, x1 = 0, y1 = 0
    for (let i = 0; i < w * h; i += 1) {
      if (!mask[i]) continue
      count += 1
      const x = i % w, y = (i / w) | 0
      if (x < x0) x0 = x
      if (y < y0) y0 = y
      if (x > x1) x1 = x
      if (y > y1) y1 = y
    }
    if (!count) continue

    const loops = traceLoops(mask, w, h)
    if (!loops.length) continue
    const { d, nodes } = loopsToPath(loops, upscale, preset.epsilon, preset.smooth)
    if (!d) continue
    // A coarse copy for the 42px layer thumbnails.
    const thumbPath = loopsToPath(loops, upscale, Math.max(6, preset.epsilon * 5), 1).d

    const coverage = count / total
    const isBackdrop = oi === 0 && touchesAllEdges(mask, w, h)
    const name = uniqueName(layerName(palette[p], coverage, nodes, isBackdrop, elements.length))

    elements.push({
      id: `layer-${p}-${oi}`,
      name,
      classification: isBackdrop ? CLASSIFICATION.BACKGROUND : CLASSIFICATION.GRAPHIC,
      type: ELEMENT_TYPE.VECTOR,
      confidence: measureFidelity(px, mask, w, h, palette[p]),
      visible: true,
      locked: false,
      zIndex: elements.length,
      boundingBox: {
        x: (x0 / w) * 100,
        y: (y0 / h) * 100,
        w: ((x1 - x0 + 1) / w) * 100,
        h: ((y1 - y0 + 1) / h) * 100,
      },
      thumb: { backdrop: 'light' },
      transform: { x: 0, y: 0, scale: 1, rotation: 0 },
      properties: {
        fill: hex(palette[p]),
        stroke: 'none',
        strokeWidth: 0,
        opacity: 100,
        nodes,
        path: d,
        thumbPath,
        note: `${(coverage * 100).toFixed(1)}% of the artwork · traced from a single flat colour`,
      },
    })
  }

  onProgress({ step: 'Extracting raster detail', percent: 90 })
  await yieldToUi()

  photo.boxes.forEach((box, i) => {
    elements.push({
      id: `raster-${i}`,
      name: 'Photographic Detail',
      classification: CLASSIFICATION.RASTER_EFFECT,
      type: ELEMENT_TYPE.RASTER_IMAGE,
      // In artwork pixels, like every traced path.
      pxBox: [box.x0 * upscale, box.y0 * upscale, box.x1 * upscale, box.y1 * upscale],
    })
  })

  onProgress({ step: 'Done', percent: 100 })

  return {
    artboard: { width: artW, height: artH },
    elements,
    overallConfidence: elements.length
      ? Math.round(elements.reduce((s, e) => s + e.confidence, 0) / elements.length)
      : 0,
  }
}

/* ------------------------------------------------------------------ extras */

/**
 * Dissolve palette entries that do not describe a real flat region. Quantizing
 * a shaded render always leaves one or two "bucket" colours that sit between
 * everything else: they represent their pixels badly and are scattered in thin
 * fragments, so tracing them yields a thousand-node layer of noise. Each of
 * their pixels is reassigned to whichever surviving colour is nearest to that
 * pixel's own value, not to the bucket's average.
 */
function dissolveNoiseColours(px, palette, indexMap, counts, w, h) {
  const size = w * h
  const err = new Float64Array(palette.length)
  const edge = new Float64Array(palette.length)
  for (let i = 0; i < size; i += 1) {
    const p = indexMap[i]
    if (p < 0) continue
    const dr = px[i * 4] - palette[p][0]
    const dg = px[i * 4 + 1] - palette[p][1]
    const db = px[i * 4 + 2] - palette[p][2]
    err[p] += Math.sqrt(dr * dr + dg * dg + db * db)
    const x = i % w
    const y = (i / w) | 0
    if ((x > 0 && indexMap[i - 1] !== p) || (x < w - 1 && indexMap[i + 1] !== p)
      || (y > 0 && indexMap[i - w] !== p) || (y < h - 1 && indexMap[i + w] !== p)) {
      edge[p] += 1
    }
  }

  // Two signals together: the colour stands in badly for its pixels AND those
  // pixels are mostly boundary, i.e. thin scattered fragments rather than a
  // solid region. A shaded but compact area (a character's face) scores high on
  // error alone and must survive.
  const doomed = palette.map((_, p) => {
    if (!counts[p]) return true
    const mean = err[p] / counts[p]
    const fragmentation = edge[p] / counts[p]
    return mean > 42 && fragmentation > 0.5 && counts[p] / size < 0.10
  })
  if (doomed.every(Boolean)) return

  const survivors = palette.map((c, p) => (doomed[p] ? null : c)).filter(Boolean)
  const survivorIndex = []
  palette.forEach((_, p) => { if (!doomed[p]) survivorIndex.push(p) })
  if (!survivors.length) return

  for (let i = 0; i < size; i += 1) {
    const p = indexMap[i]
    if (p < 0 || !doomed[p]) continue
    const c = [px[i * 4], px[i * 4 + 1], px[i * 4 + 2]]
    let best = survivorIndex[0]
    let bd = Infinity
    for (let s = 0; s < survivors.length; s += 1) {
      const d = dist2(survivors[s], c)
      if (d < bd) { bd = d; best = survivorIndex[s] }
    }
    counts[p] -= 1
    counts[best] += 1
    indexMap[i] = best
  }
}

/**
 * Modal filter over the palette index map. Quantization always leaves a
 * "leftover" colour scattered a pixel or two at a time along every boundary —
 * traced, that becomes a single layer of a few hundred specks smeared across
 * the whole artboard. Replacing each pixel with the most common index around it
 * dissolves those specks into the region they actually belong to.
 */
function majorityFilter(indexMap, counts, paletteSize, w, h, passes) {
  const tally = new Uint16Array(paletteSize)
  for (let pass = 0; pass < passes; pass += 1) {
    const src = indexMap.slice()
    for (let y = 0; y < h; y += 1) {
      for (let x = 0; x < w; x += 1) {
        const i = y * w + x
        const cur = src[i]
        if (cur < 0) continue
        tally.fill(0)
        let best = cur
        let bestN = 0
        for (let dy = -1; dy <= 1; dy += 1) {
          const yy = y + dy
          if (yy < 0 || yy >= h) continue
          for (let dx = -1; dx <= 1; dx += 1) {
            const xx = x + dx
            if (xx < 0 || xx >= w) continue
            const p = src[yy * w + xx]
            if (p < 0) continue
            tally[p] += 1
            // ties go to the pixel's own colour, so flat areas never drift
            if (tally[p] > bestN || (tally[p] === bestN && p === cur)) { bestN = tally[p]; best = p }
          }
        }
        indexMap[i] = best
      }
    }
  }
  counts.fill(0)
  for (let i = 0; i < w * h; i += 1) if (indexMap[i] >= 0) counts[indexMap[i]] += 1
}

/**
 * Client files routinely arrive as a screenshot with a thin coloured rule
 * around the edge. It is not part of the design, it shares its colour with real
 * artwork inside (a red frame around a rainbow), and traced it wraps the whole
 * artboard. Peel the frame off the index map — the pixels simply stop being
 * traced, so nothing else about the artboard moves.
 */
function maskFrame(indexMap, counts, w, h) {
  const limit = Math.max(1, Math.round(Math.min(w, h) * 0.03))

  const ringMode = (inset) => {
    const tally = new Map()
    const bump = (i) => {
      const p = indexMap[i]
      if (p < 0) return
      tally.set(p, (tally.get(p) ?? 0) + 1)
    }
    for (let x = inset; x < w - inset; x += 1) {
      bump(inset * w + x)
      bump((h - 1 - inset) * w + x)
    }
    for (let y = inset; y < h - inset; y += 1) {
      bump(y * w + inset)
      bump(y * w + (w - 1 - inset))
    }
    let mode = -1
    let best = 0
    let total = 0
    tally.forEach((n, p) => { total += n; if (n > best) { best = n; mode = p } })
    return { mode, purity: total ? best / total : 0 }
  }

  const first = ringMode(0)
  // A frame is a near-uniform ring of a colour that is scarce overall.
  if (first.mode < 0 || first.purity < 0.9 || counts[first.mode] / (w * h) > 0.06) return

  let thickness = 0
  while (thickness < limit) {
    const ring = ringMode(thickness)
    if (ring.mode !== first.mode || ring.purity < 0.85) break
    thickness += 1
  }
  if (!thickness) return

  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      if (x >= thickness && y >= thickness && x < w - thickness && y < h - thickness) continue
      const i = y * w + x
      if (indexMap[i] >= 0) {
        counts[indexMap[i]] -= 1
        indexMap[i] = -1
      }
    }
  }
}

/**
 * Drop scan/screenshot frames whose colour appears nowhere else — the leftover
 * case after maskFrame, e.g. a rule that does not reach the very edge.
 */
function dropBorderColours(palette, indexMap, counts, w, h) {
  const total = w * h
  const band = Math.max(2, Math.round(Math.min(w, h) * 0.012))
  const onEdge = new Uint32Array(palette.length)
  for (let i = 0; i < total; i += 1) {
    const p = indexMap[i]
    if (p < 0) continue
    const x = i % w
    const y = (i / w) | 0
    if (x < band || y < band || x >= w - band || y >= h - band) onEdge[p] += 1
  }

  const doomed = palette.map((_, p) =>
    counts[p] > 0 && counts[p] / total < 0.02 && onEdge[p] / counts[p] > 0.85)
  if (!doomed.some(Boolean)) return

  const remap = palette.map((c, p) => {
    if (!doomed[p]) return p
    let best = p
    let bd = Infinity
    for (let q = 0; q < palette.length; q += 1) {
      if (doomed[q] || !counts[q]) continue
      const d = dist2(palette[q], c)
      if (d < bd) { bd = d; best = q }
    }
    return best
  })

  for (let i = 0; i < total; i += 1) {
    const p = indexMap[i]
    if (p >= 0 && remap[p] !== p) {
      counts[p] -= 1
      counts[remap[p]] += 1
      indexMap[i] = remap[p]
    }
  }
}

/**
 * How faithfully does one flat colour stand in for the pixels it replaced?
 * This is a real error measurement against the source, not a proxy for how
 * few nodes we emitted — throwing detail away must not raise the score.
 */
function measureFidelity(px, mask, w, h, colour) {
  let sum = 0
  let n = 0
  for (let i = 0; i < w * h; i += 1) {
    if (!mask[i]) continue
    const dr = px[i * 4] - colour[0]
    const dg = px[i * 4 + 1] - colour[1]
    const db = px[i * 4 + 2] - colour[2]
    sum += Math.sqrt(dr * dr + dg * dg + db * db)
    n += 1
  }
  if (!n) return 0
  // Mean CIE-ish distance of ~0 is perfect; ~60 is a poor stand-in.
  const err = sum / n
  return Math.max(45, Math.min(99, Math.round(99 - (err / 60) * 54)))
}

/**
 * Kill "halo" palette entries — the colours that only exist because two real
 * colours were blended by anti-aliasing (blue + white = violet outlines). They
 * are recognisable two ways: their pixels sit almost entirely on edges, and the
 * colour itself sits near the midpoint of two other palette entries.
 * Their pixels are handed back to the nearest surviving colour.
 */
function dropHaloColours(palette, indexMap, counts, grad, size) {
  const meanGrad = new Float64Array(palette.length)
  for (let i = 0; i < size; i += 1) {
    const p = indexMap[i]
    if (p >= 0) meanGrad[p] += grad[i]
  }
  for (let p = 0; p < palette.length; p += 1) {
    meanGrad[p] = counts[p] ? meanGrad[p] / counts[p] : 0
  }

  const halo = palette.map((c, p) => {
    if (!counts[p]) return true
    if (meanGrad[p] < 26) return false
    for (let a = 0; a < palette.length; a += 1) {
      for (let b = a + 1; b < palette.length; b += 1) {
        if (a === p || b === p) continue
        if (counts[a] < counts[p] || counts[b] < counts[p]) continue
        const mid = [
          (palette[a][0] + palette[b][0]) / 2,
          (palette[a][1] + palette[b][1]) / 2,
          (palette[a][2] + palette[b][2]) / 2,
        ]
        if (dist2(mid, c) < 3200) return true
      }
    }
    return false
  })

  if (halo.every(Boolean)) return // never strip everything

  const remap = palette.map((c, p) => {
    if (!halo[p]) return p
    let best = p
    let bd = Infinity
    for (let q = 0; q < palette.length; q += 1) {
      if (halo[q]) continue
      const d = dist2(palette[q], c)
      if (d < bd) { bd = d; best = q }
    }
    return best
  })

  for (let i = 0; i < size; i += 1) {
    const p = indexMap[i]
    if (p >= 0 && remap[p] !== p) {
      counts[p] -= 1
      counts[remap[p]] += 1
      indexMap[i] = remap[p]
    }
  }
}

function despeckle(mask, w, h, minBlob) {
  const seen = new Uint8Array(w * h)
  for (let i = 0; i < w * h; i += 1) {
    if (!mask[i] || seen[i]) continue
    const stack = [i]
    const cells = []
    seen[i] = 1
    while (stack.length) {
      const c = stack.pop()
      cells.push(c)
      const x = c % w, y = (c / w) | 0
      if (x > 0 && mask[c - 1] && !seen[c - 1]) { seen[c - 1] = 1; stack.push(c - 1) }
      if (x < w - 1 && mask[c + 1] && !seen[c + 1]) { seen[c + 1] = 1; stack.push(c + 1) }
      if (y > 0 && mask[c - w] && !seen[c - w]) { seen[c - w] = 1; stack.push(c - w) }
      if (y < h - 1 && mask[c + w] && !seen[c + w]) { seen[c + w] = 1; stack.push(c + w) }
    }
    if (cells.length < minBlob) for (const c of cells) mask[c] = 0
  }
}

function touchesAllEdges(mask, w, h) {
  let top = false, bottom = false, left = false, right = false
  for (let x = 0; x < w; x += 1) {
    if (mask[x]) top = true
    if (mask[(h - 1) * w + x]) bottom = true
  }
  for (let y = 0; y < h; y += 1) {
    if (mask[y * w]) left = true
    if (mask[y * w + w - 1]) right = true
  }
  return top && bottom && left && right
}

function layerName(rgb, coverage, nodes, isBackdrop, index) {
  const colour = colourName(rgb)
  if (isBackdrop) return `${colour} Background`
  const density = nodes / Math.max(1, coverage * 1000)
  if (density > 9) return `${colour} Lettering & Detail`
  if (coverage > 0.18) return `${colour} Base Shape`
  if (coverage > 0.06) return `${colour} Panel`
  if (index > 4) return `${colour} Accent`
  return `${colour} Detail`
}

/** Load a File / Blob into an <img> we can draw. */
export function loadImageFile(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => resolve({ img, url })
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Could not read that image file.')) }
    img.src = url
  })
}
