// Money and sizes. No floating ringgit anywhere.
//
// The geometry step ends with each piece's width and height in whole
// micrometres (rounded half up once). From there everything is integer:
//
//   area   = sum(W_um x H_um)                    um^2, BigInt
//   n      = area x rate_sen x quantity          BigInt (5.4e17 on a big order,
//                                                past 2^53, so Number is unsafe)
//   D      = 92,903,040,000 um^2 = 1 sq ft (304.8 mm squared)
//   subtotal (nearest 10 sen, half up) = floor((n + 5D) / 10D) x 10
//   total  = max(subtotal, 2000)
//
// Decisions the spec left open, and why (QA plan section 0):
//   D1 round first, then the minimum; the note shows only if the ROUNDED
//      subtotal is under RM20. Raw 1995 sen rounds to RM20.00 - no note.
//   D2 price from exact sizes, never from the rounded numbers on screen:
//      3 pieces at 5mm x3 is RM25.60 exact, RM25.70 from the displayed sq ft.
//   D3 a piece fits the bed if its SHOWN size fits (cm to 1 decimal, half up):
//      the customer never sees "90.0 x 60.0 cm" next to a rejection. That is a
//      tolerance of just under 0.5 mm, which also absorbs Illustrator writing
//      600 mm as 1700.79 pt = 600.0009 mm (research report, fixture i2).
//   Integer micrometres rather than 0.001 pt (the fixture generator's grid):
//      the spec defines the sq ft in millimetres, and every hand-worked row of
//      the QA table is in millimetres. Both grids agree on every fixture - the
//      test suite checks expected.json's prices through this code.

export const SQFT_UM2 = 92_903_040_000n;
export const MIN_SEN = 2000;
export const BED_LONG_MM = 900;
export const BED_SHORT_MM = 600;

export const MATERIALS = [
  { id: '2mm', label: 'Akrilik Jernih 2mm', rateSen: 2000 },
  { id: '3mm', label: 'Akrilik Jernih 3mm', rateSen: 2200 },
  { id: '5mm', label: 'Akrilik Jernih 5mm', rateSen: 3000 },
];
export const DEFAULT_MATERIAL = '3mm';
export const materialById = (id) => MATERIALS.find((m) => m.id === id) || null;

/** Points (already x UserUnit) to whole micrometres, half up. */
export const ptToUm = (pt) => Math.round((pt * 25400) / 72);
export const mmToUm = (mm) => Math.round(mm * 1000);

/** A length shown in cm with 1 decimal is a whole number of mm, half up. */
export const tenthsCm = (um) => Math.floor((um + 500) / 1000);
export const fmtCm = (um) => {
  const t = tenthsCm(um);
  return `${Math.floor(t / 10)}.${t % 10}`;
};
export const fmtSizeCm = (wUm, hUm) => `${fmtCm(wUm)} x ${fmtCm(hUm)} cm`;

export const areaUm2 = (wUm, hUm) => BigInt(wUm) * BigInt(hUm);

/** Square feet to 3 decimals, half up, from an exact area. */
export function fmtSqft(um2) {
  const thousandths = (BigInt(um2) * 1000n + SQFT_UM2 / 2n) / SQFT_UM2;
  const s = thousandths.toString().padStart(4, '0');
  return `${s.slice(0, -3)}.${s.slice(-3)}`;
}

/** "RM58,125.10" - thousands comma, always two decimals. */
export function fmtRM(sen) {
  const v = BigInt(sen);
  const neg = v < 0n;
  const abs = neg ? -v : v;
  const rm = (abs / 100n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const cents = (abs % 100n).toString().padStart(2, '0');
  return `${neg ? '-' : ''}RM${rm}.${cents}`;
}

/** Spec rule 8: 90 x 60 cm bed, either orientation, judged on the shown size. */
export function fitsBed(wUm, hUm) {
  const a = tenthsCm(wUm), b = tenthsCm(hUm);
  return Math.max(a, b) <= BED_LONG_MM && Math.min(a, b) <= BED_SHORT_MM;
}

/**
 * The quantity box. Whole numbers only; " 5 " and "05" are 5. Anything else -
 * "", "0", "-1", "1.5", "1e3", "1,5", "10 pcs" - is refused, never coerced.
 * Spec rule 6 sets no upper limit, so there is none: any whole number from 1
 * is priced (the maths is BigInt). The only ceiling is the largest integer a
 * JavaScript number holds exactly, about 9 quadrillion sets.
 */
export function parseQty(text) {
  const s = String(text ?? '').trim();
  if (!/^\d+$/.test(s)) return { ok: false, code: 'qty-invalid' };
  const n = Number(s.replace(/^0+(?=\d)/, ''));
  if (!Number.isSafeInteger(n) || n < 1) return { ok: false, code: 'qty-invalid' };
  return { ok: true, value: n };
}

/**
 * Price an order. `pieces` are [{ wUm, hUm }]. Returns everything the screen
 * and the WhatsApp message show, so the two can never disagree (QA plan E9).
 */
export function quote(pieces, materialId, qtyText) {
  const material = materialById(materialId);
  const lines = pieces.map((p, i) => {
    const a = areaUm2(p.wUm, p.hUm);
    return {
      index: i + 1,
      wUm: p.wUm,
      hUm: p.hUm,
      sizeText: fmtSizeCm(p.wUm, p.hUm),
      areaUm2: a,
      sqftText: fmtSqft(a),
      fits: fitsBed(p.wUm, p.hUm),
    };
  });
  const setArea = lines.reduce((s, l) => s + l.areaUm2, 0n);
  const base = { material, lines, setAreaUm2: setArea, setSqftText: fmtSqft(setArea) };
  if (!pieces.length) return { ...base, state: 'no-pieces' };
  if (lines.some((l) => !l.fits)) return { ...base, state: 'oversize' };
  if (!material) return { ...base, state: 'no-material' };
  const q = parseQty(qtyText);
  if (!q.ok) return { ...base, state: 'bad-qty', qtyCode: q.code };
  const n = setArea * BigInt(material.rateSen) * BigInt(q.value);
  const subtotalBig = ((n + 5n * SQFT_UM2) / (10n * SQFT_UM2)) * 10n;
  const subtotalSen = Number(subtotalBig);
  const minApplied = subtotalSen < MIN_SEN;
  const totalSen = minApplied ? MIN_SEN : subtotalSen;
  // The texts come from the BigInt, so they stay exact past 2^53 sen too.
  const totalBig = minApplied ? BigInt(MIN_SEN) : subtotalBig;
  return {
    ...base,
    state: 'priced',
    qty: q.value,
    rateSen: material.rateSen,
    rateText: `${fmtRM(material.rateSen)} / kaki persegi`,
    subtotalSen,
    subtotalText: fmtRM(subtotalBig),
    minApplied,
    totalSen,
    totalText: fmtRM(totalBig),
  };
}
