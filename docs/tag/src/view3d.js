// 3D preview: the finished tag, glued up, at its real thickness.
//
// Ported from the Box Maker, which is where this machinery started, by way of
// the Stand's simpler per-panel handling. The lighting, the board textures, the
// procedural grain, the SVG dimension overlay and the ring-nesting are all
// theirs; what is new here is what a tag needs and a box does not.
//
// ONE OBJECT, NOT TWO PIECES. A tag leaves the bed as two identical outlines and
// is glued back to back, so the finished thing is a single plate of board twice
// the thickness with the name on one face and the contact details on the other.
// Showing the two pieces side by side would show the cut file, which is what the
// 2D view is already for; showing the glued object means the back is genuinely
// on the back, and reading it means turning the tag round. That is the one thing
// this view can do that no flat drawing can, so the whole scene is arranged
// around making it easy: the tag stands upright, the camera cannot drop below
// the ground, and Front / Back in the stage swing the camera rather than
// swapping the drawing.
//
// Where each piece sits, and which way round it faces, is in geom/assembly.js -
// no DOM, no three.js, and tested. This file only paints what that says.

import * as THREE from '../vendor/three.module.js';
import { OrbitControls } from '../vendor/OrbitControls.js';
import { assembly } from './geom/assembly.js';
import { objectRings } from './geom/decor.js';
import { boardCanvas, TILE_MM } from './texture.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const DEG = Math.PI / 180;

// Two pieces glued face to face leave a glue line you can see on a finished tag.
// It is drawn by shortening each extrusion by this much rather than by moving
// the pieces apart, so the two outer surfaces stay exactly where the arithmetic
// in assembly.js puts them and the tag still measures its true thickness.
const GLUE_GAP = 0.04;

// How wide a burnt line reads. The beam is finer than this, but a hairline
// primitive at one device pixel disappears the moment the tag is not filling the
// screen - and on a tag the lettering IS the product, so it is drawn as real
// ribbon geometry on the surface instead of as a GL line.
const BURN_W = 0.32;

// Engraving sits this far proud of the surface so it can never z-fight with it.
const LIFT = 0.02;

const svg = (name, attrs = {}) => {
  const n = document.createElementNS(SVG_NS, name);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, String(v));
  return n;
};

const fmtMm = (v) => `${Math.round(v * 10) / 10}mm`;

/** A flat [x0,y0,x1,y1,...] path back as [x,y] pairs. */
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
 * Split a flat list of rings into outer shapes plus their holes by nesting depth.
 *
 * Winding is not enough to decide this: imported artwork arrives as a bag of
 * rings with no record of which contains which, so containment is counted
 * instead. An odd depth is a hole, an even one is a piece - which also gets the
 * awkward case right, the island inside the counter of an 'O' coming back solid,
 * because that is what stays on the tag.
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
    // one, or a letter's counter would be punched through the whole tag behind it.
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

/**
 * Turn polylines into flat ribbon geometry lying on the surface.
 *
 * Each segment becomes its own quad, plus a square cap at every joint. Overlaps
 * rather than mitres: the whole thing is one flat colour at one height, so
 * overlapping quads are indistinguishable from a properly joined stroke and
 * cannot produce the spikes a mitre does on a tight corner - and the lettering
 * on a tag is nothing but tight corners.
 *
 * Returns null when there is nothing to draw, so the caller can skip the mesh.
 */
export function ribbonGeometry(polylines, width, z = 0) {
  const half = width / 2;
  const verts = [];
  const quad = (ax, ay, bx, by, cx, cy, dx, dy) => {
    verts.push(ax, ay, z, bx, by, z, cx, cy, z, ax, ay, z, cx, cy, z, dx, dy, z);
  };
  for (const pts of polylines) {
    if (!pts || pts.length < 2) continue;
    for (let i = 0; i + 1 < pts.length; i++) {
      const [x0, y0] = pts[i];
      const [x1, y1] = pts[i + 1];
      const dx = x1 - x0;
      const dy = y1 - y0;
      const len = Math.hypot(dx, dy);
      if (len < 1e-9) continue;
      const nx = (-dy / len) * half;
      const ny = (dx / len) * half;
      // Wound counter-clockwise about local +Z, the same way as the joint
      // squares below. Get this backwards and every segment is back-facing while
      // the joints are not, so the lettering renders as a scatter of dots -
      // which is exactly what it did the first time.
      quad(x0 - nx, y0 - ny, x1 - nx, y1 - ny, x1 + nx, y1 + ny, x0 + nx, y0 + ny);
    }
    // Square the joints and the two ends, so a corner is not a notch.
    for (const [x, y] of pts) {
      quad(x - half, y - half, x + half, y - half, x + half, y + half, x - half, y + half);
    }
  }
  if (!verts.length) return null;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  g.computeVertexNormals();
  return g;
}

