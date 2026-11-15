import { describe, expect, it } from 'vitest';

import { litLeds, toKnobPosition } from './kemperKnobs';

describe('toKnobPosition', () => {
  it.each([
    ['0.0', 0],
    ['3.4', 0.34],
    ['10.0', 1],
  ])('Gain %sを確認済みの範囲で正規化する', (value, ratio) => {
    const position = toKnobPosition('Gain', value);
    expect(position?.ratio).toBeCloseTo(ratio);
    expect(position?.bipolar).toBe(false);
  });

  it.each(['-0.1', '10.1', '3.4 dB', '3.4%', '<3.4', 'Post'])(
    '値域外・無単位でない値・壊れた表記 %s は図示しない',
    (value) => {
      expect(toKnobPosition('Gain', value)).toBeNull();
    },
  );

  it.each([
    ['Bass', '-5.0', 0],
    ['Middle', '0.0', 0.5],
    ['Treble', '-1.2', 0.38],
    ['Presence', '+5.0', 1],
  ])('%s %sは中央を基準に図示する', (label, value, ratio) => {
    const position = toKnobPosition(label, value);
    expect(position?.ratio).toBeCloseTo(ratio);
    expect(position?.bipolar).toBe(true);
  });

  it.each([
    ['Bass', '-7'],
    ['Treble', '2.0 dB'],
    ['Rig Volume', '-96.1 dB'],
    ['Rig Volume', '+12.1 dB'],
    ['Rig Volume', '0.0'],
    ['Amp Volume', '-2.2 dB'],
    ['Definition', '3.4'],
    ['constructor', '3.4'],
  ])('%s %sは図示せず数値で表示する', (label, value) => {
    expect(toKnobPosition(label, value)).toBeNull();
  });
});

describe('Rig VolumeのLED', () => {
  it.each([
    ['∞', 0, 1],
    ['- ∞', 0, 1],
    ['−96.0 dB', 0, 1],
    ['-95.9dB', 0.1 / 192, 1],
    ['-48.0 dB', 0.25, 5],
    ['0.0dB', 0.5, 8],
    ['+6.0 dB', 0.75, 12],
    ['+12.0dB', 1, 15],
  ])('%s は左端から連続して点灯する', (value, ratio, litCount) => {
    const position = toKnobPosition('Rig Volume', value);
    expect(position?.ratio).toBeCloseTo(ratio, 8);
    expect(litLeds(position!, 15)).toEqual(
      Array.from({ length: 15 }, (_, index) => index < litCount),
    );
  });
});

describe('litLeds', () => {
  it('通常の項目は左端から現在位置まで点灯する', () => {
    expect(litLeds({ ratio: 0.5, bipolar: false }, 5)).toEqual([true, true, true, false, false]);
    expect(litLeds({ ratio: 1, bipolar: false }, 5)).toEqual([true, true, true, true, true]);
  });

  it('最小値でも左端の1個は点灯する', () => {
    expect(litLeds({ ratio: 0, bipolar: false }, 5)).toEqual([true, false, false, false, false]);
  });

  it('中央基準の項目は中央から現在位置まで点灯する', () => {
    expect(litLeds({ ratio: 0.5, bipolar: true }, 5)).toEqual([false, false, true, false, false]);
    expect(litLeds({ ratio: 1, bipolar: true }, 5)).toEqual([false, false, true, true, true]);
    expect(litLeds({ ratio: 0, bipolar: true }, 5)).toEqual([true, true, true, false, false]);
  });
});
