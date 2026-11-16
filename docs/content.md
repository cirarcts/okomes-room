# コンテンツ

## Kemper Rig Viewer

Rigの表示データは [src/content/kemper-rigs](../src/content/kemper-rigs) に1件ずつJSONで保存します。[Content Collectionのスキーマ](../src/content.config.ts) がビルド時に各ファイルを検証します。

- 拡張子を除いたJSONファイル名が詳細ページの固定slugになります。英小文字・数字・ハイフンを使い、一意の名前にします。公開後に表示名を変える場合はファイル名を維持します。
- `name` にRig名、作者を表示する場合は `author` に作者名を記録します。
- 架空のサンプルには `fictional: true` を指定します。`concept` に日本語の概要、`conceptEn` に英語の概要を記録します。概要は言語ごとに任意です。サンプルのアンプやキャビネットには元になった機材を連想できる表示名を使います。エフェクト名には、実機で確認できた名称や音の特徴を表す短い名前を使用します。
- `amplifier` と `cabinet` に表示名と設定の配列を記録します。設定は `label` と `value` の組み合わせです。値は `0.0 dB` や `<0.0>` のように表示文字列で保存します。
- Rig ManagerのRigタブで確認したRig Volumeは、任意の `rigVolume` に `0.0 dB` のような表示文字列で記録します。最小値は `−∞` または `-96 dB` で記録でき、画面では `−∞` と表示します。
- `beforeStack`（A・B・C・D）と `afterStack`（X・MOD・DLY・REV）にエフェクトを信号順に記録します。既存の文字列の配列は、名前のみ取得できた形式として表示されます。
- 詳細を記録する場合は、各要素に `slot`、`name`、取得できた場合は `enabled` と `parameters` を指定します。空スロットは `name: null` で記録します。`enabled: false` はOFF、`enabled` の省略は状態未取得です。
- エフェクトの `category` にRig Managerのカテゴリを対応する英小文字・ハイフン形式で記録します（例としてTreble Boosterは `booster`、Graphic Equalizerは `equalizer`、Crystal Delayは `pitch-delay`）。指定できる値は [カテゴリ定義](../src/lib/kemperEffectCategories.ts) を参照してください。カテゴリを省略した場合は既存データ用の名称表を参照し、対応がなければグレーで表示します。
- エフェクトの各パラメータは `label` と `value` を持ちます。数値（0を含む）には必要に応じて `unit` を付けます。選択肢・文字列は文字列で、ON/OFFは真偽値で記録します。`value: null` は未設定、`parameters` の省略はパラメータ未取得、空配列は設定項目なしを表します。

実際のRigを追加する際は、公開する項目を実機またはRig Managerで確認して記入します。JSONの追加・変更後は `npm run verify` を実行します。

### Rig Managerとの照合

Gundy - Brown Soundは、Rig Manager 4.3.13 / PROFILER OS 14.2.2の表示と既存のキャプチャで確認した。記録対象はAmplifier、Cabinet、前後4スロットずつのエフェクト、Rig Volume。値は画面上の単位と精度を保持する（例：`24 ms`、`27.0 Hz`、`+90°`、`2.410 s`、`<0.0>`）。Input・Outputの設定、Morphの別状態、ロックやUI Modeなどのエディター操作は公開データに含めていない。名前だけを記録した既存Rigは、取得していない設定を補完せずに表示する。

## 動画の棚（Video Shelf）

表示対象のチャンネルと動画は [src/content/video-shelf](../src/content/video-shelf) のJSONで手動管理します。方式を選んだ理由は [video-shelf.md](video-shelf.md) を参照してください。

### チャンネル（`channels.json`）

```json
[{ "id": "example-channel", "channelId": "UC…（24文字）", "name": "表示名", "category": "music" }]
```

- `id` は設定内の固定slugです（英小文字・数字・ハイフン）。動画からはこのslugで参照します。
- `channelId` は `UC` から始まる24文字のチャンネルIDです。`@ハンドル` ではなく、YouTube上で確認したIDを記入します。
- `category` は任意の短いラベルで、両言語で同じ表記を表示します。
- `enabled: false` にすると、チャンネルとその動画を非表示にします（省略時は表示）。

### 動画（`videos.json`）

```json
[
  {
    "id": "11文字の動画ID",
    "channel": "example-channel",
    "title": "動画タイトル",
    "publishedAt": "2026-11-16"
  }
]
```

- `id` は動画URL（`watch?v=` の後ろ）の11文字です。同じIDは1件だけ表示します。
- `title` はYouTube上のタイトルをそのまま記入します（改変しない）。
- `publishedAt` は公開日（`YYYY-MM-DD`）です。一覧は公開日の新しい順に並びます。
- 未登録のチャンネルを参照するとビルドが失敗します。

### チャンネルの新着（自動取得）

`YOUTUBE_API_KEY` が設定されている場合、有効なチャンネルの新着がビルド時に自動で取得され、「チャンネルの新着」にチャンネルごとに表示されます。`channels.json` にチャンネルを追加するだけで対象になります。取得したデータはファイルに保存しません（[video-shelf.md](video-shelf.md#phase-2新着の自動取得ハイブリッド構成)）。`videos.json` には、チャンネルをまたいで並べたい動画を「おすすめ」として手動で登録します。

チャンネルIDや動画IDは推測で作成しません。公開動画のうち、埋め込みが許可されているものを登録します。追加・変更後は `npm run verify` を実行します。
