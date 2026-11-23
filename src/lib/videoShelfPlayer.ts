/**
 * 動画の棚の再生ステージを制御する（ブラウザ専用）。
 * - 動画を選ぶまでは案内だけを表示し、最初の動画が選ばれた時点で情報と操作欄を出す。
 * - カードを押すと、そのカードがある棚をキューにして再生する（キューはチャンネルをまたがない）。
 * - 「前へ」「次へ」で棚の中を移動する。再生できない動画と、絞り込みで外れた動画は飛ばす。
 *   「過去の動画を見る」で開いていない動画は、画面に出ていなくても再生の対象にする。
 * - 再生方法は「棚の順」と「ランダム」。ランダムでは棚の動画を1周ずつシャッフルし、1周の中で同じ動画を
 *   繰り返さない。「繰り返す」がONなら、棚の最後で最初に戻る（ランダムでは混ぜ直し、直前の動画は続けない）。
 * - 連続再生は常にON。動画の終了後に次へ進む。自動で再生するのは、プレイヤーの半分を超えて
 *   見えていて、かつタブが表示中の場合だけ（規約 RMF）。それ以外は準備だけしてユーザーの操作を待つ。
 */
import { VIDEO_ID_PATTERN } from './videoShelf';
import {
  canAutoplay,
  findFirstPlayable,
  findNext,
  findPrevious,
  queuePosition,
  shuffleVideoIds,
  visibleRatioOf,
  type PlayOrder,
  type VideoQueue,
} from './videoQueue';
import {
  PlayerState,
  attachPlayer,
  classifyPlayerError,
  createPlayerFrame,
  type PlayerErrorKind,
  type YouTubePlayer,
} from './youtubePlayer';

/** 絞り込みの結果が変わったときにページから送られるイベント。 */
export const FILTER_CHANGE_EVENT = 'video-shelf-filter-change';

type LoadMode = 'play' | 'cue';

function query<T extends Element>(root: ParentNode, selector: string): T | null {
  return root.querySelector<T>(selector);
}

