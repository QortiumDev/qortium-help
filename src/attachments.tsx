import { Paperclip } from 'lucide-react';
import type { FeedbackAttachment } from './qdnFeedback';
import { hasAction, qdnRequest } from './qdnRequest';
import type { QdnAction } from './types';

// Home gates these viewer actions to specific services (see Home platform.ts:
// OPEN_QDN_MEDIA_PLAYER → AUDIO/PODCAST/VIDEO/VOICE, OPEN_QDN_DOCUMENT_VIEWER →
// DOCUMENT/FILE/FILES/ATTACHMENT). We pick the matching viewer when available
// and fall back to opening the resource address in a new Home tab.
const MEDIA_PLAYER_SERVICES = new Set(['AUDIO', 'PODCAST', 'VIDEO', 'VOICE']);
const DOCUMENT_VIEWER_SERVICES = new Set(['ATTACHMENT', 'DOCUMENT', 'FILE', 'FILES']);

function attachmentLabel(attachment: FeedbackAttachment) {
  return attachment.filename?.trim() || attachment.identifier || attachment.name;
}

export async function openAttachment(attachment: FeedbackAttachment, actions: QdnAction[]) {
  const service = attachment.service.toUpperCase();
  const target = { service: attachment.service, name: attachment.name, identifier: attachment.identifier };

  if (MEDIA_PLAYER_SERVICES.has(service) && hasAction(actions, 'OPEN_QDN_MEDIA_PLAYER')) {
    return qdnRequest<boolean>({ action: 'OPEN_QDN_MEDIA_PLAYER', ...target });
  }

  if (DOCUMENT_VIEWER_SERVICES.has(service) && hasAction(actions, 'OPEN_QDN_DOCUMENT_VIEWER')) {
    return qdnRequest<boolean>({ action: 'OPEN_QDN_DOCUMENT_VIEWER', ...target });
  }

  return qdnRequest<boolean>({
    action: 'OPEN_NEW_TAB',
    address: `qdn://${service}/${attachment.name}/${attachment.identifier}`,
  });
}

// Renders any attachments carried by a post/comment payload as clickable chips.
// The button text is the filename so screen readers announce a meaningful label.
export function AttachmentList({
  actions,
  attachments,
}: {
  actions: QdnAction[];
  attachments: FeedbackAttachment[];
}) {
  if (attachments.length === 0) {
    return null;
  }

  return (
    <ul className="attachments">
      {attachments.map((attachment) => (
        <li key={`${attachment.service}:${attachment.name}:${attachment.identifier}`}>
          <button
            className="attachment"
            onClick={() => {
              void openAttachment(attachment, actions).catch((error) => {
                console.warn('Unable to open attachment.', error);
              });
            }}
            type="button"
          >
            <Paperclip aria-hidden="true" />
            <span className="attachment__name">{attachmentLabel(attachment)}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}
