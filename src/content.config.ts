import { defineCollection } from 'astro:content';
import { file, glob, type Loader } from 'astro/loaders';
import { z } from 'astro/zod';

import videoChannelsJson from './content/video-shelf/channels.json';
import { EFFECT_CATEGORIES } from './lib/kemperEffectCategories';
import { CHANNEL_ID_PATTERN, VIDEO_ID_PATTERN, VIDEO_KINDS } from './lib/videoShelf';
import { TIMESTAMP_PATTERN } from './lib/videoPlaylist';
import { MAX_UPLOADS_PER_KIND, fetchChannelUploads } from './lib/youtubeUploads';

const setting = z.object({
  label: z.string().min(1),
  // 小数点以下の桁数や <0.0> など、Rig Managerで見える表記を保つ。
  value: z.string().min(1),
});

const stackModule = z.object({
  name: z.string().min(1),
  settings: z.array(setting).min(1),
});

const effectParameter = z.object({
  label: z.string().min(1),
  // null は未設定。配列を省略した場合はパラメータ未取得。
  value: z.union([z.number(), z.boolean(), z.string().min(1), z.null()]),
  unit: z.string().min(1).optional(),
});

function effectStage<const Slots extends readonly [string, ...string[]]>(slots: Slots) {
  const effect = z.object({
    slot: z.enum(slots),
    name: z.string().min(1).nullable(),
    category: z.enum(EFFECT_CATEGORIES).optional(),
    enabled: z.boolean().optional(),
    parameters: z.array(effectParameter).optional(),
  });

  return z.union([
    z.array(z.string().min(1)),
    z
      .array(effect)
      .max(slots.length)
      .refine(
        (entries) =>
          entries.every(
            (entry, index) =>
              index === 0 || slots.indexOf(entries[index - 1].slot) < slots.indexOf(entry.slot),
          ),
        'スロットは重複させず、信号の順に並べてください。',
      ),
  ]);
}

const kemperRigs = defineCollection({
  loader: glob({
    pattern: '*.json',
    base: './src/content/kemper-rigs',
    generateId: ({ entry }) => {
      const slug = entry.slice(0, -'.json'.length);
      if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
        throw new Error(`Rigのファイル名は固定slugを使用してください: ${entry}`);
      }
      return slug;
    },
  }),
  schema: z.object({
    name: z.string().min(1),
    author: z.string().min(1).optional(),
    fictional: z.boolean().default(false),
    concept: z.string().min(1).optional(),
    conceptEn: z.string().min(1).optional(),
    rigVolume: z.string().min(1).optional(),
    amplifier: stackModule,
    cabinet: stackModule,
    beforeStack: effectStage(['A', 'B', 'C', 'D']),
    afterStack: effectStage(['X', 'MOD', 'DLY', 'REV']),
  }),
});

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const VIDEO_CHANNELS_FILE = './src/content/video-shelf/channels.json';

const videoChannel = z.object({
  id: z
    .string()
    .regex(SLUG_PATTERN, 'チャンネルのidは英小文字・数字・ハイフンで指定してください。'),
  channelId: z.string().regex(CHANNEL_ID_PATTERN, 'チャンネルIDは UC から始まる24文字です。'),
  name: z.string().min(1),
  // カテゴリの id（categories.json）。存在しない id はページ生成時にエラーにする。
  categories: z.array(z.string().regex(SLUG_PATTERN)).default([]),
  // 大きいほど上に並べる。同じ値なら名前順。
  priority: z.number().int().default(0),
  // 管理人自身のチャンネル。推しチャンネルとは分けて、ページ下部の専用コーナーに表示する（1つまで）。
  owner: z.boolean().default(false),
  enabled: z.boolean().default(true),
  // 種類（動画・ショート・ライブ）ごとに取得する直近の動画数。省略時は既定値（100本）。
  uploadsPerKind: z.number().int().min(1).max(MAX_UPLOADS_PER_KIND).optional(),
  // YouTubeのチャンネルタブで確認した分類。自動判定より優先する。
  videoKinds: z
    .record(z.string().regex(VIDEO_ID_PATTERN), z.enum(['regular', 'shorts', 'live']))
    .default({}),
});

// 動画の棚：チャンネルに付けるカテゴリの定義。表示順は `order` の小さい順。
const videoCategories = defineCollection({
  loader: file('./src/content/video-shelf/categories.json'),
  schema: z.object({
    id: z.string().regex(SLUG_PATTERN),
    name: z.string().min(1),
    nameEn: z.string().min(1),
    order: z.number().int(),
  }),
});

// 動画の棚：表示対象として手動で選んだチャンネル。`id` は設定内の固定slug。
const videoChannels = defineCollection({
  loader: file(VIDEO_CHANNELS_FILE),
  schema: videoChannel,
});

