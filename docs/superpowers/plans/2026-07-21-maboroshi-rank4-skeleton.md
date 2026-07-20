# まぼろしの砲手（ランク4骨格）実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 4つ目のランク「まぼろしの砲手」（0〜10の海で0.1刻みの小数を読む）を仮素材で遊べる状態まで作る（設計書§6のフェーズ2「ランク4の骨格」）。

**Architecture:** 内部の数直線スケール0〜1000は一切変えず、新設する表示変換層 `js/display.js`（÷100で小数表示・小数入力→内部値）を表示系（renderer/numpad/game の表示箇所）だけに配線する。ランク構造は既存の maxLevel 連続命中アンロックを 1〜4 に拡張し、STAGES に4つ目のエントリを足す。ミクロ世界の素材（背景・敵・島・砲台）はフェーズ3で差し替える前提で、今回は既存のドローン・夜の海を仮素材として使う。

**Tech Stack:** バニラJS（ESM）・`node --test`・ビルドなし・GitHub Pages 公開。

**正本:** `docs/superpowers/specs/2026-07-20-maboroshi-decimal-rank-design.md` §2・§5

## Global Constraints

- **内部の数直線スケール 0〜1000 は変えない**（物理・判定・ズーム・ruler.js のロジックは無傷。表示だけ÷100）
- **既存3ランクの遊びのルール（測量窓・命中判定・スコア）は変えない**（既存テストが全部通り続けること）
- **調整値は config.js に集約**（hitMargin 等の初期値は仮置き・実機でぽこぴぃ調整前提）
- **解放条件: でんせつで9連続命中**（3→6→9の等差。`UNLOCK.MABOROSHI_STREAK: 9`）
- **ランク名: まぼろしの砲手**。表示 0〜10・正解0.1刻み（例: 内部340 → 表示3.4）
- タイトルチップ等に足す絵文字は**修飾コード無しの1文字絵文字のみ**（iOS canvas のズレ対策・game.js:224 のコメント参照）
- テストは `npm test`（node --test）。現在118本、全部緑を維持
- main への push＝GitHub Pages 自動公開。**実装は作業ブランチ `feat/maboroshi-rank4` で行い、公開はぽこぴぃの GoSign 必須**。公開前に `js/config.js` の VERSION を v1.53 へ
- 親向けミニレポート・0.01刻み・素材生成はスコープ外（設計書§7）

---

### Task 1: 表示変換層 js/display.js

**Files:**
- Create: `js/display.js`
- Test: `tests/display.test.js`

**Interfaces:**
- Produces: `formatRulerValue(value, stage) → string`（内部値→表示文字列。stage.display が無ければ `String(value)`）
- Produces: `parseDisplayInput(str, stage) → number|null`（表示文字列→内部値。数値でなければ null）
- 後続タスクは stage 定義の `display: { divisor: 100, decimals: 1 }` を前提にする

- [ ] **Step 1: 失敗するテストを書く**

`tests/display.test.js` を新規作成:

```js
import { test } from 'node:test'
import assert from 'node:assert'
import { formatRulerValue, parseDisplayInput } from '../js/display.js'

const MABOROSHI = { display: { divisor: 100, decimals: 1 } }
const NORMAL = {} // 既存ランク＝display なし

test('formatRulerValue: displayなしランクは内部値そのまま', () => {
  assert.equal(formatRulerValue(340, NORMAL), '340')
  assert.equal(formatRulerValue(0, NORMAL), '0')
  assert.equal(formatRulerValue(1000, undefined), '1000') // stage未定義でも落ちない
})

test('formatRulerValue: まぼろしは÷100で小数表示', () => {
  assert.equal(formatRulerValue(340, MABOROSHI), '3.4')
  assert.equal(formatRulerValue(1000, MABOROSHI), '10')
  assert.equal(formatRulerValue(0, MABOROSHI), '0')
})

test('formatRulerValue: 整数に割り切れる値は小数点を出さない（300→3）', () => {
  assert.equal(formatRulerValue(300, MABOROSHI), '3')
  assert.equal(formatRulerValue(100, MABOROSHI), '1')
})

test('parseDisplayInput: displayなしランクは整数として読む', () => {
  assert.equal(parseDisplayInput('340', NORMAL), 340)
  assert.equal(parseDisplayInput('007', NORMAL), 7)
})

test('parseDisplayInput: まぼろしは×100で内部値に戻す', () => {
  assert.equal(parseDisplayInput('3.4', MABOROSHI), 340)
  assert.equal(parseDisplayInput('3', MABOROSHI), 300)
  assert.equal(parseDisplayInput('10', MABOROSHI), 1000)
  assert.equal(parseDisplayInput('3.', MABOROSHI), 300) // 打ちかけでも落ちない
})

test('parseDisplayInput: 数値でなければ null', () => {
  assert.equal(parseDisplayInput('', MABOROSHI), null)
  assert.equal(parseDisplayInput('abc', NORMAL), null)
  assert.equal(parseDisplayInput('3.4.5', MABOROSHI), null)
})

test('往復で値が壊れない（format→parse＝恒等）', () => {
  for (const v of [0, 10, 340, 550, 990, 1000]) {
    assert.equal(parseDisplayInput(formatRulerValue(v, MABOROSHI), MABOROSHI), v)
    assert.equal(parseDisplayInput(formatRulerValue(v, NORMAL), NORMAL), v)
  }
})
```

