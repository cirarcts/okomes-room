import { afterEach, describe, expect, it, vi } from 'vitest';

import { classifyPlayerError } from './youtubePlayer';

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
