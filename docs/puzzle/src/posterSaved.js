// Saved poster jobs: the poster on screen -> an account record, and back.
//
// What goes to the account is the job's settings: the size, the ticked pages, the
// client, the dateline and the seed at each size. The PDF does not. A poster runs
// to tens of megabytes, a Firestore document stops at one, and the panel promises
// the PDF stays in the browser. It is kept there (posterVault.js) and named here by
// its hash, so that opening the job can tell whether it has the right file.
//
// The seeds are written down rather than worked out again on opening. strength.js
// is free to rank better one day; a job that was saved has to keep cutting the same
// lines, because half of it may already be on the laser bed.
//
// params is the current page's puzzle, flat like any other puzzle record, so the
// shape firestore.rules pins still holds.
//
// Pure: no DOM. Tested by tools/test-poster.js.

import { PAPERS, HEIGHT_MIN_MM, puzzleParams } from './geom/poster.js';
import { designParams, designMaterial } from './saved.js';

const MATERIAL = 'acrylic-clear';
const HEIGHT_MAX_MM = 2000; // the same as the box in the panel
const SEED_MAX = 99999;     // the same as saved.js
const PAGES_MAX = 5000;     // a record is data from a server: it must not hang the tab
const TEXT_MAX = 200;
const NAME_MAX = 255;

const HASH = /^[0-9a-f]{64}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const PLAN_KEY = /^[\d.]+x[\d.]+:\d+x\d+$/;

/** Names one size of puzzle. A seed only means the same lines at the same size. */
export const planKey = (plan) => `${plan.width}x${plan.height}:${plan.cols}x${plan.rows}`;

const isWhole = (v, min, max) => Number.isInteger(v) && v >= min && v <= max;

function cleanChoice(choice) {
  if (choice && PAPERS.some((p) => p.id === choice.paper)) return { paper: choice.paper };
  if (choice && typeof choice.height === 'number' && Number.isFinite(choice.height)) {
    return { height: Math.min(HEIGHT_MAX_MM, Math.max(HEIGHT_MIN_MM, choice.height)) };
  }
  return { paper: 'A3' };
}

function cleanSeeds(seeds) {
  if (!Array.isArray(seeds)) return [];
  return seeds.slice(0, PAGES_MAX).filter((s) => s
    && isWhole(s.seed, 0, SEED_MAX)
    && typeof s.key === 'string'
    && PLAN_KEY.test(s.key))
    .map((s) => ({ key: s.key, seed: s.seed }));
}

/**
 * A job as it can safely be used, or null when it is not one.
 *
 * Every value is checked, for the same reason saved.js checks its own: what comes
 * back from the server must land on a default rather than become NaN in a cut path.
 */
export function cleanPoster(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const f = raw.file;
  if (!f || typeof f !== 'object' || typeof f.name !== 'string' || !f.name.trim()) return null;
  const pages = isWhole(f.pages, 1, PAGES_MAX) ? f.pages : 1;
  const ticked = Array.isArray(raw.ticked)
    ? [...new Set(raw.ticked.filter((i) => isWhole(i, 0, pages - 1)))].sort((a, b) => a - b)
    : Array.from({ length: pages }, (_, i) => i);
  return {
    file: {
      name: f.name.slice(0, NAME_MAX),
      size: isWhole(f.size, 0, Number.MAX_SAFE_INTEGER) ? f.size : 0,
      hash: HASH.test(f.hash) ? f.hash : '',
      pages,
    },
    choice: cleanChoice(raw.choice),
    ticked,
    current: isWhole(raw.current, 0, pages - 1) ? raw.current : 0,
    view: raw.view === 'sheet' ? 'sheet' : 'panel',
    shuffle: isWhole(raw.shuffle, 0, Number.MAX_SAFE_INTEGER) ? raw.shuffle : 0,
    client: typeof raw.client === 'string' ? raw.client.slice(0, TEXT_MAX) : '',
    dateline: DATE.test(raw.dateline) ? raw.dateline : '',
    seeds: cleanSeeds(raw.seeds),
  };
}

/** What gets stored: the fields every puzzle record has, and the job inside extra. */
export function posterRecord(job, plan, seed) {
  return {
    params: designParams({ params: puzzleParams(plan, seed) }),
    material: designMaterial({ material: MATERIAL }),
    extra: { material: MATERIAL, splitLayers: false, poster: cleanPoster(job) },
  };
}

/** The job inside an account record, or null when the record is an ordinary puzzle. */
export function readPoster(row) {
  if (typeof row?.extra !== 'string' || !row.extra) return null;
  try {
    const extra = JSON.parse(row.extra);
    return cleanPoster(extra?.poster);
  } catch {
    return null;
  }
}
