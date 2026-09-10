// The whole rehal: five pieces, a pattern, a name, and a number that says
// whether it stays upright.
//
// One call. The store hands it parameters, it hands back panels the 3D view
// and the exporter can use without knowing anything about tilings or tipping,
// plus every measured number the inspector wants to print.
//
// ORDER OF OPERATIONS, because two of these genuinely cannot be swapped:
//
//   1. the base depth, which may be derived from the tipping calculation and
//      therefore has to be settled before any geometry exists;
//   2. the dimensions, from that depth;
//   3. the panel's exact outline, WITH its tabs, because the pattern's frame
//      band is measured from the outline and the tabs are part of it;
//   4. the name, because the cartouche it needs is what the pattern has to
//      keep out of;
//   5. the pattern, given both;
//   6. the parts, given the pattern's holes;
//   7. the tipping calculation on the finished geometry, which is what gets
//      reported - the one in step 1 was run on a solid panel and is only ever
//      a conservative starting point.
//
// Millimetres, kilograms, degrees.

import {
  buildPattern, minWidth as minWidthOf, frameBand, maxCell,
  rasterPanel, traceField, checkPanel, ringsCross,
} from '../pattern/index.js';
import { materialOf, bookOf, MATERIALS, BOOKS } from './stock.js';
import {
  derive, depthFloor, flushDepth, angleNote,
  ANGLE_MIN, ANGLE_MAX, ANGLE_DEFAULT, FRONT_MARGIN,
} from './dims.js';
import { buildParts, backPanelOutline } from './parts.js';
import { mortiseWidth, fitAllowance, taperAllowance, tabModule } from './joints.js';
import {
  stability, autoDepth, PHI_GREEN, PHI_RED, PHI_TARGET,
} from './stability.js';
import { fitName, toFlat, CAP_DEFAULT } from './name.js';
import { FACE_GROUPS, FACE_DEFAULT, FACE_SAFE, CURATED } from './faces.js';

export const LIP_MIN = 12;
export const LIP_MAX = 35;
export const LIP_DEFAULT = 18;

export function initialParams() {
  const m = materialOf('ply9');
  return {
    materialId: m.id,
    thickness: m.t,
    measuredThickness: m.t,
    kerf: m.kerf,
    density: m.density,
    width: 330,
    height: 250,
    angle: ANGLE_DEFAULT,
    depth: 0,
    depthAuto: true,
    lipHeight: LIP_DEFAULT,
    bookId: 'sederhana',
    preset: 'khatamTenang',
    pitch: null,
    theta: null,
    strapWidth: null,
    name: '',
    faceId: FACE_DEFAULT,
    capHeight: CAP_DEFAULT,
    cartouche: 'kubah',
    band: null,
  };
}

// Math.max and Math.min both PROPAGATE NaN rather than rejecting it, so a
// clamp written the obvious way passes a non-finite number straight through
// and every coordinate downstream quietly becomes NaN - an empty cut file
// rather than an error. Nothing a user can drag produces one, but a saved
// design is JSON from another device and buildRehal is a public entry point.
// Falling back to the default rather than to `lo`: NaN is not evidence that
// the user wanted the smallest possible stand.
const clamp = (x, lo, hi, def = lo) =>
  (Number.isFinite(x) ? Math.max(lo, Math.min(hi, x)) : def);
const finite = (x, def) => (Number.isFinite(x) ? x : def);
const perimeter = (ring) => {
  let L = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    L += Math.hypot(ring[i][0] - ring[j][0], ring[i][1] - ring[j][1]);
  }
  return L;
};

/**
 * Test Zero on the rings the EXPORTER writes, which is not where the pattern
 * engine runs it.
 *
 * checkPanel takes Test Zero over the rings it was handed, and for a part that
 * is not the decorated panel those are a raster trace of the part - and a
 * raster cannot represent a crossing. Two rings that cut through each other
 * rasterise to one fused blob, come back out of the tracer as a single clean
 * boundary, and every number downstream is then computed on a shape that is
 * not the shape being cut. Measured, not assumed: a cheek with a mortise cut
 * clean through its bottom edge reports crossings = 0 from verifyPart and 2
 * from a direct test on the same part's own rings.
 *
 * So the exact rings get their own test, here, on the outline and holes the
 * SVG writer will emit. It runs on every build rather than only under
 * verify:'all', because it is cheap and because it is the one failure whose
 * whole character is that everything else stays green.
 */
