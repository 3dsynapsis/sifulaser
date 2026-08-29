// A QR Code encoder. Byte mode, versions 1-40, levels L/M/Q/H, written out here
// rather than pulled in, because this family of tools carries no dependencies.
//
// Follows ISO/IEC 18004. The parts that are not obvious from the code:
//
//   - Only byte mode is implemented. Numeric and alphanumeric modes pack tighter
//     for their own alphabets, but a QR on a keyring is nearly always a URL, and
//     a URL contains lower case and a colon, so it falls out of the alphanumeric
//     set on the first character. One mode that always works beats three modes
//     and a segmenter that would only ever pay off for a phone number.
//
//   - Text is encoded as UTF-8 with no ECI header. That is what every real
//     generator does and what every scanner expects; declaring ECI 26 is
//     technically the correct thing and is understood by fewer readers.
//
// The grid this produces is indexed [row][col] with row 0 at the TOP. That is
// upside down relative to the millimetres everywhere else in this tool, and it
// is deliberate: every table in the specification, and every diagram anybody
// will check this against, counts rows downward from the top left. The flip to
// y-up happens once, in tag.js, where the modules become rectangles.

export const ECC_LEVELS = [
  // formatBits is the two-bit code that goes into the format information. It is
  // NOT the order the levels are usually listed in - L is 01 and M is 00 - so it
  // has to be carried explicitly rather than derived from an index.
  { id: 'L', name: 'L', formatBits: 1, recovers: 7 },
  { id: 'M', name: 'M', formatBits: 0, recovers: 15 },
  { id: 'Q', name: 'Q', formatBits: 3, recovers: 25 },
  { id: 'H', name: 'H', formatBits: 2, recovers: 30 },
];

export const ECL_IDS = ECC_LEVELS.map((e) => e.id);

/** The level the tool falls back to. Also tag.js's default, deliberately. */
export const DEFAULT_ECL = 'M';

export const isEcl = (id) => ECL_IDS.includes(id);

// An unrecognised id resolves to M, not to index 0. Index 0 is L, the weakest
// level there is, so a typo used to quietly hand back the least protection - the
// opposite of what anybody typing a level wants. encodeQR complains about the
// typo as well; this is only the floor under everything else that calls eclOf.
const eclIndex = (id) => {
  const i = ECL_IDS.indexOf(id);
  return i >= 0 ? i : ECL_IDS.indexOf(DEFAULT_ECL);
};
export const eclOf = (id) => ECC_LEVELS[eclIndex(id)];

export const MIN_VERSION = 1;
export const MAX_VERSION = 40;

/** Side of the grid in modules. Version 1 is 21, and every version adds 4. */
export const moduleCount = (version) => version * 4 + 17;

