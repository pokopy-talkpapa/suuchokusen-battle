# 測量士×射撃手 世界観リビルド 実装プラン

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 公開済み「数直線バトル」の測量画面のビジュアル違和感3点（木製定規が浮く／島＋大砲が空に浮く／一人称射撃なのに横向き大砲が剥き出し）を、世界観の再構築（測量士A＝双眼鏡で横視点測量／射撃手B＝砲眼POV一人称射撃／通信は裏設定）で根本解消する。

**Architecture:** 既存の3フェーズ構成（MEASURE→AIM→FIRE→RESULT）はそのまま。`js/renderer.js` の `drawFrame` を中心に、(1) 背景をフェーズ別に切り替え（TITLE=title-bg / MEASURE・FIRE・RESULT=横視点の stage-bg / AIM=一人称 aim-pov）、(2) 木製定規 PNG を撤去して Canvas のシンプルな茶色数直線に、(3) 浮いた島/大砲の自前描画を撤去（背景アートに内包）、(4) AIM の自前一人称前景を撤去して aim-pov 背景の上に手元パネルを置く。芯（敵船・正解マーカー・着水点数値を AIM/FIRE で出さない）は一切崩さない。

**Tech Stack:** Vanilla ES Modules + Canvas 2D。テストは `node --test`（`npm test`・依存ゼロ）。配信は GitHub Pages（main push で自動・**公開はぽこぴぃ明示指示後**）。ローカル確認は `.claude/launch.json` の `suuchokusen`（python http.server・autoPort）。

## Global Constraints

以下は全タスク共通の絶対制約。各タスクの要件に暗黙的に含まれる。

- **芯（感覚エイム封じ3点）は絶対崩さない**：AIM/FIRE フェーズで①敵船②正解マーカー③着水点数値を出さない。`showShip` が `MEASURE || RESULT` のみであること、aim-pov 背景に敵船が描かれていないことの2点で担保する。
- **これら7項目はすべて Canvas 描画変更**＝純粋ロジックは触らない。`js/ruler.js`/`js/aim.js`/`js/physics.js`/`js/measurement.js`/`js/stage.js`/`js/unlock.js` は変更しない。`npm test` は全タスクで緑のまま（リグレッション検知のゲートとして使う）。
- **数直線は PNG でなく Canvas 描画**：茶色（たねまきブラウン #3C2415 付近）のシンプルな1本線＋等間隔の縦目盛り、両端だけ長い縦線＋数字。途中の目盛りに数字を出さない。**船位置の数字はどの場面でも出さない**。
- **木製定規 `ruler-bg.png` は描画から外す**（assets ファイル自体は削除しない＝戻せるよう残置）。
- **背景3枚は単純コピー**（マゼンタ背景ではない＝透過処理不要）：`bg-measure-stage.png`→`assets/stage-bg.png`、`bg-aim-pov.png`→`assets/aim-pov.png`、`keyvisual-title.png`→`assets/title-bg.png`。マゼンタ #FF00FF 背景のキャラ/船は今回のスコープ外（任意・別途）。
- **実機検証はハードリロード必須**（古い ES モジュールがキャッシュに残る罠）。preview 起動時にポートが孤児サーバーに握られていないか `lsof -nP -iTCP:<port> -sTCP:LISTEN` で確認。
- **微調整値（双眼鏡の円位置/サイズ・砲台原点 CONFIG.CANNON・hitMargin・タイトル文言の有無）はぽこぴぃ指定/実機で詰める**。コードはデフォルト値を置くだけにし、勝手に最終確定しない。
- **push/公開はぽこぴぃの明示指示が出てから**。

---

## File Structure（このプランで触るファイル）

- `assets/stage-bg.png`（新規・コピー）— 測量・着弾の横視点舞台背景（左トーチカ＋射撃手＋海を内包）。
- `assets/aim-pov.png`（新規・コピー）— 射撃の一人称 POV 背景（砲眼越しの大砲＋海）。
- `assets/title-bg.png`（新規・コピー）— タイトル背景（全部入りキービジュアル）。
- `js/renderer.js`（修正）— `ASSET_NAMES` に3枚追加。`drawFrame` の背景選択・数直線・島/大砲・AIM前景・双眼鏡・タイトルを改修。
- `js/game.js`（修正）— `_buildState()` の `fog` を 0 に（背景アートが敵を隠すため霧オーバーレイ不要に）。