- [ ] **Step 2: 失敗を確認**

Run: `node --test tests/display.test.js`
Expected: FAIL（`Cannot find module '../js/display.js'`）

- [ ] **Step 3: 実装**

`js/display.js` を新規作成:

```js
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
```

- [ ] **Step 4: テスト合格を確認**

Run: `node --test tests/display.test.js`
Expected: PASS（7本）

Run: `npm test`
Expected: 全部緑（既存118 + 7 = 125本）

- [ ] **Step 5: コミット**

```bash
git add js/display.js tests/display.test.js
git commit -m "feat: 小数表示の変換層 display.js（内部0〜1000⇔表示0〜10）"
```

---

### Task 2: アンロック4段対応（unlock.js + config UNLOCK）

**Files:**
- Modify: `js/unlock.js`（clamp 1〜3 → 1〜4・昇格分岐追加）
- Modify: `js/config.js:78-82`（UNLOCK に MABOROSHI_STREAK: 9）
- Test: `tests/unlock.test.js`（追記＋既存の上限3前提のテストがあれば4に更新）

**Interfaces:**
- Consumes: なし（独立）
- Produces: `UnlockState.maxLevel` が 1〜4 を取る。`CONFIG.UNLOCK.MABOROSHI_STREAK`（=9）

- [ ] **Step 1: 失敗するテストを書く**

`tests/unlock.test.js` に追記（既存テストのCONFIGフィクスチャに `MABOROSHI_STREAK: 9` を足す。フィクスチャが `UNLOCK: { BINOCULARS_STREAK: 3, TELESCOPE_STREAK: 6 }` 形なら同じ場所に追加）:

```js
test('でんせつ(maxLevel3)で9連続命中するとまぼろし(4)に昇格', () => {
  const u = new UnlockState(CFG, { maxLevel: 3, streak: 8 })
  u.recordHit(true, 3)
  assert.equal(u.maxLevel, 4)
})

test('下位ランクで遊んでも9連続でまぼろしには上がらない（養殖防止）', () => {
  const u = new UnlockState(CFG, { maxLevel: 3, streak: 8 })
  u.recordHit(true, 1) // でんせつ解放済みなのに みならい で遊んだ
  assert.equal(u.maxLevel, 3)
  assert.equal(u.streak, 8) // カウントも動かない
})

test('maxLevel4 が保存・復元できる（clampが4を潰さない）', () => {
  const u = new UnlockState(CFG, { maxLevel: 4, streak: 0 })
  assert.equal(u.maxLevel, 4)
})

test('壊れた保存値は今までどおり丸める（5→4・0→1）', () => {
  assert.equal(new UnlockState(CFG, { maxLevel: 5 }).maxLevel, 4)
  assert.equal(new UnlockState(CFG, { maxLevel: 0 }).maxLevel, 1)
})
```

※既存テストに「maxLevel: 5 → 3 に丸める」のような上限3前提の断言があれば、期待値を4に更新する（このタスクの仕様変更そのもの）。

