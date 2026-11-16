import { describe, expect, it } from 'vitest';

import {
  canAutoplay,
  findNext,
  findPrevious,
  queuePosition,
  visibleRatioOf,
  type VideoQueue,
} from './videoQueue';

const queue: VideoQueue = { id: 'shelf', label: '棚', videoIds: ['a', 'b', 'c', 'd'] };

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
    const duplicated: VideoQueue = { ...queue, videoIds: ['a', 'a', 'b'] };
    expect(findNext(duplicated, 'a')).toBe('b');
    expect(findPrevious(duplicated, 'b')).toBe('a');
  });

  it('空の棚では移動しない', () => {
    expect(findNext({ ...queue, videoIds: [] }, 'a')).toBeUndefined();
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