> **テスト方針**：7項目はすべて Canvas/DOM 描画でユニットテスト不可。各タスク末尾の「実機確認」で観察可能な期待値を明記して検証する。純粋モジュールは触らないので `npm test` は常に緑（壊れたら触ってはいけない場所を触った合図）。

---

## Task 1: アート取り込み（背景3枚コピー＋ASSET_NAMES登録）

**Files:**
- Create: `assets/stage-bg.png`, `assets/aim-pov.png`, `assets/title-bg.png`（`~/Desktop/suuchokusen-art-incoming/` からコピー）
- Modify: `js/renderer.js:4-5`（`ASSET_NAMES`）

**Interfaces:**
- Produces: `this._imgs['stage-bg']` / `['aim-pov']` / `['title-bg']` が `Renderer.init` のロード対象になる（後続タスクが参照）。
- Consumes: なし。

- [ ] **Step 1: 背景3枚を assets へコピー**

```bash
cd ~/Workspace/suuchokusen-battle
cp ~/Desktop/suuchokusen-art-incoming/bg-measure-stage.png assets/stage-bg.png
cp ~/Desktop/suuchokusen-art-incoming/bg-aim-pov.png       assets/aim-pov.png
cp ~/Desktop/suuchokusen-art-incoming/keyvisual-title.png  assets/title-bg.png
ls -la assets/stage-bg.png assets/aim-pov.png assets/title-bg.png
```
Expected: 3ファイルが存在（各 ~2MB）。

- [ ] **Step 2: ASSET_NAMES に3枚を追加**

`js/renderer.js` の4〜5行目を次へ差し替え：

```js
const ASSET_NAMES = ['sea-bg', 'cannon', 'cannonball', 'ship-enemy', 'splash', 'ruler-bg', 'island',
                     'ship-sink-1', 'ship-sink-2', 'ship-sink-3', 'binocular-frame', 'aim-panel',
                     'stage-bg', 'aim-pov', 'title-bg']
```

- [ ] **Step 3: 構文チェック**

Run: `node --check js/renderer.js`
Expected: 出力なし（exit 0）。

- [ ] **Step 4: 全テストが緑のまま確認**

Run: `npm test`
Expected: PASS（描画資産の追加は純粋テストに影響しない）。

- [ ] **Step 5: コミット**

```bash
git add assets/stage-bg.png assets/aim-pov.png assets/title-bg.png js/renderer.js
git commit -m "feat: import worldview backgrounds (stage/aim-pov/title) and register assets"
```

---

## Task 2: 数直線シンプル化（木製定規撤去・Canvasの茶色1本線・両端だけ数字）

**Files:**
- Modify: `js/renderer.js`（`drawFrame` 内・現 L110-141「数直線帯」＋「目盛り」ブロック）

**Interfaces:**
- Consumes: `state.zoomMin`, `state.zoomMax`, `state.tickStep`, `state.phase`。`getTicks`,`valueToX`（ruler.js・既存 import）。
- Produces: 横視点の数直線描画（MEASURE/FIRE/RESULT 時のみ）。AIM 時は描かない（手元パネルが別の数直線を持つため）。

> **設計判断**：旧コードは TITLE 以外の全フェーズで主数直線を描いていた。AIM では手元パネルが自前の数直線を持つので、主数直線は AIM では描かない（`state.phase !== 'AIM'` でゲート）。FIRE は弾道が横視点座標（valueToX(rsx,rex)）で着水点に落ちるので主数直線を描く＝弾が線上に落ちて見える。

- [ ] **Step 1: 「数直線帯」＋「目盛り」ブロックを差し替え**

`js/renderer.js` の現 L110-141（コメント `// 数直線帯` から、目盛り forEach の閉じ `})` まで）を、次の1ブロックへ**全置換**：

