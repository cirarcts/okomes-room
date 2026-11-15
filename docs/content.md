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
- エフェクトの各パラメータは `label` と `value` を持ちます。数値（0を含む）には必要に応じて `unit` を付けます。選択肢・文字列は文字列で、ON/OFFは真偽値で記録します。`value: null` は未設定、`parameters` の省略はパラメータ未取得、空配列は設定項目なしを表します。

実際のRigを追加する際は、公開する項目を実機またはRig Managerで確認して記入します。JSONの追加・変更後は `npm run verify` を実行します。

### Rig Managerとの照合

Gundy - Brown Soundは、Rig Manager 4.3.13 / PROFILER OS 14.2.2の表示と既存のキャプチャで確認した。記録対象はAmplifier、Cabinet、前後4スロットずつのエフェクト、Rig Volume。値は画面上の単位と精度を保持する（例：`24 ms`、`27.0 Hz`、`+90°`、`2.410 s`、`<0.0>`）。Input・Outputの設定、Morphの別状態、ロックやUI Modeなどのエディター操作は公開データに含めていない。名前だけを記録した既存Rigは、取得していない設定を補完せずに表示する。
