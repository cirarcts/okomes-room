/**
 * サブパス配信（GitHub Pages の `/<リポジトリ名>/`）に対応するためのパス操作。
 * 内部リンクは `/foo` と直書きせず、必ず `withBase()` を通す。
 */

/** 末尾のスラッシュを取り除く（ルート `/` は空文字になる）。 */
function trimTrailingSlashes(value: string): string {
  return value.replace(/\/+$/, '');
}

/** ベースパスとサイト内パスを結合する。 */
export function joinBase(base: string, path: string): string {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${trimTrailingSlashes(base)}${normalizedPath}`;
}

/** URLのパス名からベースパスを取り除き、サイト内パス（`/` 始まり）に戻す。 */
export function stripBase(base: string, pathname: string): string {
  const normalizedBase = trimTrailingSlashes(base);
  if (normalizedBase === '') return pathname;
  if (pathname === normalizedBase) return '/';
  // `/okomes-room-2/` のような別パスを誤って削らないよう、区切りの `/` まで含めて判定する
  if (pathname.startsWith(`${normalizedBase}/`)) return pathname.slice(normalizedBase.length);
  return pathname;
}

/** サイト内パスを、現在のビルド設定のベースパス付きに変換する。 */
export function withBase(path: string): string {
  return joinBase(import.meta.env.BASE_URL, path);
}
