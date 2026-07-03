// jet 컬러맵 근사 (파랑 → 청록 → 노랑 → 빨강)
export const JET = [
  [0, 0, 0.5], [0, 0, 1], [0, 0.5, 1], [0, 1, 1],
  [0.5, 1, 0.5], [1, 1, 0], [1, 0.5, 0], [1, 0, 0], [0.5, 0, 0],
];

// t(0~1) → [r, g, b] (각 0~1)
export function jet(t, stops = JET) {
  t = Math.max(0, Math.min(1, t));
  const x = t * (stops.length - 1);
  const i = Math.floor(x);
  const f = x - i;
  const a = stops[i];
  const b = stops[Math.min(i + 1, stops.length - 1)];
  return [
    a[0] + (b[0] - a[0]) * f,
    a[1] + (b[1] - a[1]) * f,
    a[2] + (b[2] - a[2]) * f,
  ];
}

// CSS 그라데이션 문자열 (범례 등에 사용)
export function jetCssStops(stops = JET) {
  return stops
    .map((c, i) => {
      const pct = Math.round((i / (stops.length - 1)) * 100);
      const rgb = c.map((v) => Math.round(v * 255)).join(',');
      return `rgb(${rgb}) ${pct}%`;
    })
    .join(', ');
}
