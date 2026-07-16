# Qortium Help

A QDN feedback app for Qortium Home. Community members can publish issues and
ideas, reply to them, edit or delete resources they own, and mark posts complete
or reopen them. Post and comment bodies recognize `qdn://`, `home://`, and
`core://` links and open them in a new Home tab.

## Current features

- Top-level Feedback, My Apps, New Post, and Developers workspaces.
- Feed filters for all, open, completed, issues, ideas, orphan comments, and
  apps owned by the selected account.
- An app dropdown, server-backed text search, active/newest sorting, paged post
  retrieval, and replies fetched only when a post opens.
- Registered-name avatars on posts and comments.
- Per-post detail and reply threads, copyable direct links, and ownership-gated
  edit, delete, complete, and reopen controls.
- Up to three public QDN attachments on new posts and replies. Help first
  publishes the attachment batch, waits for every exact resource/signature
  target to reach `READY`, then publishes the referencing feedback JSON. Stable
  draft and attachment identifiers make retries reuse the same resource tuples;
  media and documents open through the matching Home viewer when available.
- A permanently English Developer Reference documenting the public JSON schema,
  identifiers, lifecycle, QDN metadata limits, bridge behavior, and copyable
  publish/search/fetch/delete examples.
- Explicit preparing, submitting, confirmation, and published states for QDN
  writes, with optimistic posts/replies retained while confirmation completes.

Classic, Modern, and Fun all use the full app window responsively. Modern keeps
wider gutters, while Classic and Fun remain denser.

## Runtime and QAVS

Qortium Home supplies the `qdnRequest` bridge, selected account, writable names,
and publish/delete actions. The plain-browser fallback can read public feedback
resources from `http://127.0.0.1:24891`; creating, editing, deleting, completing,
and reopening require Home and a selected account that owns a registered name.

Help is at QAVS `1.4.3`: `1.4` is the minimum Qortium platform level and the
patch number is the app release. `vite.config.ts` reads `package.json`, injects
the visible version, and emits `dist/qortium-app.json` with the name `Help`.

The app supports Classic, Modern, and Fun QDN UI styles and follows Home theme,
accent, language, and text-size settings. Its base scale matches Home, Polls,
Minting, and Boards: 13px supporting text, 16px interface text, 21px section
headings, and 28px page titles before Home's selected multiplier is applied.

## Development and verification

```sh
npm install
npm run dev -- --host 127.0.0.1
npm test
npm run build
npm run preview
```

## Previewnet publish

```sh
npm run build
npm run qdn:publish
```

The publisher uploads `dist/` as `qdn://APP/Help/Help` through the local Core at
`http://127.0.0.1:24891`. It defaults to
`~/qortium/git/qortium-core/preview/secrets/initial-minting-accounts.json`.
Overrides use the `QORTIUM_HELP_` prefix.

The render URL is `http://127.0.0.1:24891/render/APP/Help/Help`. The publisher
waits for `/arbitrary/resource/status/APP/Help/Help?build=true` to report
`READY`.

## Feedback data

Feedback uses QDN's `JSON` service with schema `qortium.help.feedback.v1`:

```text
qhelp.feedback.v1.p.<postId>
qhelp.feedback.v1.c.<commentId>
```

The comment's parent post ID lives in its JSON payload rather than its resource
identifier, keeping the identifier within QDN's 64-byte limit. Post status is
`open` or `done`.

## Deep links

Home preserves query parameters when it renders the app. Supported forms are:

```text
qdn://APP/Help/Help?post=<postId>           # open one post
qdn://APP/Help/Help?app=<appName>           # filter the feed by app
qdn://APP/Help/Help?type=<filter>            # select a feed filter
qdn://APP/Help/Help?new                      # open a blank composer
qdn://APP/Help/Help?new=<appName>&type=issue # prefill app and post type
qdn://APP/Help/Help?view=developers          # open the Developer Reference
```

`type` accepts the feed filters implemented in `src/deepLink.ts`, including
`all`, `open`, `completed`, `issue`, `idea`, `my-apps`, and `orphan`. Composer
prefill accepts only `issue` or `idea`.
