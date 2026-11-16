# okomeのおへや（okome's Room）

> 好きなものを、好きなだけ。

管理者 okome の趣味・記録・研究・制作物を自由に蓄積・公開する個人Webサイトです。
「夜の秘密基地のような、落ち着いた少し近未来的なおへや」をテーマに、展示物ごとに独自のデザインとインタラクティブな機能を持つ展示空間を目指します。

**現在の状態：** 展示室に「Kemper Rig Viewer」と「動画の棚」を公開しています。ほかのエリアは「準備中」の仮ページです。

## 主なエリア（予定）

| エリア     | 役割                                             |
| ---------- | ------------------------------------------------ |
| あしあと   | 日常の記録、活動履歴、発見、考えたこと           |
| 展示室     | 完成した作品、研究成果、インタラクティブな展示物 |
| アトリエ   | 制作途中の作品、実験、試作品                     |
| たからばこ | お気に入りの収集（追加候補）                     |

## 技術構成

Astro（静的サイト生成）/ React / TypeScript / Tailwind CSS。バックエンド・本番DBは持ちません。
詳細は [docs/architecture.md](docs/architecture.md) を参照してください。

## 最短起動手順

Node.js のバージョンは [.tool-versions](.tool-versions) で固定しています（[mise](https://mise.jdx.dev/) を使う場合は `mise install` で揃います）。

```bash
npm install
npm run dev
```

`http://localhost:4321/` で確認できます。

コミット・PR前の検証は次の1コマンドです。

```bash
npm run verify
```

個別のコマンドや開発ルールは [docs/development.md](docs/development.md) を参照してください。

## ドキュメント

| 文書                                         | 内容                                         |
| -------------------------------------------- | -------------------------------------------- |
| [docs/idea.md](docs/idea.md)                 | 構想・基本設計仕様（プロジェクトの出発点）   |
| [docs/architecture.md](docs/architecture.md) | 全体構成、技術選定、ディレクトリと責務       |
| [docs/design.md](docs/design.md)             | デザインコンセプト、配色、共通UIルール       |
| [docs/development.md](docs/development.md)   | 開発環境、コマンド、ブランチ運用             |
| [docs/deployment.md](docs/deployment.md)     | ビルド、CI、GitHub Pages への公開手順        |
| [docs/security.md](docs/security.md)         | 公開情報・秘密情報・外部コンテンツの取り扱い |
| [docs/content.md](docs/content.md)           | コンテンツ構造、スキーマ、記録の追加方法     |
| [docs/video-shelf.md](docs/video-shelf.md)   | 動画の棚の調査結果・設計・開発計画           |
