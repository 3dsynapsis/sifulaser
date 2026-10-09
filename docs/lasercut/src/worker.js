// Reads the file off the main thread, so a heavy .ai cannot freeze the page on
// a phone, and so main.js can stop it after 20 seconds.
// The bytes arrive by postMessage from the same page: nothing is fetched.

import { analyseFile } from './analyse.js';

self.onmessage = async (e) => {
  const { id, bytes, name } = e.data || {};
  let result;
  try {
    result = await analyseFile(new Uint8Array(bytes), name);
  } catch (err) {
    result = { ok: false, code: err?.code === 'too-complex' ? 'too-complex' : 'corrupt' };
  }
  self.postMessage({ id, result });
};
