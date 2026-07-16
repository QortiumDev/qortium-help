import { qdnRequest } from './qdnRequest';
import type {
  DeleteActionResult,
  PublishActionResult,
  QdnResource,
  QdnSelectedAccount,
} from './types';

export const FEEDBACK_SCHEMA = 'qortium.help.feedback.v1';
export const FEEDBACK_POST_PREFIX = 'qhelp.feedback.v1.p.';
export const FEEDBACK_COMMENT_PREFIX = 'qhelp.feedback.v1.c.';
export const FEEDBACK_TAGS = ['qortium-help', 'feedback', 'v1'];
const FEEDBACK_SERVICE = 'JSON';
const FEEDBACK_FILE_NAME = 'feedback.json';
const MAX_FEEDBACK_RESOURCE_BYTES = 200_000;
export const FEEDBACK_POST_PAGE_SIZE = 40;
export const FEEDBACK_COMMENT_PAGE_SIZE = 80;

export type FeedbackKind = 'idea' | 'issue';
export type FeedbackStatus = 'done' | 'open';

export type FeedbackAttachment = {
  filename?: string;
  identifier: string;
  mimeType?: string;
  name: string;
  service: string;
  sha256?: string;
  size?: number;
};

export type FeedbackPostPayload = {
  app?: string | null;
  attachments: FeedbackAttachment[];
  body: string;
  createdAt: number;
  id: string;
  kind: 'post';
  schema: typeof FEEDBACK_SCHEMA;
  status: FeedbackStatus;
  title: string;
  type: FeedbackKind;
  updatedAt: number;
};

export type FeedbackCommentPayload = {
  attachments: FeedbackAttachment[];
  body: string;
  createdAt: number;
  id: string;
  kind: 'comment';
  postId: string;
  schema: typeof FEEDBACK_SCHEMA;
  updatedAt: number;
};

export type FeedbackPayload = FeedbackPostPayload | FeedbackCommentPayload;

export type FeedbackDraftIdentity = {
  createdAt: number;
  id: string;
};

export type FeedbackResource<T extends FeedbackPayload = FeedbackPayload> = {
  created: number;
  identifier: string;
  isDeleted?: boolean;
  ownerName: string;
  payload: T;
  resource: QdnResource;
  updated: number;
};

export type AccountContext = {
  account: QdnSelectedAccount | null;
  writableNames: string[];
};

export type FeedbackPageOptions = {
  limit?: number;
  offset?: number;
};

export type FeedbackPostPageOptions = FeedbackPageOptions & {
  query?: string;
  title?: string;
};

export type FeedbackPageInfo = {
  hasMore: boolean;
  limit: number;
  nextOffset: number | null;
  offset: number;
};

export type FeedbackPostsPage = FeedbackPageInfo & {
  posts: FeedbackResource<FeedbackPostPayload>[];
};

