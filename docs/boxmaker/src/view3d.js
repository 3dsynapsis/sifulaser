// 3D preview. Panels are extruded from exactly the same rings the exporter writes,
// so a hole you see here is a hole the laser will cut.

import * as THREE from '../vendor/three.module.js';
import { OrbitControls } from '../vendor/OrbitControls.js';
import { objectRings } from './geom/decor.js';
import { boardCanvas, TILE_MM } from './texture.js';
import { bbox } from './geom/path.js';

const DEG = Math.PI / 180;
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

/** Split a flat ring list into outer shapes plus their holes by nesting depth. */
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

function areaOf(ring) {
  let a = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    a += ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1];
  }
  return a / 2;
}

export class View3D {
  constructor(container, { onPickFace } = {}) {
    this.container = container;
    this.onPickFace = onPickFace;
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

    const hemi = new THREE.HemisphereLight(0xffffff, 0x2a2f38, 1.5);
    this.scene.add(hemi);
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

    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();
    this.hovered = null;
    this.meshes = [];

    this._onMove = (e) => this.handleMove(e);
    this._onDown = (e) => { this.downAt = [e.clientX, e.clientY]; };
    this._onClick = (e) => this.handleClick(e);
    this._onLeave = () => this.setHover(null);
    const el = this.renderer.domElement;
    el.addEventListener('pointermove', this._onMove);
    el.addEventListener('pointerdown', this._onDown);
    el.addEventListener('click', this._onClick);
    el.addEventListener('pointerleave', this._onLeave);

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(container);
    this.resize();
    this.animate();
  }

  resize() {
    const w = this.container.clientWidth || 1;
    const h = this.container.clientHeight || 1;
    // updateStyle must stay on: with a devicePixelRatio above 1 the canvas element
    // would otherwise keep an intrinsic size of w*dpr CSS pixels and overflow the
    // pane, which also throws the projected dimension overlay out of register.
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  animate = () => {
    this.raf = requestAnimationFrame(this.animate);
    this.controls.update();
    this.updateDims();
    for (const { pivot, sign } of this.lidGroups || []) {
      const target = this.lidOpen ? sign * 105 * DEG : 0;
      pivot.rotation.x += (target - pivot.rotation.x) * 0.18;
    }
    this.renderer.render(this.scene, this.camera);
  };

  dispose() {
    cancelAnimationFrame(this.raf);
    this.resizeObserver.disconnect();
    const el = this.renderer.domElement;
    el.removeEventListener('pointermove', this._onMove);
    el.removeEventListener('pointerdown', this._onDown);
    el.removeEventListener('click', this._onClick);
    el.removeEventListener('pointerleave', this._onLeave);
    this.disposeBuild();
    for (const t of this.textures?.values() || []) t.dispose();
    for (const t of this.boards?.values() || []) t?.dispose();
    this.renderer.dispose();
    this.dimLayer.remove();
    el.remove();
  }

  /** Build the world matrix that maps panel local (u, v, outward) to millimetres. */
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

  /** Free the GPU resources from the previous build before making new ones. */
  disposeBuild() {
    this.root.traverse((n) => {
      if (n.geometry) n.geometry.dispose();
      const mats = Array.isArray(n.material) ? n.material : n.material ? [n.material] : [];
      for (const m of mats) m.dispose();
    });
    this.root.clear();
  }

  /** Cached board surface for a material, mapped in panel millimetres. */
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

  texture(src) {
    this.textures = this.textures || new Map();
    if (!this.textures.has(src)) {
      const tex = new THREE.TextureLoader().load(src);
      tex.colorSpace = THREE.SRGBColorSpace;
      this.textures.set(src, tex);
    }
    return this.textures.get(src);
  }

  build(box, decorFor, opts = {}) {
    this.disposeBuild();
    this.meshes = [];
    this.lidGroups = [];

    const t = box.params.thickness;
    const color = new THREE.Color(opts.color || '#d8b483');
    // Cut edges are what you actually see on a finished box: charred near-black on
    // wood and MDF, faintly tinted by the stock underneath.
    const edge = opts.edge
      ? new THREE.Color(opts.edge)
      : color.clone().multiplyScalar(0.55);

    // The grain is baked into the map, so the material itself stays neutral.
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
    const burnMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(opts.burn || '#3a2a1c'), roughness: 0.95,
    });
    const lineMat = new THREE.LineBasicMaterial({ color: new THREE.Color(opts.burn || '#3a2a1c') });