/**
 * 有効なチャンネルの新着をYouTube Data APIからビルド時に取得する。
 * 結果はAstroのデータストア（Git管理外）にのみ置き、ビルドごとに取り直す。
 * APIキーが未設定の場合や取得に失敗した場合も、ビルドは止めない。
 */
function youtubeUploadsLoader(): Loader {
  return {
    name: 'youtube-uploads',
    load: async ({ store, logger, parseData }) => {
      store.clear();
      // サーバー側の環境変数（`.env` を含む）。クライアントには渡らない。
      const apiKey: unknown = import.meta.env.YOUTUBE_API_KEY;
      if (typeof apiKey !== 'string' || apiKey === '') {
        logger.info('YOUTUBE_API_KEY が未設定のため、チャンネルの新着取得を省略します。');
        return;
      }

      const channels = z
        .array(videoChannel)
        .parse(videoChannelsJson)
        .filter((channel) => channel.enabled);
      const results = await fetchChannelUploads(channels, apiKey);

      for (const result of results) {
        if (result.status === 'error') {
          logger.warn(`チャンネル "${result.channel}" の新着を取得できませんでした。`);
        }
        const data = await parseData({ id: result.channel, data: { ...result } });
        store.set({ id: result.channel, data });
      }
      logger.info(
        `${results.filter((result) => result.status === 'ok').length}/${results.length} チャンネルの新着を取得しました。`,
      );
    },
  };
}

const uploadVideo = z.object({
  id: z.string().regex(VIDEO_ID_PATTERN),
  title: z.string().min(1),
  publishedAt: z.coerce.date(),
  thumbnailUrl: z.url().optional(),
  kind: z.enum(VIDEO_KINDS),
  durationSeconds: z.number().int().nonnegative().optional(),
});

// 動画の棚：チャンネルごとの新着（自動取得）。`id` はチャンネルのslug。
// 再生プリセット。1つの棚を、決めた再生方法で流す（対象の棚の存在はページのビルド時に確かめる）。
const videoPresets = defineCollection({
  loader: file('./src/content/video-shelf/presets.json'),
  schema: z.object({
    id: z
      .string()
      .regex(SLUG_PATTERN, 'プリセットのidは英小文字・数字・ハイフンで指定してください。'),
    name: z.string().min(1),
    nameEn: z.string().min(1),
    // 小さいほど前に並べる。
    order: z.number().int().default(0),
    queue: z.string().min(1),
    playOrder: z.enum(['ordered', 'shuffle']).default('ordered'),
    repeat: z.boolean().default(false),
  }),
});

const channelUploads = defineCollection({
  loader: youtubeUploadsLoader(),
  schema: z.object({
    channel: z.string().regex(SLUG_PATTERN),
    status: z.enum(['ok', 'error']),
    fetchedAt: z.coerce.date(),
    videos: z.array(uploadVideo),
    // 管理人のチャンネルのみ：視聴回数の多い順の代表作。
    popular: z.array(uploadVideo.extend({ viewCount: z.number().int().nonnegative() })).optional(),
  }),
});

// 動画の棚：手動で登録した公開動画。`id` はYouTubeの動画ID。
const shelfVideos = defineCollection({
  loader: file('./src/content/video-shelf/videos.json'),
  schema: z.object({
    id: z.string().regex(VIDEO_ID_PATTERN, '動画IDは11文字です。'),
    channel: z.string().regex(SLUG_PATTERN),
    title: z.string().min(1),
    publishedAt: z.coerce.date(),
    // 任意。省略した場合は種別未取得として扱い、種別での絞り込みでは表示しない。
    kind: z.enum(VIDEO_KINDS).optional(),
  }),
});

// 動画の棚：手動のプレイリスト（全編・区間）。動画の情報はすべて手動で記入し、APIのデータは結び付けない。
const timestamp = z
  .string()
  .regex(TIMESTAMP_PATTERN, '時刻は ss・m:ss・h:mm:ss のいずれかで指定してください（例：12:30）。');

const videoPlaylists = defineCollection({
  loader: file('./src/content/video-shelf/playlists.json'),
  schema: z.object({
    id: z
      .string()
      .regex(SLUG_PATTERN, 'プレイリストのidは英小文字・数字・ハイフンで指定してください。'),
    name: z.string().min(1),
    nameEn: z.string().min(1),
    // 小さいほど上に並べる。
    order: z.number().int().default(0),
    items: z
      .array(
        z.object({
          video: z.string().regex(VIDEO_ID_PATTERN, '動画IDは11文字です。'),
          channel: z.string().regex(SLUG_PATTERN),
          title: z.string().min(1),
          start: timestamp.optional(),
          end: timestamp.optional(),
          note: z.string().min(1).optional(),
        }),
      )
      .min(1),
  }),
});

export const collections = {
  kemperRigs,
  videoCategories,
  videoChannels,
  shelfVideos,
  videoPlaylists,
  videoPresets,
  channelUploads,
};
