// Which of the thirty-three faces to put in front of somebody naming a rehal,
// and in what order.
//
// The font data, the loader and the licence files are the ones the Keychain
// Generator and the Cake Topper already ship; nothing new was written and
// nothing was removed. src/font/index.json is still the source of truth for
// what exists and what each face is called. This file only says which ones are
// worth offering first for a name on a Quran stand, and it is a curation, not
// a capability - every face in index.json works.
//
// The distinction that matters on plywood is `kind`:
//
//   stroke   the glyph is a skeleton, one pass down the middle of each stem.
//            The head traces a line and stops. Fast, clean, and it cannot fill
//            in - which is why it is the safe recommendation at a small cap
//            height on 9 mm ply.
//   outline  the glyph is a closed contour and the engrave layer is a fill.
//            It is what makes the reference product look like the reference
//            product, and it is also what chars into a blob if the power is
//            wrong or the letter is too small.
//
// WHETHER THE FILLED SCRIPT FACES STAY LEGIBLE AT A 12 TO 18 MM CAP HEIGHT ON
// 9 MM PLY IS UNVERIFIED. Nothing here has been engraved. `great-vibes` is the
// default because it matches what the customer is being shown, not because it
// has been proved to survive a test engrave. If it fills in, move the default
// to `zahid-cursive` and demote the whole `hias` group.

/** Single-stroke. One pass down each stem; the safe choice for a small name. */
export const STROKE_FACES = ['zahid-cursive', 'zahid', 'sham', 'script', 'sans'];

/** Filled script. The reference look, and the group to test-engrave first. */
export const SCRIPT_FACES = [
  'great-vibes', 'allura', 'parisienne', 'style-script', 'rochester',
  'niconne', 'grand-hotel', 'courgette', 'leckerli-one', 'lakki-reddy',
  'deftone-stylus', 'sloe-gin-rickey',
];

/** Filled serif and block. Quieter, and the most forgiving of the fills. */
export const PLAIN_FACES = [
  'cinzel', 'dream-orphans', 'goodfish', 'berylium', 'port-credit',
  'poppins', 'itim', 'bebas-neue', 'blue-highway', 'edmunds', 'engebrechtre',
];

export const FACE_GROUPS = [
  {
    id: 'garis',
    name: 'Satu garis',
    note: 'Ukiran satu laluan. Paling cepat dan paling bersih pada papan lapis.',
    faces: STROKE_FACES,
  },
  {
    id: 'hias',
    name: 'Tulisan berhias',
    note: 'Ukiran berisi. Rupa seperti rehal di pasaran - uji ukir dahulu.',
    faces: SCRIPT_FACES,
  },
  {
    id: 'biasa',
    name: 'Huruf biasa',
    note: 'Ukiran berisi, bentuk lebih tenang.',
    faces: PLAIN_FACES,
  },
];

export const FACE_DEFAULT = 'great-vibes';
/** The one to fall back to if a test engrave says the filled faces close up. */
export const FACE_SAFE = 'zahid-cursive';

/** Everything this file names, for a test that wants to be sure they all exist. */
export const CURATED = [...STROKE_FACES, ...SCRIPT_FACES, ...PLAIN_FACES];
