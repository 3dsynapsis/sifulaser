// The PDF Standard security handler, for the one case customers actually send:
// a file with a permissions ("owner") password but NO open password. Every
// viewer opens those without asking, so refusing them would look like a bug to
// the customer. 19 of 400 real business PDFs in the research sample were
// encrypted; 15 of those opened without a password.
//
// Supported: RC4 40-128 (V1/V2, R2/R3), V4 with RC4 or AES-128 crypt filters
// (R4), and AES-256 (V5, R5/R6). Only the empty user password is tried - we
// never ask a customer for a password, the file just gets a clear message.
//
// MD5 and RC4 are here in plain JS. AES and SHA-2 come from WebCrypto
// (crypto.subtle), which exists in every browser we target over HTTPS and on
// localhost, and in node >= 20 for the tests.

const PAD = Uint8Array.from([
  0x28, 0xbf, 0x4e, 0x5e, 0x4e, 0x75, 0x8a, 0x41, 0x64, 0x00, 0x4e, 0x56, 0xff, 0xfa, 0x01, 0x08,
  0x2e, 0x2e, 0x00, 0xb6, 0xd0, 0x68, 0x3e, 0x80, 0x2f, 0x0c, 0xa9, 0xfe, 0x64, 0x53, 0x69, 0x7a,
]);

export class CryptError extends Error {
  constructor(code) { super(code); this.code = code; }
}

const concat = (...parts) => {
  const n = parts.reduce((a, p) => a + p.length, 0);
  const out = new Uint8Array(n);
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
};

// ---------------------------------------------------------------- MD5 (RFC 1321)
const S = [7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20,
  4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21];
const K = Array.from({ length: 64 }, (_, i) => Math.floor(Math.abs(Math.sin(i + 1)) * 2 ** 32) >>> 0);

export function md5(msg) {
  const ml = msg.length;
  const total = (((ml + 8) >> 6) + 1) * 64;
  const m = new Uint8Array(total);
  m.set(msg);
  m[ml] = 0x80;
  const bitLen = ml * 8;
  m[total - 8] = bitLen & 255;
  m[total - 7] = (bitLen >>> 8) & 255;
  m[total - 6] = (bitLen >>> 16) & 255;
  m[total - 5] = (bitLen >>> 24) & 255;
  m[total - 4] = Math.floor(bitLen / 2 ** 32) & 255;
  let a0 = 0x67452301, b0 = 0xefcdab89, c0 = 0x98badcfe, d0 = 0x10325476;
  const w = new Uint32Array(16);
  for (let off = 0; off < total; off += 64) {
    for (let i = 0; i < 16; i++) w[i] = m[off + i * 4] | (m[off + i * 4 + 1] << 8) | (m[off + i * 4 + 2] << 16) | (m[off + i * 4 + 3] << 24);
    let a = a0, b = b0, c = c0, d = d0;
    for (let i = 0; i < 64; i++) {
      let f, g;
      if (i < 16) { f = (b & c) | (~b & d); g = i; }
      else if (i < 32) { f = (d & b) | (~d & c); g = (5 * i + 1) % 16; }
      else if (i < 48) { f = b ^ c ^ d; g = (3 * i + 5) % 16; }
      else { f = c ^ (b | ~d); g = (7 * i) % 16; }
      const tmp = d;
      d = c;
      c = b;
      const x = (a + f + K[i] + w[g]) >>> 0;
      b = (b + ((x << S[i]) | (x >>> (32 - S[i])))) >>> 0;
      a = tmp;
    }
    a0 = (a0 + a) >>> 0; b0 = (b0 + b) >>> 0; c0 = (c0 + c) >>> 0; d0 = (d0 + d) >>> 0;
  }
  const out = new Uint8Array(16);
  [a0, b0, c0, d0].forEach((v, i) => { for (let k = 0; k < 4; k++) out[i * 4 + k] = (v >>> (8 * k)) & 255; });
  return out;
}

