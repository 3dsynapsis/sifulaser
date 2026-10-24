// Ujian reka bentuk tersimpan Puzzle Generator (Simpan / Reka bentuk saya).
//
//     node scripts/test-puzzle-designs.mjs
//
// Mengimport terus daripada docs/puzzle/src - kod yang sifulaser.com hidangkan.
// Tanpa pelayar: fetch dan localStorage dipalsukan, dan apa yang dihantar
// disemak terhadap firestore.rules (kunci yang dibenarkan, had saiz).
//   * bentuk data      - params = sepuluh tetapan penjana (<= 40 kunci), setiap
//                        nilai boleh dikodkan; bahan dan lapisan dalam extra.
//   * pergi-balik      - keadaan bukan lalai (saiz, grid, tab, jitter, seed,
//                        bucu, kerf, bahan, lapisan, nama Melayu + emoji)
//                        melalui format Firestore kembali tepat, dan puzzle
//                        yang sama (garisan yang sama) dibina.
//   * rekod rosak      - jenis salah, NaN, kunci asing, extra bukan JSON, tiada
//                        params, nilai di luar julat: jatuh ke lalai atau ke
//                        tepi julat, tidak campak, puzzle masih dibina.
//   * simpan senyap    - tiada sesi -> tiada panggilan; dua serentak -> satu
//                        POST kemudian PATCH; ditolak -> false tanpa campak.
//   * senarai alat     - designs.js kenal tray dan TOOL = 'puzzle'.

import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const DOCS = path.join(here, '..', 'docs');
const imp = (rel) => import(pathToFileURL(path.join(DOCS, rel)).href);

const S = await imp('puzzle/src/saved.js');
const C = await imp('puzzle/src/cloud.js');
const G = await imp('puzzle/src/designs.js');
const { buildPuzzle, DEFAULTS } = await imp('puzzle/src/geom/puzzle.js');
const { MATERIALS } = await imp('puzzle/src/store.js');

let passed = 0;
let failed = 0;
const fails = [];
function check(name, cond, detail = '') {
  if (cond) { passed++; return; }
  failed++;
  if (fails.length < 60) fails.push(`${name}${detail ? ` - ${detail}` : ''}`);
}
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const trip = (row) => C.fromFields(C.toFields(row));
const recordOf = (st, name) => trip({
  name: name ?? S.autoName(st), tool: 'puzzle', params: S.designParams(st),
  material: S.designMaterial(st), extra: JSON.stringify(S.designExtra(st)),
});
// Nilai yang Firestore boleh simpan: teks, nombor terhingga, boolean, null,
// array dan objek kecil daripadanya.
const encodable = (v) => v === null || ['string', 'boolean'].includes(typeof v)
  || (typeof v === 'number' && Number.isFinite(v))
  || (Array.isArray(v) && v.every(encodable))
  || (typeof v === 'object' && Object.values(v).every(encodable));

// ---- bentuk data ---------------------------------------------------------------
{
  const st = S.defaultState();
  const dp = S.designParams(st);
  check('lalai: params <= 40 kunci', Object.keys(dp).length <= 40, `${Object.keys(dp).length}`);
  check('lalai: params = kunci DEFAULTS penjana', same(Object.keys(dp), Object.keys(DEFAULTS)), Object.keys(dp).join());
  check('lalai: setiap nilai boleh dikodkan', Object.values(dp).every(encodable), JSON.stringify(dp));
  check('lalai: extra kecil dan boleh dikodkan', encodable(S.designExtra(st))
    && same(S.designExtra(st), { material: 'falcata3', splitLayers: false }), JSON.stringify(S.designExtra(st)));
  check('lalai: nama automatik', S.autoName(st) === 'Puzzle 300 x 200 mm, 15 x 10 keping', S.autoName(st));
  check('lalai: bahan', S.designMaterial(st) === 'Falcata 3 mm', S.designMaterial(st));
  check('lalai: tiada latar pratonton dalam rekod', !('backdrop' in S.designExtra(st)) && !('backdrop' in dp));
  const back = S.readDesign(recordOf(st));
  check('lalai: pergi-balik kembali lalai', same(back.state, S.defaultState()) && back.name === '');
  check('lalai: puzzle dibina', buildPuzzle(back.state.params).derived.pieces === 150);
}

