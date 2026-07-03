// 스펙 이미지(spec.png)와 유사한 합성 데이터 생성기.
// 중앙-후방(중간 cycle, 높은 phase)에 진폭이 몰린 언덕 형태 + 노이즈.
// seed 고정이라 항상 동일한 결과 → HTML 프로토타입과 값이 일치.
//
// 반환: number[ny][nx]  (행=phase 인덱스, 열=cycle 인덱스, 값=amplitude 0~1)
export function generateSampleData(nx = 50, ny = 36) {
  let seed = 20240703;
  const rand = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };

  const cx = 22, cy = 230, sx = 12, sy = 90; // 언덕 중심/폭 (cycle, phase 단위)
  const values = [];
  for (let j = 0; j < ny; j++) {
    const row = [];
    for (let i = 0; i < nx; i++) {
      const cycle = (i + 0.5) * (50 / nx);
      const phase = (j + 0.5) * (360 / ny);
      const env = Math.exp(
        -((cycle - cx) ** 2) / (2 * sx * sx) - ((phase - cy) ** 2) / (2 * sy * sy)
      );
      const noise = rand();
      const amp = Math.min(1, Math.max(0.02, env * (0.6 + 0.4 * noise) + 0.12 * noise));
      row.push(+amp.toFixed(3));
    }
    values.push(row);
  }
  return values;
}
