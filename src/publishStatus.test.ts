import { afterEach, describe, expect, it, vi } from 'vitest';

const { qdnRequestMock } = vi.hoisted(() => ({
  qdnRequestMock: vi.fn(),
}));

vi.mock('./qdnRequest', () => ({
  qdnRequest: qdnRequestMock,
}));

import { getResourceStatus, waitForFeedbackResourceReady } from './publishStatus';

afterEach(() => {
  qdnRequestMock.mockReset();
});

describe('publish status parsing', () => {
  it('accepts bridge FETCH_NODE_API envelopes and raw payloads', () => {
    expect(getResourceStatus({ data: { status: 'ready' } })).toBe('READY');
    expect(getResourceStatus({ status: 'PUBLISHED' })).toBe('PUBLISHED');
    expect(getResourceStatus(null)).toBe('');
  });

  it('requires a new READY signature when replacing an existing resource', async () => {
    qdnRequestMock
      .mockResolvedValueOnce([
        {
          identifier: 'qhelp.feedback.v1.p.post',
          latestSignature: 'old-signature',
          name: 'Alice',
          service: 'JSON',
          status: { status: 'READY' },
        },
      ])
      .mockResolvedValueOnce([
        {
          identifier: 'qhelp.feedback.v1.p.post',
          latestSignature: 'new-signature',
          name: 'Alice',
          service: 'JSON',
          status: { status: 'READY' },
        },
      ]);

    await expect(
      waitForFeedbackResourceReady({
        identifier: 'qhelp.feedback.v1.p.post',
        name: 'Alice',
        previousSignature: 'old-signature',
        timeoutMs: 2_000,
      }),
    ).resolves.toBe(true);

    expect(qdnRequestMock).toHaveBeenCalledTimes(2);
  });

  it('does not accept a READY resource without a signature', async () => {
    qdnRequestMock.mockResolvedValue([
      {
        identifier: 'qhelp.feedback.v1.p.post',
        name: 'Alice',
        service: 'JSON',
        status: { status: 'READY' },
      },
    ]);

    await expect(
      waitForFeedbackResourceReady({
        identifier: 'qhelp.feedback.v1.p.post',
        name: 'Alice',
        timeoutMs: 1,
      }),
    ).resolves.toBe(false);
  });
});
