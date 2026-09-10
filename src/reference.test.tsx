import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { qdnRequest } from './qdnRequest';
import { FEEDBACK_SCHEMA, FEEDBACK_POST_PREFIX, FEEDBACK_COMMENT_PREFIX, FEEDBACK_SERVICE, FEEDBACK_FILE_NAME, FEEDBACK_TAGS, MAX_FEEDBACK_RESOURCE_BYTES, FEEDBACK_POST_PAGE_SIZE, FEEDBACK_COMMENT_PAGE_SIZE, FEEDBACK_METADATA_TITLE_BYTES, FEEDBACK_METADATA_DESCRIPTION_BYTES, FEEDBACK_METADATA_TAG_LIMIT, normalizeFeedbackPayload, publishFeedbackPayload } from './qdnFeedback';
import { HELP_NOTIFICATION_ACTIONS, HELP_NOTIFICATION_RULE_LIMIT, canManageHelpNotifications } from './notifications';
vi.mock('./qdnRequest', () => ({ qdnRequest: vi.fn().mockResolvedValue({}) }));
import Reference, { REFERENCE_SNIPPETS } from './Reference';

describe('Help developer reference', () => {
  it('documents the stable schema and identifier formats', () => {
    const html = renderToStaticMarkup(<Reference />);

    expect(html).toContain(FEEDBACK_SCHEMA);
    expect(html).toContain(FEEDBACK_POST_PREFIX);
    expect(html).toContain(FEEDBACK_COMMENT_PREFIX);
    expect(html).toContain('64 UTF-8 bytes');
    expect(html).toContain('Orphan replies');
  });

  it('documents metadata limits and name-based ownership', () => {
    const html = renderToStaticMarkup(<Reference />);

    expect(html).toContain(`<strong>${FEEDBACK_METADATA_TITLE_BYTES}</strong>`);
    expect(html).toContain(`<strong>${FEEDBACK_METADATA_DESCRIPTION_BYTES}</strong>`);
    expect(html).toContain(`<strong>${FEEDBACK_METADATA_TAG_LIMIT}</strong>`);
    expect(html).toContain('QDN ownership is name-based');
    expect(html).toContain('Tagged app owners do not own reporter posts.');
  });

  it('provides bridge examples for every feedback resource operation', () => {
    expect(REFERENCE_SNIPPETS.featureDetection).toContain("action: 'SHOW_ACTIONS'");
    expect(REFERENCE_SNIPPETS.featureDetection).toContain("action: 'GET_HOST_INFO'");
    expect(REFERENCE_SNIPPETS.publish).toContain("action: 'PUBLISH_QDN_RESOURCE'");
    expect(REFERENCE_SNIPPETS.search).toContain("action: 'SEARCH_QDN_RESOURCES'");
    expect(REFERENCE_SNIPPETS.fetch).toContain("action: 'FETCH_QDN_RESOURCE'");
    expect(REFERENCE_SNIPPETS.delete).toContain("action: 'DELETE_QDN_RESOURCE'");
    expect(REFERENCE_SNIPPETS.avatar).toContain("action: 'GET_NAME_DATA'");
    expect(REFERENCE_SNIPPETS.avatar).toContain("action: 'FETCH_ACCOUNT_AVATAR'");
  });

  it('keeps the publish example aligned with the Help v1 resource contract', () => {
    expect(REFERENCE_SNIPPETS.publish).toContain("service: 'JSON'");
    expect(REFERENCE_SNIPPETS.publish).toContain("filename: 'feedback.json'");
    expect(REFERENCE_SNIPPETS.publish).toContain('qhelp.feedback.v1.p.');
    expect(REFERENCE_SNIPPETS.publish).toContain(JSON.stringify(FEEDBACK_TAGS));
  });

  it('documents the owner-address boundary for pointer-aware author avatars', () => {
    const html = renderToStaticMarkup(<Reference />);

    expect(html).toContain('Author avatars');
    expect(html).toContain('never builds a direct thumbnail URL');
  });

  it('documents the pointer-aware avatar contract and safe fallback behaviour', () => {
    const html = renderToStaticMarkup(<Reference />);

    expect(html).toContain('Account and group avatars');
    expect(html).toContain("status: &#x27;PENDING&#x27;");
    expect(html).toContain('500 KiB');
    expect(html).toContain('latest resource revision');
    expect(html).toContain('avatar: null');
  });

  it('provides copyable feature detection, read, and setter examples for avatars', () => {
    expect(REFERENCE_SNIPPETS.avatarFeatureDetection).toContain("'FETCH_ACCOUNT_AVATAR'");
    expect(REFERENCE_SNIPPETS.avatarFeatureDetection).toContain("'SET_GROUP_AVATAR'");
    expect(REFERENCE_SNIPPETS.fetchAvatar).toContain("status === 'PENDING'");
    expect(REFERENCE_SNIPPETS.fetchAvatar).toContain('retryAfterSeconds');
    expect(REFERENCE_SNIPPETS.fetchAvatar).toContain("source is 'POINTER' or 'LEGACY'");
    expect(REFERENCE_SNIPPETS.fetchAvatar).toContain('URL.createObjectURL(new Blob');
    expect(REFERENCE_SNIPPETS.setAvatarPointer).toContain("action: 'SET_ACCOUNT_AVATAR'");
    expect(REFERENCE_SNIPPETS.setAvatarPointer).toContain('avatar: null');
  });
});


