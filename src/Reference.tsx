import { Check, Copy } from 'lucide-react';
import { useState } from 'react';
import { copyTextToClipboard } from './clipboard';

export const REFERENCE_SNIPPETS = {
  postSchema: `{
  "schema": "qortium.help.feedback.v1",
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
      "identifier": "qhelp.attach.v1.m1abc123.0-example",
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
  "schema": "qortium.help.feedback.v1",
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

const hostInfo = actions.includes('GET_HOST_INFO')
  ? await window.qdnRequest({ action: 'GET_HOST_INFO' })
  : null;

const usingPublicNode = actions.includes('IS_USING_PUBLIC_NODE')
  ? await window.qdnRequest({ action: 'IS_USING_PUBLIC_NODE' })
  : null;`,
  publish: `const payload = {
  schema: 'qortium.help.feedback.v1',
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

const json = JSON.stringify(payload, null, 2);
const bytes = new TextEncoder().encode(json);
let binary = '';
for (const byte of bytes) binary += String.fromCharCode(byte);

await window.qdnRequest({
  action: 'PUBLISH_QDN_RESOURCE',
  service: 'JSON',
  name: 'ReporterName',
  identifier: \`qhelp.feedback.v1.p.\${payload.id}\`,
  filename: 'feedback.json',
  title: payload.title.slice(0, 80),
  description: payload.body.slice(0, 240),
  tags: ['qortium-help', 'feedback', 'v1', 'post', payload.type],
  base64: btoa(binary),
});`,
  search: `const resources = await window.qdnRequest({
  action: 'SEARCH_QDN_RESOURCES',
  service: 'JSON',
  identifier: 'qhelp.feedback.v1.p.',
  prefix: true,
  mode: 'ALL',
  reverse: true,
  includeMetadata: true,
  includeStatus: true,
  limit: 50,
  offset: 0,
});

// Direct Core equivalent:
// GET /arbitrary/resources/search
//   ?service=JSON&identifier=qhelp.feedback.v1.p.
//   &prefix=true&mode=ALL&reverse=true
//   &includemetadata=true&includestatus=true
//   &limit=50&offset=0`,
  fetch: `const payload = await window.qdnRequest({
  action: 'FETCH_QDN_RESOURCE',
  service: 'JSON',
  name: resource.name,
  identifier: resource.identifier,
  maxBytes: 200_000,
});

// Direct Core equivalent:
// GET /arbitrary/JSON/{name}/{identifier}`,
  delete: `await window.qdnRequest({
  action: 'DELETE_QDN_RESOURCE',
  service: 'JSON',
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
  const [copied, setCopied] = useState(false);
  const code = REFERENCE_SNIPPETS[snippet];

  const copy = async () => {
    setCopied(await copyTextToClipboard(code));
  };

  return (
    <div className="reference-code">
      <div className="reference-code__toolbar">
        <span>{label}</span>
        <button
          aria-label={`Copy ${label}`}
          className="reference-code__copy"
          onClick={() => {
            void copy();
          }}
          type="button"
        >
          {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
          <span>{copied ? 'Copied' : 'Copy'}</span>
        </button>
      </div>
      <pre>
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
    <div className="developer-reference">
      <header className="reference-hero">
        <p className="reference-eyebrow">Developer reference</p>
        <h1>Build with Qortium Help feedback</h1>
        <p>
          Help stores posts and replies as independent public JSON resources on QDN. This reference documents the
          current <code>qortium.help.feedback.v1</code> format and the Qortium Home bridge calls used by the app.
        </p>
        <p className="reference-note">
          This page intentionally remains in English so schema names, action names, and examples stay identical for
          every developer.
        </p>
      </header>

      <nav aria-label="Developer reference sections" className="reference-toc">
        <a href="#data-model">Data model</a>
        <a href="#identifiers">Identifiers</a>
        <a href="#lifecycle">Lifecycle</a>
        <a href="#metadata">Metadata</a>
        <a href="#bridge">Home bridge</a>
        <a href="#examples">Examples</a>
      </nav>

      <section className="reference-section" id="data-model">
        <div className="reference-section__heading">
          <p className="reference-kicker">01 · Data model</p>
          <h2>One schema, two resource kinds</h2>
          <p>
            Both kinds use QDN service <code>JSON</code>, filename <code>feedback.json</code>, Unix timestamps in
            milliseconds, and the exact schema marker below. Unknown or malformed resources should be ignored.
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

      <section className="reference-section" id="identifiers">
        <div className="reference-section__heading">
          <p className="reference-kicker">02 · Identifiers</p>
          <h2>Short, stable resource keys</h2>
        </div>

        <div className="reference-grid">
          <ReferenceCard title="Post identifier">
            <code className="reference-identifier">qhelp.feedback.v1.p.&lt;postId&gt;</code>
            <p>The post ID appears in both the QDN identifier and the JSON payload.</p>
          </ReferenceCard>
          <ReferenceCard title="Comment identifier">
            <code className="reference-identifier">qhelp.feedback.v1.c.&lt;commentId&gt;</code>
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

      <section className="reference-section" id="lifecycle">
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

      <section className="reference-section" id="metadata">
        <div className="reference-section__heading">
          <p className="reference-kicker">04 · QDN metadata</p>
          <h2>Payload data and search metadata are separate</h2>
          <p>
            The complete title and body live in <code>feedback.json</code>. Metadata is a compact discovery layer and
            is capped by Core.
          </p>
        </div>

        <div className="reference-limits" role="list">
          <div className="reference-limit" role="listitem">
            <strong>80</strong>
            <span>UTF-8 bytes for title</span>
          </div>
          <div className="reference-limit" role="listitem">
            <strong>240</strong>
            <span>UTF-8 bytes for description</span>
          </div>
          <div className="reference-limit" role="listitem">
            <strong>5</strong>
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

      <section className="reference-section" id="bridge">
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
                every failure before separately publishing the referencing feedback JSON with
                <code> PUBLISH_QDN_RESOURCE</code>.
              </li>
              <li>Home owns account selection, signing, approval prompts, and node routing.</li>
            </ul>
          </ReferenceCard>
        </div>

        <aside className="reference-callout">
          <strong>Attachment publishing is staged, not atomic.</strong>
          <p>
            Publish all attachments first and stop if the batch reports any failure. Only then publish the feedback
            JSON that references them. If the final JSON publish fails, the attachments can remain as unreferenced
            public resources and the author may retry the feedback publish.
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

      <section className="reference-section" id="examples">
        <div className="reference-section__heading">
          <p className="reference-kicker">06 · Copyable examples</p>
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
