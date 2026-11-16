/**
 * YouTube Data API v3 から、登録チャンネルの新着（公開アップロード）を取得する。
 * ビルド時のコンテンツローダーからのみ呼び出し、結果はGitに保存しない（API Dataの30日ルールのため）。
 * 規約（III.E.2）に合わせ、取得結果はチャンネルごとに分けて返し、チャンネルをまたいで統合しない。
 */
import { z } from 'astro/zod';

import { VIDEO_ID_PATTERN } from './videoShelf';

const API_BASE_URL = 'https://www.googleapis.com/youtube/v3/';
/** 1チャンネルあたりに取得する新着の件数（`playlistItems.list` の maxResults、上限50）。 */
export const UPLOADS_PER_CHANNEL = 12;
/** `id` に複数指定できる上限。 */
const MAX_IDS_PER_REQUEST = 50;
const REQUEST_TIMEOUT_MS = 10_000;

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export interface UploadsChannel {
  /** 設定内のslug */
  id: string;
  channelId: string;
}

export interface UploadVideo {
  id: string;
  title: string;
  /** ISO 8601 */
  publishedAt: string;
  thumbnailUrl?: string;
}

export interface ChannelUploads {
  channel: string;
  status: 'ok' | 'error';
  /** ISO 8601 */
  fetchedAt: string;
  videos: UploadVideo[];
}

// APIの応答は使う項目だけを検証する。
const channelsResponse = z.object({
  items: z
    .array(
      z.object({
        id: z.string(),
        contentDetails: z.object({ relatedPlaylists: z.object({ uploads: z.string() }) }),
      }),
    )
    .default([]),
});

const playlistItemsResponse = z.object({
  items: z.array(z.object({ contentDetails: z.object({ videoId: z.string() }) })).default([]),
});

const apiVideo = z.object({
  id: z.string(),
  snippet: z.object({
    title: z.string(),
    publishedAt: z.string(),
    channelId: z.string(),
    liveBroadcastContent: z.string().optional(),
    thumbnails: z.record(z.string(), z.object({ url: z.string() })).optional(),
  }),
  status: z.object({
    privacyStatus: z.string(),
    embeddable: z.boolean().optional(),
    madeForKids: z.boolean().optional(),
  }),
});
export type ApiVideo = z.infer<typeof apiVideo>;

const videosResponse = z.object({ items: z.array(apiVideo).default([]) });

/** 応答にAPIキーを含めないよう、エンドポイント名とHTTPステータスだけを持つ。 */
export class YouTubeApiError extends Error {
  constructor(endpoint: string, detail: string) {
    super(`YouTube Data API (${endpoint}) の取得に失敗しました: ${detail}`);
    this.name = 'YouTubeApiError';
  }
}

/**
 * サイト内で再生できる動画だけを残す。
 * 非公開・限定公開・埋め込み不可・子ども向け（Made for Kids）・配信中/配信予定は除外する。
 */
export function isPlayable(video: ApiVideo): boolean {
  return (
    VIDEO_ID_PATTERN.test(video.id) &&
    video.status.privacyStatus === 'public' &&
    video.status.embeddable !== false &&
    video.status.madeForKids !== true &&
    !['live', 'upcoming'].includes(video.snippet.liveBroadcastContent ?? 'none') &&
    !Number.isNaN(Date.parse(video.snippet.publishedAt))
  );
}

/** サムネイルはAPIが返したYouTubeの画像URLのみを使う。 */
function pickThumbnail(video: ApiVideo): string | undefined {
  const url = video.snippet.thumbnails?.medium?.url;
  if (!url) return undefined;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' && parsed.hostname === 'i.ytimg.com' ? url : undefined;
  } catch {
    return undefined;
  }
}

export function toUploadVideo(video: ApiVideo): UploadVideo {
  const thumbnailUrl = pickThumbnail(video);
  return {
    id: video.id,
    // タイトルは改変せずに表示する。
    title: video.snippet.title,
    publishedAt: new Date(video.snippet.publishedAt).toISOString(),
    ...(thumbnailUrl ? { thumbnailUrl } : {}),
  };
}

