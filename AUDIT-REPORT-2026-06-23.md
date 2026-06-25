# qortium-help Multidimensional Audit Report

**Date:** 2026-06-23
**Scope:** The `qortium-help` QDN feedback app, audited against Qortium Core (v1.0.0-preview.11..HEAD) and Qortium Home (preview.16..v1.1.1) prereleases, plus live Previewnet data and static-code analysis across 9 dimensions, with adversarial verification of high-risk findings.

## Executive Summary

qortium-help is a well-engineered, single-view React + TypeScript QDN feedback app with above-average accessibility hygiene, a correct display-settings contract, robust 64-byte identifier handling, and clean deep-link round-tripping that is already aligned with Core's finalized path-segment render identity (#43). No prerelease change in Core or Home is breaking for help today. The audit nonetheless surfaces one confirmed high-severity correctness/UX cluster and a small set of medium issues worth acting on: a missing keyboard focus indicator on every interactive control (a11y-1, high), and the major i18n gap — help declares 20 locales but ships only an English catalog, so every non-English user silently falls back to English (i18n-1, high), while Home has moved ahead with 3 additional languages (el, hi, nb) that help lacks entirely. Other confirmed mediums concern initialization flash-of-default-styles, screen-reader announcement of errors, reduced-motion, touch-target sizing, an origin-less postMessage listener, an N+1 fetch-with-no-cache load pattern, missing test coverage on security-sensitive sanitizers, and several scale/latency UX gaps (no pagination, no optimistic publish UI, no search). Adversarial verification confirmed the bulk of code-level findings, downgraded several to low/info, and refuted two live-data findings (an "orphaned comments" claim and a fabricated chain-wait comment) that should not drive any work.

## Top Priorities

1. **[HIGH] a11y-1 — Add a visible keyboard focus indicator.** `outline: none` is set on every button/filter/feed-item with no `:focus-visible` ring, so keyboard users see nothing — a real, app-wide accessibility barrier.
2. **[HIGH] i18n-1 — Wire up real translation catalogs.** `EMPTY_CATALOGS` is a permanent empty stub, so all 19 non-English "supported" locales silently render English; the translation mechanism is fully built but ships zero translations.
3. **[MEDIUM] disp-1 — Apply display settings eagerly before first paint.** `main.tsx` lacks Home's pre-render `applyDisplaySettings()` call, so a non-default theme/accent/text-size flashes default light/green/medium for one frame on load.
4. **[MEDIUM] a11y-3 — Announce errors to screen readers.** Load/publish/delete error and account notices are plain `<div>`s with no `role="alert"`/`aria-live`, so failures are silent to AT users (the loading state already does this correctly).
5. **[MEDIUM] sec-1 — Add an origin/source check to the window `message` listener.** The handler feeds `event.data` straight into state/account refresh with no `event.origin`/`event.source` guard; any framing window can drive theme/account changes (read-only, so adjusted to medium).
6. **[MEDIUM] latency-1 — Add optimistic UI and confirmation-latency messaging on publish.** A single global `busy` flag disables the whole UI behind a slow QDN write with only a generic spinner and no "awaiting confirmation" feedback.
7. **[MEDIUM] eff-1 — Cache QDN fetches across refreshes.** Every refresh re-downloads up to ~360 resources (N+1 fetch per post/comment) with no `latestSignature` diffing, after every publish, delete, and manual refresh.
8. **[MEDIUM] a11y-2 — Guard the loading spinner with `prefers-reduced-motion`.** The infinite spin animation has no reduced-motion media query, affecting motion-sensitive users.
9. **[MEDIUM] resp-1 — Raise touch targets to 44px on coarse pointers.** Icon/command/filter controls are 38px (toggles 30px), below WCAG 2.5.5 / Apple HIG, and sit close together on iOS.
10. **[MEDIUM] scale-1 / search-1 — Add pagination and text search.** The feed does a single un-paginated 120-post fetch with no infinite scroll and no search box, so older items vanish silently and users will file duplicates.
11. **[MEDIUM] test-1 — Test the security-sensitive sanitizers.** `sanitizeNodePath`/`sanitizeReadMethod`, `getDisplaySettingsUpdateFromMessage`, and clipboard fallback are pure, easily testable, and currently uncovered.
12. **[LOW→noted] i18n-2 — Add el/hi/nb locales to reach Home's 23-locale set.** Home now ships Greek, Hindi, and Norwegian Bokmål, which help omits from `SUPPORTED_LANGUAGES` entirely (graceful English fallback, not breaking).

---

## Dimension 1 — Qortium Core prerelease delta

