// Where the two pieces sit once they are glued up.
//
// A luggage tag comes off the bed as two identical outlines, cut face up, and is
// then glued back to back. The finished object is therefore ONE piece of board
// twice the thickness, with the name burnt on one outer surface and the contact
// details on the other. That is what this module describes, and it is what the
// 3D preview draws: not two flat pieces laid out side by side, but the thing the
// customer ends up holding, which you have to turn over to read.
//
// No DOM and no three.js in here on purpose. Where a piece sits, which way round
// it faces and where its slot lands is arithmetic, and arithmetic is worth
// testing; painting it is not.
//
// FRAMES. Each piece gets an orthonormal basis (U, V, N) and an origin, in
// millimetres - the same convention the Box Maker and the Stand use:
//
//     world = origin + u*U + v*V        for a point (u, v) on the piece
//
// N is the outward normal, the direction the engraved surface faces, and the
// board hangs BEHIND the frame plane: from the plane back along -N by its
// thickness. So the frame plane is the visible surface, and the extrusion in the
// renderer is a translate of -t along its own local z, exactly as in the other
// tools.
//
// THE TAG STANDS UP. World x is across, world z is up, world y is depth, and the
// tag's own y maps to world z so it stands on the ground plane at z = 0 rather
// than lying flat. That is not decoration: with the tag upright, front and back
// are separated along the depth axis, and getting from one to the other is a
// horizontal drag - the orbit gesture everybody already makes. Lying flat, the
// back would be under the floor.
//
// THE BACK PIECE IS MIRRORED, and that is not a stylistic choice either. The
// piece is cut with its lettering readable from above, then physically turned
// over. Turn a piece of card over about its vertical axis and every x becomes
// (W - x) while the height is untouched - so the back's frame is U = [-1, 0, 0]
// with its origin moved across to x = W, and N pointing the other way down the
// depth axis. Both flips together keep the basis right-handed (det = +1), so
// face winding, normals and shadows stay correct and nothing downstream has to
// know the piece was reversed.
//
// It also means the contact details read the right way round when you orbit
// behind the tag, rather than in mirror writing - which is most of the reason
// the 3D view is worth having at all.

/**
 * Map a point on a piece into world millimetres.
 *
 * `depth` goes INTO the board along -N: 0 is the engraved surface, `thickness`
 * is the glued face. A small negative depth lifts a burn mark a hair clear of
 * the surface so it cannot z-fight with it.
 */
export function toWorld(frame, [x, y], depth = 0) {
  const { origin: o, U, V, N } = frame;
  return [
    o[0] + x * U[0] + y * V[0] - depth * N[0],
    o[1] + x * U[1] + y * V[1] - depth * N[1],
    o[2] + x * U[2] + y * V[2] - depth * N[2],
  ];
}

/**
 * The glued-up tag: both pieces, placed.
 *
 * The glue line sits on y = 0, so the assembly straddles it and keeps its middle
 * on the origin whatever the board measures. A thicker board pushes BOTH outer
 * surfaces out, which is what gluing two thicker pieces together actually does -
 * it does not push the front forward and leave the back where it was.
 */
export function assembly(tag) {
  const t = tag.params.thickness;
  const W = tag.pieces[0]?.size.w ?? 0;
  const H = tag.pieces[0]?.size.h ?? 0;

  const place = (id, frame) => {
    const piece = tag.pieces.find((p) => p.id === id);
    if (!piece) return null;
    return {
      id,
      label: piece.label,
      piece,
      frame,
      thickness: t,
      // Where this piece starts and stops along the depth axis: the engraved
      // face first, the glued face second.
      outer: frame.origin[1],
      inner: frame.origin[1] - t * frame.N[1],
    };
  };

  const pieces = [
    place('front', {
      origin: [0, -t, 0],
      U: [1, 0, 0],
      V: [0, 0, 1],
      N: [0, -1, 0],
    }),
    // Turned over about the vertical centre line. Every shape this tool offers
    // is symmetric about that line and the slot sits on it, so the mirrored
    // outline lands exactly on the front's - which is why the two glue up
    // without the edges stepping, and why the strap goes through both slots.
    place('back', {
      origin: [W, t, 0],
      U: [-1, 0, 0],
      V: [0, 0, 1],
      N: [0, 1, 0],
    }),
  ].filter(Boolean);

  return {
    pieces,
    // What the finished object measures, as opposed to what one piece measures.
    // The depth is the pair, not the board.
    size: { w: W, h: H, depth: t * 2 },
  };
}

/** The centre of a ring's bounding box - for checking a hole landed where it should. */
export function ringCentre(ring) {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const [x, y] of ring) {
    if (x < x0) x0 = x;
    if (y < y0) y0 = y;
    if (x > x1) x1 = x;
    if (y > y1) y1 = y;
  }
  return [(x0 + x1) / 2, (y0 + y1) / 2];
}
