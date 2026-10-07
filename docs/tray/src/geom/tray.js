// Penjana panel untuk Tray Organizer - dulang terbuka berpetak, laser cut.
//
// Skema sendi, dilanjutkan daripada Box Maker (docs/boxmaker/src/geom/box.js)
// dan disahkan lawan boxes.py TypeTray:
//   * bucu menegak - dinding depan/belakang bawa tab yang terjulur, dinding
//     kiri/kanan bawa takuk padanan. Badan depan/belakang lebar (L - 2t),
//     kiri/kanan penuh W.
//   * lantai - duduk `floorOffset` di atas tepi bawah dan tolak tenon tembus
//     ke dalam mortis pada keempat-empat dinding. Setiap tenon dibelah slit
//     kelegaan supaya boleh mampat jadi interference fit.
//   * pembahagi - panel dalaman berdiri atas lantai. Ada N pembahagi-X (yang
//     merentang Y, memisahkan lajur) dan M pembahagi-Y (merentang X,
//     memisahkan baris), pada SEBARANG kedudukan - grid tak perlu seragam.
//     Setiap persilangan ialah half-lap: pembahagi-X ditakuk dari TEPI ATAS,
//     pembahagi-Y dari TEPI BAWAH, masing-masing separuh tinggi, dan yang
//     kedua jatuh terus ke atas yang pertama. Ini corak yang sama Box Maker
//     guna untuk kes 4 petak, dan yang TypeTray guna untuk sebarang grid
//     (`SlottedEdge(..., slots=0.5*hi)` pada arah bertentangan).
//   * dua gaya pembahagi:
//       'tetap' - hujung pembahagi bertenon tembus dinding, macam lantai.
//                 Dilekat kekal; paling kukuh.
//       'alih'  - dinding dipotong slot terbuka dari tepi atas turun ke
//                 paras lantai, selebar t + slack; pembahagi ialah segi empat
//                 kosong yang gelongsor masuk dari atas. Boleh tanggal dan
//                 susun semula, macam boxes.py DividerTray.
//
// Koordinat panel tempatan dalam milimeter, y ke atas, asalan di bucu bbox.
// `frame` setiap panel memetakan (u, v) tempatan ke dunia; `N` ialah normal
// muka LUAR, bahan mengisi ke dalam dari situ.

import {
  sub, len as vlen, norm, dedupe, bbox, translate, offsetPolygon, rect,
} from './path.js';

export const DEFAULTS = {
  length: 220,          // X luar
  width: 160,           // Y luar
  height: 45,           // Z luar
  thickness: 3,
  kerf: 0.2,            // lebar alur laser; laluan potong di-offset separuh daripadanya
  fit: 0.05,            // interference: mortis mengecil sebanyak ini (+ = lebih ketat)
  fingerSize: 13,       // modul sendi; menentukan bilangan finger/tenon
  floorOffset: null,    // null -> satu ketebalan bahan
  reliefSlits: 2,       // slit per tenon lantai (0 matikan)
  slitWidth: 0.4,
  slitOvershoot: 0.4,
  // Grid. Pecahan lebar setiap lajur (sepanjang X) dan kedalaman setiap baris
  // (sepanjang Y). Jumlah tak perlu 1 - dinormalkan. Satu entri = tiada
  // pembahagi pada paksi itu.
  cols: [1, 1, 1],
  rows: [1, 1],
  dividerStyle: 'tetap',  // 'tetap' | 'alih'
  dividerHeight: 100,     // % daripada tinggi dalaman (lantai ke rim)
  slotSlack: 0.2,         // 'alih': kelonggaran lebar slot melebihi t
  fingerPull: 'none',     // 'none' | 'depan' | 'depanBelakang'
  minCell: 12,            // petak paling kecil yang dibenarkan, mm
};

export const PANEL_LABELS = {
  front: 'Depan', back: 'Belakang', left: 'Kiri', right: 'Kanan', bottom: 'Lantai',
};

const MAX_DIV = 12; // pembahagi per paksi; lebih daripada ini bukan dulang lagi

/**
 * Larian sekata ciri sendi berpusat pada satu tepi, selang ciri/jurang satu
 * modul setiap satu. n = round(edge / 2m) - 1, sama seperti Box Maker.
 */
