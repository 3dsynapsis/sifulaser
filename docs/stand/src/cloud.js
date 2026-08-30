// Saved designs, kept on the server instead of in this browser.
//
// Until now a design lived in localStorage: one slot, one browser, one device.
// Make something on a phone and it is not there on the laptop, and clearing
// browsing data loses it with no way back - for the customer or for us, because
// it never reached us at all.
//
// This talks to Firestore over its REST API rather than through the Firebase
// SDK. That is not stubbornness: this tool has no build step and no
// dependencies, which is what lets it be a folder of files that any browser can
// run, and pulling in a megabyte of SDK to write a few hundred bytes would end
// that. REST needs nothing but fetch.
//
// Authorisation is the user's own ID token, left by the main site in
// localStorage under sifulaser.session. The security rules do the rest: the uid
// is in the document path, so a token can only ever reach its owner's designs.
// There is no owner field to tamper with and no query that reaches sideways.

const PROJECT = 'sifulaser';
const BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents`;
const SESSION_KEY = 'sifulaser.session';

/** The tool asks for this by name when something needs a sign-in. */
export class NotSignedIn extends Error {
  constructor() {
    super('Daftar masuk untuk menyimpan reka bentuk.');
    this.name = 'NotSignedIn';
  }
}

/**
 * The note the main site leaves, if there is one and it is still good.
 *
 * An expired token is treated as no session at all. Firebase refreshes roughly
 * hourly and rewrites the note, so this only bites when the site has not been
 * open for a long time - and then asking to sign in again is the honest answer,
 * rather than a save that fails somewhere deeper with a worse message.
 */
export function session() {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw);
    if (!s || !s.uid || !s.token) return null;
    if (typeof s.exp === 'number' && Date.now() >= s.exp) return null;
    return s;
  } catch {
    return null;
  }
}

export const signedIn = () => session() != null;

// ---- Firestore's wire format ----------------------------------------------
// Every value arrives and leaves tagged with its type. Integers travel as
// STRINGS, which is the detail that silently turns a width of 120 into "120"
// and then into NaN three functions later if it is not handled here.

function encode(value) {
  if (value === null || value === undefined) return { nullValue: null };
  if (typeof value === 'string') return { stringValue: value };
  if (typeof value === 'boolean') return { booleanValue: value };
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return { nullValue: null };
    return Number.isInteger(value)
      ? { integerValue: String(value) }
      : { doubleValue: value };
  }
  if (Array.isArray(value)) {
    return { arrayValue: { values: value.map(encode) } };
  }
  if (typeof value === 'object') {
    const fields = {};
    for (const [k, v] of Object.entries(value)) fields[k] = encode(v);
    return { mapValue: { fields } };
  }
  return { nullValue: null };
}

function decode(value) {
  if (!value || typeof value !== 'object') return null;
  if ('nullValue' in value) return null;
  if ('stringValue' in value) return value.stringValue;
  if ('booleanValue' in value) return value.booleanValue;
  if ('integerValue' in value) return Number(value.integerValue);
  if ('doubleValue' in value) return Number(value.doubleValue);
  if ('timestampValue' in value) return value.timestampValue;
  if ('arrayValue' in value) return (value.arrayValue.values || []).map(decode);
  if ('mapValue' in value) {
    const out = {};
    for (const [k, v] of Object.entries(value.mapValue.fields || {})) out[k] = decode(v);
    return out;
  }
  return null;
}

// Exported so the round trip can be tested without a browser: this encoding is
// where a width of 120 quietly becomes the string "120".
export const toFields = (obj) => {
  const fields = {};
  for (const [k, v] of Object.entries(obj)) fields[k] = encode(v);
  return fields;
};

export const fromFields = (fields) => {
  const out = {};
  for (const [k, v] of Object.entries(fields || {})) out[k] = decode(v);
  return out;
};

/** The document id is the last segment of the full resource path. */
const idOf = (name) => String(name || '').split('/').pop();

async function call(path, { method = 'GET', body, query } = {}) {
  const s = session();
  if (!s) throw new NotSignedIn();
  const url = new URL(`${BASE}/users/${s.uid}/designs${path}`);
  for (const [k, v] of Object.entries(query || {})) url.searchParams.set(k, v);

  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${s.token}`,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (res.status === 401 || res.status === 403) throw new NotSignedIn();
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`Firestore ${res.status}: ${detail.slice(0, 200)}`);
  }
  // Not res.json(). A delete comes back 200 with nothing in it, and parsing an
  // empty body throws - which surfaced as "the row will not go away", because
  // the throw skipped the reload that was supposed to follow. Read the text and
  // only parse it if there is any.
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

// ---- what the tool actually uses -------------------------------------------

/** Every design this account has saved, newest first. */
export async function list() {
  const data = await call('', { query: { pageSize: '100' } });
  const rows = (data && data.documents) || [];
  return rows
    .map((doc) => ({ id: idOf(doc.name), ...fromFields(doc.fields) }))
    .sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));
}

/**
 * Save a design. Pass an id to overwrite that one, omit it for a new one.
 *
 * Only the settings are stored - the words, the typeface, the border, the
 * numbers - never the finished SVG. A recipe rather than the cake: a few
 * hundred bytes instead of a few hundred kilobytes, the design stays editable,
 * and anything we improve in the tool tomorrow applies to designs saved today,
 * because they are cut fresh every time.
 */
export async function save({
  id, name, params, material, tool, extra,
}) {
  const body = {
    fields: toFields({
      name: String(name || 'Untitled topper').slice(0, 120),
      tool: String(tool || 'topper'),
      params,
      material: String(material || ''),
      updatedAt: new Date().toISOString(),
    }),
  };
  const doc = id
    ? await call(`/${encodeURIComponent(id)}`, { method: 'PATCH', body })
    : await call('', { method: 'POST', body });
  return idOf(doc.name);
}

export async function remove(id) {
  await call(`/${encodeURIComponent(id)}`, { method: 'DELETE' });
}
