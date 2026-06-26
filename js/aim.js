// js/aim.js
// 照準パネル（手元の数直線）まわり。Task 3 では純粋ヘルパのみ。
// value を含む100窓（上級の射撃ズーム用）
export function hundredWindow(value) {
  const min = Math.floor(value / 100) * 100
  return { min, max: min + 100 }
}
