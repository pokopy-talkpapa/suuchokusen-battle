// js/tutorial.js
const SEEN_KEY = 'suuchokusen_tutorial_seen_v1'

export class Tutorial {
  constructor() {
    this._overlay  = document.getElementById('tutorial-overlay')
    this._openBtn  = document.getElementById('tutorial-open-btn')
    this._slides   = Array.from(document.querySelectorAll('.tutorial-slide'))
    this._dots     = Array.from(document.querySelectorAll('.tutorial-dots span'))
    this._nextBtn  = document.getElementById('tutorial-next')
    this._skipBtn  = document.getElementById('tutorial-skip')
    this._index    = 0
    this._onClose  = null

    this._nextBtn.addEventListener('click', () => this._advance())
    this._skipBtn.addEventListener('click', () => this._close())
    this._openBtn.addEventListener('click', () => this.show())
  }

  // 初回起動時だけ自動表示するかどうか（localStorageに記録済みなら false）
  hasSeen() {
    try { return localStorage.getItem(SEEN_KEY) === '1' } catch { return true }
  }

  markSeen() {
    try { localStorage.setItem(SEEN_KEY, '1') } catch { /* private modeなど失敗しても致命的ではない */ }
  }

  onClose(cb) { this._onClose = cb }

  // タイトル画面にいる間だけ「あそびかた」ボタンを出す
  setOpenButtonVisible(visible) {
    this._openBtn.classList.toggle('visible', visible)
  }

  show() {
    this._index = 0
    this._render()
    this._overlay.classList.add('visible')
  }

  _advance() {
    if (this._index >= this._slides.length - 1) { this._close(); return }
    this._index += 1
    this._render()
  }

  _close() {
    this._overlay.classList.remove('visible')
    this.markSeen()
    if (this._onClose) this._onClose()
  }

  _render() {
    this._slides.forEach((el, i) => el.classList.toggle('active', i === this._index))
    this._dots.forEach((el, i) => el.classList.toggle('active', i === this._index))
    const isLast = this._index === this._slides.length - 1
    this._nextBtn.textContent = isLast ? 'はじめる' : 'つぎへ'
    this._skipBtn.style.visibility = isLast ? 'hidden' : 'visible'
  }
}