    for (const panel of box.panels) {
      const group = new THREE.Group();
      group.applyMatrix4(View3D.panelMatrix(panel));

      const decor = decorFor(panel) || [];
      const cutRings = decor
        .filter((o) => o.process === 'cut')
        .flatMap((o) => objectRings(o));
      const shapes = ringsToShapes([panel.outline, ...panel.holes, ...cutRings]);

      const geom = new THREE.ExtrudeGeometry(shapes, { depth: t, bevelEnabled: false });
      geom.translate(0, 0, -t);
      const mesh = new THREE.Mesh(geom, [faceMat, sideMat]);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.userData.panelId = panel.id;
      group.add(mesh);

      // Engraving sits a hair proud of the face so it never z-fights.
      const lift = 0.02;
      for (const o of decor) {
        if (o.process === 'cut') continue;
        const rings = objectRings(o);
        if (!rings.length) continue;
        if (o.process === 'engrave-fill') {
          const g = new THREE.ShapeGeometry(ringsToShapes(rings));
          g.translate(0, 0, lift);
          const m = new THREE.Mesh(g, burnMat);
          m.userData.panelId = panel.id;
          group.add(m);
        } else {
          for (const r of rings) {
            const pts = r.map(([x, y]) => new THREE.Vector3(x, y, lift));
            pts.push(pts[0].clone());
            group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), lineMat));
          }
        }
      }

      for (const o of decor) {
        if (o.type !== 'image' || !o.src) continue;
        const tex = this.texture(o.src);
        const plane = new THREE.Mesh(
          new THREE.PlaneGeometry(o.w, o.h),
          new THREE.MeshStandardMaterial({ map: tex, transparent: true, roughness: 0.9 }),
        );
        plane.position.set(o.x + o.w / 2, o.y + o.h / 2, lift);
        if (o.rot) plane.rotation.z = -o.rot * DEG;
        group.add(plane);
      }

      if (panel.hinge) {
        // Swing the panel about its pin line so "open the box" is a real rotation.
        const py = panel.hinge.v - panel.originShift[1];
        const inner = new THREE.Group();
        inner.position.set(0, -py, 0);
        inner.add(...group.children);
        const pivot = new THREE.Group();
        pivot.position.set(0, py, 0);
        pivot.add(inner);
        const outer = new THREE.Group();
        outer.applyMatrix4(View3D.panelMatrix(panel));
        outer.add(pivot);
        this.lidGroups.push({ pivot, sign: panel.hinge.sign });
        this.root.add(outer);
        this.meshes.push(mesh);
        continue;
      }

      this.root.add(group);
      this.meshes.push(mesh);
    }

    this.setupDims(box);

    // Centre the box on the origin and drop it onto the ground plane.
    const L = box.params.length;
    const W = box.params.width;
    this.root.position.set(-L / 2, -W / 2, 0);
    this.ground.position.z = -0.05;
    this.boxHeight = box.params.height;
    this.controls.target.set(0, 0, box.params.height / 2);
    this.boxSize = Math.max(L, W, box.params.height);
    if (!this._framed) { this.frame(); this._framed = true; }
  }

  /**
   * Three witness lines drawn as an SVG overlay rather than in the scene, so the
   * arrowheads and the type stay crisp at any zoom.
   */
  setupDims(box) {
    const { length: L, width: W, height: H } = box.params;
    const P = (x, y, z) => [x - L / 2, y - W / 2, z];
    const unit = (v) => {
      const m = Math.hypot(v[0], v[1], v[2]) || 1;
      return [v[0] / m, v[1] / m, v[2] / m];
    };
    // Each witness sits off the box along its own outward direction, the way a
    // drawing would place it, rather than lying on the edge itself.
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
    if (!this.dims) return;
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
      // witness lines: start clear of the corner, run just past the dimension line
      set(d.extA, this.project(along(d.a, d.dir, off * 0.22)),
        this.project(along(d.a, d.dir, off * 1.35)));
      set(d.extB, this.project(along(d.b, d.dir, off * 0.22)),
        this.project(along(d.b, d.dir, off * 1.35)));
      set(d.line, A, B);

      // arrowheads point outwards, tips landing on the witness lines
      const head = (p, hx, hy) => {
        const s2 = 9;
        const nx = -hy;
        const ny = hx;
        return `${p[0]},${p[1]} ${p[0] + hx * s2 + nx * s2 * 0.34},${p[1] + hy * s2 + ny * s2 * 0.34} `
          + `${p[0] + hx * s2 - nx * s2 * 0.34},${p[1] + hy * s2 - ny * s2 * 0.34}`;
      };
      d.headA.setAttribute('points', head(A, ux, uy));
      d.headB.setAttribute('points', head(B, -ux, -uy));

      // the label sits further out along the same direction as the offset
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
    const d = (this.boxSize || 150) * 2.5;
    this.camera.position.set(d * 0.6, -d * 0.75, d * 0.55);
    this.controls.update();
  }

  setLidOpen(v) { this.lidOpen = v; }

  setView(name) {
    const d = (this.boxSize || 150) * 2.6;
    const h = (this.boxSize || 150) * 0.4;
    const map = {
      persp: [d * 0.6, -d * 0.75, d * 0.55],
      front: [0, -d, h],
      back: [0, d, h],
      left: [-d, 0, h],
      right: [d, 0, h],
      top: [0, -0.001, d],
      bottom: [0, -0.001, -d],
    };
    const p = map[name] || map.persp;
    this.camera.position.set(...p);
    this.controls.update();
  }

  pick(event) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hits = this.raycaster.intersectObjects(this.meshes, false);
    return hits.length ? hits[0].object.userData.panelId : null;
  }

  setHover(id) {
    if (this.hovered === id) return;
    this.hovered = id;
    for (const m of this.meshes) {
      const on = m.userData.panelId === id;
      const mats = Array.isArray(m.material) ? m.material : [m.material];
      m.material = mats;
      m.userData.hover = on;
    }
    this.applyHover();
    this.container.style.cursor = id ? 'pointer' : '';
  }

  applyHover() {
    for (const m of this.meshes) {
      const mats = Array.isArray(m.material) ? m.material : [m.material];
      if (!m.userData.baseEmissive) {
        m.userData.baseEmissive = mats.map(() => 0);
      }
    }
    // Emissive tint on a shared material would light every panel, so highlight with
    // a per-mesh overlay colour instead.
    for (const m of this.meshes) {
      const hovered = m.userData.hover;
      if (hovered && !m.userData.hl) {
        const g = m.geometry.clone();
        const hl = new THREE.Mesh(g, new THREE.MeshBasicMaterial({
          color: 0x4ade80, transparent: true, opacity: 0.28, depthWrite: false,
        }));
        hl.scale.setScalar(1.0005);
        m.add(hl);
        m.userData.hl = hl;
      } else if (!hovered && m.userData.hl) {
        m.remove(m.userData.hl);
        m.userData.hl.geometry.dispose();
        m.userData.hl.material.dispose();
        m.userData.hl = null;
      }
    }
  }

  handleMove(e) { this.setHover(this.pick(e)); }

  // A left-drag that orbits the camera happens to end over a face; that is not a
  // click on it. Only a pointer that barely moved counts.
  static DRAG_SLOP = 5;

  handleClick(e) {
    if (this.downAt) {
      const moved = Math.hypot(e.clientX - this.downAt[0], e.clientY - this.downAt[1]);
      this.downAt = null;
      if (moved > View3D.DRAG_SLOP) return;
    }
    const id = this.pick(e);
    if (id && this.onPickFace) this.onPickFace(id);
  }
}

export { bbox };