export function rc4(key, data) {
  const s = new Uint8Array(256);
  for (let i = 0; i < 256; i++) s[i] = i;
  for (let i = 0, j = 0; i < 256; i++) {
    j = (j + s[i] + key[i % key.length]) & 255;
    [s[i], s[j]] = [s[j], s[i]];
  }
  const out = new Uint8Array(data.length);
  for (let k = 0, i = 0, j = 0; k < data.length; k++) {
    i = (i + 1) & 255;
    j = (j + s[i]) & 255;
    [s[i], s[j]] = [s[j], s[i]];
    out[k] = data[k] ^ s[(s[i] + s[j]) & 255];
  }
  return out;
}

// ---------------------------------------------------------------- WebCrypto helpers
const subtle = () => {
  const s = globalThis.crypto?.subtle;
  if (!s) throw new CryptError('encrypted-unsupported');
  return s;
};
const sha = async (name, data) => new Uint8Array(await subtle().digest(name, data));

async function aesCbcDecrypt(key, iv, ct) {
  const k = await subtle().importKey('raw', key, 'AES-CBC', false, ['decrypt']);
  try {
    return new Uint8Array(await subtle().decrypt({ name: 'AES-CBC', iv }, k, ct));
  } catch {
    return null; // bad padding: caller decides
  }
}

/** AES-CBC without padding, which WebCrypto does not offer directly. */
async function aesCbcNoPad(key, iv, data, decrypt) {
  const s = subtle();
  if (!decrypt) {
    const k = await s.importKey('raw', key, 'AES-CBC', false, ['encrypt']);
    const enc = new Uint8Array(await s.encrypt({ name: 'AES-CBC', iv }, k, data));
    return enc.subarray(0, data.length); // drop the padding block
  }
  // Append a block that decrypts to a valid 16x0x10 padding block.
  const kE = await s.importKey('raw', key, 'AES-CBC', false, ['encrypt']);
  const lastBlock = data.subarray(data.length - 16);
  const padBlock = new Uint8Array(await s.encrypt({ name: 'AES-CBC', iv: lastBlock }, kE, new Uint8Array(16).fill(16))).subarray(0, 16);
  const kD = await s.importKey('raw', key, 'AES-CBC', false, ['decrypt']);
  return new Uint8Array(await s.decrypt({ name: 'AES-CBC', iv }, kD, concat(data, padBlock)));
}

// ISO 32000-2 algorithm 2.B (R6 hash)
async function hash2B(password, salt, udata) {
  let k = await sha('SHA-256', concat(password, salt, udata));
  let e = new Uint8Array(0);
  let i = 0;
  while (i < 64 || e[e.length - 1] > i - 32) {
    const k1 = concat(password, k, udata);
    const rep = new Uint8Array(k1.length * 64);
    for (let r = 0; r < 64; r++) rep.set(k1, r * k1.length);
    e = await aesCbcNoPad(k.subarray(0, 16), k.subarray(16, 32), rep, false);
    let sum = 0;
    for (let j = 0; j < 16; j++) sum += e[j];
    const alg = ['SHA-256', 'SHA-384', 'SHA-512'][sum % 3];
    k = await sha(alg, e);
    i++;
  }
  return k.subarray(0, 32);
}

const bytes = (v) => {
  if (v instanceof Uint8Array) return v;
  const s = v?.s ?? '';
  const u = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i) & 255;
  return u;
};

/**
 * Build a decryptor from the resolved /Encrypt dictionary and the first /ID
 * string. Throws CryptError('encrypted-password') when an open password is
 * needed, CryptError('encrypted-unsupported') for anything else.
 */
