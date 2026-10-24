// Ujian reka bentuk tersimpan QR Generator (Simpan / Reka bentuk saya).
//
//     node scripts/test-qr-designs.mjs
//
// Tanpa pelayar: fetch dan localStorage dipalsukan, dan apa yang dihantar
// disemak terhadap firestore.rules (kunci yang dibenarkan, had saiz).
//   * bentuk data      - params rata <= 40 kunci, setiap nilai boleh dikodkan,
//                        tiada extra; lalai sama dengan keadaan awal store.js.
//   * pergi-balik      - keadaan bukan lalai (teks Melayu + emoji, aras,
//                        versi, boost, saiz, bingkai keychain, lubang, papan,
//                        kerf, laju imbasan) melalui format Firestore kembali
//                        tepat, dan kod QR yang sama dibina.
//   * rekod rosak      - jenis salah, NaN, kunci asing, extra bukan JSON, tiada
//                        params: jatuh ke lalai, tidak campak, QR masih dibina.
//   * simpan senyap    - tiada sesi -> tiada panggilan; dua serentak -> satu
//                        POST kemudian PATCH; ditolak -> false tanpa campak.
//   * senarai alat     - designs.js kenal tray, dan TOOL = 'qr'.

import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const DOCS = path.join(here, '..', 'docs');
const imp = (rel) => import(pathToFileURL(path.join(DOCS, rel)).href);

const S = await imp('qr/src/saved.js');
const C = await imp('qr/src/cloud.js');
const G = await imp('qr/src/designs.js');
const { buildTag, DEFAULTS } = await imp('qr/src/geom/tag.js');
const { capacityBytes, MAX_VERSION } = await imp('qr/src/geom/qr.js');
const store = await imp('qr/src/store.js');

let passed = 0;
let failed = 0;
const fails = [];
function check(name, cond, detail = '') {
  if (cond) { passed++; return; }
  failed++;
  if (fails.length < 60) fails.push(`${name}${detail ? ` - ${detail}` : ''}`);
}
const trip = (row) => C.fromFields(C.toFields(row));
const recordOf = (st, name) => trip({
  name: name ?? S.autoName(st), tool: 'qr', params: S.designParams(st),
  material: S.designMaterial(st), extra: S.designExtra(st) ? JSON.stringify(S.designExtra(st)) : undefined,
});
// Grid QR siap sebagai satu rentetan: sama = kod yang sama, modul demi modul.
const gridOf = (st) => {
  const r = buildTag(st.params);
  return r.qr ? r.qr.grid.map((row) => row.map((c) => (c ? 1 : 0)).join('')).join('/') : '';
};

// ---- bentuk data ---------------------------------------------------------------
{
  const st = S.defaultState();
  const dp = S.designParams(st);
  check('lalai: params <= 40 kunci', Object.keys(dp).length <= 40, `${Object.keys(dp).length}`);
  check('lalai: params = DEFAULTS + laju imbasan + jarak garisan',
    JSON.stringify(Object.keys(dp)) === JSON.stringify([...Object.keys(DEFAULTS), 'scanSpeed', 'lineInterval']),
    Object.keys(dp).join(','));
  const encodable = (v) => ['string', 'boolean'].includes(typeof v) || (typeof v === 'number' && Number.isFinite(v));
  check('lalai: setiap nilai boleh dikodkan', Object.values(dp).every(encodable), JSON.stringify(dp));
  check('lalai: tiada extra', S.designExtra(st) === null);
  check('lalai: sama dengan keadaan awal store.js', JSON.stringify(st.params) === JSON.stringify(store.state.params)
    && st.scanSpeed === store.state.scanSpeed && st.lineInterval === store.state.lineInterval
    && st.name === store.state.name);
  check('lalai: nama automatik', S.autoName(st) === 'QR 35 mm plak - sifulaser.com', S.autoName(st));
  check('lalai: bahan', S.designMaterial(st) === 'Papan 3mm', S.designMaterial(st));
  check('lalai: bahan ukiran sahaja kosong', S.designMaterial({ params: { ...DEFAULTS, frame: 'none' } }) === '');
  check('lalai: nama tanpa teks', S.autoName({ params: { ...DEFAULTS, text: '' } }) === 'QR 35 mm plak');
  const long = S.autoName({ params: { ...DEFAULTS, size: 300, frame: 'none', text: `https://${'x'.repeat(500)}` } });
  check('lalai: nama automatik <= 120 aksara', long.length <= 120 && long.endsWith('...'), long);
  check('lalai: QR dibina', !buildTag(S.readDesign(recordOf(st)).state.params).derived.empty);
  check('lalai: TEXT_MAX melebihi kod QR terbesar', S.TEXT_MAX > capacityBytes(MAX_VERSION, 'L'));
}

