import { describe, expect, it } from 'vitest';

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