export type FeedbackCommentsPage = FeedbackPageInfo & {
  comments: FeedbackResource<FeedbackCommentPayload>[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function getString(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function getNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function normalizeBody(value: string) {
  return value.trim().replace(/\r\n/g, '\n');
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = '';
  const chunkSize = 0x8000;

  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.slice(index, index + chunkSize));
  }

  return btoa(binary);
}

export function jsonToBase64(value: unknown) {
  return bytesToBase64(new TextEncoder().encode(JSON.stringify(value, null, 2)));
}

export function truncateUtf8(value: string, maxBytes: number) {
  const encoder = new TextEncoder();
  let result = '';
  let byteLength = 0;

  for (const character of value) {
    const characterBytes = encoder.encode(character).byteLength;

    if (byteLength + characterBytes > maxBytes) {
      break;
    }

    result += character;
    byteLength += characterBytes;
  }

  return result;
}

export function createFeedbackId() {
  // Keep ids short: QDN arbitrary-transaction identifiers are capped at 64 bytes
  // (ArbitraryTransaction.MAX_IDENTIFIER_LENGTH), and the prefix already uses 20.
  const time = Date.now().toString(36);
  const randomBytes = new Uint8Array(5);

  crypto.getRandomValues(randomBytes);

  const random = Array.from(randomBytes, (byte) => byte.toString(36).padStart(2, '0')).join('');

  return `${time}${random}`;
}

export function buildPostIdentifier(postId: string) {
  return `${FEEDBACK_POST_PREFIX}${postId}`;
}

// The comment identifier intentionally embeds only the comment id. The parent
// post id lives in the payload, so keeping it out of the identifier keeps us
// comfortably under the 64-byte identifier limit (older schemes that embedded
// both ids overflowed it and failed to transform with API error 127).
export function buildCommentIdentifier(commentId: string) {
  return `${FEEDBACK_COMMENT_PREFIX}${commentId}`;
}

export function getPostIdFromIdentifier(identifier: string) {
  return identifier.startsWith(FEEDBACK_POST_PREFIX) ? identifier.slice(FEEDBACK_POST_PREFIX.length) : null;
}

export function getCommentIdFromIdentifier(identifier: string) {
  return identifier.startsWith(FEEDBACK_COMMENT_PREFIX) ? identifier.slice(FEEDBACK_COMMENT_PREFIX.length) : null;
}

function normalizeResource(resource: unknown): QdnResource | null {
  if (!isRecord(resource)) {
    return null;
  }

  const name = getString(resource.name);
  const service = getString(resource.service);
  const identifier = getString(resource.identifier);

  if (!name || !service || !identifier) {
    return null;
  }

  return {
    created: getNumber(resource.created) ?? null,
    identifier,
    latestSignature: resource.latestSignature,
    metadata: isRecord(resource.metadata) ? resource.metadata : null,
    name,
    service,
    size: getNumber(resource.size) ?? null,
    status: isRecord(resource.status) ? resource.status : null,
    updated: getNumber(resource.updated) ?? null,
  };
}

function normalizeResources(value: unknown): QdnResource[] {
  return Array.isArray(value) ? value.map(normalizeResource).filter((resource): resource is QdnResource => !!resource) : [];
}

function normalizeAttachment(value: unknown): FeedbackAttachment | null {
  if (!isRecord(value)) {
    return null;
  }

  const service = getString(value.service);
  const name = getString(value.name);
  const identifier = getString(value.identifier);

  if (!service || !name || !identifier) {
    return null;
  }

  return {
    filename: getString(value.filename) || undefined,
    identifier,
    mimeType: getString(value.mimeType) || undefined,
    name,
    service,
    sha256: getString(value.sha256) || undefined,
    size: getNumber(value.size),
  };
}

function normalizeAttachments(value: unknown) {
  return Array.isArray(value)
    ? value.map(normalizeAttachment).filter((attachment): attachment is FeedbackAttachment => !!attachment)
    : [];
}

function normalizePayload(value: unknown): FeedbackPayload | null {
  if (!isRecord(value) || value.schema !== FEEDBACK_SCHEMA) {
    return null;
  }

  const kind = getString(value.kind);
  const id = getString(value.id);
  const body = normalizeBody(getString(value.body));
  const createdAt = getNumber(value.createdAt) ?? 0;
  const updatedAt = getNumber(value.updatedAt) ?? createdAt;

  if (!id || !body || !createdAt) {
    return null;
  }

  if (kind === 'post') {
    const title = getString(value.title);
    const type = getString(value.type);
    const status = getString(value.status) === 'done' ? 'done' : 'open';
    const app = getString(value.app) || null;

    if (!title || (type !== 'issue' && type !== 'idea')) {
      return null;
    }

    return {
      app,
      attachments: normalizeAttachments(value.attachments),
      body,
      createdAt,
      id,
      kind: 'post',
      schema: FEEDBACK_SCHEMA,
      status,
      title,
      type,
      updatedAt,
    };
  }

  if (kind === 'comment') {
    const postId = getString(value.postId);

    if (!postId) {
      return null;
    }

    return {
      attachments: normalizeAttachments(value.attachments),
      body,
      createdAt,
      id,
      kind: 'comment',
      postId,
      schema: FEEDBACK_SCHEMA,
      updatedAt,
    };
  }

  return null;
}

function parseQdnJson(value: unknown) {
  if (typeof value === 'string') {
    return JSON.parse(value) as unknown;
  }

  return value;
}

async function fetchPayload(resource: QdnResource) {
  const value = await qdnRequest<unknown>({
    action: 'FETCH_QDN_RESOURCE',
    identifier: resource.identifier ?? undefined,
    maxBytes: MAX_FEEDBACK_RESOURCE_BYTES,
    name: resource.name,
    service: resource.service,
  });

  return normalizePayload(parseQdnJson(value));
}

async function fetchFeedbackResource<T extends FeedbackPayload>(
  resource: QdnResource,
  expectedKind: T['kind'],
): Promise<FeedbackResource<T> | null> {
  try {
    const payload = await fetchPayload(resource);

    if (!payload || payload.kind !== expectedKind || !resource.identifier) {
      return null;
    }

    return {
      created: resource.created ?? payload.createdAt,
      identifier: resource.identifier,
      ownerName: resource.name,
      payload: payload as T,
      resource,
      updated: resource.updated ?? payload.updatedAt,
    };
  } catch {
    return null;
  }
}

type FeedbackResourceSearchOptions = FeedbackPageOptions & {
  query?: string;
  title?: string;
};

async function searchFeedbackResources(identifierPrefix: string, options: FeedbackResourceSearchOptions) {
  const resources = await qdnRequest<unknown>({
    action: 'SEARCH_QDN_RESOURCES',
    identifier: identifierPrefix,
    includeMetadata: true,
    includeStatus: true,
    limit: options.limit,
    mode: 'ALL',
    offset: options.offset,
    // Core applies `prefix` to text search fields too. Keep identifier-prefix
    // matching for ordinary paging, but disable it when query/title filtering
    // is present so searches match complete words rather than only prefixes.
    prefix: !options.query && !options.title,
    query: options.query,
    reverse: true,
    service: FEEDBACK_SERVICE,
    title: options.title,
  });

  return normalizeResources(resources).filter((resource) => resource.identifier?.startsWith(identifierPrefix));
}

// Cache fetched resource payloads keyed by service+name+identifier, tagged with
// the resource's latestSignature. A QDN resource is immutable per signature, so
// when a later search returns the same signature we can skip re-downloading it.
// Including the owner name keeps otherwise-identical identifiers isolated.
type CachedFeedbackResource = { signature: string; value: FeedbackResource<FeedbackPayload> };

const feedbackResourceCache = new Map<string, CachedFeedbackResource>();
const MAX_FEEDBACK_CACHE_ENTRIES = 500;

function resourceCacheKey(resource: QdnResource) {
  return `${resource.service}:${resource.name}:${resource.identifier}`;
}

function cacheFeedbackResource(key: string, entry: CachedFeedbackResource) {
  feedbackResourceCache.delete(key);
  feedbackResourceCache.set(key, entry);

  while (feedbackResourceCache.size > MAX_FEEDBACK_CACHE_ENTRIES) {
    const oldestKey = feedbackResourceCache.keys().next().value as string | undefined;

    if (!oldestKey) {
      break;
    }

    feedbackResourceCache.delete(oldestKey);
  }
}

async function fetchFeedbackResourceCached<T extends FeedbackPayload>(
  resource: QdnResource,
  expectedKind: T['kind'],
): Promise<FeedbackResource<T> | null> {
  const key = resourceCacheKey(resource);
  const signature = typeof resource.latestSignature === 'string' ? resource.latestSignature : null;

  if (signature) {
    const cached = feedbackResourceCache.get(key);

    if (cached && cached.signature === signature && cached.value.payload.kind === expectedKind) {
      cacheFeedbackResource(key, cached);
      return cached.value as FeedbackResource<T>;
    }
  }

  const value = await fetchFeedbackResource<T>(resource, expectedKind);

  if (value && signature) {
    cacheFeedbackResource(key, { signature, value });
  }

  return value;
}

function normalizePageOptions(options: FeedbackPageOptions, defaultLimit: number) {
  const requestedLimit = Math.floor(options.limit ?? defaultLimit);
  const requestedOffset = Math.floor(options.offset ?? 0);

  return {
    limit: requestedLimit > 0 ? requestedLimit : defaultLimit,
    offset: requestedOffset > 0 ? requestedOffset : 0,
  };
}

function buildPageInfo(offset: number, limit: number, resourceCount: number): FeedbackPageInfo {
  const hasMore = resourceCount >= limit;

  return {
    hasMore,
    limit,
    nextOffset: hasMore ? offset + resourceCount : null,
    offset,
  };
}

/**
 * Load one page of feedback posts. Search text is passed to Core so supported
 * bridges can filter by QDN metadata before any resource bodies are fetched.
 */
export async function loadFeedbackPostsPage(options: FeedbackPostPageOptions = {}): Promise<FeedbackPostsPage> {
  const page = normalizePageOptions(options, FEEDBACK_POST_PAGE_SIZE);
  const resources = await searchFeedbackResources(FEEDBACK_POST_PREFIX, {
    ...page,
    query: getString(options.query) || undefined,
    title: getString(options.title) || undefined,
  });
  const posts = await Promise.all(
    resources.map((resource) => fetchFeedbackResourceCached<FeedbackPostPayload>(resource, 'post')),
  );

  return {
    ...buildPageInfo(page.offset, page.limit, resources.length),
    posts: posts
      .filter((post): post is FeedbackResource<FeedbackPostPayload> => !!post)
      .sort((a, b) => b.updated - a.updated),
  };
}

export async function loadFeedbackPostById(postId: string): Promise<FeedbackResource<FeedbackPostPayload> | null> {
  const normalizedPostId = getString(postId);

  if (!normalizedPostId) {
    return null;
  }

  const identifier = buildPostIdentifier(normalizedPostId);
  const resources = normalizeResources(
    await qdnRequest<unknown>({
      action: 'SEARCH_QDN_RESOURCES',
      identifier,
      includeMetadata: true,
      includeStatus: true,
      limit: 20,
      mode: 'ALL',
      offset: 0,
      prefix: false,
      reverse: true,
      service: FEEDBACK_SERVICE,
    }),
  ).filter((resource) => resource.identifier === identifier);

  for (const resource of resources) {
    const post = await fetchFeedbackResourceCached<FeedbackPostPayload>(resource, 'post');

    if (post?.payload.id === normalizedPostId) {
      return post;
    }
  }

  return null;
}

export async function loadFeedbackCommentsPage(
  options: FeedbackPageOptions = {},
): Promise<FeedbackCommentsPage> {
  const page = normalizePageOptions(options, FEEDBACK_COMMENT_PAGE_SIZE);
  const resources = await searchFeedbackResources(FEEDBACK_COMMENT_PREFIX, page);
  const comments = await Promise.all(
    resources.map((resource) => fetchFeedbackResourceCached<FeedbackCommentPayload>(resource, 'comment')),
  );

  return {
    ...buildPageInfo(page.offset, page.limit, resources.length),
    comments: comments
      .filter((comment): comment is FeedbackResource<FeedbackCommentPayload> => !!comment)
      .sort((a, b) => b.created - a.created),
  };
}

/**
 * Load one page of comments for a single post. Comment metadata includes
 * `Reply <postId>`, which lets Core narrow the resource list before fetching
 * bodies. Payload postId is still checked locally for correctness.
 */
export async function loadFeedbackCommentsForPost(
  postId: string,
  options: FeedbackPageOptions = {},
): Promise<FeedbackCommentsPage> {
  const normalizedPostId = getString(postId);
  const page = normalizePageOptions(options, FEEDBACK_COMMENT_PAGE_SIZE);

  if (!normalizedPostId) {
    return {
      ...buildPageInfo(page.offset, page.limit, 0),
      comments: [],
    };
  }

  const resources = await searchFeedbackResources(FEEDBACK_COMMENT_PREFIX, {
    ...page,
    title: `Reply ${normalizedPostId}`,
  });
  const comments = await Promise.all(
    resources.map((resource) => fetchFeedbackResourceCached<FeedbackCommentPayload>(resource, 'comment')),
  );

  return {
    ...buildPageInfo(page.offset, page.limit, resources.length),
    comments: comments
      .filter(
        (comment): comment is FeedbackResource<FeedbackCommentPayload> =>
          !!comment && comment.payload.postId === normalizedPostId,
      )
      .sort((a, b) => b.created - a.created),
  };
}

export async function loadFeedback(limit = 120) {
  const [postResources, commentResources] = await Promise.all([
    searchFeedbackResources(FEEDBACK_POST_PREFIX, { limit, offset: 0 }),
    searchFeedbackResources(FEEDBACK_COMMENT_PREFIX, { limit: limit * 2, offset: 0 }),
  ]);

  const [posts, comments] = await Promise.all([
    Promise.all(postResources.map((resource) => fetchFeedbackResourceCached<FeedbackPostPayload>(resource, 'post'))),
    Promise.all(commentResources.map((resource) => fetchFeedbackResourceCached<FeedbackCommentPayload>(resource, 'comment'))),
  ]);

  return {
    comments: comments
      .filter((comment): comment is FeedbackResource<FeedbackCommentPayload> => !!comment)
      .sort((a, b) => b.created - a.created),
    posts: posts
      .filter((post): post is FeedbackResource<FeedbackPostPayload> => !!post)
      .sort((a, b) => b.updated - a.updated),
  };
}

function normalizeNames(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => {
      if (typeof item === 'string') {
        return item.trim();
      }

      if (isRecord(item)) {
        return getString(item.name);
      }

      return '';
    })
    .filter(Boolean);
}

