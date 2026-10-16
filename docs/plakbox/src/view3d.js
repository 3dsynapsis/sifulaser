// Pratonton 3D. Tapak ialah segitiga yang SAMA yang STL bawa - bukan dibina
// semula di sini - jadi alur dan poket yang kelihatan ialah yang dicetak.
// Kotak akrilik dan plak ialah gambaran: akrilik dari saiz keping yang dikira
// (cantum hujung ke hujung, atas menindih dinding), plak sebagai kotak
// sempadannya sahaja. Jenis slot tiada kotak: plak ialah sekeping akrilik
// condong yang terbenam dalam slot. Rangka renderer, lampu dan garis dimensi
// disalin daripada Tray Organizer.
//
// ANGKAT. Kotak akrilik (atau plak slot) ialah satu kumpulan, `mover`, yang
// digerakkan sepanjang satu arah: ke atas untuk kotak, sepanjang paksi plak
// untuk slot. setLifted() hanya menukar sasaran; animate() menghampirinya
// sedikit setiap bingkai, macam penutup dalam Box Maker. Kamera ikut naik
// separuh jarak itu dan berundur sejauh sfera yang membesar, supaya bahagian
// yang terangkat kekal dalam bingkai - tanpa membuang sudut atau zum pengguna.

import * as THREE from '../vendor/three.module.js';
import { OrbitControls } from '../vendor/OrbitControls.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const svg = (name, attrs = {}) => {
  const n = document.createElementNS(SVG_NS, name);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, String(v));
  return n;
};
const fmtMm = (v) => `${Math.round(v * 10) / 10}mm`;

