import { afterEach, describe, expect, it, vi } from 'vitest';

import { buildEmbedUrl, classifyPlayerError } from './youtubePlayer';

describe('classifyPlayerError', () => {
  it.each([
    [100, 'notFound'],
    [101, 'notEmbeddable'],
    [150, 'notEmbeddable'],
    [153, 'identification'],
    [5, 'playback'],
    [2, 'playback'],
    [999, 'playback'],
  ] as const)('コード %d は %s', (code, kind) => {
    expect(classifyPlayerError(code)).toBe(kind);
  });
});

describe('attachPlayer', () => {
  // ブラウザの window / document を最小限で置き換える。
  function stubBrowser(options: { onScript?: (win: Record<string, unknown>) => void } = {}) {
    const win: Record<string, unknown> = {
      setTimeout: globalThis.setTimeout,
      clearTimeout: globalThis.clearTimeout,
    };
    vi.stubGlobal('window', win);
    vi.stubGlobal('document', {
      createElement: () => ({}),
      head: { append: () => options.onScript?.(win) },
    });
    return win;
  }

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  const iframe = {} as HTMLIFrameElement;

  it('スクリプトが読み込まれないまま時間が過ぎたら失敗する', async () => {
    vi.useFakeTimers();
    stubBrowser();
    const { attachPlayer } = await import('./youtubePlayer');
    const attached = attachPlayer(iframe, {});
    const assertion = expect(attached).rejects.toThrow(/時間内/);
    await vi.advanceTimersByTimeAsync(15_000);
    await assertion;
  });

  it('onReady が来るまで解決せず、来たらプレイヤーを返す', async () => {
    let fireReady: (() => void) | undefined;
    const player = { loadVideoById: vi.fn() };
    stubBrowser({
      onScript: (win) => {
        win.YT = {
          Player: function (_el: unknown, options: { events: { onReady: () => void } }) {
            fireReady = options.events.onReady;
            return player;
          },
        };
        (win.onYouTubeIframeAPIReady as () => void)();
      },
    });
    const { attachPlayer } = await import('./youtubePlayer');
    let resolved: unknown;
    const attached = attachPlayer(iframe, {}).then((value) => (resolved = value));
    await Promise.resolve();
    await Promise.resolve();
    expect(resolved).toBeUndefined();
    fireReady?.();
    await attached;
    expect(resolved).toBe(player);
  });

  it('onReady が来ないまま時間が過ぎたら失敗する', async () => {
    vi.useFakeTimers();
    stubBrowser({
      onScript: (win) => {
        win.YT = { Player: function () {} };
        (win.onYouTubeIframeAPIReady as () => void)();
      },
    });
    const { attachPlayer } = await import('./youtubePlayer');
    const attached = attachPlayer(iframe, {});
    const assertion = expect(attached).rejects.toThrow(/時間内/);
    await vi.advanceTimersByTimeAsync(15_000);
    await assertion;
  });
});

describe('buildEmbedUrl', () => {
  const base = { embedBaseUrl: 'https://www.youtube-nocookie.com/embed/', videoId: 'aaaaaaaaaaa' };

  it('IFrame API用のパラメータと送信元を付ける', () => {
    const url = new URL(buildEmbedUrl({ ...base, autoplay: false }, 'https://example.com'));
    expect(url.pathname).toBe('/embed/aaaaaaaaaaa');
    expect(url.searchParams.get('enablejsapi')).toBe('1');
    expect(url.searchParams.get('origin')).toBe('https://example.com');
    expect(url.searchParams.has('autoplay')).toBe(false);
    expect(url.searchParams.has('start')).toBe(false);
    expect(url.searchParams.has('end')).toBe(false);
  });

  it('自動再生と区間を指定できる', () => {
    const url = new URL(
      buildEmbedUrl(
        { ...base, autoplay: true, startSeconds: 750, endSeconds: 1125 },
        'https://example.com',
      ),
    );
    expect(url.searchParams.get('autoplay')).toBe('1');
    expect(url.searchParams.get('start')).toBe('750');
    expect(url.searchParams.get('end')).toBe('1125');
  });

  it('開始が0秒でもパラメータを付ける', () => {
    const url = new URL(
      buildEmbedUrl({ ...base, autoplay: false, startSeconds: 0 }, 'https://example.com'),
    );
    expect(url.searchParams.get('start')).toBe('0');
  });
});
