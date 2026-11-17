/**
 * YouTube Data API v3 から、登録チャンネルの新着（公開アップロード）を取得する。
 * ビルド時のコンテンツローダーからのみ呼び出し、結果はGitに保存しない（API Dataの30日ルールのため）。
 * 規約（III.E.2）に合わせ、取得結果はチャンネルごとに分けて返し、チャンネルをまたいで統合しない。
 */
import { z } from 'astro/zod';

import { VIDEO_ID_PATTERN, parseIsoDuration, type VideoKind } from './videoShelf';

const API_BASE_URL = 'https://www.googleapis.com/youtube/v3/';
/** 1チャンネルあたりに取得する直近のアップロード候補数。 */
const UPLOADS_PER_CHANNEL = 50;
/** `id` に複数指定できる上限。 */
const MAX_IDS_PER_REQUEST = 50;
/** 管理人チャンネルの代表作として表示する、視聴回数の上位の件数。 */
export const POPULAR_COUNT = 5;
/** 管理人チャンネルの全動画を取得するときのページ数の上限（50件 × 20ページ = 1,000件）。 */
const MAX_OWNER_PAGES = 20;
const REQUEST_TIMEOUT_MS = 10_000;

/**
 * YouTubeの「動画」「ショート」「ライブ」タブと同じ中身を返す、種類別の再生リスト。
 * チャンネルID（`UC…`）の先頭2文字を置き換えるとその再生リストのIDになる。
 * 公式には文書化されていないため、使えない場合はアップロード再生リスト（`UU…`）と公式データからの推定に戻す。
 */
const KIND_PLAYLISTS = [
  { prefix: 'UULF', kind: 'regular' },
  { prefix: 'UUSH', kind: 'shorts' },
  { prefix: 'UULV', kind: 'live' },
] as const;
/** 種類別の再生リストで確認できた、YouTube上の分類。 */
export type PlaylistKind = (typeof KIND_PLAYLISTS)[number]['kind'];

export function kindPlaylistId(channelId: string, prefix: string): string {
  return `${prefix}${channelId.slice(2)}`;
}

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export interface UploadsChannel {
  /** 設定内のslug */
  id: string;
  channelId: string;
  /** 管理人のチャンネル。全動画を取得し、視聴回数の上位を代表作として返す。 */
  owner?: boolean;
  /** YouTubeで確認した種類。直近の取得範囲外でも動画の詳細を取得する。 */
  videoKinds?: Readonly<Partial<Record<string, VideoKind>>>;
}

export interface UploadVideo {
  id: string;
  title: string;
  /** ISO 8601 */
  publishedAt: string;
  thumbnailUrl?: string;
  kind: VideoKind;
  durationSeconds?: number;
  /** 視聴回数（代表作のみ）。統計情報のため、ビルドごとに取り直す（30日を超えて保存しない）。 */
  viewCount?: number;
}

export interface ChannelUploads {
  channel: string;
  status: 'ok' | 'error';
  /** ISO 8601 */
  fetchedAt: string;
  /** 新着（公開日の新しい順）。種類別に取得できた場合は、種類ごとに直近の動画を含む。 */
  videos: UploadVideo[];
  /** 視聴回数の多い順の代表作（管理人のチャンネルのみ） */
  popular?: UploadVideo[];
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
  nextPageToken: z.string().optional(),
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
  contentDetails: z.object({ duration: z.string().optional() }).optional(),
  // 配信のアーカイブとプレミア公開にだけ含まれる。中身は使わず、有無だけで判定する。
  liveStreamingDetails: z.object({}).optional(),
  // 視聴回数は文字列で返る。非表示にされている場合は含まれない。
  statistics: z.object({ viewCount: z.string().regex(/^\d+$/).optional() }).optional(),
});
export type ApiVideo = z.infer<typeof apiVideo>;

const videosResponse = z.object({ items: z.array(apiVideo).default([]) });

/** 応答にAPIキーを含めないよう、エンドポイント名とHTTPステータスだけを持つ。 */
export class YouTubeApiError extends Error {
  /** HTTPステータス（応答を受け取れた場合のみ） */
  readonly status?: number;

