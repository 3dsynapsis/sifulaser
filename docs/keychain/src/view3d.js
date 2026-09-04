// The finished keychain, as an object rather than a drawing.
//
// The flat views answer "is this the right cut file". This one answers the
// question somebody actually has before they cut fifty of them: does it look
// like a thing you would put on your keys. That is a question about thickness,
// about how the burn sits against the board, and about the ring - none of which
// a flat outline can show.
//
// A keychain is one piece of sheet, so this is far simpler than the box tools'
// viewers: one extrusion, the marks laid on its top face, and a torus for the
// ring. There is no assembly to get wrong.
//
// Ring formats in this project are not uniform, and the difference matters
// here more than anywhere else because both kinds land in the same scene:
// `outline`, `holes` and `loose` are arrays of [x, y] PAIRS, while `engrave`
// and `engraveFill` are FLAT arrays of numbers. Everything below goes through
// `toPairs` first rather than trusting either shape.

import * as THREE from '../vendor/three.module.js';
import { OrbitControls } from '../vendor/OrbitControls.js';

const DEG = Math.PI / 180;

/** Either ring convention in, [x, y] pairs out. */
export function toPairs(ring) {
  if (!ring || !ring.length) return [];
  if (Array.isArray(ring[0])) return ring;
  const out = [];
  for (let i = 0; i + 1 < ring.length; i += 2) out.push([ring[i], ring[i + 1]]);
  return out;
}

const ringArea = (pts) => {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x1, y1] = pts[i];
    const [x2, y2] = pts[(i + 1) % pts.length];
    a += x1 * y2 - x2 * y1;
  }
  return a / 2;
};

/**
 * One outline plus its holes as a THREE.Shape.
 *
 * The holes are handed in explicitly rather than inferred from winding: the
 * counters of an 'a' and the ring hole arrive from different parts of the
 * builder and there is no promise they wind the same way.
 */
function shapeOf(outline, holes) {
  const outer = toPairs(outline);
  if (outer.length < 3) return null;
  const s = new THREE.Shape();
  s.moveTo(outer[0][0], outer[0][1]);
  for (let i = 1; i < outer.length; i++) s.lineTo(outer[i][0], outer[i][1]);
  s.closePath();
  for (const h of holes || []) {
    const pts = toPairs(h);
    if (pts.length < 3) continue;
    const path = new THREE.Path();
    path.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) path.lineTo(pts[i][0], pts[i][1]);
    path.closePath();
    s.holes.push(path);
  }
  return s;
}

/**
 * The engraved letters as fillable shapes.
 *
 * A letter's counter - the middle of an o, the eye of an e - arrives as its own
 * ring, and if it is treated as another solid the o burns as a black disc. They
 * are sorted by area and the small ones tested against the big ones, which is
 * what tells a counter from a separate letter.
 */
function fillShapes(rings) {
  const loops = rings.map(toPairs).filter((r) => r.length > 2)
    .map((pts) => ({ pts, a: Math.abs(ringArea(pts)) }))
    .sort((x, y) => y.a - x.a);
  const inside = (pt, poly) => {
    let hit = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const [xi, yi] = poly[i];
      const [xj, yj] = poly[j];
      if ((yi > pt[1]) !== (yj > pt[1])
        && pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi) hit = !hit;
    }
    return hit;
  };
  const used = new Set();
  const out = [];
  for (let i = 0; i < loops.length; i++) {
    if (used.has(i)) continue;
    const holes = [];
    for (let j = i + 1; j < loops.length; j++) {
      if (used.has(j)) continue;
      if (inside(loops[j].pts[0], loops[i].pts)) { holes.push(loops[j].pts); used.add(j); }
    }
    const s = shapeOf(loops[i].pts, holes);
    if (s) out.push(s);
  }
  return out;
}

export class View3D {
  constructor(container) {
    this.container = container;
    this.scene = new THREE.Scene();

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(this.renderer.domElement);

    this.camera = new THREE.PerspectiveCamera(38, 1, 0.1, 4000);
    // Z is up here, the same as the geometry, so nothing has to be rotated
    // between the cut file and the scene.
    this.camera.up.set(0, 0, 1);
    this.camera.position.set(70, -120, 90);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.enablePan = false;

    const key = new THREE.DirectionalLight(0xffffff, 2.1);
    key.position.set(80, -110, 160);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.camera.near = 1;
    key.shadow.camera.far = 600;
    const d = 120;
    key.shadow.camera.left = -d;
    key.shadow.camera.right = d;
    key.shadow.camera.top = d;
    key.shadow.camera.bottom = -d;
    this.scene.add(key);
    this.scene.add(new THREE.DirectionalLight(0xffffff, 0.5).translateX(-120));
    this.hemi = new THREE.HemisphereLight(0xffffff, 0x8a8f98, 1.5);
    this.scene.add(this.hemi);

    this.ground = new THREE.Mesh(
      new THREE.PlaneGeometry(2000, 2000),
      new THREE.ShadowMaterial({ opacity: 0.18 }),
    );
    this.ground.receiveShadow = true;
    this.scene.add(this.ground);

    this.root = new THREE.Group();
    this.scene.add(this.root);

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
    this.renderer.render(this.scene, this.camera);
  };

