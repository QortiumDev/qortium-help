import { afterEach, describe, expect, it, vi } from 'vitest';
import { copyTextToClipboard } from './clipboard';

function mockDocument(execCommandResult: boolean) {
  const textarea = {
    value: '',
    style: {} as Record<string, string>,
    setAttribute: vi.fn(),
    focus: vi.fn(),
    select: vi.fn(),
    setSelectionRange: vi.fn(),
  };

  return {
    body: {
      appendChild: vi.fn(),
      removeChild: vi.fn(),
    },
    createElement: vi.fn(() => textarea),
    execCommand: vi.fn(() => execCommandResult),
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('copyTextToClipboard', () => {
  it('uses navigator.clipboard.writeText when available and succeeds', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);

    vi.stubGlobal('navigator', { clipboard: { writeText } });

    expect(await copyTextToClipboard('Hello')).toBe(true);
    expect(writeText).toHaveBeenCalledWith('Hello');
  });

  it('falls back to a textarea and uses document.execCommand when writeText is unavailable', async () => {
    const fallbackDocument = mockDocument(true);

    vi.stubGlobal('navigator', { clipboard: {} });
    vi.stubGlobal('document', fallbackDocument);

    expect(await copyTextToClipboard('Fallback')).toBe(true);
    expect(fallbackDocument.createElement).toHaveBeenCalledWith('textarea');
    expect(fallbackDocument.execCommand).toHaveBeenCalledWith('copy');
    expect(fallbackDocument.body.removeChild).toHaveBeenCalledTimes(1);
  });

  it('falls back to textarea and returns false when execCommand fails', async () => {
    const fallbackDocument = mockDocument(false);

    vi.stubGlobal('navigator', { clipboard: { writeText: vi.fn().mockRejectedValue(new Error('blocked')) } });
    vi.stubGlobal('document', fallbackDocument);

    expect(await copyTextToClipboard('Nope')).toBe(false);
    expect(fallbackDocument.execCommand).toHaveBeenCalledWith('copy');
  });
});
