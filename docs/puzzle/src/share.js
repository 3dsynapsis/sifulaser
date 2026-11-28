// Links to look at a job, not to change it (UV Plak tab, Boss, 28 Nov 2026: "share
// kepada staff saya untuk dia tengok ... dapat overall view tapi tak boleh edit").
//
// A saved design holds only settings; the client's file stays in the browser that
// opened it. A link has to work on a staff member's phone, so here the file goes to the
// server too - only for a job the person shares, as Boss agreed ("setuju simpan di
// server, sesiapa ada link").
//
//   shares/{id}              owner, tool, name, updatedAt, job (JSON text), file
//   shares/{id}/parts/{p}    owner, data: a piece of the file, base64
//
// Firestore over REST, as cloud.js does, so no SDK. The id is random and long, and the
// rules let anyone GET a document by its id but nobody LIST them, so a link is the
// only way in. Only its owner may write or delete. A Firestore document holds a
// megabyte at most, hence the file in pieces; the pieces are written before the
// document that names them, so a link never points at half a file.

import { session } from './cloud.js';

const PROJECT = 'sifulaser';
const BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents`;

/** base64 characters a piece carries; the rules allow 700000. */
export const PART_CHARS = 600000;
/** The biggest file a link carries: 40 pieces, about 18 MB. */
export const PARTS_MAX = 40;
const ID_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';

export class ShareError extends Error {
  constructor(code, text) {
    super(text);
    this.code = code;
  }
}

/** A new link's id: 22 characters, about 128 bits. */
export function newShareId(random = (n) => crypto.getRandomValues(new Uint8Array(n))) {
  const bytes = random(22);
  return Array.from(bytes, (b) => ID_CHARS[b % ID_CHARS.length]).join('');
}
export const isShareId = (v) => typeof v === 'string' && /^[A-Za-z0-9]{16,40}$/.test(v);

/** The page a link opens. */
export const shareUrl = (id, origin = location.origin) => `${origin}/uvplak/?lihat=${id}`;

/** Bytes as base64, in steps, so a big file does not overflow the call stack. */
export function toBase64(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

export function fromBase64(text) {
  const s = atob(text);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

/** A file's base64 cut into the pieces it is stored in. */
export function splitParts(text, size = PART_CHARS) {
  const out = [];
  for (let i = 0; i < text.length; i += size) out.push(text.slice(i, i + size));
  return out.length ? out : [''];
}

/** A piece's document id: the file's hash, so a new file never mixes with an old one. */
export const partId = (hash, i) => `${String(hash || 'file').slice(0, 16)}-${i}`;

const str = (v) => ({ stringValue: String(v) });
const int = (v) => ({ integerValue: String(Math.round(v)) });

async function request(path, { method = 'GET', fields = null, auth = true } = {}) {
  const headers = {};
  if (auth) {
    const s = session();
    if (!s) throw new ShareError('signin', 'Daftar masuk dulu untuk share.');
    headers.Authorization = `Bearer ${s.token}`;
  }
  if (fields) headers['Content-Type'] = 'application/json';
  const res = await fetch(`${BASE}/${path}`, {
    method, headers, body: fields ? JSON.stringify({ fields }) : undefined,
  });
  if (res.status === 404) throw new ShareError('gone', 'Link ni tak wujud atau sudah dibatalkan.');
  if (res.status === 401) throw new ShareError('signin', 'Sesi tamat. Daftar masuk semula.');
  if (res.status === 403) {
    throw new ShareError('rules', auth
      ? 'Server belum benarkan share. Peraturan Firebase baharu perlu di-Publish dulu.'
      : 'Link ni tak dapat dibuka. Mungkin sudah dibatalkan.');
  }
  if (!res.ok) throw new ShareError('net', 'Tak dapat sambung ke server. Cuba lagi.');
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

/** The link's document as it stands, or null when there is none. Public. */
export async function readShareDoc(id) {
  try {
    const doc = await request(`shares/${id}`, { auth: false });
    const f = doc?.fields || {};
    const file = f.file?.mapValue?.fields || {};
    return {
      owner: f.owner?.stringValue || '',
      tool: f.tool?.stringValue || '',
      name: f.name?.stringValue || '',
      updatedAt: f.updatedAt?.stringValue || '',
      job: f.job?.stringValue || '',
      file: {
        name: file.name?.stringValue || 'design.pdf',
        type: file.type?.stringValue || '',
        size: Number(file.size?.integerValue || 0),
        hash: file.hash?.stringValue || '',
        parts: Number(file.parts?.integerValue || 0),
      },
    };
  } catch (err) {
    if (err.code === 'gone') return null;
    throw err;
  }
}

/**
 * Put a job behind its link, or bring the link up to date. The file goes up only when
 * it is not the one already there; the pieces of a file it replaces are deleted after.
 *
 * @param o { id, tool, name, job: object, file: { name, type, bytes, hash } }
 * @param onStep (done, total) as the pieces go up
 */
export async function publishShare(o, onStep = () => {}) {
  const s = session();
  if (!s) throw new ShareError('signin', 'Daftar masuk dulu untuk share.');
  const before = await readShareDoc(o.id).catch(() => null);
  const pieces = splitParts(toBase64(o.file.bytes));
  if (pieces.length > PARTS_MAX) throw new ShareError('big', 'File design terlalu besar untuk dikongsi (lebih 18 MB).');
  const same = before && before.file.hash === o.file.hash && before.file.parts === pieces.length;
  if (!same) {
    for (let i = 0; i < pieces.length; i++) {
      await request(`shares/${o.id}/parts/${partId(o.file.hash, i)}`, {
        method: 'PATCH', fields: { owner: str(s.uid), data: str(pieces[i]) },
      });
      onStep(i + 1, pieces.length);
    }
  }
  await request(`shares/${o.id}`, {
    method: 'PATCH',
    fields: {
      owner: str(s.uid),
      tool: str(o.tool),
      name: str(String(o.name || 'Tanpa nama').slice(0, 120)),
      updatedAt: str(new Date().toISOString()),
      job: str(JSON.stringify(o.job)),
      file: {
        mapValue: {
          fields: {
            name: str(String(o.file.name).slice(0, 200)),
            type: str(o.file.type || ''),
            size: int(o.file.bytes.length),
            hash: str(o.file.hash || ''),
            parts: int(pieces.length),
          },
        },
      },
    },
  });
  if (before && !same) await removeParts(o.id, before.file).catch(() => {});
  return shareUrl(o.id);
}

async function removeParts(id, file) {
  for (let i = 0; i < file.parts; i++) {
    await request(`shares/${id}/parts/${partId(file.hash, i)}`, { method: 'DELETE' }).catch(() => {});
  }
}

/** Take a link down: its file's pieces, then the document. */
export async function deleteShare(id) {
  const before = await readShareDoc(id);
  if (!before) return;
  await removeParts(id, before.file);
  await request(`shares/${id}`, { method: 'DELETE' });
}

/**
 * What a link holds, for the page that shows it: the job and its file. Public.
 * @returns { name, tool, updatedAt, job: object, file: File }
 */
export async function openShare(id, onStep = () => {}) {
  if (!isShareId(id)) throw new ShareError('gone', 'Link ni tak sah.');
  const doc = await readShareDoc(id);
  if (!doc) throw new ShareError('gone', 'Link ni tak wujud atau sudah dibatalkan.');
  let text = '';
  for (let i = 0; i < doc.file.parts; i++) {
    const part = await request(`shares/${id}/parts/${partId(doc.file.hash, i)}`, { auth: false });
    text += part?.fields?.data?.stringValue || '';
    onStep(i + 1, doc.file.parts);
  }
  const bytes = fromBase64(text);
  let job = null;
  try {
    job = JSON.parse(doc.job);
  } catch { /* the caller says the link is broken */ }
  return {
    name: doc.name,
    tool: doc.tool,
    updatedAt: doc.updatedAt,
    job,
    file: new File([bytes], doc.file.name, { type: doc.file.type || 'application/pdf' }),
  };
}
