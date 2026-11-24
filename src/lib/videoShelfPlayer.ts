/**
 * 動画の棚の再生ステージを制御する（ブラウザ専用）。
 * - 動画を選ぶまでは案内だけを表示し、最初の動画が選ばれた時点で情報と操作欄を出す。
 * - カードを押すと、そのカードがある棚をキューにして再生する（キューはチャンネルをまたがない）。
 * - 「前へ」「次へ」で棚の中を移動する。再生できない動画と、絞り込みで外れた動画は飛ばす。
 *   「過去の動画を見る」で開いていない動画は、画面に出ていなくても再生の対象にする。
 * - キューの項目はカードの `data-item-key`（通常は動画ID、プレイリストの区間は区間を含むキー）で区別する。
 *   区間の項目は `data-start` / `data-end`（秒）の範囲だけを再生し、終わったら次へ進む。
 *   再生できない印は動画IDごとに付ける（同じ動画の別の区間も再生できないため）。
 * - 再生方法は「棚の順」と「ランダム」。ランダムでは棚の動画を1周ずつシャッフルし、1周の中で同じ動画を
 *   繰り返さない。「繰り返す」がONなら、棚の最後で最初に戻る（ランダムでは混ぜ直し、直前の動画は続けない）。
 *   プレイリストの項目に重み（`data-weight`）があれば、重い項目ほど周の前のほうに来やすくする。
 * - 連続再生は常にON。動画の終了後に次へ進む。自動で再生するのは、プレイヤーの半分を超えて
 *   見えていて、かつタブが表示中の場合だけ（規約 RMF）。それ以外は準備だけしてユーザーの操作を待つ。
 * - 「次に流れる動画」に、今の動画の後に再生される数本を並べる（押すとその動画へ移る）。
 * - 再生プリセット（`?preset=<id>` のリンク）は、棚と再生方法・繰り返しをまとめて設定して先頭から再生する。
 *   タグのプリセットは、そのタグを持つプレイリストの項目を、プレイリストをまたいで集めたキューにする。
 *   URLから開いた場合は自動で再生せず、準備だけする。
 */