function appendWritableName(names: string[], seenNames: Set<string>, value: unknown) {
  const name = getString(value);

  if (!name) {
    return;
  }

  const key = name.toLowerCase();

  if (seenNames.has(key)) {
    return;
  }

  seenNames.add(key);
  names.push(name);
}

export function buildWritableNames(primaryName: unknown, accountNames: unknown) {
  const names: string[] = [];
  const seenNames = new Set<string>();

  appendWritableName(names, seenNames, primaryName);

  for (const name of normalizeNames(accountNames)) {
    appendWritableName(names, seenNames, name);
  }

  return names;
}

export async function loadAccountContext(): Promise<AccountContext> {
  const account = await qdnRequest<QdnSelectedAccount>({ action: 'GET_SELECTED_ACCOUNT' });
  let accountNames: unknown = [];

  if (account?.address) {
    try {
      accountNames = await qdnRequest<unknown>({ action: 'GET_ACCOUNT_NAMES', address: account.address });
    } catch {
      // The selected account name is enough for the first publish path.
    }
  }

  return {
    account,
    writableNames: buildWritableNames(account?.name, accountNames),
  };
}

export function unlockSelectedAccount() {
  return qdnRequest<QdnSelectedAccount>({ action: 'UNLOCK_SELECTED_ACCOUNT' });
}

