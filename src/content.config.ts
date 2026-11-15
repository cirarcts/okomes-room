import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

const setting = z.object({
  label: z.string().min(1),
  // 小数点以下の桁数や <0.0> など、Rig Managerで見える表記を保つ。
  value: z.string().min(1),
});

const stackModule = z.object({
  name: z.string().min(1),
  settings: z.array(setting).min(1),
});

const effectParameter = z.object({
  label: z.string().min(1),
  // null は未設定。配列を省略した場合はパラメータ未取得。
  value: z.union([z.number(), z.boolean(), z.string().min(1), z.null()]),
  unit: z.string().min(1).optional(),
});

function effectStage<const Slots extends readonly [string, ...string[]]>(slots: Slots) {
  const effect = z.object({
    slot: z.enum(slots),
    name: z.string().min(1).nullable(),
    enabled: z.boolean().optional(),
    parameters: z.array(effectParameter).optional(),
  });

  return z.union([
    z.array(z.string().min(1)),
    z
      .array(effect)
      .max(slots.length)
      .refine(
        (entries) =>
          entries.every(
            (entry, index) =>
              index === 0 || slots.indexOf(entries[index - 1].slot) < slots.indexOf(entry.slot),
          ),
        'スロットは重複させず、信号の順に並べてください。',
      ),
  ]);
}

const kemperRigs = defineCollection({
  loader: glob({
    pattern: '*.json',
    base: './src/content/kemper-rigs',
    generateId: ({ entry }) => {
      const slug = entry.slice(0, -'.json'.length);
      if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
        throw new Error(`Rigのファイル名は固定slugを使用してください: ${entry}`);
      }
      return slug;
    },
  }),
  schema: z.object({
    name: z.string().min(1),
    author: z.string().min(1).optional(),
    fictional: z.boolean().default(false),
    concept: z.string().min(1).optional(),
    conceptEn: z.string().min(1).optional(),
    rigVolume: z.string().min(1).optional(),
    amplifier: stackModule,
    cabinet: stackModule,
    beforeStack: effectStage(['A', 'B', 'C', 'D']),
    afterStack: effectStage(['X', 'MOD', 'DLY', 'REV']),
  }),
});

export const collections = { kemperRigs };