// ---- pergi-balik --------------------------------------------------------------
{
  const st = S.defaultState();
  Object.assign(st.params, {
    width: 420.5, height: 297, cols: 20, rows: 14, tabSize: 22.5, jitter: 6,
    seed: 4242, cornerRadius: 0, kerf: 0.15, kerfComp: false,
  });
  st.material = 'acrylic-clear';
  st.splitLayers = true;
  st.name = 'Puzzle Hari Raya 🌙 untuk Mak Cik Siti - "édition" ñ';
  for (const k of Object.keys(DEFAULTS)) {
    check(`pergi-balik: ${k} bukan lalai`, st.params[k] !== S.defaultState().params[k]);
  }
  const row = recordOf(st, st.name);
  const { name, state: back } = S.readDesign(row);
  check('pergi-balik: params sama', same(S.designParams(back), S.designParams(st)), JSON.stringify(S.designParams(back)));
  check('pergi-balik: extra sama (bahan, lapisan)', same(S.designExtra(back), S.designExtra(st)), JSON.stringify(S.designExtra(back)));
  check('pergi-balik: keadaan penuh sama', same(back, st), JSON.stringify(back));
  check('pergi-balik: nama Melayu + emoji dikekalkan', name === st.name && back.name === st.name, name);
  check('pergi-balik: bahan dibaca manusia', row.material === 'Acrylic 3 mm (Clear)', row.material);
  const auto = S.readDesign(recordOf(st));
  check('pergi-balik: nama automatik kekal automatik', auto.name === '' && auto.state.name === S.UNTITLED
    && S.autoName(st) === 'Puzzle 420.5 x 297 mm, 20 x 14 keping', S.autoName(st));
  const a = buildPuzzle(st.params);
  const b = buildPuzzle(back.params);
  check('pergi-balik: puzzle yang sama dibina', a.h === b.h && a.v === b.v && a.border === b.border
    && b.derived.pieces === 280);
  // Nombor bulat menjadi integerValue rentetan dalam Firestore dan kembali sebagai nombor.
  const f = C.toFields({ params: S.designParams(st) }).params.mapValue.fields;
  check('pergi-balik: height sebagai integerValue, width sebagai doubleValue', f.height.integerValue === '297'
    && f.width.doubleValue === 420.5 && f.kerfComp.booleanValue === false && f.cornerRadius.integerValue === '0');
  check('pergi-balik: rekod sendiri dibaca sebagai nombor', typeof row.params.height === 'number' && row.params.height === 297);
  // Setiap bahan yang alat ada boleh disimpan dan dibuka semula.
  const mats = MATERIALS.map((m) => S.readDesign(recordOf({ ...st, material: m.id })).state.material);
  check('pergi-balik: setiap bahan', same(mats, MATERIALS.map((m) => m.id)), mats.join());
}