export function canOwnResource(resource: FeedbackResource, writableNames: string[]) {
  return writableNames.some((name) => name.toLowerCase() === resource.ownerName.toLowerCase());
}

const APP_NAMES_PAGE_SIZE = 100;
const APP_NAMES_MAX_PAGES = 50;

// Collect the registered names of every published APP resource, for the app
// dropdown. LIST_QDN_RESOURCES maps to Core's /arbitrary/resources, which returns
// names alphabetically (ORDER BY name COLLATE SQL_TEXT_UCC_NO_PAD); `default: true`
// yields one row per name. We page until a short page signals the end, with two
// safety valves: a hard page cap, and a stop if a full page surfaces nothing new
// (guards against a node that ignores `offset`).
export async function loadPublishedAppNames(): Promise<string[]> {
  const names = new Set<string>();

  try {
    for (let page = 0; page < APP_NAMES_MAX_PAGES; page += 1) {
      // Qortium apps are published under a named identifier (e.g. APP/Help/Help),
      // not the default (empty) identifier, so do NOT filter on `default` — that
      // excludes every real app and leaves only the hardcoded extras.
      const resources = await qdnRequest<unknown>({
        action: 'LIST_QDN_RESOURCES',
        includeMetadata: false,
        includeStatus: false,
        limit: APP_NAMES_PAGE_SIZE,
        offset: page * APP_NAMES_PAGE_SIZE,
        service: 'APP',
      });

      const batch = Array.isArray(resources) ? resources : [];
      const sizeBefore = names.size;

      for (const resource of batch) {
        if (isRecord(resource)) {
          const name = getString(resource.name);

          if (name) {
            names.add(name);
          }
        }
      }

      if (batch.length < APP_NAMES_PAGE_SIZE || names.size === sizeBefore) {
        break;
      }
    }
  } catch {
    // Keep whatever we collected before the failure; the dropdown still works.
  }

  return [...names].sort((a, b) => a.localeCompare(b));
}

