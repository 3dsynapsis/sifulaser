// Ujian reka bentuk tersimpan Tray Organizer (Simpan / Reka bentuk saya).
//
//     node scripts/test-tray-designs.mjs
//
// Tanpa pelayar: fetch dan localStorage dipalsukan, dan apa yang dihantar
// disemak terhadap firestore.rules (kunci yang dibenarkan, had saiz).
//   * bentuk data      - params rata <= 40 kunci, pokok petak dalam extra.
//   * pergi-balik      - keadaan bukan lalai (mod cetak, pokok bersarang, katil
//                        sendiri, bahan, filamen, helaian) melalui format
//                        Firestore kembali tepat, dan dulang yang sama dibina.
//   * rekod rosak      - jenis salah, NaN, kunci asing, extra bukan JSON: jatuh
//                        ke lalai, tidak campak, dulang masih dibina.
//   * simpan senyap    - tiada sesi -> tiada panggilan; dua serentak -> satu
//                        POST kemudian PATCH; ditolak -> false tanpa campak.
//   * senarai alat     - setiap salinan designs.js kenal setiap alat yang ada
//                        galeri, termasuk tray, supaya pautan antara alat jalan.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const DOCS = path.join(here, '..', 'docs');
const imp = (rel) => import(pathToFileURL(path.join(DOCS, rel)).href);

const S = await imp('tray/src/saved.js');
const C = await imp('tray/src/cloud.js');
const G = await imp('tray/src/designs.js');
const THREE = await imp('tray/vendor/three.module.js');
const { buildTray } = await imp('tray/src/geom/tray.js');
const { buildTray3D } = await imp('tray/src/geom/tray3d.js');

let passed = 0;
let failed = 0;
const fails = [];
function check(name, cond, detail = '') {
  if (cond) { passed++; return; }
  failed++;
  if (fails.length < 60) fails.push(`${name}${detail ? ` - ${detail}` : ''}`);
}
const build = (st) => (st.params.mode === 'cetak' ? buildTray3D(st.params, THREE) : buildTray(st.params));
const trip = (row) => C.fromFields(C.toFields(row));
const recordOf = (st, name) => trip({
  name: name ?? S.autoName(st), tool: 'tray', params: S.designParams(st),
  material: S.designMaterial(st), extra: JSON.stringify(S.designExtra(st)),
});

// ---- bentuk data ---------------------------------------------------------------
{
  const st = S.defaultState();
  const dp = S.designParams(st);
  check('lalai: params <= 40 kunci', Object.keys(dp).length <= 40, `${Object.keys(dp).length}`);
  check('lalai: tiada pokok dalam params', !('layout' in dp));
  const encodable = (v) => v === null || ['string', 'boolean'].includes(typeof v)
    || (typeof v === 'number' && Number.isFinite(v)) || (Array.isArray(v) && v.every(encodable));
  check('lalai: setiap nilai boleh dikodkan', Object.values(dp).every(encodable), JSON.stringify(dp));
  check('lalai: nama automatik', S.autoName(st) === 'Dulang 220 x 160 x 45 mm (laser)');
  check('lalai: bahan', S.designMaterial(st) === 'Falcata 3mm');
  check('lalai: dulang dibina', build(S.readDesign(recordOf(st)).state).panels.length > 0);
}

