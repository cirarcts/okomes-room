import { stripBase, withBase } from './paths';

export const locales = ['ja', 'en'] as const;
export type Locale = (typeof locales)[number];

export function getPageLocale(pathname: string) {
  const path = stripBase(import.meta.env.BASE_URL, pathname);
  if (path === '/en' || path.startsWith('/en/')) {
    return { locale: 'en', path: path.slice('/en'.length) || '/' } as const;
  }
  return { locale: 'ja', path } as const;
}

/** 言語接頭辞を含まないサイト内パスを、配信先と言語に対応するURLに変換する。 */
export function localizedPath(locale: Locale, path: string): string {
  return withBase(locale === 'en' ? `/en${path}` : path);
}
