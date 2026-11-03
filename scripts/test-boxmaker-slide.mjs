// Ujian Box Maker gaya Sliding Box: penutup yang menggelongsor dalam alur antara
// dua rel pada setiap dinding sisi. Tiada kebergantungan.
//
//     node scripts/test-boxmaker-slide.mjs
//
// Mengimport terus daripada docs/boxmaker/src - kod yang sifulaser.com hidangkan.
//
//   * cincin sah         - setiap outline dan lubang tertutup, tiada sisi yang
//                          bersilang, outline lawan arah jam.
//   * ukuran             - tumpuk rel dan alur, dinding depan, ruang dalam.
//   * DIPASANG DALAM 3D  - setiap panel (bentuk NOMINAL) diisi ke grid voksel. Dua
//                          panel di voksel yang sama ialah kayu bertindih.
//   * setiap lubang diisi - setiap mortis dan slot ada tanon di dalamnya.
//   * GELONGSOR         - penutup, rel penutup dan pemegang bergerak sebagai satu,
//                          keluar sepenuhnya melalui depan tanpa menyentuh badan.
//   * penahan            - ke belakang pemegang tersekat pada hujung dinding sisi;
//                          ke atas penutup tersekat pada rel atas; ke sisi pada dinding.
//   * laluan pemasangan  - rel keluar dari dindingnya, dinding bersama relnya keluar
//                          dari kotak, dan penutup keluar dari pemegang, semuanya
//                          lurus tanpa terperangkap.

import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(here, '..', 'docs', 'boxmaker', 'src', 'geom');
const { buildBox, panelToWorld, PANEL_ORDER, PANEL_LABELS } = await import(pathToFileURL(path.join(SRC, 'box.js')).href);
const {
  area, selfIntersects, gridOver, panelSolid, fill, ERODE,
} = await import(pathToFileURL(path.join(here, 'lib', 'boxmaker-voxel.mjs')).href);

let passed = 0;
let failed = 0;
const fails = [];
function check(name, cond, detail = '') {
  if (cond) { passed++; return; }
  failed++;
  if (fails.length < 60) fails.push(`${name}${detail ? ` - ${detail}` : ''}`);
}
const near = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;

/** Panel dialih lurus sejauh (dx, dy, dz). */
function movedSolid(panel, [dx, dy, dz], erode = ERODE) {
  const base = panelSolid(panel, null, erode);
  return {
    inside: (p) => base.inside([p[0] - dx, p[1] - dy, p[2] - dz]),
    lo: [base.lo[0] + dx, base.lo[1] + dy, base.lo[2] + dz],
    hi: [base.hi[0] + dx, base.hi[1] + dy, base.hi[2] + dz],
  };
}

const LID = ['lidTop', 'lidRail', 'handle'];
const RAILS = ['railLeftTop', 'railLeftLow', 'railRightTop', 'railRightLow', 'railBack'];