// ---- pergi-balik --------------------------------------------------------------
{
  const st = S.defaultState();
  Object.assign(st.params, {
    mode: 'cetak', length: 240.5, width: 180, height: 52, wallT: 2, floorT: 1.8, fillet: 3, stack: true,
    stackClear: 0.35, dividerHeight: 70, printer: 'custom', bedX: 300, bedY: 320, bedZ: 340,
    cols: [2, 1, 1.5], rows: [1, 3],
    layout: { s: 'x', f: [1, 2], k: [{}, { s: 'y', f: [1, 1, 2], k: [{}, { s: 'x', f: [1, 1], k: [{}, {}] }, {}] }] },
  });
  st.material = 'walnut';
  st.filament = 'pla-kayu';
  st.sheet = '900x600';
  st.showLabels = false;
  const row = recordOf(st);
  const back = S.readDesign(row).state;
  check('pergi-balik: params sama', JSON.stringify(S.designParams(back)) === JSON.stringify(S.designParams(st)),
    JSON.stringify(S.designParams(back)));
  check('pergi-balik: extra sama (pokok, bahan, filamen, helaian, label)',
    JSON.stringify(S.designExtra(back)) === JSON.stringify(S.designExtra(st)), JSON.stringify(S.designExtra(back)));
  check('pergi-balik: nama automatik kekal automatik', S.readDesign(row).name === '' && back.name === S.UNTITLED);
  check('pergi-balik: nama sendiri dikekalkan', S.readDesign({ ...row, name: 'Dulang sudu Mak Cik' }).name === 'Dulang sudu Mak Cik');
  check('pergi-balik: bahan cetak = filamen', S.designMaterial(st) === 'PLA Kayu');
  const a = build(st), b = build(back);
  check('pergi-balik: dulang yang sama dibina', a.derived.cellCount === b.derived.cellCount && a.derived.cellCount === 5
    && Math.abs(a.derived.volumeMm3 - b.derived.volumeMm3) < 1e-6, `${a.derived.cellCount} / ${b.derived.cellCount}`);
  // Nombor bulat menjadi integerValue rentetan dalam Firestore dan kembali sebagai nombor.
  const f = C.toFields({ params: S.designParams(st) }).params.mapValue.fields;
  check('pergi-balik: width sebagai integerValue, length sebagai doubleValue', f.width.integerValue === '180'
    && f.length.doubleValue === 240.5 && Array.isArray(f.cols.arrayValue.values));
  check('pergi-balik: floorOffset null kekal null', back.params.floorOffset === null);
}

