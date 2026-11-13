/// <reference types="vitest/config" />
import { getViteConfig } from 'astro/config';

// Astroの設定（エイリアスや仮想モジュール）をテストでも使えるようにする
export default getViteConfig({
  test: {
    include: ['src/**/*.test.{ts,tsx}'],
  },
});
