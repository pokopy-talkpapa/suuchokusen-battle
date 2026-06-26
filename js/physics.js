// js/physics.js
// 結果フェーズの演出専用の放物線。
// (x0,y0)=砲口、(x1,y1)=着水点。両端を通り、中央が lift px だけ持ち上がる弧。
// ※命中判定には一切使わない（判定は「針を置いた値 vs 正解位置」の1本＝spec §6）。
export function arcPoints(x0, y0, x1, y1, steps = 36, lift = 160) {
  const pts = []
  for (let i = 0; i <= steps; i++) {
    const t = i / steps
    const x = x0 + (x1 - x0) * t
    const base = y0 + (y1 - y0) * t
    const y = base - lift * 4 * t * (1 - t) // t=0.5 で頂点
    pts.push({ x, y })
  }
  return pts
}
