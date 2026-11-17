import { describe, expect, it } from 'vitest';

import {
  chunk,
  fetchChannelUploads,
  isPlayable,
  kindPlaylistId,
  pickPopular,
  toUploadVideo,
  type ApiVideo,
  type FetchLike,
} from './youtubeUploads';

// テスト用の架空データ（実在のIDではない）
const CHANNEL_A = 'UCaaaaaaaaaaaaaaaaaaaaaa';
const CHANNEL_B = 'UCbbbbbbbbbbbbbbbbbbbbbb';
const NOW = new Date('2026-11-16T00:00:00Z');

function apiVideo(
  id: string,
  overrides: Partial<{ [K in keyof ApiVideo]: Partial<ApiVideo[K]> }> = {},
): ApiVideo {
  return {
    id,
    snippet: {
      title: `title ${id}`,
      publishedAt: '2026-11-01T00:00:00Z',
      channelId: CHANNEL_A,
      liveBroadcastContent: 'none',
      thumbnails: { medium: { url: `https://i.ytimg.com/vi/${id}/mqdefault.jpg` } },
      ...overrides.snippet,
    },
    status: { privacyStatus: 'public', embeddable: true, madeForKids: false, ...overrides.status },
  };
}

interface MockOptions {
  playlists?: Record<string, string>;
  playlistItems?: Record<string, string[]>;
  videos?: ApiVideo[];
  fail?: (endpoint: string, url: URL) => number | 'throw' | undefined;
}

/** エンドポイントごとに架空の応答を返すfetch。呼び出されたURLを記録する。 */
function mockFetch({ playlists = {}, playlistItems = {}, videos = [], fail }: MockOptions) {
  const calls: URL[] = [];
  const fetchFn: FetchLike = async (input) => {
    const url = new URL(input);
    calls.push(url);
    const endpoint = url.pathname.split('/').at(-1) ?? '';
    const failure = fail?.(endpoint, url);
    if (failure === 'throw') throw new TypeError('fetch failed');
    if (failure) return new Response('{}', { status: failure });

    const ids = url.searchParams.get('id')?.split(',') ?? [];
    let body: unknown;
    if (endpoint === 'channels') {
      body = {
        items: ids
          .filter((id) => playlists[id])
          .map((id) => ({ id, contentDetails: { relatedPlaylists: { uploads: playlists[id] } } })),
      };
    } else if (endpoint === 'playlistItems') {
      const items = playlistItems[url.searchParams.get('playlistId') ?? ''] ?? [];
      body = { items: items.map((videoId) => ({ contentDetails: { videoId } })) };
    } else {
      body = { items: videos.filter((video) => ids.includes(video.id)) };
    }
    return Response.json(body);
  };
  return { fetchFn, calls };
}

const channels = [
  { id: 'alpha', channelId: CHANNEL_A },
  { id: 'beta', channelId: CHANNEL_B },
];

describe('isPlayable', () => {
  it('公開・埋め込み可の通常動画は再生できる', () => {
    expect(isPlayable(apiVideo('aaaaaaaaaa1'))).toBe(true);
  });

  it.each([
    ['非公開', { status: { privacyStatus: 'private' } }],
    ['限定公開', { status: { privacyStatus: 'unlisted' } }],
    ['埋め込み不可', { status: { embeddable: false } }],
    ['子ども向け', { status: { madeForKids: true } }],
    ['配信中', { snippet: { liveBroadcastContent: 'live' } }],
    ['配信予定', { snippet: { liveBroadcastContent: 'upcoming' } }],
    ['公開日が不正', { snippet: { publishedAt: 'unknown' } }],
  ] as const)('%sの動画は除外する', (_, overrides) => {
    expect(isPlayable(apiVideo('aaaaaaaaaa1', overrides))).toBe(false);
  });

  it('動画IDの形式が不正なら除外する', () => {
    expect(isPlayable(apiVideo('short'))).toBe(false);
  });
});

