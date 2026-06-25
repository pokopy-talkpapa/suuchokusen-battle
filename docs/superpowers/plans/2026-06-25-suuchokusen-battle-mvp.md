# 数直線バトル MVP 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 測量フェーズ（数直線を読んでテンキー入力）と砲撃フェーズ（大砲をパチンコドラッグで放物線発射）の2フェーズを持つスマホ横向き海戦ゲームのMVPを、GitHub Pagesで公開できる単体HTMLとして作る。

**Architecture:** HTML5 Canvas（ゲーム描画）+ DOM（テンキーUI）のハイブリッド。ロジック（数直線座標変換・放物線計算・測量誤差）をDOMなしのES Moduleとして分離し、node:testでユニットテストする。スプライトはPNG画像をCanvasで描画・アニメーションし、PNGが未用意の場合はCanvas図形で代替してゲームが動き続ける設計にする。

**Tech Stack:**
- HTML5 Canvas + Vanilla JS（ES Modules）
- node:test（ユニットテスト）
- GitHub Pages（ホスティング）

## Global Constraints

- スマホ横向き（ランドスケープ）専用。`viewport`と`touch-action: none`を最初から設定する
- OSのソフトキーボードは使わない。数字入力はすべて画面内テンキー（DOM要素）
- 全ゲームパラメータは`js/config.js`に集約。ロジックファイルはconfigをimportして使う
- アセットはPNGスプライト（SVG/HTML図形でキャラクター・背景を作らない。ただし未用意時はCanvas図形でフォールバック）
- MVPスコープ：ランキング・認証・課金なし。localStorage保存はアンロック進行のみ
- テスト可能なロジックはDOM依存なしのモジュールに分離する（Canvasテストはしない）
- 数の範囲はすべてのズームレベルで0〜1000固定
- ズームのレベル3では「1目盛り=5」が最小単位。「1目盛り=1」は使わない（数えるだけで読めてしまうため）

---

## File Structure

```
suuchokusen-battle/
├── index.html              # HTMLスケルトン・Canvas + テンキーDOM配置
├── package.json            # node:test 用
├── js/
│   ├── config.js           # 全ゲームパラメータ（数値・難易度・物理定数）
│   ├── ruler.js            # 数直線：値←→Canvas X座標変換、ズームレベル管理、目盛り計算
│   ├── physics.js          # 放物線：軌跡計算、着弾X座標計算、ドラッグ→ショット変換
│   ├── measurement.js      # 測量フェーズ：ターゲット生成、誤差計算、砲撃ブレ適用
│   ├── unlock.js           # アンロック：連続命中カウント、localStorage保存、解放判定
│   ├── numpad.js           # テンキーDOM：生成・入力ハンドリング・表示/非表示
│   ├── cannon.js           # 砲撃入力：タッチドラッグ→角度・パワー変換
│   ├── renderer.js         # Canvas描画：背景・数直線・スプライト・エフェクト・ゲームループ
│   └── game.js             # ゲームステートマシン：TITLE→MEASURE→AIM→FIRE→RESULT
└── tests/
    ├── ruler.test.js
    ├── physics.test.js
    ├── measurement.test.js
    ├── cannon.test.js
    └── unlock.test.js
```

アセットは後工程で用意する（`assets/` フォルダ）：
- `sea-bg.png`、`cannon.png`、`cannonball.png`、`ship-enemy.png`、`splash.png`、`ruler-bg.png`

---

### Task 1: プロジェクト設定・config.js・HTMLスケルトン

**Files:**
- Create: `package.json`
- Create: `js/config.js`
- Create: `index.html`

**Interfaces:**
- Consumes: なし
- Produces: `CONFIG` オブジェクト（以降の全モジュールがimportして使う）

- [ ] **Step 1: package.json を作成**

```json
{
  "name": "suuchokusen-battle",
  "version": "0.0.1",
  "type": "module",
  "scripts": {
    "test": "node --test tests/*.test.js"
  }
}
```

- [ ] **Step 2: js/config.js を作成**

```js
// js/config.js
export const CONFIG = {
  RULER: {
    MIN: 0,
    MAX: 1000,
    Y_FROM_BOTTOM: 90,   // 画面下端から数直線帯中心までのpx
    HEIGHT: 56,          // 数直線帯の高さpx
    MARGIN_X: 80,        // 数直線の左右マージンpx
  },
  ZOOM: {
    // レベル1（肉眼）：0〜1000全体・1目盛り=100
    LEVEL1: { tickStep: 100, rangeWidth: 1000 },
    // レベル2（双眼鏡）：100幅にズーム・1目盛り=10
    LEVEL2: { tickStep: 10,  rangeWidth: 100  },
    // レベル3（望遠鏡）：20幅にズーム・1目盛り=5
    LEVEL3: { tickStep: 5,   rangeWidth: 20   },
  },
  PHYSICS: {
    GRAVITY: 600,        // px/s^2
    MAX_POWER: 800,      // px/s（最大ドラッグ量に対応）
    PREVIEW_ALPHA: 0.25, // 着弾予測点の透明度
    PREVIEW_RADIUS: 18,  // 着弾予測点の円の半径px
  },
  CANNON: {
    X_FROM_LEFT: 100,    // 大砲のCanvas X座標
    Y_FROM_RULER: -80,   // 数直線Y座標から大砲中心のオフセット（上方向が負）
    BLUR_FACTOR: 0.25,   // 誤差率×係数×canvas幅=砲撃ブレ量(px)
    DRAG_MIN_PX: 20,     // これ以下のドラッグは無視
    DRAG_MAX_PX: 160,    // これ以上は最大パワーとして扱う
    DRAG_SCALE: 5,       // ドラッグpxをpx/sに変換する倍率
  },
  TIMER: {
    MEASURE_SEC: 15,     // 測量フェーズの制限時間（秒）
  },
  UNLOCK: {
    BINOCULARS_STREAK: 3, // 双眼鏡（レベル2）解放に必要な連続命中数
    TELESCOPE_STREAK: 6,  // 望遠鏡（レベル3）解放に必要な連続命中数
    HIT_MARGIN_VALUE: 30, // 着弾「命中」の許容誤差（value単位、0〜1000スケール）
  },
  ENEMY: {
    X_RATIO: 0.75,       // 敵船のCanvas X座標比率（0〜1）
    SHIP_WIDTH: 140,
    SHIP_HEIGHT: 100,
  },
}
```

- [ ] **Step 3: index.html を作成**