// Error-correction codewords per block, indexed [level][version]. Straight out
// of the specification's table 13-22; there is no formula behind it.
const ECC_PER_BLOCK = {
  L: [-1, 7, 10, 15, 20, 26, 18, 20, 24, 30, 18, 20, 24, 26, 30, 22, 24, 28, 30, 28,
    28, 28, 28, 30, 30, 26, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
  M: [-1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26,
    26, 26, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28],
  Q: [-1, 13, 22, 18, 26, 18, 24, 18, 22, 20, 24, 28, 26, 24, 20, 30, 24, 28, 28, 26,
    30, 28, 30, 30, 30, 30, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
  H: [-1, 17, 28, 22, 16, 22, 28, 26, 26, 24, 28, 24, 28, 22, 24, 24, 30, 28, 28, 26,
    28, 30, 24, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
};

// How many blocks the data is split into, indexed [level][version]. Splitting is
// what makes the recovery rate hold: a burst of damage that would swamp one
// block's correction budget is spread over several after interleaving.
//
// A wrong entry here is invisible from inside: the grid still looks exactly like
// a QR code and only a conforming scanner ever finds out. Nothing in the encoder
// cross-checks it, so the guard lives in the tests - the whole 40x4 grid of data
// codeword counts is pinned against the published table, and the decode test
// works the layout out from Reed-Solomon syndromes rather than reading it back
// out of here.
const NUM_BLOCKS = {
  L: [-1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 4, 4, 4, 4, 4, 6, 6, 6, 6, 7,
    8, 8, 9, 9, 10, 12, 12, 12, 13, 14, 15, 16, 17, 18, 19, 19, 20, 21, 22, 24, 25],
  M: [-1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14,
    16, 17, 17, 18, 20, 21, 23, 25, 26, 28, 29, 31, 33, 35, 37, 38, 40, 43, 45, 47, 49],
  Q: [-1, 1, 1, 2, 2, 4, 4, 6, 6, 8, 8, 8, 10, 12, 16, 12, 17, 16, 18, 21,
    20, 23, 23, 25, 27, 29, 34, 34, 35, 38, 40, 43, 45, 48, 51, 53, 56, 59, 62, 65, 68],
  H: [-1, 1, 1, 2, 4, 4, 4, 5, 6, 8, 8, 11, 11, 16, 16, 18, 16, 19, 21, 25,
    25, 25, 34, 30, 32, 35, 37, 40, 42, 45, 48, 51, 54, 57, 60, 63, 66, 70, 74, 77, 81],
};

// ---------------------------------------------------------------------------
// GF(256), the field the Reed-Solomon arithmetic lives in.
//
// The QR standard fixes the primitive polynomial at x^8+x^4+x^3+x^2+1 (0x11D)
// and the generator element at 2. Multiplication becomes adding logarithms, so
// both tables are built once at load. EXP is doubled in length so a sum of two
// logarithms, which can reach 508, can be looked up without a modulo.
const EXP = new Uint8Array(512);
const LOG = new Uint8Array(256);
{
  let x = 1;
  for (let i = 0; i < 255; i++) {
    EXP[i] = x;
    LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
}

const gfMul = (a, b) => (a === 0 || b === 0 ? 0 : EXP[LOG[a] + LOG[b]]);

/**
 * The divisor polynomial (x - a^0)(x - a^1)...(x - a^(degree-1)).
 *
 * Stored highest power first with the leading 1 left out: the product is always
 * monic, so carrying that coefficient would only ever be a 1 that the division
 * below skips over anyway.
 */
export function rsGenerator(degree) {
  const result = new Uint8Array(degree);
  result[degree - 1] = 1;
  let root = 1;
  for (let i = 0; i < degree; i++) {
    for (let j = 0; j < degree; j++) {
      result[j] = gfMul(result[j], root);
      if (j + 1 < degree) result[j] ^= result[j + 1];
    }
    root = gfMul(root, 2);
  }
  return result;
}

/** Polynomial remainder of data * x^degree divided by the generator. */
export function rsRemainder(data, generator) {
  const result = new Uint8Array(generator.length);
  for (const b of data) {
    const factor = b ^ result[0];
    result.copyWithin(0, 1);
    result[result.length - 1] = 0;
    for (let i = 0; i < result.length; i++) result[i] ^= gfMul(generator[i], factor);
  }
  return result;
}

// ---------------------------------------------------------------------------
// Capacity

/**
 * Modules a version has left over for data and error correction, in bits.
 *
 * Total area minus the function patterns. The alignment term subtracts the
 * 5x5 markers but adds back the overlap where they sit on the timing patterns,
 * which is why it is a quadratic rather than a count times 25.
 */
export function rawDataModules(version) {
  let result = (16 * version + 128) * version + 64;
  if (version >= 2) {
    const n = Math.floor(version / 7) + 2;
    result -= (25 * n - 10) * n - 55;
    if (version >= 7) result -= 36; // the two version-information blocks
  }
  return result;
}

export function dataCodewords(version, ecl) {
  const e = eclOf(ecl).id;
  return Math.floor(rawDataModules(version) / 8)
    - ECC_PER_BLOCK[e][version] * NUM_BLOCKS[e][version];
}

/**
 * Bits the character count field takes in byte mode.
 *
 * It jumps at version 10 because a single byte can only count 255 characters
 * and version 10 can already hold more than that.
 */
export const charCountBits = (version) => (version < 10 ? 8 : 16);

/** How many UTF-8 bytes fit, allowing for the mode and count headers. */
export function capacityBytes(version, ecl) {
  const bits = dataCodewords(version, ecl) * 8 - 4 - charCountBits(version);
  return Math.max(0, Math.floor(bits / 8));
}

/** UTF-8, written out so this module works the same in node and the browser. */
export function utf8Bytes(text) {
  const out = [];
  for (const ch of String(text)) {
    const c = ch.codePointAt(0);
    if (c < 0x80) out.push(c);
    else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 63));
    else if (c < 0x10000) {
      out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    } else {
      out.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 63),
        0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    }
  }
  return out;
}

/** Smallest version that holds `len` bytes at this level, or 0 if none does. */
export function smallestVersion(len, ecl, min = MIN_VERSION) {
  for (let v = Math.max(MIN_VERSION, min); v <= MAX_VERSION; v++) {
    if (capacityBytes(v, ecl) >= len) return v;
  }
  return 0;
}

// ---------------------------------------------------------------------------
// Bit assembly

function buildDataCodewords(bytes, version, ecl) {
  const bits = [];
  const push = (value, n) => {
    for (let i = n - 1; i >= 0; i--) bits.push((value >>> i) & 1);
  };
  push(0b0100, 4);                          // byte mode
  push(bytes.length, charCountBits(version));
  for (const b of bytes) push(b, 8);

  const capacity = dataCodewords(version, ecl) * 8;
  // Terminator: up to four zeros, but only as many as there is room for.
  push(0, Math.min(4, capacity - bits.length));
  push(0, (8 - (bits.length % 8)) % 8);
  // Alternating pad bytes, fixed by the standard. Their only job is to fill the
  // remaining codewords with something that is not a long run of one colour.
  for (let i = 0; bits.length < capacity; i++) push(i % 2 === 0 ? 0xec : 0x11, 8);

  const out = new Uint8Array(bits.length / 8);
  bits.forEach((bit, i) => { out[i >>> 3] |= bit << (7 - (i & 7)); });
  return out;
}

/**
 * How a version's codewords are cut up: block count, error-correction codewords
 * per block, and the length of a short block.
 *
 * Exported because the interleave is the one step nothing else can see the
 * result of - the tests read the grid back apart with it.
 */
export function blockLayout(version, ecl) {
  const e = eclOf(ecl).id;
  const numBlocks = NUM_BLOCKS[e][version];
  const eccLen = ECC_PER_BLOCK[e][version];
  const rawCodewords = Math.floor(rawDataModules(version) / 8);
  return {
    numBlocks,
    eccLen,
    rawCodewords,
    numShort: numBlocks - (rawCodewords % numBlocks),
    shortLen: Math.floor(rawCodewords / numBlocks),
  };
}

/**
 * Split into blocks, compute each block's error correction, then interleave.
 *
 * Interleaving is the point of the exercise. Laid out block by block, a coffee
 * ring over one corner would destroy one block entirely and no amount of parity
 * in the others would help. Taking one codeword from each block in turn spreads
 * any local damage evenly across every block's correction budget.
 *
 * Blocks come in two lengths - the short ones first - because the codewords
 * rarely divide evenly by the block count.
 *
 * The data and the error correction are interleaved as two SEPARATE passes, and
 * that is the whole subtlety. Every block holds its data followed by its parity,
 * but the two halves have different lengths: the data half is one codeword
 * longer in the long blocks, while the parity half is the same length in every
 * block. Walking the blocks with one index across both halves therefore lines up
 * a long block's last data codeword against a short block's first parity
 * codeword, which is not the same column at all. Two passes have no such index
 * to get wrong, and between them they emit every codeword exactly once - which
 * is the invariant the test asserts.
 */
export function addEcc(data, version, ecl) {
  const { numBlocks, eccLen, rawCodewords, numShort, shortLen } = blockLayout(version, ecl);

  const gen = rsGenerator(eccLen);
  const dataParts = [];
  const eccParts = [];
  for (let i = 0, k = 0; i < numBlocks; i++) {
    const len = shortLen - eccLen + (i < numShort ? 0 : 1);
    const dat = data.subarray(k, k + len);
    k += len;
    dataParts.push(dat);
    eccParts.push(rsRemainder(dat, gen));
  }

  const out = new Uint8Array(rawCodewords);
  let n = 0;
  // Data first, column by column. The short blocks have run out by the last
  // column, so they simply contribute nothing to it.
  const longest = shortLen - eccLen + (numShort < numBlocks ? 1 : 0);
  for (let i = 0; i < longest; i++) {
    for (let j = 0; j < numBlocks; j++) {
      if (i < dataParts[j].length) out[n++] = dataParts[j][i];
    }
  }
  // Then all the parity, column by column. Every block has the same amount.
  for (let i = 0; i < eccLen; i++) {
    for (let j = 0; j < numBlocks; j++) out[n++] = eccParts[j][i];
  }
  return out;
}

// ---------------------------------------------------------------------------
// The grid

/**
 * Centre coordinates of the alignment patterns.
 *
 * The first is always at 6 and the last always at size-7. The ones between are
 * evenly spaced at an even step - alignment centres must land on a light module
 * of the timing pattern, which only happens at even coordinates. Version 32 is
 * the one case the even-step rule gets wrong, and the standard simply lists 26.
 */
export function alignmentPositions(version) {
  if (version === 1) return [];
  const n = Math.floor(version / 7) + 2;
  const size = moduleCount(version);
  const step = version === 32 ? 26
    : Math.ceil((version * 4 + 4) / (n * 2 - 2)) * 2;
  const result = [6];
  for (let pos = size - 7; result.length < n; pos -= step) result.splice(1, 0, pos);
  return result;
}

function blankGrid(size) {
  const grid = [];
  for (let y = 0; y < size; y++) grid.push(new Array(size).fill(false));
  return grid;
}

function drawFunctionPatterns(grid, fn, version, size) {
  const set = (x, y, dark) => {
    if (x < 0 || y < 0 || x >= size || y >= size) return;
    grid[y][x] = dark;
    fn[y][x] = true;
  };

  // Timing patterns first, so the finders and alignment markers laid down after
  // them overwrite the stretches they pass through.
  for (let i = 0; i < size; i++) {
    set(6, i, i % 2 === 0);
    set(i, 6, i % 2 === 0);
  }

  // Finder pattern plus its separator: a 9x9 block whose modules are dark when
  // the Chebyshev distance from the centre is 2 or 4. The separator is the ring
  // at distance 4 that falls outside the 7x7 marker.
  const finder = (cx, cy) => {
    for (let dy = -4; dy <= 4; dy++) {
      for (let dx = -4; dx <= 4; dx++) {
        const d = Math.max(Math.abs(dx), Math.abs(dy));
        set(cx + dx, cy + dy, d !== 2 && d !== 4);
      }
    }
  };
  finder(3, 3);
  finder(size - 4, 3);
  finder(3, size - 4);

  // Alignment markers at every crossing of the position list, except the three
  // corners where a finder already is.
  const pos = alignmentPositions(version);
  for (let i = 0; i < pos.length; i++) {
    for (let j = 0; j < pos.length; j++) {
      const corner = (i === 0 && j === 0)
        || (i === 0 && j === pos.length - 1)
        || (i === pos.length - 1 && j === 0);
      if (corner) continue;
      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
          set(pos[i] + dx, pos[j] + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
        }
      }
    }
  }

  // Reserve the format area now; the real bits go in once the mask is chosen.
  drawFormatBits(grid, fn, 0, 0, size, true);
  if (version >= 7) drawVersionBits(grid, fn, version, size);
}

