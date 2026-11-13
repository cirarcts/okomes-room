# ビルド・公開

ビルド、CI、公開手順を管理します。

## 構成

| 項目     | 内容                                                            |
| -------- | --------------------------------------------------------------- |
| 公開先   | GitHub Pages                                                    |
| ビルド   | `npm run build`（`dist/` に静的ファイルを出力）                 |
| CI       | [.github/workflows/ci.yml](../.github/workflows/ci.yml)         |
| デプロイ | [.github/workflows/deploy.yml](../.github/workflows/deploy.yml) |

## CI

PR作成・更新時と `main` へのpush時に、次を順に実行します（ローカルの `npm run verify` と同じ内容）。

1. `npm run format:check`
2. `npm run lint`
3. `npm run check`
4. `npm run test`
5. `npm run build`

Node.js のバージョンは `.tool-versions` を参照するため、ローカルとCIで一致します。

## デプロイ

`deploy.yml` がビルドして GitHub Pages へ公開します。
公開URL（`site`）とサブパス（`base`）は `actions/configure-pages` がGitHub Pagesの設定から取得してビルドに渡すため、`astro.config.mjs` に固定値を書いていません。独自ドメインを設定した場合も自動で追従します。

**現在は手動実行（`workflow_dispatch`）のみ**です。準備中のページが意図せず公開されないようにするためです。

### 初回セットアップ（未実施）

1. GitHubにリポジトリを作成し、`main` をpushする。
2. リポジトリの Settings → Pages → Build and deployment の Source を **GitHub Actions** にする。
3. Actions タブから「Deploy to GitHub Pages」を手動実行し、公開URLで表示を確認する。
4. 自動公開を始める段階で、`deploy.yml` の `push` トリガーのコメントを外す。

### 注意点

- **無料プランのGitHub Pagesは公開リポジトリが前提**。リポジトリ内のファイルと履歴はすべて公開される（[security.md](security.md)）。
- 独自ドメインを使わない場合、URLは `https://<ユーザー名>.github.io/<リポジトリ名>/` となりサブパス配信になる。内部リンクは `import.meta.env.BASE_URL` 基準で書く（[architecture.md](architecture.md)）。
- GitHub Pages にはPRごとのプレビュー環境がない。UI変更の確認はローカルの `npm run preview` で行う。

## 未決事項

- 独自ドメインを使うかどうか
- 自動公開（`main` へのpushで公開）へ切り替える時期
- 動画・音声など大容量アセットの置き場所（Git管理外の外部ストレージや埋め込みの利用）
