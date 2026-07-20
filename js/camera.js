// js/camera.js
// 敵の描画倍率をカメラのズームに連動させる。今見えている数直線の窓（zoomMin〜zoomMax）が
// 狭いほど「敵に近づいた」とみなして大きく描く。全体ビュー=FULL_SCALE、ズームが深いほど
// MAX_SCALE へ対数カーブで滑らかに近づく。renderer はこの戻り値を meta.scale に掛ける。
// 撃沈アニメの寸法も renderer 側で同じ倍率から導出されるため、ここを直せば演出全体が揃う。
export function enemyCamScale(zoomMin, zoomMax, CONFIG) {
  const { MIN, MAX } = CONFIG.RULER
  const { FULL_SCALE, MAX_SCALE, CURVE } = CONFIG.ZOOM_ENEMY
  const span = Math.max(1, zoomMax - zoomMin)
  const spanRatio = (MAX - MIN) / span              // 全体=1・100窓=10・10窓=50
  const zoomLevel = Math.log10(Math.max(1, spanRatio)) // 全体=0・100窓=1・10窓≈1.7
  const t = 1 - Math.pow(10, -CURVE * zoomLevel)    // zoomLevel=0で0、深いほど1へ飽和
  return FULL_SCALE + (MAX_SCALE - FULL_SCALE) * t
}