// ---- pergi-balik --------------------------------------------------------------
{
  const st = S.defaultState();
  Object.assign(st.params, {
    text: 'WIFI:S:Rumah Mak Cik Siti;T:WPA;P:kuih-kéria 🍩;;\nSelamat datang ke kedai kami 🎉',
    ecl: 'Q', version: 9, boost: false, size: 62.5, frame: 'keychain',
    margin: 5.5, corner: 2, holeDia: 5, holeEdge: 2.5, thickness: 4.2, kerf: 0.15,
  });
  st.scanSpeed = 450;
  st.lineInterval = 0.08;
  const row = recordOf(st);
  const back = S.readDesign(row).state;
  check('pergi-balik: params sama', JSON.stringify(S.designParams(back)) === JSON.stringify(S.designParams(st)),
    JSON.stringify(S.designParams(back)));
  check('pergi-balik: extra sama', JSON.stringify(S.designExtra(back)) === JSON.stringify(S.designExtra(st)));
  check('pergi-balik: teks Melayu + emoji tepat', back.params.text === st.params.text);
  check('pergi-balik: laju imbasan dan jarak garisan', back.scanSpeed === 450 && back.lineInterval === 0.08);
  check('pergi-balik: nama automatik kekal automatik', S.readDesign(row).name === '' && back.name === S.UNTITLED);
  check('pergi-balik: nama sendiri dikekalkan', S.readDesign({ ...row, name: 'Tag WiFi kedai' }).name === 'Tag WiFi kedai'
    && S.readDesign({ ...row, name: 'Tag WiFi kedai' }).state.name === 'Tag WiFi kedai');
  check('pergi-balik: "QR tanpa nama" = tiada nama', S.readDesign({ ...row, name: 'QR tanpa nama' }).name === ''
    && S.ownName({ name: 'Untitled QR' }) === '' && S.ownName({ name: ' Tag ' }) === 'Tag');
  check('pergi-balik: bahan', S.designMaterial(st) === 'Papan 4.2mm' && row.material === 'Papan 4.2mm');
  const a = buildTag(st.params);
  const b = buildTag(back.params);
  check('pergi-balik: QR yang sama dibina', !a.derived.empty && gridOf(st) === gridOf(back)
    && a.derived.version === 9 && a.derived.ecl === 'Q' && a.derived.partW === b.derived.partW
    && a.derived.partH === b.derived.partH && a.panels[0].holes.length === 1,
  `${a.derived.version}${a.derived.ecl} ${b.derived.version}${b.derived.ecl}`);
  // Nombor bulat menjadi integerValue rentetan dalam Firestore dan kembali sebagai nombor.
  const f = C.toFields({ params: S.designParams(st) }).params.mapValue.fields;
  check('pergi-balik: version integerValue, size doubleValue, boost boolean', f.version.integerValue === '9'
    && f.size.doubleValue === 62.5 && f.boost.booleanValue === false && typeof f.text.stringValue === 'string');
  check('pergi-balik: version kembali sebagai nombor', back.params.version === 9 && typeof back.params.size === 'number');
  // Setiap bingkai dan aras.
  for (const frame of ['none', 'plaque', 'keychain']) {
    for (const ecl of ['L', 'M', 'Q', 'H']) {
      const s2 = S.defaultState();
      Object.assign(s2.params, { frame, ecl });
      const r2 = S.readDesign(recordOf(s2)).state;
      check(`pergi-balik: ${frame} ${ecl}`, JSON.stringify(S.designParams(r2)) === JSON.stringify(S.designParams(s2)));
    }
  }
  // Teks terlalu panjang dipotong pada TEXT_MAX tanpa memotong emoji di tengah, dan kekal terlalu panjang.
  const huge = S.designParams({ params: { ...DEFAULTS, text: `${'a'.repeat(S.TEXT_MAX - 1)}😀😀` } });
  check('pergi-balik: teks terlalu panjang dipotong dengan selamat', huge.text.length === S.TEXT_MAX - 1
    && buildTag(huge).derived.reason === 'too-long');
}

