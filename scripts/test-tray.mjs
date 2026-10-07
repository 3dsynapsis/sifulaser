// Ujian geometri Tray Organizer. Tiada kebergantungan; node sahaja.
//
//     node scripts/test-tray.mjs
//
// Mengimport terus daripada docs/tray/src - iaitu kod yang sifulaser.com
// hidangkan - jadi apa yang lulus di sini ialah apa yang pelanggan potong.
//
// Apa yang disemak dan kenapa:
//   * bilangan panel        - 5 + (lajur-1) + (baris-1); panel hilang = dulang
//                             tak boleh dipasang.
//   * gelang mudah          - setiap garis luar CCW, keluasan positif, dan
//                             TIADA segmen bersilang sendiri. Gelang bersilang
//                             sendiri ialah fail SVG yang nampak elok di skrin
//                             dan rosak di mesin.
//   * dimensi nominal       - dinding dan lantai menjangkau muka luar (tenon
//                             tembus flush); tinggi pembahagi ikut peratus.
//   * mortis = tenon        - setiap pembahagi 'tetap' ada mortis pada dinding
//                             yang betul, pada kedudukan yang betul, termasuk
//                             dinding BELAKANG dan KIRI yang u-nya terbalik.
//   * half-lap              - pembahagi-X ditakuk dari atas, pembahagi-Y dari
//                             bawah, pada setiap persilangan, separuh tinggi.
//   * 'alih'                - slot dinding lebar t + slack, dari rim ke paras
//                             lantai; pembahagi tiada tenon.
//   * kerf                  - garis luar membesar sebanyak kerf, lubang
//                             mengecil sebanyak kerf.
//   * input teruk           - sifar, negatif, NaN, lajur berlebihan: tak
//                             pernah campak, sentiasa pulangkan dulang sah.

import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const GEOM = path.join(here, '..', 'docs', 'tray', 'src', 'geom');
const { buildTray, DEFAULTS, gridSizes, cleanFractions } =
  await import(pathToFileURL(path.join(GEOM, 'tray.js')).href);
const { area, bbox } = await import(pathToFileURL(path.join(GEOM, 'path.js')).href);

let passed = 0;
let failed = 0;
const fails = [];

function check(name, cond, detail = '') {
  if (cond) { passed++; return; }
  failed++;
  fails.push(`${name}${detail ? ` - ${detail}` : ''}`);
}

const near = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;

// ---- geometri asas --------------------------------------------------------

/** Dua segmen tertutup bersilang di dalaman (bukan sekadar sentuh di hujung). */
function segsCross(a, b, c, d) {
  const o = (p, q, r) => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
  const o1 = o(a, b, c), o2 = o(a, b, d), o3 = o(c, d, a), o4 = o(c, d, b);
  const eps = 1e-9;
  return (o1 > eps && o2 < -eps || o1 < -eps && o2 > eps)
      && (o3 > eps && o4 < -eps || o3 < -eps && o4 > eps);
}

/** Gelang ringkas: tiada dua segmen bukan jiran yang bersilang. O(n^2), n < 400. */
function isSimple(ring) {
  const n = ring.length;
  for (let i = 0; i < n; i++) {
    const a = ring[i], b = ring[(i + 1) % n];
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue; // jiran melalui penutup
      const c = ring[j], d = ring[(j + 1) % n];
      if (segsCross(a, b, c, d)) return false;
    }
  }
  return true;
}

function pointInRing(pt, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > pt[1]) !== (yj > pt[1])
        && pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Titik (u, v) dalam bingkai panel ASAL (sebelum normalisasi) ada di dalam bahan? */
function inPanel(panel, u, v) {
  const [su, sv] = panel.originShift;
  const pt = [u - su, v - sv];
  if (!pointInRing(pt, panel.outlineNominal)) return false;
  for (const h of panel.holesNominal) if (pointInRing(pt, h)) return false;
  return true;
}

const byId = (tray, id) => tray.panels.find((p) => p.id === id);

