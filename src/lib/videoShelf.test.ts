import { describe, expect, it } from 'vitest';

import {
  CHANNEL_ID_PATTERN,
  VIDEO_ID_PATTERN,
  buildShelf,
  isFilterActive,
  sortCategories,
  sortChannels,
  validateShelfConfig,
  formatDuration,
  formatViewCount,
  matchesVideoFilter,
  normalizeSearchText,
  parseIsoDuration,
  parseSearchTerms,
  youtubeChannelUrl,
  youtubeThumbnailUrl,
  youtubeWatchUrl,
  type ShelfChannel,
  type ShelfVideo,
} from './videoShelf';

// テスト用の架空データ（実在のIDではない）
function channel(
  overrides: Partial<ShelfChannel> & Pick<ShelfChannel, 'id' | 'name'>,
): ShelfChannel {
  return {
    channelId: 'UCaaaaaaaaaaaaaaaaaaaaaa',
    categories: [],
    priority: 0,
    owner: false,
    enabled: true,
    ...overrides,
  };
}

const channels: ShelfChannel[] = [
  channel({ id: 'alpha', name: 'Alpha' }),
  channel({ id: 'beta', name: 'Beta', channelId: 'UCbbbbbbbbbbbbbbbbbbbbbb', enabled: false }),
];

function video(id: string, channel: string, publishedAt: string, title = id): ShelfVideo {
  return { id, channel, title, publishedAt: new Date(publishedAt) };
}

describe('buildShelf', () => {
  it('公開日の新しい順に並べ、チャンネル情報を結び付ける', () => {
    const shelf = buildShelf(channels, [
      video('aaaaaaaaaa1', 'alpha', '2026-01-01'),
      video('aaaaaaaaaa2', 'alpha', '2026-03-01'),
    ]);
    expect(shelf.map((item) => item.id)).toEqual(['aaaaaaaaaa2', 'aaaaaaaaaa1']);
    expect(shelf[0].channelData.name).toBe('Alpha');
  });

  it('無効化したチャンネルの動画は表示しない', () => {
    const shelf = buildShelf(channels, [
      video('aaaaaaaaaa1', 'alpha', '2026-01-01'),
      video('bbbbbbbbbb1', 'beta', '2026-02-01'),
    ]);
    expect(shelf.map((item) => item.id)).toEqual(['aaaaaaaaaa1']);
  });

  it('同じ公開日ではタイトル順に並べる', () => {
    const shelf = buildShelf(channels, [
      video('aaaaaaaaaa1', 'alpha', '2026-01-01', 'B'),
      video('aaaaaaaaaa2', 'alpha', '2026-01-01', 'A'),
    ]);
    expect(shelf.map((item) => item.title)).toEqual(['A', 'B']);
  });

  it('同じ動画IDは最初の1件だけを残す', () => {
    const shelf = buildShelf(channels, [
      video('aaaaaaaaaa1', 'alpha', '2026-01-01', 'first'),
      video('aaaaaaaaaa1', 'alpha', '2026-01-02', 'second'),
    ]);
    expect(shelf).toHaveLength(1);
    expect(shelf[0].title).toBe('first');
  });

  it('未登録のチャンネルを参照するとエラーにする', () => {
    expect(() => buildShelf(channels, [video('ccccccccccc', 'gamma', '2026-01-01')])).toThrow(
      /gamma/,
    );
  });

  it('動画もチャンネルもなければ空の棚を返す', () => {
    expect(buildShelf([], [])).toEqual([]);
  });
});

describe('IDの形式', () => {
  it('動画IDは11文字の英数字・ハイフン・アンダースコア', () => {
    expect(VIDEO_ID_PATTERN.test('abc_DEF-123')).toBe(true);
    expect(VIDEO_ID_PATTERN.test('abc_DEF-12')).toBe(false);
    expect(VIDEO_ID_PATTERN.test('abc_DEF-1234')).toBe(false);
    expect(VIDEO_ID_PATTERN.test('abc DEF-123')).toBe(false);
  });

  it('チャンネルIDは UC + 22文字', () => {
    expect(CHANNEL_ID_PATTERN.test('UCaaaaaaaaaaaaaaaaaaaa_-')).toBe(true);
    expect(CHANNEL_ID_PATTERN.test('UCaaaaaaaaaaaaaaaaaaaaa')).toBe(false);
    expect(CHANNEL_ID_PATTERN.test('@handle')).toBe(false);
  });
});

describe('YouTubeのURL', () => {
  it('動画・チャンネル・サムネイルのURLを組み立てる', () => {
    expect(youtubeWatchUrl('abc_DEF-123')).toBe('https://www.youtube.com/watch?v=abc_DEF-123');
    expect(youtubeChannelUrl('UCaaaaaaaaaaaaaaaaaaaaaa')).toBe(
      'https://www.youtube.com/channel/UCaaaaaaaaaaaaaaaaaaaaaa',
    );
    expect(youtubeThumbnailUrl('abc_DEF-123', 'mqdefault')).toBe(
      'https://i.ytimg.com/vi/abc_DEF-123/mqdefault.jpg',
    );
  });
});

describe('parseIsoDuration', () => {
  it.each([
    ['PT45S', 45],
    ['PT3M', 180],
    ['PT3M1S', 181],
    ['PT1H2M3S', 3723],
    ['P1DT1S', 86401],
    ['P0D', 0],
  ])('%s は %d 秒', (value, seconds) => {
    expect(parseIsoDuration(value)).toBe(seconds);
  });

  it.each(['', 'P', 'PT', '3:00', 'PT1.5S', 'garbage'])('%s は解釈できない', (value) => {
    expect(parseIsoDuration(value)).toBeUndefined();
  });
});

