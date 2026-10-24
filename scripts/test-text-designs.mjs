// Ujian Text Engraver: reka bentuk tersimpan ("Simpan" + "Reka bentuk saya").
// Tiada kebergantungan.
//
//     node scripts/test-text-designs.mjs
//
// Mengimport terus daripada docs/text/src - kod yang sifulaser.com hidangkan.
//
// Apa yang disemak dan kenapa:
//   * keadaan lalai      - sama dengan keadaan awal store.js (dua salinan yang
//                          tidak boleh berselisih); params <= 40 kunci dan
//                          setiap nilai boleh dikodkan Firestore.
//   * pergi-balik        - keadaan BUKAN lalai (teks berbilang baris dengan
//                          aksara Melayu dan emoji, setiap tetapan diubah)
//                          melalui toFields/fromFields: params sama tepat,
//                          extra kekal tiada, nombor bulat kembali sebagai nombor.
//   * nama               - nama automatik kekal automatik, nama sendiri kekal,
//                          <= 120 aksara walaupun teks panjang penuh emoji.
//   * rekod rosak        - jenis salah, NaN, kunci asing, extra bukan JSON, tiada
//                          params: keadaan lalai yang sah, tidak campak, dan
//                          susun atur teks masih dibina.
//   * simpan senyap      - fetch dan localStorage palsu: tiada sesi = tiada
//                          panggilan; dua serentak = POST kemudian PATCH id sama;
//                          kunci rekod ikut firestore.rules; tool = 'text';
//                          ditolak 403/500 = false tanpa campak.
//   * TOOLS              - galeri kenal 'tray', dan TOOL alat ini 'text'.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(here, '..', 'docs', 'text', 'src');
const load = (rel) => import(pathToFileURL(path.join(SRC, rel)).href);

const S = await load('saved.js');
const C = await load('cloud.js');
const G = await load('designs.js');
const T = await load('geom/text.js');
const store = await load('store.js');

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

// Fon sebenar dari src/font, dimasukkan terus ke cache (fetch Node tidak membaca file://).
const FACES = JSON.parse(fs.readFileSync(path.join(SRC, 'font', 'index.json'), 'utf8'));
const FACE_IDS = FACES.map((f) => f.id);
for (const id of FACE_IDS) {
  T.putFace(JSON.parse(fs.readFileSync(path.join(SRC, 'font', `${id}.json`), 'utf8')));
}
/** Bina susun atur sebenar daripada keadaan reka bentuk, seperti getResult() dalam store.js. */
const build = (st) => {
  const r = T.layout({ ...st.params, faceData: T.faceLoaded(st.params.face) });
  const paths = T.normalise(r, st.params.margin);
  return { r, paths, length: T.strokeLength(paths) };
};
const finiteDeep = (v) => {
  if (typeof v === 'number') return Number.isFinite(v);
  if (Array.isArray(v)) return v.every(finiteDeep);
  if (v && typeof v === 'object') return Object.values(v).every(finiteDeep);
  return true;
};

// ---- keadaan lalai ------------------------------------------------------------------
{
  const d = S.defaultState();
  check('lalai: sama dengan keadaan awal store.js', same(d.params, store.state.params) && d.speed === store.state.speed,
    `${JSON.stringify(d)} vs ${JSON.stringify({ params: store.state.params, speed: store.state.speed })}`);
  const p = S.designParams(d);
  check('lalai: params <= 40 kunci', Object.keys(p).length > 0 && Object.keys(p).length <= 40, String(Object.keys(p).length));
  check('lalai: setiap nilai boleh dikodkan', Object.values(p).every((v) => typeof v === 'string' || typeof v === 'boolean'
    || (typeof v === 'number' && Number.isFinite(v))), JSON.stringify(p));
  check('lalai: kunci = tetapan susun atur + laju', same(Object.keys(p).sort(),
    [...Object.keys(T.DEFAULTS), 'margin', 'smooth', 'speed'].sort()), Object.keys(p).join(','));
  check('lalai: pergi-balik', same(S.designParams(S.readDesign(trip({ name: S.autoName(d), params: p })).state), p));
  check('lalai: tiada extra, tiada bahan', S.designExtra(d) === null && S.designMaterial(d) === '');
  check('lalai: nama automatik', S.autoName(d) === 'Teks "SifuLaser", 20 mm', S.autoName(d));
  check('lalai: membina', build(d).paths.length > 0);
}