// ---- semakan yang dikongsi setiap konfigurasi -----------------------------

function checkInvariants(label, params) {
  const tray = buildTray(params);
  const { derived: d, params: p, panels } = tray;
  const t = p.thickness;
  const nX = d.xDiv.length, nY = d.yDiv.length;
  const expectDiv = d.divOK ? nX + nY : 0;

  check(`${label}: bilangan panel`, panels.length === 5 + expectDiv,
    `dapat ${panels.length}, jangka ${5 + expectDiv}`);

  for (const pan of panels) {
    check(`${label}/${pan.id}: garis luar CCW`, area(pan.outlineNominal) > 0);
    check(`${label}/${pan.id}: garis luar ringkas`, isSimple(pan.outlineNominal));
    check(`${label}/${pan.id}: garis luar (kerf) ringkas`, isSimple(pan.outline));
    for (const [k, h] of pan.holesNominal.entries()) {
      check(`${label}/${pan.id}: lubang ${k} CCW`, area(h) > 0);
      check(`${label}/${pan.id}: lubang ${k} ringkas`, isSimple(h));
      // Setiap lubang mesti duduk sepenuhnya di dalam garis luar.
      check(`${label}/${pan.id}: lubang ${k} di dalam`,
        h.every((pt) => pointInRing(pt, pan.outlineNominal)));
    }
    check(`${label}/${pan.id}: size padan bbox`, (() => {
      const bb = bbox([pan.outlineNominal, ...pan.holesNominal].flat());
      return near(bb.w, pan.size.w, 1e-6) && near(bb.h, pan.size.h, 1e-6);
    })());
  }

  // Dimensi nominal: tab/tenon tembus ke muka luar, jadi bbox = dimensi luar.
  const L = p.length, W = p.width, H = p.height;
  const bbOf = (id) => bbox(byId(tray, id).outlineNominal);
  check(`${label}: depan ${L}x${H}`, near(bbOf('front').w, L) && near(bbOf('front').h, H));
  check(`${label}: belakang ${L}x${H}`, near(bbOf('back').w, L) && near(bbOf('back').h, H));
  check(`${label}: kiri ${W}x${H}`, near(bbOf('left').w, W) && near(bbOf('left').h, H));
  check(`${label}: kanan ${W}x${H}`, near(bbOf('right').w, W) && near(bbOf('right').h, H));
  check(`${label}: lantai ${L}x${W}`, near(bbOf('bottom').w, L) && near(bbOf('bottom').h, W));

  // Kerf: garis luar membesar sebanyak kerf (k/2 setiap sisi), lubang mengecil.
  const k = p.kerf;
  for (const pan of panels) {
    const a = bbox(pan.outlineNominal), b = bbox(pan.outline);
    check(`${label}/${pan.id}: kerf garis luar`, near(b.w - a.w, k, 1e-6) && near(b.h - a.h, k, 1e-6),
      `dw=${(b.w - a.w).toFixed(4)} dh=${(b.h - a.h).toFixed(4)} kerf=${k}`);
    pan.holesNominal.forEach((h, i) => {
      const ha = bbox(h), hb = bbox(pan.holes[i]);
      check(`${label}/${pan.id}: kerf lubang ${i}`, near(ha.w - hb.w, k, 1e-6) && near(ha.h - hb.h, k, 1e-6));
    });
  }

  if (!d.divOK) return tray;

  // Pembahagi: saiz dan half-lap.
  const half = d.divH / 2;
  d.dividers.x.forEach(({ id, x }, i) => {
    const pan = byId(tray, id);
    const bb = bbox(pan.outlineNominal);
    const wantW = d.alih ? W - 0.6 : W;
    check(`${label}/${id}: lebar ${wantW.toFixed(1)}`, near(bb.w, wantW, 1e-6), `dapat ${bb.w}`);
    check(`${label}/${id}: tinggi divH`, near(bb.h, d.divH, 1e-6));
    check(`${label}/${id}: bingkai pada xDiv`, near(pan.frame.origin[0], x + t / 2));
    // Takuk dari ATAS pada setiap yDiv: atas kosong, bawah ada bahan.
    for (const y of d.yDiv) {
      check(`${label}/${id}: half-lap atas kosong @y=${y.toFixed(1)}`, !inPanel(pan, y, d.divH - half / 2));
      check(`${label}/${id}: half-lap bawah berisi @y=${y.toFixed(1)}`, inPanel(pan, y, half / 2));
      // Lebar takuk = t - fit: sedikit di luar tepi takuk mesti berisi.
      const lw = d.lapW;
      check(`${label}/${id}: takuk lebar betul @y=${y.toFixed(1)}`,
        inPanel(pan, y - lw / 2 - 0.15, d.divH - half / 2) && inPanel(pan, y + lw / 2 + 0.15, d.divH - half / 2)
        && !inPanel(pan, y - lw / 2 + 0.05, d.divH - half / 2) && !inPanel(pan, y + lw / 2 - 0.05, d.divH - half / 2));
      // Dalam takuk tepat separuh: tepat di bawah paras separuh mesti berisi.
      check(`${label}/${id}: takuk tepat separuh @y=${y.toFixed(1)}`,
        inPanel(pan, y, half - 0.1) && !inPanel(pan, y, half + 0.1));
    }
    // Tenon di hujung ('tetap'): bahan menjangkau u = 0 dalam jalur tenon
    // pertama, dan TIADA bahan di u = 0 di antara dua tenon. 'alih': badan
    // bermula 0.3 mm dari muka luar, jadi u = 0.1 kosong di mana-mana paras.
    if (d.alih) {
      check(`${label}/${id}: alih tiada tenon`, !inPanel(pan, 0.1, d.divH / 2));
    } else {
      const f0 = d.divFeats[0];
      const f1 = d.divFeats[1];
      check(`${label}/${id}: tetap ada tenon`, inPanel(pan, t / 2, (f0.s + f0.e) / 2));
      if (f1) check(`${label}/${id}: jurang antara tenon kosong`, !inPanel(pan, t / 2, (f0.e + f1.s) / 2));
    }
    void i;
  });
  d.dividers.y.forEach(({ id, y }) => {
    const pan = byId(tray, id);
    const bb = bbox(pan.outlineNominal);
    const wantW = d.alih ? L - 0.6 : L;
    check(`${label}/${id}: lebar ${wantW.toFixed(1)}`, near(bb.w, wantW, 1e-6), `dapat ${bb.w}`);
    check(`${label}/${id}: tinggi divH`, near(bb.h, d.divH, 1e-6));
    check(`${label}/${id}: bingkai pada yDiv`, near(pan.frame.origin[1], y - t / 2));
    // Takuk dari BAWAH pada setiap xDiv.
    for (const x of d.xDiv) {
      check(`${label}/${id}: half-lap bawah kosong @x=${x.toFixed(1)}`, !inPanel(pan, x, half / 2));
      check(`${label}/${id}: half-lap atas berisi @x=${x.toFixed(1)}`, inPanel(pan, x, d.divH - half / 2));
      check(`${label}/${id}: takuk tepat separuh @x=${x.toFixed(1)}`,
        inPanel(pan, x, half + 0.1) && !inPanel(pan, x, half - 0.1));
    }
  });

  // Mortis / slot pada dinding, pada u yang betul (belakang dan kiri terbalik).
  const front = byId(tray, 'front'), back = byId(tray, 'back');
  const left = byId(tray, 'left'), right = byId(tray, 'right');
  const zMid = d.divBase + (d.divFeats[0] ? (d.divFeats[0].s + d.divFeats[0].e) / 2 : d.divH / 2);
  // Mortis pembahagi sahaja: mortis lantai duduk di bawah divBase dan boleh
  // berkongsi u yang sama (pembahagi di tengah dinding yang tenon lantainya
  // juga berpusat), jadi ia ditapis keluar mengikut paras, bukan dikira.
  const divHolesAt = (pan, u) => pan.holesNominal.filter((h) => {
    const bb = bbox(h);
    return bb.y0 >= d.divBase - 1e-6 && near((bb.x0 + bb.x1) / 2, u, 1e-6);
  }).length;
  // Di bawah slot: dalam KAKI dinding (antara tepi bawah dan lantai), kerana
  // paras divBase - 0.3 jatuh di dalam mortis lantai kalau u berkongsi.
  const footZ = d.floorZ / 2;

  for (const x of d.xDiv) {
    if (d.alih) {
      const top = H - 0.5;
      // Slot terbuka dari rim ke paras lantai, lebar t + slack.
      for (const [pan, u, nm] of [[front, x, 'depan'], [back, L - x, 'belakang']]) {
        check(`${label}/${nm}: slot kosong @u=${u.toFixed(1)}`, !inPanel(pan, u, top) && !inPanel(pan, u, d.divBase + 0.3));
        check(`${label}/${nm}: bawah slot berisi`, inPanel(pan, u, footZ));
        check(`${label}/${nm}: slot lebar t+slack`,
          inPanel(pan, u - d.slotW / 2 - 0.15, top) && inPanel(pan, u + d.slotW / 2 + 0.15, top)
          && !inPanel(pan, u - d.slotW / 2 + 0.05, top) && !inPanel(pan, u + d.slotW / 2 - 0.05, top));
      }
    } else {
      // Mortis tembus: kosong pada garis tengah pembahagi, berisi t/2+ di sisi.
      for (const [pan, u, nm] of [[front, x, 'depan'], [back, L - x, 'belakang']]) {
        check(`${label}/${nm}: mortis kosong @u=${u.toFixed(1)}`, !inPanel(pan, u, zMid));
        check(`${label}/${nm}: sisi mortis berisi`, inPanel(pan, u - t, zMid) && inPanel(pan, u + t, zMid));
        const count = divHolesAt(pan, u);
        check(`${label}/${nm}: ${d.divFeats.length} mortis @u=${u.toFixed(1)}`, count === d.divFeats.length, `dapat ${count}`);
      }
    }
  }
  for (const y of d.yDiv) {
    for (const [pan, u, nm] of [[left, W - y, 'kiri'], [right, y, 'kanan']]) {
      if (d.alih) {
        check(`${label}/${nm}: slot kosong @u=${u.toFixed(1)}`, !inPanel(pan, u, H - 0.5));
        check(`${label}/${nm}: bawah slot berisi`, inPanel(pan, u, footZ));
      } else {
        check(`${label}/${nm}: mortis kosong @u=${u.toFixed(1)}`, !inPanel(pan, u, zMid));
        const count = divHolesAt(pan, u);
        check(`${label}/${nm}: ${d.divFeats.length} mortis @u=${u.toFixed(1)}`, count === d.divFeats.length, `dapat ${count}`);
      }
    }
  }
  // Dinding yang tidak menerima pembahagi arah itu TIADA mortis pembahagi.
  if (!d.alih) {
    if (d.yDiv.length === 0) check(`${label}: kiri/kanan tiada mortis pembahagi`,
      divHolesAt(left, -1) === 0 && left.holesNominal.length === d.yFeats.length);
    if (d.xDiv.length === 0) check(`${label}: depan/belakang tiada mortis pembahagi`,
      front.holesNominal.length === d.xFeats.length);
  }

  // Tiada pembahagi 'tetap' yang mortisnya bertindih dengan mortis lantai.
  for (const pan of [front, back, left, right]) {
    const hs = pan.holesNominal.map((h) => bbox(h));
    for (let i = 0; i < hs.length; i++) for (let j = i + 1; j < hs.length; j++) {
      const a = hs[i], b = hs[j];
      const overlap = a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;
      check(`${label}/${pan.id}: lubang ${i} & ${j} tidak bertindih`, !overlap);
    }
  }

  // Petak: jumlah lebar petak + pembahagi = ruang dalam.
  const sumC = d.colW.reduce((a, b) => a + b, 0) + (d.colW.length - 1) * t;
  const sumR = d.rowD.reduce((a, b) => a + b, 0) + (d.rowD.length - 1) * t;
  check(`${label}: lajur isi ruang dalam`, near(sumC, d.innerL, 1e-6), `${sumC} vs ${d.innerL}`);
  check(`${label}: baris isi ruang dalam`, near(sumR, d.innerW, 1e-6), `${sumR} vs ${d.innerW}`);
  check(`${label}: bilangan petak`, d.cells.length === d.colW.length * d.rowD.length);

  return tray;
}

