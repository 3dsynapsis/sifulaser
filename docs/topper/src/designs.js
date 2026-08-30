// The "my designs" panel.
//
// Takes its element helpers as arguments rather than importing them from ui.js,
// which imports this. A cycle between two modules that both define things with
// const would leave one of them reading the other mid-initialisation, and the
// failure looks like an unrelated crash on first paint. Passing them in costs a
// parameter and removes the whole class of problem.

import * as cloud from './cloud.js';

const HOME = 'https://sifulaser.com/';

// Held here rather than fetched on every render: the inspector redraws on every
// keystroke, and a list request per keystroke would be both slow and rude.
let designs = null;
let loading = false;
let failure = null;
/** The design being edited, if it came from the cloud or was saved there. */
let openId = null;
let openName = null;

/** Called when the account changes under us, so the next render refetches. */
export function forget() {
  designs = null;
  failure = null;
  openId = null;
  openName = null;
}

const when = (iso) => {
  const t = Date.parse(iso || '');
  if (!Number.isFinite(t)) return '';
  return new Date(t).toLocaleDateString('ms-MY', {
    day: 'numeric', month: 'short', year: 'numeric',
  });
};

function askSignIn() {
  const next = location.pathname + location.search;
  location.href = `${HOME}?signin=1&next=${encodeURIComponent(next)}`;
}

/**
 * The panel.
 *
 * `ctx` carries refresh(); `helpers` carries h() and group() from ui.js. `store`
 * carries the pieces of the store this needs, so this module does not reach
 * into it directly either.
 */
export function renderDesigns({ h, group }, ctx, store) {
  const s = cloud.session();

  // ---- signed out --------------------------------------------------------
  if (!s) {
    return group('Reka bentuk saya', true,
      h('p', { class: 'hint' },
        'Daftar masuk untuk menyimpan reka bentuk. Ia disimpan pada akaun anda, '
        + 'bukan pada pelayar ini - jadi ia ada di telefon, di komputer, dan '
        + 'tidak hilang bila anda kosongkan data pelayar.'),
      h('button', { class: 'ghost wide', type: 'button', onclick: askSignIn },
        'Daftar masuk dengan Google'));
  }

  // ---- signed in ---------------------------------------------------------
  if (designs === null && !loading && !failure) {
    loading = true;
    cloud.list()
      .then((rows) => { designs = rows; })
      .catch((err) => {
        failure = err instanceof cloud.NotSignedIn
          ? 'Sesi tamat. Daftar masuk semula.'
          : 'Tak dapat memuatkan reka bentuk. Cuba lagi.';
      })
      .then(() => { loading = false; ctx.refresh(); });
  }

  const busy = (fn) => async () => {
    failure = null;
    try {
      await fn();
      designs = await cloud.list();
    } catch (err) {
      failure = err instanceof cloud.NotSignedIn
        ? 'Sesi tamat. Daftar masuk semula.'
        : 'Tak berjaya. Cuba lagi.';
    }
    ctx.refresh();
  };

  const saveAs = (id) => busy(async () => {
    const name = store.name();
    openId = await cloud.save({
      id, name, params: store.params(), material: store.material(),
    });
    openName = name;
  });

  const open = (row) => busy(async () => {
    store.apply(row);
    openId = row.id;
    openName = row.name;
  });

  const rows = designs || [];
  const isOpen = (row) => row.id === openId;

  return group('Reka bentuk saya', true,
    h('div', { class: 'row-actions' },
      h('button', {
        class: 'primary wide', type: 'button', onclick: saveAs(openId),
      }, openId ? 'Simpan' : 'Simpan reka bentuk ini'),
      openId
        ? h('button', {
          class: 'ghost', type: 'button', onclick: saveAs(null),
        }, 'Simpan sebagai baharu')
        : null),

    openId
      ? h('p', { class: 'hint' }, `Sedang mengedit: ${openName || 'reka bentuk'}`)
      : null,

    // A failure has to be escapable. Without this the panel latches: one
    // request fails, the flag stays set, the guard above never retries, and
    // the only way back is reloading the page - which is not something anyone
    // should have to work out for themselves.
    failure
      ? h('div', { class: 'row-actions' },
        h('p', { class: 'warn-line' }, failure),
        h('button', {
          class: 'ghost', type: 'button',
          onclick: () => { failure = null; designs = null; ctx.refresh(); },
        }, 'Cuba lagi'))
      : null,
    loading && !rows.length ? h('p', { class: 'hint' }, 'Memuatkan...') : null,

    !loading && !rows.length && !failure
      ? h('p', { class: 'hint' },
        'Belum ada reka bentuk tersimpan. Tekan Simpan dan ia akan muncul di '
        + 'sini - juga pada peranti lain yang anda log masuk.')
      : null,

    rows.length
      ? h('ul', { class: 'design-list' }, rows.map((row) => h('li', {
        class: isOpen(row) ? 'design open' : 'design',
      },
      h('button', {
        class: 'design-open', type: 'button', onclick: open(row),
        title: 'Buka reka bentuk ini',
      },
      h('span', { class: 'design-name' }, row.name || 'Tanpa nama'),
      h('span', { class: 'design-when' }, when(row.updatedAt))),
      h('button', {
        class: 'icon-btn', type: 'button', title: 'Padam',
        onclick: busy(async () => {
          await cloud.remove(row.id);
          if (openId === row.id) { openId = null; openName = null; }
        }),
      }, '×'))))
      : null,

    h('p', { class: 'hint' },
      `Disimpan pada akaun ${s.email}. Yang disimpan ialah tetapannya - perkataan, `
      + 'font, bingkai, ukuran - bukan fail potong. Jadi reka bentuk lama masih '
      + 'boleh diedit, dan sentiasa dipotong dengan versi alat yang terkini.'));
}
