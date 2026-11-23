/**
 * 区間の記録（開発環境専用、ブラウザ専用）。
 * 再生中に「開始」「終了」を押して、`playlists.json` の項目として貼れるJSONを作る。
 * - 時刻は IFrame Player API の `getCurrentTime()`（公式のメソッド）で読む。
 * - タイトルは手動で記入したもの（おすすめ・プレイリストのカード）だけを書き写す。
 *   APIで取得したタイトルは書き写さず空にする（API Dataをリポジトリに保存しないため）。
 * - 公開ページには含めない（ページ側で `import.meta.env.DEV` のときだけ読み込む）。
 * - 開発者向けの道具のため、文言は日本語だけにする。
 */
import { segmentDraftJson } from './videoPlaylist';
import { formatDuration } from './videoShelf';
import type { VideoShelfPlayerHandle } from './videoShelfPlayer';

interface Recording {
  card: HTMLAnchorElement;
  startSeconds: number;
  endSeconds?: number;
}

export function initSegmentRecorder(handle: VideoShelfPlayerHandle | undefined): void {
  const root = document.querySelector<HTMLElement>('[data-segment-recorder]');
  if (!root || !handle) return;
  const startButton = root.querySelector<HTMLButtonElement>('[data-segment-start]');
  const endButton = root.querySelector<HTMLButtonElement>('[data-segment-end]');
  const clearButton = root.querySelector<HTMLButtonElement>('[data-segment-clear]');
  const copyButton = root.querySelector<HTMLButtonElement>('[data-segment-copy]');
  const statusEl = root.querySelector<HTMLElement>('[data-segment-status]');
  const output = root.querySelector<HTMLTextAreaElement>('[data-segment-output]');
  if (!startButton || !endButton || !clearButton || !copyButton || !statusEl || !output) return;

  let recording: Recording | undefined;
  const setStatus = (message: string) => (statusEl.textContent = message);
  const clock = (seconds: number) => formatDuration(Math.floor(seconds));

  /** 今の動画と再生位置。再生前やプレイヤーの準備中は読めない。 */
  const now = () => {
    const card = handle.currentCard();
    const time = handle.currentTime();
    if (!card || time === undefined) {
      setStatus('動画を再生してから押してください（プレイヤーの準備中は記録できません）。');
      return undefined;
    }
    return { card, time };
  };

  const render = () => {
    copyButton.disabled = true;
    output.value = '';
    if (!recording) return;
    const { card, startSeconds, endSeconds } = recording;
    const manualTitle = card.hasAttribute('data-manual-title');
    try {
      output.value = segmentDraftJson({
        video: card.dataset.videoId ?? '',
        channel: card.dataset.channel ?? '',
        title: manualTitle ? card.dataset.title : undefined,
        startSeconds,
        endSeconds,
      });
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
      return;
    }
    copyButton.disabled = false;
    setStatus(
      [
        `開始 ${clock(startSeconds)}`,
        endSeconds === undefined
          ? '終了 未記録（最後まで）'
          : `終了 ${clock(Math.ceil(endSeconds))}`,
        manualTitle ? '' : 'タイトルはYouTubeで確認して記入してください。',
      ]
        .filter(Boolean)
        .join(' / '),
    );
  };

  startButton.addEventListener('click', () => {
    const current = now();
    if (!current) return;
    recording = { card: current.card, startSeconds: current.time };
    render();
  });
  endButton.addEventListener('click', () => {
    const current = now();
    if (!current) return;
    if (!recording) {
      setStatus('先に開始を記録してください。');
      return;
    }
    if (recording.card.dataset.itemKey !== current.card.dataset.itemKey) {
      setStatus('開始を記録した動画と違います。開始から記録し直してください。');
      return;
    }
    recording = { ...recording, endSeconds: current.time };
    render();
  });
  clearButton.addEventListener('click', () => {
    recording = undefined;
    render();
    setStatus('');
  });
  copyButton.addEventListener('click', () => {
    navigator.clipboard
      .writeText(output.value)
      .then(() => setStatus('コピーしました。playlists.json の items に貼り付けてください。'))
      .catch(() => {
        output.select();
        setStatus('コピーできませんでした。テキストを選択したので、手動でコピーしてください。');
      });
  });
}