describe('toUploadVideo', () => {
  it('タイトルを改変せず、公開日をISO形式にそろえる', () => {
    const video = toUploadVideo(
      apiVideo('aaaaaaaaaa1', {
        snippet: { title: '【曲名】 Cover <b>', publishedAt: '2026-11-01T09:00:00+09:00' },
      }),
    );
    expect(video).toEqual({
      id: 'aaaaaaaaaa1',
      title: '【曲名】 Cover <b>',
      publishedAt: '2026-11-01T00:00:00.000Z',
      thumbnailUrl: 'https://i.ytimg.com/vi/aaaaaaaaaa1/mqdefault.jpg',
      kind: 'regular',
    });
  });

  it('YouTube以外のサムネイルURLは使わない', () => {
    const video = toUploadVideo(
      apiVideo('aaaaaaaaaa1', {
        snippet: { thumbnails: { medium: { url: 'https://example.com/a.jpg' } } },
      }),
    );
    expect(video.thumbnailUrl).toBeUndefined();
  });
});

describe('動画の種別', () => {
  it('配信情報の有無で種別を分け、長さを秒数で付ける', () => {
    expect(
      toUploadVideo({ ...apiVideo('aaaaaaaaaa1'), contentDetails: { duration: 'PT4M10S' } }),
    ).toMatchObject({ kind: 'regular', durationSeconds: 250 });
    expect(
      toUploadVideo({ ...apiVideo('aaaaaaaaaa1'), contentDetails: { duration: 'PT59S' } }),
    ).toMatchObject({ kind: 'regular', durationSeconds: 59 });
    expect(
      toUploadVideo({
        ...apiVideo('aaaaaaaaaa1'),
        contentDetails: { duration: 'PT1H' },
        liveStreamingDetails: {},
      }),
    ).toMatchObject({ kind: 'live', durationSeconds: 3600 });
  });

  it('種類別の再生リストで確認できた分類を優先する', () => {
    const premiere = { ...apiVideo('aaaaaaaaaa1'), liveStreamingDetails: {} };
    expect(toUploadVideo(premiere, 'regular').kind).toBe('regular');
    expect(toUploadVideo(apiVideo('aaaaaaaaaa1'), 'shorts').kind).toBe('shorts');
    expect(toUploadVideo(apiVideo('aaaaaaaaaa1'), 'live').kind).toBe('live');
  });

  it('長さが解釈できなければ秒数を省き、通常の動画として扱う', () => {
    const video = toUploadVideo({ ...apiVideo('aaaaaaaaaa1'), contentDetails: { duration: '?' } });
    expect(video.kind).toBe('regular');
    expect(video).not.toHaveProperty('durationSeconds');
  });
});

describe('chunk', () => {
  it('指定した件数ごとに分割する', () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(chunk([], 50)).toEqual([]);
  });
});

