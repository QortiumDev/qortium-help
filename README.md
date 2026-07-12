# Qortium Help

A QDN app for Qortium Home community feedback. Supports JSON-backed issues, ideas, replies, edits, deletes, and marking a post complete through Home's QDN bridge. Post and comment bodies can contain `qdn://`, `home://`, and `core://` links, which open in a new Qortium Home tab.

## Development

Install dependencies:

```sh
npm install
```

Run locally:

```sh
npm run dev -- --host 127.0.0.1
```

Build:

```sh
npm run build
```

Publish to the default Previewnet QDN identity:

```sh
npm run qdn:publish
```

By default this publishes `dist/` as `qdn://APP/Help/Help` using the local Previewnet account files under `~/qortium/git/qortium-core/preview/secrets`.

The browser fallback can read public QDN feedback resources from `http://127.0.0.1:24891`. Publishing, editing, and deleting require Qortium Home with a selected account that owns a registered name.

## QDN Data

Feedback resources use the `JSON` service:

```text
qhelp.feedback.v1.p.<postId>
qhelp.feedback.v1.c.<commentId>
```

Posts and comments use schema `qortium.help.feedback.v1`. The comment identifier embeds only the comment id (the parent post id lives in the JSON payload) to keep identifiers within the 64-byte QDN limit. Posts carry a `status` of `open` or `done`. Attachments are reserved for a later milestone and should be linked as separate QDN resources from the JSON payload.

## Direct links

The **Copy link** button on an open item copies a shareable address of the form:

```text
qdn://APP/Help/Help?post=<postId>
```

Opening that address in Qortium Home loads the app and jumps straight to the item. Home preserves the `post` query param into the app's render URL, which the app reads on load (`deepLink.ts`). Because the link is a `qdn://` address it is also clickable when pasted into any post or comment body.
