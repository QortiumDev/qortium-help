import { afterEach, describe, expect, it, vi } from 'vitest';

const { qdnRequestMock } = vi.hoisted(() => ({
  qdnRequestMock: vi.fn(),
}));

vi.mock('./qdnRequest', () => ({
  qdnRequest: qdnRequestMock,
}));

import { createPostPayload } from './qdnFeedback';
import {
  formatAttachmentSize,
  getAttachmentMaxBytes,
  getAttachmentService,
  MAX_ATTACHMENT_BYTES,
  MAX_IMAGE_BYTES,
  prepareFeedbackBundle,
  publishPreparedFeedbackBundle,
} from './attachmentUpload';

afterEach(() => {
  qdnRequestMock.mockReset();
  vi.restoreAllMocks();
});

describe('feedback attachment helpers', () => {
  it('routes safe raster images and media to matching QDN services', () => {
    expect(getAttachmentService({ type: 'image/png' } as File)).toBe('IMAGE');
    expect(getAttachmentService({ type: 'image/svg+xml' } as File)).toBe('ATTACHMENT');
    expect(getAttachmentService({ type: 'audio/ogg' } as File)).toBe('AUDIO');
    expect(getAttachmentService({ type: 'video/webm' } as File)).toBe('VIDEO');
    expect(getAttachmentService({ type: 'application/pdf' } as File)).toBe('ATTACHMENT');
  });

  it('uses conservative app-side size limits', () => {
    expect(getAttachmentMaxBytes('IMAGE')).toBe(MAX_IMAGE_BYTES);
    expect(getAttachmentMaxBytes('ATTACHMENT')).toBe(MAX_ATTACHMENT_BYTES);
    expect(formatAttachmentSize(1536)).toBe('2 KB');
  });

  it('prepares attachment resources separately from the feedback JSON', () => {
    const payload = createPostPayload(
      'issue',
      'Broken button',
      'It does not work',
      'Help',
      { createdAt: 123, id: 'stable-post' },
    );
    const bundle = prepareFeedbackBundle('Alice', payload, [
      {
        dataBase64: 'aGVsbG8=',
        filename: 'evidence.txt',
        mimeType: 'text/plain',
        service: 'ATTACHMENT',
        size: 5,
      },
    ]);

    expect(bundle.resources).toHaveLength(2);
    expect(bundle.resources[0]).toMatchObject({
      filename: 'evidence.txt',
      identifier: 'qhelp.attach.v1.stable-post.0',
      name: 'Alice',
      service: 'ATTACHMENT',
    });
    expect(bundle.resources[1]).toMatchObject({
      identifier: expect.stringMatching(/^qhelp\.feedback\.v1\.p\./),
      service: 'JSON',
    });
    expect(bundle.payload.attachments[0]).toMatchObject({
      filename: 'evidence.txt',
      identifier: 'qhelp.attach.v1.stable-post.0',
      name: 'Alice',
      service: 'ATTACHMENT',
    });

    expect(prepareFeedbackBundle('Alice', payload, [
      {
        dataBase64: 'aGVsbG8=',
        filename: 'evidence.txt',
        mimeType: 'text/plain',
        service: 'ATTACHMENT',
        size: 5,
      },
    ]).payload.attachments[0].identifier).toBe('qhelp.attach.v1.stable-post.0');
  });

  it('sends only attachments through the Home batch request', async () => {
    const payload = createPostPayload(
      'idea',
      'Add exports',
      'Please add JSON export',
      'Help',
      { createdAt: 123, id: 'stable-post' },
    );
    const bundle = prepareFeedbackBundle('Alice', payload, [
      {
        dataBase64: 'e30=',
        filename: 'example.json',
        mimeType: 'application/json',
        service: 'ATTACHMENT',
        size: 2,
      },
    ]);
    qdnRequestMock.mockResolvedValue({
      accepted: true,
      action: 'PUBLISH_MULTIPLE_QDN_RESOURCES',
      failures: [],
      published: [
        {
          resource: {
            identifier: bundle.attachmentResources[0].identifier,
            name: 'Alice',
            service: 'ATTACHMENT',
          },
          transactionSignature: 'attachment-signature',
        },
      ],
    });

    await expect(publishPreparedFeedbackBundle(bundle)).resolves.toMatchObject({ accepted: true });
    expect(qdnRequestMock).toHaveBeenCalledWith({
      action: 'PUBLISH_MULTIPLE_QDN_RESOURCES',
      resources: bundle.attachmentResources,
    });
  });

  it('rejects an attachment batch without confirmation targets', async () => {
    qdnRequestMock.mockResolvedValue({
      accepted: true,
      action: 'PUBLISH_MULTIPLE_QDN_RESOURCES',
      failures: [],
      published: [],
    });
    const payload = createPostPayload(
      'idea',
      'Add exports',
      'Please add JSON export',
      'Help',
      { createdAt: 123, id: 'stable-post' },
    );
    const bundle = prepareFeedbackBundle('Alice', payload, [
      {
        dataBase64: 'e30=',
        filename: 'example.json',
        mimeType: 'application/json',
        service: 'ATTACHMENT',
        size: 2,
      },
    ]);

    await expect(publishPreparedFeedbackBundle(bundle)).rejects.toThrow(
      'complete confirmation targets',
    );
  });
});
