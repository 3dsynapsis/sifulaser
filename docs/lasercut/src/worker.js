// Reads the file off the main thread, so a heavy .ai or a big picture to trace
// cannot freeze the page on a phone, and so main.js can stop it after 20 s.
// The bytes arrive by postMessage from the same page: nothing is fetched.
//
// The opened file stays here, so changing a layer's job or the size only
// re-prices it ({ op: 'job' }) instead of reading the file again.

import { openFile, runJob } from './analyse.js';

let session = null;

self.onmessage = async (e) => {
  const { op = 'open', id, bytes, name, roles, scale } = e.data || {};
  let result;
  try {
    if (op === 'open') {
      session = null;
      const o = await openFile(new Uint8Array(bytes), name);
      if (o.ok) { session = o.session; result = runJob(session, session.roles, 1); } else result = { ok: false, code: o.code };
    } else {
      result = session ? runJob(session, roles || session.roles, scale || 1) : { ok: false, code: 'corrupt' };
    }
  } catch (err) {
    result = { ok: false, code: err?.code === 'too-complex' ? 'too-complex' : 'corrupt' };
  }
  self.postMessage({ id, result });
};
