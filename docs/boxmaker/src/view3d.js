// 3D preview. Panels are extruded from exactly the same rings the exporter writes,
// so a hole you see here is a hole the laser will cut.

import * as THREE from '../vendor/three.module.js';
import { OrbitControls } from '../vendor/OrbitControls.js';
import { objectRings } from './geom/decor.js';
import { boardCanvas, TILE_MM } from './texture.js';
import { bbox } from './geom/path.js';

const DEG = Math.PI / 180;
// Shared target for a shut drawer. Allocated once: the animate loop runs every
// frame and Vector3.lerp needs something to aim at.
const SLIDE_SHUT = new THREE.Vector3();
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
    // On a phone the stage is ~250 px tall and the buttons along its top and
    // the camera strip along its bottom cover a third of it, so a tall box
    // ends up behind them. There, frame into the band between the two: the
    // camera's full frame is that band, and the drawn window reaches past it.
    const short = h < 560;
    const top = short ? Math.round(Math.min(56, h * 0.16)) : 0;
    const bottom = short ? Math.round(Math.min(92, h * 0.26)) : 0;
    this.camera.aspect = w / (h - top - bottom);
    if (top || bottom) this.camera.setViewOffset(w, h - top - bottom, 0, -top, w, h);
    else this.camera.clearViewOffset();
    this.camera.updateProjectionMatrix();
  }

  animate = () => {
    this.raf = requestAnimationFrame(this.animate);
    this.controls.update();
    this.updateDims();
    // Lids turn about their own x (the hinge runs along the panel); the
    // mihrab's doors turn about their own y, a vertical pin line.
    // A locked mihrab unlocks first - the hook lifts, the bolt draws back, the
    // pin comes out - and only then do the doors swing. Closing runs the other
    // way: doors shut, then it locks.
    // Timed, not per frame: about 0.8 s whatever the frame rate.
    const now = performance.now();
    const dt = Math.min(0.1, (now - (this._lockT ?? now)) / 1000);
    this._lockT = now;
    const locks = this.lockMovers || [];
    if (locks.length) {
      const shut = (this.lidGroups || []).every(({ pivot, axis = 'x' }) => Math.abs(pivot.rotation[axis]) < 0.02);
      const want = this.lidOpen ? 1 : (shut ? 0 : 1);
      const step = dt / 0.8;
      this.lockP = want > this.lockP ? Math.min(want, this.lockP + step) : Math.max(want, this.lockP - step);
      for (const m of locks) View3D.applyLockMove(m, View3D.ease(this.lockP));
    }
    const free = !locks.length || this.lockP >= 1;
    for (const { pivot, sign, axis = 'x', angle = 105 } of this.lidGroups || []) {
      const target = this.lidOpen && free ? sign * angle * DEG : 0;
      pivot.rotation[axis] += (target - pivot.rotation[axis]) * 0.18;
    }
    // A lift-off lid has nothing to swing on, so opening the box raises it
    // straight up instead - the motion you would actually make.
    for (const { node, dist } of this.liftGroups || []) {
      const target = this.lidOpen ? dist : 0;
      node.position.z += (target - node.position.z) * 0.18;
    }
    // A drawer does not swing and does not rise: it comes straight out toward
    // you. `slide` is its own 3-vector rather than a reuse of `lift`, which is a
    // scalar meaning box Z - a drawer given one would float up through the top.
    for (const { node, to } of this.slideGroups || []) {
      node.position.lerp(this.lidOpen ? to : SLIDE_SHUT, 0.18);
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
    // A pale backdrop needs a lighter bounce and a softer contact shadow, or the
    // box looks like a cut-out floating on the page.
    const pale = opts.backdrop === 'light';
    this.hemi.groundColor.set(pale ? 0xd7dbe2 : 0x2a2f38);
    this.hemi.intensity = pale ? 1.9 : 1.5;
    this.ground.material.opacity = pale ? 0.16 : 0.28;

    this.disposeBuild();
    this.meshes = [];
    this.lidGroups = [];
    this.liftGroups = [];
    this.slideGroups = [];
    this.lockMovers = [];
    this.lockP ??= 0;
    const doors = {};
    const lockParts = [];

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
      // A kerf-bent strip is drawn bent. It is never a face to decorate, so it
      // is not pickable either.
      if (panel.bend) {
        this.root.add(this.bentPanel(panel, t, [faceMat, sideMat], lineMat));
        continue;
      }
      const group = new THREE.Group();
      group.applyMatrix4(View3D.panelMatrix(panel));

      const decor = decorFor(panel) || [];
      const cutRings = decor
        .filter((o) => o.process === 'cut')
        .flatMap((o) => objectRings(o, { panel, decor }));
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
        const rings = objectRings(o, { panel, decor });
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

      // A lock part: placed after the doors it rides on (second pass below).
      if (panel.attach || panel.lockMove) {
        lockParts.push({ panel, group });
        continue;
      }

      if (panel.hinge && panel.hinge.axis === 'v') {
        // A door: the pin line runs along the panel's v (world z), through the
        // middle of the board, at u = hinge.u.
        const px = panel.hinge.u - panel.originShift[0];
        const pz = panel.hinge.n ?? 0;
        const inner = new THREE.Group();
        inner.position.set(-px, 0, -pz);
        inner.add(...group.children);
        const pivot = new THREE.Group();
        pivot.position.set(px, 0, pz);
        pivot.add(inner);
        const outer = new THREE.Group();
        outer.applyMatrix4(View3D.panelMatrix(panel));
        outer.add(pivot);
        // A door opens as far as its own stop allows (Mihrab 2.0's frame stops
        // its doors a little past square), or to 100 degrees.
        this.lidGroups.push({ pivot, sign: panel.hinge.sign, axis: 'y', angle: panel.hinge.angle ?? 100 });
        doors[panel.id] = { inner, matrix: View3D.panelMatrix(panel) };
        this.root.add(outer);
        this.meshes.push(mesh);
        continue;
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

      if (panel.lift) {
        const riser = new THREE.Group();
        riser.add(group);
        this.liftGroups.push({ node: riser, dist: panel.lift });
        this.root.add(riser);
        this.meshes.push(mesh);
        continue;
      }

      // All five panels of one drawer carry the identical vector, so the drawer
      // moves as a unit with no grouping - the same trick the lift-off lid uses.
      if (panel.slide) {
        const slider = new THREE.Group();
        slider.add(group);
        this.slideGroups.push({
          node: slider, to: new THREE.Vector3(...panel.slide),
        });
        this.root.add(slider);
        this.meshes.push(mesh);
        continue;
      }

      this.root.add(group);
      this.meshes.push(mesh);
    }

    // Lock parts. One on a door sits in a wrapper that undoes the door's own
    // placement, so inside it the coordinates are the box's - while the door
    // is shut. As the door turns, all of it turns with the door. The part
    // that moves to unlock gets one more group to move.
    for (const { panel, group } of lockParts) {
      const wrap = new THREE.Group();
      let host = this.root;
      const d = panel.attach && doors[panel.attach];
      if (d) {
        wrap.applyMatrix4(d.matrix.clone().invert());
        host = d.inner;
      }
      const mover = new THREE.Group();
      mover.add(group);
      wrap.add(mover);
      host.add(wrap);
      if (panel.lockMove) {
        this.lockMovers.push({ node: mover, move: panel.lockMove });
        View3D.applyLockMove(this.lockMovers[this.lockMovers.length - 1], View3D.ease(this.lockP));
      }
    }

    this.setupDims(box);

    // Centre the box on the origin and drop it onto the ground plane. A mihrab
    // lying on its back turns so its back face (y = W) is the floor and the arch
    // points at the camera: box (x, y, z) -> (L - x, H - z, W - y), centred.
    const L = box.params.length;
    const W = box.params.width;
    const H = box.params.height;
    const lie = !!box.derived.mihrab?.lying;
    if (lie) {
      this.root.rotation.set(-Math.PI / 2, 0, Math.PI, 'ZYX');
      this.root.position.set(L / 2, H / 2, W);
    } else {
      this.root.rotation.set(0, 0, 0, 'XYZ');
      this.root.position.set(-L / 2, -W / 2, 0);
    }
    this.ground.position.z = -0.05;
    this.boxHeight = lie ? W : H;
    this.boxL = L;
    this.boxW = lie ? H : W;
    this.controls.target.set(0, 0, this.boxHeight / 2);
    this.boxSize = Math.max(L, W, H);
    // Reframe on the first build, and when the style or the scale changes a
    // lot (a mihrab is three times the default tray) - but not on every
    // slider step, which would yank the camera about while dragging.
    const frameKey = `${box.params.style}|${lie}|${Math.round(Math.log(this.boxSize) * 3)}`;
    if (!this._framed || frameKey !== this._frameKey) { this.frame(); this._framed = true; }
    this._frameKey = frameKey;
  }

  /**
   * Put a lock part where it is at progress p: 0 locked, 1 open. `turn` is a
   * rotation about an axis through a point; `path` runs through waypoints
   * (offsets from where the part is cut to sit), one equal share of p each.
   */
  static ease(p) { return p * p * (3 - 2 * p); }

  static applyLockMove({ node, move }, p) {
    if (move.turn) {
      const { at, axis, angle } = move.turn;
      const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(...axis).normalize(), angle * DEG * p);
      const a = new THREE.Vector3(...at);
      node.quaternion.copy(q);
      node.position.copy(a).sub(a.clone().applyQuaternion(q));
      return;
    }
    const pts = [[0, 0, 0], ...(move.path || [])];
    const n = pts.length - 1;
    if (!n) return;
    const sIdx = Math.min(n - 1e-9, Math.max(0, p * n));
    const i = Math.floor(sIdx);
    const f = sIdx - i;
    const [a, b] = [pts[i], pts[i + 1]];
    node.position.set(a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f);
  }

  /**
   * A flat panel bent along `panel.bend.path`: rows of [s, a, b, na, nb], the
   * board's mid-plane with its outward normal, by arc length s. `plane` says
   * which two box axes (a, b) are: 'xz' for the mihrab's roof, whose width
   * runs along Y from y0; 'xy' for a round box's wall, whose height runs up Z
   * from z0.
   * The flat shape is extruded exactly as every other panel, then each vertex
   * is moved onto the curve - the kerf slots are dense wherever it bends, so
   * the triangulation never spans a curved stretch with one flat triangle.
   */
  bentPanel(panel, t, mats, lineMat) {
    const { path, y0 = 0, z0 = 0, plane = 'xz' } = panel.bend;
    const shapes = ringsToShapes([panel.outline, ...panel.holes]);
    const geom = new THREE.ExtrudeGeometry(shapes, { depth: t, bevelEnabled: false, curveSegments: 1 });
    geom.translate(0, 0, -t);
    const pos = geom.attributes.position;
    const [su, sv] = panel.originShift;
    let j = 0;
    const sample = (s) => {
      while (j > 0 && path[j][0] > s) j--;
      while (j < path.length - 2 && path[j + 1][0] < s) j++;
      const a = path[j];
      const b = path[Math.min(j + 1, path.length - 1)];
      const f = b[0] > a[0] ? Math.min(1, Math.max(0, (s - a[0]) / (b[0] - a[0]))) : 0;
      const L = (k) => a[k] + (b[k] - a[k]) * f;
      return [L(1), L(2), L(3), L(4)];
    };
    for (let i = 0; i < pos.count; i++) {
      const s = pos.getX(i) + su;
      const v = pos.getY(i) + sv;
      const d = pos.getZ(i) + t / 2;          // 0 at the mid-plane, +t/2 outside
      const [a, b, na, nb] = sample(s);
      if (plane === 'xy') pos.setXYZ(i, a + na * d, b + nb * d, z0 + v);
      else pos.setXYZ(i, a + na * d, y0 + v, b + nb * d);
    }
    geom.computeVertexNormals();
    const mesh = new THREE.Mesh(geom, mats);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    void lineMat;
    return mesh;
  }

  /**
   * Three witness lines drawn as an SVG overlay rather than in the scene, so the
   * arrowheads and the type stay crisp at any zoom.
   */
  setupDims(box) {
    const { length: L, width: W, height: H } = box.params;
    // In the box's own axes, then turned the way build() turns the model.
    const lie = !!box.derived.mihrab?.lying;
    const P = lie ? (x, y, z) => [L / 2 - x, H / 2 - z, W - y] : (x, y, z) => [x - L / 2, y - W / 2, z];
    const unit = (v0) => {
      const v = lie ? [-v0[0], -v0[2], -v0[1]] : v0;
      const m = Math.hypot(v[0], v[1], v[2]) || 1;
      return [v[0] / m, v[1] / m, v[2] / m];
    };
    // Each witness sits off the box along its own outward direction, the way a
    // drawing would place it, rather than lying on the edge itself.
    this.dimOffset = Math.max(4, Math.max(L, W, H) * 0.06);
    // The witnesses measure whatever the three fields mean. Read as an inside
    // size they move in to the faces that bound the space - wall to wall, floor
    // to rim - and say "inside", because a line that still spanned the outside
    // of the box with the inside number on it would be a wrong drawing.
    const dm = box.derived.dims;
    const t = box.params.thickness;
    const inBox = dm && dm.measure === 'inside' && dm.what === 'box' && dm.inner;
    // A drawer cabinet read as an inside size: the drawer's own space cannot be
    // dimensioned on a closed cabinet, so the lines stay on the cabinet and are
    // labelled as what they are.
    const tag = dm && dm.measure === 'inside' && !inBox ? ' outside' : '';
    if (box.derived.round) {
      // A drum has no corners to hang witness lines on: one diameter across the
      // top through the centre, and the height up the right-hand side.
      const R = L / 2;
      const ro = box.derived.round;
      const zTop = ro.lid ? H : H;
      this.dims = inBox
        ? [
          { label: `Ø ${fmtMm(dm.inner.l)} inside`, a: P(t, R, zTop), b: P(L - t, R, zTop), dir: unit([0, 0, 1]) },
          { label: `${fmtMm(dm.inner.h)} inside`, a: P(L, R, 2 * t), b: P(L, R, 2 * t + dm.inner.h), dir: unit([1, 0, 0]) },
        ]
        : [
          { label: `Ø ${fmtMm(L)}`, a: P(0, R, zTop), b: P(L, R, zTop), dir: unit([0, 0, 1]) },
          { label: fmtMm(H), a: P(L, R, 0), b: P(L, R, H), dir: unit([1, 0, 0]) },
        ];
    } else if (inBox) {
      const z0 = box.derived.floorZ + t;
      const z1 = box.derived.wallH;
      this.dims = [
        { label: `${fmtMm(dm.inner.l)} inside`, a: P(t, 0, H), b: P(L - t, 0, H), dir: unit([0, 0, 1]) },
        { label: `${fmtMm(dm.inner.w)} inside`, a: P(L, t, H), b: P(L, W - t, H), dir: unit([0, 0, 1]) },
        { label: `${fmtMm(dm.inner.h)} inside`, a: P(L, 0, z0), b: P(L, 0, z1), dir: unit([1, 0, 0]) },
      ];
    } else {
      this.dims = [
        { label: fmtMm(L) + tag, a: P(0, 0, H), b: P(L, 0, H), dir: unit([0, 0, 1]) },
        { label: fmtMm(W) + tag, a: P(L, 0, H), b: P(L, W, H), dir: unit([0, 0, 1]) },
        { label: fmtMm(H) + tag, a: P(L, 0, 0), b: P(L, 0, H), dir: unit([1, 0, 0]) },
      ];
    }
    const mark = inBox ? ' dim-in' : '';
    this.dimLayer.replaceChildren();
    for (const d of this.dims) {
      d.extA = svg('line', { class: 'dim-ext' });
      d.extB = svg('line', { class: 'dim-ext' });
      d.line = svg('line', { class: `dim-line${mark}` });
      d.headA = svg('polygon', { class: `dim-head${mark}` });
      d.headB = svg('polygon', { class: `dim-head${mark}` });
      d.text = svg('text', { class: `dim-text${mark}` });
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

  /**
   * How far back the camera has to sit, along a direction of length `k`, for
   * the whole box to fit the stage. The fixed 2.5 x the largest side was set on
   * a desktop stage; on a phone the stage is short, and a tall box (a mihrab is
   * 260 mm high) had its top and its base cut off. So: never nearer than that,
   * but further back when the box's bounding sphere would not fit.
   */
  fitDistance(base, k = 1) {
    const r = 0.5 * Math.hypot(this.boxL || 150, this.boxW || 150, this.boxHeight || 150);
    const vh = this.camera.fov * Math.PI / 360;
    const hh = Math.atan(Math.tan(vh) * this.camera.aspect);
    const need = (r / Math.sin(Math.min(vh, hh))) * 1.08;
    return Math.max(base, need / k);
  }

  frame() {
    const d = this.fitDistance((this.boxSize || 150) * 2.5, Math.hypot(0.6, 0.75, 0.55));
    this.camera.position.set(d * 0.6, -d * 0.75, d * 0.55);
    this.controls.update();
  }

  setLidOpen(v) { this.lidOpen = v; }

  setView(name) {
    const d = this.fitDistance((this.boxSize || 150) * 2.6);
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
