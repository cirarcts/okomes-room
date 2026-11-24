import { describe, expect, it } from 'vitest';

import {
  channelRowQueueId,
  playlistQueueId,
  presetIdFromSearch,
  validatePresets,
  type PresetInput,
} from './videoPreset';

const preset = (overrides: Partial<PresetInput> & Pick<PresetInput, 'id'>): PresetInput => ({
  name: overrides.id,
  nameEn: overrides.id,
  order: 0,
  queue: 'picks',
  playOrder: 'ordered',
  repeat: false,
  ...overrides,
});

const known = new Set([
  'picks',
  playlistQueueId('die-gest'),
  channelRowQueueId('alpha', 'uploads'),
]);

describe('キューの識別子', () => {
  it('棚のコンポーネントと同じ形式で作る', () => {
    expect(playlistQueueId('die-gest')).toBe('playlist-die-gest');
    expect(channelRowQueueId('alpha', 'shorts')).toBe('alpha-shorts');
  });
});

describe('validatePresets', () => {
  it('order、idの順に並べる', () => {
    const result = validatePresets(
      [
        preset({ id: 'c', order: 1 }),
        preset({ id: 'b', order: 0 }),
        preset({ id: 'a', order: 0, queue: 'playlist-die-gest' }),
      ],
      known,
    );
    expect(result.map(({ id }) => id)).toEqual(['a', 'b', 'c']);
  });

  it('プリセットがなければ空', () => {
    expect(validatePresets([], known)).toEqual([]);
  });

  it('存在しない棚を指定するとエラー', () => {
    expect(() => validatePresets([preset({ id: 'x', queue: 'playlist-none' })], known)).toThrow(
      /playlist-none/,
    );
  });

  it('タグのプリセットは、表示するプレイリストの項目にそのタグがあれば通る（表記ゆれは同じとみなす）', () => {
    const tags = new Set(['神回', 'boss']);
    const result = validatePresets(
      [preset({ id: 't', queue: undefined, tag: 'ＢＯＳＳ' })],
      known,
      tags,
    );
    expect(result.map(({ id }) => id)).toEqual(['t']);
  });

  it('どの項目にもないタグを指定するとエラー', () => {
    expect(() =>
      validatePresets(
        [preset({ id: 't', queue: undefined, tag: 'ラスボス' })],
        known,
        new Set(['神回']),
      ),
    ).toThrow(/ラスボス/);
  });

  it('棚とタグの両方、またはどちらも指定しないとエラー', () => {
    const tags = new Set(['神回']);
    expect(() => validatePresets([preset({ id: 'x', tag: '神回' })], known, tags)).toThrow(
      /どちらか一方/,
    );
    expect(() => validatePresets([preset({ id: 'x', queue: undefined })], known, tags)).toThrow(
      /どちらか一方/,
    );
  });

  it('idが重複するとエラー', () => {
    expect(() => validatePresets([preset({ id: 'x' }), preset({ id: 'x' })], known)).toThrow(
      /重複/,
    );
  });
});

describe('presetIdFromSearch', () => {
  it('?preset= の値を返す', () => {
    expect(presetIdFromSearch('?preset=die-gest-endless')).toBe('die-gest-endless');
    expect(presetIdFromSearch('?foo=1&preset=a1')).toBe('a1');
  });

  it('指定がない、または形式が正しくなければ undefined', () => {
    expect(presetIdFromSearch('')).toBeUndefined();
    expect(presetIdFromSearch('?preset=')).toBeUndefined();
    expect(presetIdFromSearch('?preset=Die_Gest')).toBeUndefined();
    expect(presetIdFromSearch('?preset=%3Cscript%3E')).toBeUndefined();
  });
});