describe('fetchChannelUploads', () => {
  it('チャンネルごとに再生できる新着を新しい順に返す', async () => {
    const { fetchFn } = mockFetch({
      playlists: { [CHANNEL_A]: 'UUa', [CHANNEL_B]: 'UUb' },
      playlistItems: { UUa: ['aaaaaaaaaa1', 'aaaaaaaaaa2', 'aaaaaaaaaa3'], UUb: ['bbbbbbbbbb1'] },
      videos: [
        apiVideo('aaaaaaaaaa1', { snippet: { publishedAt: '2026-10-01T00:00:00Z' } }),
        apiVideo('aaaaaaaaaa2', { snippet: { publishedAt: '2026-11-01T00:00:00Z' } }),
        apiVideo('aaaaaaaaaa3', { status: { embeddable: false } }),
        apiVideo('bbbbbbbbbb1', { snippet: { channelId: CHANNEL_B } }),
      ],
    });

    const result = await fetchChannelUploads(channels, 'test-key', fetchFn, NOW);

    expect(result.map((entry) => [entry.channel, entry.status])).toEqual([
      ['alpha', 'ok'],
      ['beta', 'ok'],
    ]);
    expect(result[0].videos.map((video) => video.id)).toEqual(['aaaaaaaaaa2', 'aaaaaaaaaa1']);
    expect(result[1].videos.map((video) => video.id)).toEqual(['bbbbbbbbbb1']);
    expect(result[0].fetchedAt).toBe(NOW.toISOString());
  });

  it('削除・非公開で詳細が返らない動画と、別チャンネルの動画は除外する', async () => {
    const { fetchFn } = mockFetch({
      playlists: { [CHANNEL_A]: 'UUa' },
      playlistItems: { UUa: ['aaaaaaaaaa1', 'gone0000000', 'bbbbbbbbbb1'] },
      videos: [
        apiVideo('aaaaaaaaaa1'),
        apiVideo('bbbbbbbbbb1', { snippet: { channelId: CHANNEL_B } }),
      ],
    });
    const [alpha] = await fetchChannelUploads([channels[0]], 'test-key', fetchFn, NOW);
    expect(alpha.videos.map((video) => video.id)).toEqual(['aaaaaaaaaa1']);
  });

  it('一部のチャンネルの取得に失敗しても、ほかのチャンネルは返す', async () => {
    const { fetchFn } = mockFetch({
      playlists: { [CHANNEL_A]: 'UUa', [CHANNEL_B]: 'UUb' },
      playlistItems: { UUa: ['aaaaaaaaaa1'] },
      videos: [apiVideo('aaaaaaaaaa1')],
      fail: (endpoint, url) =>
        endpoint === 'playlistItems' && url.searchParams.get('playlistId') === 'UUb'
          ? 404
          : undefined,
    });
    const result = await fetchChannelUploads(channels, 'test-key', fetchFn, NOW);
    expect(result.map((entry) => entry.status)).toEqual(['ok', 'error']);
    expect(result[0].videos).toHaveLength(1);
  });

  it('存在しないチャンネルIDは取得失敗として扱う', async () => {
    const { fetchFn } = mockFetch({ playlists: {} });
    const result = await fetchChannelUploads([channels[0]], 'test-key', fetchFn, NOW);
    expect(result).toEqual([
      { channel: 'alpha', status: 'error', fetchedAt: NOW.toISOString(), videos: [] },
    ]);
  });

  it.each([
    ['channels.listの失敗', 'channels', 403],
    ['videos.listの失敗', 'videos', 500],
    ['通信エラー', 'channels', 'throw'],
  ] as const)('%sでは全チャンネルを取得失敗にし、例外を投げない', async (_, target, failure) => {
    const { fetchFn } = mockFetch({
      playlists: { [CHANNEL_A]: 'UUa', [CHANNEL_B]: 'UUb' },
      playlistItems: { UUa: ['aaaaaaaaaa1'], UUb: [] },
      videos: [apiVideo('aaaaaaaaaa1')],
      fail: (endpoint) => (endpoint === target ? failure : undefined),
    });
    const result = await fetchChannelUploads(channels, 'test-key', fetchFn, NOW);
    expect(result.map((entry) => entry.status)).toEqual(['error', 'error']);
  });

  it('想定外の応答形式は取得失敗として扱う', async () => {
    const fetchFn: FetchLike = async () => Response.json({ items: [{ unexpected: true }] });
    const result = await fetchChannelUploads([channels[0]], 'test-key', fetchFn, NOW);
    expect(result[0].status).toBe('error');
  });

  it('チャンネルIDはまとめて1回で問い合わせ、APIキーを付けて送る', async () => {
    const { fetchFn, calls } = mockFetch({
      playlists: { [CHANNEL_A]: 'UUa', [CHANNEL_B]: 'UUb' },
      playlistItems: { UUa: [], UUb: [] },
    });
    await fetchChannelUploads(channels, 'test-key', fetchFn, NOW);
    const channelCalls = calls.filter((url) => url.pathname.endsWith('/channels'));
    expect(channelCalls).toHaveLength(1);
    expect(channelCalls[0].searchParams.get('id')).toBe(`${CHANNEL_A},${CHANNEL_B}`);
    expect(calls.every((url) => url.searchParams.get('key') === 'test-key')).toBe(true);
    // 新着がなければ videos.list は呼ばない
    expect(calls.some((url) => url.pathname.endsWith('/videos'))).toBe(false);
  });

  it('videos.list で種別の判定に必要な項目を取得する', async () => {
    const { fetchFn, calls } = mockFetch({
      playlists: { [CHANNEL_A]: 'UUa' },
      playlistItems: { UUa: ['aaaaaaaaaa1'] },
      videos: [apiVideo('aaaaaaaaaa1')],
    });
    await fetchChannelUploads([channels[0]], 'test-key', fetchFn, NOW);
    const videosCall = calls.find((url) => url.pathname.endsWith('/videos'));
    expect(videosCall?.searchParams.get('part')?.split(',')).toEqual(
      expect.arrayContaining(['snippet', 'status', 'contentDetails', 'liveStreamingDetails']),
    );
  });

  it('チャンネルがなければ通信しない', async () => {
    const { fetchFn, calls } = mockFetch({});
    expect(await fetchChannelUploads([], 'test-key', fetchFn, NOW)).toEqual([]);
    expect(calls).toHaveLength(0);
  });
});