export class View3D {
  constructor(container) {
    this.container = container;
    // alpha, so the stage's own backdrop gradient shows through the canvas and
    // the 3D pane sits on the same ground as the 2D one.
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(38, 1, 0.5, 4000);
    this.camera.up.set(0, 0, 1);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    // The tag stands on the ground, so there is nothing to see from underneath
    // and a camera that drops below the floor only ever looks confusing. Held
    // just short of the horizon at the bottom and just short of straight down at
    // the top, which leaves the whole horizontal sweep free - and the horizontal
    // sweep is the one that carries you round to the back.
    this.controls.minPolarAngle = 12 * DEG;
    this.controls.maxPolarAngle = 88 * DEG;

    this.hemi = new THREE.HemisphereLight(0xffffff, 0x2a2f38, 1.5);
    this.scene.add(this.hemi);
    const key = new THREE.DirectionalLight(0xffffff, 2.0);
    key.position.set(140, -220, 260);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.camera.near = 1;
    key.shadow.camera.far = 1200;
    const s = 220;
    Object.assign(key.shadow.camera, { left: -s, right: s, top: s, bottom: -s });
    key.shadow.bias = -0.0012;
    this.scene.add(key);
    // A fill from behind, so the back of the tag is lit when you orbit round to
    // read it rather than falling into silhouette. Without this the single most
    // useful thing this view does happens in the dark.
    const fill = new THREE.DirectionalLight(0xdfe9ff, 0.85);
    fill.position.set(-120, 240, 160);
    this.scene.add(fill);

    // The tag casts onto this and nothing else: a shadow material draws the
    // contact shadow without painting a floor over the backdrop.
    this.ground = new THREE.Mesh(
      new THREE.PlaneGeometry(3000, 3000),
      new THREE.ShadowMaterial({ opacity: 0.26 }),
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
    // updateStyle must stay on: with a devicePixelRatio above 1 the canvas would
    // otherwise keep an intrinsic size of w*dpr CSS pixels and overflow the
    // pane, which also throws the projected dimensions out of register with the
    // object they are measuring.
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    // The first build can arrive before the flex layout has given the stage a
    // width, and a camera framed against a one-pixel pane - or never framed at
    // all, sitting at the origin inside the tag - is the whole view lost. So the
    // framing is retried here, where the pane's real size first shows up.
    if (!this.framed && this.tagW > 0 && w > 1) {
      this.fitDist = this.fitDistance(this.tagW, this.tagH);
      this.frame();
      this.framed = true;
    }
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
    for (const t of this.images?.values() || []) t?.dispose();
    this.renderer.dispose();
    this.dimLayer.remove();
    this.renderer.domElement.remove();
  }

  /** The world matrix that maps a piece's own (u, v, outward) to millimetres. */
  static pieceMatrix(frame) {
    const { origin, U, V, N } = frame;
    return new THREE.Matrix4()
      .makeBasis(new THREE.Vector3(...U), new THREE.Vector3(...V), new THREE.Vector3(...N))
      .setPosition(new THREE.Vector3(...origin));
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

  /** Cached board surface for a material, mapped in millimetres. */
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

  imageTexture(src) {
    this.images = this.images || new Map();
    if (!this.images.has(src)) {
      const tex = new THREE.TextureLoader().load(src);
      tex.colorSpace = THREE.SRGBColorSpace;
      this.images.set(src, tex);
    }
    return this.images.get(src);
  }

  /**
   * Rebuild the scene from a tag.
   *
   * `decorFor(piece)` hands back the artwork placed on that piece, the same call
   * the 2D editor and the exporters make, so what is painted here is what gets
   * cut rather than a second interpretation of it.
   */
  build(tag, decorFor, opts = {}) {
    this.disposeBuild();
    if (!tag || !tag.pieces.length) {
      this.dimLayer.replaceChildren();
      this.dims = null;
      return;
    }

    const pale = opts.backdrop === 'light';
    this.hemi.groundColor.set(pale ? 0xd7dbe2 : 0x2a2f38);
    this.hemi.intensity = pale ? 1.9 : 1.5;
    this.ground.material.opacity = pale ? 0.15 : 0.26;

    const color = new THREE.Color(opts.color || '#d8b483');
    // Cut edges are most of what you see on the rim of a tag: charred near-black
    // on wood, MDF and card, faintly tinted by the stock underneath; acrylic
    // keeps its own colour, just darker where the light does not reach.
    const edge = opts.edge ? new THREE.Color(opts.edge) : color.clone().multiplyScalar(0.55);
    // The grain is baked into the map, so the material itself stays neutral.
    const grain = this.boardTexture(opts.color || '#d8b483', opts.grain || 'wood');

    const faceMat = new THREE.MeshStandardMaterial({
      color: grain ? 0xffffff : color,
      map: grain,
      roughness: grain ? 0.68 : 0.4,
      metalness: 0.02,
    });
    const sideMat = new THREE.MeshStandardMaterial({
      color: edge, roughness: opts.charred ? 0.95 : 0.4, metalness: 0,
    });
    const burnMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(opts.burn || '#3a2a1c'), roughness: 0.95,
    });

    const built = assembly(tag);
    const depth = Math.max(0.1, built.pieces[0].thickness - GLUE_GAP);

    for (const part of built.pieces) {
      const group = new THREE.Group();
      group.applyMatrix4(View3D.pieceMatrix(part.frame));
      const piece = part.piece;
      const decor = decorFor(piece) || [];

      // Anything set to cut goes through the board, so it is a hole in the
      // extrusion rather than a mark on it.
      const cuts = decor.filter((o) => o.process === 'cut').flatMap((o) => objectRings(o));
      const shapes = ringsToShapes([piece.outline, ...piece.holes, ...cuts]);
      if (shapes.length) {
        const geom = new THREE.ExtrudeGeometry(shapes, { depth, bevelEnabled: false });
        // The frame plane is the visible surface, so the board hangs behind it.
        geom.translate(0, 0, -depth);
        const mesh = new THREE.Mesh(geom, [faceMat, sideMat]);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        group.add(mesh);
      }

      // The tag's own engraving: the border rings are closed, the lettering is
      // open polylines. Both are line work, so both come out as ribbons.
      const lines = [
        ...(piece.borderRings || []).map((r) => [...r, r[0]]),
        ...(piece.strokes || []).map(flatToRing),
      ];
      // Placed artwork set to engrave-line joins them; engrave-fill is solid and
      // is filled as shapes instead.
      const fills = [];
      for (const o of decor) {
        if (o.process === 'cut') continue;
        if (o.type === 'image') continue;
        const rings = objectRings(o);
        if (!rings.length) continue;
        if (o.process === 'engrave-fill') fills.push(...rings);
        else lines.push(...rings.map((r) => [...r, r[0]]));
      }

      if (fills.length) {
        const g = new THREE.ShapeGeometry(ringsToShapes(fills));
        g.translate(0, 0, LIFT);
        group.add(new THREE.Mesh(g, burnMat));
      }
      const ribbon = ribbonGeometry(lines, BURN_W, LIFT);
      if (ribbon) group.add(new THREE.Mesh(ribbon, burnMat));

      // Raster artwork never originates in this tool, but a design opened from
      // the account could carry one, and the 2D editor draws it - so this view
      // must not silently lose it.
      for (const o of decor) {
        if (o.type !== 'image' || !o.src) continue;
        const plane = new THREE.Mesh(
          new THREE.PlaneGeometry(o.w, o.h),
          new THREE.MeshStandardMaterial({
            map: this.imageTexture(o.src), transparent: true, roughness: 0.9,
          }),
        );
        plane.position.set(o.x + o.w / 2, o.y + o.h / 2, LIFT);
        if (o.rot) plane.rotation.z = -o.rot * DEG;
        group.add(plane);
      }

      this.root.add(group);
    }

    const { w: W, h: H } = built.size;
    // Orbit about the middle of the tag rather than the corner it is built from.
    this.root.position.set(-W / 2, 0, 0);
    this.setupDims(built);
    // A little below the middle of the tag, which lifts the tag a little above
    // the middle of the pane. The Front / Back strip is parked along the bottom
    // of the stage and on a phone it takes a quarter of it, so a tag centred on
    // the pane would always have its foot behind the buttons.
    this.controls.target.set(0, 0, H * 0.44);
    this.tagSize = Math.max(W, H);
    this.tagW = W;
    this.tagH = H;
    this.fitDist = this.fitDistance(W, H);
    // Not framed until the pane has a size to frame against. The first build can
    // land before the flex layout has given the stage a width, and framing to a
    // one-pixel pane leaves the tag a speck that nothing later moves.
    if (!this.framed && this.container.clientWidth > 1) {
      this.frame();
      this.framed = true;
    }
  }

