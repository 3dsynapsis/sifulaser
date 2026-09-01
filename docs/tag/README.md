# Tag Generator

A parametric luggage-tag designer for the laser. Vanilla ES modules, no build
step, no dependencies. `npm run dev` serves it at http://localhost:5185;
`npm test` runs the geometry checks.

It makes **two pieces** — a front and a back — that get cut face up and glued
back to back. The front carries a name and any artwork; the back carries the
"if found, please contact" card.

## What it does

- Five ready designs at the top of the panel — Travel, School bag, Staff tag,
  Pet tag, Save the date — each a whole tag you type your own name over
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

**The presets set the whole tag, because the numbers only work together.** Five
jobs, five shapes, five sizes: a 65 × 105 travel label with a posted address on
the back, a 50 × 70 arch for a school bag that carries a phone number and
deliberately no address, a 90 × 55 landscape staff plate, a 38 mm round pet disc
whose whole back is one phone number, and a 70 mm heart for a wedding. Every
number in them is measured rather than guessed — each slot position was walked
against the real outline until the bridge cleared 3 mm, and each cap height was
read back off a build and floored to a tenth, so the text is set at the largest
size that fits and the tool has nothing left to say about it. `PRESETS`,
`presetParams()` and `matchesPreset()` live in `geom/tag.js`; the tests build all
five and fail if any of them so much as raises a note.

The heart is the one worth reading the comments on. It dips to a notch on its own
centre line, and the slot sits on that line, so anywhere above about 13 mm the
hole is outside the shape altogether — 20 mm down is the first position with
sound board all round. Below the slot, the bottom half of the writing room is the
point of the heart, where there is no width to write in, so both blocks are
nudged 7 mm up onto the lobes. Centred, the same words come out half the size.


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
    src/geom/assembly.js  where the two pieces sit once they are glued up
    src/clipart.js        the icon library      — see src/clipart/LICENCES.txt
    src/exportSvg.js      nesting + the SVG writer
    src/exportPdf.js      the PDF writer, hand-written
    src/store.js          state, undo/redo, materials, persistence
    src/ui.js             inspector, popovers, dialogs
    src/view3d.js         the finished tag, glued up (from the Box Maker)
    src/view2d.js         the piece editor (from the Box Maker's face editor)
    src/texture.js        procedural board surfaces for the 3D view
    src/designs.js        Save + "Reka bentuk saya"
    src/cloud.js          Firestore over REST
    vendor/               three.js and OrbitControls, unmodified
    tools/test-geom.js    npm test

## The 3D view shows one tag, not two pieces

The tool opens on 3D. What it draws is the finished object — the two pieces glued
back to back, at twice the board thickness, with the name burnt on one outer face
and the contact details on the other. It is not the two cut pieces laid out side
by side; that drawing already exists and it is called the 2D view.

The consequence is the point. A luggage tag's whole job is on its back, so a
preview that can only ever show the front is showing half the product. Here the
back is genuinely on the back: the tag stands upright, the camera is held above
the ground plane, and getting to the contact details is a horizontal drag. Front
and Back in the stage swing the camera rather than swapping the drawing, so the
control that picks a side to edit is also the one that turns the tag over.

The back piece is mirrored, because that is what happens to a piece of card you
turn over — see the frame comments in `src/geom/assembly.js`. Get it wrong and the
phone number comes out in mirror writing.

**The view is not saved.** `store.js` persists the tag; it does not persist how
you were looking at it. Two other tools here had 3D as their default value for
months while almost nobody saw it, because `load()` put the last-used tab back
over the top and only first-time visitors ever met the default.

## Licences

Everything shipped that was not written here is named in a file beside it, and
those files must not be deleted:

- `src/font/CREDITS.txt` — the Hershey acknowledgement for the stroke face
- `src/clipart/LICENCES.txt` — the icon library, CC0, drawn for this tool
- `assets/fonts/LICENCES.txt` — the seven bundled outline typefaces, all OFL-1.1
