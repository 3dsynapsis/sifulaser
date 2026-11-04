// A ZIP with no compression. PDFs are compressed already, so storing them costs
// nothing, and this is small enough not to need a library.

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/**
 * @param files [{ name, data: Uint8Array }]
 * @returns {Uint8Array} the whole archive
 */
export function makeZip(files, when = new Date()) {
  const encoder = new TextEncoder();
  const dosTime = (when.getHours() << 11) | (when.getMinutes() << 5) | (when.getSeconds() >> 1);
  const dosDate = ((when.getFullYear() - 1980) << 9) | ((when.getMonth() + 1) << 5) | when.getDate();

  const entries = files.map((f) => ({
    name: encoder.encode(f.name),
    data: f.data,
    crc: crc32(f.data),
  }));

  const LOCAL = 30;
  const CENTRAL = 46;
  const END = 22;
  let size = END;
  for (const e of entries) size += LOCAL + CENTRAL + 2 * e.name.length + e.data.length;

  const out = new Uint8Array(size);
  const view = new DataView(out.buffer);
  let at = 0;
  const u16 = (v) => { view.setUint16(at, v, true); at += 2; };
  const u32 = (v) => { view.setUint32(at, v, true); at += 4; };
  const put = (bytes) => { out.set(bytes, at); at += bytes.length; };
  // Version 2.0, bit 11 (names are UTF-8), no compression, then time and date.
  const common = (e) => {
    u16(20); u16(0x0800); u16(0); u16(dosTime); u16(dosDate);
    u32(e.crc); u32(e.data.length); u32(e.data.length);
    u16(e.name.length); u16(0);
  };

  for (const e of entries) {
    e.offset = at;
    u32(0x04034b50);
    common(e);
    put(e.name);
    put(e.data);
  }
  const directoryAt = at;
  for (const e of entries) {
    u32(0x02014b50);
    u16(20);
    common(e);
    u16(0); u16(0); u16(0); u32(0);
    u32(e.offset);
    put(e.name);
  }
  const directorySize = at - directoryAt;
  u32(0x06054b50);
  u16(0); u16(0);
  u16(entries.length); u16(entries.length);
  u32(directorySize); u32(directoryAt);
  u16(0);
  return out;
}
