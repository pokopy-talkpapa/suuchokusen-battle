// js/config.js
export const VERSION = 'v1.53'

export const CONFIG = {
  RULER: {
    MIN: 0,
    MAX: 1000,
    Y_FROM_BOTTOM: 90,   // 画面下端から数直線帯中心までのpx
    HEIGHT: 56,          // 数直線帯の高さpx
    MARGIN_X: 20,        // 数直線の左右マージンpx（端から端）
  },
  ZOOM: {
    // レベル1（肉眼）：0〜1000全体・1目盛り=100
    LEVEL1: { tickStep: 100, rangeWidth: 1000 },
    // レベル2（双眼鏡）：100幅にズーム・1目盛り=10
    LEVEL2: { tickStep: 10,  rangeWidth: 100  },
    // レベル3（望遠鏡）：20幅にズーム・1目盛り=5
    LEVEL3: { tickStep: 5,   rangeWidth: 20   },
  },
  // 敵の描画倍率のカメラ連動（ズーム演出）。全体ビューは小さなシルエット、
  // ズームが深いほど大きく＝「目盛りの間にいる」が目で分かる。renderer が
  // meta.scale に enemyCamScale() の戻り値を掛ける。実機で見ながら調整する定数。
  // ※2026-07-05の実機FB「1段目で大きすぎると2段目の伸びしろが無くなる」は、
  //   全体ビューを大胆に小さくすることで伸びしろを作り直す形で上書きした。
  //   BY_LEVEL の隣り合う値の差が演出の効き幅そのものなので、詰めるときは並びで見る。
  ZOOM_ENEMY: {
    BY_LEVEL: [0.45, 1.4, 2.2],          // 敵の倍率: [全体, 100窓, 10窓]。中間は線形補間
                                          // v1.52: 実機FB「大きくなりすぎ＝近づいて見える」で
                                          // 増え幅を0.6倍に（旧 [0.45, 2.0, 3.4]）
    ANCHOR_BY_LEVEL: [0.55, 0.62, 0.70], // 足元の高さ(画面割合): 近づくほど手前(下)に構える
    STATIC_SCALE: 1.0,   // ズームが起きない場面での倍率。答え合わせ（FIRE/RESULT）と
                         // ズームを持たないみならいの測量に使う。1.0＝この演出を入れる前と同じ大きさ
    STATIC_ANCHOR: 0.55, // 同・足元。0.55＝水平線（従来の接地位置）
    TOP_MARGIN: 16,      // 敵の上端と数直線の最低すき間px（数直線を隠さない安全装置）
  },
  ZOOM_SEA: {
    SCALE_BY_LEVEL: [1.0, 1.15, 1.3], // 海の拡大率: [全体, 100窓, 10窓]。水平線を不動点に拡大
    PAN_FACTOR: 0.15,                  // 敵の横ずれ(画面幅割合)に対する海の流れ量
  },
  PHYSICS: {
    GRAVITY: 600,        // px/s^2
    MAX_POWER: 800,      // px/s（最大ドラッグ量に対応）
    PREVIEW_ALPHA: 0.25, // 着弾予測点の透明度
    PREVIEW_RADIUS: 18,  // 着弾予測点の円の半径px
  },
  CANNON: {
    X_FROM_LEFT: 78,     // 砲台中心を島の上＝数直線の外へ（旧100）
    Y_FROM_RULER: -80,   // 数直線Y座標から大砲中心のオフセット（上方向が負）
    BLUR_FACTOR: 0.25,   // ※applyBlur撤廃で現在未使用（spec§7で誤差は一本化）。判定に戻さないこと
    DRAG_MIN_PX: 20,     // これ以下のドラッグは無視
    DRAG_MAX_PX: 160,    // これ以上は最大パワーとして扱う
    DRAG_SCALE: 5,       // ドラッグpxをpx/sに変換する倍率
  },
  ISLAND: {
    CENTER_X: 78,        // 島の中心X（砲台と揃える）
    WIDTH: 150,
    HEIGHT: 70,
  },
  HINT: {
    ZOOM_ROUNDS: 3,      // 「ふねの あたりを タップ！」を出すのは窓のある段階の最初の◯回だけ
                         // （画面の文字を減らす。ズーム操作を覚えたら案内は消す・2026-07-10）
  },
  TIMER: {
    MEASURE_SEC: 15,     // 測量フェーズの制限時間（秒）
  },
  // モード＝「入力のしかた」の違いだけ。難易度（段階）は連続命中ランクが決める（両モード共通）。
  MODES: {
    // よんでうつ：テンキーで打ち込む・時間制限なし・打った数がメモになる
    beginner: { showMemo: true,  showNumpad: true,  measureTimer: false },
    // おぼえてうつ：テンキー無し・読んで記憶・時間で自動的に発射フェーズへ
    expert:   { showMemo: false, showNumpad: false, measureTimer: true  },
  },
  SCORE: {
    MAX: 100,          // ど真ん中の点数
    MIN_AT_EDGE: 60,   // 命中圏ぎりぎりの点数（外れは0点）
    SET_SIZE: 10,      // 1セットの発数（合計点で自己ベストを競う）
  },
  UNLOCK: {
    BINOCULARS_STREAK: 3, // 双眼鏡（レベル2）解放に必要な連続命中数
    TELESCOPE_STREAK: 6,  // 望遠鏡（レベル3）解放に必要な連続命中数
    MABOROSHI_STREAK: 9,  // まぼろし（レベル4）解放に必要な連続命中数（3→6→9の等差）
    HIT_MARGIN_VALUE: 30, // 着弾「命中」の許容誤差（value単位、0〜1000スケール）
  },
  // 段階＝連続命中ランク（みならい→いっちょまえ→でんせつ）。maxLevel 1/2/3 に対応・両モード共通。
  // name はランク名として画面に表示される。hitMargin・enemyScale はぽこぴぃ調整前提のデフォルト値。
  STAGES: [
    { // みならい：百だけ。位置記憶OK（やさしい）。
      name: 'みならい砲手',
      measureMode: 'full',     // 測量は 0〜1000 全体（百の目盛り）
      measureTickStep: 100,
      targetStep: 100,         // 正解は100の倍数
      aim: { tickStep: 100, zoomable: false, zoomTickStep: null },
      hitMargin: 45,
      enemyScale: 0.55,
      enemySprite: 'ship-enemy',   // 昼＝海賊船（現行）
    },
    { // いっちょまえ：百十まで読む。射撃は百のまま＝内分。
      name: 'いっちょまえ砲手',
      measureMode: 'hundred',  // 測量は target を含む100窓（十の目盛り）
      measureTickStep: 10,
      targetStep: 10,          // 正解は10の倍数
      aim: { tickStep: 100, zoomable: false, zoomTickStep: null },
      hitMargin: 28,
      enemyScale: 0.55,     // 序盤と同サイズ（大きい船が目盛りを隠すため統一・2026-07-04実機FB）
      enemySprite: 'enemy-boat',   // 夕方＝小舟（船よりやや小さめ）
    },
    { // でんせつ：百十一まで読む。射撃はズーム後も百十まで（一の位は想像）。
      name: 'でんせつの砲手',
      measureMode: 'ten',      // 測量は target を含む10窓（一の目盛り）
      measureTickStep: 1,
      targetStep: 1,           // 正解は1の倍数
      aim: { tickStep: 100, zoomable: true, zoomTickStep: 10 },
      hitMargin: 14,
      enemyScale: 0.55,     // 序盤と同サイズに統一（2026-07-04実機FB）
      enemySprite: 'enemy-drone',  // 夜＝空とぶドローン（さらに小さく・空中）
    },
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
  ],
  ENEMY: {
    X_RATIO: 0.75,       // 敵船のCanvas X座標比率（0〜1）
    SHIP_WIDTH: 104,     // 高さ113 × 0.92（旧140＝横伸びの原因）※SPRITES未定義時のフォールバック
    SHIP_HEIGHT: 113,
    // ランク別の敵スプライト。w/h は各PNGのアスペクト比に合わせた基準サイズ（描画時に scale×camScale）。
    // air は水平線から浮かせる高さ（Canvas高さ比・空とぶ敵用）。scale は船より小さくして「的が小さくなる」演出。
    // sink は命中時の撃沈／墜落アニメの3コマ画像プレフィックス（sink-1/2/3・正方形タイル）。
    SPRITES: {
      'ship-enemy':  { w: 104, h: 113, scale: 0.55, air: 0,    sink: 'ship-sink'  }, // 海賊船（比1.07）
      'enemy-boat':  { w: 104, h: 78,  scale: 0.50, air: 0,    sink: 'boat-sink'  }, // 小舟（比1.33・やや小さめ）
      'enemy-drone': { w: 100, h: 79,  scale: 0.46, air: 0.07, sink: 'drone-sink' }, // ドローン（比1.27・空中に浮遊）
    },
  },
  AIM_PANEL: {
    MARGIN_X: 175,       // 照準パネル数直線の左右マージンpx。金具(左右約12%)に加え、下角の
                         // もどす/うつ！ボタン(内側端150px)も避ける。130だと端の目盛り数字
                         // (500/600等)がボタンの下に描かれて読めなかった(2026-07-10実機FB)
    HEIGHT: 92,          // パネルPNGの描画高さpx
    Y_FROM_BOTTOM: 70,   // 画面下端からパネル中心までのpx
  },
  NEEDLE: {
    WIDTH: 6,            // 針の太さpx
    HEAD_R: 16,          // 針の頭（つまみ）の半径px
    GRAB_PAD: 40,        // 針をつかめる左右の許容px
  },
}