```js
    // 数直線（茶色のシンプルな1本線＋等間隔の縦目盛り。数字は両端だけ・PNG定規は廃止）。
    // AIM は手元パネルが別の数直線を持つので主数直線は描かない。
    if (state.phase !== 'AIM') {
      const ticks = getTicks(state.zoomMin, state.zoomMax, state.tickStep)

      // 基準線（細い茶色の1本）
      ctx.strokeStyle = '#3C2415'
      ctx.lineWidth = 4
      ctx.beginPath()
      ctx.moveTo(rsx, rulerY)
      ctx.lineTo(rex, rulerY)
      ctx.stroke()

      // 途中の目盛り（数字なし）
      ctx.textAlign = 'center'
      ticks.forEach(({ value, isMajor }) => {
        const x  = valueToX(value, state.zoomMin, state.zoomMax, rsx, rex)
        const tH = isMajor ? 22 : 12
        ctx.strokeStyle = '#3C2415'
        ctx.lineWidth = isMajor ? 3 : 2
        ctx.beginPath()
        ctx.moveTo(x, rulerY - tH / 2)
        ctx.lineTo(x, rulerY + tH / 2)
        ctx.stroke()
      })

      // 両端だけ：長い縦線＋数字（最小・最大）。途中に数字を出さない＝「読む」必然を守る。
      ;[state.zoomMin, state.zoomMax].forEach((value) => {
        const x = valueToX(value, state.zoomMin, state.zoomMax, rsx, rex)
        ctx.strokeStyle = '#3C2415'
        ctx.lineWidth = 5
        ctx.beginPath()
        ctx.moveTo(x, rulerY - 30)
        ctx.lineTo(x, rulerY + 30)
        ctx.stroke()
        ctx.font = 'bold 26px sans-serif'
        ctx.lineWidth = 6
        ctx.strokeStyle = 'rgba(255,255,255,0.95)'
        ctx.strokeText(String(value), x, rulerY - 36)
        ctx.fillStyle = '#3C2415'
        ctx.fillText(String(value), x, rulerY - 36)
      })
    }
```

- [ ] **Step 2: 構文チェック**

Run: `node --check js/renderer.js`
Expected: 出力なし（exit 0・`ruler-bg` 参照が数直線描画から消えていること。※`ASSET_NAMES` の `'ruler-bg'` 文字列はロード対象として残ってよい＝未使用でも害なし）。

- [ ] **Step 3: 全テストが緑のまま確認**

Run: `npm test`
Expected: PASS。

- [ ] **Step 4: 実機確認（数直線）**

`.claude/launch.json` の `suuchokusen` で起動 → ブラウザでハードリロード → 初級で開始（測量フェーズ）。
観察する期待値：
- 木製定規 PNG が消え、**茶色の細い1本線＋目盛り**になっている。
- **数字は左端・右端だけ**（序盤なら 0 と 1000）。途中の目盛りには数字が出ていない。
- 両端は長い縦線になっている。

- [ ] **Step 5: コミット**

```bash
git add js/renderer.js
git commit -m "feat: simplify number line to canvas brown line with endpoint-only labels"
```

---

## Task 3: フェーズ別背景＋浮いた島/大砲の撤去

**Files:**
- Modify: `js/renderer.js`（`drawFrame` 内・現 L67-77「背景」、現 L271-290「島＋大砲」）

**Interfaces:**
- Consumes: `state.phase`。`this._imgs['title-bg'|'stage-bg'|'aim-pov'|'sea-bg']`。
- Produces: フェーズごとの背景描画。島/大砲の自前描画は撤去（背景アートに内包）。

> **背景マッピング**：TITLE=`title-bg`／AIM=`aim-pov`（一人称）／MEASURE・FIRE・RESULT=`stage-bg`（横視点の舞台）。FIRE は横視点に切り替わり、弾道が左トーチカ→着水点へ横から飛んで見える（②一人称で狙う→③横から着弾を見る、の移行点）。

- [ ] **Step 1: 背景ブロックをフェーズ別選択へ差し替え**

`js/renderer.js` の現 L67-77（コメント `// 背景` から、フォールバック gradient の閉じ `}` まで）を次へ**全置換**：

```js
    // 背景（フェーズで切替）：TITLE=タイトル / AIM=一人称POV / それ以外=横視点の舞台。
    const bgName = (state.phase === 'TITLE')          ? 'title-bg'
                 : (state.phase === 'AIM')            ? 'aim-pov'
                 : /* MEASURE / FIRE / RESULT */        'stage-bg'
    const bgImg = this._imgs[bgName] || this._imgs['stage-bg'] || this._imgs['sea-bg']
    if (bgImg) {
      ctx.drawImage(bgImg, 0, 0, cv.width, cv.height)
    } else {
      const grad = ctx.createLinearGradient(0, 0, 0, cv.height)
      grad.addColorStop(0, '#87ceeb')
      grad.addColorStop(0.55, '#1a6fa8')
      grad.addColorStop(1, '#0d4f7a')
      ctx.fillStyle = grad
      ctx.fillRect(0, 0, cv.width, cv.height)
    }
```

