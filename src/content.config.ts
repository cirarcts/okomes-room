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

const kemperRigs = defineCollection({
  loader: glob({ pattern: '*.json', base: './src/content/kemper-rigs' }),
  schema: z.object({
    name: z.string().min(1),
    author: z.string().min(1).optional(),
    fictional: z.boolean().default(false),
    concept: z.string().min(1).optional(),
    amplifier: stackModule,
    cabinet: stackModule,
    beforeStack: z.array(z.string().min(1)),
    afterStack: z.array(z.string().min(1)),
  }),
});

export const collections = { kemperRigs };