// ---- rekod rosak ------------------------------------------------------------------
{
  const d = S.defaultState();
  const junk = S.readDesign({
    name: 42,
    params: {
      width: '300', height: NaN, cols: null, rows: [4], tabSize: Infinity, jitter: { x: 1 },
      seed: 'abc', cornerRadius: true, kerf: -Infinity, kerfComp: 'ya', evil: 1, __proto__: { x: 1 },
    },
    extra: '{oops',
  });
  check('rosak: tidak campak, nilai rosak -> lalai', same(junk.state.params, d.params), JSON.stringify(junk.state.params));
  check('rosak: kunci asing diabaikan', !('evil' in junk.state.params) && Object.keys(junk.state.params).length === Object.keys(DEFAULTS).length);
  check('rosak: extra bukan JSON -> bahan dan lapisan lalai', junk.state.material === 'falcata3' && junk.state.splitLayers === false);
  check('rosak: nama bukan teks -> automatik', junk.name === '' && junk.state.name === S.UNTITLED);
  check('rosak: puzzle masih dibina', buildPuzzle(junk.state.params).derived.pieces === 150);

  // Di luar julat kawalan: ke tepi julat. 100,000 lajur akan membekukan tab.
  const wild = S.readDesign({ params: { width: 5, height: 1e9, cols: 1e5, rows: -3, tabSize: 99, jitter: -1, seed: 4.6, cornerRadius: 500, kerf: 7 } });
  const w = wild.state.params;
  check('rosak: di luar julat -> tepi julat', w.width === 20 && w.height === 900 && w.cols === 60 && w.rows === 2
    && w.tabSize === 30 && w.jitter === 0 && w.seed === 5 && w.cornerRadius === 40 && w.kerf === 0.6, JSON.stringify(w));
  const t0 = Date.now();
  check('rosak: di luar julat masih dibina, cepat', buildPuzzle(w).derived.pieces === 120 && Date.now() - t0 < 2000);

  const tries = [
    null, undefined, {}, 'teks', 42, [],
    { params: null }, { params: 'x' }, { params: [1, 2, 3] },
    { params: { width: 250 }, extra: 7 }, { params: { width: 250 }, extra: '[1,2]' }, { params: { width: 250 }, extra: 'null' },
    { params: { width: 250 }, extra: JSON.stringify({ material: 'emas', splitLayers: 'ya' }) },
    { name: '   ', params: { cols: 2.4 } }, { name: 'x'.repeat(500) },
  ];
  for (const row of tries) {
    let out = null;
    let threw = false;
    try { out = S.readDesign(row); } catch { threw = true; }
    const ok = !threw && out && typeof out.name === 'string' && out.name.length <= 120
      && Object.keys(out.state.params).length === Object.keys(DEFAULTS).length
      && Object.values(out.state.params).every(encodable)
      && MATERIALS.some((m) => m.id === out.state.material) && typeof out.state.splitLayers === 'boolean';
    let built = false;
    try { built = ok && buildPuzzle(out.state.params).derived.pieces > 0; } catch { built = false; }
    check(`rosak: ${JSON.stringify(row)?.slice(0, 60)} -> keadaan sah, dibina`, ok && built);
  }
  const foreign = S.readDesign({ params: { width: 250 }, extra: JSON.stringify({ material: 'emas', splitLayers: 'ya' }) });
  check('rosak: bahan asing diabaikan, saiz kekal', foreign.state.material === 'falcata3' && foreign.state.splitLayers === false
    && foreign.state.params.width === 250);
  check('rosak: nama terlalu panjang dipotong ke 120', S.readDesign({ name: 'x'.repeat(500) }).name.length === 120);
  check('rosak: cols pecahan dibundarkan', S.readDesign({ params: { cols: 2.4 } }).state.params.cols === 2);
  // designParams sendiri juga membersihkan: keadaan pelayar lama dengan kunci asing.
  const dp = S.designParams({ params: { ...DEFAULTS, width: 250, oldKey: 'x', kerf: NaN } });
  check('rosak: designParams hanya kunci penjana, NaN -> lalai', same(Object.keys(dp), Object.keys(DEFAULTS))
    && dp.width === 250 && dp.kerf === d.params.kerf);
  check('rosak: designParams/Extra/Material/autoName tanpa keadaan', Object.keys(S.designParams(undefined)).length === 10
    && S.designExtra(null).material === 'falcata3' && S.designMaterial({}) === 'Falcata 3 mm'
    && S.autoName({}) === 'Puzzle 300 x 200 mm, 15 x 10 keping');
}

