import { createContext, createElement, useContext, useEffect, useState, type ReactNode } from 'react';
import { hasAction, hasHomeBridge, qdnRequest } from './qdnRequest';
import type { QdnAction } from './types';

const AVATAR_MAX_BYTES = 500 * 1024;
const MAX_PENDING_RETRIES = 3;
const SAFE_IMAGE_MIME_TYPES = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/bmp', 'image/webp']);
const BASE64_PATTERN = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

type AvatarSource = 'POINTER' | 'LEGACY';
type AccountAvatarResult =
  | { kind: 'pending'; retryAfterSeconds: number }
  | { bytes: Uint8Array; contentType: string; kind: 'ready' }
  | { kind: 'unavailable' };

const AvatarActionsContext = createContext<QdnAction[]>([]);
const ownerCache = new Map<string, string | null>();
const ownerInFlight = new Map<string, Promise<string | null>>();

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function text(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function isAccountAddress(value: string) {
  return /^Q[1-9A-HJ-NP-Za-km-z]{20,80}$/.test(value);
}

function isPointerDescriptor(value: unknown) {
  return isRecord(value) && !!text(value.service) && !!text(value.name) && typeof value.identifier === 'string';
}

function decodeBase64(value: string) {
  if (!value || !BASE64_PATTERN.test(value)) {
    return null;
  }

  try {
    return Uint8Array.from(atob(value), (character) => character.charCodeAt(0));
  } catch {
    return null;
  }
}

function supportsPointerAvatars(actions: QdnAction[]) {
  return hasHomeBridge() && hasAction(actions, 'GET_NAME_DATA') && hasAction(actions, 'FETCH_ACCOUNT_AVATAR');
}

/** Parse Home's bounded avatar response; raw URLs and malformed values fail closed. */
export function parseAccountAvatarResponse(value: unknown, address: string): AccountAvatarResult {
  if (!isRecord(value) || value.address !== address) {
    return { kind: 'unavailable' };
  }

  const source = value.source as AvatarSource;

  if ((source !== 'POINTER' && source !== 'LEGACY') || (source === 'POINTER' && !isPointerDescriptor(value.descriptor))) {
    return { kind: 'unavailable' };
  }

  if (value.status === 'PENDING') {
    const delay = typeof value.retryAfterSeconds === 'number' && Number.isFinite(value.retryAfterSeconds)
      ? value.retryAfterSeconds
      : 1;
    return { kind: 'pending', retryAfterSeconds: Math.min(30, Math.max(1, Math.floor(delay))) };
  }

  const contentType = text(value.contentType)?.toLowerCase().split(';', 1)[0] ?? '';
  const contentLength = value.contentLength;
  const bytes = typeof value.body === 'string' ? decodeBase64(value.body) : null;

  if (
    value.encoding !== 'base64' ||
    !SAFE_IMAGE_MIME_TYPES.has(contentType) ||
    typeof contentLength !== 'number' ||
    !Number.isSafeInteger(contentLength) ||
    contentLength < 1 ||
    contentLength > AVATAR_MAX_BYTES ||
    !bytes ||
    bytes.byteLength !== contentLength
  ) {
    return { kind: 'unavailable' };
  }

  return { bytes, contentType, kind: 'ready' };
}

export async function fetchAccountAvatar(address: string, actions: QdnAction[]): Promise<AccountAvatarResult> {
  if (!supportsPointerAvatars(actions) || !isAccountAddress(address)) {
    return { kind: 'unavailable' };
  }

  try {
    const response = await qdnRequest<unknown>({ action: 'FETCH_ACCOUNT_AVATAR', address, maxBytes: AVATAR_MAX_BYTES });
    return parseAccountAvatarResponse(response, address);
  } catch {
    return { kind: 'unavailable' };
  }
}

/** Resolve the live name owner before requesting its account-bound avatar. */
export function resolveNameOwner(name: string, actions: QdnAction[]) {
  const normalizedName = name.trim();

  if (!normalizedName || !supportsPointerAvatars(actions)) {
    return Promise.resolve(null);
  }

  if (ownerCache.has(normalizedName)) {
    return Promise.resolve(ownerCache.get(normalizedName) ?? null);
  }

  const existing = ownerInFlight.get(normalizedName);

  if (existing) {
    return existing;
  }

  const request = qdnRequest<unknown>({ action: 'GET_NAME_DATA', name: normalizedName })
    .then((response) => (isRecord(response) && typeof response.owner === 'string' && isAccountAddress(response.owner) ? response.owner : null))
    .catch(() => null)
    .then((owner) => {
      ownerCache.set(normalizedName, owner);
      ownerInFlight.delete(normalizedName);
      return owner;
    });

  ownerInFlight.set(normalizedName, request);
  return request;
}

export function getAvatarFallbackCharacter(name: string | null | undefined) {
  return name && name.length > 0 ? (Array.from(name)[0] ?? '?') : '?';
}

export function AvatarActionsProvider({ actions, children }: { actions: QdnAction[]; children: ReactNode }) {
  return createElement(AvatarActionsContext.Provider, { value: actions }, children);
}

// Mounted controls resolve the owner and fetch exactly one avatar. List loading never fetches image bytes.
export function Avatar({ name, size = 24 }: { name: string; size?: number }) {
  const actions = useContext(AvatarActionsContext);
  const [src, setSrc] = useState<string | null>(null);
  const [brokenSrc, setBrokenSrc] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    let objectUrl: string | null = null;
    let retryTimer: number | undefined;
    let attempts = 0;

    const replace = (next: string | null) => {
      if (!active) {
        if (next) {
          URL.revokeObjectURL(next);
        }
        return;
      }

      setSrc((current) => {
        if (current && current !== next) {
          URL.revokeObjectURL(current);
        }
        return next;
      });
    };

    const load = async () => {
      const address = await resolveNameOwner(name, actions);

      if (!active || !address) {
        return;
      }

      const result = await fetchAccountAvatar(address, actions);

      if (!active) {
        return;
      }

      if (result.kind === 'pending' && attempts < MAX_PENDING_RETRIES) {
        attempts += 1;
        retryTimer = window.setTimeout(() => void load(), result.retryAfterSeconds * 1000);
        return;
      }

      if (result.kind === 'ready') {
        const blobBytes = new Uint8Array(result.bytes.byteLength);
        blobBytes.set(result.bytes);
        objectUrl = URL.createObjectURL(new Blob([blobBytes], { type: result.contentType }));
        replace(objectUrl);
      } else {
        replace(null);
      }
    };

    setBrokenSrc(null);
    replace(null);
    void load();

    return () => {
      active = false;
      if (retryTimer !== undefined) {
        window.clearTimeout(retryTimer);
      }
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [actions, name]);

  const showImage = src && src !== brokenSrc;

  return createElement(
    'span',
    { 'aria-hidden': true, className: 'avatar', style: { height: size, width: size } },
    showImage
      ? createElement('img', { alt: '', className: 'avatar__img', onError: () => setBrokenSrc(src), src })
      : createElement('span', { className: 'avatar__fallback' }, getAvatarFallbackCharacter(name)),
  );
}
