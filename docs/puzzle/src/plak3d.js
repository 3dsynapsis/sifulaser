// The UV Plak tab's 3D view (Boss, 28 Nov 2026: "boleh lihat secara 3d macam tab box
// maker"): the plaque as it will stand on a desk, to turn round and look at. Built from
// the same plan and outlines the cut files are written from, so the border's mitres, the
// raised letters and the base's slot are the ones the laser will cut.
//
// Loaded only when the 3D view is opened: three.js is about 1.3 MB the rest of the tab
// never needs. The copy in ../vendor is the Box Maker's.
//
// World: millimetres, z up, the desk at z = 0, the plaque's face looking down -y (at the
// camera). The plate stands in the base's slot, its foot (the tongue) inside it; the
// border and the letters are 3 mm proud of its face.

import * as THREE from '../vendor/three.module.js';
import { OrbitControls } from '../vendor/OrbitControls.js';

const TEXTURE_PX = 2048;   // the printed face, its long side

function inRing(pt, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if ((yi > pt[1]) !== (yj > pt[1]) && pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function ringArea(ring) {
  let a = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) a += ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1];
  return a / 2;
}

const path = (P, ring) => {
  P.moveTo(ring[0][0], ring[0][1]);
  for (let i = 1; i < ring.length; i++) P.lineTo(ring[i][0], ring[i][1]);
  P.closePath();
  return P;
};

/** Loops (outsides and holes mixed) as three.js shapes: each hole goes in the smallest outside round it. */
export function loopsToShapes(loops) {
  const rings = loops.filter((r) => r.length > 2);
  const depth = rings.map((r) => rings.filter((o) => o !== r && inRing(r[0], o)).length);
  const outs = [];
  rings.forEach((r, i) => { if (depth[i] % 2 === 0) outs.push({ ring: r, shape: path(new THREE.Shape(), r) }); });
  rings.forEach((r, i) => {
    if (depth[i] % 2 === 0) return;
    let best = null;
    for (const o of outs) {
      if (inRing(r[0], o.ring) && (!best || Math.abs(ringArea(o.ring)) < Math.abs(ringArea(best.ring)))) best = o;
    }
    if (best) best.shape.holes.push(path(new THREE.Path(), r));
  });
  return outs.map((o) => o.shape);
}

/** A rectangle with rounded corners, centred on the origin, as a shape or a path. */
function roundRect(P, w, d, r) {
  const x = -w / 2;
  const y = -d / 2;
  const q = Math.min(r, w / 2, d / 2);
  P.moveTo(x + q, y);
  P.lineTo(x + w - q, y);
  P.absarc(x + w - q, y + q, q, -Math.PI / 2, 0, false);
  P.lineTo(x + w, y + d - q);
  P.absarc(x + w - q, y + d - q, q, 0, Math.PI / 2, false);
  P.lineTo(x + q, y + d);
  P.absarc(x + q, y + d - q, q, Math.PI / 2, Math.PI, false);
  P.lineTo(x, y + q);
  P.absarc(x + q, y + q, q, Math.PI, Math.PI * 1.5, false);
  return P;
}