function testBox(params, { paths = false, sweep = false } = {}) {
  const tag = JSON.stringify(params).slice(0, 100);
  let box;
  try { box = buildBox({ style: 'slide', kerf: 0.2, thickness: 3, ...params }); } catch (e) {
    check(`${tag}: tak campak`, false, e.stack);
    return;
  }
  const s = box.derived.slide;
  check(`${tag}: maklumat slide`, !!s);
  if (!s) return;
  const p = box.params;
  const t = p.thickness;
  const g = s.gap;
  const by = (id) => box.panels.find((q) => q.id === id);
  const idx = (id) => box.panels.findIndex((q) => q.id === id);
  const ids = box.panels.map((q) => q.id);

  check(`${tag}: panel lengkap`, ['front', 'back', 'left', 'right', 'bottom', ...LID, ...RAILS]
    .every((id) => ids.includes(id)), ids.join(','));
  for (const id of ids) {
    check(`${tag}: ${id} dalam PANEL_ORDER dan berlabel`, PANEL_ORDER.includes(id) && !!PANEL_LABELS[id]);
  }
  const lidMove = by('lidTop').slide;
  check(`${tag}: penutup bergerak sebagai satu`,
    LID.every((id) => JSON.stringify(by(id).slide) === JSON.stringify(lidMove)) && lidMove[1] < 0 && lidMove[0] === 0 && lidMove[2] === 0);
  check(`${tag}: rel badan tidak bergerak`, RAILS.every((id) => !by(id).slide));
  check(`${tag}: rel tiada tab hiasan`, [...RAILS, 'lidRail'].every((id) => by(id).noDecor && by(id).noPick));
  check(`${tag}: penutup dan pemegang boleh dihias`, !by('lidTop').noDecor && !by('handle').noDecor);

  for (const q of box.panels) {
    for (const [k, ring] of [['outline', q.outlineNominal], ...q.holesNominal.map((hh, i) => [`hole${i}`, hh])]) {
      check(`${tag} [${q.id}] ${k}: cincin`, ring.length >= 3 && ring.every((v) => Number.isFinite(v[0]) && Number.isFinite(v[1])));
      const x = selfIntersects(ring);
      check(`${tag} [${q.id}] ${k}: tiada sisi bersilang`, !x, x && JSON.stringify([ring[x[0]], ring[x[1]]]));
    }
    check(`${tag} [${q.id}]: outline lawan arah jam`, area(q.outlineNominal) > 0);
  }

  // ---- ukuran
  const spanX = (ring) => Math.max(...ring.map(([x]) => x)) - Math.min(...ring.map(([x]) => x));
  const spanY = (ring) => Math.max(...ring.map(([, y]) => y)) - Math.min(...ring.map(([, y]) => y));
  check(`${tag}: dinding depan = H - 4t - gap`, near(spanY(by('front').outlineNominal), p.height - 4 * t - g), `${spanY(by('front').outlineNominal)}`);
  check(`${tag}: dinding belakang penuh`, near(spanY(by('back').outlineNominal), p.height));
  check(`${tag}: dinding sisi penuh`, near(spanY(by('left').outlineNominal), p.height));
  check(`${tag}: pemegang = L x 4t`, near(spanX(by('handle').outlineNominal), p.length) && near(spanY(by('handle').outlineNominal), 4 * t));
  check(`${tag}: rel lebar 2t + tanon t`, near(spanX(by('railLeftTop').outlineNominal), 3 * t) && near(spanY(by('railBack').outlineNominal), 3 * t));
  check(`${tag}: rel belakang dari dinding ke dinding`, near(spanX(by('railBack').outlineNominal), p.length - 2 * t), `${spanX(by('railBack').outlineNominal)}`);
  check(`${tag}: rel sisi dari pemegang ke belakang`, near(spanY(by('railLeftTop').outlineNominal), p.width - 2 * t), `${spanY(by('railLeftTop').outlineNominal)}`);
  check(`${tag}: rel penutup selebar penutup`, near(spanX(by('lidRail').outlineNominal), s.lidL), `${spanX(by('lidRail').outlineNominal)}`);
  // Bucu yang terpotong serong tidak mengubah lebar, tetapi mengubah keluasan.
  check(`${tag}: penutup segi empat penuh`, area(by('lidTop').outlineNominal) >= s.lidL * (s.lidW - t) - 1e-6, `${area(by('lidTop').outlineNominal)}`);
  const sq = (w, h, m) => (w * h - m * m);  // strip dengan dua hujung mitre
  check(`${tag}: mitre rel belakang 45 darjah`, area(by('railBack').outlineNominal) >= sq(p.length - 2 * t, 2 * t, 2 * t) - 1e-6, `${area(by('railBack').outlineNominal)}`);
  check(`${tag}: mitre rel penutup 45 darjah`, area(by('lidRail').outlineNominal) >= sq(s.lidL, 2 * t, 2 * t) - 1e-6, `${area(by('lidRail').outlineNominal)}`);
  check(`${tag}: mitre rel sisi 45 darjah`, area(by('railLeftLow').outlineNominal) >= sq(p.width - 2 * t, 2 * t, 2 * t) - 1e-6, `${area(by('railLeftLow').outlineNominal)}`);
  check(`${tag}: lebar penutup = dalam kotak - 2 gap`, near(s.lidL, p.length - 2 * t - 2 * g));
  check(`${tag}: panjang penutup dengan tanon`, near(s.lidW, p.width - t - g));
  check(`${tag}: slot pemegang dua papan`, by('handle').holesNominal.every((h) => near(spanY(h), 2 * t - p.fit, 1e-6)));
  check(`${tag}: rel kiri dan kanan cermin`, near(area(by('railLeftTop').outlineNominal), area(by('railRightTop').outlineNominal)));
  if (params.measure === 'inside') {
    const dm = box.derived.dims;
    check(`${tag}: ruang dalam seperti diminta`, dm.met, JSON.stringify(dm.inner));
  }

  // ---- pasang dalam 3D (tertutup)
  const fine = Math.min(0.5, t / 6);
  const grid = gridOver([-2, -2, -2], [p.length + 2, p.width + 2, p.height + 2], [fine, fine, fine]);
  box.panels.forEach((q, i) => {
    const clash = fill(grid, panelSolid(q), i);
    const worst = [...clash.entries()].sort((a, b) => b[1] - a[1])[0];
    check(`${tag}: ${q.id} tidak bertindih`, clash.size === 0, worst && `${worst[1]} voksel dalam ${box.panels[worst[0]].id}`);
  });
  const owner = (x, y, z) => {
    const [i, j, k] = grid.cell(x, y, z);
    const id = grid.own[grid.idx(i, j, k)];
    return id >= 0 ? box.panels[id].id : null;
  };

  // ---- tumpuk merentas alur: di tengah sisi kiri, atas ke bawah
  const ym = p.width / 2;
  const xr = t + 1.5 * t;  // dalam lebar rel
  const H = p.height;
  check(`${tag}: rel atas`, owner(xr, ym, H - 1.5 * t) === 'railLeftTop', `${owner(xr, ym, H - 1.5 * t)}`);
  check(`${tag}: penutup dalam alur`, owner(xr, ym, H - 2.5 * t - g) === 'lidTop', `${owner(xr, ym, H - 2.5 * t - g)}`);
  check(`${tag}: rel bawah`, owner(xr, ym, H - 3.5 * t - g) === 'railLeftLow', `${owner(xr, ym, H - 3.5 * t - g)}`);
  check(`${tag}: ruang di bawah rel`, owner(xr, ym, H - 4 * t - g - 2 * fine) === null, `${owner(xr, ym, H - 4 * t - g - 2 * fine)}`);
  check(`${tag}: rel depan hanya bila tertutup`, owner(p.length / 2, 2 * t, H - 1.5 * t - g) === 'lidRail', `${owner(p.length / 2, 2 * t, H - 1.5 * t - g)}`);
  check(`${tag}: rel belakang di atas penutup`, owner(p.length / 2, p.width - 2 * t, H - 1.5 * t) === 'railBack');
  check(`${tag}: bukaan tengah terbuka di atas`, owner(p.length / 2, ym, H - 1.5 * t) === null);

  // ---- setiap lubang berisi: sampel dalam kawasan lubang pada tengah papan
  for (const q of box.panels) {
    for (const hole of q.holesNominal) {
      const us = hole.map(([u]) => u); const vs = hole.map(([, v]) => v);
      const [u0, u1, v0, v1] = [Math.min(...us), Math.max(...us), Math.min(...vs), Math.max(...vs)];
      let inHole = 0; let total = 0;
      for (const fu of [0.2, 0.5, 0.8]) {
        for (const fv of [0.3, 0.7]) {
          const w = panelToWorld(q, u0 + (u1 - u0) * fu, v0 + (v1 - v0) * fv, -t / 2);
          total++;
          if (owner(w[0], w[1], w[2])) inHole++;
        }
      }
      // Separuh cukup: tanon lantai ada celah pelega, dan pada papan nipis sampel
      // jatuh ke dalamnya. Lubang yang benar-benar kosong memberi 0.
      check(`${tag} [${q.id}]: lubang diisi`, inHole >= total / 2, `${inHole}/${total}`);
    }
  }

  // ---- gelongsor: keluar sepenuhnya melalui depan, tanpa menyentuh badan
  const lidParts = box.panels.filter((q) => q.slide);
  const body = box.panels.map((q, i) => ({ q, i })).filter(({ q }) => !q.slide);
  const bodySet = new Set(body.map((b) => b.i));
  // Gerakannya sepanjang y sahaja, jadi y boleh kasar; x dan z yang menentukan celah.
  const out = p.width + t + 2;
  const gridS = gridOver([-2, -out - 2, -2], [p.length + 2, p.width + 2, p.height + 2], [fine, 1, fine]);
  for (const { q, i } of body) fill(gridS, panelSolid(q), i);
  const stepY = sweep ? 3 : out / 4;
  for (let dy = 0; dy <= out; dy += stepY) {
    for (const q of lidParts) {
      const clash = fill(gridS, movedSolid(q, [0, -dy, 0]), 99, { write: false, against: bodySet });
      check(`${tag}: ${q.id} keluar ${dy} mm`, clash.size === 0, `${clash.size} voksel`);
    }
  }

  // ---- penahan: yang menahan penutup benar-benar menahan
  const hits = (id, v, erode = 0.05) => fill(gridS, movedSolid(by(id), v, erode), 99, { write: false, against: bodySet });
  const backPast = hits('handle', [0, 1.5, 0]);
  check(`${tag}: pemegang tersekat pada hujung dinding sisi`, backPast.has(idx('left')) && backPast.has(idx('right')),
    [...backPast.keys()].map((i) => box.panels[i].id).join(','));
  check(`${tag}: penutup tidak boleh terangkat keluar`, hits('lidTop', [0, 0, g + 1]).has(idx('railLeftTop')));
  check(`${tag}: penutup tidak jatuh`, hits('lidTop', [0, 0, -1]).has(idx('railLeftLow')));
  check(`${tag}: penutup terpandu ke kiri`, hits('lidTop', [-(g + 1), 0, 0]).has(idx('left')));
  check(`${tag}: penutup terpandu ke kanan`, hits('lidTop', [g + 1, 0, 0]).has(idx('right')));
  check(`${tag}: penutup ada ruang ke sisi`, hits('lidTop', [-(g - 0.15), 0, 0], ERODE).size === 0 || g < 0.3);

  if (!paths) return;

  // ---- laluan pemasangan
  const cleared = (parts, others, v, steps = 6) => {
    const otherSet = new Set(others);
    const gridP = gridOver([-3 * t - 4, -3 * t - 4, -2], [p.length + 3 * t + 4, p.width + 3 * t + 4, p.height + 2], [0.5, 0.5, 0.5]);
    for (const i of others) fill(gridP, panelSolid(box.panels[i]), i);
    let worst = 0;
    for (let k = 0; k <= steps; k++) {
      const f = k / steps;
      for (const id of parts) {
        const c = fill(gridP, movedSolid(by(id), [v[0] * f, v[1] * f, v[2] * f]), 99, { write: false, against: otherSet });
        for (const n of c.values()) worst += n;
      }
    }
    return worst;
  };
  const noLid = box.panels.map((q, i) => (q.slide ? -1 : i)).filter((i) => i >= 0);
  const except = (...xs) => noLid.filter((i) => !xs.includes(box.panels[i].id));
  // Setiap rel keluar dari dindingnya, ke dalam kotak.
  check(`${tag}: rel kiri atas keluar dari dinding`, cleared(['railLeftTop'], [idx('left')], [2 * t, 0, 0]) === 0);
  check(`${tag}: rel kiri bawah keluar dari dinding`, cleared(['railLeftLow'], [idx('left')], [2 * t, 0, 0]) === 0);
  check(`${tag}: rel kanan atas keluar dari dinding`, cleared(['railRightTop'], [idx('right')], [-2 * t, 0, 0]) === 0);
  check(`${tag}: rel belakang keluar dari dinding`, cleared(['railBack'], [idx('back')], [0, -2 * t, 0]) === 0);
  // Dinding bersama relnya, keluar dari kotak yang siap: lid tiada, jadi tiada yang terperangkap.
  check(`${tag}: belakang dan relnya keluar ke belakang`,
    cleared(['back', 'railBack'], except('back', 'railBack'), [0, 2 * t + 2, 0]) === 0);
  check(`${tag}: kiri dan relnya keluar ke kiri (tanpa belakang)`,
    cleared(['left', 'railLeftTop', 'railLeftLow'], except('left', 'railLeftTop', 'railLeftLow', 'back', 'railBack'), [-(2 * t + 2), 0, 0]) === 0);
  check(`${tag}: kanan dan relnya keluar ke kanan (tanpa belakang)`,
    cleared(['right', 'railRightTop', 'railRightLow'], except('right', 'railRightTop', 'railRightLow', 'back', 'railBack'), [2 * t + 2, 0, 0]) === 0);
  // Penutup dan relnya keluar dari pemegang.
  check(`${tag}: penutup keluar dari pemegang`, cleared(['lidTop'], [idx('handle')], [0, 2 * t, 0]) === 0);
  check(`${tag}: rel penutup keluar dari pemegang`, cleared(['lidRail'], [idx('handle')], [0, 2 * t, 0]) === 0);
}