export class View3D {
  constructor(container) {
    this.container = container;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(36, 1, 1, 8000);
    this.camera.up.set(0, 0, 1);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    // OrbitControls memutar 360 darjah bagi setiap tinggi kanvas diseret. Di
    // telefon pentasnya cuma ~230 px, jadi seretan ibu jari 120 px memusingkan
    // kotak separuh pusingan. Perlahankan untuk sentuhan.
    if (matchMedia('(pointer: coarse)').matches) this.controls.rotateSpeed = 0.45;
    // Jangan turun ke bawah lantai - tiada apa untuk dilihat di bawah tapak.
    this.controls.maxPolarAngle = Math.PI / 2 - 0.03;

    this.hemi = new THREE.HemisphereLight(0xffffff, 0x2a2f38, 1.5);
    this.scene.add(this.hemi);
    const key = new THREE.DirectionalLight(0xffffff, 2.1);
    key.position.set(260, -380, 520);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.camera.near = 1;
    key.shadow.camera.far = 2400;
    const s = 420;
    Object.assign(key.shadow.camera, { left: -s, right: s, top: s, bottom: -s });
    key.shadow.bias = -0.0012;
    this.scene.add(key);
    this.scene.add(new THREE.DirectionalLight(0xdfe9ff, 0.45).translateX(-300));

    this.ground = new THREE.Mesh(
      new THREE.PlaneGeometry(6000, 6000),
      new THREE.ShadowMaterial({ opacity: 0.2 }),
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

    this.mover = null;
    this.lift = 0;          // 0 = dipasang, 1 = terangkat sepenuhnya
    this.liftTarget = 0;
    this.follow = 0;        // berapa jauh kamera sudah dinaikkan untuk angkat
    this.backoff = 0;       // dan berapa jauh ia sudah berundur

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

  get lifted() { return this.liftTarget === 1; }

  setLifted(on) { this.liftTarget = on ? 1 : 0; }

  /** Letak `mover` pada kedudukan this.lift, dan bawa kamera bersama. */
  applyLift() {
    const mv = this.mover;
    const k = this.lift;
    if (mv) mv.obj.position.copy(mv.base).addScaledVector(mv.dir, mv.dist * k);
    const rise = mv ? mv.dist * mv.dir.z * k : 0;
    const want = rise / 2;
    const back = this.fitDist(rise) - this.fitDist(0);
    const dz = want - this.follow;
    const db = back - this.backoff;
    if (dz || db) {
      const away = this.camera.position.clone().sub(this.controls.target).normalize();
      this.controls.target.z += dz;
      this.camera.position.z += dz;
      this.camera.position.addScaledVector(away, db);
      this.follow = want;
      this.backoff = back;
    }
  }

  /** Jarak kamera yang memuatkan sfera keseluruhan, dengan `extra` mm tambahan di atas. */
  fitDist(extra = 0) {
    const { L, W, H } = this.bounds || { L: 300, W: 150, H: 300 };
    const r = 0.5 * Math.hypot(L, W, H + extra);
    const fit = Math.min(this.camera.fov, this.camera.fov * this.camera.aspect) * Math.PI / 360;
    return (r / Math.sin(fit)) * 1.08;
  }

  animate = () => {
    this.raf = requestAnimationFrame(this.animate);
    // Ikut masa, bukan bingkai: sama laju pada skrin 60 Hz, 120 Hz atau
    // telefon lama yang tersekat-sekat. Kira-kira 0.6 s dari hujung ke hujung.
    const now = performance.now();
    const dt = Math.min(0.1, (now - (this.lastT || now)) / 1000);
    this.lastT = now;
    if (this.lift !== this.liftTarget) {
      this.lift += (this.liftTarget - this.lift) * (1 - Math.exp(-dt / 0.11));
      if (Math.abs(this.liftTarget - this.lift) < 0.002) this.lift = this.liftTarget;
      this.applyLift();
    }
    this.controls.update();
    this.updateDims();
    this.renderer.render(this.scene, this.camera);
  };

  disposeBuild() {
    this.root.traverse((n) => {
      if (n.geometry) n.geometry.dispose();
      const mats = Array.isArray(n.material) ? n.material : n.material ? [n.material] : [];
      for (const m of mats) m.dispose();
    });
    this.root.clear();
  }

  /** Kotak paksi-selari dari (x0,y0,z0) ke (x1,y1,z1), dalam koordinat tapak. */
  static box(x0, y0, z0, x1, y1, z1, mat) {
    const g = new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0);
    g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    return new THREE.Mesh(g, mat);
  }

  /** show: 'siap' (dipasang) atau 'tapak' (tapak sahaja - apa yang dicetak). */
  build(model, opts = {}) {
    const pale = opts.backdrop !== 'dark';
    this.hemi.groundColor.set(pale ? 0xd7dbe2 : 0x2a2f38);
    this.hemi.intensity = pale ? 1.9 : 1.5;
    this.ground.material.opacity = pale ? 0.14 : 0.26;
    this.disposeBuild();

    const p = model.params;
    const d = model.derived;
    const show = opts.show || 'siap';

    // Tapak: setiap jasad tanpa indeks, jadi computeVertexNormals memberi muka
    // rata.
    const baseMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(opts.color || '#6b4430'), roughness: 0.6, metalness: 0.02,
    });
    for (const body of model.bodies) {
      const geom = new THREE.BufferGeometry();
      geom.setAttribute('position', new THREE.BufferAttribute(body.mesh.slice(), 3));
      geom.computeVertexNormals();
      const mesh = new THREE.Mesh(geom, baseMat);
      mesh.position.z = body.z;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.root.add(mesh);
    }

    let top = p.baseH;
    this.mover = null;
    const glass = new THREE.MeshPhysicalMaterial({
      color: 0xe8f4f8, roughness: 0.05, metalness: 0, transparent: true, opacity: 0.16,
      depthWrite: false, side: THREE.DoubleSide,
    });
    const edgeMat = new THREE.LineBasicMaterial({ color: 0x7fa6b5, transparent: true, opacity: 0.85 });
    const glassBox = (parent, b, mat = glass) => {
      const m = View3D.box(...b, mat);
      m.renderOrder = 2;
      parent.add(m);
      const e = new THREE.LineSegments(new THREE.EdgesGeometry(m.geometry), edgeMat);
      e.renderOrder = 3;
      parent.add(e);
      return m;
    };

