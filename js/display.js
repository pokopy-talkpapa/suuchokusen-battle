// js/display.js
// 内部の数直線スケール（0〜1000）と画面表示のあいだの変換層。
// まぼろしランクだけ stage.display = { divisor: 100, decimals: 1 } を持ち、
// 内部340 を「3.4」と表示し、入力「3.4」を内部340 に戻す。
// 物理・判定・ズームは内部値のまま動く＝この層より下は小数を知らない（設計書§2.2）。

export function formatRulerValue(value, stage) {
  const d = stage?.display?.divisor
  if (!d) return String(value)
  const s = (value / d).toFixed(stage.display.decimals ?? 1)
  // 「3.0」は「3」に。全体ビュー（0〜10）の目盛りが 0,1,2…と読めるように
  return s.includes('.') ? s.replace(/0+$/, '').replace(/\.$/, '') : s
}

export function parseDisplayInput(str, stage) {
  if (str === '' || str == null) return null
  const n = Number(str)
  if (!Number.isFinite(n)) return null
  const d = stage?.display?.divisor
  return d ? Math.round(n * d) : Math.trunc(n)
}