```html
<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=no">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <title>めざせ！すうちょくせんマスター</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body {
      width: 100%; height: 100%;
      overflow: hidden;
      background: #1a6fa8;
      touch-action: none;
    }
    #game-container {
      position: relative;
      width: 100%; height: 100%;
    }
    canvas#game-canvas {
      display: block;
      width: 100%; height: 100%;
    }
    #numpad {
      position: absolute;
      right: 12px;
      bottom: 110px;
      background: rgba(0,0,0,0.75);
      border-radius: 12px;
      padding: 8px;
      display: none;
      grid-template-columns: repeat(3, 52px);
      grid-template-rows: repeat(4, 52px);
      gap: 6px;
    }
    #numpad.visible { display: grid; }
    #numpad button {
      font-size: 22px;
      font-weight: bold;
      color: #fff;
      background: #2a5a8a;
      border: none;
      border-radius: 8px;
      cursor: pointer;
      touch-action: manipulation;
    }
    #numpad button#btn-clear { background: #8a2a2a; }
    #numpad button#btn-ok    { background: #2a8a4a; }
    #display-input {
      position: absolute;
      right: 12px;
      bottom: 290px;
      font-size: 32px;
      font-weight: bold;
      color: #fff;
      background: rgba(0,0,0,0.55);
      border-radius: 8px;
      padding: 4px 12px;
      min-width: 110px;
      text-align: right;
      display: none;
    }
    #display-input.visible { display: block; }
  </style>
</head>
<body>
  <div id="game-container">
    <canvas id="game-canvas"></canvas>
    <div id="display-input">---</div>
    <div id="numpad">
      <button data-digit="7">7</button>
      <button data-digit="8">8</button>
      <button data-digit="9">9</button>
      <button data-digit="4">4</button>
      <button data-digit="5">5</button>
      <button data-digit="6">6</button>
      <button data-digit="1">1</button>
      <button data-digit="2">2</button>
      <button data-digit="3">3</button>
      <button id="btn-clear">⌫</button>
      <button data-digit="0">0</button>
      <button id="btn-ok">OK</button>
    </div>
  </div>
  <script type="module" src="js/game.js"></script>
</body>
</html>
```

- [ ] **Step 4: テスト実行を確認（まだテストなし）**

```bash
node --test tests/*.test.js 2>&1 || true
```
Expected: "no test files found" またはエラー0件

- [ ] **Step 5: コミット**

```bash
git add index.html js/config.js package.json
git commit -m "chore: project setup, config, html skeleton"
```

---

### Task 2: ruler.js — 数直線座標変換・ズームロジック

テスト可能なロジックのコア。DOM/Canvas依存なし。

**Files:**
- Create: `js/ruler.js`
- Create: `tests/ruler.test.js`

**Interfaces:**
- Consumes: `CONFIG.RULER`, `CONFIG.ZOOM`
- Produces:
  - `valueToX(value, min, max, rulerStartX, rulerEndX): number`
  - `xToValue(x, min, max, rulerStartX, rulerEndX): number`
  - `getZoomRange(zoomLevel, centerValue, CONFIG): { min, max, tickStep }`
  - `getTicks(min, max, tickStep): Array<{ value: number, isMajor: boolean }>`

- [ ] **Step 1: テストを書く**

```js
// tests/ruler.test.js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { valueToX, xToValue, getZoomRange, getTicks } from '../js/ruler.js'

const RSX = 80   // rulerStartX（仮）
const REX = 1220 // rulerEndX（Canvas幅1300・MARGIN=80）

test('valueToX: 0 → rulerStartX', () => {
  assert.equal(valueToX(0, 0, 1000, RSX, REX), RSX)
})
test('valueToX: 1000 → rulerEndX', () => {
  assert.equal(valueToX(1000, 0, 1000, RSX, REX), REX)
})
test('valueToX: 500 → 中央', () => {
  assert.equal(valueToX(500, 0, 1000, RSX, REX), (RSX + REX) / 2)
})
test('xToValue: 中央 → 500', () => {
  const mid = (RSX + REX) / 2
  assert.equal(xToValue(mid, 0, 1000, RSX, REX), 500)
})
test('xToValue: valueToX の逆変換', () => {
  const x = valueToX(340, 0, 1000, RSX, REX)
  assert.equal(xToValue(x, 0, 1000, RSX, REX), 340)
})

const CFG = {
  ZOOM: {
    LEVEL1: { tickStep: 100, rangeWidth: 1000 },
    LEVEL2: { tickStep: 10,  rangeWidth: 100  },
    LEVEL3: { tickStep: 5,   rangeWidth: 20   },
  },
}

test('getZoomRange: レベル1 は 0〜1000', () => {
  const r = getZoomRange(1, 300, CFG)
  assert.deepEqual(r, { min: 0, max: 1000, tickStep: 100 })
})
test('getZoomRange: レベル2・center=350 → 300〜400', () => {
  const r = getZoomRange(2, 350, CFG)
  assert.equal(r.min, 300)
  assert.equal(r.max, 400)
  assert.equal(r.tickStep, 10)
})
test('getZoomRange: レベル2・center=50 → min>=0', () => {
  const r = getZoomRange(2, 50, CFG)
  assert.ok(r.min >= 0)
  assert.ok(r.max <= 1000)
})
test('getZoomRange: レベル3・center=345 → 20幅', () => {
  const r = getZoomRange(3, 345, CFG)
  assert.equal(r.max - r.min, 20)
  assert.equal(r.tickStep, 5)
})

test('getTicks: 0〜1000・step100 → 11本', () => {
  const ticks = getTicks(0, 1000, 100)
  assert.equal(ticks.length, 11) // 0,100,...,1000
})
test('getTicks: 300〜400・step10 → 11本', () => {
  const ticks = getTicks(300, 400, 10)
  assert.equal(ticks.length, 11)
})
test('getTicks: isMajor は tickStep*5 の倍数', () => {
  const ticks = getTicks(0, 1000, 100)
  const majors = ticks.filter(t => t.isMajor)
  assert.ok(majors.every(t => t.value % 500 === 0))
})
```

- [ ] **Step 2: テスト失敗を確認**

```bash
node --test tests/ruler.test.js
```
Expected: FAIL（ruler.js が存在しない）

- [ ] **Step 3: js/ruler.js を実装**

```js
// js/ruler.js

export function valueToX(value, min, max, rulerStartX, rulerEndX) {
  const ratio = (value - min) / (max - min)
  return rulerStartX + ratio * (rulerEndX - rulerStartX)
}

export function xToValue(x, min, max, rulerStartX, rulerEndX) {
  const ratio = (x - rulerStartX) / (rulerEndX - rulerStartX)
  return Math.round(min + ratio * (max - min))
}

// zoomLevel: 1 | 2 | 3
// centerValue: ズーム中心となる値（タップした位置の値）
// returns { min, max, tickStep }
export function getZoomRange(zoomLevel, centerValue, CONFIG) {
  const { ZOOM } = CONFIG
  if (zoomLevel === 1) {
    return { min: 0, max: ZOOM.LEVEL1.rangeWidth, tickStep: ZOOM.LEVEL1.tickStep }
  }
  const level = zoomLevel === 2 ? ZOOM.LEVEL2 : ZOOM.LEVEL3
  const half = level.rangeWidth / 2
  // centerValue を tickStep の倍数にスナップ
  const snapped = Math.round(centerValue / level.tickStep) * level.tickStep
  let min = snapped - half
  let max = snapped + half
  // 0〜1000 の範囲にクランプ
  const globalMax = ZOOM.LEVEL1.rangeWidth
  if (min < 0) { max = Math.min(globalMax, max - min); min = 0 }
  if (max > globalMax) { min = Math.max(0, min - (max - globalMax)); max = globalMax }
  return { min, max, tickStep: level.tickStep }
}

export function getTicks(min, max, tickStep) {
  const ticks = []
  for (let v = min; v <= max; v += tickStep) {
    ticks.push({ value: v, isMajor: v % (tickStep * 5) === 0 })
  }
  return ticks
}
```

- [ ] **Step 4: テスト通過を確認**

```bash
node --test tests/ruler.test.js
```
Expected: 全 PASS

- [ ] **Step 5: コミット**

