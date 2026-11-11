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
  boxmaker: { name: 'Box Maker', path: '/boxmaker/' },
  puzzle: { name: 'Puzzle', path: '/puzzle/' },
  text: { name: 'Text Engraver', path: '/text/' },
  stand: { name: 'Stand Nama', path: '/stand/' },
  qr: { name: 'QR Generator', path: '/qr/' },
  adjust: { name: 'Template Adjuster', path: '/adjust/' },
  topper: { name: 'Cake Topper', path: '/topper/' },
  keychain: { name: 'Keychain', path: '/keychain/' },
  tag: { name: 'Tag Generator', path: '/tag/' },
  converter: { name: 'Converter File', path: '/converter/' },
  rehal: { name: 'Rehal', path: '/rehal/' },
  plakbox: { name: 'Plak Box', path: '/plakbox/' },
  tray: { name: 'Tray Organizer', path: '/tray/' },
  uvfile: { name: 'UV File Generator', path: '/uvfile/' },
};

/**
 * The tool this copy of the gallery is running inside. The UV File tab runs on this
 * same code and says so with useTool, so its designs stay its own.
 */
export let TOOL = 'puzzle';

/** Nama bila pengguna tidak menamakannya. */
let UNTITLED = 'Puzzle tanpa nama';

/** Run as another tool that shares this code. Call before anything else here. */
export function useTool(tool, untitled) {
  TOOL = tool;
  UNTITLED = untitled;
}

/** Apa yang disimpan, dalam bahasa pengguna - baris kecil di bawah galeri. */
const KEPT = 'Yang disimpan ialah tetapannya - saiz papan, bilangan keping, saiz tab, '
  + 'jitter, seed, jejari bucu, bahan, kerf dan pilihan lapisan - bukan fail potong. '
  + 'Jadi reka bentuk lama masih boleh diedit, dan sentiasa dipotong dengan versi '
  + 'alat yang terkini.';

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

/** The poster flow opens and closes jobs on its own terms, and says so here. */
export function setOpen(id, name) {
  openId = id;
  openName = name;
}

export function forget() {
  designs = null;
  failure = null;
  openId = null;
  openName = null;
}

const sameText = (a, b) => String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();

/** For the label in a list. readPoster in posterSaved.js is what opens one. */
// In the Puzzle tab a poster job sits among ordinary puzzles, so it is labelled; in the
// UV File tab every job is one.
const isPoster = (row) => TOOL === 'puzzle' && typeof row?.extra === 'string' && row.extra.includes('"poster":');

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
 * `asNew` forces a copy; `target` overwrites that design; otherwise an open design
 * is updated where it stands. That distinction is the whole reason exporting three
 * times does not leave three entries called "tanpa nama" stacked on each other -
 * which is what the first version did, and it filled the list with near-duplicates
 * within a single sitting.
 */
// Satu simpanan pada satu masa. Alat menyimpan bila Export dibuka DAN pada
// setiap muat turun; dua fail yang ditekan berturut-turut, tanpa barisan ini,
// kedua-duanya POST sebelum salah satu tahu id yang lain - dua entri untuk
// satu reka bentuk.
let queue = Promise.resolve();

export function saveCurrent(store, opts) {
  const run = queue.then(() => saveNow(store, opts));
  queue = run.catch(() => {});
  return run;
}

async function saveNow(store, { name, asNew = false, target = null } = {}) {
  const title = String(name || store.name() || UNTITLED).trim();

  // Whatever a tool must settle before its data can be read: a poster's seeds.
  if (store.prepare) await store.prepare();

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
    id: target || (asNew ? null : openId),
    name: title,
    params: store.params(),
    material: store.material(),
    tool: TOOL,
    extra,
  });
  openId = id;
  openName = title;
  designs = null;
  store.onSaved?.(id, title);
  return id;
}

/**
 * Save on the way out of Export. Never throws and never interrupts.
 * Pulangkan true bila tersimpan, supaya dialog Export boleh berkata begitu.
 *
 * The download is what was asked for; a save that failed must not put a dialog
 * in front of it. Nothing is lost either way - the design is still in this
 * browser, as it always was.
 */