    if (show !== 'tapak' && d.slotMode) {
      // Plak sekeping, condong `tilt` ke belakang. Paksinya melalui pusat
      // bukaan slot; ia bersandar pada lantai slot di bucu paling bawahnya
      // (belakang-bawah bila condong).
      const a = (d.tilt * Math.PI) / 180, t = d.t, sl = d.slot;
      const u = new THREE.Vector3(0, Math.sin(a), Math.cos(a));
      const sc = (sl.y0 + sl.y1) / 2;
      const s = (sl.depth - (t / 2) * Math.sin(a)) / Math.cos(a);
      const sheet = new THREE.Group();
      sheet.position.set(0, sc - s * u.y, p.baseH - s * u.z);
      sheet.rotation.x = -a;
      const acrylic = new THREE.MeshPhysicalMaterial({
        color: 0xdff0f6, roughness: 0.04, metalness: 0, transparent: true, opacity: 0.3,
        depthWrite: false, side: THREE.DoubleSide,
      });
      glassBox(sheet, [d.plak.x0, -t / 2, 0, d.plak.x1, t / 2, p.plakH], acrylic);
      this.root.add(sheet);
      // Cabut: keluar sepenuhnya dari slot, dengan sedikit ruang.
      this.mover = { obj: sheet, base: sheet.position.clone(), dir: u, dist: s + Math.max(20, p.plakH * 0.08) };
      top = d.totalH;
    } else if (show !== 'tapak') {
      // Plak: kotak sempadan sahaja - bentuk sebenarnya bukan urusan alat ini.
      const k = d.plak;
      const plakMat = new THREE.MeshStandardMaterial({
        color: 0xd9bf8c, roughness: 0.8, transparent: true, opacity: 0.55,
      });
      const plak = View3D.box(k.x0, k.y0, d.plakZ, k.x1, k.y1, d.plakZ + p.plakH, plakMat);
      plak.castShadow = true;
      this.root.add(plak);
      this.root.add(new THREE.LineSegments(
        new THREE.EdgesGeometry(plak.geometry),
        new THREE.LineBasicMaterial({ color: 0x8a6a3a, transparent: true, opacity: 0.7 }),
      ));

      // Akrilik: lima keping cantum hujung ke hujung, dalam satu kumpulan
      // yang diangkat bersama selotipnya.
      const cover = new THREE.Group();
      const t = d.t;
      const c = d.cover;
      const z0 = d.coverZ;
      const z1 = d.coverTop;
      const pieces = [
        [c.x0, c.y0, z0, c.x1, c.y0 + t, z1 - t],          // depan
        [c.x0, c.y1 - t, z0, c.x1, c.y1, z1 - t],          // belakang
        [c.x0, c.y0 + t, z0, c.x0 + t, c.y1 - t, z1 - t],  // kiri
        [c.x1 - t, c.y0 + t, z0, c.x1, c.y1 - t, z1 - t],  // kanan
        [c.x0, c.y0, z1 - t, c.x1, c.y1, z1],              // atas
      ];
      for (const b of pieces) glassBox(cover, b);

      // Selotip: jalur nipis yang dilipat atas setiap sambungan luar.
      const tw = 6;    // separuh lebar selotip pada setiap muka
      const tt = 0.35; // tebal yang kelihatan
      const tape = new THREE.MeshStandardMaterial({
        color: 0xc9a46a, roughness: 0.5, transparent: true, opacity: 0.55, depthWrite: false,
      });
      const strips = [];
      for (const [x, sx] of [[c.x0, 1], [c.x1, -1]]) {
        for (const [y, sy] of [[c.y0, 1], [c.y1, -1]]) {
          // Bucu tegak: satu jalur pada muka depan/belakang, satu pada sisi.
          strips.push([Math.min(x, x + sx * tw), y - sy * tt, z0, Math.max(x, x + sx * tw), y, z1]);
          strips.push([x - sx * tt, Math.min(y, y + sy * tw), z0, x, Math.max(y, y + sy * tw), z1]);
        }
      }
      for (const [y, sy] of [[c.y0, 1], [c.y1, -1]]) {
        strips.push([c.x0, Math.min(y, y + sy * tw), z1, c.x1, Math.max(y, y + sy * tw), z1 + tt]);
        strips.push([c.x0, y - sy * tt, z1 - tw, c.x1, y, z1]);
      }
      for (const [x, sx] of [[c.x0, 1], [c.x1, -1]]) {
        strips.push([Math.min(x, x + sx * tw), c.y0, z1, Math.max(x, x + sx * tw), c.y1, z1 + tt]);
        strips.push([x - sx * tt, c.y0, z1 - tw, x, c.y1, z1]);
      }
      for (const b of strips) {
        const box = b.slice();
        for (const [a, z] of [[0, 3], [1, 4], [2, 5]]) if (box[a] > box[z]) [box[a], box[z]] = [box[z], box[a]];
        const m = View3D.box(...box, tape);
        m.renderOrder = 4;
        cover.add(m);
      }
      this.root.add(cover);
      // Angkat separuh tinggi kotak: alur dan poket jelas kelihatan, dan
      // kotak tetap dalam bingkai (kamera naik separuh jarak ini).
      this.mover = { obj: cover, base: new THREE.Vector3(), dir: new THREE.Vector3(0, 0, 1), dist: Math.max(40, d.coverH * 0.5) };
      top = z1;
    }


