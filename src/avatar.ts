import { qdnRequest } from './qdnRequest';

// Author avatars are rendered straight into `<img src>`, so we only ever build
// them from an allowlisted raster image type (raster-only deliberately excludes
// `image/svg+xml`, whose data URLs can carry script), validate the base64
// alphabet before decoding, and wrap the decoded bytes in a Blob served via
// `URL.createObjectURL` — the value handed to `<img src>` is an opaque `blob:`
// URL rather than a string built from the remote payload. (Ported from
// qortium-chat's hardened avatar path; cap-avatar-1.)
const AVATAR_MAX_BYTES = 500 * 1024;
const SAFE_IMAGE_MIME_TYPES = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp']);
const BASE64_PATTERN = /^[A-Za-z0-9+/]+={0,2}$/;

function decodeBase64ToBytes(base64: string) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
}

function getImageMimeType(base64: string) {
  if (base64.startsWith('iVBORw0KGgo')) {
    return 'image/png';
  }

  if (base64.startsWith('/9j/')) {
    return 'image/jpeg';
  }

  if (base64.startsWith('R0lGOD')) {
    return 'image/gif';
  }

  if (base64.startsWith('UklGR')) {
    return 'image/webp';
  }

  return 'image/png';
}

function getBase64Payload(value: unknown) {
  if (typeof value !== 'string') {
    throw new Error('Avatar resource returned an unsupported response.');
  }

  const base64 = value.trim();

  if (!base64 || !BASE64_PATTERN.test(base64)) {
    throw new Error('Avatar resource returned malformed image data.');
  }

  return base64;
}

export function getAvatarFallbackCharacter(name: string | null | undefined) {
  return name && name.length > 0 ? (Array.from(name)[0] ?? '?') : '?';
}

async function fetchAvatarImage(name: string): Promise<string> {
  const base64 = getBase64Payload(
    await qdnRequest<unknown>({
      action: 'FETCH_QDN_RESOURCE',
      service: 'THUMBNAIL',
      name,
      identifier: 'avatar',
      encoding: 'base64',
      rebuild: true,
      maxBytes: AVATAR_MAX_BYTES,
    }),
  );
  const mimeType = getImageMimeType(base64);

  // Defence in depth: even after signature sniffing, never construct a Blob with
  // a type outside the raster allowlist.
  const blob = new Blob([decodeBase64ToBytes(base64)], {
    type: SAFE_IMAGE_MIME_TYPES.has(mimeType) ? mimeType : 'image/png',
  });

  // Returns an opaque `blob:` URL held for the session (not revoked — a shared URL
  // could still back a rendered avatar elsewhere).
  return URL.createObjectURL(blob);
}

// Session-scoped caches keyed by registered name: `resolved` holds the final
// blob URL (or null when the author has no avatar / the fetch failed), `inflight`
// dedupes concurrent requests so a name shared across many feed items is fetched
// at most once.
const resolved = new Map<string, string | null>();
const inflight = new Map<string, Promise<string | null>>();

export function getCachedAvatar(name: string): string | null | undefined {
  return resolved.get(name);
}

export function resolveAvatar(name: string): Promise<string | null> {
  if (!name) {
    return Promise.resolve(null);
  }

  if (resolved.has(name)) {
    return Promise.resolve(resolved.get(name) ?? null);
  }

  const existing = inflight.get(name);

  if (existing) {
    return existing;
  }

  const pending = fetchAvatarImage(name)
    .then((src) => src)
    .catch(() => null)
    .then((src) => {
      resolved.set(name, src);
      inflight.delete(name);

      return src;
    });

  inflight.set(name, pending);

  return pending;
}
