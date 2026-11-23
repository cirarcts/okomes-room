import { describe, expect, it } from 'vitest';

import {
  canAutoplay,
  findFirstPlayable,
  findNext,
  findPrevious,
  queuePosition,
  shuffleQueueKeys,
  visibleRatioOf,
  type VideoQueue,
} from './videoQueue';

const queue: VideoQueue = { id: 'shelf', label: '棚', keys: ['a', 'b', 'c', 'd'] };

describe('findNext / findPrevious', () => {
  it('前後の動画を返す', () => {
    expect(findNext(queue, 'b')).toBe('c');
    expect(findPrevious(queue, 'b')).toBe('a');
  });

  it('棚の端では undefined', () => {
    expect(findNext(queue, 'd')).toBeUndefined();
    expect(findPrevious(queue, 'a')).toBeUndefined();
  });

  it('飛ばす動画を除いて、その先の動画を返す', () => {
    const skip = new Set(['b', 'c']);
    expect(findNext(queue, 'a', { skip })).toBe('d');
    expect(findPrevious(queue, 'd', { skip })).toBe('a');
  });

  it('先がすべて飛ばす動画なら undefined', () => {
    expect(findNext(queue, 'b', { skip: new Set(['c', 'd']) })).toBeUndefined();
  });

  it('今の動画が飛ばす対象でも、前後は求められる', () => {
    expect(findNext(queue, 'b', { skip: new Set(['b']) })).toBe('c');
  });

  it('棚にない動画からは移動しない', () => {
    expect(findNext(queue, 'x')).toBeUndefined();
    expect(findPrevious(queue, 'x')).toBeUndefined();
  });

  it('同じ動画が重複していても、今の動画には戻らない', () => {
    const duplicated: VideoQueue = { ...queue, keys: ['a', 'a', 'b'] };
    expect(findNext(duplicated, 'a')).toBe('b');
    expect(findPrevious(duplicated, 'b')).toBe('a');
  });

  it('空の棚では移動しない', () => {
    expect(findNext({ ...queue, keys: [] }, 'a')).toBeUndefined();
  });
});

describe('queuePosition', () => {
  it('1始まりの位置と総数を返す', () => {
    expect(queuePosition(queue, 'a')).toEqual({ index: 1, total: 4 });
    expect(queuePosition(queue, 'd')).toEqual({ index: 4, total: 4 });
  });

  it('棚にない動画は undefined', () => {
    expect(queuePosition(queue, 'x')).toBeUndefined();
  });
});

describe('canAutoplay', () => {
  it('半分を超えて見えていて、タブが表示中なら再生できる', () => {
    expect(canAutoplay({ visibleRatio: 0.51, documentVisible: true })).toBe(true);
    expect(canAutoplay({ visibleRatio: 1, documentVisible: true })).toBe(true);
  });

  it('ちょうど半分以下なら再生しない', () => {
    expect(canAutoplay({ visibleRatio: 0.5, documentVisible: true })).toBe(false);
    expect(canAutoplay({ visibleRatio: 0, documentVisible: true })).toBe(false);
  });

  it('タブが非表示なら、見えている割合に関係なく再生しない', () => {
    expect(canAutoplay({ visibleRatio: 1, documentVisible: false })).toBe(false);
  });
});

describe('visibleRatioOf', () => {
  const viewport = { width: 1000, height: 800 };

  it('すべて画面内なら 1', () => {
    expect(visibleRatioOf({ top: 100, right: 900, bottom: 550, left: 100 }, viewport)).toBe(1);
  });

  it('上半分が画面外なら 0.5', () => {
    expect(visibleRatioOf({ top: -100, right: 500, bottom: 100, left: 0 }, viewport)).toBe(0.5);
  });

  it('下にはみ出した分を除く', () => {
    expect(visibleRatioOf({ top: 700, right: 500, bottom: 1100, left: 0 }, viewport)).toBe(0.25);
  });

  it('画面外や大きさ0なら 0', () => {
    expect(visibleRatioOf({ top: 900, right: 500, bottom: 1200, left: 0 }, viewport)).toBe(0);
    expect(visibleRatioOf({ top: 100, right: 0, bottom: 200, left: 0 }, viewport)).toBe(0);
  });
});