export async function saveQuietly(store) {
  if (!cloud.signedIn()) return false;
  try {
    await saveCurrent(store);
    return true;
  } catch {
    /* silent on purpose */
    return false;
  }
}

let pendingList = null;

function ensureList(done) {
  if (designs !== null || failure) return;
  if (!pendingList) {
    loading = true;
    pendingList = cloud.list()
      .then((rows) => { designs = rows; })
      .catch((err) => { failure = message(err); })
      .then(() => {
        loading = false;
        pendingList = null;
      });
  }
  pendingList.then(done);
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
    // A tool may answer false: the poster flow can be told to stay where it is.
    if ((await store.apply(row)) === false) return false;
    openId = row.id;
    openName = row.name;
    return true;
  } catch {
    return false;
  }
}

/**
 * Body of the Save dialog: Save As (Boss, 5 Nov 2026).
 *
 * Type a name for a new file, or pick an older one to overwrite it. The rule is a
 * desktop Save As: a name already on the list means that file, and the button says
 * Overwrite before anything happens.
 */
export function saveDialogBody(h, store, close) {
  if (!cloud.signedIn()) {
    return h('div', { class: 'dlg-body' },
      h('h2', {}, 'Simpan reka bentuk'),
      ...signInBlock(h,
        'Daftar masuk untuk menyimpan. Reka bentuk disimpan pada akaun anda, '
        + 'jadi ia ada di telefon dan di komputer, dan tidak hilang bila anda '
        + 'kosongkan data pelayar.'),
      h('div', { class: 'dlg-actions' },
        h('button', { class: 'ghost', type: 'button', onclick: close }, 'Batal')));
  }

  // One name for the design, prefilled from the project name in the top bar, so
  // there are not two fields quietly disagreeing about what this is called.
  const input = h('input', {
    class: 'name-field',
    type: 'text',
    value: store.name(),
    maxlength: '120',
    placeholder: 'Nama file',
  });

  // These parts repaint as the name changes. Rebuilding the whole dialog would take
  // the cursor out of the box being typed in.
  const warning = h('p', { class: 'warn-line', hidden: true });
  const editing = h('p', { class: 'hint', hidden: !openId }, openId ? `Sedang edit: ${openName}` : '');
  const listBox = h('div', { class: 'save-files' });
  const actions = h('div', { class: 'dlg-actions' });

  failure = null;
  let saving = false;
  let error = null;
  let onEnter = null;

  // Only this tool's designs: overwriting a Box Maker file from here would be a
  // mistake nothing could undo.
  const files = () => {
    const rows = (designs || []).filter((r) => !r.tool || r.tool === TOOL);
    return openId && !rows.some((r) => r.id === openId)
      ? [{ id: openId, name: openName }, ...rows]
      : rows;
  };

  const sameName = () => {
    const wanted = input.value.trim() || UNTITLED;
    const same = files().filter((r) => sameText(r.name, wanted));
    return same.find((r) => r.id === openId) || same[0] || null;
  };

  let paint = () => {};

  const save = async (opts) => {
    if (saving) return;
    saving = true;
    error = null;
    paint();
    try {
      const name = input.value.trim() || UNTITLED;
      store.rename(name);
      await saveCurrent(store, { name, ...opts });
      close();
    } catch (err) {
      error = message(err);
      saving = false;
      paint();
    }
  };

  const saveButton = (cls, label, opts, title) => h('button', {
    class: cls,
    type: 'button',
    title,
    disabled: saving,
    onclick: () => save(opts),
  }, saving && cls === 'primary' ? 'Menyimpan...' : label);

  paint = () => {
    const same = sameName();
    const other = same && same.id !== openId;
    warning.hidden = !error && !other;
    warning.textContent = error
      || (other ? `"${same.name}" akan diganti dengan yang ni. File lama tak boleh dikembalikan.` : '');

    const buttons = [h('button', { class: 'ghost', type: 'button', onclick: close }, 'Batal')];
    if (same) {
      onEnter = { target: same.id };
      buttons.push(saveButton('primary', 'Overwrite', onEnter));
    } else if (openId) {
      onEnter = { asNew: true };
      buttons.push(
        saveButton('ghost', 'Overwrite file asal', { target: openId }, `Ganti "${openName}" dan guna nama baru`),
        saveButton('primary', 'Simpan sebagai baru', onEnter),
      );
    } else {
      onEnter = { asNew: true };
      buttons.push(saveButton('primary', 'Simpan', onEnter));
    }
    actions.replaceChildren(...buttons);

    const scroll = listBox.querySelector('ul')?.scrollTop || 0;
    const rows = files();
    if (rows.length) {
      const list = h('ul', { class: 'design-list' }, rows.map((row) => h('li', {
        class: same?.id === row.id ? 'design open' : 'design',
      },
      h('button', {
        class: 'design-open',
        type: 'button',
        onclick: () => {
          input.value = row.name || '';
          paint();
          input.focus();
        },
      },
      h('span', { class: 'design-name' }, row.name || 'Tanpa nama'),
      h('span', { class: 'design-when' }, isPoster(row) ? `Poster - ${when(row.updatedAt)}` : when(row.updatedAt))))));
      listBox.replaceChildren(h('p', { class: 'field-label' }, 'Atau pilih file lama untuk overwrite'), list);
      list.scrollTop = scroll;
    } else if (loading) {
      listBox.replaceChildren(h('p', { class: 'muted' }, 'Memuatkan senarai file...'));
    } else if (failure) {
      listBox.replaceChildren(h('p', { class: 'muted' }, 'Senarai file lama tak dapat dimuatkan.'));
    } else {
      listBox.replaceChildren();
    }
  };

  input.addEventListener('input', () => {
    error = null;
    paint();
  });
  input.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' || !onEnter) return;
    e.preventDefault();
    save(onEnter);
  });

  ensureList(() => paint());
  paint();
  setTimeout(() => {
    input.focus();
    input.select();
  });

  return h('div', { class: 'dlg-body' },
    h('h2', {}, 'Simpan sebagai'),
    h('label', { class: 'field-label' }, 'Nama file'),
    input,
    editing,
    warning,
    droppedExtra
      ? h('p', { class: 'warn-line' },
        'Sebahagian data reka bentuk ini terlalu besar untuk disimpan, jadi '
        + 'hanya tetapannya yang disimpan. Eksport fail potong untuk '
        + 'menyimpan selebihnya.')
      : null,
    listBox,
    store.note ? h('p', { class: 'hint' }, store.note) : null,
    actions);
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
        'Belum ada reka bentuk tersimpan. Tekan Simpan dan ia akan muncul di sini '
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
        onclick: async () => {
          // A design made in another tool cannot be opened in this one -
          // the settings are a different shape entirely - so go to the tool
          // it belongs to and let that one open it.
          if (row.tool && row.tool !== TOOL) {
            const dest = TOOLS[row.tool];
            if (!dest) return;
            location.href = `${dest.path}?design=${encodeURIComponent(row.id)}`;
            return;
          }
          // Closed first: opening a poster can ask something of its own, and a
          // tool may answer false to stay where it is.
          close();
          if ((await store.apply(row)) === false) return;
          openId = row.id;
          openName = row.name;
        },
      },
      h('span', { class: 'design-name' }, row.name || 'Tanpa nama'),
      h('span', { class: 'design-when' },
        row.tool && row.tool !== TOOL
          ? `${(TOOLS[row.tool] || {}).name || row.tool} - ${when(row.updatedAt)}`
          : `${isPoster(row) ? 'Poster - ' : ''}${when(row.updatedAt)}`)),
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

    h('p', { class: 'hint' }, store.note || KEPT),

    h('div', { class: 'dlg-actions' },
      h('button', { class: 'primary', type: 'button', onclick: close }, 'Tutup')));
}
