// The pipeline, and the API the UI talks to.
//
//   bytes ─┬─ importSvg   (needs a DOM) ─┐
//          └─ dxfParse    (pure)         ├─→ Doc in FILE UNITS
//                                        │
//                    scaleDoc(doc, mmPerUnit)   <- the one and only multiply
//                                        │
//                    Doc in millimetres, y-up
//                                        │
//                          ┌─ toSvg ──→ .svg
//                          ├─ toPdf ──→ .pdf
//                          └─ toDxf ──→ .dxf
//
// The order the UI has to follow is fixed by the unit rule and not by taste:
//
//   1. readInput(bytes, name)  - decodes, or refuses a binary DXF
//   2. parseInput(input)       - geometry in file units, plus the unit state
//   3. if result.unit.state is 'unknown' or 'implausible', ASK. Nothing may be
//      converted, and no dimension may be shown, until the answer comes back
//      through applyUserUnit(). settleUnit() is the one call that does that.
//   4. convert(settled, target) - the output bytes, plus their own preview doc
//
// Step 3 is not a formality that can be skipped when the caller is in a hurry.
// settleUnit() throws on an unknown unit rather than picking something, so a
// UI that forgets the question fails loudly in development instead of quietly
// printing a size that will be cut into somebody's material.

import { dxfParse } from './dxf/parse.js';
import { readDxfBytes } from './dxf/tokenize.js';
import { toSvg, toPdf, toDxf, byteLength } from './export.js';
import { readOwnSvg } from './svgPath.js';
import {
  svgUnits, dxfUnits, applyUserUnit, checkPlausible, dimensionsCm, formatCm,
  isUserChosen, UNIT_CHOICES_CONV,
} from './units.js';
import {
  makeDoc, bounds, scaleDoc, flatten, warnBag,
} from './doc.js';

export { UNIT_CHOICES_CONV, applyUserUnit, dimensionsCm, formatCm, isUserChosen };
export { bounds, flatten };

export const TARGETS = [
  { id: 'svg', label: 'SVG', ext: 'svg', mime: 'image/svg+xml' },
  { id: 'pdf', label: 'PDF', ext: 'pdf', mime: 'application/pdf' },
  { id: 'dxf', label: 'DXF', ext: 'dxf', mime: 'application/dxf' },
];

/**
 * We do not read PDF and we do not read .ai, and that is a scope decision
 * rather than a gap. Pulling vector content out of a PDF means a content stream
 * parser, transforms, clipping and compressed object streams; .ai is PostScript
 * in old files and PDF in new ones. Either is weeks of work for something that
 * would still be unreliable.
 *
 * We also do not WRITE .ai. Illustrator opens PDF and SVG directly. Writing a
 * PDF and calling it .ai would open in Illustrator, and it would also be
 * telling the user something untrue about the file they are holding.
 */
export const INPUT_FORMATS = ['svg', 'dxf'];

export function sniffFormat(name = '', text = '') {
  const ext = String(name).toLowerCase().match(/\.([a-z0-9]+)$/);
  if (ext && ext[1] === 'svg') return 'svg';
  if (ext && ext[1] === 'dxf') return 'dxf';
  const head = String(text).slice(0, 2048);
  if (/<svg[\s>]/i.test(head)) return 'svg';
  if (/\bSECTION\b/.test(head) && /HEADER|ENTITIES/.test(head)) return 'dxf';
  if (ext && (ext[1] === 'pdf' || ext[1] === 'ai')) return ext[1];
  return null;
}

/**
 * Bytes -> text, or an honest refusal.
 *
 * `bytes` is a Uint8Array. The browser's FileReader.readAsText would be one
 * line shorter and would decode a binary DXF into mojibake without raising
 * anything, at which point the parser finds nothing and the user concludes the
 * tool is broken.
 */
export function readInput(bytes, name = '') {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const looksDxf = /\.dxf$/i.test(name);
  if (looksDxf || !/\.svg$/i.test(name)) {
    const r = readDxfBytes(u8);
    if (r.error) return { ...r, name };
    const fmt = sniffFormat(name, r.text);
    if (fmt === 'dxf') {
      return { format: 'dxf', text: r.text, codepage: r.codepage, name, bytes: u8.length };
    }
    if (fmt === 'pdf' || fmt === 'ai') return refuseFormat(fmt, name);
    if (fmt === 'svg') {
      return {
        format: 'svg', text: new TextDecoder('utf-8').decode(u8), name, bytes: u8.length,
      };
    }
    return {
      error: 'unknown-format',
      message: 'Kami tidak kenal fail ini. Converter File terima SVG dan DXF sahaja.',
      name,
    };
  }
  return {
    format: 'svg', text: new TextDecoder('utf-8').decode(u8), name, bytes: u8.length,
  };
}

function refuseFormat(fmt, name) {
  return {
    error: `no-${fmt}-input`,
    message: fmt === 'pdf'
      ? 'Converter File belum boleh baca PDF. Buka fail itu di Illustrator atau Inkscape dan simpan sebagai SVG dahulu.'
      : 'Converter File belum boleh baca fail .ai. Di Illustrator, pilih Save As dan simpan sebagai SVG atau PDF dahulu.',
    name,
  };
}

/**
 * Geometry in file units, and what the file said about those units.
 *
 * `svgReader` is injected so the pure half of this pipeline can be tested in
 * node: the real one needs a browser, and the test suite passes readOwnSvg for
 * files this tool wrote itself.
 */