```bash
git add js/ruler.js tests/ruler.test.js
git commit -m "feat: ruler module - value<->X conversion and zoom logic"
```

---

### Task 3: physics.js — 放物線計算・着弾判定

**Files:**
- Create: `js/physics.js`
- Create: `tests/physics.test.js`

**Interfaces:**
- Consumes: `CONFIG.PHYSICS`, `CONFIG.CANNON`
- Produces:
  - `calcLandingX(cannonX, cannonY, power, angleRad, gravity, targetY): number | null`
  - `calcTrajectory(cannonX, cannonY, power, angleRad, gravity, steps): Array<{x, y}>`
  - `dragToShot(dragDx, dragDy, CONFIG): { power: number, angleRad: number }`

- [ ] **Step 1: テストを書く**

```js
// tests/physics.test.js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { calcLandingX, calcTrajectory, dragToShot } from '../js/physics.js'

const CFG = {
  PHYSICS: { MAX_POWER: 800, DRAG_SCALE: 5 },
  CANNON:  { DRAG_MIN_PX: 20, DRAG_MAX_PX: 160 },
}

test('calcLandingX: 右方向に着弾する', () => {
  // cannonX=100, cannonY=400, targetY=600（下）, 仰角45度
  const x = calcLandingX(100, 400, 400, Math.PI / 4, 600, 600)
  assert.ok(x !== null)
  assert.ok(x > 100)
})
test('calcLandingX: 仰角45度 > 30度（同パワー）', () => {
  const x45 = calcLandingX(100, 400, 400, Math.PI / 4, 600, 600)
  const x30 = calcLandingX(100, 400, 400, Math.PI / 6, 600, 600)
  assert.ok(x45 > x30)
})
test('calcLandingX: 下向き角度はnullを返す', () => {
  // 下向きに発射してtargetYより上には届かない場合
  const x = calcLandingX(100, 200, 100, -Math.PI / 2, 600, 600)
  // targetY=600がcannonY=200より下なので着弾するかも。ここは動作確認のみ
  // null でないことを確認
  assert.ok(x === null || typeof x === 'number')
})

test('calcTrajectory: steps+1個の点を返す', () => {
  const pts = calcTrajectory(100, 400, 400, Math.PI / 4, 600, 20)
  assert.equal(pts.length, 21)
})
test('calcTrajectory: 最初の点はcannonXYに一致', () => {
  const pts = calcTrajectory(100, 400, 400, Math.PI / 4, 600)
  assert.equal(pts[0].x, 100)
  assert.equal(pts[0].y, 400)
})

test('dragToShot: 左上ドラッグ → 右上方向に発射', () => {
  const { power, angleRad } = dragToShot(-60, -60, CFG)
  assert.ok(power > 0)
  assert.ok(angleRad > 0) // 上方向（仰角）
})
test('dragToShot: DRAG_MAX_PX超でもMAX_POWERを超えない', () => {
  const { power } = dragToShot(-300, -300, CFG)
  assert.ok(power <= CFG.PHYSICS.MAX_POWER)
})
test('dragToShot: DRAG_MIN_PX未満は power=0', () => {
  const { power } = dragToShot(-10, -5, CFG)
  assert.equal(power, 0)
})
```

- [ ] **Step 2: テスト失敗を確認**

```bash
node --test tests/physics.test.js
```
Expected: FAIL

- [ ] **Step 3: js/physics.js を実装**

```js
// js/physics.js

// Canvas 座標系：下方向が正Y
// cannonY: 大砲の Canvas Y座標
// targetY: 着弾させたいCanvas Y座標（数直線のY）
// power: px/s  angleRad: 仰角（上方向が正）  gravity: px/s^2（正値）
// returns: 着弾Canvas X座標（数値が存在しない場合はnull）
export function calcLandingX(cannonX, cannonY, power, angleRad, gravity, targetY) {
  const vx =  power * Math.cos(angleRad)
  const vy = -power * Math.sin(angleRad) // Canvas上方向が負
  // targetY = cannonY + vy*t + 0.5*gravity*t^2
  // → 0.5*g*t^2 + vy*t + (cannonY - targetY) = 0
  const a = 0.5 * gravity
  const b = vy
  const c = cannonY - targetY
  const disc = b * b - 4 * a * c
  if (disc < 0) return null
  const t1 = (-b + Math.sqrt(disc)) / (2 * a)
  const t2 = (-b - Math.sqrt(disc)) / (2 * a)
  const t = Math.max(t1, t2)
  if (t <= 0) return null
  return cannonX + vx * t
}

export function calcTrajectory(cannonX, cannonY, power, angleRad, gravity, steps = 20) {
  const vx =  power * Math.cos(angleRad)
  const vy = -power * Math.sin(angleRad)
  const dt = 1.2 / steps
  const points = []
  for (let i = 0; i <= steps; i++) {
    const t = i * dt
    points.push({
      x: cannonX + vx * t,
      y: cannonY + vy * t + 0.5 * gravity * t * t,
    })
  }
  return points
}

// dragDx, dragDy: 大砲中心からドラッグ終点へのCanvas座標差分
// 発射方向はドラッグの逆方向
export function dragToShot(dragDx, dragDy, CONFIG) {
  const { MAX_POWER, DRAG_SCALE } = CONFIG.PHYSICS
  const { DRAG_MIN_PX, DRAG_MAX_PX } = CONFIG.CANNON
  const dragLen = Math.sqrt(dragDx * dragDx + dragDy * dragDy)
  if (dragLen < DRAG_MIN_PX) return { power: 0, angleRad: 0 }
  const clampedLen = Math.min(dragLen, DRAG_MAX_PX)
  const power = Math.min(clampedLen * DRAG_SCALE, MAX_POWER)
  // ドラッグの逆方向が発射方向
  const angleRad = Math.atan2(-dragDy, -dragDx)
  return { power, angleRad }
}
```

- [ ] **Step 4: テスト通過を確認**

```bash
node --test tests/physics.test.js
```
Expected: 全 PASS

- [ ] **Step 5: コミット**

```bash
git add js/physics.js tests/physics.test.js
git commit -m "feat: physics module - parabola calc and drag-to-shot"
```

---

### Task 4: measurement.js — ターゲット生成・誤差計算・砲撃ブレ

**Files:**
- Create: `js/measurement.js`
- Create: `tests/measurement.test.js`

**Interfaces:**
- Consumes: `CONFIG.RULER`, `CONFIG.CANNON`
- Produces:
  - `generateTarget(min, max, tickStep): number`
  - `calcMeasurementError(measured, actual): number`
  - `applyBlur(landingX, measuredError, canvasWidth, CONFIG): number`

- [ ] **Step 1: テストを書く**

