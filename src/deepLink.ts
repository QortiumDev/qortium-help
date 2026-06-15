// Deep links let a post be shared and opened directly. Qortium Home renders the
// app at `/render/<service>/<name>?identifier=<id>&...` and preserves any extra
// query params from the opened qdn:// address into that render URL, so a
// `?post=<postId>` param round-trips into the app's own `window.location.search`.
//
// A shared link looks like `qdn://APP/Help/Help?post=<postId>`. Because it is a
// qdn:// address it is also clickable inside post/comment bodies (see
// feedbackLinks), opening a new Home tab focused on that item.

const DEFAULT_SERVICE = 'APP';
const DEFAULT_NAME = 'Help';
const DEFAULT_IDENTIFIER = 'Help';

export const POST_QUERY_PARAM = 'post';

type LocationLike = {
  pathname?: string;
  search?: string;
};

function resolveLocation(location?: LocationLike): LocationLike {
  if (location) {
    return location;
  }

  return typeof window === 'undefined' ? {} : window.location;
}

// Derive `qdn://<service>/<name>/<identifier>` from where Home is rendering this
// app, falling back to the published APP/Help/Help identity (e.g. in local dev).
export function getAppBaseAddress(location?: LocationLike): string {
  const { pathname = '', search = '' } = resolveLocation(location);
  const renderMatch = pathname.match(/\/render\/([^/]+)\/([^/]+)/i);
  const service = renderMatch ? decodeURIComponent(renderMatch[1]) : DEFAULT_SERVICE;
  const name = renderMatch ? decodeURIComponent(renderMatch[2]) : DEFAULT_NAME;
  const identifierParam = new URLSearchParams(search).get('identifier')?.trim();
  const identifier = identifierParam || DEFAULT_IDENTIFIER;

  return `qdn://${encodeURIComponent(service)}/${encodeURIComponent(name)}/${encodeURIComponent(identifier)}`;
}

export function buildPostLink(postId: string, location?: LocationLike): string {
  return `${getAppBaseAddress(location)}?${POST_QUERY_PARAM}=${encodeURIComponent(postId)}`;
}

export function getInitialPostId(search?: string): string | null {
  const raw = search ?? (typeof window === 'undefined' ? '' : window.location.search);
  const value = new URLSearchParams(raw).get(POST_QUERY_PARAM)?.trim();

  return value ? value : null;
}