// ---- rekod rosak ------------------------------------------------------------------
{
  const d = S.defaultState();
  let junk;
  let threw = false;
  try {
    junk = S.readDesign({
      name: 42,
      params: { text: 77, ecl: 'X', version: 'tujuh', boost: 'ya', size: NaN, frame: 'bulat', margin: null,
        corner: '3', holeDia: Infinity, holeEdge: -Infinity, thickness: {}, kerf: [], scanSpeed: 'laju',
        lineInterval: NaN, evil: 1, __proto__x: 2 },
      extra: '{oops',
    });
  } catch { threw = true; }
  check('rosak: tidak campak', !threw);
  check('rosak: nilai rosak -> lalai', !threw && JSON.stringify(junk.state.params) === JSON.stringify(d.params)
    && junk.state.scanSpeed === d.scanSpeed && junk.state.lineInterval === d.lineInterval,
  JSON.stringify(junk && junk.state));
  check('rosak: kunci asing diabaikan', !threw && !('evil' in junk.state.params) && !('evil' in S.designParams(junk.state)));
  check('rosak: nama bukan teks -> automatik', !threw && junk.name === '' && junk.state.name === S.UNTITLED);
  check('rosak: QR masih dibina', !threw && !buildTag(junk.state.params).derived.empty);
  const out = S.readDesign({ params: { size: 5000, margin: -4, version: 99.4, kerf: 7, scanSpeed: 1, lineInterval: 9 } }).state;
  check('rosak: luar julat dikepit seperti medan alat', out.params.size === 300 && out.params.margin === 0
    && out.params.version === MAX_VERSION && out.params.kerf === 1 && out.scanSpeed === 20 && out.lineInterval === 0.5,
  JSON.stringify(out));
  check('rosak: rekod dikepit masih dibina', !buildTag(out.params).derived.empty);
  for (const row of [null, undefined, {}, { params: null }, { params: 'x' }, { params: [1, 2] }, { name: 'A', extra: 5 }]) {
    let ok = true;
    let st;
    try { st = S.readDesign(row).state; } catch { ok = false; }
    check(`rosak: ${JSON.stringify(row)} -> lalai`, ok && JSON.stringify(S.designParams(st)) === JSON.stringify(S.designParams(d)));
  }
  let ok = true;
  try { S.designParams(undefined); S.designMaterial(undefined); S.autoName(undefined); } catch { ok = false; }
  check('rosak: keadaan kosong tidak campak', ok);
}

