import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { jet as jetColor } from './jet.js';

// 월드 좌표 박스 치수 (Cycle=x, Phase=z, Amplitude=y)
// H(진폭 축)는 고정, W·D(가로·깊이)는 격자 수에 비례해 동적 계산 → 셀이 항상 정사각.
const H = 78;            // amplitude 축 높이
const MAX_EXTENT = 130;  // 격자 최대 변 길이
const MIN_BAR_H = 0.3;   // 값 0에서도 얇게 보이는 최소 높이

const DEFAULT_AXES = {
  x: { label: 'Cycle', ticks: [0, 10, 20, 30, 40, 50], min: 0, max: 50 },
  y: { label: 'Phase(°)', ticks: [0, 90, 180, 270, 360], min: 0, max: 360 },
  z: { label: 'Relative amplitude', ticks: [0, 0.2, 0.4, 0.6, 0.8, 1.0], min: 0, max: 1 },
};

/**
 * 프레임워크 무관 3D 막대 차트 엔진.
 * 막대는 InstancedMesh로 렌더 → 값이 바뀌면 geometry 재생성 없이
 * 인스턴스 행렬/색만 갱신하므로 실시간 애니메이션에 적합.
 * setData(target)로 목표값을 주면 매 프레임 current→target 으로 부드럽게 보간.
 */