/**
 * Format information: level and mask, protected by a BCH(15,5) code and then
 * masked with 0x5412.
 *
 * The final XOR is what stops the all-zero format (level M, mask 0) from being
 * fifteen light modules, which a reader would have no way of locating.
 *
 * Two copies are written, split around the top-left finder and repeated along
 * the other two, so losing one corner does not lose the format.
 */
export function formatBits(eclId, mask) {
  const data = (eclOf(eclId).formatBits << 3) | mask;
  let rem = data;
  for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
  return ((data << 10) | rem) ^ 0x5412;
}

function drawFormatBits(grid, fn, eclId, mask, size, reserveOnly = false) {
  const bits = reserveOnly ? 0 : formatBits(eclId, mask);
  const bit = (i) => !reserveOnly && ((bits >>> i) & 1) !== 0;
  const set = (x, y, dark) => { grid[y][x] = dark; fn[y][x] = true; };

  for (let i = 0; i <= 5; i++) set(8, i, bit(i));
  set(8, 7, bit(6));
  set(8, 8, bit(7));
  set(7, 8, bit(8));
  for (let i = 9; i < 15; i++) set(14 - i, 8, bit(i));

  for (let i = 0; i < 8; i++) set(size - 1 - i, 8, bit(i));
  for (let i = 8; i < 15; i++) set(8, size - 15 + i, bit(i));
  // The one module that is dark in every valid code, and the reason a reader
  // can tell a QR grid from an arbitrary black-and-white pattern.
  set(8, size - 8, true);
}

