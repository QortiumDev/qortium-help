import { afterEach, describe, expect, it, vi } from 'vitest';

const { qdnRequestMock } = vi.hoisted(() => ({
  qdnRequestMock: vi.fn(),
}));

vi.mock('./qdnRequest', () => ({
  qdnRequest: qdnRequestMock,
}));

import {
  getResourceStatus,
  waitForFeedbackResourceReady,
  waitForPublishedResourcesReady,
} from './publishStatus';

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

  it('waits for every published attachment target to become READY', async () => {
    qdnRequestMock.mockImplementation(async (request: { identifier?: string }) => [
      {
        identifier: request.identifier,
        latestSignature: `${request.identifier}-signature`,
        name: 'Alice',
        service: 'ATTACHMENT',
        status: { status: 'READY' },
      },
    ]);

    await expect(
      waitForPublishedResourcesReady(
        [
          {
            resource: {
              identifier: 'qhelp.attach.v1.post.0',
              name: 'Alice',
              service: 'ATTACHMENT',
            },
            transactionSignature: 'qhelp.attach.v1.post.0-signature',
          },
          {
            resource: {
              identifier: 'qhelp.attach.v1.post.1',
              name: 'Alice',
              service: 'ATTACHMENT',
            },
            transactionSignature: 'qhelp.attach.v1.post.1-signature',
          },
        ],
        1_000,
      ),
    ).resolves.toBe(true);

    expect(qdnRequestMock).toHaveBeenCalledTimes(2);
  });
});