// ---- pemasangan dalam ruang dunia ----------------------------------------
// Bukti muktamad bahawa mortis MENERIMA tenon: setiap titik tengah tenon
// (pembahagi dan lantai) dipetakan ke dunia melalui bingkai panelnya sendiri,
// kemudian dipetakan semula ke bingkai setiap dinding. Kalau titik itu jatuh
// di dalam papan dinding, ia MESTI jatuh dalam lubang - kalau tidak, dua
// keping kayu cuba menduduki ruang yang sama dan dulang tak boleh dipasang.
// Ini juga menangkap u yang terbalik pada dinding belakang dan kiri.
function checkAssembly(label, params) {
  const tray = buildTray(params);
  const { derived: d, params: p } = tray;
  const t = p.thickness;
  if (!d.divOK) return;
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const walls = ['front', 'back', 'left', 'right'].map((id) => byId(tray, id));

  /** Untuk titik dunia, dinding mana (jika ada) yang papannya mengandunginya? */
  const wallAt = (w) => {
    for (const wall of walls) {
      const { origin, U, V, N } = wall.frame;
      const r = [w[0] - origin[0], w[1] - origin[1], w[2] - origin[2]];
      const depth = dot(r, N);
      if (depth > 1e-6 || depth < -t + 1e-6) continue; // di luar papan
      return { wall, u: dot(r, U), v: dot(r, V) };
    }
    return null;
  };

  let probes = 0;
  const probe = (panel, u, v, what) => {
    const w = panelToWorld(panel, u, v, -t / 2);
    const hit = wallAt(w);
    check(`${label}/${panel.id}: ${what} jatuh dalam papan dinding`, hit !== null);
    if (!hit) return;
    probes++;
    // inPanel bekerja dalam bingkai ASAL dinding (sebelum normalisasi), dan u,v
    // di sini memang dalam bingkai asal - originShift dinding hanya menganjak
    // koordinat ternormal, yang inPanel sudah ambil kira.
    check(`${label}/${panel.id}: ${what} dalam mortis ${hit.wall.id} @u=${hit.u.toFixed(1)}`,
      !inPanel(hit.wall, hit.u, hit.v));
  };

  // Pembahagi 'tetap': tenon hujung. Koordinat ternormal panel: tenon kiri
  // pada u = 0..t (originShift u = 0 kerana tenon menjangkau 0).
  if (!d.alih) {
    for (const { id } of [...d.dividers.x, ...d.dividers.y]) {
      const pan = byId(tray, id);
      const span = pan.size.w;
      for (const f of d.divFeats) {
        const v = (f.s + f.e) / 2;
        probe(pan, t / 2, v, `tenon kiri v=${v.toFixed(1)}`);
        probe(pan, span - t / 2, v, `tenon kanan v=${v.toFixed(1)}`);
      }
    }
  } else {
    // 'alih': hujung pembahagi duduk di dalam slot dinding (0.3 mm dari muka luar).
    for (const { id } of [...d.dividers.x, ...d.dividers.y]) {
      const pan = byId(tray, id);
      const span = pan.size.w;
      probe(pan, t / 2, d.divH / 2, 'hujung kiri dalam slot');
      probe(pan, span - t / 2, d.divH / 2, 'hujung kanan dalam slot');
    }
  }

  // Lantai: tenon di keempat-empat tepi. Lantai ternormal bermula di u = 0
  // (tenon menjangkau muka luar), jadi tenon depan di v = t/2, belakang di
  // v = W - t/2, kiri di u = t/2, kanan di u = L - t/2.
  const floor = byId(tray, 'bottom');
  for (const f of d.xFeats) {
    const u = (f.s + f.e) / 2;
    probe(floor, u, t / 2, `tenon lantai depan u=${u.toFixed(1)}`);
    probe(floor, u, p.width - t / 2, `tenon lantai belakang u=${u.toFixed(1)}`);
  }
  for (const f of d.yFeats) {
    const v = (f.s + f.e) / 2;
    probe(floor, t / 2, v, `tenon lantai kiri v=${v.toFixed(1)}`);
    probe(floor, p.length - t / 2, v, `tenon lantai kanan v=${v.toFixed(1)}`);
  }

  // Dan sebaliknya: BADAN pembahagi (bukan tenon) tidak boleh berada dalam
  // mana-mana dinding - kalau ya, pembahagi terlalu panjang.
  for (const { id } of [...d.dividers.x, ...d.dividers.y]) {
    const pan = byId(tray, id);
    const w = panelToWorld(pan, pan.size.w / 2, d.divH / 2, -t / 2);
    check(`${label}/${id}: badan tengah bebas daripada dinding`, wallAt(w) === null);
  }
  check(`${label}: ada probe pemasangan`, probes > 0);
}

