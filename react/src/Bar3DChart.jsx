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
 *   showWalls   boolean         — 배경 벽/그리드
 *   autoRotate  boolean         — 자동 회전
 *   lerp        number 0~1      — 데이터 변경 시 목표로 접근하는 프레임당 비율(부드러움)
 *   axes        { x, y, z }     — 축 라벨/눈금/범위
 *   colorFn     (t)=>[r,g,b]    — 컬러맵 (기본 jet)
 *   className, style            — 컨테이너 스타일 (크기는 여기서 지정)
 *
 * data를 같은 격자 크기로 계속 바꿔주면 엔진이 매 프레임 부드럽게 보간해 실시간 애니메이션이 된다.
 */
export default function Bar3DChart({
  data,
  valueRange = null,
  fillRatio = 0.92,
  showWalls = true,
  autoRotate = false,
  lerp = 0.15,
  axes,
  colorFn,
  className,
  style,
}) {
  const canvasRef = useRef(null);
  const engineRef = useRef(null);

  useEffect(() => {
    const engine = new Bar3DRenderer(canvasRef.current, {
      fillRatio, showWalls, colorFn, axes, lerp,
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

  useEffect(() => { engineRef.current?.setData(data, valueRange); }, [data, valueRange]);
  useEffect(() => { engineRef.current?.setFillRatio(fillRatio); }, [fillRatio]);
  useEffect(() => { engineRef.current?.setShowWalls(showWalls); }, [showWalls]);
  useEffect(() => { engineRef.current?.setAutoRotate(autoRotate); }, [autoRotate]);
  useEffect(() => { engineRef.current?.setLerp(lerp); }, [lerp]);
  useEffect(() => { if (axes) engineRef.current?.setAxes(axes); }, [axes]);

  return (
    <div className={className} style={{ width: '100%', height: '100%', ...style }}>
      <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block' }} />
    </div>
  );
}