// ---- simpan senyap: fetch palsu -------------------------------------------------------
{
  const st = S.defaultState();
  Object.assign(st.params, { text: 'https://wa.me/60134354118', size: 50, frame: 'keychain' });
  const ls = new Map();
  globalThis.localStorage = {
    getItem: (k) => (ls.has(k) ? ls.get(k) : null), setItem: (k, v) => ls.set(k, String(v)), removeItem: (k) => ls.delete(k),
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
  // Sama seperti galleryStore dalam docs/qr/src/main.js.
  const gstore = {
    name: () => S.ownName(st) || S.autoName(st),
    params: () => S.designParams(st),
    material: () => S.designMaterial(st),
    extra: () => S.designExtra(st),
    rename: () => {},
    apply: () => {},
  };

  check('simpan: tanpa daftar masuk -> tiada panggilan', (await G.saveQuietly(gstore)) === false && calls.length === 0);
  ls.set('sifulaser.session', JSON.stringify({ uid: 'u1', token: 'tok', email: 'a@b.c', exp: Date.now() - 1000 }));
  check('simpan: sesi tamat -> tiada panggilan', (await G.saveQuietly(gstore)) === false && calls.length === 0);
  ls.set('sifulaser.session', JSON.stringify({ uid: 'u1', token: 'tok', email: 'a@b.c', exp: Date.now() + 3.6e6 }));

  const [r1, r2] = await Promise.all([G.saveQuietly(gstore), G.saveQuietly(gstore)]);
  check('simpan: dua serentak -> satu POST kemudian PATCH id yang sama', r1 && r2 && calls.length === 2
    && calls[0].method === 'POST' && calls[1].method === 'PATCH' && calls[1].url.includes('/users/u1/designs/abc'),
  calls.map((c) => `${c.method} ${c.url}`).join(' ; '));
  const f = calls[0].body.fields;
  const allowed = ['name', 'tool', 'params', 'material', 'updatedAt', 'extra'];
  check('simpan: ke akaun sendiri, dengan token', calls[0].url.includes('/documents/users/u1/designs')
    && calls[0].headers.Authorization === 'Bearer tok');
  check('simpan: kunci rekod ikut firestore.rules', Object.keys(f).every((k) => allowed.includes(k)), Object.keys(f).join(','));
  check('simpan: tool qr <= 40, nama automatik <= 120', f.tool.stringValue === 'qr' && f.tool.stringValue.length <= 40
    && f.name.stringValue === 'QR 50 mm keychain - wa.me/60134354118' && f.name.stringValue.length <= 120,
  f.name.stringValue);
  check('simpan: params map <= 40 kunci', !!f.params.mapValue && Object.keys(f.params.mapValue.fields).length <= 40);
  check('simpan: tiada extra', !('extra' in f));
  check('simpan: bahan', f.material.stringValue === 'Papan 3mm');
  check('simpan: rekod yang dihantar dibuka semula sama', JSON.stringify(S.designParams(S.readDesign(C.fromFields(f)).state))
    === JSON.stringify(S.designParams(st)));

  st.params.size = 80;
  await G.saveQuietly(gstore);
  check('simpan: kali kedua -> PATCH entri yang sama', calls.length === 3 && calls[2].method === 'PATCH'
    && calls[2].body.fields.params.mapValue.fields.size.integerValue === '80'
    && calls[2].body.fields.name.stringValue === 'QR 80 mm keychain - wa.me/60134354118');

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
  reply = () => ({ status: 200, body: JSON.stringify({ documents: [doc('q1', 'qr'), doc('t1', 'tray')] }) });
  let applied = null;
  const opener = { ...gstore, apply: (row) => { applied = row; } };
  check('galeri: buka ikut id', (await G.openById(opener, 'q1')) === true && applied && applied.id === 'q1'
    && S.readDesign(applied).state.params.size === 80);
  applied = null;
  check('galeri: rekod alat lain tidak dibuka', (await G.openById(opener, 't1')) === false && applied === null);
  delete globalThis.fetch;
  delete globalThis.localStorage;
}

// ---- senarai alat ---------------------------------------------------------------------
{
  check('senarai alat: TOOL = qr', G.TOOL === 'qr', G.TOOL);
  check('senarai alat: kenal tray', !!G.TOOLS.tray && G.TOOLS.tray.path === '/tray/');
  check('senarai alat: kenal qr', !!G.TOOLS.qr && G.TOOLS.qr.path === '/qr/');
}

console.log(`${passed} lulus, ${failed} gagal`);
if (failed) {
  for (const f of fails) console.log(`  GAGAL ${f}`);
  process.exit(1);
}