export function createPostPayload(
  type: FeedbackKind,
  title: string,
  body: string,
  app?: string | null,
  identity?: FeedbackDraftIdentity,
): FeedbackPostPayload {
  const now = Date.now();
  const id = identity?.id ?? createFeedbackId();
  const createdAt = identity?.createdAt ?? now;

  return {
    app: app?.trim() || null,
    attachments: [],
    body: normalizeBody(body),
    createdAt,
    id,
    kind: 'post',
    schema: FEEDBACK_SCHEMA,
    status: 'open',
    title: title.trim(),
    type,
    updatedAt: now,
  };
}

export function createCommentPayload(
  postId: string,
  body: string,
  identity?: FeedbackDraftIdentity,
): FeedbackCommentPayload {
  const now = Date.now();
  const id = identity?.id ?? createFeedbackId();
  const createdAt = identity?.createdAt ?? now;

  return {
    attachments: [],
    body: normalizeBody(body),
    createdAt,
    id,
    kind: 'comment',
    postId,
    schema: FEEDBACK_SCHEMA,
    updatedAt: now,
  };
}

export function updatePostPayload(
  payload: FeedbackPostPayload,
  patch: Pick<FeedbackPostPayload, 'body' | 'title' | 'type'> & { app: string | null },
): FeedbackPostPayload {
  return {
    ...payload,
    app: patch.app?.trim() || null,
    body: normalizeBody(patch.body),
    title: patch.title.trim(),
    type: patch.type,
    updatedAt: Date.now(),
  };
}

