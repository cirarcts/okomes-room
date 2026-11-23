import { describe, expect, it } from 'vitest';

import {
  canAutoplay,
  findFirstPlayable,
  findNext,
  findPrevious,
  queuePosition,
  shuffleQueueKeys,
  upcomingKeys,
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

describe('upcomingKeys', () => {
  const long: VideoQueue = {
    id: 'long',
    label: '長い棚',
    keys: ['a', 'b', 'c', 'd', 'e', 'f', 'g'],
  };

  it('今の項目の後ろを、上限の件数まで返す', () => {
    expect(upcomingKeys(long, 'b', { limit: 3 })).toEqual(['c', 'd', 'e']);
  });

  it('棚の最後に近いときは残りだけを返す（繰り返す分は含めない）', () => {
    expect(upcomingKeys(long, 'f', { limit: 5 })).toEqual(['g']);
    expect(upcomingKeys(long, 'g', { limit: 5 })).toEqual([]);
  });

  it('飛ばす項目を除き、その分だけ先の項目で埋める', () => {
    expect(upcomingKeys(long, 'a', { limit: 3, skip: new Set(['b', 'd']) })).toEqual([
      'c',
      'e',
      'f',
    ]);
  });

  it('今の項目と同じキーや、重複したキーは1回だけにする', () => {
    const dup: VideoQueue = { id: 'dup', label: '重複', keys: ['a', 'b', 'a', 'c', 'b', 'd'] };
    expect(upcomingKeys(dup, 'a', { limit: 5 })).toEqual(['b', 'c', 'd']);
  });

  it('今の項目がキューにない、または上限が0以下なら空', () => {
    expect(upcomingKeys(long, 'x', { limit: 3 })).toEqual([]);
    expect(upcomingKeys(long, 'a', { limit: 0 })).toEqual([]);
  });
});

describe('shuffleQueueKeys（重み付き）', () => {
  const zero = () => 0;
  // 乱数を順に返す（重み付きでは、項目ごとに1回ずつ乱数を使う）。
  const sequence = (...values: number[]) => {
    let index = 0;
    return () => values[index++ % values.length];
  };

  it('同じ乱数なら、重い項目ほど前に来る', () => {
    const weights = new Map([
      ['b', 3],
      ['d', 2],
    ]);
    expect(shuffleQueueKeys(queue.keys, { random: () => 0.5, weights })).toEqual([
      'b',
      'd',
      'a',
      'c',
    ]);
  });

  it('乱数しだいで、軽い項目が前に来ることもある', () => {
    const weights = new Map([['a', 2]]);
    // a: -ln(0.01)/2 ≈ 2.30、b: -ln(0.9) ≈ 0.11
    expect(shuffleQueueKeys(['a', 'b'], { random: sequence(0.99, 0.1), weights })).toEqual([
      'b',
      'a',
    ]);
  });

  it('重みがすべて1なら、重みなしと同じ並びになる', () => {
    const weights = new Map([
      ['a', 1],
      ['b', 1],
    ]);
    expect(shuffleQueueKeys(queue.keys, { random: zero, weights })).toEqual(
      shuffleQueueKeys(queue.keys, { random: zero }),
    );
  });

  it('正でない重みや数値でない重みは1として扱う', () => {
    const weights = new Map([
      ['a', 0],
      ['b', -2],
      ['c', Number.NaN],
    ]);
    expect(shuffleQueueKeys(queue.keys, { random: zero, weights })).toEqual(
      shuffleQueueKeys(queue.keys, { random: zero }),
    );
  });

  it('first・avoidFirst・重複の扱いは重みなしと同じ', () => {
    const weights = new Map([['a', 5]]);
    const keys = ['a', 'b', 'a', 'c'];
    expect(shuffleQueueKeys(keys, { random: () => 0.5, weights, first: 'c' })).toEqual([
      'c',
      'a',
      'b',
    ]);
    expect(shuffleQueueKeys(keys, { random: () => 0.5, weights, avoidFirst: 'a' })).toEqual([
      'b',
      'a',
      'c',
    ]);
  });

  it('重い項目ほど、周の先頭に来る確率が高い（重みに比例）', () => {
    const weights = new Map([['a', 6]]);
    const trials = 3000;
    let first = 0;
    for (let trial = 0; trial < trials; trial += 1) {
      const result = shuffleQueueKeys(queue.keys, { weights });
      expect([...result].sort()).toEqual(['a', 'b', 'c', 'd']);
      if (result[0] === 'a') first += 1;
    }
    // 期待値は 6 / (6 + 1 + 1 + 1) ≈ 0.67。重みなしなら 0.25。
    expect(first / trials).toBeGreaterThan(0.6);
    expect(first / trials).toBeLessThan(0.74);
  });
});