// ---- pergi-balik dengan keadaan bukan lalai -------------------------------------------
const custom = {
  params: {
    text: 'Selamat Hari Raya\n  Maaf zahir & batin 🌙 \nKeluarga Pak Mat — “2026”',
    face: 'zahid-cursive',
    capHeight: 12.5,
    letterSpacing: -1.25,
    wordSpacing: 3,
    lineSpacing: 1.85,
    align: 'center',
    slant: -12,
    width: 85,
    margin: 0,
    smooth: false,
  },
  speed: 350,
};
{
  const row = trip({
    name: S.autoName(custom), tool: 'text', params: S.designParams(custom),
    material: S.designMaterial(custom), updatedAt: '2026-10-24T08:00:00.000Z',
  });
  const back = S.readDesign(row, FACE_IDS);
  check('pergi-balik: params sama tepat', same(S.designParams(back.state), S.designParams(custom)),
    JSON.stringify(S.designParams(back.state)));
  check('pergi-balik: keadaan = asal', same(back.state, custom), JSON.stringify(back.state));
  check('pergi-balik: extra sama (tiada)', S.designExtra(back.state) === S.designExtra(custom));
  check('pergi-balik: teks Melayu + emoji utuh', back.state.params.text === custom.params.text);
  check('pergi-balik: nombor bulat kembali sebagai nombor', typeof row.params.wordSpacing === 'number'
    && back.state.params.wordSpacing === 3 && back.state.speed === 350 && back.state.params.margin === 0);
  check('pergi-balik: nombor bulat dihantar sebagai integerValue', C.toFields({ p: S.designParams(custom) }).p.mapValue
    .fields.speed.integerValue === '350');
  check('pergi-balik: nama automatik kekal automatik', back.name === '', back.name);
  check('pergi-balik: nama automatik (baris dicantum, dipotong)',
    S.autoName(custom) === 'Teks "Selamat Hari Raya / Maaf zahir & batin 🌙 / Keluarga Pak Ma…", 12.5 mm', S.autoName(custom));
  check('pergi-balik: nama sendiri dikekalkan', S.readDesign({ ...row, name: 'Plak Pintu Rumah' }, FACE_IDS).name === 'Plak Pintu Rumah');
  const a = build(custom);
  const b = build(back.state);
  check('pergi-balik: geometri sama', same(a.paths, b.paths) && a.length > 0);

  // Setiap tetapan diubah satu demi satu, dan setiap satu kembali.
  const alt = {
    text: 'Ali', face: 'sham', capHeight: 300, letterSpacing: 30, wordSpacing: -5, lineSpacing: 4,
    align: 'right', slant: 30, width: 200, margin: 50, smooth: false,
  };
  for (const [k, v] of Object.entries(alt)) {
    const st = { params: { ...S.defaultState().params, [k]: v }, speed: 10 };
    const r = S.readDesign(trip({ name: 'x', params: S.designParams(st) }), FACE_IDS).state;
    check(`pergi-balik: ${k} = ${JSON.stringify(v)}`, r.params[k] === v && r.speed === 10, JSON.stringify(r.params[k]));
  }
}

// ---- nama -------------------------------------------------------------------------
{
  const long = { params: { ...S.defaultState().params, text: '😀'.repeat(200) }, speed: 200 };
  const n = S.autoName(long);
  check('nama: teks panjang emoji <= 120 aksara, tiada separuh emoji', n.length <= 120 && !/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/.test(n)
    && n.includes('…'), `${n.length} ${n}`);
  check('nama: teks kosong', S.autoName({ params: { ...S.defaultState().params, text: ' \n ' } }) === 'Teks tanpa nama');
  check('nama: rekod tanpa nama -> automatik', S.readDesign({ params: S.designParams(custom) }).name === '');
}

