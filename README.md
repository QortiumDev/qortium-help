# Qortium Help

A QDN app for Qortium Home community feedback. The first milestone supports JSON-backed issues, ideas, replies, edits, and deletes through Home's QDN bridge.

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

By default this publishes `dist/` as `qdn://APP/Help/Help` using the local Previewnet account files under `~/git/qortium/preview`.

The browser fallback can read public QDN feedback resources from `http://127.0.0.1:24891`. Publishing, editing, and deleting require Qortium Home with a selected account that owns a registered name.

## QDN Data

Feedback resources use the `JSON` service:

```text
qhelp.feedback.v1.p.<postId>
qhelp.feedback.v1.c.<postId>.<commentId>
```

Posts and comments use schema `qortium.help.feedback.v1`. Attachments are reserved for a later milestone and should be linked as separate QDN resources from the JSON payload.