export function initVideoShelfPlayer(): void {
  const stage = query<HTMLElement>(document, '[data-video-stage]');
  if (!stage) return;

  const embedBaseUrl = stage.dataset.embedBase ?? '';
  const frame = query<HTMLElement>(stage, '[data-stage-frame]');
  const infoEl = query<HTMLElement>(stage, '[data-stage-info]');
  const controls = query<HTMLElement>(document, '[data-player-controls]');
  const prevButton = query<HTMLButtonElement>(document, '[data-player-prev]');
  const nextButton = query<HTMLButtonElement>(document, '[data-player-next]');
  const positionEl = query<HTMLElement>(document, '[data-player-position]');
  const repeatToggle = query<HTMLInputElement>(document, '[data-player-repeat]');
  const orderInputs = Array.from(
    document.querySelectorAll<HTMLInputElement>('[data-player-order]'),
  );
  const messageEl = query<HTMLElement>(document, '[data-player-message]');
  if (!frame) return;

  const cards = Array.from(document.querySelectorAll<HTMLAnchorElement>('[data-video-card]'));
  const text = (key: string) => controls?.dataset[key] ?? '';

  // 棚ごとのキュー。カードの並び順がそのまま再生順になる。
  const queues = new Map<HTMLElement, VideoQueue>();
  for (const element of document.querySelectorAll<HTMLElement>('[data-queue-id]')) {
    queues.set(element, {
      id: element.dataset.queueId ?? '',
      label: element.dataset.queueLabel ?? '',
      videoIds: Array.from(
        element.querySelectorAll<HTMLElement>('[data-video-card]'),
        (card) => card.dataset.videoId ?? '',
      ),
    });
  }

  const unplayable = new Set<string>();
  let queueElement: HTMLElement | null = null;
  let currentId: string | undefined;
  let player: YouTubePlayer | undefined;
  let playerReady: Promise<YouTubePlayer | undefined> | undefined;
  let playOrder: PlayOrder = 'ordered';
  let repeat = false;
  // ランダム再生中の1周分の再生順（棚の動画IDのシャッフル）。
  let shuffledIds: string[] | undefined;

  /** 押したカードがある棚（並び順は棚のまま）。 */
  const currentQueue = () => (queueElement ? queues.get(queueElement) : undefined);
  /** 実際の再生順。ランダム再生中はシャッフルした順。 */
  const playQueue = (): VideoQueue | undefined => {
    const queue = currentQueue();
    return queue && playOrder === 'shuffle' && shuffledIds
      ? { ...queue, videoIds: shuffledIds }
      : queue;
  };
  // 今の動画を先頭にして、残りをシャッフルし直す。
  const reshuffleFrom = (videoId: string | undefined) => {
    const queue = currentQueue();
    shuffledIds =
      queue && playOrder === 'shuffle'
        ? shuffleVideoIds(queue.videoIds, { first: videoId })
        : undefined;
  };

  const cardInQueue = (videoId: string) =>
    queueElement?.querySelector<HTMLAnchorElement>(
      `[data-video-card][data-video-id="${CSS.escape(videoId)}"]`,
    ) ?? cards.find((card) => card.dataset.videoId === videoId);

  // 再生できない動画と、絞り込みで外れた動画を飛ばす。折りたたみで隠れているだけの動画は飛ばさない。
  const skipped = () => {
    const skip = new Set(unplayable);
    for (const card of queueElement?.querySelectorAll<HTMLElement>('[data-video-card]') ?? []) {
      if (card.closest('[data-filtered-out]')) skip.add(card.dataset.videoId ?? '');
    }
    return skip;
  };

  const setMessage = (message: string) => {
    if (messageEl) messageEl.textContent = message;
  };

  /**
   * 次に再生する動画。棚の最後で「繰り返す」がONなら最初に戻る。
   * ランダム再生では混ぜ直した順を `apply` で確定する（ボタンの有効判定では確定しない）。
   */
  const nextTarget = (): { id: string; notice?: string; apply?: () => void } | undefined => {
    const queue = playQueue();
    const shelf = currentQueue();
    if (!queue || !shelf || !currentId) return undefined;
    const skip = skipped();
    const next = findNext(queue, currentId, { skip });
    if (next) return { id: next };
    if (!repeat) return undefined;
    if (playOrder === 'shuffle') {
      const ids = shuffleVideoIds(shelf.videoIds, { avoidFirst: currentId, skip });
      const id = findFirstPlayable({ ...shelf, videoIds: ids }, { skip });
      return id
        ? { id, notice: text('msgQueueReshuffle'), apply: () => (shuffledIds = ids) }
        : undefined;
    }
    const id = findFirstPlayable(shelf, { skip });
    return id ? { id, notice: text('msgQueueRepeat') } : undefined;
  };

  const updateControls = () => {
    const queue = playQueue();
    const skip = skipped();
    if (prevButton) {
      prevButton.disabled = !queue || !currentId || !findPrevious(queue, currentId, { skip });
    }
    if (nextButton) nextButton.disabled = !nextTarget();
    const position =
      queue && currentId
        ? queuePosition(
            {
              ...queue,
              videoIds: queue.videoIds.filter((id) => id === currentId || !skip.has(id)),
            },
            currentId,
          )
        : undefined;
    if (positionEl) {
      positionEl.textContent =
        queue && position
          ? text(playOrder === 'shuffle' ? 'msgPositionShuffle' : 'msgPosition')
              .replace('{label}', queue.label)
              .replace('{index}', String(position.index))
              .replace('{total}', String(position.total))
          : '';
    }
  };

  // 今の動画のカードを、棚の横スクロールの中で見える位置に移す（ページの縦位置は変えない）。
  const revealCard = (card: HTMLElement | undefined) => {
    const list = card?.closest<HTMLElement>('[data-queue-id]');
    const item = card?.closest<HTMLElement>('li');
    // 折りたたみで隠れているカードは位置を測れないため、棚は動かさない。
    if (!list || !item || item.hidden || list.scrollWidth <= list.clientWidth) return;
    const listRect = list.getBoundingClientRect();
    const itemRect = item.getBoundingClientRect();
    if (itemRect.left >= listRect.left && itemRect.right <= listRect.right) return;
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    list.scrollBy({
      left: itemRect.left - listRect.left,
      behavior: reduceMotion ? 'auto' : 'smooth',
    });
  };

  // タイトル・公開元・YouTubeへのリンク。空の見出しやリンクを置かないよう、最初の動画が選ばれた時点で作る。
  let info:
    { title: HTMLElement; channel: HTMLAnchorElement; watch: HTMLAnchorElement } | undefined;
  const ensureInfo = () => {
    if (info || !infoEl) return info;
    const title = document.createElement('h2');
    title.className = 'text-lg font-semibold sm:text-xl';
    const channel = document.createElement('a');
    channel.className = 'text-accent hover:text-fg underline-offset-4 hover:underline';
    const watch = document.createElement('a');
    watch.className = 'hover:text-fg underline-offset-4 hover:underline';
    const arrow = document.createElement('span');
    arrow.setAttribute('aria-hidden', 'true');
    arrow.textContent = '↗';
    watch.append(`${infoEl.dataset.msgOpen ?? ''} `, arrow);
    const links = document.createElement('p');
    links.className = 'text-muted flex flex-wrap items-center gap-x-3 gap-y-1 text-sm';
    links.append(channel, watch);
    infoEl.replaceChildren(title, links);
    infoEl.hidden = false;
    info = { title, channel, watch };
    return info;
  };

  const showCurrent = (card: HTMLAnchorElement | undefined) => {
    if (!card) return;
    const { title: titleEl, channel: channelEl, watch: watchEl } = ensureInfo() ?? {};
    if (titleEl && card.dataset.title) titleEl.textContent = card.dataset.title;
    // プレイヤーを使い回すときも、iframeの名前（スクリーンリーダーが読み上げる）を今の動画に合わせる。
    const iframe = frame.querySelector('iframe');
    if (iframe && card.dataset.title) iframe.title = card.dataset.title;
    if (channelEl && card.dataset.channelName && card.dataset.channelUrl) {
      channelEl.textContent = card.dataset.channelName;
      channelEl.href = card.dataset.channelUrl;
    }
    if (watchEl) watchEl.href = card.href;
    // 同じ動画が複数の棚にある場合は、すべてを選択中にする。
    for (const other of cards) {
      if (other.dataset.videoId === currentId) other.setAttribute('aria-current', 'true');
      else other.removeAttribute('aria-current');
    }
    revealCard(card);
  };

  const markUnplayable = (videoId: string) => {
    unplayable.add(videoId);
    for (const card of cards) {
      if (card.dataset.videoId === videoId) {
        card.closest<HTMLElement>('[data-video-item]')?.setAttribute('data-unplayable', '');
      }
    }
  };

  // 再生できなかった動画が、再試行で再生できた場合は印を外す。
  const clearUnplayable = (videoId: string) => {
    if (!unplayable.delete(videoId)) return;
    for (const card of cards) {
      if (card.dataset.videoId === videoId) {
        card.closest<HTMLElement>('[data-video-item]')?.removeAttribute('data-unplayable');
      }
    }
    setMessage('');
    updateControls();
  };

  const errorMessage = (kind: PlayerErrorKind) =>
    ({
      notFound: text('msgNotFound'),
      notEmbeddable: text('msgNotEmbeddable'),
      identification: text('msgIdentification'),
      playback: text('msgPlayback'),
    })[kind];

  const autoplayAllowed = () =>
    // 判定の時点で、ステージが画面内にどれだけ見えているかを測る。
    canAutoplay({
      visibleRatio: visibleRatioOf(frame.getBoundingClientRect(), {
        width: window.innerWidth,
        height: window.innerHeight,
      }),
      documentVisible: document.visibilityState === 'visible',
    });

  // 連続再生で次へ進む。自動で再生できない状況では準備だけする。
  const advance = (reason?: string) => {
    const next = nextTarget();
    if (!next) {
      setMessage([reason, text('msgQueueEnd')].filter(Boolean).join(' '));
      return;
    }
    next.apply?.();
    const mode: LoadMode = autoplayAllowed() ? 'play' : 'cue';
    load(next.id, mode, {
      message: [reason, next.notice, mode === 'cue' ? text('msgCued') : ''],
    });
  };

  const handleStateChange = (state: number) => {
    if (state === PlayerState.PLAYING && currentId) clearUnplayable(currentId);
    if (state === PlayerState.ENDED) advance();
  };

  const handleError = (code: number) => {
    if (!currentId) return;
    markUnplayable(currentId);
    const message = errorMessage(classifyPlayerError(code));
    updateControls();
    advance(message);
  };

  const ensurePlayer = (iframe: HTMLIFrameElement) => {
    playerReady = attachPlayer(iframe, {
      onStateChange: handleStateChange,
      onError: handleError,
      onAutoplayBlocked: () => setMessage(text('msgAutoplayBlocked')),
    })
      .then((created) => {
        player = created;
        return created;
      })
      // APIを読み込めなくても、iframe自体は通常の埋め込みとして再生できる（連続再生などは使えない）。
      .catch(() => {
        playerReady = undefined;
        return undefined;
      });
  };

  function load(
    videoId: string,
    mode: LoadMode,
    options: { message?: (string | undefined)[]; focusPlayer?: boolean } = {},
  ) {
    if (!VIDEO_ID_PATTERN.test(videoId) || !frame) return;
    currentId = videoId;
    const card = cardInQueue(videoId);
    setMessage((options.message ?? []).filter(Boolean).join(' '));

    const switchVideo = (target: YouTubePlayer) => {
      if (mode === 'play') target.loadVideoById(videoId);
      else target.cueVideoById(videoId);
    };
    // 初回（またはAPIが使えない場合）は、iframeを作り直す。
    const recreateFrame = () => {
      const iframe = createPlayerFrame({
        embedBaseUrl,
        videoId,
        title: card?.dataset.title ?? 'YouTube video player',
        autoplay: mode === 'play',
      });
      frame.replaceChildren(iframe);
      ensurePlayer(iframe);
      if (options.focusPlayer) iframe.focus({ preventScroll: true });
    };

    if (player) {
      switchVideo(player);
    } else if (playerReady) {
      // APIの準備中に切り替えた場合は、準備ができてから同じプレイヤーで切り替える。
      void playerReady.then((ready) => {
        if (currentId !== videoId) return;
        if (ready) switchVideo(ready);
        else recreateFrame();
      });
    } else {
      recreateFrame();
    }
    showCurrent(card);
    if (controls) controls.hidden = false;
    if (prevButton) prevButton.hidden = false;
    if (nextButton) nextButton.hidden = false;
    updateControls();
  }

  // ユーザーがカードやボタンを押して再生を始める。
  const playFromCard = (card: HTMLAnchorElement) => {
    const videoId = card.dataset.videoId ?? '';
    if (!VIDEO_ID_PATTERN.test(videoId)) return false;
    queueElement = card.closest<HTMLElement>('[data-queue-id]');
    reshuffleFrom(videoId);
    const isFirstPlay = !player && !playerReady;
    load(videoId, 'play', { focusPlayer: isFirstPlay });

    // プレイヤーが画面外にある場合（スマートフォンで一覧を下へ進んだときなど）は表示位置まで戻す。
    const rect = frame.getBoundingClientRect();
    if (rect.top < 0 || rect.bottom > window.innerHeight) {
      const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      frame.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'center' });
    }
    return true;
  };

  const handleCardClick = (event: MouseEvent, card: HTMLAnchorElement) => {
    // 修飾キー付きのクリックは通常のリンクとしてYouTubeで開く。
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
      return;
    }
    if (playFromCard(card)) event.preventDefault();
  };

  for (const card of cards) {
    card.addEventListener('click', (event) => handleCardClick(event, card));
  }
  prevButton?.addEventListener('click', () => {
    const queue = playQueue();
    const target =
      queue && currentId ? findPrevious(queue, currentId, { skip: skipped() }) : undefined;
    if (target) load(target, 'play');
  });
  nextButton?.addEventListener('click', () => {
    const next = nextTarget();
    if (!next) return;
    next.apply?.();
    load(next.id, 'play', { message: [next.notice] });
  });
  repeatToggle?.addEventListener('change', () => {
    repeat = repeatToggle.checked;
    updateControls();
  });
  for (const input of orderInputs) {
    input.addEventListener('change', () => {
      if (!input.checked) return;
      playOrder = input.value === 'shuffle' ? 'shuffle' : 'ordered';
      // 再生中に切り替えた場合は、今の動画から新しい順で続ける。
      reshuffleFrom(currentId);
      setMessage('');
      updateControls();
    });
  }
  document.addEventListener(FILTER_CHANGE_EVENT, updateControls);

  // JavaScriptが使えるときだけステージを出す。動画が選ばれるまでは案内を表示したままにする。
  // ブラウザが戻ったときに復元するフォームの状態は使わず、初期値に揃える。
  if (repeatToggle) repeatToggle.checked = false;
  for (const input of orderInputs) input.checked = input.value === 'ordered';
  stage.hidden = false;
}
