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

### カテゴリ（`categories.json`）

```json
[{ "id": "music", "name": "音楽", "nameEn": "Music", "order": 30 }]
```

- `id` はチャンネルから参照する固定slugです。`name` に日本語名、`nameEn` に英語名を記録します。
- 絞り込みの欄では `order` の小さい順に並びます。表示中のチャンネルで使われていないカテゴリは出しません。

### チャンネル（`channels.json`）

```json
[
  {
    "id": "example-channel",
    "channelId": "UC…（24文字）",
    "name": "表示名",
    "categories": ["music"],
    "priority": 10
  }
]
```

- `id` は設定内の固定slugです（英小文字・数字・ハイフン）。動画からはこのslugで参照します。
- `channelId` は `UC` から始まる24文字のチャンネルIDです。`@ハンドル` ではなく、YouTube上で確認したIDを記入します。
- `categories` には `categories.json` の `id` を複数指定できます（省略時はなし）。未定義の `id` を書くとビルドが失敗します。
- `priority` は棚の並び順です。大きいほど上に並び、省略時は0、同じ値なら名前順です。
- `owner: true` は管理人自身のチャンネルです。推しチャンネルの棚には並べず、ページ下部の「管理人のチャンネル」に表示します。指定できるのは1つまでです。
- `enabled: false` にすると、チャンネルとその動画を非表示にします（省略時は表示）。
- `uploadsPerKind` は任意です。YouTubeの「動画」「Shorts」「ライブ」の種類ごとに取得する直近の動画数で、省略時は100本、指定できる範囲は1〜500本です。増やすとページが大きくなり（1本あたり約1.7KB）、APIの使用量も50本ごとに増えます。
- `videoKinds` は任意です。種別はYouTubeの「動画」「Shorts」「ライブ」タブに合わせて自動で付くため、通常は不要です。自動の分類を上書きしたい動画や、種類ごとの取得範囲（既定で直近100本）より古い動画を表示したい場合に、動画IDをキーに、「動画」は `regular`、「Shorts」は `shorts`、「ライブ」の配信アーカイブは `live` を指定します。直近の取得範囲外でも詳細を取得し、公開元や埋め込み可否などを確認した上で、指定の分類を優先します。

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
- `kind` は任意で、`regular`（通常）・`live`（配信のアーカイブ・プレミア公開）・`shorts`（YouTube Shorts）を指定できます。省略すると種別未取得として扱い、種別での絞り込みでは「すべて」のときだけ表示します。
- 未登録のチャンネルを参照するとビルドが失敗します。

### プレイリスト（`playlists.json`）

```json
[
  {
    "id": "favorites",
    "name": "お気に入り",
    "nameEn": "Favorites",
    "order": 0,
    "items": [
      { "video": "11文字の動画ID", "channel": "example-channel", "title": "動画タイトル" },
      {
        "video": "11文字の動画ID",
        "channel": "example-channel",
        "title": "動画タイトル",
        "start": "12:30",
        "end": "18:45",
        "note": "好きな話題",
        "weight": 3
      }
    ]
  }
]
```

- 動画の全編や一部分（区間）を手動で並べ、動画の棚のページの「プレイリスト」に表示します。チャンネルをまたいで並べられます。
- `id` は固定slugです。`name` に日本語名、`nameEn` に英語名を記録します。`order` の小さい順に並びます（省略時は0）。
- `video` は動画ID（11文字）、`channel` は `channels.json` の `id` です。未登録のチャンネルを参照するとビルドが失敗します。`enabled: false` のチャンネルの項目は表示しません。
- `title` はYouTube上のタイトルをそのまま記入します（改変しない）。自分用の説明は `note` に書きます（タイトルとは別の行に表示し、検索の対象にもなります）。
- `start` / `end` は任意の再生区間で、`ss`・`m:ss`・`h:mm:ss`（例：`45`、`12:30`、`1:05:10`）で指定します。両方省略すると全編、`start` だけなら最後まで、`end` だけなら最初から再生します。`end` は `start` より後にします。
- `weight` は任意のランダム再生の重みで、1〜10の整数です（省略時は1）。大きいほど、ランダム再生の1周の中で前のほうに来やすくなります。1周の中で各項目が1回ずつ流れるのは変わりません。
- 同じ動画の別の区間は別の項目として登録できます。同じ動画・同じ区間の重複はビルドが失敗します。
- 動画IDや区間は、YouTube上で確認した値だけを記入します（推測で作らない）。
- 区間は、開発環境（`npm run dev`）の動画の棚のページにある「区間の記録」で、再生しながら記録できます。記録した内容は項目のJSONとしてコピーできます（[video-shelf.md](video-shelf.md#手動登録を楽にする方法)）。

### 再生プリセット（`presets.json`）

```json
[
  {
    "id": "die-gest-endless",
    "name": "Dieジェスト集エンドレス",
    "nameEn": "Die-gest Endless",
    "order": 0,
    "queue": "playlist-die-gest",
    "playOrder": "shuffle",
    "repeat": true
  }
]
```

- 1つの棚を、決めた再生方法で流すボタンです。動画の棚のページの再生ステージの上に並び、`?preset=<id>` のURLでも開けます。
- `id` は固定slugです。`name` に日本語名、`nameEn` に英語名を記録します。`order` の小さい順に並びます（省略時は0）。
- `queue` は対象の棚です。`playlist-<プレイリストのid>`、`picks`（おすすめ）、`<チャンネルのid>-uploads` / `-archives` / `-shorts`（チャンネルの新着の各棚）、`owner-works`（管理人の代表作）を指定できます。存在しない棚を指定するとビルドが失敗します。
- `playOrder` は `ordered`（棚の順、省略時）か `shuffle`（ランダム）、`repeat` は最後まで再生したら繰り返すか（省略時は `false`）です。
- 複数の棚をまとめたプリセットは作れません（APIで取得した棚をまたいで混ぜないため）。

### チャンネルの新着（自動取得）

`YOUTUBE_API_KEY` が設定されている場合、`channels.json` の有効なチャンネルについて、YouTubeの「動画」「Shorts」「ライブ」の種類ごとに直近最大100本（`uploadsPerKind` で変更可）と、`videoKinds` に登録した動画をビルド時に取得します。チャンネル内では「投稿動画」「配信アーカイブ・プレミア」「Shorts」に分け、各棚の5本目以降は「過去の動画を見る」で12本ずつ展開します。表示できる動画がない棚は見出しやリンクごと省略します。取得したデータはGitに保存しません。

`videos.json` には、チャンネルをまたいで並べたい動画を「おすすめ」として手動で登録します。管理人のチャンネルを指定するとビルドが失敗します。管理人コーナーの「代表作」は視聴回数の多い順に上位5本が自動で選ばれます。 [動画の棚の設計](video-shelf.md)

チャンネルIDや動画IDは推測で作成しません。公開動画のうち、埋め込みが許可されているものを登録します。追加・変更後は `npm run verify` を実行します。
