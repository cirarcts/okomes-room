import { describe, expect, it } from 'vitest';

import {
  buildPlaylist,
  formatSegment,
  isSegment,
  parseTimestamp,
  playlistItemKey,
  sortPlaylists,
  type PlaylistInput,
} from './videoPlaylist';
import type { ShelfChannel } from './videoShelf';

const channel = (overrides: Partial<ShelfChannel> & Pick<ShelfChannel, 'id'>): ShelfChannel => ({
  channelId: 'UCaaaaaaaaaaaaaaaaaaaaaa',
  name: overrides.id,
  categories: [],
  priority: 0,
  owner: false,
  enabled: true,
  ...overrides,
});

const channels = [channel({ id: 'alpha' }), channel({ id: 'beta', enabled: false })];

const playlist = (items: PlaylistInput['items']): PlaylistInput => ({
  id: 'favorites',
  name: 'お気に入り',
  nameEn: 'Favorites',
  order: 0,
  items,
});

describe('parseTimestamp', () => {
  it('ss・m:ss・h:mm:ss を秒に変換する', () => {
    expect(parseTimestamp('45')).toBe(45);
    expect(parseTimestamp('12:30')).toBe(750);
    expect(parseTimestamp('1:05:10')).toBe(3910);
    expect(parseTimestamp('0')).toBe(0);
  });

  it('分・秒が60以上や、書式の誤りは undefined', () => {
    expect(parseTimestamp('1:60')).toBeUndefined();
    expect(parseTimestamp('1:2')).toBeUndefined();
    expect(parseTimestamp('1:00:00:00')).toBeUndefined();
    expect(parseTimestamp('')).toBeUndefined();
    expect(parseTimestamp('-1')).toBeUndefined();
    expect(parseTimestamp('1m30s')).toBeUndefined();
  });
});

describe('playlistItemKey / isSegment / formatSegment', () => {
  it('全編の項目は動画IDをそのままキーにする', () => {
    expect(playlistItemKey('aaaaaaaaaaa', undefined, undefined)).toBe('aaaaaaaaaaa');
    expect(isSegment({})).toBe(false);
    expect(formatSegment({})).toBeUndefined();
  });

  it('区間の項目は開始と終了をキーに含める', () => {
    expect(playlistItemKey('aaaaaaaaaaa', 750, 1125)).toBe('aaaaaaaaaaa@750-1125');
    expect(playlistItemKey('aaaaaaaaaaa', 750, undefined)).toBe('aaaaaaaaaaa@750-');
    expect(playlistItemKey('aaaaaaaaaaa', undefined, 60)).toBe('aaaaaaaaaaa@0-60');
  });

  it('区間を m:ss〜m:ss で表す', () => {
    expect(formatSegment({ startSeconds: 750, endSeconds: 1125 })).toBe('12:30〜18:45');
    expect(formatSegment({ startSeconds: 3910 })).toBe('1:05:10〜');
    expect(formatSegment({ endSeconds: 60 })).toBe('0:00〜1:00');
  });
});

describe('buildPlaylist', () => {
  it('区間を秒に変換し、チャンネルの設定を結び付ける', () => {
    const result = buildPlaylist(
      playlist([
        { video: 'aaaaaaaaaaa', channel: 'alpha', title: 'A' },
        {
          video: 'bbbbbbbbbbb',
          channel: 'alpha',
          title: 'B',
          start: '12:30',
          end: '18:45',
          note: 'メモ',
        },
      ]),
      channels,
    );
    expect(result.items).toEqual([
      expect.objectContaining({
        key: 'aaaaaaaaaaa',
        startSeconds: undefined,
        endSeconds: undefined,
      }),
      expect.objectContaining({
        key: 'bbbbbbbbbbb@750-1125',
        startSeconds: 750,
        endSeconds: 1125,
        note: 'メモ',
      }),
    ]);
    expect(result.items[0].channelData.id).toBe('alpha');
  });

  it('重みは省略時に1、指定時はその値', () => {
    const result = buildPlaylist(
      playlist([
        { video: 'aaaaaaaaaaa', channel: 'alpha', title: 'A' },
        { video: 'bbbbbbbbbbb', channel: 'alpha', title: 'B', weight: 4 },
      ]),
      channels,
    );
    expect(result.items.map(({ weight }) => weight)).toEqual([1, 4]);
  });

  it('同じ動画の別の区間は別の項目として並べる', () => {
    const result = buildPlaylist(
      playlist([
        { video: 'aaaaaaaaaaa', channel: 'alpha', title: 'A', start: '0:10', end: '0:20' },
        { video: 'aaaaaaaaaaa', channel: 'alpha', title: 'A', start: '0:30', end: '0:40' },
      ]),
      channels,
    );
    expect(result.items.map((item) => item.key)).toEqual([
      'aaaaaaaaaaa@10-20',
      'aaaaaaaaaaa@30-40',
    ]);
  });

  it('0秒からの区間は開始の指定なしとして扱う', () => {
    const result = buildPlaylist(
      playlist([{ video: 'aaaaaaaaaaa', channel: 'alpha', title: 'A', start: '0' }]),
      channels,
    );
    expect(result.items[0]).toMatchObject({ key: 'aaaaaaaaaaa', startSeconds: undefined });
  });

  it('無効なチャンネルの項目は表示しない', () => {
    const result = buildPlaylist(
      playlist([{ video: 'aaaaaaaaaaa', channel: 'beta', title: 'A' }]),
      channels,
    );
    expect(result.items).toEqual([]);
  });

  it('未登録のチャンネルはビルドを止める', () => {
    expect(() =>
      buildPlaylist(playlist([{ video: 'aaaaaaaaaaa', channel: 'unknown', title: 'A' }]), channels),
    ).toThrow(/未登録のチャンネル/);
  });

  it('終了が開始以前ならビルドを止める', () => {
    expect(() =>
      buildPlaylist(
        playlist([
          { video: 'aaaaaaaaaaa', channel: 'alpha', title: 'A', start: '1:00', end: '1:00' },
        ]),
        channels,
      ),
    ).toThrow(/終了は開始より後/);
    expect(() =>
      buildPlaylist(
        playlist([{ video: 'aaaaaaaaaaa', channel: 'alpha', title: 'A', end: '0' }]),
        channels,
      ),
    ).toThrow(/終了は開始より後/);
  });

  it('時刻の書式が正しくなければビルドを止める', () => {
    expect(() =>
      buildPlaylist(
        playlist([{ video: 'aaaaaaaaaaa', channel: 'alpha', title: 'A', start: '1:75' }]),
        channels,
      ),
    ).toThrow(/ss・m:ss・h:mm:ss/);
  });

  it('同じ項目の重複はビルドを止める（無効なチャンネルでも）', () => {
    expect(() =>
      buildPlaylist(
        playlist([
          { video: 'aaaaaaaaaaa', channel: 'alpha', title: 'A', start: '1:00' },
          { video: 'aaaaaaaaaaa', channel: 'alpha', title: 'A', start: '60' },
        ]),
        channels,
      ),
    ).toThrow(/重複/);
  });
});

describe('sortPlaylists', () => {
  it('order の小さい順、同じなら id 順', () => {
    const sorted = sortPlaylists([
      { id: 'b', order: 10 },
      { id: 'c', order: 0 },
      { id: 'a', order: 10 },
    ]);
    expect(sorted.map((entry) => entry.id)).toEqual(['c', 'a', 'b']);
  });
});
