import { Check, Copy } from 'lucide-react';
import { useState } from 'react';
import { copyTextToClipboard } from './clipboard';
import { ReferenceNavigation } from './ReferenceNavigation';
import { FEEDBACK_SCHEMA, FEEDBACK_POST_PREFIX, FEEDBACK_COMMENT_PREFIX, FEEDBACK_SERVICE, FEEDBACK_FILE_NAME, FEEDBACK_TAGS, MAX_FEEDBACK_RESOURCE_BYTES, FEEDBACK_POST_PAGE_SIZE, FEEDBACK_COMMENT_PAGE_SIZE, FEEDBACK_METADATA_TITLE_BYTES, FEEDBACK_METADATA_DESCRIPTION_BYTES, FEEDBACK_METADATA_TAG_LIMIT } from './qdnFeedback';
import { HELP_NOTIFICATION_ACTIONS, HELP_NOTIFICATION_RULE_LIMIT } from './notifications';

export const REFERENCE_SNIPPETS = {
  postSchema: `{
  "schema": "${FEEDBACK_SCHEMA}",
  "kind": "post",
  "id": "m1abc123",
  "type": "issue",
  "title": "Wallet balance does not refresh",
  "body": "Steps to reproduce and expected behavior…",
  "app": "Wallet",
  "status": "open",
  "attachments": [
    {
      "service": "IMAGE",
      "name": "ReporterName",
      "identifier": "qhelp.attach.v1.m1abc123.0",
      "filename": "wallet.png",
      "mimeType": "image/png",
      "size": 48231,
      "sha256": "optional-hex-digest"
    }
  ],
  "createdAt": 1784203200000,
  "updatedAt": 1784203200000
}`,
  commentSchema: `{
  "schema": "${FEEDBACK_SCHEMA}",
  "kind": "comment",
  "id": "m1reply9",
  "postId": "m1abc123",
  "body": "I can reproduce this on the current release.",
  "attachments": [],
  "createdAt": 1784206800000,
  "updatedAt": 1784206800000
}`,
  featureDetection: `const actions = await window.qdnRequest({
  action: 'SHOW_ACTIONS',
});

const canPublish = actions.includes('PUBLISH_QDN_RESOURCE');
const canPublishAttachments =
  actions.includes('PUBLISH_MULTIPLE_QDN_RESOURCES');
const canDelete = actions.includes('DELETE_QDN_RESOURCE');
const canManageReplyNotifications = ${JSON.stringify(HELP_NOTIFICATION_ACTIONS, null, 2)}.every((action) => actions.includes(action));

const hostInfo = actions.includes('GET_HOST_INFO')
  ? await window.qdnRequest({ action: 'GET_HOST_INFO' })
  : null;

const usingPublicNode = actions.includes('IS_USING_PUBLIC_NODE')
  ? await window.qdnRequest({ action: 'IS_USING_PUBLIC_NODE' })
  : null;`,
  avatar: `const canFetchAuthorAvatar = [
  'GET_NAME_DATA',
  'FETCH_ACCOUNT_AVATAR',
].every((action) => actions.includes(action));

if (canFetchAuthorAvatar) {
  // Resolve the current owner of the feedback resource's registered name.
  const nameData = await window.qdnRequest({
    action: 'GET_NAME_DATA',
    name: resource.name,
  });

  if (typeof nameData?.owner === 'string') {
    const avatar = await window.qdnRequest({
      action: 'FETCH_ACCOUNT_AVATAR',
      address: nameData.owner,
      maxBytes: 500 * 1024,
    });

    // Validate address, base64, byte length, raster MIME type, and pointer
    // descriptor before turning avatar.body into a Blob URL for one <img>.
  }
}`,
  avatarFeatureDetection: `const actions = await window.qdnRequest({
  action: 'SHOW_ACTIONS',
});

const canFetchAccountAvatar = actions.includes('FETCH_ACCOUNT_AVATAR');
const canFetchGroupAvatar = actions.includes('FETCH_GROUP_AVATAR');
const canSetAccountAvatar = actions.includes('SET_ACCOUNT_AVATAR');
const canSetGroupAvatar = actions.includes('SET_GROUP_AVATAR');`,
  fetchAvatar: `const MAX_AVATAR_BYTES = 500 * 1024;

async function loadVisibleAccountAvatar(address) {
  const result = await window.qdnRequest({
    action: 'FETCH_ACCOUNT_AVATAR',
    address,
    maxBytes: MAX_AVATAR_BYTES,
  });

  if (result.status === 'PENDING') {
    window.setTimeout(() => loadVisibleAccountAvatar(address),
      (result.retryAfterSeconds ?? 5) * 1000);
    return null;
  }

  if (result.encoding !== 'base64' ||
      result.contentLength > MAX_AVATAR_BYTES ||
      !String(result.contentType).startsWith('image/')) return null;

  const binary = atob(result.body);
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  if (bytes.byteLength !== result.contentLength) return null;

  // source is 'POINTER' or 'LEGACY'. descriptor is the pointer tuple when set.
  const url = URL.createObjectURL(new Blob([bytes], { type: result.contentType }));
  return { source: result.source, descriptor: result.descriptor, url };
}

// Revoke the prior URL when its image is replaced or unmounted.
// Use FETCH_GROUP_AVATAR with { groupId } for a visible group avatar.`,
  setAvatarPointer: `// First publish a public, single-file image resource and wait for READY.
// Publishing does not set the avatar pointer by itself.
const avatar = {
  service: 'THUMBNAIL',
  name: selectedPrimaryName,
  identifier: 'avatar',
};

await window.qdnRequest({
  action: 'SET_ACCOUNT_AVATAR',
  avatar,
});

// A group setter also requires its group id:
await window.qdnRequest({
  action: 'SET_GROUP_AVATAR',
  groupId,
  avatar: {
    service: 'THUMBNAIL',
    name: groupOwnerPrimaryName,
    identifier: \`qortium-group-avatar-v1-\${groupId}\`,
  },
});

// Clear either pointer with a separate approved request: { avatar: null }.`,
  notifications: `// Run only when all four producer actions above are advertised and permission is granted.
// If any producer action is missing, leave follow controls unavailable.
const postId = 'm1abc123';

await window.qdnRequest({
  action: 'NOTIFICATION_ADD',
  subscriptions: [{
    notificationId: 'help.reply.<16-hex-sha256-prefix>',
    event: 'RESOURCE_PUBLISHED',
    filters: {
      service: '${FEEDBACK_SERVICE}',
      identifier: '${FEEDBACK_COMMENT_PREFIX}',
      title: \`Reply \${postId}\`,
      excludeBlocked: true,
      after: Date.now(),
    },
    title: 'Reply activity in Help',
    text: 'Open Help to read the reply.',
    link: \`qdn://APP/Help/Help?post=\${postId}\`,
  }],
});

const followed = await window.qdnRequest({
  action: 'NOTIFICATION_GET',
});

await window.qdnRequest({
  action: 'NOTIFICATION_REMOVE',
  notificationIds: ['help.reply.<16-hex-sha256-prefix>'],
});`,
  publish: `const payload = {
  schema: '${FEEDBACK_SCHEMA}',
  kind: 'post',
  id: 'm1abc123',
  type: 'issue',
  title: 'Wallet balance does not refresh',
  body: 'Steps to reproduce and expected behavior…',
  app: 'Wallet',
  status: 'open',
  attachments: [],
  createdAt: Date.now(),
  updatedAt: Date.now(),
};

// Metadata limits count UTF-8 bytes, not JavaScript characters.
function truncateUtf8(value, maxBytes) {
  let result = '';
  for (const character of value) {
    if (new TextEncoder().encode(result + character).length > maxBytes) break;
    result += character;
  }
  return result;
}

const json = JSON.stringify(payload, null, 2);
const bytes = new TextEncoder().encode(json);
let binary = '';
for (const byte of bytes) binary += String.fromCharCode(byte);

await window.qdnRequest({
  action: 'PUBLISH_QDN_RESOURCE',
  service: '${FEEDBACK_SERVICE}',
  name: 'ReporterName',
  identifier: \`${FEEDBACK_POST_PREFIX}\${payload.id}\`,
  filename: '${FEEDBACK_FILE_NAME}',
  title: truncateUtf8(payload.title, ${FEEDBACK_METADATA_TITLE_BYTES}),
  description: truncateUtf8(payload.body, ${FEEDBACK_METADATA_DESCRIPTION_BYTES}),
  tags: [...${JSON.stringify(FEEDBACK_TAGS)}, 'post', payload.type].slice(0, ${FEEDBACK_METADATA_TAG_LIMIT}),
  base64: btoa(binary),
});`,
  search: `const resources = await window.qdnRequest({
  action: 'SEARCH_QDN_RESOURCES',
  service: '${FEEDBACK_SERVICE}',
  identifier: '${FEEDBACK_POST_PREFIX}',
  prefix: true,
  mode: 'ALL',
  reverse: true,
  includeMetadata: true,
  includeStatus: true,
  limit: ${FEEDBACK_POST_PAGE_SIZE},
  offset: 0,
});

// Direct Core equivalent:
// GET /arbitrary/resources/search
//   ?service=${FEEDBACK_SERVICE}&identifier=${FEEDBACK_POST_PREFIX}
//   &prefix=true&mode=ALL&reverse=true
//   &includemetadata=true&includestatus=true
//   &limit=${FEEDBACK_POST_PAGE_SIZE}&offset=0`,
  fetch: `const payload = await window.qdnRequest({
  action: 'FETCH_QDN_RESOURCE',
  service: '${FEEDBACK_SERVICE}',
  name: resource.name,
  identifier: resource.identifier,
  maxBytes: ${MAX_FEEDBACK_RESOURCE_BYTES},
});

// Direct Core equivalent:
// GET /arbitrary/${FEEDBACK_SERVICE}/{name}/{identifier}`,
  delete: `await window.qdnRequest({
  action: 'DELETE_QDN_RESOURCE',
  service: '${FEEDBACK_SERVICE}',
  name: resource.name,
  identifier: resource.identifier,
});`,
} as const;

