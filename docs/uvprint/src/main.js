// Wiring. The only module that touches document, File, Worker or the window.
//
// Privacy: the file is read with File.arrayBuffer() and handed to a Web Worker
// from this same page. There is no fetch, no upload and no share call anywhere
// in src/ - tools/test-ui.js fails the build if one appears.

import {
  state, subscribe, load, startFile, setAnalysis, setError, setMaterial, setQtyText,
} from './store.js';
import { screenOf, renderFileInfo, renderQuote } from './ui.js';
import { PreviewPane } from './view.js';
import { MATERIALS, parseQty, fmtRM } from './pricing.js';
import { MAX_BYTES, analyseFile } from './analyse.js';

const $ = (id) => document.getElementById(id);
const TIMEOUT_MS = 20000;

const els = {
  status: $('status'),
  empty: $('emptyState'),
  work: $('work'),
  fileInfo: $('fileInfo'),
  quoteBox: $('quoteBox'),
  materialRow: $('materialRow'),
  qty: $('qty'),
  qtyMinus: $('qtyMinus'),
  qtyPlus: $('qtyPlus'),
  fileInput: $('fileInput'),
  dropVeil: $('dropVeil'),
  controls: $('controls'),
};
const pane = new PreviewPane($('pane'));

// ------------------------------------------------------------------ reading

let worker = null;
function getWorker() {
  if (worker) return worker;
  try {
    worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
  } catch {
    worker = null;
  }
  return worker;
}

// The buffer is transferred to the worker (no 50 MB copy), so the main-thread
// fallback reads the file again rather than reusing a detached buffer.
async function onMainThread(file) {
  return analyseFile(new Uint8Array(await file.arrayBuffer()), file.name);
}

function analyseInWorker(bytes, file) {
  const name = file.name;
  const w = getWorker();
  if (!w) return onMainThread(file); // no module workers: same code, main thread
  return new Promise((resolve) => {
    const id = Math.random().toString(36).slice(2);
    const timer = setTimeout(() => {
      w.terminate();
      worker = null;
      resolve({ ok: false, code: 'too-complex' });
    }, TIMEOUT_MS);
    const onMsg = (e) => {
      if (e.data?.id !== id) return;
      clearTimeout(timer);
      w.removeEventListener('message', onMsg);
      w.removeEventListener('error', onErr);
      resolve(e.data.result);
    };
    const onErr = (ev) => {
      // A module worker that fails to load (very old browser) - fall back.
      ev.preventDefault?.();
      clearTimeout(timer);
      w.removeEventListener('message', onMsg);
      w.removeEventListener('error', onErr);
      worker = null;
      resolve(onMainThread(file));
    };
    w.addEventListener('message', onMsg);
    w.addEventListener('error', onErr);
    w.postMessage({ id, bytes, name }, [bytes]);
  });
}

async function openFile(file) {
  if (!file) return;
  const seq = startFile(file);
  if (file.size > MAX_BYTES) { setError(seq, 'too-large'); return; }
  if (file.size === 0) { setError(seq, 'empty'); return; }
  let buf;
  try {
    buf = await file.arrayBuffer();
  } catch {
    setError(seq, 'read-failed');
    return;
  }
  // Let the "Membaca fail..." line paint before the work starts.
  await new Promise((r) => setTimeout(r, 0));
  let result;
  try {
    result = await analyseInWorker(buf, file);
  } catch {
    result = { ok: false, code: 'corrupt' };
  }
  setAnalysis(seq, result);
}

const pickFile = () => {
  els.fileInput.value = '';
  els.fileInput.click();
};

// ------------------------------------------------------------------ controls

function buildMaterialButtons() {
  els.materialRow.replaceChildren(...MATERIALS.map((m) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'target-btn';
    b.dataset.id = m.id;
    const top = document.createElement('span');
    top.className = 'm-name';
    top.textContent = m.id;
    const sub = document.createElement('span');
    sub.className = 'm-rate';
    sub.textContent = fmtRM(m.rateSen);
    b.append(top, sub);
    b.addEventListener('click', () => setMaterial(m.id));
    return b;
  }));
}

function stepQty(delta) {
  const q = parseQty(els.qty.value);
  const next = Math.max(1, (q.ok ? q.value : 1) + delta);
  els.qty.value = String(next);
  setQtyText(els.qty.value);
}

// ------------------------------------------------------------------ render

let frame = 0;
function scheduleRender() {
  if (frame) return;
  frame = requestAnimationFrame(() => { frame = 0; render(); });
}

function render() {
  const v = screenOf(state);
  els.empty.hidden = v.mode !== 'empty';
  els.work.hidden = v.mode === 'empty';
  els.status.textContent = v.mode === 'busy' ? v.busy : '';
  for (const b of els.materialRow.children) {
    const on = b.dataset.id === v.materialId;
    b.classList.toggle('is-on', on);
    b.setAttribute('aria-pressed', on ? 'true' : 'false');
  }
  if (document.activeElement !== els.qty && els.qty.value !== state.params.qtyText) els.qty.value = state.params.qtyText;
  els.qty.setAttribute('aria-invalid', parseQty(state.params.qtyText).ok ? 'false' : 'true');
  if (v.mode === 'empty') return;

  if (v.mode === 'busy') {
    renderFileInfo(els.fileInfo, { fileName: state.file.name, fileSize: state.file.size, ruleText: '', warnings: [] }, { pickFile });
    els.quoteBox.replaceChildren();
    pane.root.hidden = false;
    pane.empty('Membaca fail...');
    els.controls.hidden = true;
    return;
  }
  renderFileInfo(els.fileInfo, v, { pickFile });
  renderQuote(els.quoteBox, v);
  // Material and quantity only matter when there is something to price.
  els.controls.hidden = !(v.quote && v.quote.lines.length) || (v.errorCode && v.errorCode !== 'oversize');
  // A refused file has nothing to picture: the message moves up instead of
  // sitting under an empty grid.
  pane.root.hidden = !v.preview;
  if (v.preview) pane.draw(v.preview, v.quote ? v.quote.lines : []);
}

// ------------------------------------------------------------------ events

$('pickBtn').addEventListener('click', pickFile);
els.fileInput.addEventListener('change', () => openFile(els.fileInput.files && els.fileInput.files[0]));
els.qty.addEventListener('input', () => setQtyText(els.qty.value));
els.qty.addEventListener('blur', () => {
  const q = parseQty(els.qty.value);
  if (q.ok && els.qty.value !== String(q.value)) { els.qty.value = String(q.value); setQtyText(els.qty.value); }
});
els.qtyMinus.addEventListener('click', () => stepQty(-1));
els.qtyPlus.addEventListener('click', () => stepQty(1));

let dragDepth = 0;
window.addEventListener('dragenter', (e) => { e.preventDefault(); dragDepth++; els.dropVeil.hidden = false; });
window.addEventListener('dragover', (e) => e.preventDefault());
window.addEventListener('dragleave', () => { dragDepth = Math.max(0, dragDepth - 1); if (!dragDepth) els.dropVeil.hidden = true; });
window.addEventListener('drop', (e) => {
  e.preventDefault();
  dragDepth = 0;
  els.dropVeil.hidden = true;
  const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
  if (f) openFile(f);
});

let resizeTimer = 0;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(scheduleRender, 150);
});

load();
buildMaterialButtons();
els.qty.value = state.params.qtyText;
subscribe(scheduleRender);
render();