describe('pickPopular', () => {
  const withViews = (
    id: string,
    viewCount: string | undefined,
    publishedAt = '2026-11-01T00:00:00Z',
  ) => ({
    ...apiVideo(id, { snippet: { publishedAt } }),
    ...(viewCount === undefined ? {} : { statistics: { viewCount } }),
  });

  it('視聴回数の多い順に指定件数を選び、視聴回数を付ける', () => {
    const popular = pickPopular(
      [
        withViews('aaaaaaaaaa1', '10'),
        withViews('aaaaaaaaaa2', '300'),
        withViews('aaaaaaaaaa3', '25'),
      ],
      2,
    );
    expect(popular.map((video) => [video.id, video.viewCount])).toEqual([
      ['aaaaaaaaaa2', 300],
      ['aaaaaaaaaa3', 25],
    ]);
  });

  it('視聴回数が不明な動画は除き、同数なら新しい順', () => {
    const popular = pickPopular(
      [
        withViews('aaaaaaaaaa1', '5', '2026-01-01T00:00:00Z'),
        withViews('aaaaaaaaaa2', undefined),
        withViews('aaaaaaaaaa3', '5', '2026-06-01T00:00:00Z'),
      ],
      5,
    );
    expect(popular.map((video) => video.id)).toEqual(['aaaaaaaaaa3', 'aaaaaaaaaa1']);
  });
});

