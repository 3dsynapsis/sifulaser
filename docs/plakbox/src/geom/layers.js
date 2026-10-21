// Tapak potong laser: tapak Plak Box yang sama, dibina daripada lapisan papan
// (MDF, plywood, akrilik hitam) yang dipotong laser dan dilekat bertindan.
//
// Ini cara tapak plak dibuat sebelum ada printer, dan cara kebanyakan kedai
// laser masih membuatnya: lapisan rata dilekat, tepi luarnya bertingkat
// mengikut profil, dan alur untuk dinding akrilik terbentuk dengan memotong
// lapisan atas kepada DUA keping - bingkai luar dan bahagian tengah - dengan
// celah selebar alur di antaranya. Bahagian tengah dipotong dari dalam bingkai
// itu sendiri, jadi kedua-duanya hanya satu segi empat papan.
//
// Dari bawah:
//   * lapisan pepejal - lantai, dan badan tapak. Tepi luar setiap lapisan
//     ialah profil jenis tapak pada tengah lapisan itu (Standard bertingkat di
//     atas, Serong menjadi tangga, Klasik menjadi tangga yang mengikut lengkung
//     S, Dua Tingkat tingkat bulat). Poket atau slot yang lebih dalam daripada
//     alur menembusi lapisan ini juga.
//   * lapisan alur - bingkai (tepi luar, berlubang di tepi luar alur) dan
//     tengah (tepi dalam alur), dengan lubang poket atau slot pada tengah.
//
// TANDA PENJAJARAN. Pada setiap lapisan, di mana keping di atasnya diletak:
// tanda L di empat bucu, 0.6 mm DI DALAM tapak keping atas itu - jadi bila
// dilekat, tanda itu tertutup sepenuhnya dan tiada apa-apa kelihatan pada
// produk. Ia juga memberitahu arah: Serong "depan sahaja" lebih lebar di
// depan, dan tanda itu hanya duduk betul pada satu arah. Bahagian tengah alur
// dijajarkan oleh tanda pada lapisan di bawahnya, atau oleh dinding akrilik
// itu sendiri yang dimasukkan ke dalam alur semasa gam masih basah.
//
// Koordinat sama seperti base.js: mm, x kiri-kanan, y depan-belakang, z ke
// atas, tapak bermula di x = y = 0. Segi empat ialah { x0, y0, x1, y1 }.
//
// Tulen: tiada DOM, tiada import. Diuji oleh scripts/test-plakbox.mjs.

const R6 = (v) => Math.round(v * 1e6) / 1e6;
const MARK_IN = 0.6;      // tanda L di dalam tapak keping atas, mm
const MARK_LEG = 6;       // panjang setiap kaki L, mm

/** Jarak tepi ke luar pada ketinggian z, dari profil (interpolasi linear). */
export function offsetAt(profile, z) {
  if (z <= profile[0].z) return { ...profile[0].o };
  for (let k = 0; k + 1 < profile.length; k++) {
    const a = profile[k], b = profile[k + 1];
    if (z > b.z) continue;
    if (!(b.z > a.z)) return { ...b.o };
    const f = (z - a.z) / (b.z - a.z);
    const o = {};
    for (const s of ['l', 'r', 'f', 'b']) o[s] = a.o[s] + (b.o[s] - a.o[s]) * f;
    return o;
  }
  return { ...profile[profile.length - 1].o };
}

const rr = (r) => ({ x0: R6(r.x0), y0: R6(r.y0), x1: R6(r.x1), y1: R6(r.y1) });
const inset = (r, d) => ({ x0: r.x0 + d, y0: r.y0 + d, x1: r.x1 - d, y1: r.y1 - d });
const sameRect = (a, b, eps = 0.3) => Math.abs(a.x0 - b.x0) < eps && Math.abs(a.y0 - b.y0) < eps
  && Math.abs(a.x1 - b.x1) < eps && Math.abs(a.y1 - b.y1) < eps;

/** Empat tanda L di bucu segi empat r (poligaris terbuka, tiga titik setiap satu). */
export function cornerMarks(r) {
  const leg = Math.min(MARK_LEG, (r.x1 - r.x0) / 4, (r.y1 - r.y0) / 4);
  return [
    [[r.x0 + leg, r.y0], [r.x0, r.y0], [r.x0, r.y0 + leg]],
    [[r.x1 - leg, r.y0], [r.x1, r.y0], [r.x1, r.y0 + leg]],
    [[r.x1 - leg, r.y1], [r.x1, r.y1], [r.x1, r.y1 - leg]],
    [[r.x0 + leg, r.y1], [r.x0, r.y1], [r.x0, r.y1 - leg]],
  ].map((l) => l.map(([x, y]) => [R6(x), R6(y)]));
}

