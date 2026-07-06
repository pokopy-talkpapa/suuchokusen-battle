// js/config.js
export const VERSION = 'v1.35'

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
    },
    { // いっちょまえ：百十まで読む。射撃は百のまま＝内分。
      name: 'いっちょまえ砲手',
      measureMode: 'hundred',  // 測量は target を含む100窓（十の目盛り）
      measureTickStep: 10,
      targetStep: 10,          // 正解は10の倍数
      aim: { tickStep: 100, zoomable: false, zoomTickStep: null },
      hitMargin: 28,
      enemyScale: 0.55,     // 序盤と同サイズ（大きい船が目盛りを隠すため統一・2026-07-04実機FB）
    },
    { // でんせつ：百十一まで読む。射撃はズーム後も百十まで（一の位は想像）。
      name: 'でんせつの砲手',
      measureMode: 'ten',      // 測量は target を含む10窓（一の目盛り）
      measureTickStep: 1,
      targetStep: 1,           // 正解は1の倍数
      aim: { tickStep: 100, zoomable: true, zoomTickStep: 10 },
      hitMargin: 14,
      enemyScale: 0.55,     // 序盤と同サイズに統一（2026-07-04実機FB）
    },
  ],
  ENEMY: {
    X_RATIO: 0.75,       // 敵船のCanvas X座標比率（0〜1）
    SHIP_WIDTH: 104,     // 高さ113 × 0.92（旧140＝横伸びの原因）
    SHIP_HEIGHT: 113,
  },
  AIM_PANEL: {
    MARGIN_X: 130,       // 照準パネル数直線の左右マージンpx（パネルPNGの木の内側＝左右約12%の金具を避ける）
    HEIGHT: 92,          // パネルPNGの描画高さpx
    Y_FROM_BOTTOM: 70,   // 画面下端からパネル中心までのpx
  },
  NEEDLE: {
    WIDTH: 6,            // 針の太さpx
    HEAD_R: 16,          // 針の頭（つまみ）の半径px
    GRAB_PAD: 40,        // 針をつかめる左右の許容px
  },
}