- [ ] **Step 2: 失敗を確認**

Run: `node --test tests/unlock.test.js`
Expected: 新規4本が FAIL（clamp が 3 で止める）

- [ ] **Step 3: 実装**

`js/config.js` の UNLOCK（78行付近）:

```js
  UNLOCK: {
    BINOCULARS_STREAK: 3, // 双眼鏡（レベル2）解放に必要な連続命中数
    TELESCOPE_STREAK: 6,  // 望遠鏡（レベル3）解放に必要な連続命中数
    MABOROSHI_STREAK: 9,  // まぼろし（レベル4）解放に必要な連続命中数（3→6→9の等差）
    HIT_MARGIN_VALUE: 30, // 着弾「命中」の許容誤差（value単位、0〜1000スケール）
  },
```

`js/unlock.js` の2箇所:

```js
    this.level    = clampInt(level, 1, 4, 1)
    this.maxLevel = clampInt(maxLevel, 1, 4, 1)
```

（コメント「範囲外は 1〜3」も「1〜4」へ直す）

recordHit の昇格分岐（29-34行）:

```js
      const { BINOCULARS_STREAK, TELESCOPE_STREAK, MABOROSHI_STREAK } = this.CONFIG.UNLOCK
      if (this.streak >= MABOROSHI_STREAK && this.maxLevel < 4) {
        this.maxLevel = 4
      } else if (this.streak >= TELESCOPE_STREAK && this.maxLevel < 3) {
        this.maxLevel = 3
      } else if (this.streak >= BINOCULARS_STREAK && this.maxLevel < 2) {
        this.maxLevel = 2
      }
```

- [ ] **Step 4: テスト合格を確認**

Run: `npm test`
Expected: 全部緑

- [ ] **Step 5: コミット**

```bash
git add js/unlock.js js/config.js tests/unlock.test.js
git commit -m "feat: まぼろし解放条件（でんせつ9連続・maxLevel 1〜4）"
```

---

### Task 3: ランク情報の4段対応（stage.js）

**Files:**
- Modify: `js/stage.js:13-18`（nextRankNeed）
- Test: `tests/stage.test.js`（追記）

**Interfaces:**
- Consumes: Task 2 の `CONFIG.UNLOCK.MABOROSHI_STREAK`
- Produces: `nextRankNeed(3, CONFIG) === 9`・`nextRankNeed(4, CONFIG) === null`。`rankInfo` は既存実装のまま4段で正しく動く（stageIndexFromMaxLevel は STAGES.length で clamp 済み）

- [ ] **Step 1: 失敗するテストを書く**

`tests/stage.test.js` に追記（テスト内CONFIGフィクスチャへ MABOROSHI_STREAK: 9 と4つ目のSTAGESエントリ `{ name: 'まぼろしの砲手' }` を追加）:

```js
test('nextRankNeed: でんせつ(3)の次は9連続・まぼろし(4)は最高ランク', () => {
  assert.equal(nextRankNeed(3, CFG), 9)
  assert.equal(nextRankNeed(4, CFG), null)
})

test('rankInfo: でんせつ時の次ランク名はまぼろしの砲手', () => {
  const info = rankInfo(3, 7, CFG)
  assert.equal(info.needed, 9)
  assert.equal(info.remaining, 2)
  assert.equal(info.nextName, 'まぼろしの砲手')
})

test('rankInfo: まぼろし到達後は残り表示なし', () => {
  const info = rankInfo(4, 3, CFG)
  assert.equal(info.name, 'まぼろしの砲手')
  assert.equal(info.needed, null)
  assert.equal(info.remaining, null)
  assert.equal(info.nextName, null)
})
```

- [ ] **Step 2: 失敗を確認**

Run: `node --test tests/stage.test.js`
Expected: 新規テスト FAIL（nextRankNeed(3) が null を返す）

- [ ] **Step 3: 実装**

`js/stage.js` の nextRankNeed:

```js
// 次のランクに上がるのに必要な連続命中数。最高ランクなら null。
export function nextRankNeed(maxLevel, CONFIG) {
  if (maxLevel <= 1) return CONFIG.UNLOCK.BINOCULARS_STREAK
  if (maxLevel === 2) return CONFIG.UNLOCK.TELESCOPE_STREAK
  if (maxLevel === 3) return CONFIG.UNLOCK.MABOROSHI_STREAK
  return null
}
```

