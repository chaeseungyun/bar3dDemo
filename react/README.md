# Bar3DChart (React)

`prototype-threejs/index.html`(HTML 프로토타입)을 React 컴포넌트로 마이그레이션한 버전.
HTML 프로토타입은 `../prototype-threejs/`, `../prototype-echarts/`에 그대로 보존.

## 구조

```
src/
  lib/
    Bar3DRenderer.js   # Three.js 엔진 (React 무관, 순수 JS 클래스). 앱과 함께 이식 가능.
    jet.js             # jet 컬러맵 + CSS 그라데이션 헬퍼
    sampleData.js      # 스펙 재현용 합성 데이터 생성기
  Bar3DChart.jsx       # React 래퍼 (생명주기/props만 관리)
  App.jsx              # 데모: 컨트롤 패널 + 범례
  main.jsx             # 엔트리 (StrictMode 미사용 — WebGL 컨텍스트 중복 방지)
```

**설계 원칙**: 명령형 Three.js 로직은 `Bar3DRenderer`(순수 JS)에 두고,
React는 mount/unmount/resize/prop 반영만 담당. 앱에 넣을 땐 `Bar3DChart.jsx` +
`lib/`만 복사하면 됨.

## 실행

```bash
cd react
npm install
npm run dev
```

## 컴포넌트 사용

```jsx
import Bar3DChart from './Bar3DChart.jsx';

<Bar3DChart
  data={values2D}          // number[ny][nx]  (행=phase, 열=cycle)
  valueRange={[0, 1]}      // 색/높이 정규화 (생략 시 자동 min~max)
  fillRatio={0.92}         // 막대 굵기(1=빈틈 0)
  showEdges                // 막대 검은 외곽선
  showWalls                // 배경 벽/그리드 (카메라 각도 따라 동적)
  axes={{
    x: { label: 'Cycle', ticks: [0,10,20,30,40,50], min: 0, max: 50 },
    y: { label: 'Phase(°)', ticks: [0,90,180,270,360], min: 0, max: 360 },
    z: { label: 'Relative amplitude', ticks: [0,0.2,0.4,0.6,0.8,1.0], min: 0, max: 1 },
  }}
/>
```

## 데이터 형식

렌더러는 **2차원 행렬**(`number[ny][nx]`)만 받는다 — 형식 중립. 실데이터가
행렬이 아니면(리스트/CSV/API 등) 얇은 어댑터로 `number[ny][nx]`로 변환해 넘기면 됨.
