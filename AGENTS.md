# たねまき算数アプリ（静的単体アプリ）共通ルール

このリポジトリは `~/Workspace/apps/REGISTRY.md` に登録された、たねまきスクールの
子ども向け算数アプリの1つ。単一 `index.html` 完結・ビルド不要・GitHub Pages公開が標準構成。

## 必ず参照するもの
- **デザイン正本**: `~/Workspace/apps/design.md`（子ども向けUI＝文字を減らし色/配置/雰囲気で伝える。
  配色はテーマG・演出はキラーン式/ピンポン式が標準）
- **アプリ一覧の正本**: `~/Workspace/apps/REGISTRY.md`（このアプリの役割・仕様の要約がある）
- Workspace全体のルールは `~/Workspace/AGENTS.md` を参照（親ディレクトリのため自動的に読み込まれる）

## この種のアプリに共通する制約
- 個人情報は一切保存・送信しない。進行状況はlocalStorageのみ（保存する場合）
- タップ音等の効果音はWeb Audio合成 or MP3事前デコード＋BufferSource即時再生を使う
  （MP3の遅延ロードは初回無音になりやすいので避ける）
- ロジックがある場合はJSファイルに分離し `node --test` 等でテスト可能にする
- デプロイは `git push` → GitHub Pages（mainブランチ）。ビルドステップは無い
- 新規アプリ・仕様変更時は `~/Workspace/apps/REGISTRY.md` の該当行を必ず更新する

## このアプリ固有の情報
（REGISTRY.mdの該当行を参照。詳細仕様はこのリポジトリ内のREADME/docsを見る）
