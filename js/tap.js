// js/tap.js
// タップ判定の単一の真実。
// 「ボタンを押した」＝押した点と離した点が同じ矩形の中にあること。
// ドラッグの指をボタンの上で離しただけでは押したことにならない（誤発射防止）。
export function pointInRect(p, r) {
  return !!p && !!r && p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h
}

export function isTapOnRect(pressPoint, releasePoint, rect) {
  return pointInRect(pressPoint, rect) && pointInRect(releasePoint, rect)
}
