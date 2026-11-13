import { describe, expect, it } from 'vitest';

import { joinBase, stripBase } from './paths';

describe('joinBase', () => {
  it('ルート配信ではパスをそのまま返す', () => {
    expect(joinBase('/', '/exhibits/')).toBe('/exhibits/');
    expect(joinBase('/', '/')).toBe('/');
  });

  it('サブパス配信ではベースパスを前に付ける', () => {
    expect(joinBase('/okomes-room', '/exhibits/')).toBe('/okomes-room/exhibits/');
    expect(joinBase('/okomes-room', '/')).toBe('/okomes-room/');
  });

  it('ベースパス末尾のスラッシュの有無に影響されない', () => {
    expect(joinBase('/okomes-room/', '/atelier/')).toBe('/okomes-room/atelier/');
    expect(joinBase('/okomes-room//', '/atelier/')).toBe('/okomes-room/atelier/');
  });

  it('先頭スラッシュのないパスも受け付ける', () => {
    expect(joinBase('/okomes-room', 'favicon.svg')).toBe('/okomes-room/favicon.svg');
    expect(joinBase('/', 'favicon.svg')).toBe('/favicon.svg');
  });
});

describe('stripBase', () => {
  it('ルート配信ではパス名をそのまま返す', () => {
    expect(stripBase('/', '/exhibits/')).toBe('/exhibits/');
    expect(stripBase('/', '/')).toBe('/');
  });

  it('サブパス配信ではベースパスを取り除く', () => {
    expect(stripBase('/okomes-room', '/okomes-room/exhibits/')).toBe('/exhibits/');
    expect(stripBase('/okomes-room/', '/okomes-room/exhibits/kemper/')).toBe('/exhibits/kemper/');
  });

  it('ベースパスそのものはトップページとして扱う', () => {
    expect(stripBase('/okomes-room', '/okomes-room')).toBe('/');
    expect(stripBase('/okomes-room', '/okomes-room/')).toBe('/');
  });

  it('前方一致するだけの別パスは削らない', () => {
    expect(stripBase('/okomes-room', '/okomes-room-2/exhibits/')).toBe('/okomes-room-2/exhibits/');
    expect(stripBase('/okomes-room', '/other/')).toBe('/other/');
  });
});