describe('管理人のチャンネル', () => {
  // 15本の動画を、2ページ（10本＋5本）に分けて返す架空のAPI。
  const ids = Array.from({ length: 15 }, (_, index) => `owner${String(index).padStart(6, '0')}`);
  function ownerFetch({ failSecondPage = false } = {}) {
    const calls: URL[] = [];
    const fetchFn: FetchLike = async (input) => {
      const url = new URL(input);
      calls.push(url);
      const endpoint = url.pathname.split('/').at(-1);
      if (failSecondPage && url.searchParams.get('pageToken') === 'p2') {
        return new Response('{}', { status: 500 });
      }
      if (endpoint === 'channels') {
        return Response.json({
          items: [{ id: CHANNEL_A, contentDetails: { relatedPlaylists: { uploads: 'UUa' } } }],
        });
      }
      if (endpoint === 'playlistItems') {
        // 種類別の再生リストは空で返し、アップロード再生リストだけを使わせる。
        if (url.searchParams.get('playlistId') !== 'UUa') return Response.json({ items: [] });
        const second = url.searchParams.get('pageToken') === 'p2';
        const page = second ? ids.slice(10) : ids.slice(0, 10);
        return Response.json({
          items: page.map((videoId) => ({ contentDetails: { videoId } })),
          ...(second ? {} : { nextPageToken: 'p2' }),
        });
      }
      const requested = url.searchParams.get('id')?.split(',') ?? [];
      return Response.json({
        items: requested.map((id) => ({
          ...apiVideo(id, {
            snippet: {
              publishedAt: `2026-01-${String(ids.indexOf(id) + 1).padStart(2, '0')}T00:00:00Z`,
            },
          }),
          // 古い動画ほど視聴回数が多い
          statistics: { viewCount: String((15 - ids.indexOf(id)) * 100) },
        })),
      });
    };
    return { fetchFn, calls };
  }

  const uploadsCalls = (calls: URL[]) =>
    calls.filter(
      (url) =>
        url.pathname.endsWith('/playlistItems') && url.searchParams.get('playlistId') === 'UUa',
    );

  it('全ページを取得し、直近の動画と視聴回数の上位5本を返す', async () => {
    const { fetchFn, calls } = ownerFetch();
    const [owner] = await fetchChannelUploads(
      [{ id: 'me', channelId: CHANNEL_A, owner: true }],
      'test-key',
      fetchFn,
      NOW,
    );
    expect(uploadsCalls(calls)).toHaveLength(2);
    expect(owner.videos).toHaveLength(15);
    expect(owner.videos[0].id).toBe(ids[14]);
    expect(owner.videos.every((video) => video.viewCount === undefined)).toBe(true);
    expect(owner.popular?.map((video) => [video.id, video.viewCount])).toEqual([
      [ids[0], 1500],
      [ids[1], 1400],
      [ids[2], 1300],
      [ids[3], 1200],
      [ids[4], 1100],
    ]);
  });

  it('推しチャンネルは既定で2ページ（100本）まで取得し、代表作を返さない', async () => {
    const { fetchFn, calls } = ownerFetch();
    const [fan] = await fetchChannelUploads(
      [{ id: 'fan', channelId: CHANNEL_A }],
      'test-key',
      fetchFn,
      NOW,
    );
    const playlistCalls = uploadsCalls(calls);
    expect(playlistCalls).toHaveLength(2);
    expect(playlistCalls[0].searchParams.get('maxResults')).toBe('50');
    expect(fan.videos).toHaveLength(15);
    expect(fan).not.toHaveProperty('popular');
  });

  it('取得数を50本以下にしたチャンネルは1ページだけ取得する', async () => {
    const { fetchFn, calls } = ownerFetch();
    const [fan] = await fetchChannelUploads(
      [{ id: 'fan', channelId: CHANNEL_A, uploadsPerKind: 50 }],
      'test-key',
      fetchFn,
      NOW,
    );
    expect(uploadsCalls(calls)).toHaveLength(1);
    expect(fan.videos).toHaveLength(10);
  });

  it('取得数に合わせて必要なページ数だけ取得し、指定した本数で打ち切る', async () => {
    const { fetchFn, calls } = ownerFetch();
    const [fan] = await fetchChannelUploads(
      [{ id: 'fan', channelId: CHANNEL_A, uploadsPerKind: 12 }],
      'test-key',
      fetchFn,
      NOW,
    );
    expect(uploadsCalls(calls)).toHaveLength(1);
    expect(fan.videos).toHaveLength(10);

    const second = ownerFetch();
    const [more] = await fetchChannelUploads(
      [{ id: 'fan', channelId: CHANNEL_A, uploadsPerKind: 51 }],
      'test-key',
      second.fetchFn,
      NOW,
    );
    expect(uploadsCalls(second.calls)).toHaveLength(2);
    expect(more.videos).toHaveLength(15);
  });

  it('2ページ目以降の取得に失敗しても、取得できたページまでを表示する', async () => {
    const { fetchFn } = ownerFetch({ failSecondPage: true });
    const [fan] = await fetchChannelUploads(
      [{ id: 'fan', channelId: CHANNEL_A }],
      'test-key',
      fetchFn,
      NOW,
    );
    expect(fan.status).toBe('ok');
    expect(fan.videos.map((video) => video.id).sort()).toEqual(ids.slice(0, 10));
  });

  it('確認済みの分類を優先し、直近の取得範囲外の公開動画を追加する', async () => {
    const [premiere, shorts, stream, foreign, privateVideo, unconfirmed] = ids;
    const { fetchFn, calls } = mockFetch({
      playlists: { [CHANNEL_A]: 'UUa' },
      playlistItems: { UUa: [shorts, stream, unconfirmed] },
      videos: [
        {
          ...apiVideo(premiere, { snippet: { publishedAt: '2025-12-06T00:00:00Z' } }),
          liveStreamingDetails: {},
        },
        { ...apiVideo(shorts), contentDetails: { duration: 'PT29S' } },
        { ...apiVideo(stream), liveStreamingDetails: {} },
        apiVideo(foreign, { snippet: { channelId: CHANNEL_B } }),
        apiVideo(privateVideo, { status: { privacyStatus: 'private' } }),
        { ...apiVideo(unconfirmed), contentDetails: { duration: 'PT24S' } },
      ],
    });
    const [fan] = await fetchChannelUploads(
      [
        {
          id: 'fan',
          channelId: CHANNEL_A,
          videoKinds: {
            [premiere]: 'regular',
            [shorts]: 'shorts',
            [stream]: 'live',
            [foreign]: 'shorts',
            [privateVideo]: 'regular',
          },
        },
      ],
      'test-key',
      fetchFn,
      NOW,
    );
    const videosRequest = calls.find((url) => url.pathname.endsWith('/videos'));
    expect(videosRequest?.searchParams.get('id')?.split(',')).toHaveLength(6);
    expect(fan.videos.map(({ id, kind }) => [id, kind])).toEqual([
      [unconfirmed, 'regular'],
      [shorts, 'shorts'],
      [stream, 'live'],
      [premiere, 'regular'],
    ]);
  });
});

