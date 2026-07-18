// Deep links let a post be shared and opened directly. Qortium Home renders the
// app at `/render/<service>/<name>/<identifier>/<path>` (the identifier is a path
// segment, matching Core's path-segment render route) and preserves any extra
// query params from the opened qdn:// address into that render URL, so a
// `?post=<postId>` param round-trips into the app's own `window.location.search`.
//
// A shared link looks like `qdn://APP/Help/Help?post=<postId>`. Because it is a
// qdn:// address it is also clickable inside post/comment bodies (see
// feedbackLinks), opening a new Home tab focused on that item.

import type { FeedbackKind } from './qdnFeedback';

const DEFAULT_SERVICE = 'APP';
const DEFAULT_NAME = 'Help';
const DEFAULT_IDENTIFIER = 'Help';

export const POST_QUERY_PARAM = 'post';
export const APP_QUERY_PARAM = 'app';
export const NEW_QUERY_PARAM = 'new';
export const TYPE_QUERY_PARAM = 'type';
export const VIEW_QUERY_PARAM = 'view';

export type InitialFeedFilter = 'all' | 'completed' | 'idea' | 'issue' | 'myApps' | 'open' | 'orphan';

type LocationLike = {
  pathname?: string;
  search?: string;
};

// Core injects these globals into every rendered QDN page (see Core's HTMLParser),
// so they are the authoritative identity of the resource we are running inside.
type QdnHostGlobals = {
  _qdnService?: unknown;
  _qdnName?: unknown;
  _qdnIdentifier?: unknown;
};

function resolveLocation(location?: LocationLike): LocationLike {
  if (location) {
    return location;
  }

  return typeof window === 'undefined' ? {} : window.location;
}

function resolveHost(host?: QdnHostGlobals): QdnHostGlobals {
  if (host) {
    return host;
  }

  return typeof window === 'undefined' ? {} : (window as Window & QdnHostGlobals);
}

function cleanGlobal(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function decodeSegment(value: string | undefined): string {
  if (!value) {
    return '';
  }

  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

// Derive `qdn://<service>/<name>/<identifier>` for the resource hosting this app.
// Prefer Core's injected `_qdnService`/`_qdnName`/`_qdnIdentifier` globals; fall
// back to parsing the path-segment render route, then to the published
// APP/Help/Help identity (e.g. in local dev where nothing is injected).
export function getAppBaseAddress(location?: LocationLike, host?: QdnHostGlobals): string {
  const { pathname = '' } = resolveLocation(location);
  const { _qdnService, _qdnName, _qdnIdentifier } = resolveHost(host);
  const renderMatch = pathname.match(/\/render\/([^/]+)\/([^/]+)(?:\/([^/?#]+))?/i);

  const service = cleanGlobal(_qdnService) || decodeSegment(renderMatch?.[1]) || DEFAULT_SERVICE;
  const name = cleanGlobal(_qdnName) || decodeSegment(renderMatch?.[2]) || DEFAULT_NAME;
  const identifier = cleanGlobal(_qdnIdentifier) || decodeSegment(renderMatch?.[3]) || DEFAULT_IDENTIFIER;

  return `qdn://${encodeURIComponent(service)}/${encodeURIComponent(name)}/${encodeURIComponent(identifier)}`;
}

export function buildPostLink(postId: string, location?: LocationLike, host?: QdnHostGlobals): string {
  return `${getAppBaseAddress(location, host)}?${POST_QUERY_PARAM}=${encodeURIComponent(postId)}`;
}

export function getInitialPostId(search?: string): string | null {
  const raw = search ?? (typeof window === 'undefined' ? '' : window.location.search);
  const value = new URLSearchParams(raw).get(POST_QUERY_PARAM)?.trim();

  return value ? value : null;
}

export function getInitialNewPostRequested(search?: string): boolean {
  const raw = search ?? (typeof window === 'undefined' ? '' : window.location.search);

  return new URLSearchParams(raw).has(NEW_QUERY_PARAM);
}

export function getInitialDeveloperReferenceRequested(search?: string): boolean {
  const raw = search ?? (typeof window === 'undefined' ? '' : window.location.search);
  const value = new URLSearchParams(raw).get(VIEW_QUERY_PARAM)?.trim().toLowerCase();

  return value === 'developer' || value === 'developers' || value === 'reference';
}

export function getInitialAppFilter(search?: string): string | null {
  const raw = search ?? (typeof window === 'undefined' ? '' : window.location.search);
  const value = new URLSearchParams(raw).get(APP_QUERY_PARAM)?.trim();

  return value ? value : null;
}

export function getInitialFeedFilter(search?: string): InitialFeedFilter | null {
  const raw = search ?? (typeof window === 'undefined' ? '' : window.location.search);
  const value = new URLSearchParams(raw).get(TYPE_QUERY_PARAM)?.trim().toLowerCase();

  switch (value) {
    case 'all':
    case 'open':
    case 'issue':
    case 'idea':
      return value;
    case 'completed':
    case 'done':
      return 'completed';
    case 'issues':
      return 'issue';
    case 'ideas':
      return 'idea';
    case 'my apps':
    case 'my-apps':
    case 'my_apps':
    case 'myapps':
      return 'myApps';
    case 'orphan':
    case 'orphans':
      return 'orphan';
    default:
      return null;
  }
}

export type ComposerParams = {
  app: string | null;
  type: FeedbackKind | null;
};

// Compose links use `?new` for a general post and `?new=<name>` to pre-fill the
// product selector. The legacy `?app=<name>` key remains reserved for the
// filtered list view so existing links stay compatible. `type` is only honoured
// for the two known feedback kinds.
export function getInitialComposerParams(search?: string): ComposerParams {
  const raw = search ?? (typeof window === 'undefined' ? '' : window.location.search);
  const query = new URLSearchParams(raw);
  const isNewPost = query.has(NEW_QUERY_PARAM);
  const app = isNewPost ? query.get(NEW_QUERY_PARAM)?.trim() || null : null;
  const rawType = query.get(TYPE_QUERY_PARAM);
  const type: FeedbackKind | null = isNewPost && (rawType === 'issue' || rawType === 'idea') ? rawType : null;

  return { app, type };
}