- [ ] **Step 2: 「島＋大砲」ブロックを撤去**

`js/renderer.js` の現 L271-290（コメント `// 島＋大砲（横視点の足場・砲台）` から `if (state.phase !== 'AIM') { ... }` ブロック全体）を**削除**する。島・大砲は `stage-bg.png` に内包されたため自前描画は不要。

> 削除後、`cannonX`/`cannonY` のローカル変数（現 L62-63 で定義）は弾道演出（現 L291- の `firedArc`）では使わない（弾道は game.js 側で `firedArc` を生成済み）。renderer 内で未使用になるが、現 L62-63 の定義は他で参照していなければ残置でも害はない。**`node --check` 後に renderer 内 `cannonX`/`cannonY` の参照が他に無いか grep で確認**し、無ければ現 L62-63 の2行を削除して未使用変数を残さない。

- [ ] **Step 3: 構文チェック＋未使用変数の確認**

```bash
node --check js/renderer.js
grep -n 'cannonX\|cannonY' js/renderer.js
```
Expected: `node --check` 出力なし。grep が L62-63 の定義しかヒットしない場合はその2行を削除して再度 `node --check`。

- [ ] **Step 4: 全テストが緑のまま確認**

Run: `npm test`
Expected: PASS。

- [ ] **Step 5: 実機確認（背景・島/大砲）**

ハードリロードで通し確認：
- タイトル → `title-bg`（キービジュアル）が背景に出る。
- 測量 → `stage-bg`（左トーチカ＋射撃手＋海の横視点）。**空に浮いた島/大砲が消えている**。
- 射撃（AIM）→ `aim-pov`（砲眼越し）。
- 着弾（RESULT）→ `stage-bg` に戻り、横から着弾・命中が見える。

- [ ] **Step 6: コミット**

```bash
git add js/renderer.js
git commit -m "feat: phase-based backgrounds (title/stage/aim-pov); remove floating island & cannon"
```

---

## Task 4: 射撃フェーズを一人称POV背景に載せ替え（自前前景＋砲口撤去・霧オフ）

**Files:**
- Modify: `js/renderer.js`（`drawFrame` 内・現 L177-211「霧」＋AIM自前前景＋砲口）
- Modify: `js/game.js`（`_buildState()` の `fog`）

**Interfaces:**
- Consumes: `state.phase==='AIM'`, `state.aim`, `state.panelGeom`, `state.memo`, `state.canZoom`, `state.buttonRects`。`aim-pov` 背景（Task 3 で AIM 時に描画済み）。
- Produces: AIM は aim-pov 背景の上に手元パネル・針・ボタンのみを描く。霧オーバーレイは廃止（背景アートが敵を隠す＝芯は `showShip` で担保）。

> **芯チェック**：敵船は `showShip = MEASURE||RESULT` のため AIM/FIRE で描かれない。aim-pov 背景にも敵船は無い。正解マーカー・着水点数値は元々 AIM で描いていない。＝霧を外しても芯は崩れない。

- [ ] **Step 1: game.js の fog を 0 にする**

`js/game.js` の `_buildState()` 内、`fog:` を返している行を探して次へ変更（背景アートが敵を隠すので霧オーバーレイ不要）：

```js
      // 敵船は showShip(MEASURE/RESULT のみ)で制御し、AIM/FIRE は一人称/横視点の背景が隠す。
      // 霧の白オーバーレイは背景アートを白く潰すため廃止。
      fog:            0,
```

- [ ] **Step 2: renderer の「霧」ブロックを撤去**

`js/renderer.js` の現 L177-186（コメント `// 霧（AIM/FIRE中に敵船を隠す）` から `if (state.fog > 0) { ... }` ブロック全体）を**削除**。

- [ ] **Step 3: renderer のAIM自前前景＋砲口を撤去（パネル以降は残す）**

`js/renderer.js` の AIM ブロック（現 `if (state.phase === 'AIM' && state.aim) {` 内）から、次の2部分を**削除**する：
- 「一人称の暗い前景」＝`const horizon = ...` から前景 `ctx.fillRect(0, horizon - 80, ...)` まで（現 L196-202）。
- 「砲口（奥へ向く…）」＝楕円 `ctx.ellipse(cv.width/2, horizon - 24, ...)` のブロック（現 L204-211）。

削除後の AIM ブロック先頭は次の形になる（`ctx.save()` → パネル土台描画へ直行。`horizon` は使わないので変数も消える）：