export function featureLayout(edge, module_) {
  let n = Math.round(edge / (2 * module_)) - 1;
  n = Math.max(1, Math.min(24, n));
  let w = module_;
  const minMargin = Math.max(1.5, module_ * 0.3);
  const maxBlock = edge - 2 * minMargin;
  let block = (2 * n - 1) * w;
  if (block > maxBlock) {
    if (maxBlock <= 0) return [{ s: edge * 0.25, e: edge * 0.75 }];
    w = maxBlock / (2 * n - 1);
    block = maxBlock;
  }
  const start = (edge - block) / 2;
  const out = [];
  for (let i = 0; i < n; i++) {
    const s = start + i * 2 * w;
    out.push({ s, e: s + w });
  }
  return out;
}

const flipFeatures = (feats, L) =>
  feats.map((f) => ({ ...f, s: L - f.e, e: L - f.s })).reverse();

const shiftFeatures = (feats, off) =>
  feats.map((f) => ({ ...f, s: f.s - off, e: f.e - off }));

/** Profil satu ciri dalam ruang (sepanjang, offset), berjalan dari s ke e. */
function featureProfile(s, e, depth, opts = {}) {
  const out = [[s, 0]];
  const sgn = Math.sign(depth) || 1;

  // Lekuk separuh bulat - takuk jari pada tepi atas dinding.
  if (opts.arc) {
    const rr = (e - s) / 2;
    const c = (s + e) / 2;
    const steps = 26;
    for (let i = 0; i <= steps; i++) {
      const phi = (i / steps) * Math.PI;
      out.push([c - rr * Math.cos(phi), depth * Math.sin(phi)]);
    }
    out.push([e, 0]);
    return out;
  }

  out.push([s, depth]);

  const slits = opts.slits;
  if (slits && slits.count > 0 && e - s > slits.width * (slits.count + 2)) {
    const seg = (e - s) / (slits.count + 1);
    for (let i = 1; i <= slits.count; i++) {
      const c = s + seg * i;
      out.push([c - slits.width / 2, depth]);
      out.push([c - slits.width / 2, depth - sgn * slits.depth]);
      out.push([c + slits.width / 2, depth - sgn * slits.depth]);
      out.push([c + slits.width / 2, depth]);
    }
  }

  out.push([e, depth]);
  out.push([e, 0]);
  return out;
}

/**
 * Jalan satu tepi a->b, keluarkan `feats` sebagai tab (depth > 0, ke luar
 * bagi gelang CCW) atau takuk (depth < 0). Pulangkan titik tepi ini, tanpa `b`.
 * Setiap ciri boleh bawa `depth` dan `opts` sendiri. Ciri mesti tersusun.
 */
function edgeRun(a, b, feats, depth, opts = {}) {
  const d = sub(b, a);
  const L = vlen(d);
  const u = norm(d);
  const n = [u[1], -u[0]]; // normal luar gelang CCW
  const P = (t, o) => [a[0] + u[0] * t + n[0] * o, a[1] + u[1] * t + n[1] * o];
  const pts = [a];
  for (const f of feats || []) {
    const s = Math.max(0, f.s);
    const e = Math.min(L, f.e);
    if (e - s <= 1e-6) continue;
    const fd = f.depth == null ? depth : f.depth;
    const fo = f.opts || opts;
    for (const [t, o] of featureProfile(s, e, fd, fo)) pts.push(P(t, o));
  }
  return pts;
}

function shrinkRect(x, y, w, h, by) {
  const b = by / 2;
  return rect(x + b, y + b, Math.max(0.2, w - by), Math.max(0.2, h - by));
}

function normalisePanel(panel) {
  const bb = bbox([panel.outline, ...panel.holes].flat());
  panel.outline = translate(panel.outline, -bb.x0, -bb.y0);
  panel.holes = panel.holes.map((h) => translate(h, -bb.x0, -bb.y0));
  panel.size = { w: bb.w, h: bb.h };
  panel.originShift = [bb.x0, bb.y0];
  return panel;
}

/** Bersihkan senarai pecahan: nombor positif, maksimum MAX_DIV + 1 entri. */
export function cleanFractions(arr, fallback = [1]) {
  const out = (Array.isArray(arr) ? arr : [])
    .map((v) => Number(v))
    .filter((v) => Number.isFinite(v) && v > 0)
    .slice(0, MAX_DIV + 1);
  return out.length ? out : fallback.slice();
}

