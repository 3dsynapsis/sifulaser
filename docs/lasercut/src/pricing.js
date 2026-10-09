// Money and sizes for a laser cut job.
//
//   price per set = material + laser time
//     material    = sum of piece boxes (sq ft) x sheet price / sheet area
//                   x MATERIAL_MARKUP
//     laser time  = (cut + score + engrave + travel) minutes x RATE_SEN_PER_MIN
//   total         = price per set x quantity, nearest 10 sen (half up),
//                   never under MIN_SEN
//
// The time is an estimate (see laser.js), so the customer is shown a range:
// RANGE below and above the total, in whole ringgit, both ends at least the
// minimum. The staff confirm the final price.
//
// Sizes stay in whole micrometres (rounded half up once, from the geometry), so
// "10.0 x 5.0 cm" on screen and the area that is priced come from one number.

export const SQFT_UM2 = 92_903_040_000n; // 1 sq ft = 304.8 mm squared, in um^2
export const SHEET_SQFT = 12;            // prices are per 4 x 3 ft sheet
export const RATE_SEN_PER_MIN = 300;     // RM3 a minute of laser time
export const MIN_SEN = 1000;             // RM10 minimum per order
export const RANGE = 0.15;               // shown as total -15% .. +15%
export const MATERIAL_MARKUP = 2;        // material is charged at cost + 100%
export const BED_LONG_MM = 1200;         // largest piece, either orientation:
export const BED_SHORT_MM = 900;         // a 4 x 3 ft sheet on a 1280 x 900 bed

// Material groups, as the picker shows them: a swatch per group, then the
// thicknesses it comes in.
export const GROUPS = [
  { id: 'ply', name: 'Plywood', note: 'Kayu lapis' },
  { id: 'mdf', name: 'MDF', note: 'Papan gentian' },
  { id: 'clear', name: 'Akrilik Clear', note: 'Jernih' },
  { id: 'black', name: 'Akrilik Hitam', note: 'Hitam berkilat' },
  { id: 'gold', name: 'Cermin Emas', note: 'Akrilik mirror' },
  { id: 'silver', name: 'Cermin Perak', note: 'Akrilik mirror' },
];

// sheetSen: the price of one 4 x 3 ft sheet (Boss, 9 Okt 2026). cutSpeed in
// mm/s from bridge/config.json; the ones marked "est" are not in that file yet
// and are estimates until measured on the machine. Akrilik Hitam has no price
// of its own yet: it uses Akrilik Clear's until Boss sets one.
export const MATERIALS = [
  { id: 'ply3', group: 'ply', thick: '3mm', label: 'Plywood 3mm', sheetSen: 3000, cutSpeed: 15 },
  { id: 'ply5', group: 'ply', thick: '5mm', label: 'Plywood 5mm', sheetSen: 3000, cutSpeed: 8 },
  { id: 'mdf3', group: 'mdf', thick: '3mm', label: 'MDF 3mm', sheetSen: 3000, cutSpeed: 14 },
  { id: 'mdf5', group: 'mdf', thick: '5mm', label: 'MDF 5mm', sheetSen: 4000, cutSpeed: 8 },           // est
  { id: 'acr2', group: 'clear', thick: '2mm', label: 'Akrilik Clear 2mm', sheetSen: 5000, cutSpeed: 25 }, // est
  { id: 'acr3', group: 'clear', thick: '3mm', label: 'Akrilik Clear 3mm', sheetSen: 7000, cutSpeed: 18 },
  { id: 'acr5', group: 'clear', thick: '5mm', label: 'Akrilik Clear 5mm', sheetSen: 8000, cutSpeed: 10 },
  { id: 'blk2', group: 'black', thick: '2mm', label: 'Akrilik Hitam 2mm', sheetSen: 5000, cutSpeed: 25 }, // est, price = clear
  { id: 'blk3', group: 'black', thick: '3mm', label: 'Akrilik Hitam 3mm', sheetSen: 7000, cutSpeed: 18 }, // price = clear
  { id: 'gold15', group: 'gold', thick: '1.5mm', label: 'Akrilik Cermin Emas 1.5mm', sheetSen: 8000, cutSpeed: 30 },   // est
  { id: 'silv15', group: 'silver', thick: '1.5mm', label: 'Akrilik Cermin Perak 1.5mm', sheetSen: 8000, cutSpeed: 30 }, // est
];
export const DEFAULT_MATERIAL = 'ply3';
export const materialById = (id) => MATERIALS.find((m) => m.id === id) || null;
export const groupById = (id) => GROUPS.find((g) => g.id === id) || null;
export const CUT_SPEEDS = Object.fromEntries(MATERIALS.map((m) => [m.id, m.cutSpeed]));

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
  const v = BigInt(Math.round(Number(sen)));
  const neg = v < 0n;
  const abs = neg ? -v : v;
  const rm = (abs / 100n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const cents = (abs % 100n).toString().padStart(2, '0');
  return `${neg ? '-' : ''}RM${rm}.${cents}`;
}

