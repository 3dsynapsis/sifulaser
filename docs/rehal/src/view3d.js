// 3D preview, and the default view - because what is being decided here is a
// folded stand at a reading angle, not a sheet of cut lines.
//
// Every piece is extruded from exactly the rings the exporter writes, so a hole
// you see here is a hole the laser will cut, and the panel really does lean at
// the angle the tipping calculation was run on rather than being drawn near it.
//
// Ported from Stand Nama's viewer, which was itself trimmed out of the Box
// Maker's. What is added is the book: a slab the cut file cannot show, drawn at
// the real angle on the corner the trough was measured from. Without it the
// angle is a number in the inspector; with it you can see whether a Quran would
// sit on this thing. The same trick the Keychain viewer uses for its split ring.
//
// CONVENTIONS, because neither of them raises anything when it is wrong:
// outlines and holes are PAIRS, engrave paths are FLAT, and frame.N is the
// OUTWARD normal - so the board hangs a thickness BEHIND the frame plane.

import * as THREE from '../vendor/three.module.js';
import { OrbitControls } from '../vendor/OrbitControls.js';
import { boardCanvas, TILE_MM } from './texture.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

const svg = (name, attrs = {}) => {
  const n = document.createElementNS(SVG_NS, name);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, String(v));
  return n;
};

const fmtMm = (v) => `${Math.round(v)}mm`;

/** A flat [x0,y0,x1,y1,...] engraving path back as [x,y] pairs. */
const flatToRing = (flat) => {
  const out = [];
  for (let k = 0; k + 1 < flat.length; k += 2) out.push([flat[k], flat[k + 1]]);
  return out;
};

