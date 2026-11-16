/**
 * 動画の棚の再生キュー。キューは1つの棚（おすすめ、チャンネルの新着、代表作など）の中だけで作り、
 * チャンネルをまたがない（規約 III.E.2 の集約を避けるため）。
 * DOMに依存しない純粋関数だけを置く。
 */

export interface VideoQueue {
  /** 棚の識別子 */
  id: string;
  /** 棚の表示名（例：「FIA World Endurance Championship の新着」） */
  label: string;
  /** 棚に並ぶ順の動画ID */
  videoIds: readonly string[];
}

export interface QueueStepOptions {
  /** 飛ばす動画ID（再生できない動画や、絞り込みで隠れている動画） */
  skip?: ReadonlySet<string>;
}

function step(
  queue: VideoQueue,
  currentId: string,
  direction: 1 | -1,
  { skip }: QueueStepOptions,
): string | undefined {
  const start = queue.videoIds.indexOf(currentId);
  if (start === -1) return undefined;
  for (
    let index = start + direction;
    index >= 0 && index < queue.videoIds.length;
    index += direction
  ) {
    const id = queue.videoIds[index];
    // 同じ動画が棚に重複している場合も、今の動画には戻らない。
    if (id !== currentId && !skip?.has(id)) return id;
  }
  return undefined;
}

/** 次に再生する動画ID。棚の最後なら `undefined`。 */
export function findNext(
  queue: VideoQueue,
  currentId: string,
  options: QueueStepOptions = {},
): string | undefined {
  return step(queue, currentId, 1, options);
}

/** 前に再生する動画ID。棚の先頭なら `undefined`。 */
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
  const index = queue.videoIds.indexOf(currentId);
  return index === -1 ? undefined : { index: index + 1, total: queue.videoIds.length };
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
