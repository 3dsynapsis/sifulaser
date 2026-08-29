// 3D preview. The piece is extruded from exactly the rings the exporter writes,
// so a counter you see here is a counter the laser will cut and a bridge you see
// here is a bridge that will be on the finished topper.
//
// Ported from the name stand, which took it from the Box Maker. What is not
// here is everything those needed and a topper does not: no assembly, because a
// topper is one panel; no slots or tenons; and no engraving, because a topper is
// all cut - there is nothing to engrave on one.
//
// What is here instead is the finish. This is the one tool whose material list
// is entirely acrylic, and half of that list is mirror or glitter. A mirror is
// not a colour, it is a smooth metal surface with a room to reflect, so the
// scene carries an environment map and the materials are told how polished and
// how metallic they are rather than being painted to look shiny.

import * as THREE from '../vendor/three.module.js';
import { OrbitControls } from '../vendor/OrbitControls.js';
import { boardCanvas, roughnessCanvas, studioEnvCanvas, TILE_MM } from './texture.js';
import { nestRings } from './geom/path.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

const svg = (name, attrs = {}) => {
  const n = document.createElementNS(SVG_NS, name);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, String(v));
  return n;
};

const fmtMm = (v) => `${Math.round(v * 10) / 10}mm`;

// How much of the light a clear sheet stops. It is one number in two places -
// the face material's alpha, and the shadow it is allowed to cast - because it
// is one physical fact. See CLEAR_ALPHA's second use in build().
const CLEAR_ALPHA = 0.34;

const ringToShape = (ring) => {
  const s = new THREE.Shape();
  s.moveTo(ring[0][0], ring[0][1]);
  for (let i = 1; i < ring.length; i++) s.lineTo(ring[i][0], ring[i][1]);
  s.closePath();
  return s;
};

/**
 * A flat list of rings as three.js shapes, each carrying its own holes.
 *
 * Which ring is a hole is decided by nestRings in src/geom/path.js - that part
 * is ring arithmetic, and it is tested there rather than here, because a node
 * test cannot import this file without a WebGL context behind it.
 */
export function ringsToShapes(rings) {
  return nestRings(rings).map((s) => {
    const shape = ringToShape(s.ring);
    for (const hole of s.holes) shape.holes.push(ringToShape(hole));
    return shape;
  });
}

