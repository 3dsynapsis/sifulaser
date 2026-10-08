// Susun atur "belah petak sendiri" untuk mod Cetak 3D.
//
// Grid mod laser (cols x rows) memaksa setiap pembahagi merentang seluruh
// dulang, jadi hasilnya sentiasa seimbang: 2x2, 2x3. Di sini susun atur ialah
// POKOK BELAHAN, seperti Bento3D: ruang dalam dulang dibelah kepada beberapa
// bahagian sepanjang satu paksi, dan setiap bahagian boleh dibelah lagi -
// sepanjang paksi lain, atau dibiarkan sebagai satu petak. Itulah yang
// membolehkan satu petak panjang untuk sudu di sebelah 2x2 untuk benda kecil:
//
//     { s: 'x', f: [1, 2], k: [ {}, { s: 'y', f: [1, 1], k: [ {}, {} ] } ] }
//
//   * nod daun  : {}                     - satu petak
//   * nod belah : { s, f, k }            - s = 'x' (pembahagi menegak,
//                 memisahkan kiri/kanan) atau 'y' (melintang, memisahkan
//                 depan/belakang); f = saiz relatif setiap anak; k = anak.
//   * laluan    : tatasusunan indeks anak dari akar, [] = akar.
//
// `f` ialah nisbah, bukan mm: ubah saiz luar dulang dan setiap petak mengecil
// secara berkadar. Operasi di bawah MENULIS mm semasa ke dalam `f`, jadi
// membelah satu petak tidak menggerakkan jirannya.
//
// Setiap pembahagi ialah satu segmen lurus yang berhenti tepat pada dinding
// atau pada pembahagi lain - sebab itulah belah dan bukan "gabung petak":
// gabung boleh menghasilkan petak berbentuk L.
//
// Semua fungsi di sini TULEN: mengambil pokok, memulangkan pokok baharu.
// Tiada DOM, tiada three.js - diuji terus dalam node.

export const MAX_KIDS = 13;   // 12 pembahagi dalam satu belahan
export const MAX_CELLS = 100;
const MAX_DEPTH = 10;

export const pathKey = (path) => path.join('.');
export const samePath = (a, b) => Array.isArray(a) && Array.isArray(b)
  && a.length === b.length && a.every((v, i) => v === b[i]);

const isSplit = (n) => n && (n.s === 'x' || n.s === 'y') && Array.isArray(n.k) && n.k.length >= 2;

/** Bersihkan pokok daripada localStorage atau input: sentiasa pulangkan pokok sah. */
export function cleanTree(node, depth = 0) {
  if (!node || typeof node !== 'object' || depth > MAX_DEPTH) return {};
  if (!(node.s === 'x' || node.s === 'y') || !Array.isArray(node.k) || !Array.isArray(node.f)) return {};
  const kids = [];
  const f = [];
  const n = Math.min(node.k.length, node.f.length, MAX_KIDS);
  for (let i = 0; i < n; i++) {
    const v = Number(node.f[i]);
    if (!Number.isFinite(v) || v <= 0) continue;
    f.push(v);
    kids.push(cleanTree(node.k[i], depth + 1));
  }
  if (kids.length < 2) return kids.length === 1 ? kids[0] : {};
  // Anak yang membelah sepanjang paksi yang SAMA dengan induk dileburkan ke
  // dalam induk: [a | (b | c)] dan [a | b | c] ialah dulang yang sama, dan
  // bentuk rata menjadikan seretan dan "+ Lajur" berkelakuan sekata.
  const flatK = [];
  const flatF = [];
  kids.forEach((kid, i) => {
    if (isSplit(kid) && kid.s === node.s) {
      const sum = kid.f.reduce((a, b) => a + b, 0);
      kid.k.forEach((g, j) => { flatK.push(g); flatF.push((f[i] * kid.f[j]) / sum); });
    } else { flatK.push(kid); flatF.push(f[i]); }
  });
  return { s: node.s, f: flatF.slice(0, MAX_KIDS), k: flatK.slice(0, MAX_KIDS) };
}

/** Grid mod laser sebagai pokok: lajur dahulu, setiap lajur dibelah ikut baris. */
export function gridToTree(cols, rows) {
  const c = (Array.isArray(cols) ? cols : []).map(Number).filter((v) => Number.isFinite(v) && v > 0);
  const r = (Array.isArray(rows) ? rows : []).map(Number).filter((v) => Number.isFinite(v) && v > 0);
  const column = () => (r.length > 1 ? { s: 'y', f: r.slice(), k: r.map(() => ({})) } : {});
  if (c.length > 1) return cleanTree({ s: 'x', f: c.slice(), k: c.map(column) });
  return cleanTree(column());
}

export function nodeAt(tree, path) {
  let n = tree;
  for (const i of path) {
    if (!isSplit(n) || i < 0 || i >= n.k.length) return null;
    n = n.k[i];
  }
  return n;
}