  dispose() {
    cancelAnimationFrame(this.raf);
    this.resizeObserver.disconnect();
    this.disposeBuild();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }

  disposeBuild() {
    this.root.traverse((n) => {
      if (n.geometry) n.geometry.dispose();
      if (n.material) {
        for (const m of Array.isArray(n.material) ? n.material : [n.material]) m.dispose();
      }
    });
    this.root.clear();
  }

  /**
   * @param result  what buildKeychain returned
   * @param opts    { color, burn, ring, thickness, dark }
   */
  build(result, opts = {}) {
    this.disposeBuild();
    const panel = result.panels && result.panels[0];
    if (!panel) return;

    const t = Math.max(0.4, opts.thickness || panel.thickness || 3);
    const face = new THREE.Color(opts.color || '#d9c9a3');
    const burn = new THREE.Color(opts.burn || '#3a2a1c');

    const faceMat = new THREE.MeshStandardMaterial({
      color: face, roughness: 0.72, metalness: 0.02,
    });
    const edgeMat = new THREE.MeshStandardMaterial({
      color: face.clone().multiplyScalar(0.72), roughness: 0.9,
    });
    const burnMat = new THREE.MeshStandardMaterial({ color: burn, roughness: 0.95 });

    // The piece. Holes and the pieces that drop out of the sheet are both holes
    // in the solid - the difference between them is what happens after the cut,
    // not what the part looks like.
    const shape = shapeOf(panel.outline, [...(panel.holes || []), ...(panel.loose || [])]);
    if (!shape) return;
    const geom = new THREE.ExtrudeGeometry(shape, { depth: t, bevelEnabled: false });
    const mesh = new THREE.Mesh(geom, [faceMat, edgeMat]);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.root.add(mesh);

    // The marks sit a hair proud of the top face so they never z-fight with it.
    const lift = t + 0.02;
    const fills = fillShapes(panel.engraveFill || []);
    if (fills.length) {
      const g = new THREE.ShapeGeometry(fills);
      g.translate(0, 0, lift);
      this.root.add(new THREE.Mesh(g, burnMat));
    }
    const lineMat = new THREE.LineBasicMaterial({ color: burn });
    for (const ring of panel.engrave || []) {
      const pts = toPairs(ring).map(([x, y]) => new THREE.Vector3(x, y, lift));
      if (pts.length > 1) {
        this.root.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), lineMat));
      }
    }

    // The split ring, drawn because it is half of what the object looks like on
    // a set of keys and none of it is visible in a cut file.
    const ring = opts.ring;
    if (ring && Number.isFinite(ring.x) && Number.isFinite(ring.y)) {
      const wire = Math.max(0.5, Math.min(1.4, t * 0.32));
      const torus = new THREE.Mesh(
        new THREE.TorusGeometry(Math.max(2, ring.r), wire, 12, 48),
        new THREE.MeshStandardMaterial({
          color: 0xb9bec6, roughness: 0.3, metalness: 0.85,
        }),
      );
      // Hanging in the plane of the piece and threaded through the hole, so it
      // sits off the end the hole is on. The same placement the flat view uses,
      // but that one works in a y-down frame and this one does not, so the
      // arithmetic is redone here rather than reused and quietly flipped.
      const back = ring.r - (ring.holeR || 0);
      const at = { left: [-back, 0], right: [back, 0], top: [0, back], bottom: [0, -back] };
      const [dx, dy] = at[ring.end] || at.left;
      torus.position.set(ring.x + dx, ring.y + dy, t / 2);
      torus.castShadow = true;
      this.root.add(torus);
    }

    // Sit the piece on the ground and centre what the camera looks at.
    const box = new THREE.Box3().setFromObject(this.root);
    const c = box.getCenter(new THREE.Vector3());
    this.root.position.set(-c.x, -c.y, 0);
    this.ground.position.z = -0.05;
    const size = box.getSize(new THREE.Vector3());
    this.span = Math.max(size.x, size.y, 12);
    this.controls.target.set(0, 0, t / 2);
    if (!this.framed) { this.frame(); this.framed = true; }

    this.hemi.groundColor = new THREE.Color(opts.dark ? 0x2b2b2e : 0xdfe3ea);
  }

  /** Pull the camera back far enough to hold the piece with a little air. */
  frame() {
    const span = this.span || 80;
    const dist = (span * 1.5) / Math.tan((this.camera.fov * DEG) / 2);
    const dir = new THREE.Vector3(0.34, -0.78, 0.52).normalize();
    this.camera.position.copy(dir.multiplyScalar(Math.max(60, dist)));
    this.camera.lookAt(this.controls.target);
    this.controls.update();
  }
}