function crossCheck(parts) {
  const bad = [];
  for (const part of parts) {
    const c = ringsCross([part.outline, ...part.holes]);
    if (c.count) bad.push({ id: part.id, name: part.name, ...c });
  }
  return bad;
}

/**
 * The connectivity prover, run on a part the pattern engine did not build.
 *
 * The base, the cheeks and the lip are a solid plate with a handful of
 * rectangular holes in it, so nothing here is expected to fail - which is
 * exactly why it is worth running. A mortise that has crept to within a
 * hairline of an edge, or two features that have grown into each other at some
 * angle nobody tried, produce a panel that looks right and comes apart on the
 * bed, and the same two tests that police the pattern will say so.
 */
function verifyPart(part, t, kerf, land) {
  const minW = minWidthOf(t, kerf);
  const cell = maxCell(t, kerf);
  const field = rasterPanel({
    outline: part.outlineNominal || part.outline,
    faces: part.holesNominal || part.holes,
    inset: 0,
    cell,
    kerf,
    frame: land,
  });
  if (field.tooFine) return { id: part.id, skipped: true };
  const cut = traceField(field, 'kerfed');
  const check = checkPanel({
    rings: cut.rings, field, minWidth: minW, kerf, frame: land, which: 'kerfed',
  });
  return { id: part.id, ...check };
}

/** Smallest distance from any ring in A to any ring in B, point to SEGMENT. */
export function ringSetDistance(A, B) {
  let best = Infinity;
  for (const a of A) {
    for (const p of a) {
      for (const b of B) {
        for (let i = 0, j = b.length - 1; i < b.length; j = i++) {
          const ax = b[j][0]; const ay = b[j][1];
          const vx = b[i][0] - ax; const vy = b[i][1] - ay;
          const wx = p[0] - ax; const wy = p[1] - ay;
          const vv = vx * vx + vy * vy;
          let s = vv > 1e-12 ? (wx * vx + wy * vy) / vv : 0;
          s = s < 0 ? 0 : s > 1 ? 1 : s;
          const d = Math.hypot(wx - s * vx, wy - s * vy);
          if (d < best) best = d;
        }
      }
    }
  }
  return best;
}

/**
 * Build the stand.
 *
 * @param p           parameters, see initialParams()
 * @param p.faceData  the loaded font face, or null. The loader is async and
 *                    lives in the UI; geometry does not fetch.
 * @param p.verify    'pattern' (default) checks only the decorated panel;
 *                    'all' runs the raster prover over every piece; 'none'
 *                    skips it, which no shipping path should do.
 */
