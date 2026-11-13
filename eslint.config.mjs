// @ts-check
import js from '@eslint/js';
import { defineConfig, globalIgnores } from 'eslint/config';
import astro from 'eslint-plugin-astro';
import jsxA11y from 'eslint-plugin-jsx-a11y-x';
import reactHooks from 'eslint-plugin-react-hooks';
import prettier from 'eslint-config-prettier';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default defineConfig([
  globalIgnores(['dist/', '.astro/', 'node_modules/', 'coverage/']),

  js.configs.recommended,
  tseslint.configs.recommended,

  // Astroコンポーネント（アクセシビリティ規則を含む）
  astro.configs['flat/recommended'],
  astro.configs['flat/jsx-a11y-recommended'],

  // Reactコンポーネント
  {
    files: ['**/*.{jsx,tsx}'],
    extends: [jsxA11y.configs.recommended, reactHooks.configs.flat.recommended],
    languageOptions: {
      globals: globals.browser,
    },
  },

  // 設定ファイル・ローカルスクリプトはNode.js環境で動く
  {
    files: ['*.config.{js,mjs,ts}', 'scripts/**/*.{js,mjs,ts}'],
    languageOptions: {
      globals: globals.node,
    },
  },

  {
    rules: {
      // 安易な any を避ける（CLAUDE.mdのコーディング規約）
      '@typescript-eslint/no-explicit-any': 'error',
    },
  },

  // 整形はPrettierに任せるため、競合する規則を最後に無効化する
  prettier,
]);
