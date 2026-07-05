// js/tutorial.js
// チュートリアル＝「実際のプレイ画面での操作誘導（ガイド）」が本体。
// この DOM オーバーレイは冒頭の物語1枚（きみは砲手だよ）だけを担当する。
// 文字スライドで遊び方を説明しても子どもは読まないため、操作説明はすべて
// game.js/renderer.js のガイド（吹き出し＋ハイライト）側でやる(2026-07-06方針転換)。
const SEEN_KEY = 'suuchokusen_tutorial_seen_v1'

export class Tutorial {
  constructor() {
    this._overlay  = document.getElementById('tutorial-overlay')
    this._openBtn  = document.getElementById('tutorial-open-btn')
    this._startBtn = document.getElementById('tutorial-start')
    this._onClose  = null
    this._guideRequested = false // 「あそびかた」ボタンで見返す時、次のプレイをもう一度ガイドする

    this._startBtn.addEventListener('click', () => this._close())
    this._openBtn.addEventListener('click', () => { this._guideRequested = true; this.show() })
  }

  hasSeen() {
    try { return localStorage.getItem(SEEN_KEY) === '1' } catch { return true }
  }

  // ガイドを最後（発射）までやり切った時だけ「見た」扱いにする。
  // ようこそ画面を閉じただけでは記録しない＝途中でやめたら次のプレイでまたガイドする。
  markSeen() {
    this._guideRequested = false
    try { localStorage.setItem(SEEN_KEY, '1') } catch { /* private modeなど失敗しても致命的ではない */ }
  }

  // 次のプレイをガイド付きにするか
  shouldGuide() { return this._guideRequested || !this.hasSeen() }

  isOpen() { return this._overlay.classList.contains('visible') }

  onClose(cb) { this._onClose = cb }

  // タイトル画面にいる間だけ「あそびかた」ボタンを出す
  setOpenButtonVisible(visible) {
    this._openBtn.classList.toggle('visible', visible)
  }

  show() { this._overlay.classList.add('visible') }

  _close() {
    this._overlay.classList.remove('visible')
    if (this._onClose) this._onClose()
  }
}
