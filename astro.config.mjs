// @ts-check
import { defineConfig } from 'astro/config';

import react from '@astrojs/react';
import tailwindcss from '@tailwindcss/vite';

// 公開URLとサブパスはデプロイ時に `astro build --site ... --base ...` で渡す。
// （GitHub Pagesのプロジェクトページは /<リポジトリ名>/ 配下で配信されるため）
// ローカル開発ではルートパス `/` で動作する。詳細は docs/deployment.md を参照。

// https://astro.build/config
export default defineConfig({
  output: 'static',
  integrations: [react()],
  vite: {
    plugins: [tailwindcss()],
  },
});