const { panelToWorld } = await import(pathToFileURL(path.join(GEOM, 'tray.js')).href);
checkAssembly('pasang lalai', {});
checkAssembly('pasang 4x3 tak seragam', { length: 300, width: 200, cols: [3, 1, 2, 1.5], rows: [1, 2, 1] });
checkAssembly('pasang 5 mm', { thickness: 5, cols: [1, 2], rows: [2, 1] });
checkAssembly('pasang rendah 40%', { dividerHeight: 40, cols: [1, 1, 1], rows: [1, 1, 1] });
checkAssembly('pasang alih', { dividerStyle: 'alih', cols: [1, 2, 1], rows: [1, 1] });
checkAssembly('pasang alih 5 mm', { dividerStyle: 'alih', thickness: 5, cols: [1, 1], rows: [1, 1, 1] });
checkAssembly('pasang takuk', { fingerPull: 'depanBelakang', cols: [1, 2], rows: [1, 1] });

// ---- konfigurasi ----------------------------------------------------------

checkInvariants('lalai', {});
checkInvariants('tiada pembahagi', { cols: [1], rows: [1] });
checkInvariants('satu lajur sahaja', { cols: [1, 1], rows: [1] });
checkInvariants('satu baris sahaja', { cols: [1], rows: [1, 2] });
checkInvariants('grid tak seragam 4x3', {
  length: 300, width: 200, height: 50, cols: [3, 1, 2, 1.5], rows: [1, 2, 1],
});
checkInvariants('pembahagi rendah 50%', { dividerHeight: 50, cols: [1, 1], rows: [1, 1] });
checkInvariants('pembahagi 20% (minimum)', { dividerHeight: 20, height: 80, cols: [1, 1], rows: [1, 1] });
checkInvariants('papan 5 mm', { thickness: 5, kerf: 0.25, cols: [1, 1, 1], rows: [1, 1] });
checkInvariants('papan 2 mm kad', { thickness: 2, kerf: 0.3, length: 120, width: 90, height: 30 });
checkInvariants('kerf sifar', { kerf: 0 });
checkInvariants('fit sifar', { fit: 0 });
checkInvariants('takuk jari depan', { fingerPull: 'depan' });
checkInvariants('takuk jari depan & belakang', { fingerPull: 'depanBelakang', cols: [1, 1] });
checkInvariants('alih 3x2', { dividerStyle: 'alih', cols: [1, 1, 1], rows: [1, 1] });
checkInvariants('alih 1x4', { dividerStyle: 'alih', cols: [1], rows: [1, 1, 1, 1] });
checkInvariants('alih + takuk jari', { dividerStyle: 'alih', fingerPull: 'depanBelakang', cols: [1, 1, 1] });
checkInvariants('alih slack besar', { dividerStyle: 'alih', slotSlack: 0.6 });
checkInvariants('dulang besar 12 lajur', {
  length: 600, width: 300, height: 60, cols: new Array(12).fill(1), rows: [1, 1],
});
checkInvariants('dulang kecil', { length: 60, width: 50, height: 25, cols: [1, 1], rows: [1] });
checkInvariants('tinggi rendah 20', { height: 20, cols: [1, 1], rows: [1, 1] });