/**
 * Lapisan tapak laser bagi parameter `p` (sudah dibundarkan oleh cleanParams)
 * dan ukuran `d` (derive). Pulangkan { T, N, grooveLayers, pocketLayers,
 * slotLayers, layers } - `layers` dari bawah, setiap satu { index, n, z0, z1,
 * rect, groove, parts, marks }. `parts` ialah keping fizikal:
 *   { id, label, kind: 'plate' | 'frame' | 'centre', outline, holes }
 * dan `marks` tanda penjajaran (poligaris) yang dipotong ringan pada lapisan
 * itu untuk lapisan di atasnya.
 */
export function laserLayers(p, d) {
  const T = p.boardT;
  const N = Math.max(1, Math.round(p.baseH / T));
  const g = Math.max(1, Math.round(p.grooveDepth / T));
  const pk = d.pocket ? Math.max(1, Math.round(p.pocketDepth / T)) : 0;
  const sl = d.slot ? Math.max(1, Math.round(p.slotDepth / T)) : 0;
  const layers = [];
  for (let i = 0; i < N; i++) {
    const o = offsetAt(d.profile, (i + 0.5) * T);
    const rect = rr({ x0: d.top.x0 - o.l, y0: d.top.y0 - o.f, x1: d.top.x1 + o.r, y1: d.top.y1 + o.b });
    const fromTop = N - 1 - i;   // 0 = lapisan paling atas
    const n = i + 1;
    const holes = [];
    if (fromTop < pk) holes.push(rr(d.pocket));
    if (fromTop < sl) holes.push(rr(d.slot));
    const groove = fromTop < g;
    const parts = groove
      ? [
        { id: `L${n}-bingkai`, label: `L${n} bingkai`, kind: 'frame', outline: rect, holes: [rr(d.groove)] },
        { id: `L${n}-tengah`, label: `L${n} tengah`, kind: 'centre', outline: rr(d.grooveIn), holes },
      ]
      : [{ id: `L${n}`, label: `L${n}`, kind: 'plate', outline: rect, holes }];
    layers.push({ index: i, n, z0: R6(i * T), z1: R6((i + 1) * T), rect, groove, parts, marks: [] });
  }
  // Tanda: di mana keping lapisan atas duduk, bila ia tidak sekadar sama rata
  // dengan tepi lapisan ini.
  for (let i = 0; i + 1 < N; i++) {
    const here = layers[i];
    const up = layers[i + 1];
    if (!sameRect(up.rect, here.rect)) here.marks.push(...cornerMarks(inset(up.rect, MARK_IN)));
    if (up.groove && !here.groove) here.marks.push(...cornerMarks(inset(rr(d.grooveIn), MARK_IN)));
  }
  return { T, N, grooveLayers: g, pocketLayers: pk, slotLayers: sl, layers };
}

const expand = (r, k) => ({ x0: r.x0 - k, y0: r.y0 - k, x1: r.x1 + k, y1: r.y1 + k });
const ring = (r) => [[r.x0, r.y0], [r.x1, r.y0], [r.x1, r.y1], [r.x0, r.y1]];

/**
 * Keping untuk fail potong: satu bagi setiap lapisan (bingkai dan tengah
 * berkongsi satu segi empat papan). `rings` - garis potong tertutup, dengan
 * kerf: tepi luar dibesarkan, lubang dikecilkan, setiap satu k/2, jadi keping
 * yang keluar dari mesin ialah saiz siap. `scores` - tanda penjajaran, tanpa
 * kerf. Koordinat tempatan dari bucu kiri bawah keping (saiz dilukis).
 */
export function layerPieces(stack, kerf = 0, { marks = true } = {}) {
  const k = kerf / 2;
  return stack.layers.map((L) => {
    const box = expand(L.rect, k);
    const shift = ([x, y]) => [R6(x - box.x0), R6(y - box.y0)];
    const rings = [];
    for (const part of L.parts) {
      rings.push(ring(expand(part.outline, k)).map(shift));
      for (const hole of part.holes) rings.push(ring(expand(hole, -k)).map(shift));
    }
    return {
      id: `L${L.n}`,
      label: `L${L.n}${L.n === 1 ? ' bawah' : L.n === stack.N ? ' atas' : ''}`,
      nominal: { w: R6(L.rect.x1 - L.rect.x0), h: R6(L.rect.y1 - L.rect.y0) },
      w: R6(box.x1 - box.x0),
      h: R6(box.y1 - box.y0),
      parts: L.parts.length,
      rings,
      scores: marks ? L.marks.map((m) => m.map(shift)) : [],
    };
  });
}