describe('種類別の再生リスト', () => {
  const LF = kindPlaylistId(CHANNEL_A, 'UULF');
  const SH = kindPlaylistId(CHANNEL_A, 'UUSH');
  const LV = kindPlaylistId(CHANNEL_A, 'UULV');
  const [premiere, clip, shorts, longShorts, stream, extra] = Array.from(
    { length: 6 },
    (_, index) => `kind${String(index).padStart(7, '0')}`,
  );
  const videos: ApiVideo[] = [
    // 「動画」タブにあるプレミア公開作品
    {
      ...apiVideo(premiere, { snippet: { publishedAt: '2026-11-06T00:00:00Z' } }),
      contentDetails: { duration: 'PT4M' },
      liveStreamingDetails: {},
    },
    {
      ...apiVideo(clip, { snippet: { publishedAt: '2026-11-05T00:00:00Z' } }),
      contentDetails: { duration: 'PT2M' },
    },
    {
      ...apiVideo(shorts, { snippet: { publishedAt: '2026-11-04T00:00:00Z' } }),
      contentDetails: { duration: 'PT29S' },
    },
    {
      ...apiVideo(longShorts, { snippet: { publishedAt: '2026-11-03T00:00:00Z' } }),
      contentDetails: { duration: 'PT2M50S' },
    },
    {
      ...apiVideo(stream, { snippet: { publishedAt: '2026-11-02T00:00:00Z' } }),
      contentDetails: { duration: 'PT3H' },
      liveStreamingDetails: {},
    },
    {
      ...apiVideo(extra, { snippet: { publishedAt: '2026-11-01T00:00:00Z' } }),
      contentDetails: { duration: 'PT20S' },
    },
  ];
  const kindsOf = (entry: { videos: { id: string; kind: string }[] }) =>
    entry.videos.map(({ id, kind }) => [id, kind]);

  it('チャンネルIDの先頭を置き換えて再生リストIDを作る', () => {
    expect(kindPlaylistId('UCgA2jKRkqpY_8eysPUs8sjw', 'UUSH')).toBe('UUSHgA2jKRkqpY_8eysPUs8sjw');
  });

  it('YouTubeのタブと同じ分類を付け、アップロード再生リストは取得しない', async () => {
    const { fetchFn, calls } = mockFetch({
      playlists: { [CHANNEL_A]: 'UUa' },
      playlistItems: { [LF]: [premiere, clip], [SH]: [shorts, longShorts], [LV]: [stream] },
      videos,
    });
    const [alpha] = await fetchChannelUploads([channels[0]], 'test-key', fetchFn, NOW);
    expect(kindsOf(alpha)).toEqual([
      // プレミア公開でも「動画」タブにあれば配信として扱わない
      [premiere, 'regular'],
      [clip, 'regular'],
      [shorts, 'shorts'],
      [longShorts, 'shorts'],
      [stream, 'live'],
    ]);
    expect(
      calls.some((url) => url.searchParams.get('playlistId') === 'UUa'),
      'アップロード再生リストを取得していないこと',
    ).toBe(false);
  });

  it('該当する動画がない種類（404）は空として扱う', async () => {
    const { fetchFn } = mockFetch({
      playlists: { [CHANNEL_A]: 'UUa' },
      playlistItems: { [LF]: [clip], [LV]: [stream], UUa: [extra] },
      videos,
      fail: (_, url) => (url.searchParams.get('playlistId') === SH ? 404 : undefined),
    });
    const [alpha] = await fetchChannelUploads([channels[0]], 'test-key', fetchFn, NOW);
    expect(kindsOf(alpha)).toEqual([
      [clip, 'regular'],
      [stream, 'live'],
    ]);
  });

  it.each([
    ['404以外の失敗', (playlistId: string | null) => (playlistId === SH ? 500 : undefined)],
    [
      'すべて404',
      (playlistId: string | null) => ([LF, SH, LV].includes(playlistId ?? '') ? 404 : undefined),
    ],
  ] as const)('%sではアップロード再生リストと公式データからの推定に戻す', async (_, failure) => {
    const { fetchFn } = mockFetch({
      playlists: { [CHANNEL_A]: 'UUa' },
      playlistItems: { [LF]: [clip], [LV]: [stream], UUa: [premiere, shorts, stream] },
      videos,
      fail: (_endpoint, url) => failure(url.searchParams.get('playlistId')),
    });
    const [alpha] = await fetchChannelUploads([channels[0]], 'test-key', fetchFn, NOW);
    expect(alpha.status).toBe('ok');
    expect(kindsOf(alpha)).toEqual([
      [premiere, 'live'],
      [shorts, 'regular'],
      [stream, 'live'],
    ]);
  });

  it('種類ごとに、既定では直近100本・指定があればその本数までを残す', async () => {
    const streams = Array.from(
      { length: 120 },
      (_, index) => `live${String(index).padStart(7, '0')}`,
    );
    const { fetchFn } = mockFetch({
      playlists: { [CHANNEL_A]: 'UUa' },
      playlistItems: { [LF]: [clip], [SH]: [shorts], [LV]: streams },
      videos: [
        ...videos,
        // 投稿動画やShortsより新しい配信が120本ある
        ...streams.map((id) => apiVideo(id, { snippet: { publishedAt: '2026-11-10T00:00:00Z' } })),
      ],
    });
    const counts = async (uploadsPerKind?: number) => {
      const [alpha] = await fetchChannelUploads(
        [{ ...channels[0], uploadsPerKind }],
        'test-key',
        fetchFn,
        NOW,
      );
      const count = (kind: string) => alpha.videos.filter((video) => video.kind === kind).length;
      return [count('live'), count('regular'), count('shorts')];
    };
    expect(await counts()).toEqual([100, 1, 1]);
    expect(await counts(30)).toEqual([30, 1, 1]);
    // 範囲外の指定は丸める
    expect(await counts(0)).toEqual([1, 1, 1]);
  });

  it('手動で指定した分類は、再生リストの分類より優先する', async () => {
    const { fetchFn } = mockFetch({
      playlists: { [CHANNEL_A]: 'UUa' },
      playlistItems: { [LF]: [clip], [SH]: [shorts] },
      videos,
    });
    const [alpha] = await fetchChannelUploads(
      [{ ...channels[0], videoKinds: { [clip]: 'shorts' } }],
      'test-key',
      fetchFn,
      NOW,
    );
    expect(kindsOf(alpha)).toEqual([
      [clip, 'shorts'],
      [shorts, 'shorts'],
    ]);
  });
});
