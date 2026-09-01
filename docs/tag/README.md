# Tag Generator

A parametric luggage-tag designer for the laser. Vanilla ES modules, no build
step, no dependencies. `npm run dev` serves it at http://localhost:5185;
`npm test` runs the geometry checks.

It makes **two pieces** — a front and a back — that get cut face up and glued
back to back. The front carries a name and any artwork; the back carries the
"if found, please contact" card.

## What it does

- Eight shapes: rectangle, tag, arch, circle, square, octagon, triangle, heart,
  each at exactly the width and height you type
- A strap slot — stadium, circle or square — with the board left around it
  measured against the real outline, not guessed from the height
- Single, double or no engraved border
- Front name and back contact card, set in a single-line stroke face
- Clipart library, SVG import, free text in outline fonts, and basic shapes,
  placed and dragged on either side
- SVG and PDF export in real millimetres, kerf already applied, with Cut,
  Engrave (Line) and Engrave (Fill) on separate layers

## The parts worth knowing about

**The slot is the only thing on a luggage tag that ever fails.** It is the only
place the strap pulls and it is the thinnest section. So `bridgeWidth()` measures
every point of the hole against every segment of the outline and reports the
smallest gap — negative when the hole has broken out through the edge, so one
number covers both "too close" and "not even inside". On a heart or a triangle
that distance is not something you can work out from the height, which is the
whole reason it is measured rather than calculated. When it is short,
`suggestSlotEdge()` walks the slot down the shape and reports the first position
that clears, and the warning names that number instead of saying "move it down".

**Shapes come out at the size you asked for.** Rounding a corner that is not
square pulls the outline in on both axes — a 4 mm fillet on the apex of a
50 × 90 triangle takes 11 mm off the height. Scaling the finished ring to fit
would turn every fillet into an ellipse segment, so `fitShapeRing()` adjusts the
input and rebuilds instead. The arcs stay circular and stay at the radius that
was asked for.

**The lettering is a stroke face, not an outline font.** A phone number engraved
as a filled outline is a raster job: minutes of burning to produce a smudge,
because at 3 mm the counters of the digits are smaller than the spot. One pass
down the middle of each stroke is seconds, and legible. `fitLines()` gives each
row its own size relative to the block, because otherwise the long heading
decides how big the phone number comes out — on a 50 mm tag that dragged the
whole card down to 1.7 mm.

**Both pieces are the same outline.** Every shape is symmetric about its vertical
centre line and the slot sits on that line, so the back needs no mirroring. It
also means a nested file with a front and a back in it looks exactly like a file
with two of the same thing, which is why FRONT and BACK are etched under each
piece in their own throwaway grey layer, and why the WhatsApp note says so out
loud.

**No raster, anywhere.** PNG import was left out: a photograph has no paths in it
for a laser to follow, and tracing one is an engine in its own right. The payoff
is that the PDF and the SVG contain exactly the same drawing, so neither export
has to be described as the lesser of the two.

## Layout

    src/geom/tag.js       the tag: shapes, slot, border, stroke text, warnings
    src/geom/path.js      geometry primitives, incl. the RDP simplifier
    src/geom/decor.js     placed artwork (shared with the Box Maker)
    src/geom/label.js     the single-line face  — see src/font/CREDITS.txt
    src/clipart.js        the icon library      — see src/clipart/LICENCES.txt
    src/exportSvg.js      nesting + the SVG writer
    src/exportPdf.js      the PDF writer, hand-written
    src/store.js          state, undo/redo, materials, persistence
    src/ui.js             inspector, popovers, dialogs
    src/view2d.js         the piece editor (from the Box Maker's face editor)
    src/designs.js        Save + "Reka bentuk saya"
    src/cloud.js          Firestore over REST
    tools/test-geom.js    npm test

## Licences

Everything shipped that was not written here is named in a file beside it, and
those files must not be deleted:

- `src/font/CREDITS.txt` — the Hershey acknowledgement for the stroke face
- `src/clipart/LICENCES.txt` — the icon library, CC0, drawn for this tool
- `assets/fonts/LICENCES.txt` — the seven bundled outline typefaces, all OFL-1.1
