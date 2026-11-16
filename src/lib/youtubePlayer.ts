/**
 * YouTube IFrame Player API の薄いラッパー（ブラウザ専用）。
 * - 公式スクリプト（https://www.youtube.com/iframe_api）は、初めて再生するときに1回だけ読み込む。
 * - iframe はプライバシー強化モード（youtube-nocookie.com）で自分で作り、公式の「既存のiframe」の方法で制御する。
 * - 使うのは文書化されたメソッドとイベントだけ（プレイヤーの改変はしない）。
 */

const IFRAME_API_URL = 'https://www.youtube.com/iframe_api';

/** `onStateChange` の値（公式の定義）。 */
export const PlayerState = {
  UNSTARTED: -1,
  ENDED: 0,
  PLAYING: 1,
  PAUSED: 2,
  BUFFERING: 3,
  CUED: 5,
} as const;

/** 使う範囲だけを宣言した YT.Player の型（`@types/youtube` は追加しない）。 */
export interface YouTubePlayer {
  loadVideoById(videoId: string): void;
  cueVideoById(videoId: string): void;
  playVideo(): void;
  destroy(): void;
}

interface PlayerEvent<T = undefined> {
  data: T;
}

interface YouTubeNamespace {
  Player: new (
    element: HTMLIFrameElement,
    options: {
      events: {
        onReady?: () => void;
        onStateChange?: (event: PlayerEvent<number>) => void;
        onError?: (event: PlayerEvent<number>) => void;
        onAutoplayBlocked?: () => void;
      };
    },
  ) => YouTubePlayer;
}

declare global {
  interface Window {
    YT?: YouTubeNamespace;
    onYouTubeIframeAPIReady?: () => void;
  }
}

let apiPromise: Promise<YouTubeNamespace> | undefined;

/** 公式スクリプトを読み込む。2回目以降は同じPromiseを返す。 */
export function loadIframeApi(): Promise<YouTubeNamespace> {
  apiPromise ??= new Promise<YouTubeNamespace>((resolve, reject) => {
    if (window.YT?.Player) {
      resolve(window.YT);
      return;
    }
    const previous = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      previous?.();
      if (window.YT?.Player) resolve(window.YT);
      else reject(new Error('YouTube IFrame Player API を初期化できませんでした。'));
    };
    const script = document.createElement('script');
    script.src = IFRAME_API_URL;
    script.async = true;
    script.onerror = () => {
      apiPromise = undefined;
      reject(new Error('YouTube IFrame Player API を読み込めませんでした。'));
    };
    document.head.append(script);
  });
  return apiPromise;
}

export interface PlayerHandlers {
  onReady?: () => void;
  onStateChange?: (state: number) => void;
  onError?: (code: number) => void;
  onAutoplayBlocked?: () => void;
}

/**
 * プライバシー強化モードのiframeを作り、`container` の中身と置き換える。
 * APIの読み込みに失敗しても、iframe自体は通常の埋め込みとして再生できる。
 */
export function createPlayerFrame(options: {
  embedBaseUrl: string;
  videoId: string;
  title: string;
  autoplay: boolean;
}): HTMLIFrameElement {
  const params = new URLSearchParams({
    enablejsapi: '1',
    // IFrame API の推奨に従い、送信元を明示する。
    origin: window.location.origin,
  });
  if (options.autoplay) params.set('autoplay', '1');

  const iframe = document.createElement('iframe');
  iframe.src = `${options.embedBaseUrl}${encodeURIComponent(options.videoId)}?${params.toString()}`;
  iframe.title = options.title;
  iframe.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen';
  // プレイヤーの識別に Referer が必要（RMF）。抑制しない。
  iframe.referrerPolicy = 'strict-origin-when-cross-origin';
  iframe.className = 'absolute inset-0 size-full';
  return iframe;
}

/** `onReady` を待つ上限。これを過ぎたら、APIは使えないものとして扱う。 */
const READY_TIMEOUT_MS = 15_000;

/**
 * 作成済みのiframeをAPIで制御できるようにする。
 * プレイヤーがAPIの呼び出しを受け付けるのは `onReady` 以降のため、それまで解決しない。
 * スクリプトの読み込みから `onReady` までを合わせて待ち時間を制限し、超えたら失敗として扱う
 * （呼び出し側は通常の埋め込みとして再生を続ける）。
 */
export function attachPlayer(
  iframe: HTMLIFrameElement,
  handlers: PlayerHandlers,
): Promise<YouTubePlayer> {
  return new Promise<YouTubePlayer>((resolve, reject) => {
    let settled = false;
    const timer = window.setTimeout(() => {
      settled = true;
      reject(new Error('YouTubeプレイヤーの準備が時間内に完了しませんでした。'));
    }, READY_TIMEOUT_MS);
    const fail = (error: unknown) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      reject(error);
    };

    loadIframeApi()
      .then((YT) => {
        if (settled) return;
        const player = new YT.Player(iframe, {
          events: {
            onReady: () => {
              if (settled) return;
              settled = true;
              window.clearTimeout(timer);
              handlers.onReady?.();
              resolve(player);
            },
            onStateChange: (event) => handlers.onStateChange?.(event.data),
            onError: (event) => handlers.onError?.(event.data),
            onAutoplayBlocked: handlers.onAutoplayBlocked,
          },
        });
      })
      .catch(fail);
  });
}

export type PlayerErrorKind = 'notFound' | 'notEmbeddable' | 'playback' | 'identification';

/** `onError` のコードを、表示用の種類に分ける。 */
export function classifyPlayerError(code: number): PlayerErrorKind {
  if (code === 100) return 'notFound';
  if (code === 101 || code === 150) return 'notEmbeddable';
  if (code === 153) return 'identification';
  return 'playback';
}