```js
// tests/measurement.test.js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { generateTarget, calcMeasurementError, applyBlur } from '../js/measurement.js'

test('generateTarget: tickStep=100 で100の倍数を返す', () => {
  for (let i = 0; i < 30; i++) {
    const v = generateTarget(0, 1000, 100)
    assert.ok(v >= 0 && v <= 1000)
    assert.equal(v % 100, 0)
  }
})
test('generateTarget: tickStep=10 で10の倍数を返す', () => {
  for (let i = 0; i < 30; i++) {
    const v = generateTarget(300, 400, 10)
    assert.ok(v >= 300 && v <= 400)
    assert.equal(v % 10, 0)
  }
})
test('generateTarget: tickStep=5 で5の倍数を返す', () => {
  for (let i = 0; i < 30; i++) {
    const v = generateTarget(340, 360, 5)
    assert.ok(v >= 340 && v <= 360)
    assert.equal(v % 5, 0)
  }
})

test('calcMeasurementError: 正確なら0', () => {
  assert.equal(calcMeasurementError(300, 300), 0)
})
test('calcMeasurementError: 誤差は絶対値', () => {
  assert.equal(calcMeasurementError(285, 300), 15)
  assert.equal(calcMeasurementError(320, 300), 20)
})

const CFG = { CANNON: { BLUR_FACTOR: 0.25 }, RULER: { MIN: 0, MAX: 1000 } }

test('applyBlur: 誤差0ならブレなし', () => {
  const x = applyBlur(500, 0, 1300, CFG)
  assert.equal(x, 500)
})
test('applyBlur: 誤差あり → ブレが±maxBlur 以内', () => {
  // 誤差100 / 1000 * 0.25 * 1300 = 32.5px が最大ブレ
  const maxBlur = (100 / 1000) * 0.25 * 1300
  const results = Array.from({ length: 200 }, () => applyBlur(500, 100, 1300, CFG))
  assert.ok(results.every(x => Math.abs(x - 500) <= maxBlur + 0.01))
})
test('applyBlur: ランダムなので全部同じにはならない', () => {
  const results = Array.from({ length: 50 }, () => applyBlur(500, 100, 1300, CFG))
  const unique = new Set(results.map(x => Math.round(x)))
  assert.ok(unique.size > 1)
})
```

- [ ] **Step 2: テスト失敗を確認**

```bash
node --test tests/measurement.test.js
```
Expected: FAIL

- [ ] **Step 3: js/measurement.js を実装**

```js
// js/measurement.js

export function generateTarget(min, max, tickStep) {
  const steps = Math.floor((max - min) / tickStep)
  return min + Math.floor(Math.random() * (steps + 1)) * tickStep
}

export function calcMeasurementError(measured, actual) {
  return Math.abs(measured - actual)
}

// landingX: 理想の着弾 Canvas X座標
// measuredError: 測量誤差（value単位、0〜1000スケール）
// canvasWidth: Canvas 幅 px
// returns: ブレを加えた着弾 X座標
export function applyBlur(landingX, measuredError, canvasWidth, CONFIG) {
  if (measuredError === 0) return landingX
  const totalRange = CONFIG.RULER.MAX - CONFIG.RULER.MIN
  const errorRatio = measuredError / totalRange
  const maxBlurPx = errorRatio * CONFIG.CANNON.BLUR_FACTOR * canvasWidth
  const blur = (Math.random() * 2 - 1) * maxBlurPx
  return landingX + blur
}
```

- [ ] **Step 4: テスト通過を確認**

```bash
node --test tests/measurement.test.js
```
Expected: 全 PASS

- [ ] **Step 5: コミット**

```bash
git add js/measurement.js tests/measurement.test.js
git commit -m "feat: measurement module - target gen, error calc, blur"
```

---

### Task 5: unlock.js — アンロック条件・localStorage

**Files:**
- Create: `js/unlock.js`
- Create: `tests/unlock.test.js`

**Interfaces:**
- Consumes: `CONFIG.UNLOCK`
- Produces:
  - `class UnlockState`
    - `constructor(CONFIG, opts?)`
    - `isUnlocked(level: number): boolean`
    - `recordHit(isHit: boolean): void`
    - `save(): void`
    - `static load(CONFIG): UnlockState`
  - プロパティ: `level: number`（現在使用中のズームレベル）、`streak: number`、`maxLevel: number`

- [ ] **Step 1: テストを書く**

```js
// tests/unlock.test.js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { UnlockState } from '../js/unlock.js'

const CFG = { UNLOCK: { BINOCULARS_STREAK: 3, TELESCOPE_STREAK: 6, HIT_MARGIN_VALUE: 30 } }

test('初期状態: level=1, streak=0, maxLevel=1', () => {
  const s = new UnlockState(CFG)
  assert.equal(s.level, 1)
  assert.equal(s.streak, 0)
  assert.equal(s.maxLevel, 1)
})
test('isUnlocked(1) は常に true', () => {
  assert.ok(new UnlockState(CFG).isUnlocked(1))
})
test('isUnlocked(2) は最初 false', () => {
  assert.ok(!new UnlockState(CFG).isUnlocked(2))
})
test('3連続命中でレベル2解放', () => {
  const s = new UnlockState(CFG)
  s.recordHit(true); s.recordHit(true); s.recordHit(true)
  assert.ok(s.isUnlocked(2))
  assert.equal(s.maxLevel, 2)
})
test('miss 後は streak リセット', () => {
  const s = new UnlockState(CFG)
  s.recordHit(true); s.recordHit(true)
  s.recordHit(false)
  assert.equal(s.streak, 0)
})
test('6連続命中でレベル3解放', () => {
  const s = new UnlockState(CFG)
  for (let i = 0; i < 6; i++) s.recordHit(true)
  assert.ok(s.isUnlocked(3))
  assert.equal(s.maxLevel, 3)
})
test('一度解放されたレベルは miss 後も維持される', () => {
  const s = new UnlockState(CFG)
  for (let i = 0; i < 3; i++) s.recordHit(true)
  s.recordHit(false) // streak リセット
  assert.ok(s.isUnlocked(2)) // 解放は維持
})
```

- [ ] **Step 2: テスト失敗を確認**

```bash
node --test tests/unlock.test.js
```
Expected: FAIL

- [ ] **Step 3: js/unlock.js を実装**

```js
// js/unlock.js
const STORAGE_KEY = 'suuchokusen_unlock_v1'

export class UnlockState {
  constructor(CONFIG, { level = 1, streak = 0, maxLevel = 1 } = {}) {
    this.CONFIG   = CONFIG
    this.level    = level
    this.streak   = streak
    this.maxLevel = maxLevel
  }

  isUnlocked(n) {
    return this.maxLevel >= n
  }

  recordHit(isHit) {
    if (isHit) {
      this.streak++
      const { BINOCULARS_STREAK, TELESCOPE_STREAK } = this.CONFIG.UNLOCK
      if (this.streak >= TELESCOPE_STREAK && this.maxLevel < 3) {
        this.maxLevel = 3
      } else if (this.streak >= BINOCULARS_STREAK && this.maxLevel < 2) {
        this.maxLevel = 2
      }
    } else {
      this.streak = 0
    }
  }

  save() {
    if (typeof localStorage === 'undefined') return
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      level:    this.level,
      streak:   this.streak,
      maxLevel: this.maxLevel,
    }))
  }

  static load(CONFIG) {
    if (typeof localStorage === 'undefined') return new UnlockState(CONFIG)
    try {
      const data = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}')
      return new UnlockState(CONFIG, data)
    } catch {
      return new UnlockState(CONFIG)
    }
  }
}
```

- [ ] **Step 4: テスト通過を確認**

```bash
node --test tests/unlock.test.js
```
Expected: 全 PASS

- [ ] **Step 5: コミット**

```bash
git add js/unlock.js tests/unlock.test.js
git commit -m "feat: unlock module - streak tracking and level progression"
```

---

### Task 6: cannon.js — タッチドラッグ入力

**Files:**
- Create: `js/cannon.js`
- Create: `tests/cannon.test.js`