export const countLeaves = (n) => (isSplit(n) ? n.k.reduce((s, k) => s + countLeaves(k), 0) : 1);

/**
 * Bentangkan pokok di dalam segi empat dalaman dulang.
 *
 * Pulangkan petak (segi empat, setiap satu dengan laluannya), segmen pembahagi
 * (setiap satu dengan laluan nodnya dan indeks k), dan saiz mm setiap nod.
 * Anak TERAKHIR setiap belahan berakhir tepat pada hujung kawasan induk -
 * bukan pada jumlah terkumpul - supaya petak yang menyentuh dinding kanan
 * atau belakang mempunyai koordinat yang SAMA dengan dinding, bit demi bit.
 * Jasad manifold bergantung pada itu.
 */
export function layoutRegions(tree, x0, y0, x1, y1, t, minCell = 0) {
  const cells = [];
  const segs = [];
  const nodes = new Map();
  let ok = true;
  const walk = (node, path, ax0, ay0, ax1, ay1) => {
    if (!isSplit(node)) {
      const w = ax1 - ax0;
      const h = ay1 - ay0;
      if (!(w >= minCell - 1e-6 && h >= minCell - 1e-6 && w > 0 && h > 0)) ok = false;
      cells.push({ path, x: ax0, y: ay0, x1: ax1, y1: ay1, w, h });
      return;
    }
    const alongX = node.s === 'x';
    const start = alongX ? ax0 : ay0;
    const end = alongX ? ax1 : ay1;
    const n = node.k.length;
    const span = end - start - (n - 1) * t;
    if (!(span > 0)) ok = false;
    const sum = node.f.reduce((a, b) => a + b, 0);
    const sizes = node.f.map((f) => (Math.max(span, 0) * f) / sum);
    nodes.set(pathKey(path), { axis: node.s, start, end, sizes, region: [ax0, ay0, ax1, ay1] });
    let at = start;
    for (let i = 0; i < n; i++) {
      const kEnd = i === n - 1 ? end : at + sizes[i];
      if (alongX) walk(node.k[i], path.concat(i), at, ay0, kEnd, ay1);
      else walk(node.k[i], path.concat(i), ax0, at, ax1, kEnd);
      const next = kEnd + t;
      if (i < n - 1) {
        // lo / hi ialah DOUBLE YANG SAMA yang menjadi hujung anak k dan
        // permulaan anak k+1 - jalur pembahagi berkongsi tepinya dengan petak
        // di kedua-dua sisi tanpa sebarang ralat apungan.
        segs.push({
          axis: node.s, pos: kEnd + t / 2, lo: kEnd, hi: next,
          from: alongX ? ay0 : ax0, to: alongX ? ay1 : ax1,
          path, k: i,
        });
      }
      at = next;
    }
  };
  walk(cleanTree(tree), [], x0, y0, x1, y1);
  return { cells, segs, nodes, ok };
}

/** Saiz paling kecil yang subpokok ini boleh dimampatkan sepanjang `axis`. */
export function minSpan(node, axis, minCell, t) {
  if (!isSplit(node)) return minCell;
  const spans = node.k.map((k) => minSpan(k, axis, minCell, t));
  return node.s === axis
    ? spans.reduce((a, b) => a + b, 0) + (node.k.length - 1) * t
    : Math.max(...spans);
}

const clone = (o) => JSON.parse(JSON.stringify(o));

/** Gantikan nod pada `path` (dalam salinan). */
function replaceAt(tree, path, fn) {
  const out = clone(tree);
  if (!path.length) return fn(out);
  const parent = nodeAt(out, path.slice(0, -1));
  parent.k[path[path.length - 1]] = fn(parent.k[path[path.length - 1]]);
  return out;
}

/** Boleh petak di `path` dibelah dua sepanjang `axis`? */
export function canSplit(tree, path, axis, info, t, minCell) {
  const cell = info.cells.find((c) => samePath(c.path, path));
  if (!cell) return false;
  if (countLeaves(tree) >= MAX_CELLS) return false;
  const size = axis === 'x' ? cell.w : cell.h;
  if ((size - t) / 2 < minCell) return false;
  if (path.length) {
    const parent = nodeAt(tree, path.slice(0, -1));
    if (parent.s === axis && parent.k.length >= MAX_KIDS) return false;
  }
  return true;
}

/**
 * Belah petak di `path` kepada dua sama besar sepanjang `axis`.
 * Kalau induknya sudah membelah sepanjang paksi itu, dua petak baharu menjadi
 * adik-beradik dalam induk (bukan nod bersarang), jadi tiga lajur + satu
 * belahan = empat lajur yang semuanya boleh diseret dengan cara yang sama.
 * Pulangkan { tree, select } atau null.
 */