export function chunk<T>(items: readonly T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

function createClient(apiKey: string, fetchFn: FetchLike) {
  return async function request<T>(
    endpoint: string,
    params: Record<string, string>,
    schema: z.ZodType<T>,
  ): Promise<T> {
    const url = new URL(endpoint, API_BASE_URL);
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
    url.searchParams.set('key', apiKey);

    let response: Response;
    try {
      response = await fetchFn(url.toString(), {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (error) {
      throw new YouTubeApiError(endpoint, error instanceof Error ? error.name : 'network error');
    }
    if (!response.ok) throw new YouTubeApiError(endpoint, `HTTP ${response.status}`);

    const parsed = schema.safeParse(await response.json().catch(() => undefined));
    if (!parsed.success) throw new YouTubeApiError(endpoint, '想定外の応答形式');
    return parsed.data;
  };
}

/**
 * 各チャンネルの新着を取得する。外部サービスの障害でビルドを止めないよう例外は投げず、
 * 取得できなかったチャンネルは `status: 'error'` として返す。
 *
 * 使用量の目安：channels.list 1 + playlistItems.list（チャンネル数）+ videos.list（50件ごとに1）ユニット。
 */
export async function fetchChannelUploads(
  channels: readonly UploadsChannel[],
  apiKey: string,
  fetchFn: FetchLike = fetch,
  now: Date = new Date(),
): Promise<ChannelUploads[]> {
  const fetchedAt = now.toISOString();
  const failed = (channel: UploadsChannel): ChannelUploads => ({
    channel: channel.id,
    status: 'error',
    fetchedAt,
    videos: [],
  });
  if (channels.length === 0) return [];

  const request = createClient(apiKey, fetchFn);

  // 1. チャンネルのアップロード再生リストIDを取得する（公式に文書化された取得方法）。
  const uploadsPlaylists = new Map<string, string>();
  try {
    for (const ids of chunk(
      channels.map((channel) => channel.channelId),
      MAX_IDS_PER_REQUEST,
    )) {
      const result = await request(
        'channels',
        { part: 'contentDetails', id: ids.join(','), maxResults: String(MAX_IDS_PER_REQUEST) },
        channelsResponse,
      );
      for (const item of result.items) {
        uploadsPlaylists.set(item.id, item.contentDetails.relatedPlaylists.uploads);
      }
    }
  } catch {
    return channels.map(failed);
  }

  // 2. チャンネルごとに新着の動画IDを取得する。
  const videoIdsByChannel = new Map<string, string[]>();
  for (const channel of channels) {
    const playlistId = uploadsPlaylists.get(channel.channelId);
    if (!playlistId) continue;
    try {
      const result = await request(
        'playlistItems',
        { part: 'contentDetails', playlistId, maxResults: String(UPLOADS_PER_CHANNEL) },
        playlistItemsResponse,
      );
      videoIdsByChannel.set(
        channel.id,
        result.items.map((item) => item.contentDetails.videoId),
      );
    } catch {
      // このチャンネルだけを取得失敗として扱う。
    }
  }

  // 3. 動画の詳細（タイトル・公開状態・埋め込み可否など）をまとめて取得する。
  //    削除・非公開になった動画は応答に含まれないため、自然に除外される。
  const details = new Map<string, ApiVideo>();
  try {
    for (const ids of chunk([...new Set([...videoIdsByChannel.values()].flat())], 50)) {
      const result = await request(
        'videos',
        { part: 'snippet,status', id: ids.join(','), maxResults: String(MAX_IDS_PER_REQUEST) },
        videosResponse,
      );
      for (const item of result.items) details.set(item.id, item);
    }
  } catch {
    return channels.map(failed);
  }

  return channels.map((channel) => {
    const ids = videoIdsByChannel.get(channel.id);
    if (!ids) return failed(channel);
    const videos = ids
      .map((id) => details.get(id))
      .filter(
        (video): video is ApiVideo =>
          video !== undefined && video.snippet.channelId === channel.channelId && isPlayable(video),
      )
      .map(toUploadVideo)
      .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
    return { channel: channel.id, status: 'ok', fetchedAt, videos };
  });
}
