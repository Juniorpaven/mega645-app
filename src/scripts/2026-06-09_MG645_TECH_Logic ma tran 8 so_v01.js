// File nội bộ: 2026-06-09_MG645_TECH_Logic ma tran 8 so_v01.js
// Mục đích: Dịch ngược kết quả AI thành 4 vé bao

export function processAItoMatrix(aiData) {
  if (!aiData || !aiData.hot || !aiData.cold) return [];

  const anchorPool = [...aiData.hot, ...aiData.cold];
  let derivedPool = new Set();

  // Thuật toán Tịnh tiến ngược ±1
  anchorPool.forEach(num => {
    let down = num - 1 < 1 ? 45 : num - 1;
    let up = num + 1 > 45 ? 1 : num + 1;
    derivedPool.add(down);
    derivedPool.add(up);
  });

  // Đảm bảo đủ 8 số (nếu tịnh tiến bị trùng thì random bù vào cho đủ 8)
  let final8 = Array.from(derivedPool);
  while (final8.length < 8) {
    let rand = Math.floor(Math.random() * 45) + 1;
    if (!final8.includes(rand) && !anchorPool.includes(rand)) {
      final8.push(rand);
    }
  }
  
  // Sắp xếp và đưa vào khuôn 4 vé
  final8 = final8.slice(0, 8).sort((a, b) => a - b);
  const [A, B, C, D, E, F, G, H] = final8;

  return [
    [A, B, C, D, E, F],
    [A, B, C, D, G, H],
    [A, B, E, F, G, H],
    [C, D, E, F, G, H]
  ];
}
