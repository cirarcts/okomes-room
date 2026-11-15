import { describe, expect, it } from 'vitest';

import { litLeds, parseSettingValue, toKnobPosition } from './kemperKnobs';

describe('parseSettingValue', () => {
  it('Rig Managerの数値表記を読み取る', () => {
    expect(parseSettingValue('6.2')).toBe(6.2);
    expect(parseSettingValue('+1.4')).toBe(1.4);
    expect(parseSettingValue('-0.6')).toBe(-0.6);
    expect(parseSettingValue('-0.5 dB')).toBe(-0.5);
    expect(parseSettingValue('<0.0>')).toBe(0);
    expect(parseSettingValue('10')).toBe(10);
  });

  it('数値として読めない表記は null を返す', () => {
    expect(parseSettingValue('Post')).toBeNull();
    expect(parseSettingValue('Kemper Generic')).toBeNull();
    expect(parseSettingValue('7.0 kHz')).toBeNull();
    expect(parseSettingValue('')).toBeNull();
  });
});

describe('toKnobPosition', () => {
  it('通常の項目を 0〜1 の位置へ変換する', () => {
    expect(toKnobPosition('Gain', '0.0')).toEqual({ ratio: 0, bipolar: false });
    expect(toKnobPosition('Gain', '5.0')).toEqual({ ratio: 0.5, bipolar: false });
    expect(toKnobPosition('Gain', '10.0')).toEqual({ ratio: 1, bipolar: false });
  });

  it('中央基準の項目は 0 が中央になる', () => {
    expect(toKnobPosition('Bass', '0.0')).toEqual({ ratio: 0.5, bipolar: true });
    expect(toKnobPosition('Bass', '-5.0')).toEqual({ ratio: 0, bipolar: true });
    expect(toKnobPosition('Amp Volume', '+12.0 dB')).toEqual({ ratio: 1, bipolar: true });
  });

  it('値域を外れた値は端に丸める', () => {
    expect(toKnobPosition('Gain', '12.0')?.ratio).toBe(1);
    expect(toKnobPosition('Treble', '-9.0')?.ratio).toBe(0);
  });

  it('ノブ対象外の項目や読めない値は null を返す', () => {
    expect(toKnobPosition('Definition', '6.1')).toBeNull();
    expect(toKnobPosition('Gain', 'Post')).toBeNull();
    expect(toKnobPosition('constructor', '1.0')).toBeNull();
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