testBox({ length: 100, width: 76, height: 50 }, { paths: true, sweep: true });    // asal
testBox({ length: 125, width: 100, height: 40, slideGap: 0.1 });                 // seperti rujukan
testBox({ length: 150, width: 100, height: 80, slideGap: 0.8 });
testBox({ length: 120, width: 90, height: 60, thickness: 2.6 });                 // Falcata 2.6
testBox({ length: 150, width: 90, height: 70, thickness: 5.2, kerf: 0.25, fit: 0.1 }, { paths: true }); // Falcata 5.2
testBox({ length: 120, width: 80, height: 60, divider: 4 }, { sweep: true });
testBox({ length: 120, width: 80, height: 60, divider: 2, dividerHeight: 100 });
testBox({ length: 100, width: 80, height: 60, measure: 'inside' });
testBox({ length: 60, width: 40, height: 25, thickness: 2 });
testBox({ length: 10, width: 10, height: 10 });                                  // diapit ke saiz paling kecil
testBox({ length: 120, width: 80, height: 60, lidNotch: false });

// ---- takuk ibu jari pada dinding depan, dan rel tidak menyentuhnya
{
  const withN = buildBox({ style: 'slide', length: 120, width: 80, height: 60, kerf: 0 });
  const without = buildBox({ style: 'slide', length: 120, width: 80, height: 60, kerf: 0, lidNotch: false });
  const front = (b) => b.panels.find((q) => q.id === 'front');
  check('takuk: mengurangkan keluasan dinding depan', area(front(withN).outlineNominal) < area(front(without).outlineNominal) - 10);
  check('takuk: dilaporkan', withN.derived.slide.thumbR > 2.5 && without.derived.slide.thumbR === 0);
  const short = buildBox({ style: 'slide', length: 120, width: 80, height: 10 });
  check('takuk: kotak rendah tiada takuk yang terlalu dalam',
    short.derived.slide.thumbR === 0 || short.derived.slide.thumbR <= short.derived.slide.frontH - 2 * short.params.thickness - 3 + 1e-6);
}

