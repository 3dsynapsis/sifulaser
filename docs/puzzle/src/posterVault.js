// The poster's PDF, and the job on screen, kept in this browser.
//
// IndexedDB and not localStorage: a poster is tens of megabytes of binary, and
// localStorage holds a few megabytes of text. Nothing here leaves the browser.
//
// Two things are stored:
//
//   files  the PDFs, by hash. A saved job names its PDF by hash, so opening it here
//          needs nothing more from the person. The list is kept short (see evict).
//   draft  the job as it stands right now. Leaving the page by accident, a reload or
//          a crash puts everything back, whether or not Simpan was ever pressed.
//
// Every call rejects when the browser will not store (a private window can refuse).
// The callers carry on without it: a save still reaches the account, and the PDF is
// asked for again when the job is opened.

const DB_NAME = 'sifulaser-puzzle-poster';
const FILES = 'files';
const META = 'meta';
const DRAFT = 'draft';
const MAX_FILES = 10;
const MAX_BYTES = 1024 ** 3;
const PDF = 'application/pdf';

let opening = null;

function connect() {
  if (!opening) {
    opening = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        req.result.createObjectStore(FILES, { keyPath: 'hash' });
        req.result.createObjectStore(META);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    }).catch((err) => {
      opening = null;
      throw err;
    });
  }
  return opening;
}

async function run(store, mode, work) {
  const db = await connect();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, mode);
    const req = work(tx.objectStore(store));
    tx.oncomplete = () => resolve(req.result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

const read = (hash) => run(FILES, 'readonly', (s) => s.get(hash));
const write = (entry) => run(FILES, 'readwrite', (s) => s.put(entry));
const drop = (hash) => run(FILES, 'readwrite', (s) => s.delete(hash));

/** SHA-256 of the file, as hex. */
export async function hashBytes(bytes) {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Oldest first, past ten files or a gigabyte. The file in use always stays. A job
 * whose PDF has gone still opens: it asks for the file again and keeps its seeds.
 */
async function evict(current) {
  const all = await run(FILES, 'readonly', (s) => s.getAll());
  all.sort((a, b) => b.usedAt - a.usedAt);
  let total = 0;
  for (let i = 0; i < all.length; i++) {
    total += all[i].size || 0;
    if (all[i].hash !== current && (i >= MAX_FILES || total > MAX_BYTES)) {
      await drop(all[i].hash);
    }
  }
}

export async function putFile(hash, name, bytes) {
  const old = await read(hash);
  await write(old
    ? { ...old, name, usedAt: Date.now() }
    : {
      hash,
      name,
      blob: new Blob([bytes], { type: PDF }),
      size: bytes.length,
      kept: false,
      usedAt: Date.now(),
    });
  await evict(hash);
}

/** The stored PDF as a File, or null when this browser does not have it. */
export async function getFile(hash) {
  const entry = await read(hash);
  if (!entry) return null;
  await write({ ...entry, usedAt: Date.now() });
  return new File([entry.blob], entry.name, { type: PDF });
}

/** A saved job now depends on this PDF, so closing the poster must not remove it. */
export async function keepFile(hash) {
  const entry = await read(hash);
  if (!entry) throw new Error('no such file');
  await write({ ...entry, kept: true });
  // Asks the browser not to clear this under disk pressure. It may say no.
  Promise.resolve(navigator.storage?.persist?.()).catch(() => {});
}

/** Closing a poster that was never saved leaves nothing of it behind. */
export async function releaseFile(hash) {
  const entry = await read(hash);
  if (entry && !entry.kept) await drop(hash);
}

export const putDraft = (draft) => run(META, 'readwrite', (s) => s.put(draft, DRAFT));
export const getDraft = () => run(META, 'readonly', (s) => s.get(DRAFT));
export const clearDraft = () => run(META, 'readwrite', (s) => s.delete(DRAFT));
