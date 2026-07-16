import type { FeedbackAttachment, FeedbackPayload } from './qdnFeedback';
import {
  buildCommentIdentifier,
  buildPostIdentifier,
  FEEDBACK_TAGS,
  jsonToBase64,
  publishFeedbackPayload,
  truncateUtf8,
} from './qdnFeedback';
import { qdnRequest } from './qdnRequest';

export const MAX_ATTACHMENT_COUNT = 3;
export const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const IMAGE_COMPRESSION_MAX_WIDTH = 1600;
const IMAGE_COMPRESSION_QUALITY = 0.78;

export type AttachmentService = 'ATTACHMENT' | 'AUDIO' | 'IMAGE' | 'VIDEO';

export type PreparedFeedbackAttachment = {
  dataBase64: string;
  filename: string;
  mimeType: string;
  service: AttachmentService;
  size: number;
};

type PublishMultipleResult = {
  accepted?: boolean;
  action?: string;
  failures?: unknown[];
  published?: unknown[];
};

export function getAttachmentService(file: Pick<File, 'type'>): AttachmentService {
  const type = file.type.toLowerCase();

  if (type.startsWith('image/') && type !== 'image/svg+xml') {
    return 'IMAGE';
  }

  if (type.startsWith('audio/')) {
    return 'AUDIO';
  }

  if (type.startsWith('video/')) {
    return 'VIDEO';
  }

  return 'ATTACHMENT';
}

export function getAttachmentMaxBytes(service: AttachmentService) {
  return service === 'IMAGE' ? MAX_IMAGE_BYTES : MAX_ATTACHMENT_BYTES;
}

export function formatAttachmentSize(bytes: number) {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  if (bytes < 1024 * 1024) {
    return `${Math.round(bytes / 1024)} KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function fileToBase64(payload: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      const dataUrl = String(reader.result);
      const separator = dataUrl.indexOf(',');

      if (separator === -1) {
        reject(new Error('Unable to read the selected file.'));
        return;
      }

      resolve(dataUrl.slice(separator + 1));
    };
    reader.onerror = () => reject(reader.error ?? new Error('Unable to read the selected file.'));
    reader.readAsDataURL(payload);
  });
}

async function compressImage(file: File): Promise<Blob | null> {
  if (file.type === 'image/gif' || typeof createImageBitmap !== 'function') {
    return null;
  }

  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, IMAGE_COMPRESSION_MAX_WIDTH / bitmap.width);
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement('canvas');

    canvas.width = width;
    canvas.height = height;

    const context = canvas.getContext('2d');

    if (!context) {
      bitmap.close();
      return null;
    }

    context.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/webp', IMAGE_COMPRESSION_QUALITY),
    );

    return blob && blob.size < file.size ? blob : null;
  } catch {
    return null;
  }
}

export async function prepareFeedbackAttachment(file: File): Promise<PreparedFeedbackAttachment> {
  const service = getAttachmentService(file);
  let payload: Blob = file;
  let filename = file.name || 'attachment';
  let mimeType = file.type || 'application/octet-stream';

  if (service === 'IMAGE') {
    const compressed = await compressImage(file);

    if (compressed) {
      payload = compressed;
      filename = `${filename.replace(/\.[^.]+$/, '') || 'image'}.webp`;
      mimeType = 'image/webp';
    }
  }

  const maxBytes = getAttachmentMaxBytes(service);

  if (payload.size > maxBytes) {
    throw new Error(`File exceeds the ${Math.round(maxBytes / 1024 / 1024)} MB limit.`);
  }

  return {
    dataBase64: await fileToBase64(payload),
    filename,
    mimeType,
    service,
    size: payload.size,
  };
}

function buildAttachmentIdentifier(payload: FeedbackPayload, index: number) {
  const random = Math.random().toString(36).slice(2, 8);

  return `qhelp.attach.v1.${payload.id}.${index.toString(36)}-${random}`.slice(0, 64);
}

export function prepareFeedbackBundle(
  name: string,
  payload: FeedbackPayload,
  files: PreparedFeedbackAttachment[],
) {
  const attachments: FeedbackAttachment[] = files.map((file, index) => ({
    filename: file.filename,
    identifier: buildAttachmentIdentifier(payload, index),
    mimeType: file.mimeType,
    name,
    service: file.service,
    size: file.size,
  }));
  const payloadWithAttachments = { ...payload, attachments };
  const feedbackIdentifier =
    payload.kind === 'post' ? buildPostIdentifier(payload.id) : buildCommentIdentifier(payload.id);
  const title = payload.kind === 'post' ? payload.title : `Reply ${payload.postId}`;

  const attachmentResources = files.map((file, index) => ({
    base64: file.dataBase64,
    description: `Attachment for Qortium Help ${payload.kind}`,
    filename: file.filename,
    identifier: attachments[index].identifier,
    name,
    service: file.service,
    tags: ['qortium-help', 'feedback', 'attachment', payload.kind].slice(0, 5),
    title: truncateUtf8(file.filename, 80),
  }));
  const feedbackResource = {
    base64: jsonToBase64(payloadWithAttachments),
    description: truncateUtf8(payload.body, 240),
    filename: 'feedback.json',
    identifier: feedbackIdentifier,
    name,
    service: 'JSON',
    tags: [...FEEDBACK_TAGS, payload.kind, payload.kind === 'post' ? payload.type : 'reply'].slice(0, 5),
    title: truncateUtf8(title, 80),
  };

  return {
    attachmentResources,
    feedbackResource,
    payload: payloadWithAttachments,
    resources: [...attachmentResources, feedbackResource],
  };
}

export async function publishFeedbackBundle(
  name: string,
  payload: FeedbackPayload,
  files: PreparedFeedbackAttachment[],
) {
  const bundle = prepareFeedbackBundle(name, payload, files);
  const attachmentsResult = await publishPreparedFeedbackBundle(bundle);
  const feedbackResult = await publishFeedbackPayload(name, bundle.payload);

  return { attachmentsResult, feedbackResult, payload: bundle.payload };
}

export async function publishPreparedFeedbackBundle(
  bundle: ReturnType<typeof prepareFeedbackBundle>,
) {
  if (bundle.attachmentResources.length === 0) {
    return {
      accepted: true,
      action: 'PUBLISH_MULTIPLE_QDN_RESOURCES',
      failures: [],
      published: [],
    };
  }

  const result = await qdnRequest<PublishMultipleResult>({
    action: 'PUBLISH_MULTIPLE_QDN_RESOURCES',
    resources: bundle.attachmentResources,
  });

  if (Array.isArray(result.failures) && result.failures.length > 0) {
    throw new Error(`Publishing failed for ${result.failures.length} resource(s).`);
  }

  return result;
}
