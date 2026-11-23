/**
 * 動画の棚（Video Shelf）の表示用ロジック。
 * データの取得元（現在は手動管理のJSON）に依存しないよう、素のオブジェクトだけを扱う。
 */

/** YouTubeの動画ID（11文字）。 */
export const VIDEO_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;
/** YouTubeのチャンネルID（`UC` + 22文字）。 */
export const CHANNEL_ID_PATTERN = /^UC[A-Za-z0-9_-]{22}$/;

/** プライバシー強化モードの埋め込みURL。再生ボタンが押されるまで読み込まない。 */
export const EMBED_BASE_URL = 'https://www.youtube-nocookie.com/embed/';

export interface ShelfChannel {
  /** 設定ファイル内での固定slug */
  id: string;
  channelId: string;
  name: string;
  /** カテゴリの id */
  categories: string[];
  /** 大きいほど上に並べる */
  priority: number;
  /** 管理人自身のチャンネル */
  owner: boolean;
  enabled: boolean;
}

export interface ShelfCategory {
  id: string;
  name: string;
  nameEn: string;
  order: number;
}

/**
 * チャンネル設定とカテゴリ定義の整合性を確かめる。誤りがあればビルドを止める。
 * - 未定義のカテゴリを参照していないこと
 * - 管理人のチャンネルが1つまでであること
 */
export function validateShelfConfig(
  channels: readonly ShelfChannel[],
  categories: readonly ShelfCategory[],
): void {
  const categoryIds = new Set(categories.map((category) => category.id));
  for (const channel of channels) {
    const unknown = channel.categories.filter((id) => !categoryIds.has(id));
    if (unknown.length > 0) {
      throw new Error(
        `チャンネル "${channel.id}" が未定義のカテゴリを参照しています: ${unknown.join(', ')}`,
      );
    }
  }
  const owners = channels.filter((channel) => channel.owner);
  if (owners.length > 1) {
    throw new Error(
      `管理人のチャンネル（owner: true）は1つまでです: ${owners.map((c) => c.id).join(', ')}`,
    );
  }
}

/** 優先度の高い順、同じ優先度なら名前順に並べる（元の配列は変更しない）。 */
export function sortChannels<T extends Pick<ShelfChannel, 'priority' | 'name'>>(
  channels: readonly T[],
): T[] {
  return [...channels].sort(
    (a, b) => b.priority - a.priority || a.name.localeCompare(b.name, 'ja'),
  );
}

/** 表示順（`order` の小さい順）に並べる。 */
export function sortCategories<T extends Pick<ShelfCategory, 'order' | 'id'>>(
  categories: readonly T[],
): T[] {
  return [...categories].sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
}

/**
 * 動画の種別。YouTubeの種類別の再生リスト（動画・ショート・ライブ）で分類する。
 * - `shorts`：YouTube Shorts
 * - `live`：配信のアーカイブ。種類別に取得できなかった場合はプレミア公開も含む
 * - `regular`：それ以外の投稿動画
 */
export const VIDEO_KINDS = ['regular', 'live', 'shorts'] as const;
export type VideoKind = (typeof VIDEO_KINDS)[number];

export interface ShelfVideo {
  /** YouTubeの動画ID */
  id: string;
  /** 公開元チャンネルのslug */
  channel: string;
  title: string;
  publishedAt: Date;
  /** 種別。手動で登録した動画では省略でき、その場合は「未取得」として扱う。 */
  kind?: VideoKind;
}

/**
 * ISO 8601の期間（YouTube Data APIの `contentDetails.duration`、例：`PT1M30S`）を秒に変換する。
 * 解釈できない場合は `undefined` を返す。
 */
export function parseIsoDuration(value: string): number | undefined {
  const match = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(value);
  if (!match || value === 'P' || value.endsWith('T')) return undefined;
  const [, days = '0', hours = '0', minutes = '0', seconds = '0'] = match;
  return ((Number(days) * 24 + Number(hours)) * 60 + Number(minutes)) * 60 + Number(seconds);
}

/** 検索用に表記ゆれ（全角・半角、大文字・小文字）をそろえる。 */
export function normalizeSearchText(value: string): string {
  return value.normalize('NFKC').toLowerCase();
}

/** 検索語を空白で区切る。すべての語を含むものだけを一致とする。 */
export function parseSearchTerms(query: string): string[] {
  return normalizeSearchText(query).trim().split(/\s+/).filter(Boolean);
}