// ---- takuk jari: ada lekuk di tengah tepi atas ----------------------------
{
  const tray = buildTray({ fingerPull: 'depanBelakang', cols: [1], rows: [1] });
  const { params: p, derived: d } = tray;
  const front = byId(tray, 'front'), back = byId(tray, 'back'), left = byId(tray, 'left');
  check('takuk: depan ada lekuk', !inPanel(front, p.length / 2, p.height - 0.5));
  check('takuk: depan lekuk tak sampai mortis lantai', inPanel(front, p.length / 2, d.divBase + 1));
  check('takuk: belakang ada lekuk', !inPanel(back, p.length / 2, p.height - 0.5));
  check('takuk: kiri tiada lekuk', inPanel(left, p.width / 2, p.height - 0.5));
  const onlyFront = buildTray({ fingerPull: 'depan' });
  check('takuk depan sahaja: belakang penuh', inPanel(byId(onlyFront, 'back'), onlyFront.params.length / 2, onlyFront.params.height - 0.5));
  check('takuk: tiada amaran', !d.warnings.includes('takuk'));
}

// ---- alih + takuk: slot di tengah mengalahkan lekuk, dengan amaran -------
{
  // Dua lajur sama -> pembahagi tepat di tengah -> slot bertindih lekuk.
  const tray = buildTray({ dividerStyle: 'alih', fingerPull: 'depan', cols: [1, 1], rows: [1] });
  check('alih+takuk bertembung: amaran takuk', tray.derived.warnings.includes('takuk'));
  for (const pan of tray.panels) check(`alih+takuk bertembung/${pan.id}: gelang ringkas`, isSimple(pan.outlineNominal));
  // 'tetap' 100% di tengah: mortis atas akan tembus lekuk, jadi lekuk mengalah.
  const tetap = buildTray({ fingerPull: 'depanBelakang', cols: [1, 1], rows: [1] });
  check('tetap 100%+takuk bertembung: amaran takuk', tetap.derived.warnings.includes('takuk'));
  check('tetap 100%+takuk bertembung: depan penuh', inPanel(byId(tetap, 'front'), tetap.params.length / 2, tetap.params.height - 0.5));
  // 'tetap' 50% di tengah: mortis rendah, lekuk kekal.
  const rendah = buildTray({ fingerPull: 'depanBelakang', cols: [1, 1], rows: [1], dividerHeight: 50 });
  check('tetap 50%+takuk: tiada amaran', !rendah.derived.warnings.includes('takuk'));
  check('tetap 50%+takuk: lekuk ada', !inPanel(byId(rendah, 'front'), rendah.params.length / 2, rendah.params.height - 0.5));
  // Pembahagi di tepi: lekuk kekal, slot kekal, kedua-duanya wujud.
  const ok = buildTray({ dividerStyle: 'alih', fingerPull: 'depan', cols: [1, 4], rows: [1], length: 300 });
  check('alih+takuk jauh: tiada amaran', !ok.derived.warnings.includes('takuk'));
  const f = byId(ok, 'front');
  check('alih+takuk jauh: lekuk ada', !inPanel(f, ok.params.length / 2, ok.params.height - 0.5));
  check('alih+takuk jauh: slot ada', !inPanel(f, ok.derived.xDiv[0], ok.params.height - 0.5));
}