- [ ] **Step 4: テスト合格を確認**

Run: `npm test`
Expected: 全部緑

- [ ] **Step 5: コミット**

```bash
git add js/stage.js tests/stage.test.js
git commit -m "feat: ランク情報の4段対応（でんせつ→まぼろし9連続）"
```

---

### Task 4: STAGES に4つ目のエントリ＋timeOfDay 4段対応

**Files:**
- Modify: `js/config.js:85-116`（STAGES 配列に追加）
- Modify: `js/game.js:347`（timeOfDay の配列）

**Interfaces:**
- Consumes: Task 1 の `display` 形式
- Produces: `CONFIG.STAGES[3]`（name: 'まぼろしの砲手'・display 付き）。後続タスクは `stage.display` の有無でまぼろし判定する（stageIndex のハードコードはしない）

- [ ] **Step 1: STAGES にエントリを追加**

`js/config.js` の STAGES 配列末尾（でんせつの後）に:

```js
    { // まぼろし：0〜10の海で0.1を読む。内部は0〜1000のまま表示だけ÷100（設計書§2.2）。
      // 遊びの構造はいっちょまえと相似形：全体(1目盛り)→1の窓(0.1目盛り)。照準はでんせつ流用。
      name: 'まぼろしの砲手',
      measureMode: 'hundred',  // 内部100窓＝表示「1の窓」（0.1目盛り）
      measureTickStep: 10,     // 内部10＝表示0.1
      targetStep: 10,          // 正解は内部10の倍数＝表示0.1刻み（例: 340→3.4）
      aim: { tickStep: 100, zoomable: true, zoomTickStep: 10 },
      hitMargin: 14,           // 仮置き（でんせつと同値）。実機でぽこぴぃ調整
      enemyScale: 0.55,
      enemySprite: 'enemy-drone',  // 仮素材。フェーズ3でミクロ敵（画像生成）に差し替え
      display: { divisor: 100, decimals: 1 }, // 表示変換層（js/display.js）のスイッチ
    },
```

- [ ] **Step 2: timeOfDay を4段対応**

`js/game.js:347` を:

```js
      timeOfDay:      ['day', 'evening', 'night', 'night'][this._stageIndex] || 'day',
```

（まぼろしは仮で夜。フェーズ3でミクロの海背景に差し替えるときに専用値を検討）

- [ ] **Step 3: テストと起動確認**

Run: `npm test`
Expected: 全部緑（STAGES が4つになっても stageIndexFromMaxLevel の clamp・renderer の `CFG.STAGES[state.stageIndex] || {}` は配列長ベースなので壊れない）

- [ ] **Step 4: コミット**

```bash
git add js/config.js js/game.js
git commit -m "feat: STAGES にまぼろしの砲手を追加（仮素材・表示÷100）"
```

---

### Task 5: テンキーの小数点キー＋入力の文字列化

**Files:**
- Modify: `index.html:238-250`（小数点ボタン追加・グリッド列調整）
- Modify: `js/numpad.js`（setDecimalMode・小数点入力・submit を文字列渡しに）
- Modify: `js/game.js:595-597, 733`（onSubmit で parseDisplayInput 経由に）

**Interfaces:**
- Consumes: Task 1 の `parseDisplayInput(str, stage)`・Task 4 の `stage.display`
- Produces: `Numpad.setDecimalMode(on: boolean)`・`onSubmit(cb)` の cb は**生の文字列**を受け取る（旧: parseInt 済み数値）

- [ ] **Step 1: index.html にボタンとCSSを追加**

`#numpad` のグリッド（26行付近のCSS）に小数点モード用クラスを追加:

```css
    #numpad.decimal { grid-template-columns: repeat(7, 44px); }
    #numpad button#btn-dot { display: none; background: #2a5a8a; }
    #numpad.decimal button#btn-dot { display: block; }
```

ボタン列（241行付近）は既存の 1〜5/⌫/6〜0/OK の並びに `btn-dot` を足す（7列目・上段は空きセルで詰める）:

```html
      <button data-digit="1">1</button>
      <button data-digit="2">2</button>
      <button data-digit="3">3</button>
      <button data-digit="4">4</button>
      <button data-digit="5">5</button>
      <button id="btn-clear">⌫</button>
      <button data-digit="6">6</button>
      <button data-digit="7">7</button>
      <button data-digit="8">8</button>
      <button data-digit="9">9</button>
      <button data-digit="0">0</button>
      <button id="btn-dot">・</button>
      <button id="btn-ok">OK</button>
```

※通常モード（3列×？）のレイアウトが崩れないことを Step 4 のブラウザ確認で見る。崩れる場合は btn-dot を DOM 末尾に置き `display:none` で抜く方式を優先する。表示文字は「・」でなく「.」が読みやすければ実機で判断（仮は「.」推奨）。

- [ ] **Step 2: numpad.js を小数対応＋文字列 submit に**

`js/numpad.js` の _bind と追加メソッド:

```js
  _bind() {
    this._el.addEventListener('click', (e) => {
      const btn = e.target.closest('button')
      if (!btn) return
      if (this._onPress) this._onPress() // どのキーでも押した手応え（効果音用）
      if (btn.id === 'btn-clear') {
        this._value = this._value.slice(0, -1)
      } else if (btn.id === 'btn-ok') {
        if (this._value !== '' && this._onSubmit) {
          this._onSubmit(this._value) // 生の文字列を渡す。数値化は呼び側（表示変換層）の仕事
        }
        return
      } else if (btn.id === 'btn-dot') {
        // 小数点は1つまで。先頭で押したら「0.」から始める
        if (this._decimalMode && !this._value.includes('.') && this._value.length < 4) {
          this._value = this._value === '' ? '0.' : this._value + '.'
        }
      } else {
        const d = btn.dataset.digit
        if (d !== undefined && this._value.length < 4) {
          this._value += d
        }
      }
      this._render()
    })
  }

  // まぼろしランクだけ小数点キーを出す（stage.display の有無で呼び側が切り替える）
  setDecimalMode(on) {
    this._decimalMode = !!on
    this._el.classList.toggle('decimal', !!on)
  }
```

（constructor に `this._decimalMode = false` を追加）

- [ ] **Step 3: game.js の接続を差し替え**

`js/game.js` 冒頭の import に追加:

```js
import { formatRulerValue, parseDisplayInput } from './display.js'
```

595-597行付近（テンキー表示のところ）:

```js
    if (CONFIG.MODES[this._mode].showNumpad) {
      this._numpad.reset()
      this._numpad.setDecimalMode(!!this._stage.display) // まぼろしだけ小数点キー
      this._numpad.show()
      this._numpad.onSubmit((str) => this._submitMeasure(parseDisplayInput(str, this._stage)))
    } else {
      this._numpad.hide()
    }
```

`_submitMeasure(val)`（733行付近）の先頭に null ガードを追加:

```js
  _submitMeasure(val) {
    if (this._phase !== 'MEASURE') return
    if (val == null) return // 打ちかけ・不正入力は無反応（空文字OKと同じ扱い）
```

- [ ] **Step 4: テストとブラウザ確認**

Run: `npm test`
Expected: 全部緑

ブラウザ（preview: suuchokusen-battle・ポート3220）で:
1. `window.__game` で消音（`_audio.sfxOn=false; _audio.bgmOn=false; _audio.stopBgm()`）
2. みならい〜でんせつのテンキーに小数点キーが**出ない**こと・数字入力→OK が今までどおり通ること
3. `__game._stageIndex=3; __game._mode='beginner'; __game._startMeasure()` でまぼろし起動 → 小数点キーが出る・「3.4」と打てる・「3.4.」と打てない・正解入力で先へ進むこと

- [ ] **Step 5: コミット**

```bash
git add index.html js/numpad.js js/game.js
git commit -m "feat: テンキー小数点キー（まぼろしのみ表示・入力は文字列で受けて変換層で数値化）"
```

---

### Task 6: 表示変換の配線（renderer の数字表示5箇所＋メモ）

**Files:**
- Modify: `js/renderer.js`（import 追加＋String(value) の置換5箇所）
- Modify: `js/game.js:381`（memo を表示文字列で渡す）