/** The plate's face as a picture: the plywood, and the print over the part that gets ink. */
async function faceCanvas(o) {
  const k = TEXTURE_PX / Math.max(o.width, o.height);
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(2, Math.round(o.width * k));
  canvas.height = Math.max(2, Math.round(o.height * k));
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = o.frontColour;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  if (o.grain) {
    // A faint grain, so maple reads as wood and not as card.
    let seed = 7;
    const rand = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    ctx.globalAlpha = 0.07;
    ctx.strokeStyle = '#7a5226';
    for (let i = 0; i < 140; i++) {
      const y = rand() * canvas.height;
      ctx.lineWidth = 0.5 + rand() * 2.5;
      ctx.beginPath();
      ctx.moveTo(0, y);
      for (let x = 0; x <= canvas.width; x += canvas.width / 12) ctx.lineTo(x, y + Math.sin(x / 300 + i) * 6 * rand());
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }
  if (o.imageUrl) {
    const img = new Image();
    img.src = o.imageUrl;
    await img.decode();
    const b = o.printBox;
    const x0 = Math.max(0, b.x);
    const y0 = Math.max(0, b.y);
    const x1 = Math.min(o.width, b.x + b.width);
    const y1 = Math.min(o.height, b.y + b.height);
    ctx.save();
    ctx.beginPath();
    ctx.rect(x0 * k, y0 * k, (x1 - x0) * k, (y1 - y0) * k);
    ctx.clip();
    ctx.drawImage(img, 0, 0, o.width * k, o.height * k);
    ctx.restore();
  }
  return canvas;
}

export class Plak3D {
  constructor(container) {
    this.container = container;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(35, 1, 1, 20000);
    this.camera.up.set(0, 0, 1);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.maxPolarAngle = Math.PI * 0.53;   // not far under the desk

    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x2a2f38, 1.7));
    // A plaque's face stands upright: its light comes mostly from in front, or the
    // printed white reads as grey.
    const key = new THREE.DirectionalLight(0xffffff, 2.6);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.bias = -0.0008;
    this.scene.add(key);
    this.scene.add(key.target);
    this.key = key;
    const fill = new THREE.DirectionalLight(0xdfe9ff, 0.5);
    fill.position.set(-400, -300, 200);
    this.scene.add(fill);

    this.ground = new THREE.Mesh(new THREE.PlaneGeometry(20000, 20000), new THREE.ShadowMaterial({ opacity: 0.25 }));
    this.ground.receiveShadow = true;
    this.scene.add(this.ground);

    this.root = new THREE.Group();
    this.scene.add(this.root);
    this.fitKey = null;
    this.faceKey = null;
    this.faceTexture = null;
    this.faceMaterial = null;
    this.running = false;

    this.renderer.domElement.addEventListener('dblclick', () => this.frame());
    this.resizer = new ResizeObserver(() => this.resize());
    this.resizer.observe(container);
  }

  resize() {
    const w = this.container.clientWidth;
    const hgt = this.container.clientHeight;
    if (!w || !hgt) return;
    this.renderer.setSize(w, hgt, false);
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';
    this.camera.aspect = w / hgt;
    this.camera.updateProjectionMatrix();
  }

  setActive(on) {
    if (on === this.running) return;
    this.running = on;
    if (on) {
      this.resize();
      const loop = () => {
        if (!this.running) return;
        this.controls.update();
        this.renderer.render(this.scene, this.camera);
        requestAnimationFrame(loop);
      };
      requestAnimationFrame(loop);
    }
  }

  clear() {
    for (const child of [...this.root.children]) {
      child.traverse((n) => {
        n.geometry?.dispose();
        const mats = Array.isArray(n.material) ? n.material : [n.material];
        for (const m of mats) if (m && m !== this.faceMaterial) m.dispose();
      });
      this.root.remove(child);
    }
  }

  /**
   * @param o { width, height: the plate's face; tongue; thick; printBox on the face;
   *          imageUrl; frontColour, borderColour, letterColour, baseColour; grain;
   *          strips: [{ points }] on the face; letters: [[loop, ...], ...] on the face;
   *          base: { length, depth, layers, layerMm, slot: { width, length } } or null }
   *          All mm, the face's from its top-left.
   */
  build(o) {
    this.clear();
    const { width: W, height: H, thick: t } = o;
    const z0 = o.base ? o.base.layers * o.base.layerMm : 0;   // where the face starts
    const faceTop = z0 + H;
    const toFace = ([x, y]) => [x - W / 2, faceTop - y];
    const mat = (colour, extra = {}) => new THREE.MeshStandardMaterial({ color: colour, roughness: 0.75, metalness: 0, ...extra });
    const add = (geo, material, shadows = true) => {
      const m = new THREE.Mesh(geo, material);
      m.castShadow = shadows;
      m.receiveShadow = true;
      this.root.add(m);
      return m;
    };
    // Something drawn on the face and standing out of it by `depth`, toward the camera.
    const proud = (shapes, depth, material) => {
      if (!shapes.length) return;
      const geo = new THREE.ExtrudeGeometry(shapes, { depth, bevelEnabled: false, curveSegments: 4 });
      geo.rotateX(Math.PI / 2);          // shape y -> world z, extrusion -> world -y
      geo.translate(0, -t / 2, 0);
      add(geo, material);
    };

    // The plate, its foot down in the slot.
    const plateH = H + o.tongue;
    const plate = new THREE.BoxGeometry(W, t, plateH);
    plate.translate(0, 0, z0 - o.tongue + plateH / 2);
    add(plate, mat(o.frontColour));

    // Its printed face, a hair in front of it.
    const face = new THREE.PlaneGeometry(W, H);
    face.rotateX(Math.PI / 2);
    face.translate(0, -t / 2 - 0.05, z0 + H / 2);
    const faceKey = JSON.stringify([o.imageUrl, o.printBox, W, H, o.frontColour, o.grain]);
    if (faceKey !== this.faceKey || !this.faceMaterial) {
      this.faceKey = faceKey;
      this.faceTexture?.dispose();
      this.faceTexture = null;
      this.faceMaterial?.dispose();
      this.faceMaterial = mat(o.frontColour, { roughness: 0.6 });
      const wanted = faceKey;
      faceCanvas(o).then((canvas) => {
        if (wanted !== this.faceKey) return;
        const tex = new THREE.CanvasTexture(canvas);
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.anisotropy = Math.min(8, this.renderer.capabilities.getMaxAnisotropy());
        this.faceTexture = tex;
        this.faceMaterial.map = tex;
        this.faceMaterial.color.set(0xffffff);
        this.faceMaterial.needsUpdate = true;
      }).catch(() => { /* the plain plywood stays */ });
    }
    add(face, this.faceMaterial, false);

    // The border's strips and the raised letters, 3 mm proud.
    const border = mat(o.borderColour, { roughness: 0.7 });
    proud(o.strips.map((s) => path(new THREE.Shape(), s.points.map(toFace))), t, border);
    const letters = mat(o.letterColour, { roughness: 0.7 });
    for (const loops of o.letters) proud(loopsToShapes(loops.map((loop) => loop.map(toFace))), t, letters);

    // The base: acrylic, one piece under, the slotted ones over it.
    if (o.base) {
      const b = o.base;
      const acrylic = new THREE.MeshPhysicalMaterial({
        color: o.baseColour, roughness: 0.08, metalness: 0, transparent: true, opacity: 0.5, side: THREE.DoubleSide,
      });
      const edges = new THREE.LineBasicMaterial({ color: 0x6f97a6, transparent: true, opacity: 0.8 });
      for (let i = 0; i < b.layers; i++) {
        const shape = roundRect(new THREE.Shape(), b.length, b.depth, 5);
        if (i > 0) {
          const hole = new THREE.Path();
          const sw = b.slot.width;
          const sl = b.slot.length;
          hole.moveTo(-sl / 2, -sw / 2);
          hole.lineTo(sl / 2, -sw / 2);
          hole.lineTo(sl / 2, sw / 2);
          hole.lineTo(-sl / 2, sw / 2);
          hole.closePath();
          shape.holes.push(hole);
        }
        const geo = new THREE.ExtrudeGeometry(shape, { depth: b.layerMm - 0.05, bevelEnabled: false, curveSegments: 6 });
        geo.translate(0, 0, i * b.layerMm);
        add(geo, acrylic, false);
        const line = new THREE.LineSegments(new THREE.EdgesGeometry(geo, 30), edges);
        this.root.add(line);
      }
    }

    // Light and shadow sized to the plaque; the camera framed once per size.
    const reach = Math.max(W, o.base ? o.base.length : 0, faceTop);
    this.key.position.set(reach * 0.55, -reach * 1.6, reach * 1.15);
    this.key.target.position.set(0, 0, faceTop / 2);
    const s = reach * 1.2;
    Object.assign(this.key.shadow.camera, {
      left: -s, right: s, top: s, bottom: -s, near: 1, far: reach * 6,
    });
    this.key.shadow.camera.updateProjectionMatrix();
    this.size = { reach, faceTop, width: Math.max(W, o.base ? o.base.length : 0) };
    const fitKey = JSON.stringify([W, H, Boolean(o.base)]);
    if (fitKey !== this.fitKey) {
      this.fitKey = fitKey;
      this.frame();
    }
  }

  /** Look at the whole plaque from in front, a little from the right and above. */
  frame() {
    if (!this.size) return;
    const { width, faceTop } = this.size;
    const fov = (this.camera.fov * Math.PI) / 180;
    const aspect = this.camera.aspect || 1.4;
    const fitH = faceTop / (2 * Math.tan(fov / 2));
    const fitW = width / (2 * Math.tan(fov / 2) * aspect);
    const dist = Math.max(fitH, fitW) * 1.45;
    const dir = new THREE.Vector3(0.42, -1, 0.32).normalize();
    const target = new THREE.Vector3(0, 0, faceTop * 0.48);
    this.controls.target.copy(target);
    this.camera.position.copy(target).addScaledVector(dir, dist);
    this.camera.near = Math.max(1, dist / 100);
    this.camera.far = dist * 20;
    this.camera.updateProjectionMatrix();
    this.controls.update();
  }
}
