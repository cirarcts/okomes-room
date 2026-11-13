/** 共通ナビゲーションの1項目。 */
export interface NavItem {
  /** 表示名 */
  label: string;
  /** 英字の補助ラベル */
  subLabel: string;
  /** サイト内パス（ベースパスを含まない。リンクにするときは `withBase()` を通す） */
  href: string;
}

/**
 * 共通ナビゲーションに並べるエリア。
 * エリアの追加・並び替え・URL変更はここだけを編集する。
 */
export const NAV_ITEMS: readonly NavItem[] = [
  { label: 'あしあと', subLabel: 'Footprints', href: '/footprints/' },
  { label: '展示室', subLabel: 'Exhibits', href: '/exhibits/' },
  { label: 'アトリエ', subLabel: 'Atelier', href: '/atelier/' },
];

/** 比較用に末尾スラッシュを必ず1つ付ける。 */
function ensureTrailingSlash(path: string): string {
  return `${path.replace(/\/+$/, '')}/`;
}

/**
 * 現在のページがナビゲーション項目の配下にあるかを判定する。
 * `/exhibits/kemper/` を見ているときは「展示室」を現在地として扱う。
 *
 * @param currentPath ベースパスを取り除いた現在のパス
 * @param href ナビゲーション項目のサイト内パス
 */
export function isActivePath(currentPath: string, href: string): boolean {
  const current = ensureTrailingSlash(currentPath);
  const target = ensureTrailingSlash(href);
  // トップページは全ページの前方に一致してしまうため、完全一致のみとする
  if (target === '/') return current === '/';
  return current.startsWith(target);
}