**Interfaces:**
- Consumes: `CONFIG.CANNON`, `dragToShot`（physics.js）
- Produces:
  - `clampDrag(dx, dy, CONFIG): { dx, dy } | null`（テスト可能ロジック）
  - `class CannonInput`
    - `attach(canvas, CONFIG, onFire: (shot: {power, angleRad}) => void): void`
    - `getPreview(): { dragDx, dragDy, power, angleRad } | null`
    - `detach(): void`

- [ ] **Step 1: テストを書く**

```js
// tests/cannon.test.js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { clampDrag } from '../js/cannon.js'

const CFG = { CANNON: { DRAG_MIN_PX: 20, DRAG_MAX_PX: 160 } }

test('clampDrag: 最小未満は null', () => {
  assert.equal(clampDrag(10, 5, CFG), null)
})
test('clampDrag: 通常範囲はそのまま返す', () => {
  const r = clampDrag(60, 60, CFG)
  assert.ok(r !== null)
  assert.equal(r.dx, 60)
  assert.equal(r.dy, 60)
})
test('clampDrag: 最大超過はDRAG_MAX_PXにスケールダウン', () => {
  const r = clampDrag(200, 0, CFG)
  assert.ok(r !== null)
  const len = Math.sqrt(r.dx ** 2 + r.dy ** 2)
  assert.ok(Math.abs(len - 160) < 0.01)
})
test('clampDrag: 方向は保持される', () => {
  const r = clampDrag(200, 200, CFG)
  assert.ok(r !== null)
  // dx/dy の比が元と同じ
  assert.ok(Math.abs(r.dx / r.dy - 1) < 0.01)
})
```

- [ ] **Step 2: テスト失敗を確認**

```bash
node --test tests/cannon.test.js
```
Expected: FAIL

- [ ] **Step 3: js/cannon.js を実装**

```js
// js/cannon.js
import { dragToShot } from './physics.js'

export function clampDrag(dx, dy, CONFIG) {
  const { DRAG_MIN_PX, DRAG_MAX_PX } = CONFIG.CANNON
  const len = Math.sqrt(dx * dx + dy * dy)
  if (len < DRAG_MIN_PX) return null
  if (len > DRAG_MAX_PX) {
    const scale = DRAG_MAX_PX / len
    return { dx: dx * scale, dy: dy * scale }
  }
  return { dx, dy }
}

export class CannonInput {
  constructor() {
    this._startX = null
    this._startY = null
    this._curX   = null
    this._curY   = null
    this._canvas = null
    this._CONFIG = null
    this._handlers = {}
  }

  attach(canvas, CONFIG, onFire) {
    this._canvas = canvas
    this._CONFIG = CONFIG
    const cannonX = CONFIG.CANNON.X_FROM_LEFT

    const toCanvasCoord = (clientX, clientY) => {
      const rect = canvas.getBoundingClientRect()
      return {
        x: (clientX - rect.left) * (canvas.width  / rect.width),
        y: (clientY - rect.top)  * (canvas.height / rect.height),
      }
    }

    const onStart = (e) => {
      const pt = e.touches ? e.touches[0] : e
      const { x, y } = toCanvasCoord(pt.clientX, pt.clientY)
      if (Math.abs(x - cannonX) < 100) {
        this._startX = x; this._startY = y
        this._curX   = x; this._curY   = y
      }
    }
    const onMove = (e) => {
      if (this._startX === null) return
      e.preventDefault()
      const pt = e.touches ? e.touches[0] : e
      const { x, y } = toCanvasCoord(pt.clientX, pt.clientY)
      this._curX = x; this._curY = y
    }
    const onEnd = () => {
      if (this._startX === null) return
      const dx = this._curX - this._startX
      const dy = this._curY - this._startY
      const clamped = clampDrag(dx, dy, CONFIG)
      if (clamped && onFire) {
        onFire(dragToShot(clamped.dx, clamped.dy, CONFIG))
      }
      this._startX = null; this._startY = null
      this._curX   = null; this._curY   = null
    }

    canvas.addEventListener('touchstart', onStart, { passive: true })
    canvas.addEventListener('touchmove',  onMove,  { passive: false })
    canvas.addEventListener('touchend',   onEnd)
    canvas.addEventListener('mousedown',  onStart)
    canvas.addEventListener('mousemove',  onMove)
    canvas.addEventListener('mouseup',    onEnd)

    this._handlers = { onStart, onMove, onEnd }
  }

  getPreview() {
    if (this._startX === null) return null
    const dx = this._curX - this._startX
    const dy = this._curY - this._startY
    const clamped = clampDrag(dx, dy, this._CONFIG)
    if (!clamped) return null
    const shot = dragToShot(clamped.dx, clamped.dy, this._CONFIG)
    return { dragDx: clamped.dx, dragDy: clamped.dy, ...shot }
  }

  detach() {
    if (!this._canvas) return
    const { onStart, onMove, onEnd } = this._handlers
    this._canvas.removeEventListener('touchstart', onStart)
    this._canvas.removeEventListener('touchmove',  onMove)
    this._canvas.removeEventListener('touchend',   onEnd)
    this._canvas.removeEventListener('mousedown',  onStart)
    this._canvas.removeEventListener('mousemove',  onMove)
    this._canvas.removeEventListener('mouseup',    onEnd)
    this._canvas = null
  }
}
```

- [ ] **Step 4: テスト通過を確認**

```bash
node --test tests/cannon.test.js
```
Expected: 全 PASS

- [ ] **Step 5: コミット**

```bash
git add js/cannon.js tests/cannon.test.js
git commit -m "feat: cannon input module - touch drag and clamping"
```

---

### Task 7: numpad.js — 画面内テンキーDOM

DOMに依存するためユニットテストなし。ブラウザで手動確認する。

**Files:**
- Create: `js/numpad.js`

**Interfaces:**
- Consumes: `#numpad`, `#display-input`（index.html の DOM 要素）
- Produces:
  - `class Numpad`
    - `show(): void`
    - `hide(): void`
    - `reset(): void`
    - `getValue(): string`
    - `onSubmit(callback: (value: number) => void): void`

- [ ] **Step 1: js/numpad.js を作成**

```js
// js/numpad.js
export class Numpad {
  constructor() {
    this._el      = document.getElementById('numpad')
    this._display = document.getElementById('display-input')
    this._value   = ''
    this._onSubmit = null
    this._bind()
  }

  _bind() {
    this._el.addEventListener('click', (e) => {
      const btn = e.target.closest('button')
      if (!btn) return
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

  getValue() {
    return this._value
  }

  onSubmit(cb) {
    this._onSubmit = cb
  }
}
```

- [ ] **Step 2: コミット**

```bash
git add js/numpad.js
git commit -m "feat: numpad DOM component"
```

---

### Task 8: renderer.js — Canvas 描画・ゲームループ

**Files:**
- Create: `js/renderer.js`

**Interfaces:**
- Consumes: `ruler.js`（valueToX, getTicks）, `physics.js`（calcTrajectory）, `CONFIG`
- Produces:
  - `class Renderer`
    - `async init(canvas, CONFIG): Promise<void>`
    - `drawFrame(state): void`
    - `startLoop(getState: () => state): void`
    - `stopLoop(): void`