**Interfaces:**
- Consumes: Task 1 の `formatRulerValue(value, stage)`・Task 4 の `stage.display`
- Produces: まぼろしランクの全数字表示が小数になる。既存ランクは formatRulerValue が String(value) を返すので**1ピクセルも変わらない**

- [ ] **Step 1: renderer.js に import と置換**

冒頭の import に追加:

```js
import { formatRulerValue } from './display.js'
```

置換箇所（すべて drawFrame 内かそこから呼ばれる描画で、`stg`＝`CFG.STAGES[state.stageIndex] || {}` が参照できる。メソッド分割されている箇所は同式でローカルに取り直す）:

1. **非MEASUREの端ラベル**（316-322行付近）: `String(value)` → `formatRulerValue(value, stg)`（measureText と strokeText/fillText の3箇所とも）
2. **AIMパネルの目盛り数字**（420行付近）: `ctx.fillText(String(value), …)` → `ctx.fillText(formatRulerValue(value, stg), …)`
3. **測量ズームの端ラベル**（681-684行付近）:

```js
          drawEdgeLabel(value, formatRulerValue(from, stg), 1 - state.zoomAnimT)
          drawEdgeLabel(value, formatRulerValue(to, stg), state.zoomAnimT)
        } else {
          drawEdgeLabel(value, formatRulerValue(value, stg), 1)
```

4. **測量救済ヒント2段目の数字**（697行付近、`state.zoomMax - state.tickStep` を文字にしている箇所）: 同様に `formatRulerValue(v, stg)`
5. **結果画面の「◯◯ ずれた」**（536-544行付近）: `` `${state.resultGap} ずれた` `` → `` `${formatRulerValue(state.resultGap, stg)} ずれた` ``（2箇所）

- [ ] **Step 2: game.js の memo を表示文字列に**

`js/game.js:381` 付近の state 生成:

```js
      memo:           (CONFIG.MODES[this._mode].showMemo && this._measuredValue != null)
                        ? formatRulerValue(this._measuredValue, this._stage) : null,
```

（renderer 側は `ねらえ ${state.memo}` のままでよい＝memo が既に文字列になる）

- [ ] **Step 3: テストとブラウザ確認**

Run: `npm test`
Expected: 全部緑（renderer は単体テスト対象外・既存テストが通ること＝内部値の流れが無傷の確認）

ブラウザで:
1. **まぼろし**: 全体ビューの端が「0」「10」・1の窓の端が「3」「4」・AIMパネルが「0,1,…10」→ズームで「3, 3.1, …」・メモが「ねらえ 3.4」・わざと外して「0.1 ずれた」形の表示になること
2. **でんせつ**（回帰確認): 全表示が今までどおり整数のままであること

- [ ] **Step 4: コミット**

```bash
git add js/renderer.js js/game.js
git commit -m "feat: 数字表示に小数変換層を配線（まぼろしのみ小数・既存ランク表示は不変）"
```

---

### Task 7: タイトルチップ・ランクアップカードの4段対応

**Files:**
- Modify: `js/game.js:224-227`（chipLabels / chipLockedLabels）
- Modify: `js/tutorial.js:13-31`（RANKUP_CARDS に 4）

**Interfaces:**
- Consumes: Task 2〜4（maxLevel 4・STAGES[3]）
- Produces: タイトルに4つ目のチップ「✨ まぼろし」（未解放は「🔒 まぼろし」）・初到達時の説明カード

- [ ] **Step 1: チップラベルに4つ目を追加**

`js/game.js:225-226`（**1文字絵文字のみ**の制約に注意。✨=U+2728 は修飾コード無しの1文字でOK）:

```js
    const chipLabels       = ['🌞 みならい', '🌇 いっちょまえ', '🌙 でんせつ', '✨ まぼろし']
    const chipLockedLabels = ['🔒 みならい', '🔒 いっちょまえ', '🔒 でんせつ', '🔒 まぼろし']
```

チップの幅・行折り返し計算（chipW・maxRow 付近）と `_rankChipRects` がラベル配列の length を見ているか確認し、「3」がハードコードされていたら chipLabels.length に直す。renderer.js:204 は配列参照なのでそのまま動く。