describe('source-bound reference contracts', () => {
  it('provides complete examples accepted by the actual payload reader', () => {
    for (const [key, kind] of [['postSchema', 'post'], ['commentSchema', 'comment']] as const) {
      const example = JSON.parse(REFERENCE_SNIPPETS[key]);
      expect(example.schema).toBe(FEEDBACK_SCHEMA);
      expect(normalizeFeedbackPayload(example)).toEqual(example);
      expect(normalizeFeedbackPayload({ ...example, schema: 'unknown' })).toBeNull();
      expect(example.kind).toBe(kind);
    }
  });

  it('executes the publish example with the same UTF-8 metadata contract as the real publisher', async () => {
    const calls: Record<string, unknown>[] = [];
    const title = '🧪'.repeat(60);
    const body = 'é'.repeat(160);
    const source = REFERENCE_SNIPPETS.publish.replace('Wallet balance does not refresh', title)
      .replace('Steps to reproduce and expected behavior…', body).replaceAll('Date.now()', '1784203200000');
    const execute = new Function('window', `return (async () => {${source}})()`);
    await execute({ qdnRequest: async (request: Record<string, unknown>) => { calls.push(request); } });
    const request = calls[0]!;
    const payload = JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(request.base64 as string), character => character.charCodeAt(0))));
    expect(normalizeFeedbackPayload(payload)).not.toBeNull();
    vi.mocked(qdnRequest).mockClear();
    await publishFeedbackPayload('ReporterName', payload);
    expect(request).toEqual(vi.mocked(qdnRequest).mock.calls[0]![0]);
    expect(request.service).toBe(FEEDBACK_SERVICE);
    expect(request.filename).toBe(FEEDBACK_FILE_NAME);
    expect(new TextEncoder().encode(request.title as string).length).toBeLessThanOrEqual(FEEDBACK_METADATA_TITLE_BYTES);
    expect(new TextEncoder().encode(request.description as string).length).toBeLessThanOrEqual(FEEDBACK_METADATA_DESCRIPTION_BYTES);
  });

  it('binds fetch, discovery and rendered limits to the implementation', () => {
    const html = renderToStaticMarkup(<Reference />);
    expect(REFERENCE_SNIPPETS.fetch).toContain(`maxBytes: ${MAX_FEEDBACK_RESOURCE_BYTES}`);
    expect(REFERENCE_SNIPPETS.fetch).toContain(`service: '${FEEDBACK_SERVICE}'`);
    expect(REFERENCE_SNIPPETS.search).toContain(`limit: ${FEEDBACK_POST_PAGE_SIZE}`);
    expect(html).toContain(`${FEEDBACK_COMMENT_PAGE_SIZE} comments`);
    expect(html).toContain(MAX_FEEDBACK_RESOURCE_BYTES.toLocaleString('en-US'));
    expect(html).toContain('lang="en" dir="ltr"');
    expect(html).toContain('role="status" aria-live="polite"');
    expect(html).toContain('Code can be selected for manual copying.');
  });

  it('describes conditional producer support without treating manager APIs as substitutes', () => {
    const html = renderToStaticMarkup(<Reference />);
    expect(html).toContain('When Home does not advertise the complete producer contract, follow controls remain unavailable.');
    expect(html).toContain(`${HELP_NOTIFICATION_RULE_LIMIT} followed posts`);
    for (const action of HELP_NOTIFICATION_ACTIONS) {
      expect(REFERENCE_SNIPPETS.featureDetection).toContain(action);
      expect(canManageHelpNotifications(HELP_NOTIFICATION_ACTIONS.filter(item => item !== action))).toBe(false);
    }
    expect(canManageHelpNotifications([...HELP_NOTIFICATION_ACTIONS])).toBe(true);
    expect(canManageHelpNotifications(['NOTIFICATIONS_LIST', 'NOTIFICATIONS_GET_RULES'] as never[])).toBe(false);
  });
});