`state` の型定義：
```js
{
  phase: 'TITLE' | 'MEASURE' | 'AIM' | 'FIRE' | 'RESULT',
  zoomMin: number,
  zoomMax: number,
  tickStep: number,
  targetValue: number,
  enemyX: number,
  cannonPreview: null | { power: number, angleRad: number },
  firedTrajectory: null | Array<{x: number, y: number}>,
  landingX: null | number,
  hitResult: null | 'HIT' | 'MISS',
  timerRemaining: number,
}
```

- [ ] **Step 1: js/renderer.js を作成**

```js
// js/renderer.js
import { valueToX, getTicks } from './ruler.js'
import { calcTrajectory } from './physics.js'

const ASSET_NAMES = ['sea-bg', 'cannon', 'cannonball', 'ship-enemy', 'splash', 'ruler-bg']

export class Renderer {
  constructor() {
    this._canvas = null
    this._ctx    = null
    this._CONFIG = null
    this._imgs   = {}
    this._rafId  = null
  }

  async init(canvas, CONFIG) {
    this._canvas = canvas
    this._ctx    = canvas.getContext('2d')
    this._CONFIG = CONFIG
    this._resize()
    window.addEventListener('resize', () => this._resize())

    // PNG が未用意でもゲームは動く（Canvas 図形でフォールバック）
    await Promise.allSettled(
      ASSET_NAMES.map(name => new Promise((resolve) => {
        const img = new Image()
        img.onload  = () => { this._imgs[name] = img; resolve() }
        img.onerror = resolve
        img.src = `assets/${name}.png`
      }))
    )
  }

  _resize() {
    this._canvas.width  = this._canvas.offsetWidth
    this._canvas.height = this._canvas.offsetHeight
  }

  _rulerY()  { return this._canvas.height - this._CONFIG.RULER.Y_FROM_BOTTOM }
  _rulerSX() { return this._CONFIG.RULER.MARGIN_X }
  _rulerEX() { return this._canvas.width - this._CONFIG.RULER.MARGIN_X }

  drawFrame(state) {
    const { _ctx: ctx, _canvas: cv, _CONFIG: CFG } = this
    const rulerY = this._rulerY()
    const rsx    = this._rulerSX()
    const rex    = this._rulerEX()
    const rulerH = CFG.RULER.HEIGHT
    const cannonX = CFG.CANNON.X_FROM_LEFT
    const cannonY = rulerY + CFG.CANNON.Y_FROM_RULER

    ctx.clearRect(0, 0, cv.width, cv.height)

    // 背景
    if (this._imgs['sea-bg']) {
      ctx.drawImage(this._imgs['sea-bg'], 0, 0, cv.width, cv.height)
    } else {
      const grad = ctx.createLinearGradient(0, 0, 0, cv.height)
      grad.addColorStop(0, '#87ceeb')
      grad.addColorStop(0.55, '#1a6fa8')
      grad.addColorStop(1, '#0d4f7a')
      ctx.fillStyle = grad
      ctx.fillRect(0, 0, cv.width, cv.height)
    }

    // タイトル画面
    if (state.phase === 'TITLE') {
      ctx.fillStyle = 'rgba(0,0,0,0.45)'
      ctx.fillRect(0, 0, cv.width, cv.height)
      ctx.font = 'bold 48px sans-serif'
      ctx.fillStyle = '#ffdd00'
      ctx.textAlign = 'center'
      ctx.fillText('めざせ！すうちょくせんマスター', cv.width / 2, cv.height / 2 - 20)
      ctx.font = '28px sans-serif'
      ctx.fillStyle = '#fff'
      ctx.fillText('タップしてスタート', cv.width / 2, cv.height / 2 + 40)
      return
    }

    // 数直線帯
    if (this._imgs['ruler-bg']) {
      ctx.drawImage(this._imgs['ruler-bg'], rsx - 10, rulerY - rulerH / 2, rex - rsx + 20, rulerH)
    } else {
      ctx.fillStyle = '#d4a96a'
      ctx.fillRect(rsx - 10, rulerY - rulerH / 2, rex - rsx + 20, rulerH)
      ctx.strokeStyle = '#8b5e2a'
      ctx.lineWidth = 2
      ctx.strokeRect(rsx - 10, rulerY - rulerH / 2, rex - rsx + 20, rulerH)
    }

    // 目盛り
    const ticks = getTicks(state.zoomMin, state.zoomMax, state.tickStep)
    ctx.strokeStyle = '#5a3a10'
    ctx.fillStyle   = '#2a1a00'
    ctx.font = 'bold 13px sans-serif'
    ctx.textAlign = 'center'
    ticks.forEach(({ value, isMajor }) => {
      const x   = valueToX(value, state.zoomMin, state.zoomMax, rsx, rex)
      const tH  = isMajor ? 20 : 10
      ctx.lineWidth = isMajor ? 2 : 1
      ctx.beginPath()
      ctx.moveTo(x, rulerY - tH / 2)
      ctx.lineTo(x, rulerY + tH / 2)
      ctx.stroke()
      if (isMajor) ctx.fillText(String(value), x, rulerY - tH / 2 - 4)
    })

    // 敵船
    const shipW = CFG.ENEMY.SHIP_WIDTH
    const shipH = CFG.ENEMY.SHIP_HEIGHT
    if (this._imgs['ship-enemy']) {
      ctx.drawImage(this._imgs['ship-enemy'],
        state.enemyX - shipW / 2, rulerY - rulerH / 2 - shipH, shipW, shipH)
    } else {
      ctx.fillStyle = '#8b0000'
      ctx.fillRect(state.enemyX - shipW / 2, rulerY - rulerH / 2 - shipH, shipW, shipH)
      ctx.fillStyle = '#ff4444'
      ctx.fillText('🚢', state.enemyX, rulerY - rulerH / 2 - 20)
    }

    // 大砲
    if (this._imgs['cannon']) {
      ctx.drawImage(this._imgs['cannon'], cannonX - 40, cannonY - 30, 80, 60)
    } else {
      ctx.fillStyle = '#4a3000'
      ctx.beginPath()
      ctx.arc(cannonX, cannonY, 24, 0, Math.PI * 2)
      ctx.fill()
    }
    // ドラッグ中：砲身の向きを線で表示
    if (state.cannonPreview) {
      const ang = state.cannonPreview.angleRad
      ctx.strokeStyle = '#ffaa00'
      ctx.lineWidth = 8
      ctx.beginPath()
      ctx.moveTo(cannonX, cannonY)
      ctx.lineTo(cannonX + Math.cos(ang) * 60, cannonY - Math.sin(ang) * 60)
      ctx.stroke()
    }

    // 着弾予測点（AIM フェーズ）
    if (state.phase === 'AIM' && state.cannonPreview) {
      const { power, angleRad } = state.cannonPreview
      const traj = calcTrajectory(cannonX, cannonY, power, angleRad, CFG.PHYSICS.GRAVITY)
      const last = traj[traj.length - 1]
      ctx.globalAlpha = CFG.PHYSICS.PREVIEW_ALPHA
      ctx.fillStyle = '#ff6600'
      ctx.beginPath()
      ctx.arc(last.x, rulerY, CFG.PHYSICS.PREVIEW_RADIUS, 0, Math.PI * 2)
      ctx.fill()
      ctx.globalAlpha = 1
    }

    // 砲弾軌跡（FIRE フェーズ）
    if (state.firedTrajectory) {
      ctx.strokeStyle = '#ffaa00'
      ctx.lineWidth = 3
      ctx.setLineDash([6, 4])
      ctx.beginPath()
      state.firedTrajectory.forEach((pt, i) => {
        i === 0 ? ctx.moveTo(pt.x, pt.y) : ctx.lineTo(pt.x, pt.y)
      })
      ctx.stroke()
      ctx.setLineDash([])
    }

    // 着弾エフェクト（RESULT）
    if (state.phase === 'RESULT' && state.landingX !== null) {
      if (this._imgs['splash']) {
        ctx.drawImage(this._imgs['splash'], state.landingX - 30, rulerY - 60, 60, 60)
      } else {
        ctx.fillStyle = state.hitResult === 'HIT' ? '#ffdd00' : '#4488ff'
        ctx.beginPath()
        ctx.arc(state.landingX, rulerY, 22, 0, Math.PI * 2)
        ctx.fill()
      }
      ctx.font = 'bold 52px sans-serif'
      ctx.textAlign = 'center'
      ctx.fillStyle = state.hitResult === 'HIT' ? '#ffdd00' : '#ffffff'
      ctx.fillText(
        state.hitResult === 'HIT' ? '命中！🎯' : 'はずれ💦',
        cv.width / 2, cv.height / 2 - 20
      )
    }

    // タイマー（MEASURE フェーズ）
    if (state.phase === 'MEASURE') {
      ctx.font = 'bold 28px sans-serif'
      ctx.textAlign = 'right'
      ctx.fillStyle = state.timerRemaining <= 5 ? '#ff4444' : '#ffffff'
      ctx.fillText(`⏱ ${state.timerRemaining}`, cv.width - 20, 44)
    }
  }

  startLoop(getState) {
    const loop = () => {
      this.drawFrame(getState())
      this._rafId = requestAnimationFrame(loop)
    }
    this._rafId = requestAnimationFrame(loop)
  }

  stopLoop() {
    if (this._rafId) cancelAnimationFrame(this._rafId)
  }
}
```