export function buildRehal(input = {}) {
  const p = { ...initialParams(), ...input };
  const warnings = [];

  const mat = MATERIALS.find((m) => m.id === p.materialId) || materialOf('ply9');
  const t = clamp(finite(p.thickness, mat.t), 1, 30, mat.t);
  const kerf = clamp(finite(p.kerf, mat.kerf), 0, 2, mat.kerf);
  const density = clamp(finite(p.density, mat.density), 100, 3000, mat.density);
  // THE MEASURED BOARD HAS TO BE A BOARD OF THIS NOMINAL SIZE.
  //
  // Every mortise is SIZED from the measured thickness and PLACED on the
  // nominal board's mid-plane, and all the land around it - jointLand, the
  // margins featureRun keeps at the ends of a run - is computed from nominal
  // t. That arrangement is only coherent while the two numbers are close. Let
  // them drift far apart and the hole grows past the land it was given: a
  // 3 mm cheek asked to hold a "9 mm" board has its panel mortise cut clean
  // through its own bottom edge, severing a sliver, and before Test Zero
  // existed the tool reported that as ok with no warning at all.
  //
  // The field exists to absorb a MILL TOLERANCE - nominal 9 mm ply arriving at
  // 8.5 or 9.5 - so a quarter of nominal, floored at a millimetre, is roomy
  // for the thing it is for and nowhere near where the geometry gives way. It
  // is a plausibility bound on an input, not a fit calculation; a board that
  // genuinely measures 9 mm wants the 9 mm nominal entry, not the 3 mm one.
  const tTol = Math.max(1, 0.25 * t);
  const tWanted = p.measuredThickness ?? t;
  const tMeasured = Number.isFinite(tWanted) ? clamp(tWanted, t - tTol, t + tTol) : t;
  if (Math.abs(tMeasured - tWanted) > 1e-9) {
    warnings.push(
      `Tebal diukur ${tWanted} mm bukan papan ${t} mm - digunakan ${tMeasured.toFixed(2)} mm. `
      + `Untuk papan ${tWanted} mm, pilih bahan yang betul dahulu.`,
    );
  }
  const book = p.book ?? bookOf(p.bookId);
  const angle = clamp(p.angle ?? ANGLE_DEFAULT, ANGLE_MIN, ANGLE_MAX, ANGLE_DEFAULT);
  const lipHeight = clamp(p.lipHeight ?? LIP_DEFAULT, LIP_MIN, LIP_MAX, LIP_DEFAULT);
  const width = clamp(p.width, 180, 700, 330);
  const height = clamp(p.height, 120, 600, 250);

  const base = {
    thickness: t,
    measuredThickness: tMeasured,
    kerf,
    width,
    height,
    angle,
    lipHeight,
  };

  const floor = Math.max(150, depthFloor(base));
  let depth = p.depth;
  // A depth handed in is a depth meant. initialParams() turns the automatic
  // mode on, so merging a caller's { depth: 150 } over it would otherwise keep
  // the flag and quietly ignore the number - which is the sort of thing that
  // looks like the tipping check is wrong when it is the plumbing.
  const wantAuto = input.depthAuto ?? !(input.depth > 0);
  let auto = null;
  if (wantAuto || !(depth > 0)) {
    auto = autoDepth(base, book, density, PHI_TARGET);
    depth = auto.depth;
  }
  if (depth < floor) {
    warnings.push(
      `Kedalaman tapak dinaikkan ke ${floor} mm - kurang daripada itu tiada ruang `
      + 'untuk palung, bibir dan tenon pipi.',
    );
    depth = floor;
  }

  const d = derive({ ...base, depth });

  // The panel's outline, tabs and all. The frame band is measured from this,
  // so the tabs have to be in it before the pattern is asked anything.
  const bp = backPanelOutline(d);
  const minW = minWidthOf(t, kerf);
  const band = p.band ?? Math.max(6, 2.5 * minW);

  const name = fitName({
    text: p.name,
    faceData: p.faceData,
    shape: p.cartouche,
    panelW: d.panelW,
    panelH: height,
    minWidth: minW,
    band,
    capHeight: p.capHeight ?? CAP_DEFAULT,
  });
  if (name.missing && name.missing.length) {
    warnings.push(
      `Fon "${p.faceId}" tiada huruf untuk ${name.missing.join(' ')} - `
      + 'tanda soal akan diukir sebaliknya. Pilih fon lain.',
    );
  }
  if (name.tooLong) {
    warnings.push(
      `Nama terlalu panjang untuk kartus "${p.cartouche}" pada panel ini. `
      + 'Pendekkan nama, pilih bentuk lain, atau besarkan panel.',
    );
  }
  if (String(p.name || '').trim() && !p.faceData) {
    warnings.push('Fon belum dimuatkan, jadi nama tidak dapat diukir lagi.');
  }
  if (p.name && String(p.name).trim() && p.cartouche === 'none') {
    warnings.push('Nama perlukan satu kartus - corak akan menyeberanginya tanpa satu.');
  }

  const pattern = buildPattern({
    outline: bp.outline,
    thickness: t,
    kerf,
    preset: p.preset,
    pitch: p.pitch ?? undefined,
    theta: p.theta ?? undefined,
    strapWidth: p.strapWidth ?? undefined,
    frame: frameBand(t, kerf),
    cartouche: name.ring
      ? { shape: p.cartouche, cx: name.cx, cy: name.cy, a: name.a, b: name.b, band }
      : null,
  });
  warnings.push(...pattern.warnings);

  const built = buildParts(d, pattern, name);
  const parts = built.parts;
  // A base too short to carry a cheek tenon is a stand held together by glue on
  // an edge. featureRun returns nothing rather than inventing a tenon with no
  // land, so the emptiness is the signal.
  if (!built.cheek.feet.length) {
    warnings.push(
      `Tapak ${depth} mm terlalu cetek untuk tenon pipi - dalamkan ke sekurang-`
      + `kurangnya ${floor + 30} mm.`,
    );
  }
  // ONE TAB IS A HINGE. featureRun says so in its own comment and then has a
  // fallback that produces one anyway: when the run cannot hold two tabs with
  // a gap worth the name between them it drops to a single centred tab, and a
  // panel held by one tab pivots about it and lets the cheeks rack.
  //
  // Reachable on a thick board with a short panel - 12 mm stock under about
  // 170 mm of panel, or 9 mm under about 140 at a shallow angle - because a
  // thick board asks for a longer tab module AND more land, and the cheek's
  // bearing edge asks the run to start further up the slope again. It is a
  // real geometric limit rather than something to design around, so it is
  // reported with the two ways out.
  if (bp.tabs.length < 2) {
    warnings.push(
      `Panel ${height} mm terlalu pendek untuk dua tab pada papan ${t} mm - `
      + 'satu tab sahaja bermakna panel boleh berpusing padanya. Panjangkan '
      + 'panel atau guna papan lebih nipis.',
    );
  }

  const st = stability({ parts, d, density, book });
  // What the base would have to be, so the warning arrives with a fix attached
  // rather than an opinion. It is the same automatic depth the tool would have
  // chosen, so there is one number and one code path.
  const fixDepth = st.verdict === 'ok' ? null
    : (auto ? auto.depth : autoDepth(base, book, density).depth);
  const why = st.phiBack < PHI_GREEN
    ? `margin condong ${st.phiBack.toFixed(1)} darjah`
    : `hanya ${st.handLoadN.toFixed(1)} N tekanan di hujung atas panel sudah mengangkat tapak`;
  if (st.verdict === 'red') {
    warnings.push(
      `TERBALIK: ${why}. Dalamkan tapak ke ${fixDepth} mm atau kurangkan sudut `
      + `baca (${angle} darjah).`,
    );
  } else if (st.verdict === 'amber') {
    warnings.push(
      `Hampir terbalik: ${why}. Tapak ${fixDepth} mm akan selamat.`,
    );
  }

  // THE STAND OUTLIVES THE DESIGN SESSION, AND THE WOOD DOES NOT REMEMBER
  // WHICH QURAN IT WAS CUT FOR.
  //
  // The base depth above was sized for the book currently selected, and that
  // is the right thing to size for - a small stand for a small book should not
  // be forced to carry a base for a book it will never hold. But it leaves no
  // reserve at all, and a finished rehal on a shelf has no way of telling
  // anybody which book it was sized for. Somebody puts the big one on it. Sized
  // for the small Quran at 330 x 120 and 20 degrees the automatic depth is
  // 150 mm, and the large Quran on that same stand puts the loaded centre of
  // mass 12 mm BEHIND the base's rear edge: it goes over backwards.
  //
  // So the stand is re-weighed with the heaviest book in the table and the
  // answer is reported. It is a warning and not a resize on purpose - the user
  // said which book, and overruling that would make every small stand carry a
  // base it does not need - but it arrives with the depth that would fix it.
  const heaviest = BOOKS.reduce((a, b) => (b.mass > a.mass ? b : a));
  if (book && heaviest.mass > book.mass) {
    const stHeavy = stability({ parts, d, density, book: heaviest });
    if (stHeavy.verdict !== 'ok') {
      const deep = autoDepth(base, heaviest, density, PHI_TARGET).depth;
      const how = stHeavy.phiBack < 0
        ? 'akan TERBALIK ke belakang'
        : `hanya ${stHeavy.phiBack.toFixed(1)} darjah margin`;
      warnings.push(
        `Tapak ${depth} mm ini dikira untuk Quran "${book.name}" sahaja. Dengan `
        + `Quran "${heaviest.name}" di atasnya, rehal ${how}. Untuk selamat `
        + `dengan mana-mana Quran, dalamkan tapak ke ${deep} mm.`,
      );
    }
  }
  // Nothing anywhere else asks whether the panel is long enough for the book
  // it is being sized against - `slant` was only ever used to draw the slab in
  // the 3D view. A 120 mm panel supports less than half a 250 mm book, so the
  // book's weight hangs off the top of the panel instead of bearing on it, and
  // every mass figure above quietly assumes it does not.
  if (book && book.slant > height * 1.6) {
    warnings.push(
      `Panel ${height} mm terlalu pendek untuk Quran "${book.name}" (${book.slant} mm `
      + 'condong) - lebih separuh buku akan terjuntai di atas panel.',
    );
  }

  // The pattern must not be allowed anywhere near the joints. The frame band
  // does that at the panel's edges, and the tabs are part of that outline - so
  // this is a measurement of whether it worked, not a second attempt at it.
  const panel = parts.find((x) => x.id === 'panel');
  const tabRings = bp.tabs.map((f) => [
    [0, f.s], [d.t, f.s], [d.t, f.e], [0, f.e],
  ]).concat(bp.tabs.map((f) => [
    [d.panelW - d.t, f.s], [d.panelW, f.s], [d.panelW, f.e], [d.panelW - d.t, f.e],
  ]));
  const holeToJoint = (panel.holesNominal || []).length
    ? ringSetDistance(panel.holesNominal.map((h) => h.map(([x, y]) => [
      x + panel.originShift[0], y + panel.originShift[1],
    ])), tabRings)
    : Infinity;
  if (Number.isFinite(holeToJoint) && holeToJoint < d.land - 0.5) {
    warnings.push(
      `Corak terlalu hampir dengan tanggam (${holeToJoint.toFixed(1)} mm, `
      + `perlu ${d.land.toFixed(1)} mm).`,
    );
  }

  // The same land question, asked of the CHEEK, which nothing used to ask at
  // all - the check above measures the pattern against the panel's own tabs
  // and stops there. The cheek is where it bites: its lowest panel mortise
  // walks down towards the bottom edge, and that bottom edge is the face that
  // bears the panel's whole thrust into the base. It was measured at 4.45 mm
  // on 9 mm stock at a shallow angle, a third of the land the design asks for,
  // with nothing objecting - the connectivity prover has no opinion because
  // its floor is the survivability minimum, not a joint's working land.
  //
  // THE BEARING EDGE IS NOW HELD BY GEOMETRY, not by this warning: dims.js's
  // tabStart starts the run high enough up the slope that the land comes out
  // at jointLand across every angle from 20 to 45 and every thickness in the
  // picker. So this is a backstop, and it is deliberately not set at jointLand
  // - at 50 to 55 degrees the nearest edge stops being the bearing edge and
  // becomes the cheek's free rear edge, where 9 mm of land on 9 mm ply is a
  // perfectly good piece of wood and a warning would be noise. Half the joint
  // land is the level below which the strip has stopped being a land and is
  // just material; it is a chosen backstop, not a computed limit, and what it
  // is really watching for is featureRun's short-edge fallback, which centres
  // a single tab and cannot honour the margin it was given.
  const cheekL = parts.find((x) => x.id === 'cheekL');
  const cheekLand = (cheekL.holesNominal || []).length
    ? ringSetDistance(cheekL.holesNominal, [cheekL.outlineNominal || cheekL.outline])
    : Infinity;
  if (Number.isFinite(cheekLand) && cheekLand < d.land * 0.5) {
    warnings.push(
      `Tanggam pipi hanya ${cheekLand.toFixed(1)} mm daripada tepi (sepatutnya `
      + `${d.land.toFixed(1)} mm) - jalur ini memikul tolakan panel ke tapak. `
      + 'Panjangkan panel, naikkan sudut baca, atau guna papan lebih tebal.',
    );
  }

  // Test Zero on the rings the exporter writes. See crossCheck's own note for
  // why verifyPart cannot do this job: it runs on a raster trace, and a raster
  // cannot represent a crossing.
  const crossed = crossCheck(parts);
  for (const c of crossed) {
    warnings.push(
      `Garisan potong "${c.name}" bersilang sendiri (${c.count} tempat) - `
      + 'kepingan ini akan terputus. Jangan potong fail ini.',
    );
  }

  const verify = p.verify ?? 'pattern';
  const checks = [{ id: 'panel', ...pattern.check }];
  if (verify === 'all') {
    for (const part of parts) {
      if (part.id === 'panel') continue;
      const r = verifyPart(part, t, kerf, d.land);
      checks.push(r);
      if (r.pass === false) {
        warnings.push(`Semakan sambungan gagal pada "${part.name}" - jangan potong fail ini.`);
      }
    }
  }

  let cutLen = 0;
  for (const part of parts) {
    cutLen += perimeter(part.outline);
    for (const h of part.holes) cutLen += perimeter(h);
  }

  const allow = fitAllowance(t) + taperAllowance(t, kerf);
  // `ok` is about the CUT FILE, not about the stand. A design that tips is
  // still a valid file - the user may be building a display piece, and the
  // tool does not get to overrule that - so tipping is reported through
  // stability.verdict and a warning, and the export dialog is where a red
  // verdict earns a checkbox. What `ok` false means is that something would
  // fall out of the sheet or a name would run off its medallion - and a piece
  // whose cut line crosses itself is the plainest case of that there is, so
  // `crossed` is part of it and is not conditional on the verify mode.
  const ok = pattern.ok && !crossed.length
    && checks.every((c) => c.pass !== false) && !name.tooLong;
  // The parameters as USED, not as handed in. Everything here has been through
  // a clamp, and a readout or a saved design that carried the raw request back
  // would disagree with the geometry beside it - which is how a user ends up
  // certain the tool ignored them when in fact it told them and they did not
  // see where. measuredThickness especially: it is the number the joints were
  // actually cut to.
  const params = {
    ...p,
    thickness: t,
    measuredThickness: tMeasured,
    kerf,
    density,
    angle,
    depth,
    lipHeight,
    width,
    height,
    band,
  };
  // The loaded face is megabytes of glyph data and belongs to the font cache,
  // not to a saved design. Everything else here round-trips through JSON.
  delete params.faceData;

  return {
    ok,
    warnings,
    params,
    dims: d,
    panels: parts,
    pattern,
    name,
    book: bookFrame(d, book),
    stability: { ...st, fixDepth, green: PHI_GREEN, red: PHI_RED, target: PHI_TARGET },
    checks,
    crossed,
    derived: {
      // The stand's real bounding box. The tallest thing on it is the cheek's
      // rear top corner, not the panel's, because the rail stands proud of the
      // reading face and the rear edge is cut square rather than square to the
      // panel.
      overall: [width, depth, t + d.vRail(d.uRear)],
      panelSize: [d.panelW, height],
      baseDepthFloor: floor,
      autoDepth: auto ? auto.depth : null,
      // The depth at which nothing hangs off the back at all. Offered, not
      // chosen: it costs a third more base and the automatic depth is already
      // clear of tipping by a wide margin.
      flushDepth: flushDepth(base),
      angleNote: angleNote(angle),
      troughGap: d.trough,
      lipFrontX: d.xLipFront,
      lipRearX: d.xLipRear,
      bookRestX: d.xBook,
      overhang: Math.max(0, -d.uRear),
      mortiseWidth: mortiseWidth(t, kerf, tMeasured),
      mortiseAllowance: allow,
      tabModule: tabModule(t),
      minWidth: minW,
      cutLengthMm: cutLen,
      pieces: parts.length,
      pattern: pattern.derived,
      nameCapHeight: name.capHeight,
      nameTooLong: !!name.tooLong,
    },
  };
}

