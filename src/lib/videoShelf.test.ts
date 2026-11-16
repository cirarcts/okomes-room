import { describe, expect, it } from 'vitest';

import {
  CHANNEL_ID_PATTERN,
  VIDEO_ID_PATTERN,
  buildShelf,
  youtubeChannelUrl,
  youtubeThumbnailUrl,
  youtubeWatchUrl,
  type ShelfChannel,
  type ShelfVideo,
} from './videoShelf';

// テスト用の架空データ（実在のIDではない）
const channels: ShelfChannel[] = [
  { id: 'alpha', channelId: 'UCaaaaaaaaaaaaaaaaaaaaaa', name: 'Alpha', enabled: true },
  { id: 'beta', channelId: 'UCbbbbbbbbbbbbbbbbbbbbbb', name: 'Beta', enabled: false },
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