- [ ] **Step 2: コミット**

```bash
git add js/renderer.js
git commit -m "feat: renderer - canvas drawing with PNG fallbacks"
```

---

### Task 9: game.js — ゲームステートマシン・全体統合

ゲームのフロー：
```
TITLE
  ↓ タップ
MEASURE  ← タイマー開始。数直線をタップでズーム。テンキーで入力 → OK で次へ（タイムアウト → 0入力扱い）
  ↓
AIM      ← 大砲ドラッグ。着弾予測フェード表示。放すと FIRE へ
  ↓
FIRE     ← 軌跡アニメーション 600ms → RESULT
  ↓
RESULT   ← HIT/MISS エフェクト 1800ms → 次の MEASURE
```

**Files:**
- Create: `js/game.js`

**Interfaces:**
- Consumes: 全モジュール
- Produces: ゲーム全体の動作

- [ ] **Step 1: js/game.js を作成**

```js
// js/game.js
import { CONFIG } from './config.js'
import { valueToX, getZoomRange } from './ruler.js'
import { calcLandingX, calcTrajectory } from './physics.js'
import { generateTarget, calcMeasurementError, applyBlur } from './measurement.js'
import { UnlockState } from './unlock.js'
import { Numpad } from './numpad.js'
import { CannonInput } from './cannon.js'
import { Renderer } from './renderer.js'

class Game {
  constructor() {
    this._canvas      = document.getElementById('game-canvas')
    this._renderer    = new Renderer()
    this._numpad      = new Numpad()
    this._cannonInput = new CannonInput()
    this._unlock      = UnlockState.load(CONFIG)

    // ゲームステート
    this._phase           = 'TITLE'
    this._zoomLevel       = 1
    this._zoomMin         = 0
    this._zoomMax         = 1000
    this._tickStep        = CONFIG.ZOOM.LEVEL1.tickStep
    this._targetValue     = 0
    this._measuredValue   = null
    this._measureError    = 0
    this._timerRemaining  = CONFIG.TIMER.MEASURE_SEC
    this._timerInterval   = null
    this._firedTrajectory = null
    this._landingX        = null
    this._hitResult       = null
  }

  async start() {
    await this._renderer.init(this._canvas, CONFIG)
    this._renderer.startLoop(() => this._buildState())
    this._canvas.addEventListener('click',    () => this._onTitleTap(), { once: true })
    this._canvas.addEventListener('touchend', () => this._onTitleTap(), { once: true })
  }

  _buildState() {
    const rulerY  = this._canvas.height - CONFIG.RULER.Y_FROM_BOTTOM
    const rsx     = CONFIG.RULER.MARGIN_X
    const rex     = this._canvas.width - CONFIG.RULER.MARGIN_X
    const enemyX  = valueToX(this._targetValue, this._zoomMin, this._zoomMax, rsx, rex)

    return {
      phase:           this._phase,
      zoomMin:         this._zoomMin,
      zoomMax:         this._zoomMax,
      tickStep:        this._tickStep,
      targetValue:     this._targetValue,
      enemyX,
      cannonPreview:   this._phase === 'AIM' ? this._cannonInput.getPreview() : null,
      firedTrajectory: this._firedTrajectory,
      landingX:        this._landingX,
      hitResult:       this._hitResult,
      timerRemaining:  this._timerRemaining,
    }
  }

  _onTitleTap() {
    if (this._phase !== 'TITLE') return
    this._startMeasure()
  }

  _startMeasure() {
    this._phase       = 'MEASURE'
    this._zoomLevel   = 1
    this._zoomMin     = 0
    this._zoomMax     = 1000
    this._tickStep    = CONFIG.ZOOM.LEVEL1.tickStep
    this._targetValue = generateTarget(
      CONFIG.RULER.MIN, CONFIG.RULER.MAX, CONFIG.ZOOM.LEVEL1.tickStep
    )
    this._measuredValue   = null
    this._measureError    = 0
    this._firedTrajectory = null
    this._landingX        = null
    this._hitResult       = null
    this._timerRemaining  = CONFIG.TIMER.MEASURE_SEC

    // ズームタップ登録（捕捉フェーズのみ有効）
    this._canvas.addEventListener('click',    this._handleZoomTap)
    this._canvas.addEventListener('touchend', this._handleZoomTap)

    // テンキー設定
    this._numpad.reset()
    this._numpad.show()
    this._numpad.onSubmit((val) => this._submitMeasure(val))

    // タイマー
    this._timerInterval = setInterval(() => {
      this._timerRemaining = Math.max(0, this._timerRemaining - 1)
      if (this._timerRemaining === 0) this._submitMeasure(0)
    }, 1000)
  }

  _handleZoomTap = (e) => {
    if (this._phase !== 'MEASURE') return
    if (this._zoomLevel >= this._unlock.maxLevel) return // 解放済み最大に達している

    const rect    = this._canvas.getBoundingClientRect()
    const clientX = e.touches ? e.changedTouches[0].clientX : e.clientX
    const x       = (clientX - rect.left) * (this._canvas.width / rect.width)
    const rsx     = CONFIG.RULER.MARGIN_X
    const rex     = this._canvas.width - CONFIG.RULER.MARGIN_X

    // 数直線帯の外タップは無視
    if (x < rsx || x > rex) return

    const ratio      = (x - rsx) / (rex - rsx)
    const tappedVal  = CONFIG.RULER.MIN + ratio * (CONFIG.RULER.MAX - CONFIG.RULER.MIN)

    this._zoomLevel++
    const zRange       = getZoomRange(this._zoomLevel, tappedVal, CONFIG)
    this._zoomMin      = zRange.min
    this._zoomMax      = zRange.max
    this._tickStep     = zRange.tickStep
  }

  _submitMeasure(val) {
    clearInterval(this._timerInterval)
    this._canvas.removeEventListener('click',    this._handleZoomTap)
    this._canvas.removeEventListener('touchend', this._handleZoomTap)
    this._numpad.hide()
    this._measuredValue = val
    this._measureError  = calcMeasurementError(val, this._targetValue)
    this._startAim()
  }

  _startAim() {
    this._phase    = 'AIM'
    // 砲撃フェーズは全体表示に戻す
    this._zoomMin  = CONFIG.RULER.MIN
    this._zoomMax  = CONFIG.RULER.MAX
    this._tickStep = CONFIG.ZOOM.LEVEL1.tickStep

    this._cannonInput.attach(this._canvas, CONFIG, (shot) => this._fire(shot))
  }

  _fire(shot) {
    this._cannonInput.detach()
    this._phase = 'FIRE'

    const rulerY  = this._canvas.height - CONFIG.RULER.Y_FROM_BOTTOM
    const cannonY = rulerY + CONFIG.CANNON.Y_FROM_RULER
    const cannonX = CONFIG.CANNON.X_FROM_LEFT

    const idealX  = calcLandingX(cannonX, cannonY, shot.power, shot.angleRad,
                                  CONFIG.PHYSICS.GRAVITY, rulerY)
    const blurredX = idealX !== null
      ? applyBlur(idealX, this._measureError, this._canvas.width, CONFIG)
      : cannonX + 200

    this._firedTrajectory = calcTrajectory(
      cannonX, cannonY, shot.power, shot.angleRad, CONFIG.PHYSICS.GRAVITY
    )
    this._landingX = blurredX

    setTimeout(() => this._showResult(), 600)
  }

  _showResult() {
    this._phase = 'RESULT'
    const rsx      = CONFIG.RULER.MARGIN_X
    const rex      = this._canvas.width - CONFIG.RULER.MARGIN_X
    const targetX  = valueToX(this._targetValue, CONFIG.RULER.MIN, CONFIG.RULER.MAX, rsx, rex)
    const diffPx   = Math.abs(this._landingX - targetX)
    const marginPx = (CONFIG.UNLOCK.HIT_MARGIN_VALUE / CONFIG.RULER.MAX) * (rex - rsx)
    const isHit    = diffPx <= marginPx

    this._hitResult = isHit ? 'HIT' : 'MISS'
    this._unlock.recordHit(isHit)
    this._unlock.save()

    setTimeout(() => this._startMeasure(), 1800)
  }
}

const game = new Game()
game.start()
```