```js
    // ── 射撃フェーズ（一人称 aim-pov 背景の上に手元の照準パネルを置く） ──
    if (state.phase === 'AIM' && state.aim) {
      ctx.save()
      const { sx, ex, y } = state.panelGeom
      const a = state.aim

      // 照準パネル PNG（土台）
      const ph = CFG.AIM_PANEL.HEIGHT
      if (this._imgs['aim-panel']) {
        ctx.drawImage(this._imgs['aim-panel'], sx - 30, y - ph / 2, (ex - sx) + 60, ph)
      } else {
        ctx.fillStyle = '#caa05a'
        roundRectPath(ctx, sx - 30, y - ph / 2, (ex - sx) + 60, ph, 16); ctx.fill()
      }
```

> 以降のパネル数直線・針・メモ・発射/ズームボタン・`ctx.restore()` は**そのまま残す**（変更しない）。

- [ ] **Step 4: 構文チェック＋未使用参照の確認**

```bash
node --check js/renderer.js
node --check js/game.js
grep -n 'horizon\|state.fog' js/renderer.js
```
Expected: `node --check` 出力なし。grep が空（`horizon`・`state.fog` の参照が renderer から消えている）。

- [ ] **Step 5: 全テストが緑のまま確認**

Run: `npm test`
Expected: PASS。

- [ ] **Step 6: 実機確認（射撃・芯リグレッション）**

ハードリロードで射撃フェーズへ進む（初級：測量で数字入力→OK）：
- AIM 背景が `aim-pov`（砲眼越しの大砲＋海）になり、**白い霧で潰れていない**。
- その上に手元パネル・針・「うつ！」ボタンが乗る。初級は「ねらえ ◯◯」メモが出る。
- **芯チェック（最重要）**：AIM/FIRE 中に①敵船②正解マーカー③着水点の数値が**いずれも出ていない**こと。針を置いて「うつ！」→ FIRE で弾道が横視点（stage-bg）を飛び、RESULT で初めて敵船＋着弾が出る。

- [ ] **Step 7: コミット**

```bash
git add js/renderer.js js/game.js
git commit -m "feat: aim phase uses first-person POV background; drop self-drawn foreground & fog"
```

---

## Task 5: 双眼鏡の位置/サイズ調整＋タイトル背景の馴染ませ＋通し確認（実機で詰める）

**Files:**
- Modify: `js/renderer.js`（現 L347-373 双眼鏡マスク/枠、現 L80-108 タイトル overlay）

**Interfaces:**
- Consumes: `state.phase==='MEASURE'`（双眼鏡）／`'TITLE'`（タイトル）。`this._imgs['binocular-frame'|'title-bg']`。
- Produces: 横視点の舞台に合わせた双眼鏡レンズ位置/サイズ。title-bg と描画ボタンの両立。

> このタスクは数値の微調整が中心＝**実機で見ながら詰める**。デフォルト値を置き、最終確定はぽこぴぃ確認で行う（勝手に確定しない）。

- [ ] **Step 1: タイトル overlay のスクリムを軽くする**

`js/renderer.js` のタイトル描画（現 L80-108 `if (state.phase === 'TITLE') {`）冒頭の暗幕を弱める。現 L81-82：

```js
      ctx.fillStyle = 'rgba(0,0,0,0.5)'
      ctx.fillRect(0, 0, cv.width, cv.height)
```
を次へ変更（title-bg のキービジュアルを活かしつつ文字可読性を確保）：

```js
      // title-bg のキービジュアルを活かすため暗幕は薄め。文字の可読性はテキスト側のフチで確保。
      ctx.fillStyle = 'rgba(0,0,0,0.28)'
      ctx.fillRect(0, 0, cv.width, cv.height)
```

> タイトル文字（現 L83-89「めざせ！すうちょくせんマスター」等）はそのまま残す。**実機で title-bg にタイトル文字が既に焼き込まれていて二重に見える場合のみ**、現 L84-89 のタイトル文字2行を削除する（ボタン `しょしんしゃ`/`じょうきゅう` は操作に必要なので必ず残す）。判断は Step 4 の実機確認で行う。

- [ ] **Step 2: 双眼鏡の円位置/サイズを横視点の舞台に合わせて調整**

`js/renderer.js` の双眼鏡ブロック（現 L348-353）の定数を、横視点 stage-bg に合わせた初期値に。現状：

