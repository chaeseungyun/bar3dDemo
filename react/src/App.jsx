import { useMemo, useState } from 'react';
import Bar3DChart from './Bar3DChart.jsx';
import { generateSampleData } from './lib/sampleData.js';
import { jetCssStops } from './lib/jet.js';

const DENSITY = {
  hi: { nx: 50, ny: 36, label: '50 × 36 (1,800)' },
  mid: { nx: 50, ny: 18, label: '50 × 18 (900)' },
  lo: { nx: 25, ny: 18, label: '25 × 18 (450)' },
};

export default function App() {
  const [density, setDensity] = useState('mid');
  const [fillRatio, setFillRatio] = useState(0.92);
  const [showEdges, setShowEdges] = useState(false);
  const [showWalls, setShowWalls] = useState(true);
  const [autoRotate, setAutoRotate] = useState(false);

  const { nx, ny } = DENSITY[density];
  const data = useMemo(() => generateSampleData(nx, ny), [nx, ny]);

  return (
    <div style={{ position: 'fixed', inset: 0, background: '#fff' }}>
      <Bar3DChart
        data={data}
        valueRange={[0, 1]}
        fillRatio={fillRatio}
        showEdges={showEdges}
        showWalls={showWalls}
        autoRotate={autoRotate}
        axes={{
          x: { label: 'Cycle', ticks: [0, 10, 20, 30, 40, 50], min: 0, max: 50 },
          y: { label: 'Phase(°)', ticks: [0, 90, 180, 270, 360], min: 0, max: 360 },
          z: { label: 'Relative amplitude', ticks: [0, 0.2, 0.4, 0.6, 0.8, 1.0], min: 0, max: 1 },
        }}
      />

      <div style={panelStyle}>
        <div style={{ fontWeight: 600, marginBottom: 6 }}>Bar3DChart (React)</div>
        <label style={rowStyle}>
          <span>막대 외곽선</span>
          <input type="checkbox" checked={showEdges} onChange={(e) => setShowEdges(e.target.checked)} />
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