/** Version information: six bits and a BCH(18,6) remainder, from version 7 up. */
export function versionBits(version) {
  let rem = version;
  for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
  return (version << 12) | rem;
}

function drawVersionBits(grid, fn, version, size) {
  const bits = versionBits(version);
  for (let i = 0; i < 18; i++) {
    const dark = ((bits >>> i) & 1) !== 0;
    const a = size - 11 + (i % 3);
    const b = Math.floor(i / 3);
    grid[b][a] = dark; fn[b][a] = true;
    grid[a][b] = dark; fn[a][b] = true;
  }
}

/**
 * Lay the codewords into the grid.
 *
 * Two-module-wide columns from the right edge leftwards, each column read in
 * the opposite direction to the one before, skipping anything a function
 * pattern already owns. Column 6 is skipped outright because the vertical
 * timing pattern occupies it and shifting past it keeps every remaining column
 * a clean pair.
 */
function drawCodewords(grid, fn, data, size) {
  let i = 0;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vert = 0; vert < size; vert++) {
      for (let j = 0; j < 2; j++) {
        const x = right - j;
        const upward = ((right + 1) & 2) === 0;
        const y = upward ? size - 1 - vert : vert;
        if (!fn[y][x] && i < data.length * 8) {
          grid[y][x] = ((data[i >>> 3] >>> (7 - (i & 7))) & 1) !== 0;
          i++;
        }
      }
    }
  }
  // Any modules left over past the last codeword stay light. The standard calls
  // these remainder bits and they carry nothing.
}