/** "RM1,250" - whole ringgit, for the range. */
export const fmtRMWhole = (sen) => `RM${Math.round(sen / 100).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;

/** "45 saat", "3 min 05 saat", "1 jam 20 min". */
export function fmtDuration(sec) {
  const s = Math.max(0, Math.round(sec));
  if (s < 60) return `${s} saat`;
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60;
  if (h) return `${h} jam ${m} min`;
  return `${m} min ${String(x).padStart(2, '0')} saat`;
}

/** A piece fits if its SHOWN size fits the bed, either way round. */
export function fitsBed(wUm, hUm) {
  const a = tenthsCm(wUm), b = tenthsCm(hUm);
  return Math.max(a, b) <= BED_LONG_MM && Math.min(a, b) <= BED_SHORT_MM;
}

/**
 * The quantity box. Whole numbers only; " 5 " and "05" are 5. Anything else -
 * "", "0", "-1", "1.5", "1e3", "10 pcs" - is refused, never coerced.
 */
export function parseQty(text) {
  const s = String(text ?? '').trim();
  if (!/^\d+$/.test(s)) return { ok: false, code: 'qty-invalid' };
  const n = Number(s.replace(/^0+(?=\d)/, ''));
  if (!Number.isSafeInteger(n) || n < 1) return { ok: false, code: 'qty-invalid' };
  return { ok: true, value: n };
}

/** Seconds of laser time for one set on this material. */
export function setSeconds(laser, material) {
  if (!laser || !material) return 0;
  return (laser.cutSec[material.id] || 0) + laser.scoreSec + laser.engraveSec + laser.rapidSec;
}

/**
 * Price an order. `pieces` are [{ wUm, hUm }], `laser` is laserJob() output.
 * Returns everything the screen and the WhatsApp message show, so the two can
 * never disagree.
 */
export function quote(pieces, laser, materialId, qtyText) {
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

  // Material in milli-sen through BigInt (a big order passes 2^53), then sen.
  const materialSen = (Number((setArea * BigInt(material.sheetSen) * 1000n) / (BigInt(SHEET_SQFT) * SQFT_UM2)) / 1000) * MATERIAL_MARKUP;
  const sec = setSeconds(laser, material);
  const timeSen = (sec / 60) * RATE_SEN_PER_MIN;
  const setSen = materialSen + timeSen;
  const raw = setSen * q.value;
  const rounded = Math.floor(raw / 10 + 0.5) * 10;
  const minApplied = rounded < MIN_SEN;
  const totalSen = Math.max(rounded, MIN_SEN);
  // The range is taken around the job's own price, before the minimum: a RM1
  // job is "RM10", not "RM10 - RM12".
  const lowSen = Math.max(MIN_SEN, Math.floor((rounded * (1 - RANGE)) / 100) * 100);
  const highSen = Math.max(MIN_SEN, Math.ceil((rounded * (1 + RANGE)) / 100) * 100);
  const single = lowSen === highSen;
  return {
    ...base,
    state: 'priced',
    qty: q.value,
    sheetText: `${fmtRM(material.sheetSen)} sekeping 4 x 3 kaki`,
    materialSen,
    materialText: fmtRM(materialSen * q.value),
    setSeconds: sec,
    timeText: fmtDuration(sec * q.value),
    timeSen,
    timeCostText: fmtRM(timeSen * q.value),
    minApplied,
    totalSen,
    totalText: fmtRM(totalSen),
    lowSen,
    highSen,
    rangeText: single ? fmtRMWhole(lowSen) : `${fmtRMWhole(lowSen)} - ${fmtRMWhole(highSen)}`,
  };
}
