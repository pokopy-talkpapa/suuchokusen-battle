// js/numpad.js
export class Numpad {
  constructor() {
    this._el      = document.getElementById('numpad')
    this._display = document.getElementById('display-input')
    this._value   = ''
    this._onSubmit = null
    this._onPress  = null
    this._bind()
  }

  _bind() {
    this._el.addEventListener('click', (e) => {
      const btn = e.target.closest('button')
      if (!btn) return
      if (this._onPress) this._onPress() // どのキーでも押した手応え（効果音用）
      if (btn.id === 'btn-clear') {
        this._value = this._value.slice(0, -1)
      } else if (btn.id === 'btn-ok') {
        if (this._value !== '' && this._onSubmit) {
          this._onSubmit(parseInt(this._value, 10))
        }
        return
      } else {
        const d = btn.dataset.digit
        if (d !== undefined && this._value.length < 4) {
          this._value += d
        }
      }
      this._render()
    })
  }

  _render() {
    this._display.textContent = this._value || '---'
  }

  show() {
    this._el.classList.add('visible')
    this._display.classList.add('visible')
  }

  hide() {
    this._el.classList.remove('visible')
    this._display.classList.remove('visible')
  }

  reset() {
    this._value = ''
    this._render()
  }

  // 読み間違い（正解と違う数字を書いてしまった）の視覚フィードバック。文字は出さず色と揺れだけで伝える。
  flashWrong() {
    this._display.classList.add('wrong')
    setTimeout(() => this._display.classList.remove('wrong'), 350)
  }

  getValue() {
    return this._value
  }

  onSubmit(cb) {
    this._onSubmit = cb
  }

  onPress(cb) {
    this._onPress = cb
  }
}