// ---- rekod rosak ------------------------------------------------------------------
{
  const junk = S.readDesign({
    name: 42,
    params: { length: '300', width: NaN, height: null, mode: 'hack', cols: 'x', rows: [0, -1], printer: 'mesin-palsu',
      stack: 'ya', evil: 1, bedX: -5, floorOffset: 'a' },
    extra: '{oops',
  });
  const d = S.defaultState();
  check('rosak: tidak campak, nilai rosak -> lalai', junk.state.params.length === d.params.length
    && junk.state.params.width === d.params.width && junk.state.params.mode === 'laser'
    && JSON.stringify(junk.state.params.cols) === JSON.stringify(d.params.cols)
    && JSON.stringify(junk.state.params.rows) === JSON.stringify(d.params.rows)
    && junk.state.params.printer === d.params.printer && junk.state.params.stack === false
    && junk.state.params.bedX === null && junk.state.params.floorOffset === null && !('evil' in junk.state.params),
  JSON.stringify(junk.state.params));
  check('rosak: nama bukan teks -> automatik', junk.name === '' && junk.state.name === S.UNTITLED);
  check('rosak: dulang masih dibina', build(junk.state).panels.length > 0);
  const bad = S.readDesign({ params: { mode: 'cetak' }, extra: JSON.stringify({ layout: { s: 'z', k: 5 }, material: 'emas', filament: 1, sheet: 'A0' }) });
  check('rosak: pokok, bahan, filamen, helaian asing diabaikan', bad.state.params.layout === null
    && bad.state.material === 'falcata3' && bad.state.filament === 'pla-putih' && bad.state.sheet === '600x400');
  check('rosak: mod cetak tanpa pokok dibina daripada grid', build(bad.state).derived.cellCount === 6);
  check('rosak: tiada rekod langsung', S.readDesign(null).state.params.length === 220 && S.readDesign(undefined).name === '');
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
  const gstore = {
    name: () => (st.name !== S.UNTITLED ? st.name : S.autoName(st)),
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

  const [r1, r2] = await Promise.all([G.saveQuietly(gstore), G.saveQuietly(gstore)]);
  check('simpan: dua serentak -> satu POST kemudian PATCH id yang sama', r1 && r2 && calls.length === 2
    && calls[0].method === 'POST' && calls[1].method === 'PATCH' && calls[1].url.includes('/users/u1/designs/abc'),
  calls.map((c) => `${c.method} ${c.url}`).join(' ; '));
  const f = calls[0].body.fields;
  const allowed = ['name', 'tool', 'params', 'material', 'updatedAt', 'extra'];
  check('simpan: ke akaun sendiri, dengan token', calls[0].url.includes('/documents/users/u1/designs')
    && calls[0].headers.Authorization === 'Bearer tok');
  check('simpan: kunci rekod ikut firestore.rules', Object.keys(f).every((k) => allowed.includes(k)));
  check('simpan: tool tray, nama automatik', f.tool.stringValue === 'tray'
    && f.name.stringValue === 'Dulang 220 x 160 x 45 mm (laser)' && f.name.stringValue.length <= 120);
  check('simpan: params map <= 40 kunci', Object.keys(f.params.mapValue.fields).length <= 40);
  check('simpan: extra teks <= 700000', typeof f.extra.stringValue === 'string' && f.extra.stringValue.length <= 700000
    && JSON.parse(f.extra.stringValue).material === 'falcata3');

  st.params.length = 260;
  await G.saveQuietly(gstore);
  check('simpan: kali kedua -> PATCH entri yang sama', calls.length === 3 && calls[2].method === 'PATCH'
    && calls[2].body.fields.params.mapValue.fields.length.integerValue === '260');

  reply = () => ({ status: 403, body: '' });
  let threw = false, res403;
  try { res403 = await G.saveQuietly(gstore); } catch { threw = true; }
  check('simpan: ditolak -> false, tidak campak', !threw && res403 === false);
  reply = () => ({ status: 500, body: 'boom' });
  check('simpan: ralat pelayan -> false', (await G.saveQuietly(gstore)) === false);
  reply = (req) => ({ status: 200, body: JSON.stringify({ name: `x/designs/${req.url.split('/').pop()}` }) });
  check('simpan: barisan pulih selepas gagal', (await G.saveQuietly(gstore)) === true);

  // Galeri: rekod dibuka ikut id, dan rekod alat lain tidak dibuka di sini.
  const doc = (id, tool) => ({ name: `x/designs/${id}`, fields: C.toFields({ name: 'D', tool, params: S.designParams(st), updatedAt: '2026-10-24T00:00:00Z' }) });
  reply = () => ({ status: 200, body: JSON.stringify({ documents: [doc('t1', 'tray'), doc('p1', 'plakbox')] }) });
  let applied = null;
  const opener = { ...gstore, apply: (row) => { applied = row; } };
  check('galeri: buka ikut id', (await G.openById(opener, 't1')) === true && applied && applied.id === 't1');
  applied = null;
  check('galeri: rekod alat lain tidak dibuka', (await G.openById(opener, 'p1')) === false && applied === null);
  delete globalThis.fetch;
  delete globalThis.localStorage;
}

// ---- senarai alat dalam setiap galeri ------------------------------------------------
{
  const withGallery = fs.readdirSync(DOCS).filter((t) => fs.existsSync(path.join(DOCS, t, 'src', 'designs.js')));
  check('senarai alat: tray ada galeri', withGallery.includes('tray'));
  for (const t of withGallery) {
    const D = await imp(`${t}/src/designs.js`);
    check(`senarai alat: ${t} - TOOL betul`, D.TOOL === t, D.TOOL);
    const missing = withGallery.filter((x) => !D.TOOLS[x] || D.TOOLS[x].path !== `/${x}/`);
    check(`senarai alat: ${t} kenal setiap alat bergaleri`, missing.length === 0, missing.join(', '));
  }
}

console.log(`${passed} lulus, ${failed} gagal`);
if (failed) {
  for (const f of fails) console.log(`  GAGAL ${f}`);
  process.exit(1);
}