// ---- pembahagi berhenti di bawah rel dan takuk
{
  const b = buildBox({ style: 'slide', length: 120, width: 80, height: 60, divider: 4, dividerHeight: 100, kerf: 0 });
  check('pembahagi: di bawah kaki rel', b.derived.divBase + b.derived.divH <= b.derived.slide.frontH + 1e-6);
  check('pembahagi: di bawah takuk', b.derived.divBase + b.derived.divH <= b.derived.slide.frontH - b.derived.slide.thumbR);
}

// ---- gaya lain tidak berubah
{
  const b = buildBox({ style: 'lidded', length: 100, width: 76, height: 50 });
  check('Lidded: tiada maklumat slide', b.derived.slide === null);
  check('Lidded: tiada rel', !b.panels.some((q) => /^rail|^lidRail|^handle/.test(q.id)));
}

// ---- skru dimatikan
{
  const b = buildBox({ style: 'slide', length: 150, width: 100, height: 80, joint: 'screw' });
  check('skru: tiada lubang skru', b.derived.screwZs.length === 0);
}

// ---- input teruk
for (const bad of [{ length: 0, height: 0 }, { slideGap: 'x' }, { slideGap: 99 }, { slideGap: -1 },
  { thickness: 12, length: 60 }, { measure: 'inside', length: 50, height: 20 }, { floorOffset: 40 }]) {
  let ok = true;
  try {
    const b = buildBox({ style: 'slide', ...bad });
    ok = b.panels.length >= 13 && Number.isFinite(b.derived.slide.gap) && b.derived.slide.gap <= b.params.thickness / 2;
  } catch (e) { ok = false; }
  check(`input teruk ${JSON.stringify(bad)}: tak campak`, ok);
}

console.log(`${passed} lulus, ${failed} gagal`);
if (failed) {
  for (const f of fails) console.log('  GAGAL', f);
  process.exit(1);
}