// ---- input teruk: tak pernah campak -----------------------------------------
const bad = [
  { thickness: 0 }, { thickness: -3 }, { thickness: 'x' },
  { length: 0, width: 0, height: 0 }, { length: -100 },
  { kerf: -1 }, { fit: -1 }, { fingerSize: 0 },
  { cols: [], rows: [] }, { cols: null, rows: undefined }, { cols: [0, 0], rows: [-1] },
  { cols: ['a', 'b'], rows: [NaN] }, { cols: new Array(50).fill(1), rows: new Array(50).fill(1) },
  { dividerHeight: 0 }, { dividerHeight: 500 }, { dividerHeight: 'tinggi' },
  { dividerStyle: 'entah' }, { fingerPull: 'semua' }, { slotSlack: -1 },
  { floorOffset: 1000 }, { floorOffset: -5 }, { minCell: 0 },
  { length: 1e6, width: 1e6 },
];
for (const b of bad) {
  let tray = null, err = null;
  try { tray = buildTray(b); } catch (e) { err = e; }
  check(`input teruk ${JSON.stringify(b)}: tak campak`, !err, err && err.message);
  if (tray) {
    check(`input teruk ${JSON.stringify(b)}: >= 5 panel`, tray.panels.length >= 5);
    for (const pan of tray.panels) {
      check(`input teruk ${JSON.stringify(b)}/${pan.id}: ringkas`, isSimple(pan.outlineNominal));
      check(`input teruk ${JSON.stringify(b)}/${pan.id}: size terhingga`,
        Number.isFinite(pan.size.w) && Number.isFinite(pan.size.h) && pan.size.w > 0 && pan.size.h > 0);
    }
  }
}

