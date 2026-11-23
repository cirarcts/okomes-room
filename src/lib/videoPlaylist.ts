/**
 * 動画の棚の手動プレイリスト（Phase 5.4）。
 * 動画ID・タイトル・区間はすべて手動で登録したデータで、YouTube APIのデータは結び付けない
 * （チャンネルをまたいで並べても、規約 III.E.2 の API Data の集約にあたらないようにするため）。
 * DOMに依存しない純粋関数だけを置く。
 */
import { formatDuration, type ShelfChannel } from './videoShelf';

/** 区間の時刻の書式（`ss`、`m:ss`、`h:mm:ss`）。 */
export const TIMESTAMP_PATTERN = /^(?:\d+|\d+:[0-5]\d|\d+:[0-5]\d:[0-5]\d)$/;

/** `12:30` や `1:05:10` を秒に変換する。書式が正しくない場合は `undefined`。 */
export function parseTimestamp(value: string): number | undefined {
  if (!TIMESTAMP_PATTERN.test(value)) return undefined;
  return value.split(':').reduce((total, part) => total * 60 + Number(part), 0);
}

/** プレイリストの1項目（`playlists.json` の値）。 */
export interface PlaylistItemInput {
  /** YouTubeの動画ID */
  video: string;
  /** 公開元チャンネルのslug（`channels.json` の `id`） */
  channel: string;
  /** YouTube上のタイトル（改変しない） */
  title: string;
  /** 区間の開始（省略時は動画の最初から） */
  start?: string;
  /** 区間の終了（省略時は動画の最後まで） */
  end?: string;
  /** 自分用のメモ（例：「好きな話題」）。タイトルとは別に表示する */
  note?: string;
  /** ランダム再生の重み（1〜10、省略時は1）。大きいほど周の前のほうに来やすい */
  weight?: number;
}

export interface PlaylistInput {
  id: string;
  name: string;
  nameEn: string;
  order: number;
  items: readonly PlaylistItemInput[];
}

export interface PlaylistItem {
  /** キューの中で項目を区別するキー（同じ動画の別の区間を別の項目として扱う） */
  key: string;
  videoId: string;
  title: string;
  note?: string;
  /** 開始（秒）。動画の最初からなら `undefined` */
  startSeconds?: number;
  /** 終了（秒）。動画の最後までなら `undefined` */
  endSeconds?: number;
  /** ランダム再生の重み */
  weight: number;
  channelData: ShelfChannel;
}

export interface Playlist {
  id: string;
  name: string;
  nameEn: string;
  order: number;
  items: PlaylistItem[];
}

/** キューで使う項目のキー。区間のない項目は動画IDそのもの（ほかの棚のカードと同じ扱い）。 */
export function playlistItemKey(
  videoId: string,
  startSeconds: number | undefined,
  endSeconds: number | undefined,
): string {
  return startSeconds === undefined && endSeconds === undefined
    ? videoId
    : `${videoId}@${startSeconds ?? 0}-${endSeconds ?? ''}`;
}

/** 区間がある（動画の一部だけを再生する）か。 */
export function isSegment(item: Pick<PlaylistItem, 'startSeconds' | 'endSeconds'>): boolean {
  return item.startSeconds !== undefined || item.endSeconds !== undefined;
}

/** 区間の表示（例：`12:30〜18:45`、`1:05:10〜`）。全編なら `undefined`。 */
export function formatSegment(
  item: Pick<PlaylistItem, 'startSeconds' | 'endSeconds'>,
): string | undefined {
  if (!isSegment(item)) return undefined;
  const start = formatDuration(item.startSeconds ?? 0);
  const end = item.endSeconds === undefined ? '' : formatDuration(item.endSeconds);
  return `${start}〜${end}`;
}

function parseBound(value: string | undefined, label: string): number | undefined {
  if (value === undefined) return undefined;
  const seconds = parseTimestamp(value);
  if (seconds === undefined) {
    throw new Error(`${label} "${value}" は ss・m:ss・h:mm:ss のいずれかで指定してください。`);
  }
  return seconds;
}

/**
 * プレイリストの項目にチャンネルの設定を結び付け、区間を秒に変換する。
 * - 未登録のチャンネル、正しくない区間、同じ項目の重複はデータの誤りとしてビルドを止める。
 * - 無効なチャンネル（`enabled: false`）の項目は表示しない。
 */
export function buildPlaylist(
  playlist: PlaylistInput,
  channels: readonly ShelfChannel[],
): Playlist {
  const channelMap = new Map(channels.map((channel) => [channel.id, channel]));
  const seen = new Set<string>();
  const items: PlaylistItem[] = [];

  playlist.items.forEach((input, index) => {
    const where = `プレイリスト "${playlist.id}" の${index + 1}番目（${input.video}）`;
    const channelData = channelMap.get(input.channel);
    if (!channelData) {
      throw new Error(`${where}が未登録のチャンネル "${input.channel}" を参照しています。`);
    }
    const startSeconds = parseBound(input.start, `${where}の開始`);
    const endSeconds = parseBound(input.end, `${where}の終了`);
    if (endSeconds !== undefined && endSeconds <= (startSeconds ?? 0)) {
      throw new Error(`${where}の終了は開始より後にしてください。`);
    }
    // 0秒から始まる区間は、開始の指定がないものとして扱う。
    const start = startSeconds === 0 ? undefined : startSeconds;
    const key = playlistItemKey(input.video, start, endSeconds);
    if (seen.has(key)) throw new Error(`${where}は同じプレイリストに重複しています。`);
    seen.add(key);
    if (!channelData.enabled) return;
    items.push({
      key,
      videoId: input.video,
      title: input.title,
      note: input.note,
      startSeconds: start,
      endSeconds,
      weight: input.weight ?? 1,
      channelData,
    });
  });

  return {
    id: playlist.id,
    name: playlist.name,
    nameEn: playlist.nameEn,
    order: playlist.order,
    items,
  };
}

/** プレイリストを `order` の小さい順、同じなら `id` 順に並べる。 */
export function sortPlaylists<T extends Pick<Playlist, 'order' | 'id'>>(
  playlists: readonly T[],
): T[] {
  return [...playlists].sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
}