export interface VideoFilter {
  terms: readonly string[];
  /** `all` はすべての種別（種別未取得を含む） */
  kind: VideoKind | 'all';
  /** カテゴリの id。`all` はすべてのカテゴリ */
  category: string;
  /** プレイリストの項目のタグ（`normalizeSearchText` 済み）。省略時はタグで絞り込まない */
  tag?: string;
}

export interface FilterTarget {
  /** `normalizeSearchText` 済みのタイトルとチャンネル名 */
  searchText: string;
  /** 種別。未取得の場合は種別を指定した絞り込みには一致しない */
  kind?: VideoKind;
  /** 公開元チャンネルのカテゴリ */
  categories: readonly string[];
  /** プレイリストの項目のタグ（`normalizeSearchText` 済み）。タグのない動画は空 */
  tags?: readonly string[];
}

/** 何らかの絞り込み条件が指定されているか。 */
export function isFilterActive(filter: VideoFilter): boolean {
  return (
    filter.terms.length > 0 ||
    filter.kind !== 'all' ||
    filter.category !== 'all' ||
    filter.tag !== undefined
  );
}

/** 動画が絞り込み条件に一致するかを判定する。 */
export function matchesVideoFilter(target: FilterTarget, filter: VideoFilter): boolean {
  if (filter.kind !== 'all' && target.kind !== filter.kind) return false;
  if (filter.category !== 'all' && !target.categories.includes(filter.category)) return false;
  if (filter.tag !== undefined && !target.tags?.includes(filter.tag)) return false;
  return filter.terms.every((term) => target.searchText.includes(term));
}

export interface ShelfItem extends ShelfVideo {
  channelData: ShelfChannel;
}

/**
 * 有効なチャンネルの動画だけを、公開日の新しい順に並べる。
 * 存在しないチャンネルを参照した動画はデータの誤りとしてビルドを止める。
 */
export function buildShelf(
  channels: readonly ShelfChannel[],
  videos: readonly ShelfVideo[],
): ShelfItem[] {
  const channelMap = new Map(channels.map((channel) => [channel.id, channel]));
  const seen = new Set<string>();
  const items: ShelfItem[] = [];

  for (const video of videos) {
    const channelData = channelMap.get(video.channel);
    if (!channelData) {
      throw new Error(
        `動画 ${video.id} が未登録のチャンネル "${video.channel}" を参照しています。`,
      );
    }
    if (!channelData.enabled || seen.has(video.id)) continue;
    seen.add(video.id);
    items.push({ ...video, channelData });
  }

  return items.sort(
    (a, b) =>
      b.publishedAt.getTime() - a.publishedAt.getTime() || a.title.localeCompare(b.title, 'ja'),
  );
}

export function youtubeWatchUrl(videoId: string, startSeconds?: number): string {
  const url = `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`;
  return startSeconds ? `${url}&t=${startSeconds}s` : url;
}

/** 棚に最初から並べる本数。 */
export const SHELF_INITIAL_COUNT = 4;
/** 「過去の動画を見る」1回で追加する本数。 */
export const SHELF_STEP = 12;

/**
 * 「過去の動画を見る」を押した後に棚へ並べる本数を返す。
 * 残りがあれば `step` 本ずつ増やし、すべて並べた後に押された場合は最初の本数に戻す。
 */
export function nextShelfCount(
  visible: number,
  total: number,
  initial: number,
  step: number = SHELF_STEP,
): number {
  return visible >= total ? Math.min(initial, total) : Math.min(visible + step, total);
}

export function youtubeChannelUrl(channelId: string): string {
  return `https://www.youtube.com/channel/${encodeURIComponent(channelId)}`;
}

/** `mqdefault` は16:9（320×180）、`hqdefault` は4:3（480×360、上下に帯あり）。 */
export function youtubeThumbnailUrl(videoId: string, size: 'mqdefault' | 'hqdefault'): string {
  return `https://i.ytimg.com/vi/${encodeURIComponent(videoId)}/${size}.jpg`;
}

/** 秒数を `m:ss` または `h:mm:ss` で表す（YouTubeの表示に合わせる）。 */
export function formatDuration(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const ss = String(seconds).padStart(2, '0');
  return hours > 0 ? `${hours}:${String(minutes).padStart(2, '0')}:${ss}` : `${minutes}:${ss}`;
}

/** 視聴回数を短く表す（例：ja「1.2万」、en「1.2K」）。 */
export function formatViewCount(count: number, locale: string): string {
  return new Intl.NumberFormat(locale, { notation: 'compact', maximumFractionDigits: 1 }).format(
    count,
  );
}
