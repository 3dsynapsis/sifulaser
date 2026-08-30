// A small note the tools can read.
//
// The seven tools under /topper, /boxmaker and the rest are plain ES modules
// with no build step and no dependencies at all - that is deliberate, and
// shipping the Firebase SDK into each of them would be a poor trade. They do
// share this origin, though, so the app leaves a note here and they read it.
//
// Deliberately NOT the Firebase session itself. That lives in IndexedDB under a
// key and shape belonging to a library we do not control, and reading another
// library's private storage is a bug waiting for its next major version. This
// is our own format, and it is documented by being this file.
//
// ---------------------------------------------------------------------------
// About the token, because it deserves saying out loud.
//
// This note carries the user's Firebase ID token, which is what lets a tool
// save a design to Firestore as that user without the SDK. A bearer token in
// localStorage is not something to do casually, so: the token only ever grants
// what the security rules grant, which is that user's own record and their own
// designs - never anyone else's. And any script running on this origin can
// already pull the same token out of Firebase's own IndexedDB, so this does not
// hand out access that was otherwise unreachable. It makes it easier to reach,
// which is why the SVG import hole that would have allowed exactly that was
// closed before this was written.
//
// Tokens last an hour. onIdTokenChanged fires when Firebase refreshes one, so
// the note is rewritten and never goes stale behind the tools' backs.
// ---------------------------------------------------------------------------

export const SESSION_KEY = 'sifulaser.session'

export interface SharedSession {
  email: string
  uid: string
  token: string
  /** Milliseconds since epoch. The tools refuse a token past this. */
  exp: number
}

export const publishSession = (session: SharedSession | null): void => {
  try {
    if (session) {
      localStorage.setItem(SESSION_KEY, JSON.stringify(session))
    } else {
      localStorage.removeItem(SESSION_KEY)
    }
  } catch {
    // Private windows and blocked site data throw. The tools treat a missing
    // note as signed out and ask again, which is the safe way to be wrong.
  }
}

/**
 * Where a tool asked to be sent back to, if it is somewhere we are willing to go.
 *
 * A `next` parameter that accepts any URL is how an open redirect gets built by
 * accident: a link to sifulaser.com that quietly lands the visitor on somebody
 * else's page, wearing our name. So only a path on this site is allowed - one
 * leading slash, and no scheme or host smuggled in behind it.
 */
export const safeNext = (raw: string | null): string | null => {
  if (!raw) return null
  let value = raw
  try {
    value = decodeURIComponent(raw)
  } catch {
    return null
  }
  if (!value.startsWith('/')) return null
  // "//host" and "/\host" are both read as protocol-relative URLs by browsers.
  if (value.startsWith('//') || value.startsWith('/\\')) return null
  if (value.includes('://')) return null
  return value
}
