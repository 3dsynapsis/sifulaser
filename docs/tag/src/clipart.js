// The clipart library.
//
// Every drawing in here was constructed for this tool. Nothing is traced,
// downloaded or lifted from an icon set, and that is a licensing decision rather
// than a stylistic one: an exported cut file is a commercial deliverable, it
// leaves with the customer, and a tool that quietly hands somebody an icon under
// terms nobody checked is a tool that hands them a problem. See
// src/clipart/LICENCES.txt, which travels with this file.
//
// Each icon is a LIST of subpaths rather than one path string with several `M`
// commands in it, and that is not tidiness. The importer samples a shape with
// getPointAtLength, which walks a multi-subpath path as one continuous curve and
// draws a straight line from the end of one subpath to the start of the next. A
// suitcase would arrive with a diagonal scar across it. One element per closed
// contour, and the problem does not exist.
//
// Drawn on a 100 x 100 grid, y down, which is what SVG path data means. The
// importer flips to y-up on the way in, the same as any imported file - these go
// through the same path as a user's own SVG rather than round a side door.

export const CLIPART = [
  {
    id: 'suitcase',
    name: 'Suitcase',
    d: [
      'M14 34 h72 a7 7 0 0 1 7 7 v40 a7 7 0 0 1 -7 7 h-72 a7 7 0 0 1 -7 -7 v-40 a7 7 0 0 1 7 -7 Z',
      'M38 34 v-9 a7 7 0 0 1 7 -7 h10 a7 7 0 0 1 7 7 v9',
      'M33 41 v40',
      'M67 41 v40',
    ],
  },
  {
    id: 'plane',
    name: 'Aeroplane',
    d: [
      'M50 6 c5 0 8 7 8 16 v13 l34 20 v10 l-34 -10 v20 l11 9 v8 l-19 -6 l-19 6 v-8 l11 -9 v-20 l-34 10 v-10 l34 -20 v-13 c0 -9 3 -16 8 -16 Z',
    ],
  },
  {
    id: 'globe',
    name: 'Globe',
    d: [
      'M50 8 a42 42 0 1 0 0.1 0 Z',
      'M8 50 h84',
      'M50 8 a20 42 0 0 0 0 84 a20 42 0 0 0 0 -84 Z',
      'M17 27 h66',
      'M17 73 h66',
    ],
  },
  {
    id: 'tag',
    name: 'Luggage tag',
    d: [
      'M32 10 h44 a6 6 0 0 1 6 6 v68 a6 6 0 0 1 -6 6 h-44 a6 6 0 0 1 -6 -6 v-30 l-8 -8 v-22 l8 -8 v-6 a6 6 0 0 1 6 -6 Z',
      'M26 42 a5 5 0 1 0 0.1 0 Z',
    ],
  },
  {
    id: 'compass',
    name: 'Compass',
    d: [
      'M50 8 a42 42 0 1 0 0.1 0 Z',
      'M50 20 l12 30 l-12 30 l-12 -30 Z',
      'M38 50 h24',
    ],
  },
  {
    id: 'mountain',
    name: 'Mountains',
    d: [
      'M6 82 l26 -44 l16 26 l12 -18 l34 36 Z',
      'M24 55 l8 -14 l8 13',
      'M74 26 a9 9 0 1 0 0.1 0 Z',
    ],
  },
  {
    id: 'camera',
    name: 'Camera',
    d: [
      'M8 30 h18 l7 -10 h34 l7 10 h18 a6 6 0 0 1 6 6 v42 a6 6 0 0 1 -6 6 h-84 a6 6 0 0 1 -6 -6 v-42 a6 6 0 0 1 6 -6 Z',
      'M50 36 a21 21 0 1 0 0.1 0 Z',
      'M50 44 a13 13 0 1 0 0.1 0 Z',
      'M80 38 a3 3 0 1 0 0.1 0 Z',
    ],
  },
  {
    id: 'anchor',
    name: 'Anchor',
    d: [
      'M50 8 a9 9 0 1 0 0.1 0 Z',
      'M50 26 v62',
      'M30 38 h40',
      'M12 54 c0 20 17 34 38 34 c21 0 38 -14 38 -34',
      'M12 54 l-6 8',
      'M12 54 l7 7',
      'M88 54 l6 8',
      'M88 54 l-7 7',
    ],
  },
  {
    id: 'heart',
    name: 'Heart',
    d: [
      'M50 88 C14 62 8 44 8 33 A22 22 0 0 1 50 24 A22 22 0 0 1 92 33 C92 44 86 62 50 88 Z',
    ],
  },
  {
    id: 'star',
    name: 'Star',
    d: [
      'M50 6 L62 38 L96 38 L69 58 L79 90 L50 70 L21 90 L31 58 L4 38 L38 38 Z',
    ],
  },
  {
    id: 'paw',
    name: 'Paw print',
    d: [
      'M50 44 c14 0 26 12 26 24 c0 10 -8 16 -16 14 l-10 -3 l-10 3 c-8 2 -16 -4 -16 -14 c0 -12 12 -24 26 -24 Z',
      'M28 20 a10 13 0 1 0 0.1 0 Z',
      'M72 20 a10 13 0 1 0 0.1 0 Z',
      'M11 44 a9 11 0 1 0 0.1 0 Z',
      'M89 44 a9 11 0 1 0 0.1 0 Z',
    ],
  },
  {
    id: 'house',
    name: 'House',
    d: [
      'M50 8 L94 44 H80 V88 H20 V44 H6 Z',
      'M40 88 V60 h20 v28',
      'M68 20 h10 v14',
    ],
  },
  {
    id: 'pin',
    name: 'Map pin',
    d: [
      'M50 6 a30 30 0 0 0 -30 30 c0 22 30 58 30 58 c0 0 30 -36 30 -58 a30 30 0 0 0 -30 -30 Z',
      'M50 24 a12 12 0 1 0 0.1 0 Z',
    ],
  },
  {
    id: 'cloud',
    name: 'Cloud',
    d: [
      'M28 76 a20 20 0 0 1 -2 -40 a24 24 0 0 1 45 -6 a18 18 0 0 1 3 46 Z',
    ],
  },
  {
    id: 'sun',
    name: 'Sun',
    d: [
      'M50 28 a22 22 0 1 0 0.1 0 Z',
      'M50 4 v12',
      'M50 84 v12',
      'M4 50 h12',
      'M84 50 h12',
      'M17 17 l9 9',
      'M74 74 l9 9',
      'M83 17 l-9 9',
      'M26 74 l-9 9',
    ],
  },
  {
    id: 'boat',
    name: 'Boat',
    d: [
      'M8 68 h84 l-14 20 h-56 Z',
      'M50 6 v58',
      'M54 12 l30 20 l-30 12 Z',
      'M46 22 l-24 14 l24 10 Z',
    ],
  },
  {
    id: 'car',
    name: 'Car',
    d: [
      'M8 62 l8 -22 a8 8 0 0 1 7 -5 h54 a8 8 0 0 1 7 5 l8 22 v14 h-84 Z',
      'M24 40 l-5 15 h62 l-5 -15',
      'M28 76 a8 8 0 1 0 0.1 0 Z',
      'M72 76 a8 8 0 1 0 0.1 0 Z',
    ],
  },
  {
    id: 'ticket',
    name: 'Ticket',
    d: [
      'M8 26 h84 v18 a8 8 0 0 0 0 16 v14 h-84 v-14 a8 8 0 0 0 0 -16 Z',
      'M60 26 v6',
      'M60 40 v6',
      'M60 54 v6',
      'M60 68 v6',
    ],
  },
];

/**
 * One icon as a standalone SVG document.
 *
 * The importer takes a file's worth of text, so this hands it a file. The alt
 * route - reaching into the importer with a list of path strings - would be a
 * second way in that nothing else exercises, and it would be the one that rots.
 */
export function clipartSvg(id) {
  const item = CLIPART.find((c) => c.id === id);
  if (!item) return null;
  const paths = item.d.map((d) => `<path d="${d}"/>`).join('');
  return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" '
    + `fill="none" stroke="#000">${paths}</svg>`;
}

/** Thumbnail markup for the picker. Stroked, so open shapes still read. */
export function clipartThumb(item) {
  return '<svg viewBox="0 0 100 100" aria-hidden="true" fill="none" '
    + 'stroke="currentColor" stroke-width="5" stroke-linejoin="round" '
    + `stroke-linecap="round">${item.d.map((d) => `<path d="${d}"/>`).join('')}</svg>`;
}
