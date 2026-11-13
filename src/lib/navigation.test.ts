import { describe, expect, it } from 'vitest';

import { isActivePath, NAV_ITEMS } from './navigation';

describe('isActivePath', () => {
  it('同じパスは現在地として扱う', () => {
    expect(isActivePath('/exhibits/', '/exhibits/')).toBe(true);
  });

  it('末尾スラッシュの有無に影響されない', () => {
    expect(isActivePath('/exhibits', '/exhibits/')).toBe(true);
    expect(isActivePath('/exhibits/', '/exhibits')).toBe(true);
  });

  it('配下のページも現在地として扱う', () => {
    expect(isActivePath('/exhibits/kemper/', '/exhibits/')).toBe(true);
  });

  it('別のエリアは現在地としない', () => {
    expect(isActivePath('/atelier/', '/exhibits/')).toBe(false);
    expect(isActivePath('/', '/exhibits/')).toBe(false);
  });

  it('名前が前方一致するだけの別パスは現在地としない', () => {
    expect(isActivePath('/exhibits-archive/', '/exhibits/')).toBe(false);
  });

  it('トップページは完全一致のときだけ現在地とする', () => {
    expect(isActivePath('/', '/')).toBe(true);
    expect(isActivePath('/exhibits/', '/')).toBe(false);
  });
});

describe('NAV_ITEMS', () => {
  it('hrefは / で始まり / で終わる', () => {
    for (const item of NAV_ITEMS) {
      expect(item.href).toMatch(/^\/.+\/$/);
    }
  });

  it('hrefが重複していない', () => {
    const hrefs = NAV_ITEMS.map((item) => item.href);
    expect(new Set(hrefs).size).toBe(hrefs.length);
  });
});