// ---- petak terlalu kecil: geometri dijana tanpa pembahagi, dengan amaran ----
{
  const tray = buildTray({ length: 60, width: 40, cols: new Array(6).fill(1), rows: [1] });
  check('petak kecil: divOK palsu', !tray.derived.divOK);
  check('petak kecil: amaran lajur', tray.derived.warnings.includes('lajur'));
  check('petak kecil: 5 panel sahaja', tray.panels.length === 5);
  check('petak kecil: dinding tiada mortis pembahagi',
    byId(tray, 'front').holesNominal.length === tray.derived.xFeats.length);
}

// ---- gridSizes / cleanFractions ---------------------------------------------
{
  const g = gridSizes([1, 1, 2], 100, 4);
  check('gridSizes: span = inner - (n-1)t', near(g.span, 92));
  check('gridSizes: nisbah 1:1:2', near(g.sizes[0], 23) && near(g.sizes[1], 23) && near(g.sizes[2], 46));
  check('gridSizes: ok', g.ok);
  const tiny = gridSizes([1, 1, 1, 1, 1, 1, 1, 1], 60, 3);
  check('gridSizes: terlalu kecil -> ok palsu', !tiny.ok);
  check('cleanFractions: buang bukan nombor', JSON.stringify(cleanFractions([1, 'x', -2, 0, 3])) === '[1,3]');
  check('cleanFractions: kosong -> fallback', JSON.stringify(cleanFractions([])) === '[1]');
  check('cleanFractions: had MAX_DIV+1', cleanFractions(new Array(100).fill(1)).length === 13);
}

// ---- DEFAULTS waras -------------------------------------------------------------
{
  const tray = buildTray(DEFAULTS);
  check('DEFAULTS: divOK', tray.derived.divOK);
  check('DEFAULTS: tiada amaran', tray.derived.warnings.length === 0);
  check('DEFAULTS: 3 lajur x 2 baris = 6 petak', tray.derived.cellCount === 6);
  check('DEFAULTS: 2 pembahagi X + 1 pembahagi Y', tray.derived.dividers.x.length === 2 && tray.derived.dividers.y.length === 1);
}

// ---- keputusan ---------------------------------------------------------------
console.log(`\n${passed} lulus, ${failed} gagal`);
if (failed) {
  console.log('\nGAGAL:');
  for (const f of fails.slice(0, 60)) console.log(`  x ${f}`);
  if (fails.length > 60) console.log(`  ... dan ${fails.length - 60} lagi`);
  process.exit(1);
}
