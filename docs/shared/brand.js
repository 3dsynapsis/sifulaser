// Pasang "by sifulaser.com" pada setiap fail yang alat muat turun.
//
// Setiap alat memuat turun dengan cara yang sama: Blob -> URL.createObjectURL
// -> <a download> -> click(). Jadi satu tempat ini menangkap semuanya tanpa
// sebaris pun berubah dalam alat - termasuk alat yang di-vendor (Box Maker,
// Rehal, Topper...), yang perubahannya akan hilang bila disalin semula dari
// projek asal. Ia dimuat oleh /shared/export-gate.js, yang setiap alat sudah
// muatkan; alat baharu mendapatnya dengan cara yang sama.
//
//   1. createObjectURL diingat: URL -> Blob, supaya Blob masih ada walaupun
//      alat membatalkan URL serta-merta selepas click().
//   2. click() pada <a download href="blob:..."> (atau klik sebenar pada
//      pautan begitu) ditahan; fail dibaca, dijenamakan (brand-core.js), dan
//      dimuat turun di bawah nama sifulaser-...
//   3. Apa-apa ralat: muat turun asal diteruskan seperti biasa. Jenama ialah
//      pemasaran, bukan sesuatu yang boleh menghalang pelanggan mendapat fail.

import { brandFile } from './brand-core.js';

const install = () => {
  if (window.__sifulaserBrand) return;
  window.__sifulaserBrand = true;

  const blobs = new Map();
  const create = URL.createObjectURL.bind(URL);
  const revoke = URL.revokeObjectURL.bind(URL);
  URL.createObjectURL = (obj) => {
    const url = create(obj);
    if (obj instanceof Blob) blobs.set(url, obj);
    return url;
  };
  URL.revokeObjectURL = (url) => {
    blobs.delete(url);
    return revoke(url);
  };

  const click = HTMLAnchorElement.prototype.click;
  const ours = new WeakSet();

  /** Muat turun yang perlu dijenamakan: pautan download kepada Blob kita kenal. */
  const target = (a) => {
    if (!a || ours.has(a) || !a.hasAttribute('download')) return null;
    const href = a.href || '';
    if (!href.startsWith('blob:')) return null;
    const blob = blobs.get(href);
    return blob ? { blob, name: a.download || a.getAttribute('download') || 'fail' } : null;
  };

  const save = (data, name, type) => {
    const a = document.createElement('a');
    ours.add(a);
    a.href = create(new Blob([data], { type }));
    a.download = name;
    a.style.display = 'none';
    document.body.append(a);
    click.call(a);
    setTimeout(() => { revoke(a.href); a.remove(); }, 4000);
  };

  const run = (a, t) => {
    t.blob.arrayBuffer()
      .then((buf) => {
        const out = brandFile(t.name, t.blob.type, new Uint8Array(buf));
        save(out.data, out.name, t.blob.type || 'application/octet-stream');
      })
      .catch(() => {
        // Gagal menjenamakan: fail asal, tanpa diubah.
        ours.add(a);
        click.call(a);
      });
  };

  HTMLAnchorElement.prototype.click = function brandedClick() {
    const t = target(this);
    if (!t) return click.call(this);
    run(this, t);
    return undefined;
  };

  // Klik sebenar (atau dispatchEvent) pada pautan download dalam halaman.
  document.addEventListener('click', (e) => {
    const a = e.target && typeof e.target.closest === 'function' ? e.target.closest('a[download]') : null;
    const t = target(a);
    if (!t) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    run(a, t);
  }, true);
};

try { install(); } catch { /* tanpa jenama, muat turun kekal seperti biasa */ }
