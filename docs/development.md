# 開発ガイド

開発環境・コマンド・運用ルールを管理します。コーディング規約の全文は [CLAUDE.md](../CLAUDE.md) を参照してください。

## 必要な環境

| ツール  | バージョン                                 |
| ------- | ------------------------------------------ |
| Node.js | [.tool-versions](../.tool-versions) で固定 |
| npm     | Node.js 同梱のもの                         |

### Node.js の導入（mise）

```bash
brew install mise
```

シェルで自動的にバージョンを切り替えるには、`~/.zshrc` に次の1行を追加します。

```bash
eval "$(mise activate zsh)"
```

リポジトリ直下で次を実行すると、`.tool-versions` のバージョンが入ります。

```bash
mise install
```

mise を使わない場合は、`.tool-versions` と同じメジャーバージョンの Node.js を任意の方法で用意してください。

## セットアップ

```bash
npm install
```

## コマンド

| コマンド               | 内容                                                             |
| ---------------------- | ---------------------------------------------------------------- |
| `npm run dev`          | 開発サーバーを起動（`http://localhost:4321/`）                   |
| `npm run build`        | 本番ビルド（`dist/` に出力）                                     |
| `npm run preview`      | ビルド結果をローカルで配信して確認                               |
| `npm run check`        | 型チェック（`astro check`）                                      |
| `npm run lint`         | ESLint                                                           |
| `npm run lint:fix`     | ESLint（自動修正）                                               |
| `npm run format`       | Prettier で整形                                                  |
| `npm run format:check` | 整形済みかを確認（CIと同じ）                                     |
| `npm run test`         | 単体テスト（Vitest）                                             |
| `npm run test:watch`   | 単体テスト（監視モード）                                         |
| `npm run verify`       | 上記の検証をまとめて実行（format → lint → 型 → テスト → ビルド） |

**コミット・PR前に `npm run verify` を通す**こと。CIでも同じ内容を実行します。

サブパス配信（GitHub Pages）での表示崩れを手元で確認したい場合：

```bash
npm run build -- --base /okomes-room
```

```bash
npm run preview -- --base /okomes-room
```

## ブランチ運用

- 作業開始時は最新の `main` から新規ブランチを作成する。
- チェックアウト中のブランチが未マージの作業中ブランチなら、`main` から Git Worktree などで独立した作業環境を作る。マージ完了後に不要な Worktree を削除する。
- 既存の未コミット変更や、他の作業で使用中のブランチ・Worktree を勝手に破棄・削除しない。
- コミットメッセージ、PRのタイトル・本文は日本語で書く。
- PRは [.github/pull_request_template.md](../.github/pull_request_template.md) の雛形を使う。

## テストの方針

- テストファイルは対象の隣に `*.test.ts` / `*.test.tsx` として置く（`src/` 配下）。
- ロジックには正常系・異常系・境界値を含める。コンテンツのスキーマ検証やデータ変換処理もテスト対象。
- 純粋なCSS調整では新規テストは必須としないが、実際のブラウザ表示は確認する。

## 依存関係の追加・更新

- 追加前に、必要性・保守性・依存の増加・バンドルサイズを検討する。
- 追加・更新後は `npm audit` を確認する。
- 既知の事項：ESLint 10 が依存する `minimatch` に moderate の脆弱性報告（DoS）があり、2026-11-13 時点で修正版がない。開発時のみ使うツールで、公開する成果物には含まれない。ESLint 側の更新で解消され次第、この記述を削除する。