**Summary:** Across preview.11..14 and the untagged HEAD commits, Core's front-end-relevant changes are: (1) the path-segment QDN render route (#43) finalizing how non-default identifiers ride the URL/base href; (2) a relaxed render CSP allowing workers/WebAssembly; (3) a new upload-based QDN preview endpoint; (4) chat keeping messages from members who left; and (5) new symmetric group read endpoints. help is read-mostly, using `/arbitrary` resource APIs plus account-name actions and path-segment deep links. The key item is #43: help's `deepLink.ts` (committed in 9910ae5) already parses the path-segment route and prefers Core's injected `_qdn*` globals, so it is functionally aligned with no required change. CSP, preview-upload, chat, and group-endpoint changes do not affect help today. No breaking change forces a help update. (Evidence drawn from git tags, not the GitHub release list, which shows v1.1.x.)

| id | severity | title | location | recommendation |
|----|----------|-------|----------|----------------|
| render-1 | info | Core #43 finalizes path-segment render identity; help's deepLink.ts already aligned | core `RenderResource.java`/`HTMLParser.java`; `src/deepLink.ts:70-80` | No change required; optionally cite #43 in the `deepLink.ts` header comment, keep the path-segment fallback. |
| render-2 | low | deepLink fallback peels the 3rd path segment unconditionally (minor divergence from Core's existence-probe) | `src/deepLink.ts:73-77` | Defensive only (Core injects `_qdnIdentifier`, preferred first). Optionally ignore 3rd segments that look like a filename/`index.html`. |
| csp-1 | info | Relaxed render CSP (workers + WASM) does not affect help | core `ArbitraryDataRenderer.java`; commit d335e3c67 | No action; help uses no workers/WASM. Headroom for any future worker feature. |
| preview-1 | info | New upload-based QDN preview endpoint is an optional dev/build convenience | core `ArbitraryResource.java` POST `/arbitrary/preview/{service}/upload`; a89474801 | No runtime change; optional tooling for remote-node dist preview. |
| chat-1 | info | "Keep messages from members who left" is unrelated to help (no chat APIs used) | core `HSQLDBChatRepository`; 2fe58795e | No action; reviewed and ruled out. |
| group-1 | info | New kicks-by-group / bans-by-member endpoints are unused; future opportunity only | core `GroupsResource.java`; 1d559133b + efbe40b31 | No required change; available via FETCH_NODE_API if help ever adds group-scoped moderation. |
| api-1 | info | No new API error codes, CORS, or render query-param changes to accommodate | core diff preview.11..HEAD; `src/qdnRequest.ts:32-60` | No accommodation needed; response parsing and node-path sanitization remain valid. |

## Dimension 2 — Home prerelease delta (bridge compatibility)

**Summary:** Reviewed Home v1.1.0 and v1.1.1 against the preview.16 baseline. The bridge-surface changes are: node-aware SHOW_ACTIONS (filters write/group/name/payment actions on a public node); two new read-capable actions, RESOLVE_IDENTITIES and SAVE_QDN_RESOURCE; account-scoping (tab pinned to its launch account); and an opt-in FETCH_NODE_API `includeHeaders` shape. Three new languages (el, hi, nb) were added to Home's display settings, so Home can push LANGUAGE_CHANGED with a locale help does not support. Deep-link/path-segment identity and query-param preservation are unchanged. Nothing is breaking; node-aware SHOW_ACTIONS interacts directly with help's publish/delete gating and is worth an explicit accommodation, and three items are net-new capabilities help could adopt.

| id | severity | title | location | recommendation |
|----|----------|-------|----------|----------------|
| showactions-1 | **medium → low (confirmed)** | Node-aware SHOW_ACTIONS gates publish/delete correctly, but help fetches it only once at startup | home `qdn-app-actions.ts` (14ebe39); `src/App.tsx:517,523,581` | **Confirmed:** `getBridgeState()` is called once at mount; no re-fetch on SELECTED_ACCOUNT_CHANGED or node-mode change. Re-call it on relevant messages so Publish/Delete controls update on an in-session node switch (Home v1.1.1 applies node selection instantly). |
| lang-1 | low | Home can push LANGUAGE_CHANGED with el/hi/nb, which help does not support | home `displaySettings.ts`; `src/i18n.ts:5-26` | Non-breaking (graceful fallback). Add el/hi/nb catalogs if parity wanted. |
| resolve-1 | low | New RESOLVE_IDENTITIES batch action could replace per-account name/avatar round-trips | home `qdn.ts`/`platform.ts` (3edfb62); `src/qdnFeedback.ts:390-395` | Adopt opportunistically (guarded by `hasAction(...,'RESOLVE_IDENTITIES')`), keep GET_ACCOUNT_NAMES fallback. |
| save-1 | info | New SAVE_QDN_RESOURCE action — adopt only if help offers download/export | home `qdn.ts`/`platform.ts:7493-7510` (4629b9d, 6fb0b76) | Nothing to accommodate today; available for any future attachment/export feature. |
| account-1 | **info (confirmed)** | Account-scoping (tab pinned to launch account) is compatible with help's SELECTED_ACCOUNT_CHANGED handling | home `qdn-views.ts` (2f6b6bd); `src/App.tsx:117-122,533-535` | **Confirmed:** help's handling is already correct under the new scoping; `refreshAccount()` now only observes unlock-state changes of the launch account. No change. |
| headers-1 | info | FETCH_NODE_API `includeHeaders` is opt-in; help's default usage is unaffected | home `platform.ts:6076-6083`; `src/qdnRequest.ts:166-198` | No change; opt in only if help ever needs paginated reads (X-Total-Count). |
| deeplink-1 | info | Deep-link render identity and query-param preservation unchanged | home `QdnViewer.tsx:163-166`; `src/deepLink.ts:1-91` | No change; avoid ever using a `qdnHomeBridge` query key (Home's internal Android token). |

## Dimension 3 — Display-setting helpers (theme/accent/text-size/language)

**Summary:** Home exposes display settings via URL query params (`?theme=&lang=&textSize=&accent=`) on load and via individual postMessage actions on every change. help correctly reads all four through both channels and applies them to the document root via the same `data-*` selectors as Home; CSS token values match Home design intent across all 9 accents × 2 themes × 6 text sizes, and RTL is handled for ar/he. Two concrete defects: help lacks an eager pre-render `applyDisplaySettings` call (1-frame flash of defaults), and uses paint-async `useEffect` rather than `useLayoutEffect` (flash on live changes). Three Home languages (el, hi, nb) are silently dropped by `normalizeLanguage`.

| id | severity | title | location | recommendation |
|----|----------|-------|----------|----------------|
| disp-1 | **medium (confirmed)** | Missing eager `applyDisplaySettings` in `main.tsx` → flash of default styles on load | `src/main.tsx:6` | **Confirmed:** React state seeds correctly but DOM attributes are only stamped in a post-paint effect. Add `applyDisplaySettings(getInitialDisplaySettings())` before `createRoot().render()`, mirroring Home `main.tsx:8`. |
| disp-2 | **low (confirmed, downgraded)** | `useEffect` instead of `useLayoutEffect` allows first-paint flash on live setting changes | `src/App.tsx:525-527` | **Confirmed:** divergence is real but the impact is a single frame on a live change. Switch to `useLayoutEffect` and add it to the React import. |
| disp-3 | low | el/hi/nb silently fall back to English with no user indication | `src/i18n.ts:5-26` | Add a comment noting el/hi/nb are absent pending translation; append when added. No behavioral change needed today. |
| disp-4 | info | CSS token namespace diverges (`--qh-*` vs `--color-*`) but all color values match | `src/styles.css:33-67` vs home `styles.css:57-120` | No action; document that `--qh-*` shadows `--color-*`; keep hex values in sync; consider a shared token source later. |
| disp-5 | **low (confirmed)** | Help base font 15px vs Home 16px → persistent ~1px offset at every text-size step | `src/styles.css:35` vs home `styles.css:60` | **Confirmed:** if 16px is canonical, update `--qh-text` base and re-verify layout at all 6 sizes. |
| disp-6 | info | Canonical contract confirmed: all four settings delivered via query params + postMessage with live changes | home `qdn.ts:710-719`, `QdnViewer.tsx:170-235`; `src/displaySettings.ts:70-143` | No action; the only actionable items are disp-1/disp-2. |

## Dimension 4 — i18n parity

**Summary:** help declares 20 locales in `SUPPORTED_LANGUAGES` but ships only `src/locales/en.ts` (56 keys). `EMPTY_CATALOGS` is permanently empty, so `createTranslator` always falls back to English — the mechanism is fully wired but carries no translations. Home ships 23 fully-translated catalogs (~543 keys each); help lags by 19 missing non-English catalogs plus 3 missing locale codes (el/hi/nb). Core ships the same 20-locale set (underscore `zh_CN`/`zh_TW` vs help's hyphen), so Core and help are at nominal parity but both miss el/hi/nb. RTL is wired at the JS layer and the CSS uses logical properties, but no ar/he strings exist so RTL is untested. The zh-CN/zh-TW mapping logic is correct.

| id | severity | title | location | recommendation |
|----|----------|-------|----------|----------------|
| i18n-1 | **high (confirmed)** | All 19 non-English catalogs missing — `EMPTY_CATALOGS` is a permanent dead stub | `src/i18n.ts:36` | **Confirmed:** populate a `CATALOGS` record keyed by `SupportedLanguage` (Home's `i18n/index.ts` pattern), seed the 19 files from Home's catalogs filtered to help's 56 keys. |
| i18n-2 | **medium → low (confirmed, downgraded)** | el/hi/nb present in Home but absent from help's `SUPPORTED_LANGUAGES` | `src/i18n.ts:5-26` | **Confirmed.** Downgraded: impact is identical to the 19 already-untranslated locales. Add el/hi/nb (+ files) to reach Home's 23-locale set. |
| i18n-3 | info | help's 56-key catalog is app-specific, no overlap with Home's 543-key catalog | `src/locales/en.ts` | Translate only the 56 keys; bootstrap by copying semantically-equivalent Home strings (e.g. `action.cancel`→`common.cancel`). |
| i18n-4 | **medium → low (confirmed, downgraded)** | RTL logic wired at JS layer but untested — no ar/he strings exist | `src/displaySettings.ts:98`, `src/i18n.ts:34` | **Confirmed:** CSS is largely RTL-ready (one physical `right` on the decorative watermark, see rtl-1). Visual RTL smoke-test when ar/he catalogs are added. |
| i18n-5 | info | zh-CN/zh-TW mapping logic is correct and complete | `src/i18n.ts:49-75` | No change; ensure `zh-CN.ts`/`zh-TW.ts` filenames match the hyphenated keys. |
| i18n-6 | **medium → low (partial)** | No sync mechanism to keep catalogs in step with Home/Core | `src/locales/` | **Partial:** the Partial-typed `EMPTY_CATALOGS` is a latent risk, not an active bug (nothing translated yet). Type locale exports as `Record<MessageKey,string>` and add a cross-reference comment / CI key-diff. |
| i18n-7 | info | Concrete parity gap: help 20 locales vs Home 23; Core and help aligned at 20 | help `i18n.ts` vs home `displaySettings.ts` vs core `i18n/` | Fill the 19 existing-list locales first, then add el/hi/nb; optionally file the three against Core. |

## Dimension 5 — Live chat feedback (Previewnet)

**Summary:** A search of the Qortium Previewnet node (http://127.0.0.1:24891) across all accessible public groups (development, minting, Qortal; 158 messages decoded from BASE64) found zero mentions of help/qhelp/qortium-help or related bug reports. The chat API and message retrieval are functional; the absence likely means help has not been publicly announced to Previewnet users yet, or feedback flows through other channels.

| id | severity | title | location | recommendation |
|----|----------|-------|----------|----------------|
| feedback-1 | info | No qortium-help feedback found in public chat | Previewnet `/chat/messages` | If feedback collection is a priority, verify help is published/discoverable, check private groups and GitHub issues, and add in-app feedback solicitation. |
| feedback-2 | info | API endpoints and message retrieval confirmed functional | `/groups` and `/chat/messages` | Methodology is sound; same approach reusable for future collection. |
| feedback-3 | info | Unrelated feedback found in development group | development group, 2026-06-22..23 | Positive Home feedback and UX concerns (reply UX, I2P, Windows compat) noted for cross-app consistency. |

## Dimension 6 — QDN qhelp feedback (direct API)

**Summary:** Extracted the Help app's feedback resources (`qhelp.feedback.v1.*`) from the live node. Several posts surface real friction: Home header consuming ~25% of screen, Chat lacking a jump-to-new-messages button, and difficulty distinguishing chain-wait from errors. Verification corrected two of these findings sharply: the "orphaned comments" claim was a stale snapshot (the parent posts exist on chain) and the "chain-wait vs error" comment resource does not exist (fabricated, future-dated). The posting UI itself works correctly (no empty/broken content).

| id | severity | title | location | recommendation |
|----|----------|-------|----------|----------------|
| app-ux-1 | **high → info (partial)** | Home header takes ~25% of screen | `qhelp.feedback.v1.p.mqgbei2w0y0w0r2o4v` (Saybin) | **Partial:** post is real but it is one user's informal Home design idea (not a help bug); date metadata was wrong. De-emphasized. Forward to Home design backlog. |
| app-ux-2 | **low (confirmed)** | Chat feature request: jump-to-new-messages button | `...p.mqphvxlt330c1t3f4u` (Native) | **Confirmed** on chain. Route to qortium-chat: add a floating "jump to new messages" control. |
| app-ux-3 | **low (confirmed)** | Chat feature request: invite-to-group context menu | `...p.mqqtm0h50h0m4k5769` (PolarBear) | **Confirmed** on chain. Route to qortium-chat/Home: user-name context menu with group checkboxes. |
| app-ux-4 | **REFUTED** | "Apps lack chain-wait vs error status feedback" | claimed `...c.mqon58uq2q5c443a17` | **Refuted:** the cited comment resource does not exist (1401), is future-dated (2026-06-24), and help already differentiates loading/error/ready states. Drop. (A minor real gap — no explicit post-publish "pending confirmation" indicator — is covered properly by latency-1.) |
| app-data-1 | **REFUTED** | "75% of comments are orphaned (missing parent posts)" | API search snapshot | **Refuted:** live query returns 8 posts (not 5); both "missing" parents exist on chain. Stale/low-limit snapshot. No orphan problem; drop. |
| app-workflow-1 | **medium → info (partial)** | "No post status tracking; all posts open" | feedback resources | **Partial:** raw observation correct, but status lifecycle already exists (open/done toggle, StatusPill, owner-only Complete/Reopen, filter tabs). Posts are simply open because none marked done. Only real gap: richer triage states (see status-1). |
| app-usage-1 | low | Recent activity burst (4 posts in 2 days) indicates engagement | resources 2026-06-20..24 | Use momentum to establish triage/response process and ship quick wins. |
| app-quality-1 | info | Posting UI works correctly (no empty/broken content) | search + JSON fetch | No urgent posting-flow issues. |
| app-coverage-1 | low | Small sample (9 resources) | qhelp.feedback.v1 search | Continue monitoring; add in-app feedback prompts if adoption stalls. |

## Dimension 7 — Accessibility & responsiveness

**Summary:** help shows above-average a11y hygiene: `IconButton` always sets `aria-label`+`title`, decorative icons carry `aria-hidden`, the loading spinner uses `role="status" aria-live="polite"`, form fields are labeled, semantic landmarks and `aria-pressed` toggles are used, and RTL is genuinely handled via `root.dir` + CSS logical properties. Text scaling is honored via `--qh-scale` up to 2.1×. Concrete gaps: no visible keyboard focus (high), no `prefers-reduced-motion` guard, error notices not announced, minor heading/landmark issues, several sub-44px touch targets, and clip risk from `app-shell overflow:hidden` at large scale. The focus and reduced-motion items are highest priority.

| id | severity | title | location | recommendation |
|----|----------|-------|----------|----------------|
| a11y-1 | **high (confirmed)** | No visible keyboard focus indicator on any button/filter/feed item | `src/styles.css:524,616` (+ `:455,716,585`) | **Confirmed:** only inputs get a focus ring. Add a global `:focus-visible` ring using the accent-ring token across buttons, filter items, feed items, segmented toggles. |
| a11y-2 | **medium (confirmed)** | Spinner ignores `prefers-reduced-motion` | `src/styles.css:964-974` | **Confirmed:** zero reduced-motion rules. Add `@media (prefers-reduced-motion: reduce)` disabling spin and hover transforms. |
| a11y-3 | **medium (confirmed)** | Error and account notices not announced to screen readers | `src/App.tsx:996,992` | **Confirmed:** plain divs vs the correctly-marked loading state. Add `role="alert"` to error notice, `role="status" aria-live="polite"` to account notice; announce the "Copied" confirmation. |
| a11y-4 | low | No skip-to-content link; focus not managed on view transitions | `src/App.tsx:921-995,732-747` | Add a visually-hidden skip link to `#main`; move focus to the panel heading/back button on view change and restore on back. |
| a11y-5 | low | Segmented type toggle is `role=group` with no accessible name | `src/App.tsx:250,1082` | Add `aria-label`; optionally model as `radiogroup`/`radio` with arrow-key nav. |
| a11y-6 | low | Heading hierarchy / main landmark could mislead AT | `src/App.tsx:922,929,1043/1180` | Make the outer wrapper a `div`, keep `header` as a banner sibling of `<main id="main">`; promote Filters/Replies titles to real headings or label the nav/section. |
| a11y-7 | info | Decorative brand image and watermark correctly hidden | `src/App.tsx:925-927,1252-1254` | No change; positive baseline. |
| resp-1 | **medium (confirmed)** | Several interactive targets below 44px | `src/styles.css:615,634,465,593` | **Confirmed** (status/count pills are passive spans, minor overstatement). Add `@media (pointer: coarse)` raising icon/command/filter to 44px and toggles to 40px. |
| resp-2 | **medium → low (partial)** | `app-shell overflow:hidden` + `min-height:100vh` can clip at large scale | `src/styles.css:304-309,990-1004` | **Partial:** `min-height` (not fixed `height`) does not clip vertically; genuine narrower risk is horizontal overflow being suppressed. Prefer `100dvh` and avoid `overflow:hidden` on single-column; verify huge scale in a ~360px panel. |
| resp-3 | low | Sidebar `minmax(232px,...)` can squeeze the feed and always shows on mobile | `src/styles.css:375,990-999` | Collapse filters into a chip scroller/disclosure on mobile; sidebar New Post is redundant with the list-head button. |
| resp-4 | **low (confirmed)** | Text-size scaling honored, but fixed-px control heights and clamps don't scale | `src/styles.css:34-38,110-132,898` | **Confirmed:** at `huge` (2.1×) body text approaches the 32px heading cap. Tie control heights/clamp ceilings to `--qh-scale` or use `em`. |
| rtl-1 | low | RTL well-handled, but watermark uses physical `right` | `src/styles.css:976-983` | Change `.app-watermark { right: 12px }` to `inset-inline-end: 12px` (only physical offset found). |
| contrast-1 | **low → info (partial)** | Status partly color-conveyed; kind marks color-only | `src/App.tsx:124-126`, `src/styles.css:837-845` | **Partial:** issue/idea use icon+color (good); warning/muted contrast actually passes AA. But verification found two omitted real issues: kind-mark spans lack a screen-reader label, and issue/idea icons on soft backgrounds fall below 4.5:1 (WCAG 1.4.11). Add an `aria-label`/visually-hidden type label and check icon-on-soft contrast. |

## Dimension 8 — Code correctness & efficiency

**Summary:** A React + TypeScript Vite QDN app; build (`tsc --noEmit` + `vite build`) and 24 vitest cases pass cleanly. Well-engineered overall: correct 64-byte identifier handling, untrusted bodies rendered as React text nodes (no `dangerouslySetInnerHTML`), defensive payload validation, and node-API path/method sanitization. Material issues: a missing origin check on the window `message` listener (security), concurrency gaps in async publish/delete/refresh (no request token), an N+1 fetch-per-resource load with no caching, and a 1257-line monolithic `App.tsx`. The rendered app-link href carries a raw user-controlled address (navigation-prevented). Test coverage is solid for pure helpers but absent for App flows, sanitizers, displaySettings, and clipboard.

| id | severity | title | location | recommendation |
|----|----------|-------|----------|----------------|
| sec-1 | **high → medium (confirmed)** | window `message` listener has no origin/source check | `src/App.tsx:529-541` | **Confirmed:** Home's own QdnViewer checks origin+source. Gate the handler on the trusted Home origin / `event.source === window.parent`. Downgraded: the SELECTED_ACCOUNT_CHANGED path is read-only (no write escalation). |
| core-1 | **high → medium (partial)** | Concurrent publish/delete/refresh can interleave; no request token | `src/App.tsx:558-585,781-806,896-917` | **Partial:** the missing request-token pattern is real, but existing `busy`/`loadState` guards block the most likely races; only edge-case windows remain. Add a monotonic request id or AbortController in `refreshFeedback`. |
| eff-1 | **medium (confirmed)** | N+1 QDN fetches on every load with no cross-refresh caching | `src/qdnFeedback.ts:318-337` | **Confirmed:** up to ~360 fetches per refresh, `latestSignature` returned but never used to skip unchanged resources. Cache by identifier + latestSignature; re-fetch only changed resources. |
| core-2 | low | `data.posts.find` recomputed every render; `selectedPost` not memoized | `src/App.tsx:697-698` | Wrap in `useMemo([data.posts, selectedPostId])`. |
| arch-1 | **medium (confirmed)** | App.tsx is a 1257-line monolith (23 useState, 6 edit sub-flows, ad hoc routing) | `src/App.tsx:488-1257` | **Confirmed.** Extract detail/list/edit components and `useFeedback()`/`useAccount()`/`useBridge()` hooks; replace scattered edit state with one discriminated union (makes core-1 tractable). |
| core-3 | low | message-listener effect captures stale translator/refreshAccount | `src/App.tsx:529-556` | Use refs for `t`/`refreshAccount` or add deps; low impact (fallback error text language only). |
| sec-2 | low | Rendered app-link href carries raw user-controlled address | `src/feedbackLinks.tsx:114-138` | Navigation is intercepted; drop the live href (use `#`/button) or validate address shape before OPEN_NEW_TAB. |
| core-4 | info | Reply title/description truncated by code units, not bytes | `src/qdnFeedback.ts:533-553` | Cosmetic (Core re-truncates); use `TextEncoder` byte length or fix the comment. |
| test-1 | **medium (confirmed)** | Coverage gaps: App flows, qdnRequest sanitizers, displaySettings, clipboard | `src/qdnRequest.ts`, `src/displaySettings.ts`, `src/clipboard.ts` | **Confirmed** (writable-name flows are partially covered). Add unit tests for the path/method sanitizers, `getDisplaySettingsUpdateFromMessage`, clipboard fallback, and `loadPublishedAppNames` paging. |
| eff-2 | low | List rendered without virtualization (bounded by 120/240) | `src/App.tsx:1185-1245` | Fine today; add windowing/pagination if limits grow. |
| core-5 | info | `bytesToBase64` spreads slices into `String.fromCharCode` — fine but fragile | `src/qdnFeedback.ts:88-97` | No change (payloads capped at 200k); optional clarity refactor. |
| arch-2 | low | Two divergent `isRecord`/`isObject` helpers; unused attachment surface | `src/App.tsx:113-115`, `src/qdnFeedback.ts:72-74`, `src/displaySettings.ts:32-34` | Consolidate type guards; wire up or drop attachment types. |

## Dimension 9 — UI/UX & platform-capability use

**Summary:** A well-structured, accessible feedback app (clean list/detail/compose IA, deep-link round-tripping, in-body qdn:// link rendering, display-settings syncing). Biggest gaps are scale and publish latency: a single un-paginated fetch with no infinite scroll, no offset paging, and no search box despite Core search exposing query/keywords/before/after/offset; no optimistic UI (every publish blocks behind a slow confirmation with a generic spinner and a global `busy` flag); filter-only sorting; and substantial unused platform value (avatars, RESOLVE_IDENTITIES/GET_NAME_DATA, CREATE_POLL/VOTE_ON_POLL, RATE_ACCOUNT, SEND_CHAT_MESSAGE, OPEN_NEW_TAB app-context, plus the fully-modeled-but-unused FeedbackAttachment). Sibling qortium-chat already implements avatars and reactions/voting help could mirror.

| id | severity | title | location | recommendation |
|----|----------|-------|----------|----------------|
| scale-1 | **high → medium (confirmed)** | Single un-paginated fetch, no infinite scroll/search; will not scale | `src/qdnFeedback.ts:318-337`, `src/App.tsx:558-578` | **Confirmed** (downgraded: early-stage, local-node, not imminent). Add offset/cursor pagination + "Load more"/IntersectionObserver; lazy-fetch comment bodies per-post on detail open. |
| latency-1 | **high → medium (confirmed)** | No optimistic UI and no slow-confirmation messaging on publish | `src/App.tsx:781-806,940` | **Confirmed:** single global `busy` disables the whole UI; submit shows only "Loading". Insert an optimistic "Publishing…" item, add latency copy, scope disabled state to the in-flight action. |
| search-1 | **high → medium (confirmed)** | No text search despite Core search supporting query/keywords/title | `src/qdnFeedback.ts:302-316` | **Confirmed:** Core `title` filtering verified working on the live node. Add a search box (client-side filter now; pass `query`/`title` for scale); surface likely duplicates in the composer. |
| sort-1 | **low (confirmed)** | Only filters, no sort control; ordering fixed to `updated` desc | `src/qdnFeedback.ts:333-336`, `src/App.tsx:678-695` | **Confirmed:** add a sort dropdown (Recently active / Newest / Oldest / Most replies); `commentsByPostId` already gives reply counts. |
| cap-attachments-1 | **medium (confirmed)** | Attachments fully modeled but never surfaced (README: "reserved") | `src/qdnFeedback.ts:20-28,166-194`, `README.md:44` | **Confirmed:** deferred-by-design. Render present attachments in detail (OPEN_QDN_DOCUMENT_VIEWER/MEDIA_PLAYER); add upload-and-link via PUBLISH_MULTIPLE_QDN_RESOURCES. |
| cap-avatar-1 | **medium (confirmed)** | No author avatars/identity though Home bridge and chat provide them | `src/App.tsx:355,396,1045`; chat `avatarProfiles.ts:135-137` | **Confirmed:** port qortium-chat's THUMBNAIL/'avatar' blob-URL pattern (reuse its security approach) for feed/comment/detail authors. |
| cap-vote-1 | **low (confirmed)** | No voting/reactions on ideas though CREATE_POLL/VOTE_ON_POLL and chat reactions exist | home `platform.ts:4388-4454`; chat `messageReactions.ts` | **Confirmed:** add lightweight upvoting (reaction payload tallied client-side; mirrors chat) + a "Top voted" sort; richer option is CREATE_POLL/VOTE_ON_POLL. |
| cap-appnav-1 | low | App tag is a passive pill; does not deep-link via OPEN_NEW_TAB | `src/App.tsx:352,1048`, `src/feedbackLinks.tsx:108-109` | Make the app pill clickable: filter the feed to that app + an "Open app" affordance via OPEN_NEW_TAB. |
| ux-error-1 | low | Errors and copy-link fallback share one global notice; transient errors don't auto-dismiss | `src/App.tsx:996,832-841` | Use a transient toast for success/copy-fallback; reserve the red banner for real errors with dismiss/auto-clear. |
| mobile-1 | low | Full filter sidebar stacks above the feed on mobile, pushing content down | `src/styles.css:990-1004` | Collapse filters into a chip row or drawer on narrow screens; keep New Post sticky. |
| status-1 | **low (confirmed)** | Binary open/done workflow; no triage states or reply notifications | `src/qdnFeedback.ts:18,517-523` | **Confirmed:** expand to open/planned/in-progress/done/declined; reconsider who can change status (tagged app's name owner, not only reporter); optional SEND_CHAT_MESSAGE reply notice. |
| ux-confirm-1 | low | Destructive delete has no confirmation step | `src/App.tsx:1068-1075,896-917` | Add an inline confirm and warn that replies will be orphaned (immutable-ledger-backed). |

---

## Recommended changes — roadmap

### 1. Accommodate (keep working with new Core/Home)
- **showactions-1 (low):** Re-call `getBridgeState()` on relevant bridge messages so Publish/Delete controls update when the user switches node mode in-session (Home v1.1.1 applies node selection instantly). Correctness is already fine; this is in-session responsiveness.
- **account-1 (info, confirmed no-op):** No change; regression-check that unlocking the launch account still re-enables publish.
- **render-1 / api-1 (info):** No change; help is already aligned with Core #43 and there are no new error codes/CORS/query params to accommodate. (Optionally harden render-2's path fallback.)

### 2. Adopt (new capabilities to take advantage of)
- **cap-avatar-1 (medium):** Port qortium-chat's THUMBNAIL/'avatar' avatar pattern for author identity.
- **cap-attachments-1 (medium):** Surface the already-modeled attachments via PUBLISH_MULTIPLE_QDN_RESOURCES + OPEN_QDN_*_VIEWER.
- **resolve-1 (low):** Use RESOLVE_IDENTITIES (guarded) to batch author name/avatar lookups.
- **cap-vote-1 (low):** Add upvoting for ideas (client-side reaction tally, or CREATE_POLL/VOTE_ON_POLL).
- **cap-appnav-1 (low):** Make the app pill deep-link via OPEN_NEW_TAB and filter the feed.
- **save-1 (info):** Reserve SAVE_QDN_RESOURCE for any future export/download.

### 3. Fix (correctness & a11y bugs)
- **a11y-1 (high):** Add a `:focus-visible` ring across all interactive controls.
- **a11y-3 (medium):** Add `role="alert"`/`aria-live` to error and account notices; announce "Copied".
- **a11y-2 (medium):** Add a `prefers-reduced-motion` guard for the spinner and hover transforms.
- **resp-1 (medium):** Raise touch targets to 44px on coarse pointers.
- **sec-1 (medium):** Add an origin/source check to the window `message` listener.
- **eff-1 (medium):** Cache QDN fetches by identifier + latestSignature.
- **core-1 (medium):** Add a request token / AbortController to `refreshFeedback`.
- **test-1 (medium):** Test the node-API sanitizers, message parsing, clipboard fallback, and paging.
- **disp-1 (medium):** Eagerly apply display settings before first paint.
- **disp-2 / rtl-1 / resp-4 / contrast-1 (low):** `useLayoutEffect`; `inset-inline-end` watermark; scale-tie control heights; add kind-mark labels and verify icon-on-soft contrast.

### 4. Improve (UX / i18n / polish)
- **i18n-1 (high):** Wire up the real catalog registry and seed the 19 missing locales.
- **i18n-2 / disp-3 / lang-1 (low):** Add el/hi/nb to reach Home's 23-locale set.
- **i18n-6 (low):** Enforce `Record<MessageKey,string>` typing + a key-parity CI check.
- **scale-1 / search-1 / latency-1 (medium):** Pagination/infinite scroll, a search box, and optimistic publish UI with latency messaging.
- **sort-1 / status-1 / mobile-1 / ux-error-1 / ux-confirm-1 (low):** Sort dropdown; richer triage states; mobile filter drawer; toast vs error banner separation; delete confirmation.
- **arch-1 (medium):** Decompose `App.tsx` into components + hooks.

---

## Audit method & limitations

- **Live-data dimensions:** Live chat feedback (Dimension 5) and QDN qhelp feedback (Dimension 6) queried the running Qortium Previewnet node at `http://127.0.0.1:24891` (`/groups`, `/chat/messages`, `/arbitrary/resources/search`, `/arbitrary/JSON`). Adversarial verification re-queried this node and **refuted two findings**: app-data-1 (the "orphaned comments" claim was a stale/low-limit snapshot — the parent posts exist on chain, 8 posts not 5) and app-ux-4 (the cited chain-wait comment resource does not exist and was future-dated). app-ux-1's date metadata was also wrong and its severity inflated. These should not drive work.
- **Static-code dimensions:** Core/Home prerelease deltas (1, 2), display settings (3), i18n (4), accessibility/responsiveness (7), code correctness (8), and UI/UX (9) were assessed by reading qortium-help, qortium-home, qortium-chat, and qortium-core source at specific file:line locations; build and 24 vitest cases pass. Verification confirmed the majority of code claims, downgraded several severities (sec-1 high→medium, core-1 high→medium, scale-1/search-1/latency-1 high→medium, disp-2/i18n-2/i18n-4 to low), and flagged i18n-6/resp-2/contrast-1 as partial.
- **Could not be checked:** RTL rendering correctness in practice (no ar/he strings exist, so it is wired but unexercised — i18n-4); actual pixel contrast of issue/idea icons on soft backgrounds and muted small text were computed but not visually confirmed across both themes at all 6 text sizes; runtime behavior under an in-session node-mode switch (showactions-1) and under genuine concurrent refresh races (core-1) was reasoned from code, not executed; and Previewnet feedback volume is a small sample (9 resources) that may not represent all user pain points. Core preview tags were read from local git, not the GitHub release list (which shows v1.1.x).