  /**
   * Width and height as witness lines, drawn as an SVG overlay rather than in the
   * scene so the arrowheads and the type stay crisp at any zoom.
   *
   * The thickness is deliberately not one of them. On a 90 mm tag a 6 mm witness
   * projects to a few pixels from most angles, so it would spend its life below
   * the hide threshold, flickering in and out - and the board thickness is
   * already spelled out in the readout in the top bar.
   */
  setupDims(built) {
    const { w: W, h: H, depth: D } = built.size;
    const P = (x, y, z) => [x - W / 2, y, z];
    this.dimOffset = Math.max(3, Math.max(W, H) * 0.06);
    // The width witness goes ABOVE the tag, not below it. Below is where the
    // Front / Back strip sits, and the strip is a later sibling of this pane, so
    // it drew straight over the "50mm" and left a dimension line with arrowheads
    // and no number on it.
    this.dims = [
      { label: fmtMm(W), a: P(0, -D / 2, H), b: P(W, -D / 2, H), dir: [0, 0, 1] },
      { label: fmtMm(H), a: P(W, -D / 2, 0), b: P(W, -D / 2, H), dir: [1, 0, 0] },
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
      // Foreshortened to nothing, or behind the camera: a dimension that reads
      // as a smudge is worse than no dimension.
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

  /** Back to the three-quarter view a tag is normally photographed from. */
  frame() {
    this.setView('persp');
  }

  /**
   * How far back the camera has to stand for the whole tag to fit, worked out
   * from the pane it is being drawn into rather than from a constant.
   *
   * A constant was wrong on a phone. The stage there is 375 px wide and twice
   * that tall, so the horizontal field of view is the narrow one - and a
   * distance chosen to frame a 90 mm tag vertically pushed the 50 mm width, plus
   * its dimension witnesses either side, straight off both edges. Both axes are
   * checked and the further of the two wins.
   *
   * The margin leaves room for the witness lines and their labels, which stand
   * off the tag and are not part of the box being fitted.
   */
  fitDistance(W, H, margin = 1.5) {
    const half = Math.tan((this.camera.fov / 2) * DEG);
    const aspect = this.camera.aspect || 1;
    return Math.max(
      ((H / 2) * margin) / half,
      ((W / 2) * margin) / (half * aspect),
    );
  }

  /**
   * Swing the camera. `front` and `back` are the two that matter: they are wired
   * to the Front / Back buttons in the stage, so the control that picks a side to
   * edit in 2D turns the tag round in 3D - and turning it round is how somebody
   * finds out the back is really there.
   */
  setView(name) {
    const d = this.fitDist || (this.tagSize || 100) * 1.9;
    const z = this.controls.target.z;
    // The three-quarter is set at the same distance from the target as the
    // straight-on views, so turning the tag round never changes how big it is.
    const k = 1 / Math.sqrt(0.42 ** 2 + 0.82 ** 2 + 0.38 ** 2);
    const map = {
      persp: [d * 0.42 * k, -d * 0.82 * k, z + d * 0.38 * k],
      front: [0, -d, z],
      back: [0, d, z],
      left: [-d, 0, z],
      right: [d, 0, z],
      top: [0, -0.001, z + d],
    };
    this.camera.position.set(...(map[name] || map.persp));
    this.controls.update();
  }
}
