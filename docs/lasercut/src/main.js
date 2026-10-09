// Wiring. The only module that touches document, File, Worker or the window.
//
// Privacy: the file is read with File.arrayBuffer() and handed to a Web Worker
// from this same page. There is no fetch, no upload and no share call anywhere
// in src/.

import {
  state, subscribe, load, startFile, setAnalysis, setError, setMaterial, setQtyText,
  setRole, setScale, resetJob,
} from './store.js';
import { screenOf, renderFileInfo, renderQuote, renderLayers, renderSize, renderMaterials } from './ui.js';
import { PreviewPane } from './view.js';
import { parseQty, materialById } from './pricing.js';
import { MAX_BYTES, openFile as openLocal, runJob as runLocal } from './analyse.js';

const $ = (id) => document.getElementById(id);
const TIMEOUT_MS = 20000;

const els = {
  status: $('status'),
  empty: $('emptyState'),
  work: $('work'),
  fileInfo: $('fileInfo'),
  quoteBox: $('quoteBox'),
  materialRow: $('materialRow'),
  layerBox: $('layerBox'),
  sizeBox: $('sizeBox'),
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
let local = null; // the opened file when there is no worker (very old browser)

function getWorker() {
  if (worker) return worker;
  try {
    worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
  } catch {
    worker = null;
  }
  return worker;
}

async function onMainThread(msg, file) {
  if (msg.op === 'open') {
    const o = await openLocal(new Uint8Array(await file.arrayBuffer()), file.name);
    local = o.ok ? o.session : null;
    return o.ok ? runLocal(local, local.roles, 1) : { ok: false, code: o.code };
  }
  return local ? runLocal(local, msg.roles, msg.scale) : { ok: false, code: 'corrupt' };
}

/** One request to the worker; falls back to the main thread if it cannot run. */
function ask(msg, file = null) {
  const w = getWorker();
  if (!w) return onMainThread(msg, file);
  return new Promise((resolve) => {
    const id = Math.random().toString(36).slice(2);
    const timer = setTimeout(() => {
      w.terminate();
      worker = null;
      resolve({ ok: false, code: 'too-complex' });
    }, TIMEOUT_MS);
    const done = () => {
      clearTimeout(timer);
      w.removeEventListener('message', onMsg);
      w.removeEventListener('error', onErr);
    };
    const onMsg = (e) => {
      if (e.data?.id !== id) return;
      done();
      resolve(e.data.result);
    };
    const onErr = (ev) => {
      // A module worker that fails to load - same code on the main thread.
      ev.preventDefault?.();
      done();
      worker = null;
      resolve(file ? onMainThread(msg, file) : { ok: false, code: 'corrupt' });
    };
    w.addEventListener('message', onMsg);
    w.addEventListener('error', onErr);
    w.postMessage({ ...msg, id }, msg.bytes ? [msg.bytes] : []);
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
    result = await ask({ op: 'open', bytes: buf, name: file.name }, file);
  } catch {
    result = { ok: false, code: 'corrupt' };
  }
  setAnalysis(seq, result);
}

// Layer and size changes: price again, newest request wins.
let ticket = 0;
async function reprice() {
  const seq = state.seq;
  const t = ++ticket;
  let result;
  try {
    result = await ask({ op: 'job', roles: state.job.roles, scale: state.job.scale });
  } catch {
    result = { ok: false, code: 'corrupt' };
  }
  if (t === ticket) setAnalysis(seq, result);
}

const pickFile = () => {
  els.fileInput.value = '';
  els.fileInput.click();
};

// ------------------------------------------------------------------ controls

function stepQty(delta) {
  const q = parseQty(els.qty.value);
  const next = Math.max(1, (q.ok ? q.value : 1) + delta);
  els.qty.value = String(next);
  setQtyText(els.qty.value);
}

const actions = {
  pickFile,
  setMaterial: (id) => setMaterial(id),
  setRole: (key, role) => { setRole(key, role); reprice(); },
  resetLayers: () => { resetJob(); reprice(); },
  setSize: (axis, cm) => {
    const a = state.analysis;
    const cur = a?.sizeMm?.[axis];
    if (!(cur > 0) || !(cm > 0)) return;
    const next = state.job.scale * ((cm * 10) / cur);
    if (Math.abs(next - state.job.scale) < 1e-9) return;
    setScale(next);
    reprice();
  },
  resetSize: () => { setScale(1); reprice(); },
};

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
  els.status.textContent = v.mode === 'busy' ? v.busy : v.working ? 'Mengira semula...' : '';
  renderMaterials(els.materialRow, v, actions);
  if (document.activeElement !== els.qty && els.qty.value !== state.params.qtyText) els.qty.value = state.params.qtyText;
  els.qty.setAttribute('aria-invalid', parseQty(state.params.qtyText).ok ? 'false' : 'true');
  if (v.mode === 'empty') return;

  if (v.mode === 'busy') {
    renderFileInfo(els.fileInfo, { fileName: state.file.name, fileSize: state.file.size, warnings: [] }, actions);
    els.quoteBox.replaceChildren();
    pane.root.hidden = false;
    pane.empty(v.busy);
    els.controls.hidden = true;
    return;
  }
  renderFileInfo(els.fileInfo, v, actions);
  renderQuote(els.quoteBox, v);
  // Material, size and layers only matter when there is a drawing to work on.
  els.controls.hidden = !v.layers.length || (v.errorCode && !['oversize', 'nothing'].includes(v.errorCode));
  if (!els.controls.hidden) {
    renderSize(els.sizeBox, v, actions);
    renderLayers(els.layerBox, v, actions);
  }
  pane.root.hidden = !v.preview;
  if (v.preview) pane.draw(v.preview, v.quote ? v.quote.lines : [], materialById(v.materialId)?.group);
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
els.qty.value = state.params.qtyText;
subscribe(scheduleRender);
render();