function pointInRing(pt, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if ((yi > pt[1]) !== (yj > pt[1])
        && pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi) {
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

/**
 * Split a flat list of rings into outer shapes plus their holes by nesting
 * depth.
 *
 * Winding is not enough to decide this. Seventy-odd pattern cells, a medallion
 * and a row of mortises arrive in one list with no record of which contains
 * which, so containment is counted instead. An odd depth is a hole, an even one
 * is a piece - which also gets the awkward case right: a ring at depth two is
 * an island, and it comes back solid because that is what would drop out of the
 * sheet. The connectivity prover is what stops one ever getting this far; this
 * would at least draw it if one did.
 */
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
    // A ring can sit inside several outers at once; it belongs to the tightest
    // one, or a pattern cell would be punched out of the whole plate behind it.
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
    // alpha, so the stage's own backdrop gradient shows through the canvas and
    // the picker at the corner of the stage governs both views at once.
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(38, 1, 1, 8000);
    this.camera.up.set(0, 0, 1);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;

    this.hemi = new THREE.HemisphereLight(0xffffff, 0x2a2f38, 1.5);
    this.scene.add(this.hemi);
    const key = new THREE.DirectionalLight(0xffffff, 2.1);
    key.position.set(320, -420, 520);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.camera.near = 1;
    key.shadow.camera.far = 2400;
    const s = 460;
    Object.assign(key.shadow.camera, {
      left: -s, right: s, top: s, bottom: -s,
    });
    key.shadow.bias = -0.0012;
    this.scene.add(key);
    this.scene.add(new THREE.DirectionalLight(0xdfe9ff, 0.45).translateX(-300));

    // The stand casts onto this and nothing else: a shadow material draws the
    // contact shadow without painting a floor over the backdrop. It is what
    // makes the thing read as sitting on a table rather than floating, which
    // matters more here than on any other tool in the set - the whole question
    // is whether it stays upright on one.
    this.ground = new THREE.Mesh(
      new THREE.PlaneGeometry(6000, 6000),
      new THREE.ShadowMaterial({ opacity: 0.28 }),
    );
    this.ground.receiveShadow = true;
    this.ground.position.z = -0.05;
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
    // updateStyle must stay on: above a devicePixelRatio of 1 the canvas would
    // otherwise keep an intrinsic size of w*dpr CSS pixels and overflow the
    // pane, which also throws the projected dimensions out of register with the
    // object they are measuring.
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

  /** The world matrix that maps a panel's own (u, v, outward) to millimetres. */
  static panelMatrix(panel) {
    const { origin, U, V, N } = panel.frame;
    const u = new THREE.Vector3(...U);
    const v = new THREE.Vector3(...V);
    const n = new THREE.Vector3(...N);
    const o = new THREE.Vector3(...origin);
    // normalisePanel moved every ring to its own bounding-box corner and left
    // the shift behind. Forget this term and the flat view still looks right
    // while the cheeks sit most of a base depth away from the stand.
    const [su, sv] = panel.originShift || [0, 0];
    o.addScaledVector(u, su).addScaledVector(v, sv);
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

  build(result, opts = {}) {
    if (!result || !result.panels || !result.panels.length) {
      this.disposeBuild();
      this.dimLayer.replaceChildren();
      this.dims = null;
      return;
    }

    // A pale backdrop needs a lighter bounce and a softer contact shadow, or
    // the stand reads as a cut-out floating on the page rather than sitting on
    // a desk.
    const pale = opts.backdrop === 'light';
    this.hemi.groundColor.set(pale ? 0xd7dbe2 : 0x2a2f38);
    this.hemi.intensity = pale ? 1.9 : 1.5;
    this.ground.material.opacity = pale ? 0.16 : 0.28;

    this.disposeBuild();

    const t = result.params.thickness;
    const color = new THREE.Color(opts.color || '#c8a86b');
    // Cut edges are most of what you see on a panel with seventy holes in it.
    // Charred near-black on wood and MDF, faintly tinted by the stock
    // underneath; acrylic keeps its own colour.
    const edge = opts.edge ? new THREE.Color(opts.edge) : color.clone().multiplyScalar(0.5);

    // The grain is baked into the map, so the material itself stays neutral.
    const grain = this.boardTexture(opts.color || '#c8a86b', opts.grain || 'wood');
    const faceMat = new THREE.MeshStandardMaterial({
      color: grain ? 0xffffff : color,
      map: grain,
      roughness: grain ? 0.68 : 0.4,
      metalness: 0.02,
      side: THREE.DoubleSide,
    });
    const sideMat = new THREE.MeshStandardMaterial({
      color: edge, roughness: opts.charred === false ? 0.4 : 0.95, metalness: 0.0,
      side: THREE.DoubleSide,
    });
    const burnMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(opts.burn || '#3a2a1c'), roughness: 0.95,
      side: THREE.DoubleSide,
    });
    const lineMat = new THREE.LineBasicMaterial({
      color: new THREE.Color(opts.burn || '#3a2a1c'),
    });

    for (const panel of result.panels) {
      if (!panel.frame) continue;
      const group = new THREE.Group();
      group.applyMatrix4(View3D.panelMatrix(panel));

      const pt = panel.thickness || t;
      const shapes = ringsToShapes([panel.outline, ...panel.holes]);
      if (shapes.length) {
        const geom = new THREE.ExtrudeGeometry(shapes, { depth: pt, bevelEnabled: false });
        // The frame plane is the visible surface, so the board hangs behind it.
        geom.translate(0, 0, -pt);
        const mesh = new THREE.Mesh(geom, [faceMat, sideMat]);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        group.add(mesh);
      }

      // Engraving sits a hair proud of the surface so it never z-fights with it.
      const lift = 0.03;
      const fills = (panel.engraveFill || []).map(flatToRing).filter((r) => r.length > 2);
      if (fills.length) {
        const g = new THREE.ShapeGeometry(ringsToShapes(fills));
        g.translate(0, 0, lift);
        group.add(new THREE.Mesh(g, burnMat));
      }
      for (const flat of panel.engrave || []) {
        const ring = flatToRing(flat);
        if (ring.length < 2) continue;
        const pts = ring.map(([x, y]) => new THREE.Vector3(x, y, lift));
        group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), lineMat));
      }

      this.root.add(group);
    }

    if (opts.showBook !== false && result.book) this.addBook(result.book);

    const [W, D, H] = result.derived.overall;
    // Orbit about the middle of the stand rather than the corner it is built
    // from. x is forward, towards the reader, and the base starts at x = 0.
    this.root.position.set(-D / 2, -W / 2, 0);
    this.setupDims(W, D, H);
    this.controls.target.set(0, 0, H / 2);
    const was = this.standSize || 0;
    this.standSize = Math.max(W, D, H);
    if (!this.framed) {
      this.frame();
      this.framed = true;
    } else if (was > 0 && Math.abs(Math.log(this.standSize / was)) > 0.25) {
      // The framing is deliberately left alone on a rebuild, so that changing a
      // setting does not yank somebody's orbit. But a panel taken from 250 mm
      // to 450 grows out of the frame entirely, and a viewer showing the middle
      // third of the object is not a viewer. So on a large change the camera
      // moves - along the line it is already on, keeping the direction the user
      // chose and changing only how far back it stands.
      const dir = this.camera.position.clone().sub(this.controls.target);
      dir.setLength(Math.max(1, dir.length() * (this.standSize / was)));
      this.camera.position.copy(this.controls.target).add(dir);
      this.controls.update();
    }
  }

  /**
   * The Quran, as a slab.
   *
   * Half transparent on purpose: it is not part of the cut file and must never
   * be mistaken for a piece to make, but it is the only thing on screen that
   * says whether the lip catches the book or fouls it. Its frame comes from the
   * geometry, so if this looks wrong the arithmetic that placed the lip is
   * wrong too - which is exactly what it is here to show.
   */
  addBook(book) {
    const [w, slant, thick] = book.size;
    const geom = new THREE.BoxGeometry(w, slant, thick);
    // BoxGeometry is centred; the frame's origin is the corner the book rests
    // on, so shift it into the positive octant of that frame.
    geom.translate(w / 2, slant / 2, thick / 2);
    const mat = new THREE.MeshStandardMaterial({
      color: 0xf2ece0,
      roughness: 0.85,
      transparent: true,
      opacity: 0.45,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(geom, mat);
    const u = new THREE.Vector3(...book.U);
    const v = new THREE.Vector3(...book.V);
    const n = new THREE.Vector3(...book.N);
    mesh.applyMatrix4(new THREE.Matrix4()
      .makeBasis(u, v, n)
      .setPosition(new THREE.Vector3(...book.origin)));
    this.root.add(mesh);

    const wire = new THREE.LineSegments(
      new THREE.EdgesGeometry(geom),
      new THREE.LineBasicMaterial({ color: 0x6b5a41, transparent: true, opacity: 0.55 }),
    );
    wire.applyMatrix4(mesh.matrix);
    this.root.add(wire);
  }

  /**
   * Width, depth and height as witness lines, drawn as an SVG overlay rather
   * than in the scene so the arrowheads and the type stay crisp at any zoom.
   */
  setupDims(W, D, H) {
    // World x is forward and y is across, so the depth runs along x and the
    // width along y. The root is shifted by (-D/2, -W/2), which is what these
    // corner points have to be written in.
    const P = (x, y, z) => [x - D / 2, y - W / 2, z];
    this.dimOffset = Math.max(6, Math.max(W, D, H) * 0.07);
    this.dims = [
      { label: fmtMm(W), a: P(D, 0, 0), b: P(D, W, 0), dir: [1, 0, 0] },
      { label: fmtMm(D), a: P(0, 0, 0), b: P(D, 0, 0), dir: [0, -1, 0] },
      { label: fmtMm(H), a: P(0, 0, 0), b: P(0, 0, H), dir: [0, -1, 0] },
    ];
    this.dimLayer.replaceChildren();
    for (const dim of this.dims) {
      dim.extA = svg('line', { class: 'dim-ext' });
      dim.extB = svg('line', { class: 'dim-ext' });
      dim.line = svg('line', { class: 'dim-line' });
      dim.headA = svg('polygon', { class: 'dim-head' });
      dim.headB = svg('polygon', { class: 'dim-head' });
      dim.text = svg('text', { class: 'dim-text' });
      dim.text.textContent = dim.label;
      this.dimLayer.append(dim.extA, dim.extB, dim.line, dim.headA, dim.headB, dim.text);
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
      // Foreshortened to nothing, behind the camera, or hanging off the edge
      // of a phone-width stage: a dimension that reads as a smudge, or as half
      // a number cut off by the panel next to it, is worse than no dimension.
      const inside = (q) => q[0] > 26 && q[0] < w - 26 && q[1] > 12 && q[1] < h - 12;
      const hide = len < 34 || A[2] > 1 || B[2] > 1 || !inside(A) || !inside(B);
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

  /** The three-quarter view a stand is normally photographed from. */
  frame() {
    const d = (this.standSize || 300) * 1.9;
    this.camera.position.set(d * 0.85, -d * 0.62, d * 0.5);
    this.controls.update();
  }

  setView(name) {
    const d = (this.standSize || 300) * 2.1;
    const h = (this.standSize || 300) * 0.4;
    const map = {
      persp: [d * 0.85, -d * 0.62, d * 0.5],
      // The side elevation is the one that shows the reading angle, so it is
      // offered as its own button rather than left to be found by dragging.
      side: [0, -d, h],
      front: [d, 0, h],
      top: [0.001, 0, d],
    };
    this.camera.position.set(...(map[name] || map.persp));
    this.controls.target.set(0, 0, h);
    this.controls.update();
  }
}
