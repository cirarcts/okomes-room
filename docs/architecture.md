# アーキテクチャ

全体構成・技術選定・各部の責務を管理します。構想の背景は [idea.md](idea.md) を参照してください。

## 基本方針

- **静的サイト生成（SSG）**。ビルド時にHTMLを生成し、静的ホスティング（GitHub Pages）で配信する。
- **バックエンド・本番DB・サーバーサイド認証は持たない**。必要性が生じた段階で、メリット・デメリットと代替案を比較して再検討する。
- **表示機能とコンテンツデータを分離**する。記録は JSON / Markdown などのファイルで管理し、Gitで履歴を残す。
- **サイト共通機能と各展示室を分離**する。展示室は独自のUI・データ構造を持てる。

## 技術選定

| 項目                 | 採用                          | 補足                                                               |
| -------------------- | ----------------------------- | ------------------------------------------------------------------ |
| サイト基盤           | Astro 7                       | `output: 'static'`                                                 |
| インタラクティブUI   | React 19                      | 状態管理・ユーザー操作が必要な箇所に限定（Astroのアイランド）      |
| 言語                 | TypeScript 6（strict）        | 下記「バージョンに関する注意」を参照                               |
| スタイル             | Tailwind CSS 4 + 独自CSS      | Viteプラグイン方式。トークンは `src/styles/global.css` の `@theme` |
| データ検証           | Zod                           | Astro同梱の `astro/zod` を使う（別途インストールしない）           |
| Lint / 整形          | ESLint 10 / Prettier 3        | Astro・React Hooks・アクセシビリティ（jsx-a11y）の規則を有効化     |
| 単体テスト           | Vitest 5                      | `src/**/*.test.{ts,tsx}`                                           |
| Node.js              | 26（LTS）                     | `.tool-versions` で固定。ローカルは mise、CIは setup-node が参照   |
| パッケージマネージャ | npm                           | `package-lock.json` に従う                                         |
| CI / 公開            | GitHub Actions / GitHub Pages | [deployment.md](deployment.md)                                     |

### まだ導入していないもの

必要になった時点で導入します（将来の可能性だけを理由に先行導入しない）。

| 候補                  | 導入のきっかけ                                      |
| --------------------- | --------------------------------------------------- |
| MDX（`@astrojs/mdx`） | 記事内にコンポーネントを埋め込む必要が出たとき      |
| Apache ECharts        | グラフを使う最初の展示物（FF14 / GT7 など）の実装時 |
| React Testing Library | 操作テストが必要なReactコンポーネントができたとき   |
| Playwright            | 主要な画面操作のE2Eテストが必要になったとき         |
| ローカルPython        | 重いデータ解析を前処理として分離するとき            |

### バージョンに関する注意

- TypeScript は最新の 7 系ではなく **6 系**を使用している。`typescript-eslint`（`<6.1.0`）と `@astrojs/check`（`^5 || ^6`）が 7 系に未対応のため。両者が対応したら更新を検討する。
- アクセシビリティ規則は `eslint-plugin-jsx-a11y-x` を使用している。本家 `eslint-plugin-jsx-a11y` が ESLint 10 に未対応で、`eslint-plugin-astro` が対応先として指定しているフォーク。

## ディレクトリ構成

現在の構成：

```text
.
├── .github/              CI・デプロイのワークフロー、PRテンプレート
├── docs/                 ドキュメント
├── public/               そのまま配信する静的ファイル（favicon など）
├── src/
│   ├── layouts/          ページ共通の外枠（BaseLayout.astro）
│   ├── pages/            ルーティング対象のページ（ファイル名は kebab-case）
│   └── styles/           共通CSS・デザイントークン（global.css）
├── astro.config.mjs
├── eslint.config.mjs
├── tsconfig.json
└── vitest.config.ts
```

今後追加する想定の配置（実装時に確定し、この文書を更新する）：

| 置き場所             | 責務                                                               |
| -------------------- | ------------------------------------------------------------------ |
| `src/components/`    | サイト共通のUI部品（ヘッダー、ナビゲーション、フッターなど）       |
| `src/content/`       | コンテンツデータ（Astro Content Collections）。スキーマはZodで定義 |
| `src/exhibits/<名>/` | 展示物ごとの専用コンポーネント・スタイル・データ変換ロジック       |
| `scripts/`           | ビルド前のデータ集計・間引きなどのローカルスクリプト               |

## 実装上の約束事

### 内部リンクとアセットのパス

GitHub Pages のプロジェクトページは `/<リポジトリ名>/` 配下で配信されるため、**ルート相対パス（`/foo`）を直接書かない**。
`import.meta.env.BASE_URL` を基準に組み立てる（例：[BaseLayout.astro](../src/layouts/BaseLayout.astro)）。
共通ナビゲーションの実装時に、パスを組み立てるヘルパーを用意する想定。

### クライアントJavaScript

- Astroで実現できる静的表示にReactを使わない。
- `client:*` ディレクティブは操作が必要なコンポーネントに限定する。

### パスエイリアス

`@/*` → `src/*`（`tsconfig.json` の `paths`）。
