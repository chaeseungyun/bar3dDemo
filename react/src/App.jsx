import { useEffect, useRef, useState } from 'react';
import Bar3DChart from './Bar3DChart.jsx';
import { generateSampleData, evolveData } from './lib/sampleData.js';
import { jetCssStops } from './lib/jet.js';

const DENSITY = {
  hi: { nx: 40, ny: 40, label: '40 × 40 (1,600)' },
  mid: { nx: 30, ny: 30, label: '30 × 30 (900)' },
  lo: { nx: 20, ny: 20, label: '20 × 20 (400)' },
};
const TICK_MS = 800; // 데이터 갱신 주기 (화면은 60fps로 보간)
const LERP = 0.06;   // 프레임당 목표 접근 비율 (작을수록 천천히 부드럽게)

export default function App() {
  const [density, setDensity] = useState('mid');
  const [fillRatio, setFillRatio] = useState(0.92);
  const [showWalls, setShowWalls] = useState(true);
  const [autoRotate, setAutoRotate] = useState(false);
  const [animate, setAnimate] = useState(false);

  const { nx, ny } = DENSITY[density];
  const baseRef = useRef(null);
  const [data, setData] = useState(() => {
    const d = generateSampleData(DENSITY.mid.nx, DENSITY.mid.ny);
    baseRef.current = d;
    return d;
  });

  // 격자 밀도 변경 → 데이터/기준 언덕 재생성
  useEffect(() => {
    const d = generateSampleData(nx, ny);
    baseRef.current = d;
    setData(d);
  }, [nx, ny]);

  // 실시간 애니메이션: 일정 주기로 데이터를 흔들어 setData → 엔진이 부드럽게 보간
  useEffect(() => {
    if (!animate) return;
    const id = setInterval(() => {
      setData((prev) => evolveData(prev, baseRef.current, { pull: 0.1, jitter: 0.12 }));
    }, TICK_MS);
    return () => clearInterval(id);
  }, [animate]);

  return (
    <div style={{ position: 'fixed', inset: 0, background: '#fff' }}>
      <Bar3DChart
        data={data}
        valueRange={[0, 1]}
        fillRatio={fillRatio}
        showWalls={showWalls}
        autoRotate={autoRotate}
        lerp={LERP}
        axes={{
          x: { label: 'Cycle', ticks: [0, 10, 20, 30, 40, 50], min: 0, max: 50 },
          y: { label: 'Phase(°)', ticks: [0, 90, 180, 270, 360], min: 0, max: 360 },
          z: { label: 'Relative amplitude', ticks: [0, 0.2, 0.4, 0.6, 0.8, 1.0], min: 0, max: 1 },
        }}
      />

      <div style={panelStyle}>
        <div style={{ fontWeight: 600, marginBottom: 6 }}>Bar3DChart (React)</div>
        <label style={rowStyle}>
          <span>실시간 애니메이션</span>
          <input type="checkbox" checked={animate} onChange={(e) => setAnimate(e.target.checked)} />
        </label>
        <label style={rowStyle}>
          <span>fill ratio</span>
          <input type="range" min="30" max="100" value={Math.round(fillRatio * 100)}
            onChange={(e) => setFillRatio(+e.target.value / 100)} style={{ flex: 1 }} />
        </label>
        <label style={rowStyle}>
          <span>격자 밀도</span>
          <select value={density} onChange={(e) => setDensity(e.target.value)}>
            {Object.entries(DENSITY).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
        </label>
        <label style={rowStyle}>
          <span>배경 벽/그리드</span>
          <input type="checkbox" checked={showWalls} onChange={(e) => setShowWalls(e.target.checked)} />
        </label>
        <label style={rowStyle}>
          <span>자동 회전</span>
          <input type="checkbox" checked={autoRotate} onChange={(e) => setAutoRotate(e.target.checked)} />
        </label>
        <div style={{ marginTop: 8 }}>
          <div style={{ fontSize: 11, color: '#666', marginBottom: 3 }}>Relative amplitude</div>
          <div style={{ height: 10, borderRadius: 3, background: `linear-gradient(to right, ${jetCssStops()})` }} />
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#888' }}>
            <span>0</span><span>1</span>
          </div>
        </div>
      </div>
    </div>
  );
}

const panelStyle = {
  position: 'fixed', top: 12, left: 12, zIndex: 10, width: 230,
  background: 'rgba(255,255,255,0.92)', border: '1px solid #ddd', borderRadius: 6,
  padding: '10px 12px', fontFamily: 'system-ui, sans-serif', fontSize: 13, color: '#333',
  boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
};
const rowStyle = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6, margin: '6px 0' };
