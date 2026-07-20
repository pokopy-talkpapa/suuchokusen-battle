// js/camera.js
// 敵の描画倍率をカメラのズームに連動させる。今見えている数直線の窓（zoomMin〜zoomMax）が
// 狭いほど「敵に近づいた」とみなして大きく描く。全体ビュー=FULL_SCALE、ズームが深いほど
// MAX_SCALE へ対数カーブで滑らかに近づく。renderer はこの戻り値を meta.scale に掛ける。
// 撃沈アニメの寸法も renderer 側で同じ倍率から導出されるため、ここを直せば演出全体が揃う。
//
// ただし「ちっぽけ→ズームで大きく」はズームが起きる場面でしか成立しない。ズームの無い場面
// （答え合わせ＝FIRE/RESULT、ズームを持たないみならいの測量）まで縮めると、一番の見せ場である
// 撃沈アニメが小さくなるだけで得が無い。そこで zoomable=false のときは STATIC_SCALE を返す。
export function enemyCamScale(zoomMin, zoomMax, CONFIG, zoomable = true) {
  if (!zoomable) return CONFIG.ZOOM_ENEMY.STATIC_SCALE
  const { MIN, MAX } = CONFIG.RULER
  const { FULL_SCALE, MAX_SCALE, CURVE } = CONFIG.ZOOM_ENEMY
  const span = Math.max(1, zoomMax - zoomMin)
  const spanRatio = (MAX - MIN) / span              // 全体=1・100窓=10・10窓=100
  const zoomLevel = Math.log10(Math.max(1, spanRatio)) // 全体=0・100窓=1・10窓=2
  const t = 1 - Math.pow(10, -CURVE * zoomLevel)    // zoomLevel=0で0、深いほど1へ飽和
  return FULL_SCALE + (MAX_SCALE - FULL_SCALE) * t
}

// この場面でズームが起きるか。測量フェーズで、かつ測量窓を持つランク（いっちょまえ以上）の
// ときだけ true。みならいは measureMode:'full' で常に全体表示＝ズームが無い。
// FIRE/RESULT は答え合わせのため常に全体表示に固定されている（game.js の fullView）。
export function isZoomableScene(phase, stage) {
  if (phase !== 'MEASURE') return false
  return stage?.measureMode !== 'full'
}
