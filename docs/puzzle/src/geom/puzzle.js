// Jigsaw cut-line generator.
//
// The knob shape and the random walk are ported from Draradech's generator
// (https://draradech.github.io/jigsaw/jigsaw.html) so the same seed reproduces
// the same puzzle. Each edge between two pieces is three cubic Beziers; the
// middle pair forms the head, the outer pair the shoulders.
//
// The one thing that makes the pieces actually fit is that a whole row is drawn
// as ONE continuous path: `a` picks up where the previous edge's `e` left off,
// negated when the tab flips. Two neighbouring pieces therefore share the exact
// same curve rather than two curves that merely look alike.
//
// What we add on top of the reference:
//   * kerf - the beam eats material off both sides of every line, so the head
//     loses grip. We widen the head by the kerf to put the bite back. See
//     `gripComp` below for why offsetting the line itself cannot work.
//   * a risk check - past a certain tab + jitter the curves cross each other and
//     the file is scrap. The reference lets you slide straight into that.

/** Reference PRNG: deterministic, seeded, and cheap. */
function rng(seed) {
  let s = seed;
  const random = () => {
    const x = Math.sin(s) * 10000;
    s += 1;
    return x - Math.floor(x);
  };
  return {
    random,
    uniform: (min, max) => min + random() * (max - min),
    rbool: () => random() > 0.5,
  };
}

export const DEFAULTS = {
  width: 300,        // mm, the board the puzzle is cut from
  height: 200,       // mm
  cols: 15,
  rows: 10,
  tabSize: 20,       // % of the piece, 10-30 in the reference
  jitter: 4,         // % wander, 0-13 in the reference
  seed: 7688,
  cornerRadius: 2,   // mm, on the outer border
  kerf: 0.2,         // mm, beam width
  kerfComp: true,    // widen the head to keep the lock tight
};

/**
 * How much wider the head has to be, in mm, to survive the cut.
 *
 * The line between two pieces is shared, so offsetting it just steals from one
 * piece and gives to the other - it cannot add material that the beam removed.
 * What it can do is restore the mechanical lock: the knob shrinks by kerf/2 and
 * the socket it drops into grows by kerf/2, so the overhang that stops the piece
 * pulling out loses a full kerf. Widening the head by that much puts it back.
 */
export const gripComp = (p) => (p.kerfComp ? Math.max(0, p.kerf) : 0);

/**
 * Tab protrusion plus jitter, as a fraction of the piece. Past 0.5 the tab
 * reaches into the row beyond and the curves start crossing.
 */
export function riskFactor(p) {
  return 3 * (p.tabSize / 200) + p.jitter / 100;
}

export function riskLevel(p) {
  const r = riskFactor(p);
  if (r > 0.5) return 'danger';
  if (r > 0.45) return 'warn';
  return 'ok';
}

const r2 = (v) => Math.round(v * 100) / 100;

/**
 * Build the two interior line sets and the border.
 * Returns { h, v, border } as SVG path data in millimetres, origin top-left.
 */
export function buildPuzzle(input = {}) {
  const p = { ...DEFAULTS, ...input };
  const width = Math.max(10, p.width);
  const height = Math.max(10, p.height);
  const xn = Math.max(1, Math.round(p.cols));
  const yn = Math.max(1, Math.round(p.rows));
  const t = p.tabSize / 200;
  const j = p.jitter / 100;
  const grip = gripComp(p);

  // One stream for both passes, horizontal first - the reference runs gen_dh
  // then gen_dv off the same running seed, so re-seeding the vertical pass
  // would hand it the horizontal pass's flips and the two would correlate.
  const { uniform, rbool } = rng(p.seed);

  const gen = (vertical) => {
    let a; let b; let c; let d; let e; let flip;

    const next = () => {
      const flipold = flip;
      flip = rbool();
      a = flip === flipold ? -e : e;
      b = uniform(-j, j);
      c = uniform(-j, j);
      d = uniform(-j, j);
      e = uniform(-j, j);
    };
    const first = () => { e = uniform(-j, j); next(); };

    let xi = 0;
    let yi = 0;
    const sl = () => (vertical ? height / yn : width / xn);
    const sw = () => (vertical ? width / xn : height / yn);
    const ol = () => sl() * (vertical ? yi : xi);
    const ow = () => sw() * (vertical ? xi : yi);
    const l = (v) => r2(ol() + sl() * v);
    const w = (v) => r2(ow() + sw() * v * (flip ? -1 : 1));

    // Head half-width, in fractions of the piece length. The reference uses a
    // flat 2t; the kerf term is ours.
    const hw = () => 2 * t + grip / sl();

    // Emit one point pair in the right axis order - the vertical pass is the
    // horizontal one with length and width swapped.
    const pt = (lv, wv) => (vertical ? `${w(wv)} ${l(lv)}` : `${l(lv)} ${w(wv)}`);

    let str = '';
    const outer = vertical ? xn : yn;
    const inner = vertical ? yn : xn;

    for (let i = 1; i < outer; i++) {
      if (vertical) { xi = i; yi = 0; } else { yi = i; xi = 0; }
      first();
      str += `M ${pt(0, 0)} `;
      for (let k = 0; k < inner; k++) {
        if (vertical) yi = k; else xi = k;
        str += `C ${pt(0.2, a)} ${pt(0.5 + b + d, -t + c)} ${pt(0.5 - t + b, t + c)} `;
        str += `C ${pt(0.5 - hw() + b - d, 3 * t + c)} ${pt(0.5 + hw() + b - d, 3 * t + c)} ${pt(0.5 + t + b, t + c)} `;
        str += `C ${pt(0.5 + b + d, -t + c)} ${pt(0.8, e)} ${pt(1, 0)} `;
        next();
      }
    }
    return str;
  };

  const h = gen(false);
  const v = gen(true);

  return {
    params: { ...p, width, height, cols: xn, rows: yn },
    h,
    v,
    border: borderPath(width, height, p.cornerRadius),
    derived: {
      pieces: xn * yn,
      pieceW: width / xn,
      pieceH: height / yn,
      grip,
      risk: riskLevel(p),
      // Every interior line eats one kerf out of the assembled size.
      shrinkX: Math.max(0, xn - 1) * Math.max(0, p.kerf),
      shrinkY: Math.max(0, yn - 1) * Math.max(0, p.kerf),
    },
  };
}

/** Rounded rectangle, clockwise from just past the top-left corner. */
export function borderPath(width, height, radius) {
  const r = Math.max(0, Math.min(radius, width / 2, height / 2));
  if (r < 0.01) {
    return `M 0 0 L ${r2(width)} 0 L ${r2(width)} ${r2(height)} L 0 ${r2(height)} Z`;
  }
  const a = (x, y) => `A ${r2(r)} ${r2(r)} 0 0 1 ${r2(x)} ${r2(y)} `;
  return `M ${r2(r)} 0 L ${r2(width - r)} 0 ${a(width, r)}`
    + `L ${r2(width)} ${r2(height - r)} ${a(width - r, height)}`
    + `L ${r2(r)} ${r2(height)} ${a(0, height - r)}`
    + `L 0 ${r2(r)} ${a(r, 0)}`;
}