/**
 * Saiz dalaman setiap petak sepanjang satu paksi, dalam mm.
 * `inner` ialah ruang dalam dinding; (n - 1) ketebalan diambil untuk pembahagi.
 * Pulangkan { sizes, span, ok } - `ok` palsu jika mana-mana petak lebih kecil
 * daripada `minCell` (geometri tetap dijana supaya UI boleh tunjuk kenapa).
 */
export function gridSizes(fractions, inner, t, minCell = DEFAULTS.minCell) {
  const fr = cleanFractions(fractions);
  const n = fr.length;
  const span = inner - (n - 1) * t;
  const sum = fr.reduce((a, b) => a + b, 0);
  const sizes = fr.map((f) => Math.max(0.5, (span * f) / sum));
  const ok = span > 0 && sizes.every((s) => s >= minCell - 1e-6);
  return { sizes, span, ok };
}

/** Garis tengah pembahagi sepanjang satu paksi, dari dinding luar sifar. */
function dividerCentres(sizes, t) {
  const out = [];
  let at = t;
  for (let i = 0; i < sizes.length - 1; i++) {
    at += sizes[i];
    out.push(at + t / 2);
    at += t;
  }
  return out;
}

/** Bina setiap panel untuk parameter yang diberi. */
export function buildTray(input = {}) {
  const p = { ...DEFAULTS, ...input };
  const t = Math.max(0.5, Number(p.thickness) || DEFAULTS.thickness);
  const L = Math.max(t * 8, Number(p.length) || DEFAULTS.length);
  const W = Math.max(t * 8, Number(p.width) || DEFAULTS.width);
  const H = Math.max(t * 5, Number(p.height) || DEFAULTS.height);
  const wallH = H;
  const floorRaw = p.floorOffset == null ? t : Math.max(0, Number(p.floorOffset) || 0);
  // Lantai mesti tinggalkan ruang untuk pembahagi berdiri.
  const floorZ = Math.min(floorRaw, Math.max(0, wallH - 4 * t));
  const m = Math.max(3, Number(p.fingerSize) || DEFAULTS.fingerSize);
  const fit = Math.max(0, Number(p.fit) || 0);
  const minCell = Math.max(3, Number(p.minCell) || DEFAULTS.minCell);
  const alih = p.dividerStyle === 'alih';
  const slack = Math.max(0, Number(p.slotSlack) || 0);

  const vFeats = featureLayout(wallH, m); // sendi bucu menegak
  const xFeats = featureLayout(L, m);     // tenon lantai sepanjang X
  const yFeats = featureLayout(W, m);     // tenon lantai sepanjang Y

  const slits = p.reliefSlits > 0
    ? { count: p.reliefSlits, width: p.slitWidth, depth: t + Math.max(0.1, p.slitOvershoot) }
    : null;

  // ---- grid ---------------------------------------------------------------
  const innerL = L - 2 * t;
  const innerW = W - 2 * t;
  const colsG = gridSizes(p.cols, innerL, t, minCell);
  const rowsG = gridSizes(p.rows, innerW, t, minCell);
  const colW = colsG.sizes;
  const rowD = rowsG.sizes;
  const xDiv = dividerCentres(colW, t); // garis tengah pembahagi-X (memisah lajur)
  const yDiv = dividerCentres(rowD, t); // garis tengah pembahagi-Y (memisah baris)

  const cells = [];
  {
    let y = t;
    for (let j = 0; j < rowD.length; j++) {
      let x = t;
      for (let i = 0; i < colW.length; i++) {
        cells.push({ i, j, x, y, w: colW[i], h: rowD[j] });
        x += colW[i] + t;
      }
      y += rowD[j] + t;
    }
  }

  // ---- pembahagi ----------------------------------------------------------
  const divBase = floorZ + t;                     // muka atas lantai
  const intH = wallH - divBase;                   // lantai ke rim
  const divFrac = Math.min(1, Math.max(0.2, (Number(p.dividerHeight) || 100) / 100));
  const divH = intH * divFrac;
  const anyDiv = xDiv.length + yDiv.length > 0;
  const divOK = anyDiv && divH > Math.max(6, t * 2.5) && colsG.ok && rowsG.ok;
  // Pembahagi hanya berdiri tegak kalau dipasak di lebih satu tempat, jadi
  // modulnya dihadkan kepada seperenam tinggi - sentiasa >= 2 tenon.
  const divFeats = divOK && !alih
    ? featureLayout(divH, Math.max(2, Math.min(m, divH / 6)))
    : [];
  // Mortis dinding mengecil sebanyak `fit`. Dalam gaya 'alih' slot pembahagi
  // turun tepat ke paras lantai (divBase) dan mortis lantai naik sampai
  // divBase juga - kalau kedua-duanya berkongsi u, satu sliver bahan setebal
  // fit/2 memisahkannya. Dengan fit sifar sliver itu sifar dan lubang MENYENTUH
  // garis luar, iaitu gelang rosak. Jadi 'alih' menjamin sliver sekurang-
  // kurangnya 0.05 mm; ia terbakar hilang oleh kerf, dan slot sekadar terbuka
  // ke dalam mortis yang sudah pun diisi tenon lantai.
  const mortFit = alih ? Math.max(fit, 0.1) : fit;
  /** Mortis untuk satu pembahagi 'tetap', berpusat pada `u` dalam bingkai dinding. */
  const divMortises = (u) =>
    divFeats.map((f) => shrinkRect(u - t / 2, divBase + f.s, t, f.e - f.s, fit));
  // 'alih': slot terbuka dari tepi atas turun ke paras lantai.
  const slotW = t + slack;
  const slotDepth = wallH - divBase;
  /** Kedudukan `u` dinyatakan sebagai jarak sepanjang jalan dari `from` ke `to`. */
  const alongWalk = (u, from, to) => (to > from ? u - from : from - u);
  /** Ciri slot pada tepi atas, untuk jalan dari `from` ke `to` (koordinat u). */
  const topSlots = (us, from, to) => {
    if (!divOK || !alih) return [];
    return us
      .map((u) => {
        const pos = alongWalk(u, from, to);
        return { s: pos - slotW / 2, e: pos + slotW / 2, depth: -slotDepth };
      })
      .sort((a, b) => a.s - b.s);
  };

  // ---- takuk jari ---------------------------------------------------------
  const pullOn = p.fingerPull === 'depan' || p.fingerPull === 'depanBelakang';
  const pullBoth = p.fingerPull === 'depanBelakang';
  const notchR = Math.max(5, Math.min(L * 0.08, 16));
  // Lekuk berhenti jelas di atas jalur mortis lantai.
  const notchDepth = Math.min(notchR * 0.8, Math.max(0, intH - 4));
  // Paras tertinggi yang dicapai mortis pembahagi 'tetap' pada dinding.
  const mortTop = divFeats.length ? divBase + divFeats[divFeats.length - 1].e : 0;
  /**
   * Selang tepi atas (koordinat jalan) yang lekuk jari tidak boleh menyentuh:
   * slot 'alih' (yang memotong tepi atas), atau jalur mortis 'tetap' yang naik
   * sampai ke kawasan lekuk. Lekuk yang memotong salah satunya memecahkan
   * gelang atau menolak lubang keluar daripada garis luar.
   */
  const topBlockers = (us, from, to) => {
    if (!divOK) return [];
    if (!alih && mortTop < wallH - notchDepth - 0.5) return [];
    const w = alih ? slotW : t + 2;
    return us.map((u) => {
      const pos = alongWalk(u, from, to);
      return { s: pos - w / 2, e: pos + w / 2 };
    });
  };
  /** Ciri lekuk jari di tengah tepi atas, jalan dari `from` ke `to`. */
  const pullFeat = (from, to, blockers) => {
    if (!pullOn || notchDepth < 2) return [];
    const mid = Math.abs(to - from) / 2;
    const f = { s: mid - notchR, e: mid + notchR, depth: -notchDepth, opts: { arc: true } };
    // Lekuk mengalah kepada pembahagi; derived.warnings memberitahu kenapa.
    if (blockers.some((b) => b.e > f.s && b.s < f.e)) return null;
    return [f];
  };

  const warnings = [];
  if (anyDiv && !colsG.ok) warnings.push('lajur');
  if (anyDiv && !rowsG.ok) warnings.push('baris');
  if (anyDiv && divH <= Math.max(6, t * 2.5)) warnings.push('tinggi');

  const panels = [];

  // ---- depan / belakang ---------------------------------------------------
  // `uOf` memetakan X kotak ke u tempatan panel. Depan: u = x. Belakang: u = L - x.
  const buildWall = (uOf, withPull) => {
    const x0 = t;
    const x1 = L - t;
    const us = xDiv.map(uOf);
    const slots = topSlots(us, x1, x0);
    let pull = withPull ? pullFeat(x1, x0, topBlockers(us, x1, x0)) : [];
    if (pull === null) { warnings.push('takuk'); pull = []; }
    const top = [...slots, ...pull].sort((a, b) => a.s - b.s);
    const pts = [
      ...edgeRun([x0, 0], [x1, 0], [], 0),
      ...edgeRun([x1, 0], [x1, wallH], vFeats, t),
      ...edgeRun([x1, wallH], [x0, wallH], top, 0),
      ...edgeRun([x0, wallH], [x0, 0], flipFeatures(vFeats, wallH), t),
    ];
    const holes = xFeats.map((f) => shrinkRect(f.s, floorZ, f.e - f.s, t, mortFit));
    if (divOK && !alih) for (const u of us) holes.push(...divMortises(u));
    return { outline: dedupe(pts), holes };
  };

  {
    const g = buildWall((x) => x, pullOn);
    panels.push(normalisePanel({
      id: 'front', label: PANEL_LABELS.front, outline: g.outline, holes: g.holes,
      frame: { origin: [0, 0, 0], U: [1, 0, 0], V: [0, 0, 1], N: [0, -1, 0] },
    }));
  }
  {
    const g = buildWall((x) => L - x, pullBoth);
    panels.push(normalisePanel({
      id: 'back', label: PANEL_LABELS.back, outline: g.outline, holes: g.holes,
      frame: { origin: [L, W, 0], U: [-1, 0, 0], V: [0, 0, 1], N: [0, 1, 0] },
    }));
  }

  // ---- kiri / kanan -------------------------------------------------------
  // `uOf` memetakan Y kotak ke u tempatan. Kiri: u = W - y. Kanan: u = y.
  const buildSide = (uOf) => {
    const us = yDiv.map(uOf);
    const slots = topSlots(us, W, 0);
    const pts = [
      ...edgeRun([0, 0], [W, 0], [], 0),
      ...edgeRun([W, 0], [W, wallH], vFeats, -t),
      ...edgeRun([W, wallH], [0, wallH], slots, 0),
      ...edgeRun([0, wallH], [0, 0], flipFeatures(vFeats, wallH), -t),
    ];
    const holes = yFeats.map((f) => shrinkRect(f.s, floorZ, f.e - f.s, t, mortFit));
    if (divOK && !alih) for (const u of us) holes.push(...divMortises(u));
    return { outline: dedupe(pts), holes };
  };

  {
    const g = buildSide((y) => W - y);
    panels.push(normalisePanel({
      id: 'left', label: PANEL_LABELS.left, outline: g.outline, holes: g.holes,
      frame: { origin: [0, W, 0], U: [0, -1, 0], V: [0, 0, 1], N: [-1, 0, 0] },
    }));
  }
  {
    const g = buildSide((y) => y);
    panels.push(normalisePanel({
      id: 'right', label: PANEL_LABELS.right, outline: g.outline, holes: g.holes,
      frame: { origin: [L, 0, 0], U: [0, 1, 0], V: [0, 0, 1], N: [1, 0, 0] },
    }));
  }

  // ---- lantai -------------------------------------------------------------
  {
    const x0 = t;
    const x1 = L - t;
    const y0 = t;
    const y1 = W - t;
    const o = { slits };
    const pts = [
      ...edgeRun([x0, y0], [x1, y0], shiftFeatures(xFeats, x0), t, o),
      ...edgeRun([x1, y0], [x1, y1], shiftFeatures(yFeats, y0), t, o),
      ...edgeRun([x1, y1], [x0, y1], shiftFeatures(flipFeatures(xFeats, L), x0), t, o),
      ...edgeRun([x0, y1], [x0, y0], shiftFeatures(flipFeatures(yFeats, W), y0), t, o),
    ];
    panels.push(normalisePanel({
      id: 'bottom', label: PANEL_LABELS.bottom, outline: dedupe(pts), holes: [],
      frame: { origin: [0, 0, floorZ + t], U: [1, 0, 0], V: [0, 1, 0], N: [0, 0, 1] },
    }));
  }

  // ---- panel pembahagi ----------------------------------------------------
  // `span` ialah jarak dinding-luar ke dinding-luar yang dirapatkan panel.
  // 'tetap': badan berhenti di muka dalam (t .. span - t) dan tenon menjangkau
  //          keluar tembus dinding.
  // 'alih':  badan masuk ke dalam slot dinding, berhenti 0.3 mm dari muka luar
  //          supaya tidak terjulur.
  // `laps` ialah kedudukan (dalam u) di mana panel ini bersilang dengan
  // pembahagi arah bertentangan; `lap` 'top' menakuk dari atas, 'bottom' dari
  // bawah. Lebar takuk = t - fit, sama ketat dengan mortis.
  const lapW = Math.max(0.3, t - fit);
  function buildDivider(span, lap, laps) {
    const a = alih ? 0.3 : t;
    const b = alih ? span - 0.3 : span - t;
    const half = divH / 2;
    const inside = laps.filter((u) => u - lapW / 2 > a + 0.5 && u + lapW / 2 < b - 0.5);
    // Tepi atas dijalani b -> a, tepi bawah a -> b.
    const top = lap === 'top'
      ? inside.map((u) => ({ s: (b - u) - lapW / 2, e: (b - u) + lapW / 2 })).sort((x, y) => x.s - y.s)
      : [];
    const bottom = lap === 'bottom'
      ? inside.map((u) => ({ s: (u - a) - lapW / 2, e: (u - a) + lapW / 2 })).sort((x, y) => x.s - y.s)
      : [];
    const endFeats = alih ? [] : divFeats;
    return dedupe([
      ...edgeRun([a, 0], [b, 0], bottom, -half),
      ...edgeRun([b, 0], [b, divH], endFeats, t),
      ...edgeRun([b, divH], [a, divH], top, -half),
      ...edgeRun([a, divH], [a, 0], flipFeatures(endFeats, divH), t),
    ]);
  }

  const dividers = { x: [], y: [] };
  if (divOK) {
    xDiv.forEach((x, i) => {
      const id = `divX${i + 1}`;
      const label = `Pembahagi X${i + 1}`;
      panels.push(normalisePanel({
        id, label, outline: buildDivider(W, 'top', yDiv), holes: [],
        frame: { origin: [x + t / 2, 0, divBase], U: [0, 1, 0], V: [0, 0, 1], N: [1, 0, 0] },
      }));
      dividers.x.push({ id, x });
    });
    yDiv.forEach((y, j) => {
      const id = `divY${j + 1}`;
      const label = `Pembahagi Y${j + 1}`;
      panels.push(normalisePanel({
        id, label, outline: buildDivider(L, 'bottom', xDiv), holes: [],
        frame: { origin: [0, y - t / 2, divBase], U: [1, 0, 0], V: [0, 0, 1], N: [0, -1, 0] },
      }));
      dividers.y.push({ id, y });
    });
  }

  // ---- pampasan kerf ------------------------------------------------------
  const k = Math.max(0, Number(p.kerf) || 0) / 2;
  for (const pan of panels) {
    pan.outlineNominal = pan.outline;
    pan.holesNominal = pan.holes;
    if (k > 0) {
      pan.outline = offsetPolygon(pan.outline, k);
      pan.holes = pan.holes.map((h) => offsetPolygon(h, -k));
    }
    pan.thickness = t;
  }

  return {
    params: {
      ...p, thickness: t, length: L, width: W, height: H,
      cols: cleanFractions(p.cols), rows: cleanFractions(p.rows),
    },
    derived: {
      wallH, floorZ, divBase, intH, divH, divOK, alih,
      innerL, innerW, colW, rowD, xDiv, yDiv, cells,
      gridOK: colsG.ok && rowsG.ok,
      vFeats, xFeats, yFeats, divFeats,
      slotW, lapW, notchR, notchDepth,
      dividers,
      warnings,
      panelCount: panels.length,
      cellCount: cells.length,
    },
    panels,
  };
}

/**
 * Petakan titik dalam koordinat panel ternormal ke dunia (mm).
 * `depth` negatif = ke dalam papan.
 */
export function panelToWorld(panel, u, v, depth = 0) {
  const { origin, U, V, N } = panel.frame;
  const su = u + panel.originShift[0];
  const sv = v + panel.originShift[1];
  return [
    origin[0] + U[0] * su + V[0] * sv + N[0] * depth,
    origin[1] + U[1] * su + V[1] * sv + N[1] * depth,
    origin[2] + U[2] * su + V[2] * sv + N[2] * depth,
  ];
}
