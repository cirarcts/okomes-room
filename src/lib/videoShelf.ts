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

export interface ShelfVideo {
  /** YouTubeの動画ID */
  id: string;
  /** 公開元チャンネルのslug */
  channel: string;
  title: string;
  publishedAt: Date;
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