- [ ] **Step 2: ランクアップカードに4を追加**

`js/tutorial.js` RANKUP_CARDS（文言は仮置き・ぽこぴぃ調整前提）:

```js
  4: {
    img: 'assets/enemy-drone.webp', // 仮素材。フェーズ3でミクロ敵に差し替え
    title: 'まぼろしの砲手に ランクアップ！',
    body: [
      '3と 4の あいだ… そこには まだ <b>かずの うみ</b>が かくれている！',
      '🔍 ズームして <b>3.4</b> みたいな <b>しょうすう</b>を よもう！',
    ],
  },
```

- [ ] **Step 3: テストとブラウザ確認**

Run: `npm test`
Expected: 全部緑

ブラウザで:
1. タイトル画面にチップが4つ並ぶ（未解放は🔒・横幅が画面に収まる。スマホ幅844×390でも確認）
2. `localStorage.removeItem('suuchokusen_rankup_seen_v1')` してから `__game._unlock.maxLevel=3; __game._unlock.streak=8` で1発当てて昇格 → カードが出る・星メーター（9個）がはみ出さない
3. でんせつチップからの自由練習が今までどおり遊べる（回帰）

- [ ] **Step 4: コミット**

```bash
git add js/game.js js/tutorial.js
git commit -m "feat: タイトルチップとランクアップカードの4段対応（まぼろし）"
```

---

### Task 8: 通しプレイ検証＋進捗台帳更新

**Files:**
- Modify: `.superpowers/sdd/progress.md`（タスク結果の記録）
- Modify: `js/config.js:2`（VERSION → 'v1.53'。**公開GoSignが出た後のマージ直前でよい**）

**Interfaces:**
- Consumes: Task 1〜7 の全部

- [ ] **Step 1: 全テスト**

Run: `npm test`
Expected: 全部緑（125本前後）・コンソールエラー0

- [ ] **Step 2: まぼろしの通しプレイ（ブラウザ）**

preview（ポート3220）で消音してから、まぼろしランクを最初から最後まで:
1. 全体ビュー（0〜10表示）→ 敵のあたりをタップ → 1の窓（3〜4・0.1目盛り）にズーム
2. テンキーで「3.4」入力 → AIM（パネル0〜10表示）→ ズームで0.1目盛り → 発射
3. 命中RESULT（撃沈アニメ・スコア加算）と、わざと外したRESULT（「0.2 ずれた」形の表示）
4. 既存3ランクを1周ずつ回して表示・入力・昇格メーターに変化がないこと（回帰）
5. 「おぼえてうつ」モードのまぼろし（テンキー無し・記憶して針を置く）が動くこと

- [ ] **Step 3: 進捗台帳を更新してコミット**

`.superpowers/sdd/progress.md` にタスクごとの結果・レビュー記録を追記。

```bash
git add .superpowers/sdd/progress.md
git commit -m "docs: ランク4骨格の進捗記録"
```

- [ ] **Step 4: 公開はGoSign待ち**

ぽこぴぃさんの実機確認・GoSign後に VERSION を v1.53 へ上げて main にマージ＆push（GitHub Pages 公開）。失敗したら `gh run rerun <id> --failed`。

---

## Self-Review 記録

- **仕様カバレッジ**: 設計書§5の実装レベル要点と対応 — unlock.js 4対応=Task 2／stage.js nextRankNeed=Task 3／config STAGES+UNLOCK=Task 2・4／小数表示変換層=Task 1・6／numpad小数点=Task 5／ランクチップUI・昇格演出・チュートリアル=Task 7。**島/砲台のランク別指定・ミクロ素材はフェーズ3のスコープ**（設計書§6）なので本計画に含めない。
- **プレースホルダ**: 各ステップにコード実体あり。Task 5 Step 1 のグリッド崩れとTask 7 Step 1 の「3」ハードコード確認は実装時の分岐として明記済み。
- **型整合**: `formatRulerValue(value, stage)`/`parseDisplayInput(str, stage)` の名前・引数は Task 1 と Task 5・6 で一致。`setDecimalMode(on)`・`onSubmit(文字列)` は Task 5 内で完結。`stage.display = { divisor, decimals }` は Task 1・4・5・6 で同形。
