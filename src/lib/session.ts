// A small note the tools can read.
//
// The seven tools under /topper, /boxmaker and the rest are plain ES modules
// with no build step and no dependencies at all - that is deliberate, and
// shipping the Firebase SDK into each of them to answer one yes-or-no question
// would be a poor trade. They do share this origin, though, so the app can
// simply leave a note here saying somebody is signed in, and they can read it.
//
// Deliberately NOT the Firebase session itself. That lives in IndexedDB under a
// key and shape belonging to a library we do not control, and reading another
// library's private storage is a bug waiting for its next major version. This
// is our own format, and it is documented by being this file.
//
// It carries an email and nothing else - no token, nothing that would let the
// holder act as the user. It is a flag for a sign-in prompt, and the tools use
// it for exactly that.

export const SESSION_KEY = 'sifulaser.session'

export const publishSession = (email: string | null): void => {
  try {
    if (email) {
      localStorage.setItem(SESSION_KEY, JSON.stringify({ email }))
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