export function parseInput(input, { svgReader = null, splineTolerance } = {}) {
  if (input.error) return input;
  if (input.format === 'dxf') {
    const warn = warnBag();
    const r = dxfParse(input.text, { warn, splineTolerance });
    const doc = makeDoc({
      paths: r.paths,
      layers: r.layers,
      warnings: r.warnings,
      source: { format: 'dxf', name: input.name, bytes: input.bytes },
    });
    const b = bounds(doc);
    // Plausibility is checked against the geometry, not against the unit code
    // on its own: a file marked in light years is only obviously wrong once you
    // see what that makes the drawing.
    const unit = checkPlausible(dxfUnits(r.header), b.w, b.h);
    return { doc, unit, header: r.header, stats: r.stats, raw: r };
  }
  if (input.format === 'svg') {
    const read = svgReader || (() => {
      throw new Error('parseInput: no SVG reader supplied (importSvg needs a DOM)');
    });
    const doc = read(input.text, { name: input.name, bytes: input.bytes });
    const b = bounds(doc);
    const unit = checkPlausible(svgUnits(input.text), b.w, b.h);
    return { doc, unit, header: null, stats: null, raw: null };
  }
  return { error: 'unknown-format', message: 'Format tidak dikenali.' };
}

/**
 * Turn file units into millimetres, once.
 *
 * `chosen` is the unit the user picked, or null. Passing null while the state
 * is unknown is a programming error and is treated as one - the alternative is
 * a converter that quietly decides for them.
 */
export function settleUnit(parsed, chosen = null) {
  let unit = parsed.unit;
  if (chosen) unit = applyUserUnit(unit, chosen);
  if (unit.mmPerUnit == null) {
    throw new Error(
      `settleUnit: units are ${unit.state} and no choice was given - ask the user first`,
    );
  }
  const doc = scaleDoc({ ...parsed.doc, unit }, unit.mmPerUnit);
  return { ...parsed, doc: { ...doc, unit }, unit, settled: true };
}

/** The sentence that has to travel inside the produced file, or null. */
export function unitNoteFor(unit) {
  if (!unit || !isUserChosen(unit)) return null;
  const id = unit.chosen;
  return `Unit chosen by the user (${id}). The source file did not state its units, `
    + 'so this size is their answer and not the original file\'s.';
}

/**
 * Doc -> the bytes of one output format, plus a doc built from THOSE BYTES.
 *
 * `preview` is what the right-hand pane draws, and it is deliberately not the
 * input. For SVG and DXF it is the output read back through our own readers, so
 * the pane is a picture of the file that will be downloaded and doubles as a
 * live check on the writer. PDF cannot be read back - nothing here parses PDF -
 * so it reuses the doc that was handed to the writer, which is the exact
 * coordinate list the writer consumed. The pane has to say which of the two it
 * is showing.
 */
export function convert(doc, target, opts = {}) {
  const spec = TARGETS.find((t) => t.id === target);
  if (!spec) throw new Error(`convert: unknown target ${target}`);
  const unitNote = unitNoteFor(doc.unit);
  const title = opts.title || (doc.source && doc.source.name) || 'Converted drawing';
  const o = { ...opts, title, unitNote };

  if (target === 'svg') {
    const text = toSvg(doc, o);
    const back = readOwnSvg(text);
    return {
      target, text, ext: spec.ext, mime: spec.mime, bytes: byteLength(text),
      preview: makeDoc({ paths: back.paths, layers: back.layers, unit: doc.unit }),
      previewSource: 'output',
    };
  }
  if (target === 'dxf') {
    const text = toDxf(doc, o);
    const back = dxfParse(text);
    return {
      target, text, ext: spec.ext, mime: spec.mime, bytes: byteLength(text),
      preview: makeDoc({ paths: back.paths, layers: back.layers, unit: doc.unit }),
      previewSource: 'output',
    };
  }
  const text = toPdf(doc, o);
  return {
    target, text, ext: spec.ext, mime: spec.mime, bytes: byteLength(text),
    preview: doc,
    previewSource: 'written', // "dari data yang ditulis ke PDF"
  };
}

/**
 * Everything the "Maklumat Fail" block needs, in one call.
 *
 * Works on either a parseInput() result, whose geometry is still in file units,
 * or a settleUnit() one, whose geometry is already millimetres. The `settled`
 * flag is what tells them apart - measuring a settled doc and then multiplying
 * by mmPerUnit again would report the drawing at the square of its own scale,
 * which for the owner's spline file is 116 metres.
 */
export function fileInfo(parsed) {
  const doc = parsed.doc;
  const b = bounds(doc);
  const unit = parsed.unit;
  const dim = parsed.settled
    ? (unit.mmPerUnit == null ? null : { w: b.w / 10, h: b.h / 10 })
    : dimensionsCm(unit, b.w, b.h);
  return {
    format: (doc.source && doc.source.format) || null,
    name: (doc.source && doc.source.name) || '',
    bytes: (doc.source && doc.source.bytes) || 0,
    objects: doc.paths.length,
    layers: doc.layers.length,
    unit,
    // null is a real answer and the UI must render it as one - not a greyed
    // number, not a guess in brackets.
    dimensionsCm: dim,
    dimensionsText: formatCm(dim),
    boundsUnits: b,
    warnings: doc.warnings || [],
  };
}