/** The eight mask conditions. A module flips where its condition is true. */
export const MASKS = [
  (x, y) => (x + y) % 2 === 0,
  (x, y) => y % 2 === 0,
  (x) => x % 3 === 0,
  (x, y) => (x + y) % 3 === 0,
  (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0,
  (x, y) => ((x * y) % 2) + ((x * y) % 3) === 0,
  (x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0,
  (x, y) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0,
];

function applyMask(grid, fn, mask, size) {
  const f = MASKS[mask];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (!fn[y][x] && f(x, y)) grid[y][x] = !grid[y][x];
    }
  }
}

// ---------------------------------------------------------------------------
// Penalty scoring
//
// Masking exists to break up the patterns that confuse a reader, and the four
// rules are the specification's measure of how badly a given mask failed. All
// eight are tried and the lowest score wins; nothing about the data predicts
// which one it will be.

const N1 = 3; // a run of five or more same-coloured modules
const N2 = 3; // a 2x2 block of one colour
const N3 = 40; // a 1:1:3:1:1 run, which looks like a finder pattern
const N4 = 10; // every 5% the dark/light balance strays from half

/**
 * Count 1:1:3:1:1 runs at either end of the last seven runs.
 *
 * The four-unit light margin on the outside is what separates a real finder
 * from ordinary striping, so it is required on whichever side the pattern is
 * claimed to end.
 */
