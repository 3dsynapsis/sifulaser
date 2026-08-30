// Saved designs: the Save dialog and the gallery.
//
// These live in the top bar rather than in the inspector. The inspector is for
// the design you are making now; a list of the ones you made last week is a
// different kind of thing, and putting it in there made the panel feel
// cluttered - which is exactly what it looked like, and why it moved.
//
// One list, in one place. It would have been easy to keep the panel and add the
// button as well, and then there would be two renderings of the same thing to
// keep in step. That is not two features.
//
// Element helpers arrive as arguments rather than being imported from ui.js,
// which imports this. A cycle between two modules that both define things with
// const leaves one reading the other mid-initialisation, and the failure looks
// like an unrelated crash on first paint.

import * as cloud from './cloud.js';

const HOME = 'https://sifulaser.com/';

/** Which tool a design belongs to, and where that tool lives. */
export const TOOLS = {
  topper: { name: 'Cake Topper', path: '/topper/' },
  boxmaker: { name: 'Box Maker', path: '/boxmaker/' },
  stand: { name: 'Stand Nama', path: '/stand/' },
  qr: { name: 'QR Generator', path: '/qr/' },
  puzzle: { name: 'Puzzle', path: '/puzzle/' },
  text: { name: 'Text Engraver', path: '/text/' },
  adjust: { name: 'Template Adjuster', path: '/adjust/' },
};

/** The tool this copy of the gallery is running inside. */
export const TOOL = 'boxmaker';

/**
 * How much tool-specific data a design may carry, in bytes of JSON.
 *
 * Firestore allows a megabyte per document. This leaves room for the rest of
 * it and for the difference between what a string measures here and what it
 * occupies there. A Box Maker ornament of middling complexity - three shapes,
 * a couple of thousand points - is about 85 KB, so this holds roughly five of
 * them. Past that the box is saved without its decoration and the dialog says
 * so, which is better than a save that fails with nothing to explain it.
 */
export const EXTRA_LIMIT = 450 * 1024;

/** Set when the last save had to leave the decoration behind. */
let droppedExtra = false;
export const lastSaveDroppedExtra = () => droppedExtra;

// Cached: the dialogs get opened repeatedly and the list rarely changes in
// between.
let designs = null;
let loading = false;
let failure = null;

/** The design being edited, if one was opened or saved this session. */
let openId = null;
let openName = null;

export const current = () => ({ id: openId, name: openName });

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

export function askSignIn() {
  const next = location.pathname + location.search;
  location.href = `${HOME}?signin=1&next=${encodeURIComponent(next)}`;
}

const message = (err) => (err instanceof cloud.NotSignedIn
  ? 'Sesi tamat. Daftar masuk semula.'
  : 'Tak berjaya. Cuba lagi.');

/**
 * Save the design on screen.
 *
 * `asNew` forces a copy; otherwise an open design is updated where it stands.
 * That distinction is the whole reason exporting three times does not leave
 * three entries called Untitled topper stacked on each other - which is what
 * the first version did, and it filled the list with near-duplicates within a
 * single sitting.
 */
export async function saveCurrent(store, { name, asNew = false } = {}) {
  const title = String(name || store.name() || 'Untitled box').trim();

  // Tools that carry nothing beyond their settings leave this out entirely.
  let extra = null;
  droppedExtra = false;
  if (typeof store.extra === 'function') {
    const payload = store.extra();
    if (payload) {
      const text = JSON.stringify(payload);
      if (text.length <= EXTRA_LIMIT) extra = text;
      else droppedExtra = true;
    }
  }

  const id = await cloud.save({
    id: asNew ? null : openId,
    name: title,
    params: store.params(),
    material: store.material(),
    tool: TOOL,
    extra,
  });
  openId = id;
  openName = title;
  designs = null;
  return id;
}

/**
 * Save on the way out of Export. Never throws and never interrupts.
 *
 * The download is what was asked for; a save that failed must not put a dialog
 * in front of it. Nothing is lost either way - the design is still in this
 * browser, as it always was.
 */
export async function saveQuietly(store) {
  if (!cloud.signedIn()) return;
  try {
    await saveCurrent(store);
  } catch {
    /* silent on purpose */
  }
}

function ensureList(rerender) {
  if (designs !== null || loading || failure) return;
  loading = true;
  cloud.list()
    .then((rows) => { designs = rows; })
    .catch((err) => { failure = message(err); })
    .then(() => { loading = false; rerender(); });
}

const signInBlock = (h, note) => [
  h('p', { class: 'muted' }, note),
  h('button', { class: 'primary wide', type: 'button', onclick: askSignIn },
    'Daftar masuk dengan Google'),
];

/**
 * Open a design by id, for a link that arrived from another tool.
 *
 * Returns false when there is nothing to open - not signed in, no such
 * design, or it belongs to a different tool after all - so the caller can
 * quietly carry on with whatever was already on screen.
 */
export async function openById(store, id) {
  if (!id || !cloud.signedIn()) return false;
  try {
    const rows = await cloud.list();
    designs = rows;
    const row = rows.find((r) => r.id === id);
    if (!row || (row.tool && row.tool !== TOOL)) return false;
    store.apply(row);
    openId = row.id;
    openName = row.name;
    return true;
  } catch {
    return false;
  }
}