import { formatSegment, parseTagKeys } from './videoPlaylist';
import { presetIdFromSearch } from './videoPreset';
import { VIDEO_ID_PATTERN } from './videoShelf';
import {
  canAutoplay,
  findFirstPlayable,
  findNext,
  findPrevious,
  queuePosition,
  shuffleQueueKeys,
  upcomingKeys,
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

/** 「次に流れる動画」に並べる件数。 */
const UP_NEXT_LIMIT = 5;

function query<T extends Element>(root: ParentNode, selector: string): T | null {
  return root.querySelector<T>(selector);
}

/** 再生ステージの状態を読むための窓口（開発環境の区間の記録で使う）。 */
export interface VideoShelfPlayerHandle {
  /** 今の項目のカード。まだ選ばれていなければ `undefined` */
  currentCard(): HTMLAnchorElement | undefined;
  /** 今の再生位置（秒）。プレイヤーをAPIで制御できない場合は `undefined` */
  currentTime(): number | undefined;
}

export function initVideoShelfPlayer(): VideoShelfPlayerHandle | undefined {
  const stage = query<HTMLElement>(document, '[data-video-stage]');
  if (!stage) return undefined;

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
  const upNextEl = query<HTMLDetailsElement>(document, '[data-player-upnext]');
  const upNextList = query<HTMLOListElement>(document, '[data-player-upnext-list]');
  const upNextNote = query<HTMLElement>(document, '[data-player-upnext-note]');
  const presetsEl = query<HTMLElement>(document, '[data-player-presets]');
  const presetLinks = Array.from(
    document.querySelectorAll<HTMLAnchorElement>('[data-preset-link]'),
  );
  if (!frame) return undefined;

  const cards = Array.from(document.querySelectorAll<HTMLAnchorElement>('[data-video-card]'));
  const keyOf = (card: HTMLElement) => card.dataset.itemKey ?? card.dataset.videoId ?? '';
  const secondsOf = (value: string | undefined) => {
    const seconds = value === undefined || value === '' ? NaN : Number(value);
    return Number.isFinite(seconds) && seconds >= 0 ? seconds : undefined;
  };
  const text = (key: string) => controls?.dataset[key] ?? '';

  /** キューと、その項目のカード。カードの並び順がそのまま再生順になる。 */
  interface QueueSource {
    queue: VideoQueue;
    cards: HTMLAnchorElement[];
  }
  const createSource = (
    id: string,
    label: string,
    sourceCards: HTMLAnchorElement[],
  ): QueueSource => {
    // ランダム再生の重み（プレイリストの項目だけが持つ）。キューごとに持ち、ほかの棚の同じ動画には効かせない。
    const weights = new Map<string, number>();
    for (const card of sourceCards) {
      const weight = Number(card.dataset.weight);
      if (Number.isFinite(weight) && weight > 0 && weight !== 1 && !weights.has(keyOf(card))) {
        weights.set(keyOf(card), weight);
      }
    }
    return {
      queue: {
        id,
        label,
        keys: sourceCards.map(keyOf),
        weights: weights.size > 0 ? weights : undefined,
      },
      cards: sourceCards,
    };
  };

  // 棚ごとのキュー。
  const shelfSources = new Map<HTMLElement, QueueSource>();
  for (const element of document.querySelectorAll<HTMLElement>('[data-queue-id]')) {
    shelfSources.set(
      element,
      createSource(
        element.dataset.queueId ?? '',
        element.dataset.queueLabel ?? '',
        Array.from(element.querySelectorAll<HTMLAnchorElement>('[data-video-card]')),
      ),
    );
  }

  /**
   * タグのキュー（タグのプリセット用）。そのタグを持つ項目を、プレイリストの並び順でまたいで集める。
   * タグはプレイリストの項目（手動で記入したデータ）にだけあるため、APIの棚の動画は含まれない。
   * 同じ項目（同じ動画・同じ区間）が複数のプレイリストにあれば、最初のカードだけを使う。
   */
  const tagSource = (tag: string, label: string): QueueSource => {
    const seen = new Set<string>();
    const tagged = cards.filter((card) => {
      const key = keyOf(card);
      const tags = parseTagKeys(card.closest<HTMLElement>('[data-video-item]')?.dataset.tags);
      if (!tags.includes(tag) || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    return createSource(`tag:${tag}`, label, tagged);
  };

  const unplayable = new Set<string>();
  let source: QueueSource | undefined;
  let currentKey: string | undefined;
  let player: YouTubePlayer | undefined;
  let playerReady: Promise<YouTubePlayer | undefined> | undefined;
  let playOrder: PlayOrder = 'ordered';
  let repeat = false;
  // ランダム再生中の1周分の再生順（棚の動画IDのシャッフル）。
  let shuffledKeys: string[] | undefined;

  /** 押したカードがある棚、またはタグのプリセットのキュー（並び順は元のまま）。 */
  const currentQueue = () => source?.queue;
  /** 実際の再生順。ランダム再生中はシャッフルした順。 */
  const playQueue = (): VideoQueue | undefined => {
    const queue = currentQueue();
    return queue && playOrder === 'shuffle' && shuffledKeys
      ? { ...queue, keys: shuffledKeys }
      : queue;
  };
  // 今の動画を先頭にして、残りをシャッフルし直す。
  const reshuffleFrom = (key: string | undefined) => {
    const queue = currentQueue();
    shuffledKeys =
      queue && playOrder === 'shuffle'
        ? shuffleQueueKeys(queue.keys, { first: key, weights: queue.weights })
        : undefined;
  };

  const cardInQueue = (key: string) =>
    source?.cards.find((card) => keyOf(card) === key) ?? cards.find((card) => keyOf(card) === key);
  // 今の項目の動画ID。
  let currentVideoId: string | undefined;
  // 今の項目が読み込み後に再生を始めたか。区間の終了直後や同じ動画を読み直した直後に、
  // 終了（0）のイベントが余分に届くことがあるため、再生を始めた項目の終了だけで次へ進む。
  let startedSinceLoad = false;

  // 再生できない動画と、絞り込みで外れた動画を飛ばす。折りたたみで隠れているだけの動画は飛ばさない。
  const skipped = () => {
    const skip = new Set<string>();
    for (const card of source?.cards ?? []) {
      if (card.closest('[data-filtered-out]') || unplayable.has(card.dataset.videoId ?? '')) {
        skip.add(keyOf(card));
      }
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
    if (!queue || !shelf || !currentKey) return undefined;
    const skip = skipped();
    const next = findNext(queue, currentKey, { skip });
    if (next) return { id: next };
    if (!repeat) return undefined;
    if (playOrder === 'shuffle') {
      const ids = shuffleQueueKeys(shelf.keys, {
        avoidFirst: currentKey,
        skip,
        weights: shelf.weights,
      });
      const id = findFirstPlayable({ ...shelf, keys: ids }, { skip });
      return id
        ? { id, notice: text('msgQueueReshuffle'), apply: () => (shuffledKeys = ids) }
        : undefined;
    }
    const id = findFirstPlayable(shelf, { skip });
    return id ? { id, notice: text('msgQueueRepeat') } : undefined;
  };

  const updateControls = () => {
    const queue = playQueue();
    const skip = skipped();
    if (prevButton) {
      prevButton.disabled = !queue || !currentKey || !findPrevious(queue, currentKey, { skip });
    }
    if (nextButton) nextButton.disabled = !nextTarget();
    const position =
      queue && currentKey
        ? queuePosition(
            {
              ...queue,
              keys: queue.keys.filter((id) => id === currentKey || !skip.has(id)),
            },
            currentKey,
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
    renderUpNext(queue, skip);
  };

  // 「次に流れる動画」。番号は位置の表示と同じく、飛ばす動画を除いた並びで数える。
  function renderUpNext(queue: VideoQueue | undefined, skip: ReadonlySet<string>) {
    if (!upNextEl || !upNextList || !upNextNote) return;
    if (!queue || !currentKey) {
      upNextEl.hidden = true;
      return;
    }
    const counted = queue.keys.filter((id) => id === currentKey || !skip.has(id));
    const items = upcomingKeys(queue, currentKey, { skip, limit: UP_NEXT_LIMIT }).flatMap((key) => {
      const card = cardInQueue(key);
      return card ? [{ key, card, index: counted.indexOf(key) + 1 }] : [];
    });
    upNextList.replaceChildren(
      ...items.map(({ key, card, index }) => upNextItem(key, card, index)),
    );
    const lastShown = items.at(-1)?.key ?? currentKey;
    const more = findNext(queue, lastShown, { skip }) !== undefined;
    upNextNote.textContent = more
      ? ''
      : repeat
        ? text(playOrder === 'shuffle' ? 'msgUpNextReshuffle' : 'msgUpNextRepeat')
        : text('msgUpNextEnd');
    upNextEl.hidden = false;
  }

  function upNextItem(key: string, card: HTMLAnchorElement, index: number) {
    const item = document.createElement('li');
    const button = document.createElement('button');
    button.type = 'button';
    button.className =
      'hover:bg-surface focus-visible:bg-surface flex min-h-11 w-full items-center gap-3 rounded-md px-2 py-1.5 text-left';
    button.addEventListener('click', () => load(key, 'play'));

    const number = document.createElement('span');
    number.className = 'text-muted w-6 shrink-0 text-right font-mono text-xs';
    number.textContent = index > 0 ? String(index) : '';

    const thumbnail = card.querySelector('img');
    const image = document.createElement('img');
    image.className = 'aspect-video w-20 shrink-0 rounded-sm bg-black object-cover';
    image.alt = '';
    image.loading = 'lazy';
    image.decoding = 'async';
    if (thumbnail?.currentSrc || thumbnail?.src) image.src = thumbnail.currentSrc || thumbnail.src;

    const body = document.createElement('span');
    body.className = 'grid min-w-0 gap-0.5';
    const title = document.createElement('span');
    title.className = 'text-fg truncate text-sm';
    title.textContent = card.dataset.title ?? '';
    const meta = document.createElement('span');
    meta.className = 'text-muted truncate text-xs';
    const segment = formatSegment({
      startSeconds: secondsOf(card.dataset.start),
      endSeconds: secondsOf(card.dataset.end),
    });
    meta.textContent = [card.dataset.channelName, segment].filter(Boolean).join(' · ');
    body.append(title, meta);

    button.append(number, image, body);
    item.append(button);
    return item;
  }

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
      if (keyOf(other) === currentKey) other.setAttribute('aria-current', 'true');
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
    if (state === PlayerState.PLAYING) {
      startedSinceLoad = true;
      if (currentVideoId) clearUnplayable(currentVideoId);
    }
    if (state === PlayerState.ENDED && startedSinceLoad) {
      startedSinceLoad = false;
      advance();
    }
  };

  const handleError = (code: number) => {
    if (!currentVideoId) return;
    markUnplayable(currentVideoId);
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
    key: string,
    mode: LoadMode,
    options: { message?: (string | undefined)[]; focusPlayer?: boolean } = {},
  ) {
    const card = cardInQueue(key);
    const videoId = card?.dataset.videoId ?? '';
    if (!card || !VIDEO_ID_PATTERN.test(videoId) || !frame) return;
    currentKey = key;
    currentVideoId = videoId;
    startedSinceLoad = false;
    const segment = {
      startSeconds: secondsOf(card.dataset.start),
      endSeconds: secondsOf(card.dataset.end),
    };
    setMessage((options.message ?? []).filter(Boolean).join(' '));

    const switchVideo = (target: YouTubePlayer) => {
      const request = { videoId, ...segment };
      if (mode === 'play') target.loadVideoById(request);
      else target.cueVideoById(request);
    };
    // 初回（またはAPIが使えない場合）は、iframeを作り直す。
    const recreateFrame = () => {
      const iframe = createPlayerFrame({
        embedBaseUrl,
        videoId,
        ...segment,
        title: card.dataset.title ?? 'YouTube video player',
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
        if (currentKey !== key) return;
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

  // 選択中のプリセットの印。棚や再生方法を手で変えたら外す。
  const markPreset = (link: HTMLAnchorElement | undefined) => {
    for (const other of presetLinks) {
      if (other === link) other.setAttribute('aria-current', 'true');
      else other.removeAttribute('aria-current');
    }
  };

  const scrollToPlayer = () => {
    // プレイヤーが画面外にある場合（スマートフォンで一覧を下へ進んだときなど）は表示位置まで戻す。
    const rect = frame.getBoundingClientRect();
    if (rect.top < 0 || rect.bottom > window.innerHeight) {
      const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      frame.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'center' });
    }
  };

  // プリセットのキュー。タグのプリセットはタグのキュー、それ以外は指定した棚のキュー。
  const presetSources = new Map<HTMLAnchorElement, QueueSource | undefined>();
  const presetSource = (link: HTMLAnchorElement) => {
    if (!presetSources.has(link)) {
      const { presetTag, presetQueue, presetName } = link.dataset;
      const element = presetQueue
        ? document.querySelector<HTMLElement>(`[data-queue-id="${CSS.escape(presetQueue)}"]`)
        : null;
      presetSources.set(
        link,
        presetTag
          ? tagSource(presetTag, presetName ?? '')
          : element
            ? shelfSources.get(element)
            : undefined,
      );
    }
    return presetSources.get(link);
  };

  /**
   * プリセットの棚・再生方法・繰り返しを設定し、最初に再生できる動画を読み込む。
   * @returns 読み込めたか（棚がない、または再生できる動画がない場合は false）
   */
  const applyPreset = (link: HTMLAnchorElement, mode: LoadMode) => {
    const target = presetSource(link);
    if (!target) return false;
    const shelf = target.queue;
    playOrder = link.dataset.presetOrder === 'shuffle' ? 'shuffle' : 'ordered';
    repeat = link.dataset.presetRepeat === 'true';
    for (const input of orderInputs) input.checked = input.value === playOrder;
    if (repeatToggle) repeatToggle.checked = repeat;
    source = target;
    const skip = skipped();
    shuffledKeys =
      playOrder === 'shuffle'
        ? shuffleQueueKeys(shelf.keys, { skip, weights: shelf.weights })
        : undefined;
    const queue = playQueue();
    const first = queue ? findFirstPlayable(queue, { skip }) : undefined;
    const name = link.dataset.presetName ?? '';
    if (!first) {
      setMessage((presetsEl?.dataset.msgPresetEmpty ?? '').replace('{name}', name));
      return false;
    }
    const isFirstPlay = !player && !playerReady;
    load(first, mode, {
      focusPlayer: mode === 'play' && isFirstPlay,
      message: [
        mode === 'cue' ? (presetsEl?.dataset.msgPresetCued ?? '').replace('{name}', name) : '',
      ],
    });
    markPreset(link);
    return true;
  };

  // ユーザーがカードやボタンを押して再生を始める。
  const playFromCard = (card: HTMLAnchorElement) => {
    if (!VIDEO_ID_PATTERN.test(card.dataset.videoId ?? '')) return false;
    const key = keyOf(card);
    markPreset(undefined);
    const shelf = card.closest<HTMLElement>('[data-queue-id]');
    source = shelf ? shelfSources.get(shelf) : undefined;
    reshuffleFrom(key);
    const isFirstPlay = !player && !playerReady;
    load(key, 'play', { focusPlayer: isFirstPlay });
    scrollToPlayer();
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
      queue && currentKey ? findPrevious(queue, currentKey, { skip: skipped() }) : undefined;
    if (target) load(target, 'play');
  });
  nextButton?.addEventListener('click', () => {
    const next = nextTarget();
    if (!next) return;
    next.apply?.();
    load(next.id, 'play', { message: [next.notice] });
  });
  for (const link of presetLinks) {
    link.addEventListener('click', (event) => {
      // 修飾キー付きのクリックは通常のリンクとして開く（新しいタブでは準備だけする）。
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
        return;
      }
      event.preventDefault();
      if (applyPreset(link, 'play')) scrollToPlayer();
    });
  }
  repeatToggle?.addEventListener('change', () => {
    repeat = repeatToggle.checked;
    markPreset(undefined);
    updateControls();
  });
  for (const input of orderInputs) {
    input.addEventListener('change', () => {
      if (!input.checked) return;
      playOrder = input.value === 'shuffle' ? 'shuffle' : 'ordered';
      markPreset(undefined);
      // 再生中に切り替えた場合は、今の動画から新しい順で続ける。
      reshuffleFrom(currentKey);
      setMessage('');
      updateControls();
    });
  }
  document.addEventListener(FILTER_CHANGE_EVENT, updateControls);

  // JavaScriptが使えるときだけステージを出す。動画が選ばれるまでは案内を表示したままにする。
  // ブラウザが戻ったときに復元するフォームの状態は使わず、初期値に揃える。
  if (repeatToggle) repeatToggle.checked = false;
  for (const input of orderInputs) input.checked = input.value === 'ordered';
  // 棚が空（動画の取得に失敗したなど）や、タグを持つ項目がないプリセットは出さない。
  for (const link of presetLinks) {
    const item = link.closest('li');
    if (item) item.hidden = (presetSource(link)?.queue.keys.length ?? 0) === 0;
  }
  if (presetsEl) presetsEl.hidden = presetLinks.every((link) => link.closest('li')?.hidden);
  stage.hidden = false;

  // URLでプリセットが指定されていれば、準備だけする（自動では再生しない）。
  const presetId = presetIdFromSearch(window.location.search);
  const presetLink = presetId
    ? presetLinks.find((link) => link.dataset.presetId === presetId)
    : undefined;
  if (presetLink) applyPreset(presetLink, 'cue');

  return {
    currentCard: () => (currentKey ? cardInQueue(currentKey) : undefined),
    currentTime: () => {
      const time = player?.getCurrentTime();
      return typeof time === 'number' && Number.isFinite(time) ? time : undefined;
    },
  };
}