function finderPatterns(history) {
  const n = history[1];
  const core = n > 0 && history[2] === n && history[3] === n * 3
    && history[4] === n && history[5] === n;
  return (core && history[0] >= n * 4 && history[6] >= n ? 1 : 0)
    + (core && history[6] >= n * 4 && history[0] >= n ? 1 : 0);
}

function addHistory(runLength, history, size) {
  // The very first run in a line is preceded by the quiet zone, so it counts as
  // having four modules of light in front of it whatever it actually starts with.
  if (history[0] === 0) runLength += size;
  history.pop();
  history.unshift(runLength);
}

function terminateAndCount(runColor, runLength, history, size) {
  let len = runLength;
  if (runColor) { addHistory(len, history, size); len = 0; }
  len += size; // the quiet zone past the end of the line
  addHistory(len, history, size);
  return finderPatterns(history);
}

export function penaltyScore(grid) {
  const size = grid.length;
  let result = 0;

  for (let y = 0; y < size; y++) {
    let color = false;
    let run = 0;
    const history = [0, 0, 0, 0, 0, 0, 0];
    for (let x = 0; x < size; x++) {
      if (grid[y][x] === color) {
        run++;
        if (run === 5) result += N1;
        else if (run > 5) result++;
      } else {
        addHistory(run, history, size);
        if (!color) result += finderPatterns(history) * N3;
        color = grid[y][x];
        run = 1;
      }
    }
    result += terminateAndCount(color, run, history, size) * N3;
  }
  for (let x = 0; x < size; x++) {
    let color = false;
    let run = 0;
    const history = [0, 0, 0, 0, 0, 0, 0];
    for (let y = 0; y < size; y++) {
      if (grid[y][x] === color) {
        run++;
        if (run === 5) result += N1;
        else if (run > 5) result++;
      } else {
        addHistory(run, history, size);
        if (!color) result += finderPatterns(history) * N3;
        color = grid[y][x];
        run = 1;
      }
    }
    result += terminateAndCount(color, run, history, size) * N3;
  }

  for (let y = 0; y < size - 1; y++) {
    for (let x = 0; x < size - 1; x++) {
      const c = grid[y][x];
      if (c === grid[y][x + 1] && c === grid[y + 1][x] && c === grid[y + 1][x + 1]) {
        result += N2;
      }
    }
  }

  let dark = 0;
  for (const row of grid) for (const c of row) if (c) dark++;
  const total = size * size;
  // k is how many whole 5% steps the dark proportion is away from the 45-55%
  // band, worked out without floating point.
  const k = Math.ceil(Math.abs(dark * 20 - total * 10) / total) - 1;
  return result + k * N4;
}

// ---------------------------------------------------------------------------

/**
 * Encode `text` and return the finished module grid.
 *
 * `version` of 0 means the smallest that fits, which is what anybody wants
 * unless they are matching an existing code. Pinning a version that is too
 * small is reported rather than obeyed - a code that cannot hold the link is
 * not a code. So is a version outside 1..40, or a level that is not one of the
 * four: bad input of either kind still produces a working code, but silently
 * substituting for it is how somebody ends up burning a sheet at level L
 * believing they asked for H.
 *
 * `boost` spends leftover capacity on a stronger error-correction level. It can
 * only ever move up within the version already chosen, so it never costs a
 * millimetre of module size; on an engraved code, where a scratch or a scorch
 * mark takes out real modules, that headroom is free insurance.
 */