/** Body of the Save dialog. */
export function saveDialogBody(h, store, close, rerender) {
  if (!cloud.signedIn()) {
    return h('div', { class: 'dlg-body' },
      h('h2', {}, 'Simpan reka bentuk'),
      ...signInBlock(h,
        'Daftar masuk untuk menyimpan. Reka bentuk disimpan pada akaun anda, '
        + 'jadi ia ada di telefon dan di komputer, dan tidak hilang bila anda '
        + 'kosongkan data pelayar.'));
  }

  // One name for the design, prefilled from the project name in the top bar, so
  // there are not two fields quietly disagreeing about what this is called.
  const input = h('input', {
    class: 'name-field',
    type: 'text',
    value: store.name(),
    maxlength: '120',
    placeholder: 'Nama reka bentuk',
  });

  let busy = false;
  const commit = (asNew) => async () => {
    if (busy) return;
    busy = true;
    failure = null;
    try {
      const name = input.value.trim() || 'Untitled box';
      store.rename(name);
      await saveCurrent(store, { name, asNew });
      close();
    } catch (err) {
      failure = message(err);
      busy = false;
      rerender();
    }
  };

  return h('div', { class: 'dlg-body' },
    h('h2', {}, 'Simpan reka bentuk'),
    h('label', { class: 'field-label' }, 'Nama'),
    input,
    openId ? h('p', { class: 'hint' }, `Sedang mengedit: ${openName}`) : null,
    droppedExtra
      ? h('p', { class: 'warn-line' },
        'Hiasan pada kotak ini terlalu besar untuk disimpan, jadi hanya ukuran '
        + 'dan bentuk kotak yang disimpan. Eksport fail potong untuk menyimpan '
        + 'hiasannya.')
      : null,
    failure ? h('p', { class: 'warn-line' }, failure) : null,
    h('div', { class: 'dlg-actions' },
      h('button', { class: 'ghost', type: 'button', onclick: close }, 'Batal'),
      openId
        ? h('button', {
          class: 'ghost wide', type: 'button', onclick: commit(true),
        }, 'Simpan sebagai baharu')
        : null,
      h('button', {
        class: 'primary', type: 'button', onclick: commit(false),
      }, openId ? 'Kemas kini' : 'Simpan')));
}

/** Body of the gallery dialog. */
export function filesDialogBody(h, store, close, rerender) {
  if (!cloud.signedIn()) {
    return h('div', { class: 'dlg-body' },
      h('h2', {}, 'Reka bentuk saya'),
      ...signInBlock(h,
        'Daftar masuk untuk melihat reka bentuk yang anda simpan.'));
  }

  ensureList(rerender);

  const act = (fn) => async () => {
    failure = null;
    try {
      await fn();
      designs = await cloud.list();
    } catch (err) {
      failure = message(err);
    }
    rerender();
  };

  const rows = designs || [];

  return h('div', { class: 'dlg-body' },
    h('h2', {}, 'Reka bentuk saya'),

    failure
      ? h('div', { class: 'row-actions' },
        h('p', { class: 'warn-line' }, failure),
        h('button', {
          class: 'ghost',
          type: 'button',
          onclick: () => { failure = null; designs = null; rerender(); },
        }, 'Cuba lagi'))
      : null,

    loading && !rows.length ? h('p', { class: 'muted' }, 'Memuatkan...') : null,

    !loading && !rows.length && !failure
      ? h('p', { class: 'muted' },
        'Belum ada reka bentuk tersimpan. Tekan Save dan ia akan muncul di sini '
        + '- juga pada peranti lain yang anda log masuk.')
      : null,

    rows.length
      ? h('ul', { class: 'design-list' }, rows.map((row) => h('li', {
        class: row.id === openId ? 'design open' : 'design',
      },
      h('button', {
        class: 'design-open',
        type: 'button',
        title: row.tool === TOOL
          ? 'Buka reka bentuk ini'
          : `Buka dalam ${(TOOLS[row.tool] || {}).name || row.tool}`,
        onclick: () => {
          // A design made in another tool cannot be opened in this one -
          // the settings are a different shape entirely - so go to the tool
          // it belongs to and let that one open it.
          if (row.tool && row.tool !== TOOL) {
            const dest = TOOLS[row.tool];
            if (!dest) return;
            location.href = `${dest.path}?design=${encodeURIComponent(row.id)}`;
            return;
          }
          store.apply(row);
          openId = row.id;
          openName = row.name;
          close();
        },
      },
      h('span', { class: 'design-name' }, row.name || 'Tanpa nama'),
      h('span', { class: 'design-when' },
        row.tool && row.tool !== TOOL
          ? `${(TOOLS[row.tool] || {}).name || row.tool} - ${when(row.updatedAt)}`
          : when(row.updatedAt))),
      h('button', {
        class: 'icon-btn',
        type: 'button',
        title: 'Padam',
        onclick: act(async () => {
          await cloud.remove(row.id);
          if (openId === row.id) { openId = null; openName = null; }
        }),
      }, '×'))))
      : null,

    h('p', { class: 'hint' },
      'Yang disimpan ialah tetapannya - perkataan, font, bingkai, ukuran - bukan '
      + 'fail potong. Jadi reka bentuk lama masih boleh diedit, dan sentiasa '
      + 'dipotong dengan versi alat yang terkini.'),

    h('div', { class: 'dlg-actions' },
      h('button', { class: 'primary', type: 'button', onclick: close }, 'Tutup')));
}
