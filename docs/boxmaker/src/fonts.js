// Bundled fonts, loaded on demand and converted to outlines by opentype.js so the
// exported SVG contains real geometry instead of <text> a laser cannot cut.

import opentype from '../vendor/opentype.module.js';

export const FONTS = [
  { id: 'inter', name: 'Inter', file: 'Inter-Variable.ttf' },
  { id: 'roboto', name: 'Roboto', file: 'Roboto-Variable.ttf' },
  { id: 'mono', name: 'Roboto Mono', file: 'RobotoMono-Variable.ttf' },
  { id: 'oswald', name: 'Oswald', file: 'Oswald-Variable.ttf' },
  { id: 'bebas', name: 'Bebas Neue', file: 'BebasNeue-Regular.ttf' },
  { id: 'lobster', name: 'Lobster', file: 'Lobster-Regular.ttf' },
  { id: 'pacifico', name: 'Pacifico', file: 'Pacifico-Regular.ttf' },
];

const cache = new Map();
const pending = new Map();

export function loadedFont(id) {
  return cache.get(id) || null;
}

export async function loadFont(id) {
  if (cache.has(id)) return cache.get(id);
  if (pending.has(id)) return pending.get(id);
  const meta = FONTS.find((f) => f.id === id) || FONTS[0];
  const task = fetch(`assets/fonts/${meta.file}`)
    .then((r) => {
      if (!r.ok) throw new Error(`font ${meta.file}: ${r.status}`);
      return r.arrayBuffer();
    })
    .then((buf) => {
      const font = opentype.parse(buf);
      cache.set(id, font);
      pending.delete(id);
      return font;
    })
    .catch((err) => {
      pending.delete(id);
      throw err;
    });
  pending.set(id, task);
  return task;
}

/** Inject an already-parsed font. Used by the Node sample/export scripts. */
export function registerFont(id, font) {
  cache.set(id, font);
  return font;
}

/** Warm up the default font so the first text object renders instantly. */
export function preload() {
  return loadFont('inter').catch(() => null);
}
