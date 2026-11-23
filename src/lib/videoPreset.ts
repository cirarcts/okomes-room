/**
 * 動画の棚の再生プリセット（presets.json）。
 * プリセットは「どの棚を・どの順で・繰り返すか」の組み合わせで、1つの棚だけを対象にする
 * （APIで取得した棚をまたいで混ぜない。規約 III.E.2）。
 * 棚の代わりにタグを指定すると、そのタグを持つプレイリストの項目を、プレイリストをまたいで集めて再生する
 * （タグはプレイリストの項目にだけあり、すべて手動で記入したデータのため集約にはあたらない）。
 * ページでは `?preset=<id>` のリンクとして並べ、URLから開いた場合は再生の準備だけをする。
 */
import { tagKey } from './videoPlaylist';
import type { PlayOrder } from './videoQueue';

/** プリセットを指定するURLのパラメータ名。 */
export const PRESET_PARAM = 'preset';

/** チャンネルの新着を分ける棚（ChannelShelfRows）。キューの識別子は `<チャンネルのid>-<棚>`。 */
export const CHANNEL_SHELF_ROWS = ['uploads', 'archives', 'shorts'] as const;
export type ChannelShelfRow = (typeof CHANNEL_SHELF_ROWS)[number];

export function channelRowQueueId(channelId: string, row: ChannelShelfRow): string {
  return `${channelId}-${row}`;
}

export function playlistQueueId(playlistId: string): string {
  return `playlist-${playlistId}`;
}

export interface PresetInput {
  id: string;
  name: string;
  nameEn: string;
  order: number;
  /** 対象の棚のキューの識別子（例：`playlist-die-gest`、`picks`、`tirunitora-uploads`）。`tag` とどちらか一方 */
  queue?: string;
  /** 対象のタグ（プレイリストの項目の `tags`）。`queue` とどちらか一方 */
  tag?: string;
  playOrder: PlayOrder;
  repeat: boolean;
}

/**
 * プリセットの対象の棚・タグが存在するかを確かめ、並び順に揃える。
 * 存在しない棚・タグ、棚とタグの両方（またはどちらも）の指定、idの重複はデータの誤りとしてビルドを止める。
 * @param knownQueueIds ページに並びうる棚のキューの識別子
 * @param knownTagKeys 表示するプレイリストの項目のタグ（`tagKey` の値）
 */
export function validatePresets<T extends PresetInput>(
  presets: readonly T[],
  knownQueueIds: ReadonlySet<string>,
  knownTagKeys: ReadonlySet<string> = new Set(),
): T[] {
  const seen = new Set<string>();
  for (const preset of presets) {
    if (seen.has(preset.id)) {
      throw new Error(`プリセットのid "${preset.id}" が重複しています。`);
    }
    seen.add(preset.id);
    if ((preset.queue === undefined) === (preset.tag === undefined)) {
      throw new Error(
        `プリセット "${preset.id}" には queue か tag のどちらか一方を指定してください。`,
      );
    }
    if (preset.queue !== undefined && !knownQueueIds.has(preset.queue)) {
      throw new Error(
        `プリセット "${preset.id}" の棚 "${preset.queue}" はありません。` +
          `指定できる棚: ${[...knownQueueIds].sort().join(', ')}`,
      );
    }
    if (preset.tag !== undefined && !knownTagKeys.has(tagKey(preset.tag))) {
      throw new Error(
        `プリセット "${preset.id}" のタグ "${preset.tag}" を持つプレイリストの項目はありません。`,
      );
    }
  }
  return [...presets].sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
}

const PRESET_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** URLの検索部分からプリセットのidを取り出す。形式が正しくなければ `undefined`。 */
export function presetIdFromSearch(search: string): string | undefined {
  const id = new URLSearchParams(search).get(PRESET_PARAM) ?? '';
  return PRESET_ID_PATTERN.test(id) ? id : undefined;
}