export function encodeQR(text, options = {}) {
  const o = { ecl: DEFAULT_ECL, version: 0, boost: true, mask: -1, ...options };
  const requested = eclOf(o.ecl).id;
  const bytes = utf8Bytes(text ?? '');
  const complaints = [];

  if (!isEcl(o.ecl)) {
    complaints.push(`${JSON.stringify(o.ecl)} is not an error-correction level; `
      + `using ${requested}. The levels are ${ECL_IDS.join(', ')}.`);
  }

  // A pinned version is only honoured when it is a whole number in range.
  // Everything else - 41, -3, NaN - falls through to the automatic choice and
  // says so. Only 0 passes in silence, because 0 is how the caller asks for
  // automatic in the first place; the rest are mistakes, and a pinned version
  // that is merely too SMALL already complains, so the same class of mistake
  // gets the same treatment.
  const asked = Number(o.version ?? 0);
  const pinned = Number.isFinite(asked) ? Math.round(asked) : 0;
  const usable = pinned >= MIN_VERSION && pinned <= MAX_VERSION;
  if (!usable && asked !== 0) {
    complaints.push(`There is no version ${Number.isFinite(asked) ? pinned : o.version}; `
      + `versions run from ${MIN_VERSION} to ${MAX_VERSION}. Choosing one to fit.`);
  }

  if (!bytes.length) return { empty: true, reason: 'empty', bytes: 0 };

  let version = smallestVersion(bytes.length, requested);
  if (!version) {
    return {
      empty: true,
      reason: 'too-long',
      bytes: bytes.length,
      limit: capacityBytes(MAX_VERSION, requested),
    };
  }
  if (usable) {
    if (pinned >= version) version = pinned;
    else {
      complaints.push(`Version ${pinned} only holds ${capacityBytes(pinned, requested)} `
        + `bytes at level ${requested}; using version ${version}.`);
    }
  }

  let ecl = requested;
  if (o.boost) {
    for (const cand of ECC_LEVELS) {
      if (cand.recovers > eclOf(ecl).recovers
        && capacityBytes(version, cand.id) >= bytes.length) ecl = cand.id;
    }
  }

  const size = moduleCount(version);
  const codewords = addEcc(buildDataCodewords(bytes, version, ecl), version, ecl);

  const grid = blankGrid(size);
  const fn = blankGrid(size);
  drawFunctionPatterns(grid, fn, version, size);
  drawCodewords(grid, fn, codewords, size);

  // Try every mask and keep the best. The format bits are rewritten each time
  // because they encode the mask number, and they are inside the scored area.
  let bestMask = o.mask;
  if (!(bestMask >= 0 && bestMask <= 7)) {
    let best = Infinity;
    for (let m = 0; m < 8; m++) {
      applyMask(grid, fn, m, size);
      drawFormatBits(grid, fn, ecl, m, size);
      const score = penaltyScore(grid);
      if (score < best) { best = score; bestMask = m; }
      applyMask(grid, fn, m, size); // masking twice restores the grid
    }
  }
  applyMask(grid, fn, bestMask, size);
  drawFormatBits(grid, fn, ecl, bestMask, size);

  let dark = 0;
  for (const row of grid) for (const c of row) if (c) dark++;

  return {
    empty: false,
    grid,
    size,
    version,
    ecl,
    requestedEcl: requested,
    boosted: ecl !== requested,
    mask: bestMask,
    bytes: bytes.length,
    capacity: capacityBytes(version, ecl),
    dark,
    // Things the caller asked for that could not be honoured. Named apart from
    // the good news the tag builder reports, because these are refusals.
    complaints,
  };
}
