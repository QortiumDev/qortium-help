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
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const payload = createPostPayload('issue', 'Broken button', 'It does not work', 'Help');
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
      name: 'Alice',
      service: 'ATTACHMENT',
    });
    expect(bundle.resources[1]).toMatchObject({
      identifier: expect.stringMatching(/^qhelp\.feedback\.v1\.p\./),
      service: 'JSON',
    });
    expect(bundle.payload.attachments[0]).toMatchObject({
      filename: 'evidence.txt',
      name: 'Alice',
      service: 'ATTACHMENT',
    });
  });

  it('sends only attachments through the Home batch request', async () => {
    qdnRequestMock.mockResolvedValue({
      accepted: true,
      action: 'PUBLISH_MULTIPLE_QDN_RESOURCES',
      failures: [],
      published: [{ identifier: 'attachment' }],
    });
    const payload = createPostPayload('idea', 'Add exports', 'Please add JSON export', 'Help');
    const bundle = prepareFeedbackBundle('Alice', payload, [
      {
        dataBase64: 'e30=',
        filename: 'example.json',
        mimeType: 'application/json',
        service: 'ATTACHMENT',
        size: 2,
      },
    ]);

    await expect(publishPreparedFeedbackBundle(bundle)).resolves.toMatchObject({ accepted: true });
    expect(qdnRequestMock).toHaveBeenCalledWith({
      action: 'PUBLISH_MULTIPLE_QDN_RESOURCES',
      resources: bundle.attachmentResources,
    });
  });
});