describe('検索と絞り込み', () => {
  it('全角・半角と大文字・小文字をそろえて語に分ける', () => {
    expect(parseSearchTerms('  ＧＴ７　Cover  ')).toEqual(['gt7', 'cover']);
    expect(parseSearchTerms('   ')).toEqual([]);
  });

  const target = {
    searchText: normalizeSearchText('【BABYMETAL】Arkadia - Guitar Cover cir*'),
    kind: 'regular' as const,
    categories: ['music', 'game'],
  };
  const all = { terms: [], kind: 'all', category: 'all' } as const;

  it('すべての語を含む場合だけ一致する', () => {
    expect(matchesVideoFilter(target, { ...all, terms: ['arkadia', 'cover'] })).toBe(true);
    expect(matchesVideoFilter(target, { ...all, terms: ['arkadia', 'solo'] })).toBe(false);
    expect(matchesVideoFilter(target, all)).toBe(true);
  });

  it('種別を指定すると、種別が一致するものだけが残る', () => {
    expect(matchesVideoFilter({ ...target, kind: 'shorts' }, { ...all, kind: 'shorts' })).toBe(
      true,
    );
    expect(matchesVideoFilter(target, { ...all, kind: 'shorts' })).toBe(false);
  });

  it('種別が未取得の動画は「すべて」でだけ表示する', () => {
    const unknown = { ...target, kind: undefined };
    expect(matchesVideoFilter(unknown, all)).toBe(true);
    expect(matchesVideoFilter(unknown, { ...all, kind: 'regular' })).toBe(false);
  });

  it('カテゴリは公開元チャンネルのいずれかのカテゴリと一致すればよい', () => {
    expect(matchesVideoFilter(target, { ...all, category: 'game' })).toBe(true);
    expect(matchesVideoFilter(target, { ...all, category: 'racing' })).toBe(false);
    expect(matchesVideoFilter({ ...target, categories: [] }, { ...all, category: 'music' })).toBe(
      false,
    );
  });

  it('条件を組み合わせると、すべてを満たすものだけが残る', () => {
    expect(
      matchesVideoFilter(target, { terms: ['arkadia'], kind: 'regular', category: 'music' }),
    ).toBe(true);
    expect(
      matchesVideoFilter(target, { terms: ['arkadia'], kind: 'regular', category: 'racing' }),
    ).toBe(false);
  });

  it('いずれかの条件があれば絞り込み中とみなす', () => {
    expect(isFilterActive(all)).toBe(false);
    expect(isFilterActive({ ...all, terms: ['a'] })).toBe(true);
    expect(isFilterActive({ ...all, kind: 'live' })).toBe(true);
    expect(isFilterActive({ ...all, category: 'music' })).toBe(true);
  });
});

describe('チャンネルの並び順', () => {
  it('優先度の高い順、同じ優先度なら名前順', () => {
    const sorted = sortChannels([
      channel({ id: 'c', name: 'ちるにとら' }),
      channel({ id: 'a', name: 'FIA WEC' }),
      channel({ id: 'b', name: 'Petra', priority: 10 }),
      channel({ id: 'd', name: 'Low', priority: -1 }),
    ]);
    expect(sorted.map((c) => c.id)).toEqual(['b', 'a', 'c', 'd']);
  });

  it('カテゴリは order の小さい順', () => {
    const sorted = sortCategories([
      { id: 'game', name: 'ゲーム', nameEn: 'Gaming', order: 40 },
      { id: 'racing', name: 'レース', nameEn: 'Racing', order: 10 },
    ]);
    expect(sorted.map((c) => c.id)).toEqual(['racing', 'game']);
  });
});

describe('validateShelfConfig', () => {
  const categories = [{ id: 'music', name: '音楽', nameEn: 'Music', order: 1 }];

  it('整合していれば何もしない', () => {
    expect(() =>
      validateShelfConfig(
        [
          channel({ id: 'a', name: 'A', categories: ['music'], owner: true }),
          channel({ id: 'b', name: 'B' }),
        ],
        categories,
      ),
    ).not.toThrow();
  });

  it('未定義のカテゴリを参照するとエラー', () => {
    expect(() =>
      validateShelfConfig([channel({ id: 'a', name: 'A', categories: ['musik'] })], categories),
    ).toThrow(/musik/);
  });

  it('管理人のチャンネルが2つ以上あるとエラー', () => {
    expect(() =>
      validateShelfConfig(
        [
          channel({ id: 'a', name: 'A', owner: true }),
          channel({ id: 'b', name: 'B', owner: true }),
        ],
        categories,
      ),
    ).toThrow(/1つまで/);
  });
});

describe('formatDuration', () => {
  it.each([
    [0, '0:00'],
    [59, '0:59'],
    [180, '3:00'],
    [3723, '1:02:03'],
    [36000, '10:00:00'],
  ])('%d 秒は %s', (seconds, text) => {
    expect(formatDuration(seconds)).toBe(text);
  });
});

describe('formatViewCount', () => {
  it('言語に合わせて短く表す', () => {
    expect(formatViewCount(999, 'ja')).toBe('999');
    expect(formatViewCount(12_345, 'ja')).toBe('1.2万');
    expect(formatViewCount(12_345, 'en')).toBe('12.3K');
    expect(formatViewCount(1_500_000, 'en')).toBe('1.5M');
  });
});
