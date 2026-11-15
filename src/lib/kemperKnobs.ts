/** ノブとして表示できる設定項目の値域。 */
interface KnobRange {
  min: number;
  max: number;
}

/**
 * Amplifierのうち、実機前面のノブに対応する項目。並び順は実機の左から右に合わせる。
 * 値域はコンテンツ側に持たせず、項目名から決める（Rigごとに変わらないため）。
 */
export const AMPLIFIER_KNOBS: Readonly<Record<string, KnobRange>> = {
  Gain: { min: 0, max: 10 },
  Bass: { min: -5, max: 5 },
  Middle: { min: -5, max: 5 },
  Treble: { min: -5, max: 5 },
  Presence: { min: -5, max: 5 },
  'Amp Volume': { min: -12, max: 12 },
};

export interface KnobPosition {
  /** ノブの位置。0 が左いっぱい、1 が右いっぱい。 */
  ratio: number;
  /** 中央を基準に左右へ振れる項目（Bassなど）かどうか。 */
  bipolar: boolean;
}

/**
 * Rig Managerの表記（"6.2"、"+1.4"、"-0.5 dB"、"<0.0>"）から数値を取り出す。
 * 数値として読めない表記（"Post" など）は null を返す。
 */
export function parseSettingValue(value: string): number | null {
  const match = /^<?([+-]?\d+(?:\.\d+)?)>?(?:\s*dB)?$/.exec(value.trim());
  return match ? Number(match[1]) : null;
}

/**
 * 設定項目をノブの位置へ変換する。
 * ノブ対象外の項目や数値として読めない値は null を返し、呼び出し側は文字表示にする。
 * 値域を外れた値は端に丸める。
 */
export function toKnobPosition(label: string, value: string): KnobPosition | null {
  if (!Object.hasOwn(AMPLIFIER_KNOBS, label)) return null;
  const range = AMPLIFIER_KNOBS[label];
  const number = parseSettingValue(value);
  if (number === null) return null;

  const ratio = (number - range.min) / (range.max - range.min);
  return { ratio: Math.min(1, Math.max(0, ratio)), bipolar: range.min < 0 };
}

/**
 * LEDリングの各LEDが点灯するかを返す。
 * 通常の項目は左端から現在位置まで、中央基準の項目は中央から現在位置までを点灯させる。
 */
export function litLeds({ ratio, bipolar }: KnobPosition, count: number): boolean[] {
  const from = bipolar ? Math.min(0.5, ratio) : 0;
  const to = bipolar ? Math.max(0.5, ratio) : ratio;
  // LED1個ぶんの半分までは「届いている」とみなし、端数で消灯しないようにする
  const tolerance = 0.5 / (count - 1);
  return Array.from({ length: count }, (_, index) => {
    const position = index / (count - 1);
    return position >= from - tolerance && position <= to + tolerance;
  });
}
