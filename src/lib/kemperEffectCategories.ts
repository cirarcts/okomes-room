export const EFFECT_CATEGORIES = [
  'wah',
  'distortion',
  'booster',
  'shaper',
  'equalizer',
  'compressor',
  'noise-gate',
  'chorus',
  'tremolo',
  'phaser',
  'flanger',
  'pitch-shifter',
  'delay',
  'pitch-delay',
  'reverb',
  'effect-loop',
] as const;

export type EffectCategory = (typeof EFFECT_CATEGORIES)[number];

// カテゴリを持たない既存データ用。プリセット名の部分一致では判定しない。
const legacyCategories = new Map<string, EffectCategory>([
  ['air chorus', 'chorus'],
  ['glass drive', 'distortion'],
  ['graphic eq', 'equalizer'],
  ['graphic equalizer', 'equalizer'],
  ['green scream', 'distortion'],
  ['legacy reverb', 'reverb'],
  ['noise gate 2:1', 'noise-gate'],
  ['opto trem', 'tremolo'],
  ['phaser', 'phaser'],
  ['short room', 'reverb'],
  ['soft comp', 'compressor'],
  ['spring tank', 'reverb'],
  ['studio plate', 'reverb'],
  ['tape echo', 'delay'],
  ['treble booster', 'booster'],
  ['treble lift', 'booster'],
  ['twotap delay', 'delay'],
]);

export function resolveEffectCategory(name: string, category?: EffectCategory) {
  return category ?? legacyCategories.get(name.trim().toLowerCase());
}