export function splitLeaf(tree, path, axis, info, t, minCell) {
  if (!canSplit(tree, path, axis, info, t, minCell)) return null;
  const cell = info.cells.find((c) => samePath(c.path, path));
  const half = ((axis === 'x' ? cell.w : cell.h) - t) / 2;
  if (path.length) {
    const parentPath = path.slice(0, -1);
    const idx = path[path.length - 1];
    const parent = nodeAt(tree, parentPath);
    if (parent.s === axis) {
      const sizes = info.nodes.get(pathKey(parentPath)).sizes.slice();
      sizes.splice(idx, 1, half, half);
      const next = replaceAt(tree, parentPath, (n) => {
        n.k.splice(idx, 1, {}, {});
        n.f = sizes;
        return n;
      });
      return { tree: next, select: parentPath.concat(idx) };
    }
  }
  const next = replaceAt(tree, path, () => ({ s: axis, f: [half, half], k: [{}, {}] }));
  return { tree: next, select: path.concat(0) };
}

/**
 * Buang pembahagi k dalam nod di `path`: dua bahagian di kiri dan kanannya
 * bercantum menjadi SATU petak kosong. Belahan di dalam kedua-dua bahagian
 * itu turut hilang - inilah cara mendapatkan "satu petak penuh untuk sudu".
 */
export function removeDivider(tree, path, k, info, t) {
  const node = nodeAt(tree, path);
  if (!isSplit(node) || k < 0 || k >= node.k.length - 1) return null;
  const sizes = info.nodes.get(pathKey(path)).sizes.slice();
  sizes.splice(k, 2, sizes[k] + sizes[k + 1] + t);
  let collapsed = false;
  const next = replaceAt(tree, path, (n) => {
    n.k.splice(k, 2, {});
    n.f = sizes;
    if (n.k.length === 1) { collapsed = true; return {}; }
    return n;
  });
  return { tree: next, select: collapsed ? path : path.concat(k) };
}

/**
 * Pindahkan pembahagi k dalam nod di `path` supaya garis tengahnya di `pos`
 * (koordinat mutlak dulang sepanjang paksi nod). Dua bahagian bersebelahan
 * berkongsi jumlah tetap; masing-masing tidak boleh dimampatkan melepasi
 * minSpan subpokoknya, jadi petak di dalamnya tidak pernah jadi lebih kecil
 * daripada had.
 */
export function moveDivider(tree, path, k, pos, info, t, minCell) {
  const node = nodeAt(tree, path);
  const ni = info.nodes.get(pathKey(path));
  if (!isSplit(node) || !ni || k < 0 || k >= node.k.length - 1) return null;
  const sizes = ni.sizes.slice();
  let kidStart = ni.start;
  for (let i = 0; i < k; i++) kidStart += sizes[i] + t;
  const pair = sizes[k] + sizes[k + 1];
  const minA = minSpan(node.k[k], node.s, minCell, t);
  const minB = minSpan(node.k[k + 1], node.s, minCell, t);
  if (pair - minB < minA) return null;
  const a = Math.max(minA, Math.min(pair - minB, pos - t / 2 - kidStart));
  if (Math.abs(a - sizes[k]) < 1e-3) return null;
  sizes[k] = a;
  sizes[k + 1] = pair - a;
  return replaceAt(tree, path, (n) => { n.f = sizes; return n; });
}

/**
 * Tetapkan lebar (axis 'x') atau dalam ('y') petak di `leafPath` kepada `mm`.
 * Leburan terdekat sepanjang paksi itu yang menentukannya; jiran di sebelah
 * kanan/belakang menyerap bezanya (atau sebelah kiri/depan untuk yang
 * terakhir). Tiada leburan langsung = petak merentang seluruh dulang, jadi
 * pulangkan { resize } dan pemanggil ubah saiz luar dulang.
 */
export function setCellSize(tree, leafPath, axis, mm, info, t, minCell) {
  if (!Number.isFinite(mm)) return null;
  for (let d = leafPath.length - 1; d >= 0; d--) {
    const anc = leafPath.slice(0, d);
    const node = nodeAt(tree, anc);
    if (!isSplit(node) || node.s !== axis) continue;
    const idx = leafPath[d];
    const sizes = info.nodes.get(pathKey(anc)).sizes.slice();
    const j = idx < sizes.length - 1 ? idx + 1 : idx - 1;
    const pair = sizes[idx] + sizes[j];
    const minA = minSpan(node.k[idx], axis, minCell, t);
    const minB = minSpan(node.k[j], axis, minCell, t);
    if (pair - minB < minA) return null;
    const a = Math.max(minA, Math.min(pair - minB, mm));
    sizes[idx] = a;
    sizes[j] = pair - a;
    return { tree: replaceAt(tree, anc, (n) => { n.f = sizes; return n; }) };
  }
  return { resize: mm };
}
