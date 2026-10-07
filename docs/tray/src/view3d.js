// Pratonton 3D. Panel ditonjolkan daripada gelang yang SAMA yang pengeksport
// tulis, jadi lubang yang kelihatan di sini ialah lubang yang laser akan
// potong. Dipotong daripada Box Maker: tiada hiasan, tiada penutup, tiada
// pemilihan muka - dulang terbuka tidak ada apa-apa untuk dibuka.

import * as THREE from '../vendor/three.module.js';
import { OrbitControls } from '../vendor/OrbitControls.js';
import { boardCanvas, TILE_MM } from './texture.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

const svg = (name, attrs = {}) => {
  const n = document.createElementNS(SVG_NS, name);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, String(v));
  return n;
};

const fmtMm = (v) => `${Math.round(v * 10) / 10}mm`;

function pointInRing(pt, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if ((yi > pt[1]) !== (yj > pt[1]) &&
        pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

const ringToShape = (ring) => {
  const s = new THREE.Shape();
  s.moveTo(ring[0][0], ring[0][1]);
  for (let i = 1; i < ring.length; i++) s.lineTo(ring[i][0], ring[i][1]);
  s.closePath();
  return s;
};

function areaOf(ring) {
  let a = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    a += ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1];
  }
  return a / 2;
}

/** Pisahkan senarai gelang rata kepada bentuk luar beserta lubangnya mengikut kedalaman sarang. */
export function ringsToShapes(rings) {
  const valid = rings.filter((r) => r && r.length > 2);
  const depth = valid.map((r) => {
    const probe = r[0];
    let d = 0;
    for (const other of valid) {
      if (other === r) continue;
      if (pointInRing(probe, other)) d++;
    }
    return d;
  });
  const shapes = [];
  valid.forEach((r, i) => {
    if (depth[i] % 2 === 0) shapes.push({ ring: r, shape: ringToShape(r), holes: [] });
  });
  valid.forEach((r, i) => {
    if (depth[i] % 2 === 0) return;
    let best = null;
    for (const s of shapes) {
      if (pointInRing(r[0], s.ring)) {
        if (!best || Math.abs(areaOf(s.ring)) < Math.abs(areaOf(best.ring))) best = s;
      }
    }
    if (best) best.shape.holes.push(ringToShape(r));
  });
  return shapes.map((s) => s.shape);
}

export class View3D {
  constructor(container) {
    this.container = container;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(38, 1, 1, 6000);
    this.camera.position.set(230, -280, 190);
    this.camera.up.set(0, 0, 1);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;

    this.hemi = new THREE.HemisphereLight(0xffffff, 0x2a2f38, 1.5);
    this.scene.add(this.hemi);
    const key = new THREE.DirectionalLight(0xffffff, 2.1);
    key.position.set(180, -260, 320);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.camera.near = 1;
    key.shadow.camera.far = 1600;
    const s = 320;
    Object.assign(key.shadow.camera, { left: -s, right: s, top: s, bottom: -s });
    key.shadow.bias = -0.0012;
    this.scene.add(key);
    this.key = key;
    this.scene.add(new THREE.DirectionalLight(0xdfe9ff, 0.45).translateX(-200));

    this.ground = new THREE.Mesh(
      new THREE.PlaneGeometry(4000, 4000),
      new THREE.ShadowMaterial({ opacity: 0.28 }),
    );
    this.ground.receiveShadow = true;
    this.scene.add(this.ground);

    this.root = new THREE.Group();
    this.scene.add(this.root);

    this.dimLayer = document.createElementNS(SVG_NS, 'svg');
    this.dimLayer.setAttribute('class', 'dim-overlay');
    container.appendChild(this.dimLayer);
    this.dims = null;

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(container);
    this.resize();
    this.animate();
  }