// ---- rekod rosak ------------------------------------------------------------------
{
  const d = S.defaultState();
  const bad = [
    null, undefined, {}, { params: null }, { params: [] }, { params: 'teks' },
    { name: 42, params: { text: 7, face: '../../etc/passwd', capHeight: NaN, letterSpacing: Infinity, wordSpacing: '3',
      lineSpacing: null, align: 'justify', slant: {}, width: [], margin: -9, smooth: 'ya', speed: -1, evil: 1, __proto__x: 2 },
    extra: '{oops' },
    { params: { capHeight: 1e9, width: 1, slant: -90, lineSpacing: 0 }, extra: 'bukan json' },
    { params: { face: 'tiada-fon-ini' }, extra: 12 },
  ];
  for (const row of bad) {
    let res;
    let threw = false;
    try { res = S.readDesign(row, FACE_IDS); } catch { threw = true; }
    const tag = JSON.stringify(row) ?? String(row);
    check(`rosak ${tag}: tidak campak`, !threw);
    if (threw) continue;
    const st = res.state;
    check(`rosak ${tag}: kunci lengkap, tiada asing`, same(Object.keys(st.params), Object.keys(d.params)) && !('evil' in st.params)
      && same(Object.keys(st), ['params', 'speed']));
    check(`rosak ${tag}: nilai sah`, finiteDeep(st) && typeof st.params.text === 'string' && FACE_IDS.includes(st.params.face)
      && ['left', 'center', 'right'].includes(st.params.align) && typeof st.params.smooth === 'boolean'
      && st.params.capHeight >= 2 && st.params.capHeight <= 300 && st.speed >= 10 && st.speed <= 1000
      && st.params.width >= 50 && st.params.margin >= 0, JSON.stringify(st));
    check(`rosak ${tag}: nama teks`, typeof res.name === 'string' && res.name.length <= 120);
    let built;
    try { built = build(st); } catch { built = null; }
    check(`rosak ${tag}: susun atur masih dibina`, !!built && finiteDeep(built.paths) && Number.isFinite(built.length));
  }
  const j = S.readDesign(bad[6], FACE_IDS).state;
  check('rosak: nilai jenis salah -> lalai', j.params.text === d.params.text && j.params.face === d.params.face
    && j.params.capHeight === d.params.capHeight && j.params.wordSpacing === d.params.wordSpacing
    && j.params.align === d.params.align && j.params.smooth === d.params.smooth, JSON.stringify(j));
  check('rosak: di luar julat -> dihadkan', j.params.margin === 0 && j.speed === 10
    && same(S.readDesign(bad[7]).state.params.capHeight, 300) && S.readDesign(bad[7]).state.params.width === 50
    && S.readDesign(bad[7]).state.params.slant === -30 && S.readDesign(bad[7]).state.params.lineSpacing === 0.8);
  check('rosak: fon tiada dalam senarai -> lalai', S.readDesign(bad[8], FACE_IDS).state.params.face === 'sans');
  check('rosak: tanpa senarai fon, id fon yang sah diterima', S.readDesign({ params: { face: 'fon-baru' } }).state.params.face === 'fon-baru'
    && S.readDesign({ params: { face: '../x' } }).state.params.face === 'sans');
  check('rosak: designParams membersihkan juga', same(S.designParams({ params: { capHeight: NaN, align: 1 }, speed: 'x' }),
    S.designParams(d)));
}