export function setPostStatusPayload(payload: FeedbackPostPayload, status: FeedbackStatus): FeedbackPostPayload {
  return {
    ...payload,
    status,
    updatedAt: Date.now(),
  };
}

export function updateCommentPayload(payload: FeedbackCommentPayload, body: string): FeedbackCommentPayload {
  return {
    ...payload,
    body: normalizeBody(body),
    updatedAt: Date.now(),
  };
}

export async function publishFeedbackPayload(name: string, payload: FeedbackPayload): Promise<PublishActionResult> {
  // Qortium metadata caps the title at 80 bytes and the description at 240
  // (ArbitraryDataTransactionMetadata). Core silently truncates, but cap here for
  // consistency with the description cap below; the full title stays in the payload.
  const title = truncateUtf8(payload.kind === 'post' ? payload.title : `Reply ${payload.postId}`, 80);
  const description = truncateUtf8(payload.body, 240);
  const identifier =
    payload.kind === 'post' ? buildPostIdentifier(payload.id) : buildCommentIdentifier(payload.id);

  return qdnRequest<PublishActionResult>({
    action: 'PUBLISH_QDN_RESOURCE',
    base64: jsonToBase64(payload),
    description,
    filename: FEEDBACK_FILE_NAME,
    identifier,
    name,
    service: FEEDBACK_SERVICE,
    tags: [...FEEDBACK_TAGS, payload.kind, payload.kind === 'post' ? payload.type : 'reply'].slice(0, 5),
    title,
  });
}

export async function deleteFeedbackResource(resource: FeedbackResource): Promise<DeleteActionResult> {
  return qdnRequest<DeleteActionResult>({
    action: 'DELETE_QDN_RESOURCE',
    identifier: resource.identifier,
    name: resource.ownerName,
    service: FEEDBACK_SERVICE,
  });
}