```js
      const cy  = cv.height * 0.46
      const R   = Math.min(cv.width * 0.30, cv.height * 0.60)
      const cxL = cv.width / 2 - R * 0.82
      const cxR = cv.width / 2 + R * 0.82
```

数直線は MEASURE 時 `rulerY = Math.round(cv.height * 0.52)`（現 L58）に描かれる。レンズ中心 `cy` を数直線とおおむね揃え、レンズ内に数直線が途切れず収まるよう初期値を置く：

```js
      // 横視点の舞台に合わせる初期値（実機で詰める）。数直線(MEASURE)は cv.height*0.52。
      const cy  = Math.round(cv.height * 0.50)
      const R   = Math.min(cv.width * 0.30, cv.height * 0.58)
      const cxL = cv.width / 2 - R * 0.82
      const cxR = cv.width / 2 + R * 0.82
```

> 枠 PNG の倍率（現 L371 `fw = (cxR - cxL) + R * 2.3`）は現状維持。実機で枠とレンズ穴がズレる場合のみこの係数を詰める。

- [ ] **Step 3: 構文チェック＋全テスト**

```bash
node --check js/renderer.js
npm test
```
Expected: `node --check` 出力なし。`npm test` PASS。

- [ ] **Step 4: 実機・通し確認（全フェーズ＋芯リグレッション）**

ハードリロードで TITLE→MEASURE→AIM→FIRE→RESULT を通す。観察する期待値：
- **タイトル**：title-bg が見え、ボタン2つが読める。タイトル文字が二重なら Step 1 の但し書きに従い文字を削除。
- **測量**：双眼鏡のレンズ内に数直線（茶色・両端のみ数字）が中央まで途切れず読める／レンズ外は黒く塞がれている／浮いた島・大砲が無い。右上に段階名。
- **射撃**：aim-pov 背景＋手元パネル。霧潰れなし。
- **着弾**：stage-bg 横視点で着弾・命中（沈船コマ）。
- **芯（最重要・リグレッション禁止）**：AIM/FIRE で敵船・正解マーカー・着水点数値が出ない／「見えた位置≠置く位置」が保たれている。
- 中盤・上級の確認（任意）：devtools で
  `localStorage.setItem('suuchokusen_unlock_v1', JSON.stringify({level:1,streak:6,maxLevel:2}))` → ハードリロードで中盤、`maxLevel:3` で上級。測量窓が 100窓/10窓になり、0〜1000全体に船が乗った絵が出ないこと。

- [ ] **Step 5: 残った微調整メモを spec の「未確定」へ反映（任意）**

実機で詰めた双眼鏡の円位置/サイズ・砲台原点（CONFIG.CANNON で弾道の出発点が stage-bg のトーチカと合うか）など、ぽこぴぃ確認待ちの数値を spec §未確定に1行で書き残す。

- [ ] **Step 6: コミット**

```bash
git add js/renderer.js
git commit -m "feat: tune binocular lens for side-view stage; soften title scrim over keyvisual"
```

---

## 完了後（このプランの外・ぽこぴぃ判断）

- whole-branch レビュー（superpowers:requesting-code-review）→ 指摘反映。
- superpowers:finishing-a-development-branch で main へ取り込み。
- **公開（GitHub Pages への push）はぽこぴぃの明示指示が出てから**。

## Self-Review（spec との突き合わせ）

spec §実装スコープ7項目 → タスク対応：
1. 数直線シンプル化 → Task 2 ✅
2. 舞台背景の差し替え（stage-bg）→ Task 1（取り込み）＋ Task 3（描画）✅
3. 浮いた島/大砲の撤去 → Task 3 ✅
4. 射撃POV差し替え（aim-pov）→ Task 1（取り込み）＋ Task 4（描画・霧オフ）✅
5. 双眼鏡の位置/サイズ調整 → Task 5 ✅
6. タイトル背景（title-bg）→ Task 1（取り込み）＋ Task 3（選択）＋ Task 5（スクリム調整）✅
7. 通信は遷移のみ（コード変更なし）→ 該当タスクなし＝意図どおり ✅

芯の維持（spec §芯チェック）→ Task 4 Step6 ＋ Task 5 Step4 の実機リグレッション項目でカバー ✅
アート透過（マゼンタ）→ 背景3枚は非マゼンタ＝コピーのみ（Global Constraints に明記）。キャラ/船はスコープ外 ✅