type ReferenceSnippetName = keyof typeof REFERENCE_SNIPPETS;

function CopyableCode({
  label,
  snippet,
}: {
  label: string;
  snippet: ReferenceSnippetName;
}) {
  const [result, setResult] = useState<'idle' | 'copied' | 'unavailable'>('idle');
  const code = REFERENCE_SNIPPETS[snippet];

  const copy = async (button: HTMLButtonElement) => {
    setResult('idle');
    setResult(await copyTextToClipboard(code) ? 'copied' : 'unavailable');
    button.focus({ preventScroll: true });
  };

  return (
    <div className="reference-code">
      <div className="reference-code__toolbar">
        <span>{label}</span>
        <button
          aria-label={`Copy ${label}`}
          className="reference-code__copy"
          onClick={(event) => {
            void copy(event.currentTarget);
          }}
          type="button"
        >
          {result === 'copied' ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
          <span>{result === 'copied' ? 'Copied' : 'Copy'}</span>
        </button>
      </div>
      <p className="reference-copy-status" role="status" aria-live="polite">{result === 'copied' ? `Copied ${label}.` : result === 'unavailable' ? 'Clipboard unavailable. Select the code and copy it manually.' : 'Code can be selected for manual copying.'}</p>
      <pre aria-label={label} tabIndex={0}>
        <code>{code}</code>
      </pre>
    </div>
  );
}

function ReferenceCard({
  children,
  title,
}: {
  children: React.ReactNode;
  title: string;
}) {
  return (
    <article className="reference-card">
      <h3>{title}</h3>
      {children}
    </article>
  );
}

export default function Reference() {
  return (
    <div className="developer-reference" lang="en" dir="ltr">
      <header className="reference-hero">
        <p className="reference-eyebrow">Developer reference</p>
        <h1>Build with Qortium Help feedback</h1>
        <p>
          Help stores posts and replies as independent public JSON resources on QDN. This reference documents the
          current <code>{FEEDBACK_SCHEMA}</code> format and the Qortium Home bridge calls used by the app.
        </p>
        <p className="reference-note">
          This page intentionally remains in English so schema names, action names, and examples stay identical for
          every developer.
        </p>
      </header>

      <ReferenceNavigation />

      <section className="reference-section" id="data-model" tabIndex={-1}>
        <div className="reference-section__heading">
          <p className="reference-kicker">01 · Data model</p>
          <h2>One schema, two resource kinds</h2>
          <p>
            Both kinds use QDN service <code>{FEEDBACK_SERVICE}</code>, filename <code>{FEEDBACK_FILE_NAME}</code>, Unix timestamps in
            milliseconds, and the exact schema marker below. Unknown or malformed resources should be ignored.
            Help fetches at most {MAX_FEEDBACK_RESOURCE_BYTES.toLocaleString('en-US')} bytes per feedback resource, with pages of {FEEDBACK_POST_PAGE_SIZE} posts or {FEEDBACK_COMMENT_PAGE_SIZE} comments.
          </p>
        </div>

        <div className="reference-schema-grid">
          <CopyableCode label="Post JSON" snippet="postSchema" />
          <CopyableCode label="Comment JSON" snippet="commentSchema" />
        </div>

        <div className="reference-grid">
          <ReferenceCard title="Post fields">
            <ul>
              <li>
                <code>type</code> is <code>issue</code> or <code>idea</code>.
              </li>
              <li>
                <code>status</code> is <code>open</code> or <code>done</code>.
              </li>
              <li>
                <code>app</code> is an optional tagged QDN app name; it does not transfer ownership.
              </li>
              <li>
                <code>attachments</code> contains references to separately published QDN resources.
              </li>
            </ul>
          </ReferenceCard>
          <ReferenceCard title="Comment fields">
            <ul>
              <li>
                <code>postId</code> links the reply to the post payload&apos;s <code>id</code>.
              </li>
              <li>Replies are separate QDN resources, not embedded children of a post.</li>
              <li>A reply can remain available even if its parent is deleted or unavailable.</li>
            </ul>
          </ReferenceCard>
        </div>
      </section>

      <section className="reference-section" id="identifiers" tabIndex={-1}>
        <div className="reference-section__heading">
          <p className="reference-kicker">02 · Identifiers</p>
          <h2>Short, stable resource keys</h2>
        </div>

        <div className="reference-grid">
          <ReferenceCard title="Post identifier">
            <code className="reference-identifier">{FEEDBACK_POST_PREFIX}&lt;postId&gt;</code>
            <p>The post ID appears in both the QDN identifier and the JSON payload.</p>
          </ReferenceCard>
          <ReferenceCard title="Comment identifier">
            <code className="reference-identifier">{FEEDBACK_COMMENT_PREFIX}&lt;commentId&gt;</code>
            <p>
              The parent ID is deliberately omitted. It belongs in <code>postId</code> inside the payload.
            </p>
          </ReferenceCard>
        </div>

        <aside className="reference-callout">
          <strong>Why omit the parent ID?</strong>
          <p>
            Core caps an arbitrary transaction identifier at 64 UTF-8 bytes. Embedding both IDs can overflow that
            limit and fail before publication. Each identifier therefore carries only its own short ID.
          </p>
        </aside>
      </section>

      <section className="reference-section" id="lifecycle" tabIndex={-1}>
        <div className="reference-section__heading">
          <p className="reference-kicker">03 · Ownership and lifecycle</p>
          <h2>QDN ownership is name-based</h2>
        </div>

        <div className="reference-grid reference-grid--four">
          <ReferenceCard title="Create">
            <p>
              A selected account publishes under a registered name. The tuple{' '}
              <code>service + name + identifier</code> identifies the resource.
            </p>
          </ReferenceCard>
          <ReferenceCard title="Edit">
            <p>
              Republishing that same tuple creates the next version. Keep <code>id</code> and{' '}
              <code>createdAt</code>, then update the content and <code>updatedAt</code>.
            </p>
          </ReferenceCard>
          <ReferenceCard title="Delete">
            <p>
              Deletion targets the same tuple. Qortium Home verifies that the selected account controls the resource
              name before it signs a delete transaction.
            </p>
          </ReferenceCard>
          <ReferenceCard title="Status">
            <p>
              <code>open</code> and <code>done</code> are reporter-authored payload values, not a Core workflow.
              Changing status is an edit of the post resource.
            </p>
          </ReferenceCard>
        </div>

        <aside className="reference-callout reference-callout--warning">
          <strong>Tagged app owners do not own reporter posts.</strong>
          <p>
            The optional <code>app</code> value is a label. Only an account controlling the publishing name can edit,
            complete, reopen, or delete that v1 resource.
          </p>
        </aside>

        <div className="reference-card reference-card--wide">
          <h3>Orphan replies</h3>
          <p>
            A comment is an orphan when its <code>postId</code> does not match a post currently available to the
            reader. This can happen after a parent is deleted, has not propagated yet, falls outside a paged result,
            or fails validation. Keep the comment: its own QDN resource and author remain valid.
          </p>
        </div>
      </section>

      <section className="reference-section" id="metadata" tabIndex={-1}>
        <div className="reference-section__heading">
          <p className="reference-kicker">04 · QDN metadata</p>
          <h2>Payload data and search metadata are separate</h2>
          <p>
            The complete title and body live in <code>{FEEDBACK_FILE_NAME}</code>. Metadata is a compact discovery layer and
            is capped by Core.
          </p>
        </div>

        <div className="reference-limits" role="list">
          <div className="reference-limit" role="listitem">
            <strong>{FEEDBACK_METADATA_TITLE_BYTES}</strong>
            <span>UTF-8 bytes for title</span>
          </div>
          <div className="reference-limit" role="listitem">
            <strong>{FEEDBACK_METADATA_DESCRIPTION_BYTES}</strong>
            <span>UTF-8 bytes for description</span>
          </div>
          <div className="reference-limit" role="listitem">
            <strong>{FEEDBACK_METADATA_TAG_LIMIT}</strong>
            <span>tags, up to 20 characters each</span>
          </div>
        </div>

        <div className="reference-card reference-card--wide">
          <h3>Help v1 tags</h3>
          <p>
            Help publishes up to five tags from <code>qortium-help</code>, <code>feedback</code>, <code>v1</code>, the
            resource kind, and either the post type or <code>reply</code>.
          </p>
        </div>
      </section>

      <section className="reference-section" id="bridge" tabIndex={-1}>
        <div className="reference-section__heading">
          <p className="reference-kicker">05 · Qortium Home bridge</p>
          <h2>Detect capabilities before showing controls</h2>
          <p>
            Call <code>SHOW_ACTIONS</code> at runtime. Do not infer support from a Home version, platform, node URL, or
            whether a selected account exists.
          </p>
        </div>

        <CopyableCode label="Capability detection" snippet="featureDetection" />

        <div className="reference-grid">
          <ReferenceCard title="Read actions">
            <ul>
              <li>
                <code>SEARCH_QDN_RESOURCES</code> finds post or comment identifiers by prefix.
              </li>
              <li>
                <code>FETCH_QDN_RESOURCE</code> retrieves and rebuilds one JSON resource.
              </li>
              <li>
                <code>GET_HOST_INFO</code> reports the host and platform version when supported.
              </li>
              <li>
                <code>IS_USING_PUBLIC_NODE</code> reports the active node mode.
              </li>
            </ul>
          </ReferenceCard>
          <ReferenceCard title="Write actions">
            <ul>
              <li>
                <code>PUBLISH_QDN_RESOURCE</code> creates or updates a resource.
              </li>
              <li>
                <code>DELETE_QDN_RESOURCE</code> signs a deletion for an owned name.
              </li>
              <li>
                <code>PUBLISH_MULTIPLE_QDN_RESOURCES</code> publishes the attachment resources as a batch. Inspect
                every failure and wait for every returned resource/signature target to reach <code>READY</code> before
                separately publishing the referencing feedback JSON with <code> PUBLISH_QDN_RESOURCE</code>.
              </li>
              <li>Home owns account selection, signing, approval prompts, and node routing.</li>
            </ul>
          </ReferenceCard>
          <ReferenceCard title="Reply notifications">
            <ul>
              <li>
                Feature-detect all four durable notification producer actions before showing follow controls.
                When Home does not advertise the complete producer contract, follow controls remain unavailable.
                Notification manager actions are not substitutes. Help permits at most {HELP_NOTIFICATION_RULE_LIMIT} followed posts.
              </li>
              <li>
                One <code>RESOURCE_PUBLISHED</code> rule follows one post through reply metadata; use a stable,
                valid notification id and preserve the original <code>after</code> checkpoint when reconciling.
              </li>
              <li>
                Rules are tagged to Home&apos;s active account. Re-register existing ids after
                <code> SELECTED_ACCOUNT_CHANGED</code> without prompting when permission is already granted.
              </li>
            </ul>
          </ReferenceCard>
          <ReferenceCard title="Author avatars">
            <ul>
              <li>
                Resolve the feedback resource&apos;s registered name with <code>GET_NAME_DATA</code> before requesting
                its current owner&apos;s account avatar.
              </li>
              <li>
                Feature-detect both <code>GET_NAME_DATA</code> and <code>FETCH_ACCOUNT_AVATAR</code>; browser mode
                keeps the initial fallback and never builds a direct thumbnail URL.
              </li>
              <li>
                Fetch avatar bytes only for mounted controls. Validate Home&apos;s bounded base64 response, construct a
                Blob URL, and revoke it when the control is replaced or unmounted.
              </li>
            </ul>
          </ReferenceCard>
        </div>

        <CopyableCode label="Follow and unfollow replies" snippet="notifications" />
        <CopyableCode label="Resolve and fetch a visible author avatar" snippet="avatar" />

        <aside className="reference-callout">
          <strong>Attachment publishing is staged, not atomic.</strong>
          <p>
            Publish all attachments first, stop if the batch reports any failure, and wait until each exact
            transaction signature is the <code>READY</code> version of its resource. Only then publish the feedback
            JSON that references them. Help derives stable attachment identifiers from the draft ID and attachment
            position, so retrying the same draft reuses those tuples instead of creating another orphan set.
          </p>
        </aside>

        <aside className="reference-callout">
          <strong>Public node is not the same as browser development.</strong>
          <p>
            Qortium Home may expose QDN publish and delete actions while connected to a public node because it can sign
            supported transactions locally. A standalone browser has no selected-account bridge and should be treated
            as read-only. In every mode, the current <code>SHOW_ACTIONS</code> result is authoritative.
          </p>
        </aside>
      </section>

      <section className="reference-section" id="avatars" tabIndex={-1}>
        <div className="reference-section__heading">
          <p className="reference-kicker">06 · Account and group avatars</p>
          <h2>Use the pointer-aware bridge, not a named thumbnail URL</h2>
          <p>
            Call <code>SHOW_ACTIONS</code> before showing avatar controls. Fetch images only for identities currently
            visible in the interface; do not turn a batch identity lookup into a batch image download.
          </p>
        </div>

        <CopyableCode label="Avatar capability detection" snippet="avatarFeatureDetection" />

        <div className="reference-grid">
          <ReferenceCard title="Safe reads">
            <p>
              <code>FETCH_ACCOUNT_AVATAR</code> accepts an <code>address</code> (or the selected account), and
              <code> FETCH_GROUP_AVATAR</code> accepts a positive <code>groupId</code> or <code>txGroupId</code>.
              These reads are public-node safe.
            </p>
            <p>
              A ready result carries base64 <code>body</code>, <code>contentType</code>, <code>contentLength</code>,
              <code>source</code>, and an optional <code>{'{ service, name, identifier }'}</code> descriptor. Build an
              in-memory Blob URL only; never rebuild a raw node/QDN URL from the response.
            </p>
          </ReferenceCard>
          <ReferenceCard title="Pending and fallback">
            <p>
              A <code>status: 'PENDING'</code> result is retryable after <code>retryAfterSeconds</code>. Keep initials
              visible while it is queued. Missing, malformed, or unsupported results fall back to initials without a
              retry loop.
            </p>
            <p>
              An explicit pointer wins and resolves to its latest resource revision. Invalid pointer content fails
              closed. A <code>source: 'LEGACY'</code> result is compatibility data, not an on-chain pointer; do not use
              <code> avatarSrc</code> or <code>avatarUrl</code> as an authoritative image source.
            </p>
          </ReferenceCard>
          <ReferenceCard title="Authoring">
            <p>
              Publish the public single-file image first, wait for that resource to become <code>READY</code>, then
              call the matching setter. The publish and pointer assignment are separate, single-request approvals.
            </p>
            <p>
              Both setters accept <code>{'{ service, name, identifier }'}</code> or <code>avatar: null</code> to clear.
              Account assignment targets the selected account; group assignment also includes <code>groupId</code>.
            </p>
          </ReferenceCard>
        </div>

        <CopyableCode label="Fetch one visible account avatar" snippet="fetchAvatar" />
        <CopyableCode label="Set or clear an avatar pointer" snippet="setAvatarPointer" />

        <aside className="reference-callout">
          <strong>Bounded, mutable image data.</strong>
          <p>
            Home validates raster image bytes and caps avatar responses at 500 KiB. A pointer is intentionally mutable,
            so cache it briefly and revalidate rather than treating a descriptor as an immutable signature.
          </p>
        </aside>
      </section>

      <section className="reference-section" id="examples" tabIndex={-1}>
        <div className="reference-section__heading">
          <p className="reference-kicker">07 · Copyable examples</p>
          <h2>Publish, discover, fetch, and delete</h2>
          <p>
            These examples use the Qortium Home bridge. Substitute real selected-account names and generated short
            IDs; never ship a private key or API key in a QDN app.
          </p>
        </div>

        <div className="reference-example-stack">
          <CopyableCode label="Publish a post" snippet="publish" />
          <CopyableCode label="Search posts" snippet="search" />
          <CopyableCode label="Fetch one resource" snippet="fetch" />
          <CopyableCode label="Delete an owned resource" snippet="delete" />
        </div>
      </section>
    </div>
  );
}