/**
 * Where to draw the book in the 3D view.
 *
 * A slab the cut file cannot show, drawn so the reading angle is readable at a
 * glance - the same trick the Keychain viewer uses for its split ring. Its
 * origin is the corner the real book comes to rest on, which is the same
 * corner the trough was measured from, so if the drawing looks wrong the
 * arithmetic that placed the lip is wrong too.
 */
function bookFrame(d, book) {
  if (!book) return null;
  const y = (d.width - Math.min(book.open, d.width + 120)) / 2;
  return {
    id: book.id,
    origin: [d.xBook, y, d.t],
    U: [0, 1, 0],
    V: [d.v[0], 0, d.v[1]],
    N: [d.n[0], 0, d.n[1]],
    size: [Math.min(book.open, d.width + 120), book.slant, book.thickness],
    mass: book.mass,
  };
}

export {
  MATERIALS, BOOKS, materialOf, bookOf, derive, depthFloor, flushDepth, angleNote,
  ANGLE_MIN, ANGLE_MAX, ANGLE_DEFAULT, FRONT_MARGIN,
  PHI_GREEN, PHI_RED, PHI_TARGET, autoDepth, stability,
  fitName, toFlat, buildParts, backPanelOutline, mortiseWidth, tabModule,
  FACE_GROUPS, FACE_DEFAULT, FACE_SAFE, CURATED,
};