export class View3D {
  constructor(container) {
    this.container = container;
    // alpha, so the stage's own backdrop gradient shows through the canvas and
    // the picker at the corner of the stage governs all three views at once.
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    // Mirror gold reflecting a white softbox goes far past white. Without a tone
    // curve the highlight clips to a flat patch and the gold reads as yellow
    // card; with one it rolls off and reads as metal.
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    // The world here is z-up, because that is how the geometry is written and
    // how a piece standing on a table is described. Environment maps are sampled
    // y-up, so the room is turned a quarter turn to match - otherwise the
    // horizon runs vertically down the middle of a mirror finish.
    this.scene.environmentRotation = new THREE.Euler(Math.PI / 2, 0, 0);

    this.camera = new THREE.PerspectiveCamera(38, 1, 1, 6000);
    this.camera.up.set(0, 0, 1);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;

    this.hemi = new THREE.HemisphereLight(0xffffff, 0x2a2f38, 0.9);
    this.scene.add(this.hemi);
    this.key = new THREE.DirectionalLight(0xffffff, 1.6);
    this.key.position.set(180, -260, 320);
    this.key.castShadow = true;
    this.key.shadow.mapSize.set(2048, 2048);
    this.key.shadow.camera.near = 1;
    this.key.shadow.camera.far = 1600;
    const s = 320;
    Object.assign(this.key.shadow.camera, { left: -s, right: s, top: s, bottom: -s });
    this.key.shadow.bias = -0.0012;
    this.scene.add(this.key);
    this.scene.add(new THREE.DirectionalLight(0xdfe9ff, 0.35).translateX(-200));

    // The topper casts onto this and nothing else: a shadow material draws the
    // contact shadow without painting a floor over the backdrop.
    this.ground = new THREE.Mesh(
      new THREE.PlaneGeometry(4000, 4000),
      new THREE.ShadowMaterial({ opacity: 0.24 }),
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

    this.maps = new Map();
    this.envs = new Map();

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(container);
    this.resize();
    this.animate();
  }

  resize() {
    const w = this.container.clientWidth || 1;
    const h = this.container.clientHeight || 1;
    // updateStyle must stay on: with a devicePixelRatio above 1 the canvas
    // element would otherwise keep an intrinsic size of w*dpr CSS pixels and
    // overflow the pane, which also throws the projected dimensions out of
    // register with the object they are measuring.
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
    for (const t of this.maps.values()) t?.dispose();
    for (const t of this.envs.values()) t?.dispose();
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
    return new THREE.Matrix4().makeBasis(u, v, n).setPosition(new THREE.Vector3(...origin));
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

  /** A cached surface map, tiled in real millimetres across the sheet. */
  surface(kind, hex, which) {
    const key = `${which}|${kind}|${hex}`;
    if (!this.maps.has(key)) {
      const canvas = which === 'rough' ? roughnessCanvas(kind) : boardCanvas(hex, kind);
      let tex = null;
      if (canvas) {
        tex = new THREE.CanvasTexture(canvas);
        tex.wrapS = THREE.RepeatWrapping;
        tex.wrapT = THREE.RepeatWrapping;
        tex.repeat.set(1 / TILE_MM, 1 / TILE_MM);
        // A roughness map is data, not a picture: pushing it through the sRGB
        // curve would make every fleck read rougher than it was drawn.
        if (which !== 'rough') tex.colorSpace = THREE.SRGBColorSpace;
        tex.anisotropy = this.renderer.capabilities.getMaxAnisotropy();
      }
      this.maps.set(key, tex);
    }
    return this.maps.get(key);
  }

  /** The room the polished finishes reflect, following the stage backdrop. */
  environment(pale) {
    if (!this.envs.has(pale)) {
      const tex = new THREE.CanvasTexture(studioEnvCanvas(pale));
      tex.mapping = THREE.EquirectangularReflectionMapping;
      tex.colorSpace = THREE.SRGBColorSpace;
      this.envs.set(pale, tex);
    }
    return this.envs.get(pale);
  }

  /**
   * Face and edge materials for one acrylic finish.
   *
   * The edge is the part people forget. A laser leaves a polished edge on cast
   * acrylic, and on a mirror sheet that edge is the clear substrate the mirror
   * is backed onto - it is not gold. Painting the edge with the face colour is
   * what makes a rendered mirror topper look like a piece of foil card.
   */
  materials(finish, hex) {
    const color = new THREE.Color(hex);

    if (finish === 'mirror') {
      const face = new THREE.MeshStandardMaterial({
        color, metalness: 1, roughness: 0.045, envMapIntensity: 1.4,
      });
      const side = new THREE.MeshPhysicalMaterial({
        // The substrate, carrying only a breath of the tint, and frosted by the
        // beam rather than polished like the face.
        color: color.clone().lerp(new THREE.Color('#e9edf1'), 0.78),
        metalness: 0, roughness: 0.34, clearcoat: 0.5, clearcoatRoughness: 0.3,
      });
      return [face, side];
    }

    if (finish === 'clear') {
      // Plain alpha, not three's transmission. Transmission refracts whatever is
      // in the scene buffer, and this canvas is drawn with an alpha channel so
      // the stage's backdrop is behind the canvas rather than in it - there is
      // nothing in the buffer to show through, and the piece comes out a pale
      // solid. Alpha lets the real backdrop through the canvas, which is what
      // holding clear acrylic up against something actually looks like.
      //
      // Depth is still written, so the near surface blends over the backdrop
      // once instead of the near and far faces stacking into a darker sheet.
      const face = new THREE.MeshPhysicalMaterial({
        color,
        metalness: 0,
        roughness: 0.04,
        clearcoat: 1,
        clearcoatRoughness: 0.02,
        envMapIntensity: 1.3,
        transparent: true,
        opacity: CLEAR_ALPHA,
      });
      // The edge is the part of clear acrylic you actually see: light piped
      // along the sheet comes out at the cut and the outline lights up.
      const side = new THREE.MeshPhysicalMaterial({
        color: color.clone().lerp(new THREE.Color('#ffffff'), 0.35),
        metalness: 0,
        roughness: 0.16,
        envMapIntensity: 1.5,
        transparent: true,
        opacity: 0.72,
      });
      return [face, side];
    }

    if (finish === 'wood') {
      // A wood face is its grain, so unlike every other sheet in the list this
      // one really does carry a picture. Matt, and no environment map worth
      // speaking of: falcata reflects the room about as much as a beer mat.
      const face = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        map: this.surface('wood', hex, 'colour'),
        roughness: 0.82,
        metalness: 0,
        envMapIntensity: 0.25,
      });
      // The cut edge of plywood comes off the bed charred, and it is much darker
      // than the face - keeping a trace of the board so falcata and a darker
      // timber would not look identical along the edge.
      const side = new THREE.MeshStandardMaterial({
        color: color.clone().multiplyScalar(0.16).lerp(new THREE.Color('#151311'), 0.55),
        roughness: 0.95,
        metalness: 0,
        envMapIntensity: 0.15,
      });
      return [face, side];
    }

    if (finish === 'glitter') {
      const face = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        map: this.surface('glitter', hex, 'colour'),
        roughnessMap: this.surface('glitter', hex, 'rough'),
        // The map carries the whole range, so the material's own roughness is
        // left at 1 and multiplies through unchanged.
        roughness: 1,
        metalness: 0.85,
        envMapIntensity: 1.25,
      });
      const side = new THREE.MeshStandardMaterial({
        color, metalness: 0.5, roughness: 0.35,
      });
      return [face, side];
    }

    // Plain cast acrylic: not metal, but polished enough to hold a highlight.
    // The edge is a shade rougher - a cut edge is never quite as flat as the
    // cast face, however clean the beam.
    const face = new THREE.MeshPhysicalMaterial({
      color, metalness: 0, roughness: 0.12, clearcoat: 1, clearcoatRoughness: 0.03,
    });
    const side = new THREE.MeshPhysicalMaterial({
      color, metalness: 0, roughness: 0.22, clearcoat: 0.6, clearcoatRoughness: 0.16,
    });
    return [face, side];
  }

  build(result, opts = {}) {
    if (!result || result.derived.empty || !result.panels.length) {
      this.disposeBuild();
      this.dimLayer.replaceChildren();
      this.dims = null;
      return;
    }

    // A pale backdrop needs a lighter bounce and a softer contact shadow, or the
    // topper reads as a cut-out floating on the page rather than an object
    // standing on a table.
    const pale = opts.backdrop !== 'dark';
    this.hemi.groundColor.set(pale ? 0xd7dbe2 : 0x2a2f38);
    this.hemi.intensity = pale ? 1.1 : 0.8;
    // A ShadowMaterial knows nothing about what cast onto it, so left alone a
    // clear sheet lays down the same solid grey name a black one does - and
    // since the piece itself is a faint ghost, the shadow ends up reading more
    // strongly than the object. Clear acrylic stops about a third of the light,
    // so it is allowed about a third of the shadow.
    const blocks = (opts.finish === 'clear') ? CLEAR_ALPHA : 1;
    this.ground.material.opacity = (pale ? 0.16 : 0.26) * blocks;
    this.scene.environment = this.environment(pale);

    this.disposeBuild();

    const t = Math.max(0.2, result.params.thickness);
    const [faceMat, sideMat] = this.materials(
      opts.finish || 'none', opts.color || '#cfd6de',
    );

    for (const panel of result.panels) {
      if (!panel.frame) continue;
      const group = new THREE.Group();
      group.applyMatrix4(View3D.panelMatrix(panel));

      // `loose` are pieces that fall out of the sheet on their own. They are
      // drawn where they were traced, because that is where they were meant to
      // be - seeing them sitting in place is how you notice there are three of
      // them and the topper is in bits.
      const shapes = ringsToShapes([panel.outline, ...panel.holes, ...(panel.loose || [])]);
      if (!shapes.length) continue;
      const geom = new THREE.ExtrudeGeometry(shapes, { depth: t, bevelEnabled: false });
      // The frame plane is the visible surface, so the sheet hangs behind it.
      geom.translate(0, 0, -t);
      const mesh = new THREE.Mesh(geom, [faceMat, sideMat]);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      group.add(mesh);
      this.root.add(group);
    }

    const d = result.derived;
    // Orbit about the middle of the piece rather than the corner it is built from.
    this.root.position.set(-d.width / 2, -t / 2, 0);
    this.setupDims(d, t);
    this.topperSize = Math.max(d.width, d.height);
    this.topperHeight = d.height;
    this.controls.target.set(0, 0, d.height / 2);
    if (!this.framed) { this.frame(); this.framed = true; }
  }

  /**
   * Width, height and thickness as witness lines, drawn as an SVG overlay rather
   * than in the scene so the arrowheads and the type stay crisp at any zoom.
   *
   * The thickness is 3 mm against a piece 200 mm across, so at the default zoom
   * it foreshortens to nothing and hides itself. That is the point: it appears
   * when you zoom in on the edge, which is when you are asking about it.
   */
  setupDims(d, t) {
    const W = d.width;
    const H = d.height;
    const P = (x, y, z) => [x - W / 2, y - t / 2, z];
    this.dimOffset = Math.max(4, Math.max(W, H) * 0.06);
    this.dims = [
      { label: fmtMm(W), a: P(0, 0, 0), b: P(W, 0, 0), dir: [0, 0, -1] },
      { label: fmtMm(H), a: P(W, 0, 0), b: P(W, 0, H), dir: [1, 0, 0] },
      { label: fmtMm(t), a: P(0, 0, H), b: P(0, t, H), dir: [0, 0, 1] },
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
   * Nearly square on, turned just far enough to show the edge.
   *
   * A topper is read, not inspected from all sides, so the default view is the
   * one it will be photographed from - but a flat piece seen dead on gives no
   * clue how thick it is, and thickness is the whole of what 3D adds here.
   */
  frame() {
    this.setView('persp');
  }

  setView(name) {
    const s = this.topperSize || 150;
    const z = (this.topperHeight || s) / 2;
    const map = {
      persp: [s * 0.6, -s * 1.8, z + s * 0.3],
      front: [0, -s * 2, z],
      back: [0, s * 2, z],
      left: [-s * 2, 0, z],
      right: [s * 2, 0, z],
      top: [0, -0.001, z + s * 2],
    };
    this.controls.target.set(0, 0, z);
    this.camera.position.set(...(map[name] || map.persp));
    this.controls.update();
  }
}
