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
  category?: string;
  enabled: boolean;
}

/**
 * 公式データで判定できる範囲の動画の種別。
 * - `live`：配信のアーカイブ、またはプレミア公開（`liveStreamingDetails` があるもの。両者は区別できない）
 * - `short`：3分以下の動画（YouTube Shortsは公式APIで判定できないため、長さだけで分ける）
 * - `regular`：それ以外
 */
export const VIDEO_KINDS = ['regular', 'short', 'live'] as const;
export type VideoKind = (typeof VIDEO_KINDS)[number];

/** 「短い動画」とみなす長さの上限（秒）。現在のShortsの上限に合わせる。 */
export const SHORT_VIDEO_MAX_SECONDS = 180;

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

export function classifyVideo(options: {
  durationSeconds?: number;
  hasLiveStreamingDetails: boolean;
}): VideoKind {
  if (options.hasLiveStreamingDetails) return 'live';
  const { durationSeconds } = options;
  if (durationSeconds !== undefined && durationSeconds > 0) {
    return durationSeconds <= SHORT_VIDEO_MAX_SECONDS ? 'short' : 'regular';
  }
  return 'regular';
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
}

/**
 * 動画が絞り込み条件に一致するかを判定する。
 * @param searchText `normalizeSearchText` 済みのタイトルとチャンネル名
 * @param kind 種別。未取得の場合は種別を指定した絞り込みには一致しない
 */
export function matchesVideoFilter(
  searchText: string,
  kind: VideoKind | undefined,
  filter: VideoFilter,
): boolean {
  if (filter.kind !== 'all' && kind !== filter.kind) return false;
  return filter.terms.every((term) => searchText.includes(term));
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

export function youtubeWatchUrl(videoId: string): string {
  return `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`;
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
