// Kemper公式フォーラムのスタッフ回答に基づく、Kemper GenericのGainの値域。
const GAIN_MAX = 10;
const EQ_LIMIT = 5;
const RIG_VOLUME_MIN = -96;
const RIG_VOLUME_MAX = 12;

export const AMPLIFIER_KNOB_ORDER: readonly string[] = [
  'Gain',
  'Bass',
  'Middle',
  'Treble',
  'Presence',
];

export interface KnobPosition {
  /** ノブの位置。0 が左いっぱい、1 が右いっぱい。 */
  ratio: number;
  /** 中央を基準に左右へ振れる項目（Bassなど）かどうか。 */
  bipolar: boolean;
}

/** 確認済みの値域と表記に合う項目だけを図示する。 */
export function toKnobPosition(label: string, value: string): KnobPosition | null {
  const setting = value.trim();
  if (label === 'Rig Volume') {
    const normalized = setting.replace(/^−/, '-');
    if (/^-?\s*∞$/.test(normalized)) return { ratio: 0, bipolar: false };

    const match = /^([+-]?\d+(?:\.\d+)?)\s*dB$/.exec(normalized);
    if (!match) return null;
    const decibels = Number(match[1]);
    if (decibels < RIG_VOLUME_MIN || decibels > RIG_VOLUME_MAX) return null;

    // 実機で確認した0 dBを中央に置き、左右それぞれの値域を線形に割り当てる。
    const limit = decibels < 0 ? -RIG_VOLUME_MIN : RIG_VOLUME_MAX;
    return { ratio: 0.5 + decibels / (2 * limit), bipolar: false };
  }

  if (!AMPLIFIER_KNOB_ORDER.includes(label) || !/^[+-]?\d+(?:\.\d+)?$/.test(setting)) {
    return null;
  }
  const number = Number(setting);
  if (label === 'Gain') {
    return number >= 0 && number <= GAIN_MAX ? { ratio: number / GAIN_MAX, bipolar: false } : null;
  }
  return Math.abs(number) <= EQ_LIMIT
    ? { ratio: (number + EQ_LIMIT) / (2 * EQ_LIMIT), bipolar: true }
    : null;
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