  constructor(endpoint: string, detail: string, status?: number) {
    super(`YouTube Data API (${endpoint}) の取得に失敗しました: ${detail}`);
    this.name = 'YouTubeApiError';
    this.status = status;
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

/**
 * 種別を決める。種類別の再生リストで確認できた分類があれば、それをそのまま使う
 * （「動画」タブのプレミア公開作品は `liveStreamingDetails` を持つが、配信として扱わない）。
 * 確認できない場合は、公式データの `liveStreamingDetails` の有無だけで分ける。
 */
function resolveKind(video: ApiVideo, playlistKind: PlaylistKind | undefined): VideoKind {
  return playlistKind ?? (video.liveStreamingDetails !== undefined ? 'live' : 'regular');
}

export function toUploadVideo(video: ApiVideo, playlistKind?: PlaylistKind): UploadVideo {
  const thumbnailUrl = pickThumbnail(video);
  const duration = video.contentDetails?.duration;
  const durationSeconds = duration ? parseIsoDuration(duration) : undefined;
  return {
    id: video.id,
    // タイトルは改変せずに表示する。
    title: video.snippet.title,
    publishedAt: new Date(video.snippet.publishedAt).toISOString(),
    ...(thumbnailUrl ? { thumbnailUrl } : {}),
    kind: resolveKind(video, playlistKind),
    ...(durationSeconds !== undefined ? { durationSeconds } : {}),
  };
}

/** 視聴回数を数値で返す。取得できない場合は `undefined`。 */
export function viewCountOf(video: ApiVideo): number | undefined {
  const value = video.statistics?.viewCount;
  return value === undefined ? undefined : Number(value);
}

/** 視聴回数の多い順に上位を選ぶ（視聴回数が不明な動画は除く）。同数なら新しい順。 */
export function pickPopular(
  videos: readonly ApiVideo[],
  count: number,
  convert: (video: ApiVideo) => UploadVideo = (video) => toUploadVideo(video),
): UploadVideo[] {
  return videos
    .flatMap((video) => {
      const viewCount = viewCountOf(video);
      return viewCount === undefined ? [] : [{ ...convert(video), viewCount }];
    })
    .sort((a, b) => b.viewCount - a.viewCount || b.publishedAt.localeCompare(a.publishedAt))
    .slice(0, count);
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
    if (!response.ok) {
      throw new YouTubeApiError(endpoint, `HTTP ${response.status}`, response.status);
    }

    const parsed = schema.safeParse(await response.json().catch(() => undefined));
    if (!parsed.success) throw new YouTubeApiError(endpoint, '想定外の応答形式');
    return parsed.data;
  };
}

/**
 * 各チャンネルの新着を取得する。外部サービスの障害でビルドを止めないよう例外は投げず、
 * 取得できなかったチャンネルは `status: 'error'` として返す。
 *
 * 使用量の目安：channels.list 1 + playlistItems.list（チャンネル数 × 3種類）+ videos.list（50件ごとに1）ユニット。
 * 種類別に取得できなかったチャンネルは、アップロード再生リストの取得で1ユニット増える。
 * 管理人のチャンネルは全動画を50件ずつ取得するため、さらに動画50件ごとに約2ユニット増える。
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

  /** 再生リストの動画IDを、先頭から指定したページ数まで取得する。 */
  const listPlaylistVideoIds = async (playlistId: string, pages: number): Promise<string[]> => {
    const ids: string[] = [];
    let pageToken: string | undefined;
    for (let page = 0; page < pages; page++) {
      const result = await request(
        'playlistItems',
        {
          part: 'contentDetails',
          playlistId,
          maxResults: String(UPLOADS_PER_CHANNEL),
          ...(pageToken ? { pageToken } : {}),
        },
        playlistItemsResponse,
      );
      ids.push(...result.items.map((item) => item.contentDetails.videoId));
      pageToken = result.nextPageToken;
      if (!pageToken) break;
    }
    return ids;
  };