export async function makeDecryptor(enc, id0) {
  const filter = enc.Filter?.n;
  if (filter && filter !== 'Standard') throw new CryptError('encrypted-unsupported');
  const V = enc.V | 0, R = enc.R | 0;
  const O = bytes(enc.O), U = bytes(enc.U);
  const id = bytes(id0);

  let method = 'rc4'; // for streams
  let strMethod = 'rc4';
  let fileKey;

  if (V === 5 || R >= 5) {
    method = strMethod = 'aes256';
    const empty = new Uint8Array(0);
    const vSalt = U.subarray(32, 40), kSalt = U.subarray(40, 48);
    const check = R === 5 ? await sha('SHA-256', concat(empty, vSalt)) : await hash2B(empty, vSalt, empty);
    if (!check.every((b, i) => b === U[i])) throw new CryptError('encrypted-password');
    const ik = R === 5 ? await sha('SHA-256', concat(empty, kSalt)) : await hash2B(empty, kSalt, empty);
    fileKey = await aesCbcNoPad(ik, new Uint8Array(16), bytes(enc.UE).subarray(0, 32), true);
  } else {
    if (![1, 2, 4].includes(V)) throw new CryptError('encrypted-unsupported');
    let n = V === 1 ? 5 : Math.max(5, Math.min(16, Math.floor((enc.Length || 40) / 8)));
    if (V === 4) {
      n = 16;
      const cfm = (name) => {
        if (!name || name === 'Identity') return 'none';
        const cf = enc.CF?.[name];
        const m = cf?.CFM?.n;
        if (m === 'AESV2') return 'aes128';
        if (m === 'V2') return 'rc4';
        if (!m || m === 'None') return 'none';
        throw new CryptError('encrypted-unsupported');
      };
      method = cfm(enc.StmF?.n);
      strMethod = cfm(enc.StrF?.n);
    }
    const P = (enc.P | 0) >>> 0;
    const pBytes = Uint8Array.of(P & 255, (P >>> 8) & 255, (P >>> 16) & 255, (P >>> 24) & 255);
    const meta = R >= 4 && enc.EncryptMetadata === false ? Uint8Array.of(255, 255, 255, 255) : new Uint8Array(0);
    let h = md5(concat(PAD, O.subarray(0, 32), pBytes, id, meta));
    if (R >= 3) for (let i = 0; i < 50; i++) h = md5(h.subarray(0, n));
    fileKey = h.subarray(0, n);
    // Algorithm 6: does the empty user password open the file?
    let ok;
    if (R === 2) {
      const u = rc4(fileKey, PAD);
      ok = u.every((b, i) => b === U[i]);
    } else {
      let x = rc4(fileKey, md5(concat(PAD, id)));
      for (let i = 1; i <= 19; i++) x = rc4(fileKey.map((b) => b ^ i), x);
      ok = x.subarray(0, 16).every((b, i) => b === U[i]);
    }
    if (!ok) throw new CryptError('encrypted-password');
  }

  const objKey = (num, gen, aes) => {
    const k = concat(fileKey, Uint8Array.of(num & 255, (num >> 8) & 255, (num >> 16) & 255, gen & 255, (gen >> 8) & 255),
      aes ? Uint8Array.of(0x73, 0x41, 0x6c, 0x54) : new Uint8Array(0));
    return md5(k).subarray(0, Math.min(fileKey.length + 5, 16));
  };

  const run = async (m, data, num, gen) => {
    if (m === 'none') return data;
    if (m === 'rc4') return rc4(objKey(num, gen, false), data);
    if (data.length < 32) return new Uint8Array(0);
    const key = m === 'aes256' ? fileKey : objKey(num, gen, true);
    const iv = data.subarray(0, 16);
    let ct = data.subarray(16);
    ct = ct.subarray(0, ct.length - (ct.length % 16));
    const plain = await aesCbcDecrypt(key, iv, ct);
    if (plain) return plain;
    // Bad padding (seen in the wild): decrypt without removing it.
    return aesCbcNoPad(key, iv, ct, true).catch(() => new Uint8Array(0));
  };

  return {
    stream: (data, num, gen) => run(method, data, num, gen),
    string: (data, num, gen) => run(strMethod, data, num, gen),
  };
}