// ---- simpan senyap: fetch palsu -------------------------------------------------------
{
  const st = S.defaultState();
  const store = new Map();
  globalThis.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k),
  };
  const calls = [];
  let reply = (req) => ({ status: 200, body: JSON.stringify({ name: `projects/sifulaser/databases/(default)/documents/users/u1/designs/${req.method === 'POST' ? 'abc' : req.url.split('/').pop()}` }) });
  globalThis.fetch = async (url, init) => {
    const req = { url: String(url), method: init.method, headers: init.headers, body: init.body ? JSON.parse(init.body) : null };
    calls.push(req);
    await new Promise((r) => setTimeout(r, 5));
    const res = reply(req);
    return { ok: res.status < 300, status: res.status, text: async () => res.body };
  };
  // Sama seperti galleryStore dalam main.js.
  const gstore = {
    name: () => (st.name && st.name !== S.UNTITLED ? st.name : S.autoName(st)),
    params: () => S.designParams(st),
    material: () => S.designMaterial(st),
    extra: () => S.designExtra(st),
    rename: () => {},
    apply: () => {},
  };

  check('simpan: tanpa daftar masuk -> tiada panggilan', (await G.saveQuietly(gstore)) === false && calls.length === 0);
  store.set('sifulaser.session', JSON.stringify({ uid: 'u1', token: 'tok', email: 'a@b.c', exp: Date.now() - 1000 }));
  check('simpan: sesi tamat -> tiada panggilan', (await G.saveQuietly(gstore)) === false && calls.length === 0);
  store.set('sifulaser.session', JSON.stringify({ uid: 'u1', token: 'tok', email: 'a@b.c', exp: Date.now() + 3.6e6 }));

  // Export dibuka dan SVG ditekan serta-merta: dua simpanan serentak.
  const [r1, r2] = await Promise.all([G.saveQuietly(gstore), G.saveQuietly(gstore)]);
  check('simpan: dua serentak -> satu POST kemudian PATCH id yang sama', r1 && r2 && calls.length === 2
    && calls[0].method === 'POST' && calls[1].method === 'PATCH' && calls[1].url.includes('/users/u1/designs/abc'),
  calls.map((c) => `${c.method} ${c.url}`).join(' ; '));
  const f = calls[0].body.fields;
  const allowed = ['name', 'tool', 'params', 'material', 'updatedAt', 'extra'];
  check('simpan: ke akaun sendiri, dengan token', calls[0].url.includes('/documents/users/u1/designs')
    && calls[0].headers.Authorization === 'Bearer tok');
  check('simpan: kunci rekod ikut firestore.rules', Object.keys(f).every((k) => allowed.includes(k)), Object.keys(f).join());
  check('simpan: tool puzzle, nama automatik, nama <= 120, tool <= 40', f.tool.stringValue === 'puzzle'
    && f.name.stringValue === 'Puzzle 300 x 200 mm, 15 x 10 keping' && f.name.stringValue.length <= 120
    && f.tool.stringValue.length <= 40);
  check('simpan: params map <= 40 kunci', !!f.params.mapValue && Object.keys(f.params.mapValue.fields).length === 10
    && Object.keys(f.params.mapValue.fields).length <= 40);
  check('simpan: bahan teks, extra teks <= 700000', f.material.stringValue === 'Falcata 3 mm'
    && typeof f.extra.stringValue === 'string' && f.extra.stringValue.length <= 700000
    && JSON.parse(f.extra.stringValue).material === 'falcata3');
  check('simpan: updatedAt teks ISO', typeof f.updatedAt.stringValue === 'string' && Number.isFinite(Date.parse(f.updatedAt.stringValue)));

  st.params.cols = 20;
  st.name = 'Puzzle Mak 🌙';
  await G.saveQuietly(gstore);
  check('simpan: kali kedua -> PATCH entri yang sama', calls.length === 3 && calls[2].method === 'PATCH'
    && calls[2].url.endsWith('/designs/abc')
    && calls[2].body.fields.params.mapValue.fields.cols.integerValue === '20'
    && calls[2].body.fields.name.stringValue === 'Puzzle Mak 🌙');

  reply = () => ({ status: 403, body: '' });
  let threw = false;
  let res403;
  try { res403 = await G.saveQuietly(gstore); } catch { threw = true; }
  check('simpan: ditolak 403 -> false, tidak campak', !threw && res403 === false);
  reply = () => ({ status: 500, body: 'boom' });
  threw = false;
  let res500;
  try { res500 = await G.saveQuietly(gstore); } catch { threw = true; }
  check('simpan: ralat pelayan 500 -> false, tidak campak', !threw && res500 === false);
  reply = (req) => ({ status: 200, body: JSON.stringify({ name: `x/designs/${req.url.split('/').pop()}` }) });
  check('simpan: barisan pulih selepas gagal', (await G.saveQuietly(gstore)) === true);

  // Galeri: rekod dibuka ikut id, dan rekod alat lain tidak dibuka di sini.
  const doc = (id, tool) => ({ name: `x/designs/${id}`, fields: C.toFields({ name: 'D', tool, params: S.designParams(st), updatedAt: '2026-10-24T00:00:00Z' }) });
  reply = () => ({ status: 200, body: JSON.stringify({ documents: [doc('z1', 'puzzle'), doc('p1', 'plakbox')] }) });
  let applied = null;
  const opener = { ...gstore, apply: (row) => { applied = row; } };
  check('galeri: buka ikut id', (await G.openById(opener, 'z1')) === true && applied && applied.id === 'z1'
    && S.readDesign(applied).state.params.cols === 20);
  applied = null;
  check('galeri: rekod alat lain tidak dibuka', (await G.openById(opener, 'p1')) === false && applied === null);
  delete globalThis.fetch;
  delete globalThis.localStorage;
}

// ---- senarai alat ------------------------------------------------------------------
check('senarai alat: TOOL = puzzle', G.TOOL === 'puzzle', G.TOOL);
check('senarai alat: puzzle dan tray dikenali', G.TOOLS.puzzle?.path === '/puzzle/' && G.TOOLS.tray?.path === '/tray/');

console.log(`${passed} lulus, ${failed} gagal`);
if (failed) {
  for (const f of fails) console.log(`  GAGAL ${f}`);
  process.exit(1);
}
