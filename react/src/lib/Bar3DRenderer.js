import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { jet as jetColor } from './jet.js';

// 월드 좌표 박스 치수 (Cycle=x, Phase=z, Amplitude=y)
// H(진폭 축)는 고정, W·D(가로·깊이)는 격자 수에 비례해 동적 계산 → 셀이 항상 정사각.
const H = 78;            // amplitude 축 높이
const MAX_EXTENT = 130;  // 격자 최대 변 길이

const DEFAULT_AXES = {
  x: { label: 'Cycle', ticks: [0, 10, 20, 30, 40, 50], min: 0, max: 50 },
  y: { label: 'Phase(°)', ticks: [0, 90, 180, 270, 360], min: 0, max: 360 },
  z: { label: 'Relative amplitude', ticks: [0, 0.2, 0.4, 0.6, 0.8, 1.0], min: 0, max: 1 },
};

/**
 * 프레임워크 무관 3D 막대 차트 엔진.
 * React/Vue/순수 JS 어디서든 canvas 하나만 주면 동작.
 */
export class Bar3DRenderer {
  constructor(canvas, opts = {}) {
    this.canvas = canvas;
    this._values = null;                 // number[ny][nx]
    this._valueRange = null;             // [min, max] (null이면 자동)
    this._fillRatio = opts.fillRatio ?? 0.92;
    this._showEdges = opts.showEdges ?? true;
    this._showWalls = opts.showWalls ?? true;
    this._colorFn = opts.colorFn ?? jetColor;
    this._axes = { ...DEFAULT_AXES, ...(opts.axes || {}) };
    this._W = MAX_EXTENT;   // 데이터 격자에 따라 갱신됨
    this._D = MAX_EXTENT;

    // ---- 렌더러/씬/카메라 ----
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setClearColor(0xffffff, 1);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(45, 1, 0.1, 3000);
    this.camera.position.set(MAX_EXTENT * 1.5, H * 2.4, MAX_EXTENT * 1.9);

    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.target.set(0, H * 0.35, 0);
    this.controls.enableDamping = true;

    // ---- 조명 ----
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.78));
    const d1 = new THREE.DirectionalLight(0xffffff, 0.7);
    d1.position.set(1, 2, 1.2);
    this.scene.add(d1);
    const d2 = new THREE.DirectionalLight(0xffffff, 0.35);
    d2.position.set(-1, 0.6, -0.8);
    this.scene.add(d2);

    this.barsMesh = null;
    this.edgesMesh = null;

    this._buildWalls();
    this._buildAxes();

    this._disposed = false;
    this._raf = requestAnimationFrame(this._loop);
  }

  // ============ 배경 벽/그리드 (4벽 + 바닥) ============
  _gridGeom(w, h, dw, dh) {
    const pts = [];
    for (let k = 0; k <= dw; k++) { const x = -w / 2 + (w * k) / dw; pts.push(x, -h / 2, 0, x, h / 2, 0); }
    for (let k = 0; k <= dh; k++) { const y = -h / 2 + (h * k) / dh; pts.push(-w / 2, y, 0, w / 2, y, 0); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    return g;
  }

  _buildWalls() {
    // 기존 벽 정리 (치수 변경 시 재생성)
    if (this._walls) {
      this._walls.grp.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
      this._walls.mat.dispose();
      this.scene.remove(this._walls.grp);
    }
    const W = this._W, D = this._D;
    const mat = new THREE.LineBasicMaterial({ color: 0xd0d0d0 });
    const grp = new THREE.Group();

    const floor = new THREE.LineSegments(this._gridGeom(W, D, 10, 10), mat);
    floor.rotation.x = -Math.PI / 2;
    grp.add(floor);

    const xPos = new THREE.LineSegments(this._gridGeom(D, H, 10, 5), mat);
    xPos.rotation.y = -Math.PI / 2; xPos.position.set(W / 2, H / 2, 0); grp.add(xPos);
    const xNeg = new THREE.LineSegments(this._gridGeom(D, H, 10, 5), mat);
    xNeg.rotation.y = Math.PI / 2; xNeg.position.set(-W / 2, H / 2, 0); grp.add(xNeg);
    const zPos = new THREE.LineSegments(this._gridGeom(W, H, 10, 5), mat);
    zPos.position.set(0, H / 2, D / 2); grp.add(zPos);
    const zNeg = new THREE.LineSegments(this._gridGeom(W, H, 10, 5), mat);
    zNeg.position.set(0, H / 2, -D / 2); grp.add(zNeg);

    this.scene.add(grp);
    this._walls = { grp, floor, xPos, xNeg, zPos, zNeg, mat };
  }

  // 격자 수(nx, ny)에 맞춰 박스 W·D를 정사각 셀이 되도록 계산. 변경 시 벽 재생성.
  _applyGridDims(nx, ny) {
    const cell = MAX_EXTENT / Math.max(nx, ny);
    const W = nx * cell, D = ny * cell;
    if (W === this._W && D === this._D) return;
    this._W = W;
    this._D = D;
    this._buildWalls();
  }

  // ============ 라벨 스프라이트 ============
  _makeLabel(text, { fontSize = 64, bold = false, worldH = 6 } = {}) {
    const c = document.createElement('canvas');
    const ctx = c.getContext('2d');
    const font = `${bold ? 'bold ' : ''}${fontSize}px "Times New Roman", serif`;
    ctx.font = font;
    c.width = Math.ceil(ctx.measureText(text).width) + 16;
    c.height = fontSize + 16;
    ctx.font = font;
    ctx.fillStyle = '#000';
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    ctx.fillText(text, 8, c.height / 2);
    const tex = new THREE.CanvasTexture(c);
    tex.minFilter = THREE.LinearFilter;
    tex.anisotropy = 4;
    const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
    spr.scale.set((worldH * c.width) / c.height, worldH, 1);
    return spr;
  }

  _buildAxes() {
    if (this._axesGrp) {
      this._axesGrp.traverse((o) => {
        if (o.material) { o.material.map?.dispose(); o.material.dispose(); }
      });
      this.scene.remove(this._axesGrp);
    }
    const grp = new THREE.Group();
    const ax = this._axes;

    this._cycleTitle = this._makeLabel(ax.x.label, { bold: true, worldH: 9 });
    this._phaseTitle = this._makeLabel(ax.y.label, { bold: true, worldH: 9 });
    this._ampTitle = this._makeLabel(ax.z.label, { bold: true, worldH: 8 });

    this._cycleTicks = ax.x.ticks.map((v) => {
      const l = this._makeLabel(String(v), { worldH: 6 });
      l.userData.t = (v - ax.x.min) / (ax.x.max - ax.x.min);
      return l;
    });
    this._phaseTicks = ax.y.ticks.map((v) => {
      const l = this._makeLabel(String(v), { worldH: 6 });
      l.userData.t = (v - ax.y.min) / (ax.y.max - ax.y.min);
      return l;
    });
    this._ampTicks = ax.z.ticks.map((v) => {
      const l = this._makeLabel(Number.isInteger(v) ? String(v) : v.toFixed(1), { worldH: 5.5 });
      l.userData.t = (v - ax.z.min) / (ax.z.max - ax.z.min);
      return l;
    });

    [this._cycleTitle, this._phaseTitle, this._ampTitle,
      ...this._cycleTicks, ...this._phaseTicks, ...this._ampTicks].forEach((s) => grp.add(s));

    this.scene.add(grp);
    this._axesGrp = grp;
  }

  // 카메라 각도에 따라 벽/라벨을 데이터 뒤/앞으로 동적 배치
  _updateOrientation() {
    const W = this._W, D = this._D;
    const sx = this.camera.position.x >= 0 ? 1 : -1;
    const sz = this.camera.position.z >= 0 ? 1 : -1;
    const on = this._showWalls;
    const wl = this._walls;
    wl.floor.visible = on;
    wl.xPos.visible = on && sx < 0;
    wl.xNeg.visible = on && sx > 0;
    wl.zPos.visible = on && sz < 0;
    wl.zNeg.visible = on && sz > 0;

    // Cycle 축(x방향) → 앞쪽 바닥 모서리 (z = sz·D/2)
    this._cycleTicks.forEach((l) => l.position.set((l.userData.t - 0.5) * W, -7, sz * (D / 2 + 9)));
    this._cycleTitle.position.set(0, -16, sz * (D / 2 + 15));
    // Phase 축(z방향) → 오른쪽 바닥 모서리 (x = sx·W/2)
    this._phaseTicks.forEach((l) => l.position.set(sx * (W / 2 + 11), -7, (l.userData.t - 0.5) * D));
    this._phaseTitle.position.set(sx * (W / 2 + 17), -16, 0);
    // Amplitude 축(수직) → 앞왼쪽 수직 모서리 (x = -sx·W/2, z = sz·D/2)
    this._ampTicks.forEach((l) => l.position.set(-sx * (W / 2 + 10), l.userData.t * H, sz * (D / 2 + 10)));
    this._ampTitle.position.set(-sx * (W / 2 + 20), H * 0.5, sz * (D / 2 + 16));
  }

  // ============ 막대 (merged geometry) ============
  _buildBars() {
    if (this.barsMesh) {
      this.scene.remove(this.barsMesh);
      this.barsMesh.geometry.dispose();
      this.barsMesh.material.dispose();
      this.barsMesh = null;
    }
    if (this.edgesMesh) {
      this.scene.remove(this.edgesMesh);
      this.edgesMesh.geometry.dispose();
      this.edgesMesh.material.dispose();
      this.edgesMesh = null;
    }
    const values = this._values;
    if (!values || !values.length) return;

    const ny = values.length;
    const nx = values[0].length;
    const [vmin, vmax] = this._resolveRange(values);
    const span = vmax - vmin || 1;

    // 격자 수에 맞춰 박스 치수 갱신 → 셀이 정사각(가로세로 비 일정)
    this._applyGridDims(nx, ny);
    const W = this._W, D = this._D;
    const cell = W / nx;                 // = D / ny (정사각 셀)
    const barW = cell * this._fillRatio, barD = cell * this._fillRatio;
    const barGeoms = [], edgeGeoms = [];
    const unitEdge = this._showEdges ? new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1)) : null;

    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        const t = Math.max(0, Math.min(1, (values[j][i] - vmin) / span));
        const hgt = Math.max(t * H, 0.4);
        const cx = ((i + 0.5) / nx) * W - W / 2;
        const cz = ((j + 0.5) / ny) * D - D / 2;

        const box = new THREE.BoxGeometry(barW, hgt, barD);
        box.translate(cx, hgt / 2, cz);
        const [r, g, b] = this._colorFn(t);
        const n = box.attributes.position.count;
        const col = new Float32Array(n * 3);
        for (let k = 0; k < n; k++) { col[k * 3] = r; col[k * 3 + 1] = g; col[k * 3 + 2] = b; }
        box.setAttribute('color', new THREE.BufferAttribute(col, 3));
        barGeoms.push(box);

        if (this._showEdges) {
          const eg = unitEdge.clone();
          eg.scale(barW, hgt, barD);
          eg.translate(cx, hgt / 2, cz);
          edgeGeoms.push(eg);
        }
      }
    }

    const merged = mergeGeometries(barGeoms, false);
    barGeoms.forEach((g) => g.dispose());
    this.barsMesh = new THREE.Mesh(merged, new THREE.MeshLambertMaterial({ vertexColors: true }));
    this.scene.add(this.barsMesh);

    if (this._showEdges && edgeGeoms.length) {
      const em = mergeGeometries(edgeGeoms, false);
      edgeGeoms.forEach((g) => g.dispose());
      unitEdge.dispose();
      this.edgesMesh = new THREE.LineSegments(em, new THREE.LineBasicMaterial({ color: 0x222222 }));
      this.scene.add(this.edgesMesh);
    }
  }

  _resolveRange(values) {
    if (this._valueRange) return this._valueRange;
    let mn = Infinity, mx = -Infinity;
    for (const row of values) for (const v of row) { if (v < mn) mn = v; if (v > mx) mx = v; }
    return [mn, mx];
  }

  // ============ 공개 API ============
  setData(values, valueRange = null) {
    this._values = values;
    this._valueRange = valueRange;
    this._buildBars();
  }

  setFillRatio(v) { this._fillRatio = v; this._buildBars(); }
  setShowEdges(v) { this._showEdges = v; this._buildBars(); }
  setShowWalls(v) { this._showWalls = v; }
  setAutoRotate(v) { this.controls.autoRotate = v; this.controls.autoRotateSpeed = 1.2; }

  setAxes(axes) {
    this._axes = { ...this._axes, ...axes };
    this._buildAxes();
  }

  resize() {
    const w = this.canvas.clientWidth || 1;
    const h = this.canvas.clientHeight || 1;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  _loop = () => {
    if (this._disposed) return;
    this._raf = requestAnimationFrame(this._loop);
    this.controls.update();
    this._updateOrientation();
    this.renderer.render(this.scene, this.camera);
  };

  dispose() {
    this._disposed = true;
    cancelAnimationFrame(this._raf);
    this.controls.dispose();
    this.scene.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) {
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        mats.forEach((m) => { m.map?.dispose(); m.dispose(); });
      }
    });
    this.renderer.dispose();
  }
}

export const BOX_DIMENSIONS = { H, MAX_EXTENT };