    this.root.position.set(-d.baseL / 2, -d.baseW / 2, 0);
    // Dimensi tinggi ialah tinggi SIAP, bukan semasa terangkat.
    this.setupDims(d.baseL, d.baseW, show === 'tapak' ? p.baseH : d.totalH);
    // Bingkai ikut sfera yang memeluk semuanya: kotak plak tinggi dan sempit,
    // jadi "saiz terbesar" sahaja memotong bumbung.
    this.bounds = { L: d.baseL, W: d.baseW, H: top };
    this.applyLift();
    const key = `${Math.round(d.baseL)}|${Math.round(d.baseW)}|${Math.round(top)}`;
    if (key !== this._frameKey) { this._frameKey = key; this.frame(); }
  }

  /** Tiga garis dimensi dilukis sebagai tindanan SVG supaya kekal tajam. */
  setupDims(L, W, H) {
    const P = (x, y, z) => [x - L / 2, y - W / 2, z];
    this.dimOffset = Math.max(6, Math.max(L, W) * 0.07);
    this.dims = [
      { label: fmtMm(L), a: P(0, 0, 0), b: P(L, 0, 0), dir: [0, -1, 0] },
      { label: fmtMm(W), a: P(L, 0, 0), b: P(L, W, 0), dir: [1, 0, 0] },
      { label: fmtMm(H), a: P(L, W, 0), b: P(L, W, H), dir: [0.7071, 0.7071, 0] },
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
      for (const el of [d.extA, d.extB, d.line, d.headA, d.headB, d.text]) el.style.display = hide ? 'none' : '';
      if (hide) continue;
      const ux = dx / len;
      const uy = dy / len;
      const set = (el, p, q) => {
        el.setAttribute('x1', p[0]); el.setAttribute('y1', p[1]);
        el.setAttribute('x2', q[0]); el.setAttribute('y2', q[1]);
      };
      set(d.extA, this.project(along(d.a, d.dir, off * 0.22)), this.project(along(d.a, d.dir, off * 1.35)));
      set(d.extB, this.project(along(d.b, d.dir, off * 0.22)), this.project(along(d.b, d.dir, off * 1.35)));
      set(d.line, A, B);
      const head = (pt, hx, hy) => {
        const s2 = 9;
        const nx = -hy;
        const ny = hx;
        return `${pt[0]},${pt[1]} ${pt[0] + hx * s2 + nx * s2 * 0.34},${pt[1] + hy * s2 + ny * s2 * 0.34} `
          + `${pt[0] + hx * s2 - nx * s2 * 0.34},${pt[1] + hy * s2 - ny * s2 * 0.34}`;
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
    const { L, W, H } = this.bounds || { L: 300, W: 150, H: 300 };
    const r = 0.5 * Math.hypot(L, W, H);
    const dist = this.fitDist(0) + this.backoff;
    // Had zum ikut saiz model: cukup dekat untuk melihat alur, tetapi tidak
    // sampai kamera masuk ke dalam kotak; cukup jauh tanpa hilang jadi titik.
    this.controls.minDistance = r * 0.9;
    this.controls.maxDistance = this.fitDist(0) * 3;
    const dir = [0.5, -0.78, 0.38];
    const m = Math.hypot(...dir);
    // Kekalkan kenaikan kamera untuk bahagian yang sedang terangkat.
    const cz = H / 2 + this.follow;
    this.controls.target.set(0, 0, cz);
    this.camera.position.set(dir[0] / m * dist, dir[1] / m * dist, cz + dir[2] / m * dist);
    this.controls.update();
  }
}