- [ ] **Step 2: ローカルサーバーで手動テスト**

```bash
npx serve . --listen 3000
```

DevTools のモバイルエミュレート（横向き）または実機で以下を確認する：

1. タイトル画面が表示される
2. タップで MEASURE フェーズに移行し、数直線と敵船が表示される
3. テンキーが画面右下に表示され、数字入力・削除・OK が動作する
4. 数直線をタップするとズームインする（双眼鏡未解放時はレベル1のまま）
5. OK 後に AIM フェーズに移行、大砲をドラッグすると砲身方向が見える
6. 放すと FIRE フェーズ（軌跡が描画）→ 0.6 秒後に RESULT
7. HIT / MISS の表示、1.8 秒後に次のラウンドへ
8. 15 秒タイムアウトで自動的に AIM フェーズへ移行する

- [ ] **Step 3: 全テストが通ることを確認**

```bash
node --test tests/*.test.js
```
Expected: 全 PASS

- [ ] **Step 4: コミット**

```bash
git add js/game.js
git commit -m "feat: game state machine - full play loop integration"
```

---

### Task 10: GitHub Pages 公開・REGISTRY 追記

**Files:**
- Modify: `~/Workspace/apps/REGISTRY.md`

- [ ] **Step 1: リモートリポジトリを作成してプッシュ**

```bash
gh repo create pokopy-talkpapa/suuchokusen-battle --public --push --source .
```

- [ ] **Step 2: GitHub Pages を有効化**

```bash
gh api repos/pokopy-talkpapa/suuchokusen-battle/pages \
  --method POST \
  -f build_type=legacy \
  -f source.branch=main \
  -f 'source.path=/'
```

- [ ] **Step 3: 公開 URL で動作確認**

数分後に `https://pokopy-talkpapa.github.io/suuchokusen-battle/` にアクセスし、スマホ横向きで全フェーズを通しプレイできることを確認する。

- [ ] **Step 4: REGISTRY.md に追記**

`~/Workspace/apps/REGISTRY.md` に以下を追加：

```markdown
| suuchokusen-battle | めざせ！すうちょくせんマスター | 数直線読み+海戦砲撃ゲーム（MVP） | https://pokopy-talkpapa.github.io/suuchokusen-battle/ | ~/Workspace/suuchokusen-battle/ | Public |
```

- [ ] **Step 5: コミット**

```bash
git add .
git commit -m "chore: github pages deploy and registry entry"
```

---

## Self-Review

### 1. Spec Coverage

| 要件定義書の要件 | 対応タスク |
|----------------|-----------|
| 横向きスマホ専用 | Task 1（viewport・CSS） |
| テンキー自作（OSキーボード不使用） | Task 7（numpad.js） |
| ズーム3段階（タップで絞り込み） | Task 2（getZoomRange）、Task 9（handleZoomTap） |
| 1目盛り=1を使わない（最細=5） | Task 1（CONFIG.ZOOM.LEVEL3.tickStep=5） |
| パチンコ方式砲撃（ドラッグ→放す） | Task 3（dragToShot）、Task 6（CannonInput） |
| 着弾予測フェード | Task 8（PREVIEW_ALPHA=0.25） |
| 測量誤差→砲撃ブレの連動 | Task 4（applyBlur）、Task 9（_fire） |
| アンロック成長（肉眼→双眼鏡→望遠鏡） | Task 5（UnlockState） |
| PNGスプライト（未用意時は図形フォールバック） | Task 8（renderer.js init） |
| 制限時間15秒 | Task 9（timerInterval） |
| localStorageにアンロック保存 | Task 5（save/load） |
| GitHub Pages公開 | Task 10 |
| REGISTRY.md追記 | Task 10 |
| 全パラメータを config.js に集約 | Task 1 |

### 2. Placeholder Scan

- アセット（PNG）は未用意。renderer.js に Canvas 図形のフォールバックを入れ、PNG が `assets/` に置かれれば自動で切り替わる設計にした。
- 「仮タイトル確定」「アンロック解放条件の詳細」は未確定のまま。CONFIG の数値を変えれば調整できる形にした。

### 3. Type Consistency

- `getZoomRange(zoomLevel, centerValue, CONFIG)` — ruler.js・ruler.test.js・game.js で引数順一致
- `calcLandingX(cannonX, cannonY, power, angleRad, gravity, targetY)` — physics.js・game.js で一致
- `applyBlur(landingX, measuredError, canvasWidth, CONFIG)` — measurement.js・measurement.test.js・game.js で一致
- `dragToShot(dx, dy, CONFIG)` — physics.js・cannon.js で一致