describe('findFirstPlayable', () => {
  it('先頭から最初の再生できる動画を返す', () => {
    expect(findFirstPlayable(queue)).toBe('a');
    expect(findFirstPlayable(queue, { skip: new Set(['a', 'b']) })).toBe('c');
  });

  it('すべて飛ばす対象、または空の棚なら undefined', () => {
    expect(findFirstPlayable(queue, { skip: new Set(queue.keys) })).toBeUndefined();
    expect(findFirstPlayable({ ...queue, keys: [] })).toBeUndefined();
  });
});

describe('shuffleQueueKeys', () => {
  // 常に0を返す乱数では、Fisher–Yatesは [a, b, c, d] → [b, c, d, a] になる。
  const zero = () => 0;
  // 0.999… を返す乱数では、入れ替えが起きず元の順のままになる。
  const keep = () => 0.999;

  it('乱数に従って並べ替え、すべての動画を1回ずつ含む', () => {
    expect(shuffleQueueKeys(queue.keys, { random: zero })).toEqual(['b', 'c', 'd', 'a']);
    expect(shuffleQueueKeys(queue.keys, { random: keep })).toEqual(['a', 'b', 'c', 'd']);
    const shuffled = shuffleQueueKeys(queue.keys);
    expect([...shuffled].sort()).toEqual(['a', 'b', 'c', 'd']);
  });

  it('元の配列を変更しない', () => {
    const ids = ['a', 'b', 'c'];
    shuffleQueueKeys(ids, { random: zero });
    expect(ids).toEqual(['a', 'b', 'c']);
  });

  it('重複した動画は1回だけにする', () => {
    expect(shuffleQueueKeys(['a', 'b', 'a', 'c'], { random: keep })).toEqual(['a', 'b', 'c']);
  });

  it('first に指定した動画を先頭に固定し、残りをシャッフルする', () => {
    expect(shuffleQueueKeys(queue.keys, { random: zero, first: 'c' })).toEqual([
      'c',
      'b',
      'd',
      'a',
    ]);
  });

  it('棚にない動画は first に指定しても加えない', () => {
    expect(shuffleQueueKeys(queue.keys, { random: keep, first: 'x' })).toEqual([
      'a',
      'b',
      'c',
      'd',
    ]);
  });

  it('avoidFirst の動画が先頭に来たら、次の動画と入れ替える', () => {
    expect(shuffleQueueKeys(queue.keys, { random: keep, avoidFirst: 'a' })).toEqual([
      'b',
      'a',
      'c',
      'd',
    ]);
  });

  it('avoidFirst は、飛ばす動画を除いた最初の再生位置で判定する', () => {
    const skip = new Set(['a', 'b']);
    expect(shuffleQueueKeys(queue.keys, { random: keep, avoidFirst: 'c', skip })).toEqual([
      'a',
      'b',
      'd',
      'c',
    ]);
  });

  it('ほかに再生できる動画がなければ、avoidFirst の動画をそのまま先頭にする', () => {
    expect(shuffleQueueKeys(['a'], { avoidFirst: 'a' })).toEqual(['a']);
    const skip = new Set(['b', 'c', 'd']);
    expect(shuffleQueueKeys(queue.keys, { random: keep, avoidFirst: 'a', skip })).toEqual([
      'a',
      'b',
      'c',
      'd',
    ]);
  });

  it('何度シャッフルしても、avoidFirst の動画が最初に再生されない', () => {
    for (let trial = 0; trial < 200; trial += 1) {
      expect(shuffleQueueKeys(queue.keys, { avoidFirst: 'b' })[0]).not.toBe('b');
    }
  });

  it('空の棚では空の配列を返す', () => {
    expect(shuffleQueueKeys([])).toEqual([]);
  });
});
