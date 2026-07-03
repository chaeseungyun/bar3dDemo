import { useEffect, useRef } from 'react';
import { Bar3DRenderer } from './lib/Bar3DRenderer.js';

/**
 * 3D 막대 차트 React 컴포넌트.
 * Three.js 명령형 엔진(Bar3DRenderer)을 감싸고 생명주기만 관리한다.
 *
 * props:
 *   data        number[ny][nx]  — 행=y(phase), 열=x(cycle), 값=높이/색
 *   valueRange  [min, max]      — 색/높이 정규화 범위 (생략 시 자동)
 *   fillRatio   number 0~1      — 막대 굵기(1=빈틈 0)
 *   showEdges   boolean         — 막대 검은 외곽선
 *   showWalls   boolean         — 배경 벽/그리드
 *   autoRotate  boolean         — 자동 회전
 *   axes        { x, y, z }     — 축 라벨/눈금/범위 (Bar3DRenderer 참고)
 *   colorFn     (t)=>[r,g,b]    — 컬러맵 (기본 jet)
 *   className, style            — 컨테이너 스타일 (크기는 여기서 지정)
 */
export default function Bar3DChart({
  data,
  valueRange = null,
  fillRatio = 0.92,
  showEdges = true,
  showWalls = true,
  autoRotate = false,
  axes,
  colorFn,
  className,
  style,
}) {
  const canvasRef = useRef(null);
  const engineRef = useRef(null);

  // 최초 mount: 엔진 생성 / unmount: 정리
  useEffect(() => {
    const engine = new Bar3DRenderer(canvasRef.current, {
      fillRatio, showEdges, showWalls, colorFn, axes,
    });
    engineRef.current = engine;
    engine.resize();
    if (data) engine.setData(data, valueRange);

    const ro = new ResizeObserver(() => engine.resize());
    ro.observe(canvasRef.current.parentElement);

    return () => {
      ro.disconnect();
      engine.dispose();
      engineRef.current = null;
    };
    // 엔진은 한 번만 생성. 이후 변경은 아래 개별 effect가 반영.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // prop 변경 → 엔진에 반영
  useEffect(() => { engineRef.current?.setData(data, valueRange); }, [data, valueRange]);
  useEffect(() => { engineRef.current?.setFillRatio(fillRatio); }, [fillRatio]);
  useEffect(() => { engineRef.current?.setShowEdges(showEdges); }, [showEdges]);
  useEffect(() => { engineRef.current?.setShowWalls(showWalls); }, [showWalls]);
  useEffect(() => { engineRef.current?.setAutoRotate(autoRotate); }, [autoRotate]);
  useEffect(() => { if (axes) engineRef.current?.setAxes(axes); }, [axes]);

  return (
    <div className={className} style={{ width: '100%', height: '100%', ...style }}>
      <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block' }} />
    </div>
  );
}