export class Bar3DRenderer {
  constructor(canvas, opts = {}) {
    this.canvas = canvas;
    this._valueRange = null;             // [min, max] (null이면 자동)
    this._fillRatio = opts.fillRatio ?? 0.92;
    this._showWalls = opts.showWalls ?? true;
    this._colorFn = opts.colorFn ?? jetColor;
    this._axes = { ...DEFAULT_AXES, ...(opts.axes || {}) };
    this._lerp = opts.lerp ?? 0.15;      // 프레임당 목표 접근 비율 (클수록 빠름)
    this._W = MAX_EXTENT;
    this._D = MAX_EXTENT;

    // 인스턴스 상태
    this._nx = 0; this._ny = 0;
    this._inst = null;                   // THREE.InstancedMesh
    this._current = null;                // Float32Array (정규화 높이 0~1)
    this._target = null;                 // Float32Array (목표)
    this._dummy = new THREE.Object3D();
    this._color = new THREE.Color();

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

  // ============ 라벨 스프라이트 (항상 카메라 향함) ============
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
        if (o.geometry) o.geometry.dispose();
        if (o.material) { o.material.map?.dispose(); o.material.dispose(); }
      });
      this.scene.remove(this._axesGrp);
    }
    const grp = new THREE.Group();
    const ax = this._axes;

    this._cycleTitle = this._makeLabel(ax.x.label, { bold: true, worldH: 9 });
    this._phaseTitle = this._makeLabel(ax.y.label, { bold: true, worldH: 9 });
    this._ampTitle = this._makeLabel(ax.z.label, { bold: true, worldH: 8 });
    this._ampTitle.material.rotation = Math.PI / 2; // 화면상 세로로 읽힘

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

    this._cycleTicks.forEach((l) => l.position.set((l.userData.t - 0.5) * W, -7, sz * (D / 2 + 9)));
    this._cycleTitle.position.set(0, -18, sz * (D / 2 + 24));
    this._phaseTicks.forEach((l) => l.position.set(sx * (W / 2 + 11), -7, (l.userData.t - 0.5) * D));
    this._phaseTitle.position.set(sx * (W / 2 + 24), -18, 0);
    this._ampTicks.forEach((l) => l.position.set(-sx * (W / 2 + 10), l.userData.t * H, sz * (D / 2 + 10)));
    this._ampTitle.position.set(-sx * (W / 2 + 38), H * 0.5, sz * (D / 2 + 8));
  }

  // ============ 막대 (InstancedMesh) ============
  _rebuildInstanced(nx, ny) {
    if (this._inst) {
      this.scene.remove(this._inst);
      this._inst.geometry.dispose();
      this._inst.material.dispose();
      this._inst = null;
    }
    this._nx = nx; this._ny = ny;
    const count = nx * ny;

    // 바닥(y=0)에서 위로 자라도록 base를 0..1 범위로 이동 → Y 스케일 = 높이
    const base = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
    const inst = new THREE.InstancedMesh(base, new THREE.MeshLambertMaterial(), count);
    inst.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    inst.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(count * 3), 3);
    inst.instanceColor.setUsage(THREE.DynamicDrawUsage);
    inst.frustumCulled = false;
    this.scene.add(inst);
    this._inst = inst;

    this._current = new Float32Array(count);
    this._target = new Float32Array(count);
  }

  // current[] 기준으로 인스턴스 행렬/색을 갱신
  _applyInstances() {
    const inst = this._inst;
    if (!inst || !this._current) return;
    const nx = this._nx, ny = this._ny, W = this._W, D = this._D;
    const bar = (W / nx) * this._fillRatio;
    const dummy = this._dummy, color = this._color, cur = this._current;
    let idx = 0;
    for (let j = 0; j < ny; j++) {
      const cz = ((j + 0.5) / ny) * D - D / 2;
      for (let i = 0; i < nx; i++) {
        const t = cur[idx];
        const h = Math.max(t * H, MIN_BAR_H);
        const cx = ((i + 0.5) / nx) * W - W / 2;
        dummy.position.set(cx, 0, cz);
        dummy.scale.set(bar, h, bar);
        dummy.updateMatrix();
        inst.setMatrixAt(idx, dummy.matrix);
        const [r, g, b] = this._colorFn(t);
        color.setRGB(r, g, b);
        inst.setColorAt(idx, color);
        idx++;
      }
    }
    inst.instanceMatrix.needsUpdate = true;
    if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
  }

  // 매 프레임 current를 target으로 보간
  _stepAnimation() {
    const cur = this._current, tgt = this._target;
    if (!cur) return;
    const k = this._lerp;
    let moved = false;
    for (let i = 0; i < cur.length; i++) {
      const d = tgt[i] - cur[i];
      if (Math.abs(d) > 1e-4) { cur[i] += d * k; moved = true; }
      else if (cur[i] !== tgt[i]) { cur[i] = tgt[i]; moved = true; }
    }
    if (moved) this._applyInstances();
  }

  _resolveRange(values) {
    if (this._valueRange) return this._valueRange;
    let mn = Infinity, mx = -Infinity;
    for (const row of values) for (const v of row) { if (v < mn) mn = v; if (v > mx) mx = v; }
    return [mn, mx];
  }

  // ============ 공개 API ============
  // values: number[ny][nx]. 같은 격자면 목표만 갱신(부드럽게 보간), 격자가 바뀌면 즉시 재구성.
  setData(values, valueRange = null) {
    if (!values || !values.length) return;
    this._valueRange = valueRange;
    const ny = values.length, nx = values[0].length;
    const [vmin, vmax] = this._resolveRange(values);
    const span = vmax - vmin || 1;

    this._applyGridDims(nx, ny);
    const sameGrid = this._inst && nx === this._nx && ny === this._ny;
    if (!sameGrid) this._rebuildInstanced(nx, ny);

    let idx = 0;
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        const t = Math.max(0, Math.min(1, (values[j][i] - vmin) / span));
        this._target[idx] = t;
        if (!sameGrid) this._current[idx] = t; // 새 격자는 즉시 표시
        idx++;
      }
    }
    if (!sameGrid) this._applyInstances();
  }

  setFillRatio(v) { this._fillRatio = v; this._applyInstances(); }
  setShowWalls(v) { this._showWalls = v; }
  setAutoRotate(v) { this.controls.autoRotate = v; this.controls.autoRotateSpeed = 1.2; }
  setLerp(v) { this._lerp = Math.max(0.01, Math.min(1, v)); }

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
    this._stepAnimation();
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
