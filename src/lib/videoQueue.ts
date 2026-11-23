/**
 * 動画の棚の再生キュー。キューは1つの棚（おすすめ、チャンネルの新着、代表作など）の中だけで作り、
 * APIで取得した棚ではチャンネルをまたがない（規約 III.E.2 の集約を避けるため）。
 * キューの項目は「項目のキー」で表す。通常は動画IDそのもので、プレイリストの区間の項目は
 * 区間を含むキーになる（同じ動画の別の区間を別の項目として扱うため。videoPlaylist.ts）。
 * DOMに依存しない純粋関数だけを置く。
 */

export interface VideoQueue {
  /** 棚の識別子 */
  id: string;
  /** 棚の表示名（例：「FIA World Endurance Championship の新着」） */
  label: string;
  /** 棚に並ぶ順の項目のキー */
  keys: readonly string[];
}

export interface QueueStepOptions {
  /** 飛ばす項目のキー（再生できない動画や、絞り込みで隠れている動画） */
  skip?: ReadonlySet<string>;
}

function step(
  queue: VideoQueue,
  currentId: string,
  direction: 1 | -1,
  { skip }: QueueStepOptions,
): string | undefined {
  const start = queue.keys.indexOf(currentId);
  if (start === -1) return undefined;
  for (let index = start + direction; index >= 0 && index < queue.keys.length; index += direction) {
    const id = queue.keys[index];
    // 同じ動画が棚に重複している場合も、今の動画には戻らない。
    if (id !== currentId && !skip?.has(id)) return id;
  }
  return undefined;
}

/** 次に再生する項目のキー。棚の最後なら `undefined`。 */
export function findNext(
  queue: VideoQueue,
  currentId: string,
  options: QueueStepOptions = {},
): string | undefined {
  return step(queue, currentId, 1, options);
}

/** 前に再生する項目のキー。棚の先頭なら `undefined`。 */
export function findPrevious(
  queue: VideoQueue,
  currentId: string,
  options: QueueStepOptions = {},
): string | undefined {
  return step(queue, currentId, -1, options);
}

/** 棚の中での位置（1始まり）。棚にない場合は `undefined`。 */
export function queuePosition(
  queue: VideoQueue,
  currentId: string,
): { index: number; total: number } | undefined {
  const index = queue.keys.indexOf(currentId);
  return index === -1 ? undefined : { index: index + 1, total: queue.keys.length };
}

/** 再生方法。`ordered` は棚の並び順、`shuffle` はランダム。 */
export type PlayOrder = 'ordered' | 'shuffle';

/** 棚の中で、先頭から最初に再生できる項目のキー。すべて飛ばす対象なら `undefined`。 */
export function findFirstPlayable(
  queue: VideoQueue,
  { skip }: QueueStepOptions = {},
): string | undefined {
  return queue.keys.find((id) => !skip?.has(id));
}

export interface ShuffleOptions {
  /** 0以上1未満の乱数を返す関数（テストで差し替える） */
  random?: () => number;
  /** 先頭に固定する項目のキー（ユーザーが選んだ動画から始める場合） */
  first?: string;
  /**
   * 最初に再生される位置に来てほしくない項目のキー（周回の境目で、直前の動画が続かないようにする）。
   * 再生できる動画がほかにある場合だけ避ける。
   */
  avoidFirst?: string;
  /** 再生できない動画（`avoidFirst` の判定で、最初に再生される位置を求めるのに使う） */
  skip?: ReadonlySet<string>;
}

/**
 * 棚の動画をシャッフルした再生順を返す（Fisher–Yates）。
 * 同じ動画が棚に重複していても、1周の中では1回だけにする。
 */
export function shuffleQueueKeys(
  keys: readonly string[],
  { random = Math.random, first, avoidFirst, skip }: ShuffleOptions = {},
): string[] {
  const ids = [...new Set(keys)].filter((id) => id !== first);
  for (let index = ids.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1));
    [ids[index], ids[swap]] = [ids[swap], ids[index]];
  }
  if (first !== undefined && keys.includes(first)) ids.unshift(first);

  if (avoidFirst !== undefined && avoidFirst !== first) {
    const playable = (id: string) => !skip?.has(id);
    const head = ids.findIndex(playable);
    if (head !== -1 && ids[head] === avoidFirst) {
      // 次に再生できる動画と入れ替える。ほかに再生できる動画がなければそのまま（同じ動画を繰り返す）。
      const other = ids.findIndex((id, index) => index > head && playable(id));
      if (other !== -1) [ids[head], ids[other]] = [ids[other], ids[head]];
    }
  }
  return ids;
}

/**
 * 要素が画面内に見えている面積の割合（0〜1）。
 * @param rect 要素の位置と大きさ（`getBoundingClientRect()` の値）
 * @param viewport 画面の大きさ
 */
export function visibleRatioOf(
  rect: { top: number; right: number; bottom: number; left: number },
  viewport: { width: number; height: number },
): number {
  const width = rect.right - rect.left;
  const height = rect.bottom - rect.top;
  if (width <= 0 || height <= 0) return 0;
  const visibleWidth = Math.max(0, Math.min(rect.right, viewport.width) - Math.max(rect.left, 0));
  const visibleHeight = Math.max(0, Math.min(rect.bottom, viewport.height) - Math.max(rect.top, 0));
  return (visibleWidth * visibleHeight) / (width * height);
}

/**
 * 連続再生で、次の動画をAPIから再生してよいか。
 * 規約（RMF）に合わせ、プレイヤーの半分を超えて見えていて、かつタブが表示中の場合に限る。
 */
export function canAutoplay(options: { visibleRatio: number; documentVisible: boolean }): boolean {
  return options.documentVisible && options.visibleRatio > 0.5;
}