  /**
   * 種類別の再生リストから、動画IDとYouTube上の分類を取得する。
   * 1件も取得できない場合や、取得に失敗した場合は `undefined` を返す（呼び出し側で推定に戻す）。
   */
  const listKindPlaylists = async (
    channelId: string,
    pages: number,
  ): Promise<Map<string, PlaylistKind> | undefined> => {
    const kinds = new Map<string, PlaylistKind>();
    for (const { prefix, kind } of KIND_PLAYLISTS) {
      try {
        for (const id of await listPlaylistVideoIds(kindPlaylistId(channelId, prefix), pages)) {
          if (!kinds.has(id)) kinds.set(id, kind);
        }
      } catch (error) {
        // 該当する動画がない種類の再生リストは存在しない（404）。
        if (error instanceof YouTubeApiError && error.status === 404) continue;
        return undefined;
      }
    }
    return kinds.size > 0 ? kinds : undefined;
  };

  // 2. チャンネルごとに新着の動画IDを取得する。管理人のチャンネルは代表作を選ぶために全動画を取得する。
  const sourcesByChannel = new Map<string, { ids: string[]; kinds?: Map<string, PlaylistKind> }>();
  for (const channel of channels) {
    const playlistId = uploadsPlaylists.get(channel.channelId);
    if (!playlistId) continue;
    const pages = channel.owner ? MAX_OWNER_PAGES : 1;
    try {
      const kinds = await listKindPlaylists(channel.channelId, pages);
      sourcesByChannel.set(
        channel.id,
        kinds
          ? { ids: [...kinds.keys()], kinds }
          : { ids: await listPlaylistVideoIds(playlistId, pages) },
      );
    } catch {
      // このチャンネルだけを取得失敗として扱う。
    }
  }

  // 3. 動画の詳細（タイトル・公開状態・埋め込み可否など）をまとめて取得する。
  //    削除・非公開になった動画は応答に含まれないため、自然に除外される。
  const details = new Map<string, ApiVideo>();
  try {
    const idsToFetch = new Set([
      ...[...sourcesByChannel.values()].flatMap((source) => source.ids),
      ...channels.flatMap((channel) => Object.keys(channel.videoKinds ?? {})),
    ]);
    for (const ids of chunk([...idsToFetch], MAX_IDS_PER_REQUEST)) {
      const result = await request(
        'videos',
        {
          // part を増やしても使用量（1回1ユニット）は変わらない。
          part: 'snippet,status,contentDetails,liveStreamingDetails,statistics',
          id: ids.join(','),
          maxResults: String(MAX_IDS_PER_REQUEST),
        },
        videosResponse,
      );
      for (const item of result.items) details.set(item.id, item);
    }
  } catch {
    return channels.map(failed);
  }

  return channels.map((channel) => {
    const source = sourcesByChannel.get(channel.id);
    if (!source) return failed(channel);
    const { ids, kinds } = source;
    const convert = (video: ApiVideo) => toUploadVideo(video, kinds?.get(video.id));
    const isChannelVideo = (video: ApiVideo | undefined): video is ApiVideo =>
      video !== undefined && video.snippet.channelId === channel.channelId && isPlayable(video);
    const videoKinds = new Map(Object.entries(channel.videoKinds ?? {}));
    const applyKindOverride = (video: UploadVideo): UploadVideo => {
      const kind = videoKinds.get(video.id);
      return kind ? { ...video, kind } : video;
    };
    const playable = Array.from(new Set(ids), (id) => details.get(id)).filter(isChannelVideo);
    const sorted = playable.map(convert).sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
    // 配信の多いチャンネルでも投稿動画やShortsが埋もれないよう、種類ごとに件数を区切る。
    const recent = kinds
      ? KIND_PLAYLISTS.flatMap(({ kind }) =>
          sorted.filter((video) => kinds.get(video.id) === kind).slice(0, UPLOADS_PER_CHANNEL),
        )
      : sorted.slice(0, UPLOADS_PER_CHANNEL);
    const confirmed = Array.from(videoKinds.keys(), (id) => details.get(id))
      .filter(isChannelVideo)
      .map(convert);
    const videos = [...recent.filter((video) => !videoKinds.has(video.id)), ...confirmed]
      .map(applyKindOverride)
      .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
    return {
      channel: channel.id,
      status: 'ok',
      fetchedAt,
      videos,
      // 管理人自身のチャンネル内での並べ替えのため、集約の制限（III.E.2）には当たらない。
      ...(channel.owner
        ? { popular: pickPopular(playable, POPULAR_COUNT, convert).map(applyKindOverride) }
        : {}),
    };
  });
}
