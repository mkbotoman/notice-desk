import { afterEach, describe, expect, it, vi } from 'vitest';
import { copyRichText } from './clipboard';

class FakeItem {
  constructor(readonly data: Record<string, Blob>) {}
}

afterEach(() => vi.unstubAllGlobals());

describe('copyRichText', () => {
  it('writes plain text and HTML together when it can', async () => {
    const write = vi.fn().mockResolvedValue(undefined);
    const writeText = vi.fn();
    vi.stubGlobal('navigator', { clipboard: { write, writeText } });
    vi.stubGlobal('ClipboardItem', FakeItem);
    expect(await copyRichText('plain', '<p>rich</p>')).toBe(true);
    const item = write.mock.calls[0][0][0] as FakeItem;
    expect(Object.keys(item.data)).toEqual(['text/plain', 'text/html']);
    expect(writeText).not.toHaveBeenCalled();
  });

  it('falls back to plain text when the rich write is refused', async () => {
    const write = vi.fn().mockRejectedValue(new Error('denied'));
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { clipboard: { write, writeText } });
    vi.stubGlobal('ClipboardItem', FakeItem);
    expect(await copyRichText('plain', '<p>rich</p>')).toBe(true);
    expect(writeText).toHaveBeenCalledWith('plain');
  });

  it('uses plain text when rich items are not supported', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    vi.stubGlobal('ClipboardItem', undefined);
    expect(await copyRichText('plain', '')).toBe(true);
    expect(writeText).toHaveBeenCalledWith('plain');
  });

  it('uses plain text when write is missing', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    vi.stubGlobal('ClipboardItem', FakeItem);
    expect(await copyRichText('plain', '')).toBe(true);
  });

  it('reports failure when nothing can be copied', async () => {
    vi.stubGlobal('navigator', {
      clipboard: { writeText: vi.fn().mockRejectedValue(new Error('no')) },
    });
    vi.stubGlobal('ClipboardItem', undefined);
    expect(await copyRichText('plain', '')).toBe(false);
    vi.stubGlobal('navigator', {});
    expect(await copyRichText('plain', '')).toBe(false);
    vi.stubGlobal('navigator', undefined);
    expect(await copyRichText('plain', '')).toBe(false);
  });
});
