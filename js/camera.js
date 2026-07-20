// js/camera.js
// 敵・海の描画をカメラのズームに連動させる純関数群。今見えている数直線の窓（zoomMin〜zoomMax）
// が狭いほど「敵に近づいた」とみなす。連続ズームレベル（全体=0・100窓=1・10窓=2、中間は連続値）
// に対するレベル別テーブル＋線形補間で、倍率・足元の高さ・海の寄りをすべて表現する。
// game.js のズーム補間アニメが補間中の zoomMin/zoomMax を渡してくるので、ここをテーブル補間に
// するだけで全部が同じアニメに乗って滑らかに動く。調整値は CONFIG.ZOOM_ENEMY / ZOOM_SEA。
//
// ただし「ちっぽけ→ズームで大きく」はズームが起きる場面でしか成立しない。ズームの無い場面
// （答え合わせ＝FIRE/RESULT、ズームを持たないみならいの測量）まで効かせると、一番の見せ場である
// 撃沈アニメが崩れるだけで得が無い。そこで zoomable=false のときは STATIC_* の等倍・定位置を返す。

// 連続ズームレベル: 全体=0・100窓=1・10窓=2。それより狭い窓は呼び出し側のテーブル補間で
// 末尾クランプされる
function zoomLevelOf(zoomMin, zoomMax, CONFIG) {
  const { MIN, MAX } = CONFIG.RULER
  const span = Math.max(1, zoomMax - zoomMin)
  const spanRatio = (MAX - MIN) / span
  return Math.log10(Math.max(1, spanRatio))
}

// レベル別テーブルの線形補間。level はテーブル範囲 [0, table.length-1] にクランプ
function lerpByLevel(table, level) {
  const max = table.length - 1
  const t = Math.min(Math.max(level, 0), max)
  const i = Math.min(Math.floor(t), max - 1)
  return table[i] + (table[i + 1] - table[i]) * (t - i)
}

// 敵の描画倍率。renderer はこの戻り値を meta.scale に掛ける。
// 撃沈アニメの寸法も renderer 側で同じ倍率から導出されるため、ここを直せば演出全体が揃う。
export function enemyCamScale(zoomMin, zoomMax, CONFIG, zoomable = true) {
  if (!zoomable) return CONFIG.ZOOM_ENEMY.STATIC_SCALE
  return lerpByLevel(CONFIG.ZOOM_ENEMY.BY_LEVEL, zoomLevelOf(zoomMin, zoomMax, CONFIG))
}

// 敵の足元（接地線）の画面高さ割合。全体ビューでは水平線（0.55）に乗り、近づくほど画面手前
// （下）に構える遠近法で、数直線との間の余白を稼ぐ。renderer はこの割合×画面高さを足元にする。
export function enemyAnchorFrac(zoomMin, zoomMax, CONFIG, zoomable = true) {
  if (!zoomable) return CONFIG.ZOOM_ENEMY.STATIC_ANCHOR
  return lerpByLevel(CONFIG.ZOOM_ENEMY.ANCHOR_BY_LEVEL, zoomLevelOf(zoomMin, zoomMax, CONFIG))
}

// この場面でズームが起きるか。測量フェーズで、かつ測量窓を持つランク（いっちょまえ以上）の
// ときだけ true。みならいは measureMode:'full' で常に全体表示＝ズームが無い。
// FIRE/RESULT は答え合わせのため常に全体表示に固定されている（game.js の fullView）。
export function isZoomableScene(phase, stage) {
  if (phase !== 'MEASURE') return false
  return stage?.measureMode !== 'full'
}