  resize() {
    const w = this.container.clientWidth || 1;
    const h = this.container.clientHeight || 1;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  animate = () => {
    this.raf = requestAnimationFrame(this.animate);
    this.controls.update();
    this.updateDims();
    this.renderer.render(this.scene, this.camera);
  };

  dispose() {
    cancelAnimationFrame(this.raf);
    this.resizeObserver.disconnect();
    this.disposeBuild();
    for (const t of this.boards?.values() || []) t?.dispose();
    this.renderer.dispose();
    this.dimLayer.remove();
    this.renderer.domElement.remove();
  }

  /** Matriks dunia yang memetakan (u, v, ke luar) tempatan panel ke milimeter. */
  static panelMatrix(panel) {
    const { origin, U, V, N } = panel.frame;
    const u = new THREE.Vector3(...U);
    const v = new THREE.Vector3(...V);
    const n = new THREE.Vector3(...N);
    const o = new THREE.Vector3(...origin)
      .addScaledVector(u, panel.originShift[0])
      .addScaledVector(v, panel.originShift[1]);
    return new THREE.Matrix4().makeBasis(u, v, n).setPosition(o);
  }

  disposeBuild() {
    this.root.traverse((n) => {
      if (n.geometry) n.geometry.dispose();
      const mats = Array.isArray(n.material) ? n.material : n.material ? [n.material] : [];
      for (const m of mats) m.dispose();
    });
    this.root.clear();
  }

  /** Permukaan papan tersimpan untuk satu bahan, dipetakan dalam mm panel. */
  boardTexture(hex, kind) {
    this.boards = this.boards || new Map();
    const key = `${hex}|${kind}`;
    if (!this.boards.has(key)) {
      const canvas = boardCanvas(hex, kind);
      let tex = null;
      if (canvas) {
        tex = new THREE.CanvasTexture(canvas);
        tex.wrapS = THREE.RepeatWrapping;
        tex.wrapT = THREE.RepeatWrapping;
        tex.repeat.set(1 / TILE_MM, 1 / TILE_MM);
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.anisotropy = this.renderer.capabilities.getMaxAnisotropy();
      }
      this.boards.set(key, tex);
    }
    return this.boards.get(key);
  }

  build(tray, opts = {}) {
    const pale = opts.backdrop === 'light';
    this.hemi.groundColor.set(pale ? 0xd7dbe2 : 0x2a2f38);
    this.hemi.intensity = pale ? 1.9 : 1.5;
    this.ground.material.opacity = pale ? 0.16 : 0.28;

    this.disposeBuild();

    const t = tray.params.thickness;
    const color = new THREE.Color(opts.color || '#d8b483');
    // Tepi potong ialah apa yang sebenarnya nampak pada dulang siap: hangus
    // hampir hitam pada kayu dan MDF, sedikit berwarna stok di bawahnya.
    const edge = opts.charred
      ? color.clone().multiplyScalar(0.45)
      : color.clone().multiplyScalar(0.8);

    const grain = this.boardTexture(opts.color || '#d8b483', opts.grain || 'wood');
    const faceMat = new THREE.MeshStandardMaterial({
      color: grain ? 0xffffff : color,
      map: grain,
      roughness: grain ? 0.68 : 0.4,
      metalness: 0.02,
    });
    const sideMat = new THREE.MeshStandardMaterial({
      color: edge, roughness: opts.charred ? 0.95 : 0.4, metalness: 0.0,
    });

    for (const panel of tray.panels) {
      const group = new THREE.Group();
      group.applyMatrix4(View3D.panelMatrix(panel));
      const shapes = ringsToShapes([panel.outline, ...panel.holes]);
      const geom = new THREE.ExtrudeGeometry(shapes, { depth: t, bevelEnabled: false });
      geom.translate(0, 0, -t);
      const mesh = new THREE.Mesh(geom, [faceMat, sideMat]);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.userData.panelId = panel.id;
      group.add(mesh);
      this.root.add(group);
    }

    this.setupDims(tray);

    const L = tray.params.length;
    const W = tray.params.width;
    this.root.position.set(-L / 2, -W / 2, 0);
    this.ground.position.z = -0.05;
    this.controls.target.set(0, 0, tray.params.height / 2);
    this.size = Math.max(L, W, tray.params.height);
    if (!this._framed) { this.frame(); this._framed = true; }
  }

  /** Tiga garis saksi dilukis sebagai tindanan SVG supaya kekal tajam pada sebarang zum. */
  setupDims(tray) {
    const { length: L, width: W, height: H } = tray.params;
    const P = (x, y, z) => [x - L / 2, y - W / 2, z];
    const unit = (v) => {
      const m = Math.hypot(v[0], v[1], v[2]) || 1;
      return [v[0] / m, v[1] / m, v[2] / m];
    };
    this.dimOffset = Math.max(4, Math.max(L, W, H) * 0.06);
    this.dims = [
      { label: fmtMm(L), a: P(0, 0, H), b: P(L, 0, H), dir: unit([0, 0, 1]) },
      { label: fmtMm(W), a: P(L, 0, H), b: P(L, W, H), dir: unit([0, 0, 1]) },
      { label: fmtMm(H), a: P(L, 0, 0), b: P(L, 0, H), dir: unit([1, 0, 0]) },
    ];
    this.dimLayer.replaceChildren();
    for (const d of this.dims) {
      d.extA = svg('line', { class: 'dim-ext' });
      d.extB = svg('line', { class: 'dim-ext' });
      d.line = svg('line', { class: 'dim-line' });
      d.headA = svg('polygon', { class: 'dim-head' });
      d.headB = svg('polygon', { class: 'dim-head' });
      d.text = svg('text', { class: 'dim-text' });
      d.text.textContent = d.label;
      this.dimLayer.append(d.extA, d.extB, d.line, d.headA, d.headB, d.text);
    }
  }

  project(p) {
    const v = new THREE.Vector3(p[0], p[1], p[2]).project(this.camera);
    const w = this.container.clientWidth || 1;
    const h = this.container.clientHeight || 1;
    return [(v.x * 0.5 + 0.5) * w, (-v.y * 0.5 + 0.5) * h, v.z];
  }

  updateDims() {
    if (!this.dims || this.hideDims) return;
    const w = this.container.clientWidth || 1;
    const h = this.container.clientHeight || 1;
    this.dimLayer.setAttribute('viewBox', `0 0 ${w} ${h}`);
    const off = this.dimOffset;
    const along = (p, dir, k) => [p[0] + dir[0] * k, p[1] + dir[1] * k, p[2] + dir[2] * k];

    for (const d of this.dims) {
      const A = this.project(along(d.a, d.dir, off));
      const B = this.project(along(d.b, d.dir, off));
      const dx = B[0] - A[0];
      const dy = B[1] - A[1];
      const len = Math.hypot(dx, dy) || 1;
      const hide = len < 30 || A[2] > 1 || B[2] > 1;
      for (const el of [d.extA, d.extB, d.line, d.headA, d.headB, d.text]) {
        el.style.display = hide ? 'none' : '';
      }
      if (hide) continue;

      const ux = dx / len;
      const uy = dy / len;
      const set = (el, p, q) => {
        el.setAttribute('x1', p[0]); el.setAttribute('y1', p[1]);
        el.setAttribute('x2', q[0]); el.setAttribute('y2', q[1]);
      };
      set(d.extA, this.project(along(d.a, d.dir, off * 0.22)),
        this.project(along(d.a, d.dir, off * 1.35)));
      set(d.extB, this.project(along(d.b, d.dir, off * 0.22)),
        this.project(along(d.b, d.dir, off * 1.35)));
      set(d.line, A, B);

      const head = (p, hx, hy) => {
        const s2 = 9;
        const nx = -hy;
        const ny = hx;
        return `${p[0]},${p[1]} ${p[0] + hx * s2 + nx * s2 * 0.34},${p[1] + hy * s2 + ny * s2 * 0.34} `
          + `${p[0] + hx * s2 - nx * s2 * 0.34},${p[1] + hy * s2 - ny * s2 * 0.34}`;
      };
      d.headA.setAttribute('points', head(A, ux, uy));
      d.headB.setAttribute('points', head(B, -ux, -uy));

      const base = this.project(d.a);
      let ox = A[0] - base[0];
      let oy = A[1] - base[1];
      const om = Math.hypot(ox, oy) || 1;
      ox /= om;
      oy /= om;
      d.text.setAttribute('x', (A[0] + B[0]) / 2 + ox * 13);
      d.text.setAttribute('y', (A[1] + B[1]) / 2 + oy * 13 + 4);
    }
  }

  frame() {
    const d = (this.size || 150) * 2.3;
    this.camera.position.set(d * 0.55, -d * 0.7, d * 0.6);
    this.controls.update();
  }

  setView(name) {
    const d = (this.size || 150) * 2.4;
    const h = (this.size || 150) * 0.4;
    const map = {
      persp: [d * 0.55, -d * 0.7, d * 0.6],
      front: [0, -d, h],
      top: [0, -0.001, d],
    };
    const p = map[name] || map.persp;
    this.camera.position.set(...p);
    this.controls.update();
  }
}