// ---- simpan senyap: fetch dan localStorage palsu --------------------------------------
{
  const mem = new Map();
  globalThis.localStorage = {
    getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k),
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
  const st = JSON.parse(JSON.stringify(custom));
  const gstore = {
    name: () => S.autoName(st),
    params: () => S.designParams(st),
    material: () => S.designMaterial(st),
    extra: () => S.designExtra(st),
    rename: () => {},
    apply: () => {},
  };

  check('simpan: tanpa daftar masuk -> tiada panggilan', (await G.saveQuietly(gstore)) === false && calls.length === 0);
  mem.set('sifulaser.session', JSON.stringify({ uid: 'u1', token: 'tok', email: 'a@b.c', exp: Date.now() - 1000 }));
  check('simpan: sesi tamat -> tiada panggilan', (await G.saveQuietly(gstore)) === false && calls.length === 0);
  mem.set('sifulaser.session', JSON.stringify({ uid: 'u1', token: 'tok', email: 'a@b.c', exp: Date.now() + 3.6e6 }));

  // Export dibuka dan SVG ditekan serta-merta: dua simpanan serentak.
  const [r1, r2] = await Promise.all([G.saveQuietly(gstore), G.saveQuietly(gstore)]);
  check('simpan: dua serentak -> satu POST kemudian PATCH id yang sama', r1 && r2 && calls.length === 2
    && calls[0].method === 'POST' && calls[1].method === 'PATCH' && calls[1].url.includes('/users/u1/designs/abc'),
  calls.map((c) => `${c.method} ${c.url}`).join(' ; '));
  const sent = calls[0];
  const f = sent.body.fields;
  check('simpan: ke akaun sendiri, dengan token', sent.url.includes('/documents/users/u1/designs')
    && sent.headers.Authorization === 'Bearer tok');
  const allowed = ['name', 'tool', 'params', 'material', 'updatedAt', 'extra'];
  check('simpan: kunci rekod ikut firestore.rules', Object.keys(f).every((k) => allowed.includes(k)), Object.keys(f).join(','));
  check('simpan: tool text, nama <= 120, tool <= 40', f.tool.stringValue === 'text' && f.tool.stringValue.length <= 40
    && f.name.stringValue === S.autoName(custom) && f.name.stringValue.length <= 120, f.name.stringValue);
  check('simpan: params map <= 40 kunci', !!f.params.mapValue
    && Object.keys(f.params.mapValue.fields).length === Object.keys(S.designParams(custom)).length
    && Object.keys(f.params.mapValue.fields).length <= 40);
  check('simpan: teks dalam params', f.params.mapValue.fields.text.stringValue === custom.params.text);
  check('simpan: bahan kosong, tiada extra', f.material.stringValue === '' && !('extra' in f));
  check('simpan: updatedAt ISO', typeof f.updatedAt.stringValue === 'string' && !Number.isNaN(Date.parse(f.updatedAt.stringValue)));
  // Yang pelayan simpan, dibaca kembali seperti list() membacanya.
  const stored = S.readDesign(C.fromFields(sent.body.fields), FACE_IDS);
  check('simpan: rekod dihantar dibaca kembali sama', same(stored.state, custom) && stored.name === '');

  // Simpanan seterusnya mengemas kini entri yang sama.
  st.params.capHeight = 30;
  await G.saveQuietly(gstore);
  check('simpan: export kali kedua -> PATCH, bukan entri baharu', calls.length === 3 && calls[2].method === 'PATCH'
    && calls[2].body.fields.params.mapValue.fields.capHeight.integerValue === '30'
    && calls[2].body.fields.name.stringValue.endsWith(', 30 mm'));

  // Pelayan menolak: senyap, false, tidak campak - fail tetap dimuat turun.
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
  // Selepas kegagalan, barisan tidak tersekat.
  reply = (req) => ({ status: 200, body: JSON.stringify({ name: `x/designs/${req.url.split('/').pop()}` }) });
  check('simpan: barisan pulih selepas gagal', (await G.saveQuietly(gstore)) === true);

  // Galeri: buka reka bentuk alat ini dengan id; reka bentuk alat lain ditolak.
  const docs = [
    { name: 'projects/sifulaser/databases/(default)/documents/users/u1/designs/t1',
      fields: C.toFields({ name: 'Plak Pintu', tool: 'text', params: S.designParams(custom), material: '', updatedAt: '2026-10-24T09:00:00Z' }) },
    { name: 'projects/sifulaser/databases/(default)/documents/users/u1/designs/p1',
      fields: C.toFields({ name: 'Puzzle', tool: 'puzzle', params: { w: 300 }, material: '', updatedAt: '2026-10-23T09:00:00Z' }) },
  ];
  reply = () => ({ status: 200, body: JSON.stringify({ documents: docs }) });
  let applied = null;
  const opener = { ...gstore, apply: (row) => { applied = S.readDesign(row, FACE_IDS); } };
  check('galeri: buka id reka bentuk text', (await G.openById(opener, 't1')) === true && applied
    && same(applied.state, custom) && applied.name === 'Plak Pintu' && G.current().id === 't1');
  applied = null;
  check('galeri: id alat lain tidak dibuka di sini', (await G.openById(opener, 'p1')) === false && applied === null);
  check('galeri: id tiada -> false', (await G.openById(opener, 'zzz')) === false);
  G.forget();
  check('galeri: forget() -> simpanan seterusnya entri baharu', G.current().id === null);

  delete globalThis.fetch;
  delete globalThis.localStorage;
}

// ---- TOOLS ------------------------------------------------------------------------
check('TOOLS: ada tray', !!G.TOOLS.tray && G.TOOLS.tray.path === '/tray/');
check('TOOLS: TOOL = text, laluan /text/', G.TOOL === 'text' && G.TOOLS.text && G.TOOLS.text.path === '/text/'
  && G.TOOLS.text.name === 'Text Engraver');

console.log(`${passed} lulus, ${failed} gagal`);
if (failed) {
  for (const f of fails) console.log('  GAGAL', f);
  process.exit(1);
}
