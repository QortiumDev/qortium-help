import { buildPostLink, getInitialPostId } from './deepLink';
import { FEEDBACK_COMMENT_PREFIX } from './qdnFeedback';
import { qdnRequest } from './qdnRequest';
import type { QdnAction } from './types';

export const HELP_NOTIFICATION_ID_PREFIX = 'help.reply.';
export const HELP_NOTIFICATION_RULE_LIMIT = 20;

export type HelpNotificationCopy = {
  text: string;
  title: string;
};

export type HelpNotificationRule = {
  accountAddress: string;
  after: number;
  createdAt: string;
  link: string;
  notificationId: string;
  postId: string;
  text: string;
  title: string;
};

export type HelpNotificationState = {
  granted: boolean;
  rules: HelpNotificationRule[];
  staleNotificationIds: string[];
};

type QdnRequestFunction = typeof qdnRequest;

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function getString(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function getPostIdFromLink(link: string) {
  try {
    const url = new URL(link);

    return url.protocol === 'qdn:' ? getInitialPostId(url.search) : null;
  } catch {
    return null;
  }
}

export function canManageHelpNotifications(actions: QdnAction[]) {
  const supported = new Set(actions.map((action) => action.toUpperCase()));

  return [
    'NOTIFICATION_HAS_PERMISSION',
    'NOTIFICATION_ADD',
    'NOTIFICATION_GET',
    'NOTIFICATION_REMOVE',
  ].every((action) => supported.has(action));
}

export function hasHelpNotificationCapacity(rules: HelpNotificationRule[]) {
  return rules.length < HELP_NOTIFICATION_RULE_LIMIT;
}

export function parseHelpNotificationRules(value: unknown): HelpNotificationRule[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((entry) => {
    if (
      !isRecord(entry) ||
      entry.event !== 'RESOURCE_PUBLISHED' ||
      !/^help\.reply\.[a-f0-9]{16}$/.test(getString(entry.notificationId)) ||
      !isRecord(entry.filters)
    ) {
      return [];
    }

    const link = getString(entry.link);
    const postId = getPostIdFromLink(link);
    const after = entry.filters.after;

    if (
      !postId ||
      entry.filters.service !== 'JSON' ||
      entry.filters.identifier !== FEEDBACK_COMMENT_PREFIX ||
      entry.filters.title !== `Reply ${postId}` ||
      entry.filters.prefix !== true ||
      entry.filters.excludeBlocked !== true ||
      typeof after !== 'number' ||
      !Number.isFinite(after)
    ) {
      return [];
    }

    return [{
      accountAddress: getString(entry.accountAddress),
      after,
      createdAt: getString(entry.createdAt),
      link,
      notificationId: getString(entry.notificationId),
      postId,
      text: getString(entry.text),
      title: getString(entry.title),
    }];
  });
}

function getStoredHelpNotificationIds(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((entry) => {
    if (!isRecord(entry)) {
      return [];
    }

    const notificationId = getString(entry.notificationId);
    return notificationId.startsWith(HELP_NOTIFICATION_ID_PREFIX) ? [notificationId] : [];
  });
}

export async function buildHelpNotificationId(postId: string) {
  const normalizedPostId = postId.trim();

  if (!normalizedPostId) {
    throw new Error('A Help post id is required.');
  }

  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(normalizedPostId));
  const hash = Array.from(new Uint8Array(digest).slice(0, 8), (byte) => byte.toString(16).padStart(2, '0')).join('');

  return `${HELP_NOTIFICATION_ID_PREFIX}${hash}`;
}

export async function buildHelpReplyNotification({
  after = Date.now(),
  copy,
  postId,
}: {
  after?: number;
  copy: HelpNotificationCopy;
  postId: string;
}) {
  const normalizedPostId = postId.trim();

  return {
    event: 'RESOURCE_PUBLISHED' as const,
    filters: {
      after,
      excludeBlocked: true,
      identifier: FEEDBACK_COMMENT_PREFIX,
      prefix: true,
      service: 'JSON',
      title: `Reply ${normalizedPostId}`,
    },
    link: buildPostLink(normalizedPostId),
    notificationId: await buildHelpNotificationId(normalizedPostId),
    text: copy.text,
    title: copy.title,
  };
}

export async function getHelpNotificationState(
  request: QdnRequestFunction = qdnRequest,
): Promise<HelpNotificationState> {
  const permission = await request<unknown>({ action: 'NOTIFICATION_HAS_PERMISSION' });
  const granted = isRecord(permission) && permission.granted === true;

  if (!granted) {
    return { granted: false, rules: [], staleNotificationIds: [] };
  }

  const stored = await request<unknown>({ action: 'NOTIFICATION_GET' });
  const candidates = parseHelpNotificationRules(stored);
  const rules: HelpNotificationRule[] = [];

  for (const rule of candidates) {
    if (rule.notificationId === await buildHelpNotificationId(rule.postId)) {
      rules.push(rule);
    }
  }

  const validIds = new Set(rules.map((rule) => rule.notificationId));
  const staleNotificationIds = getStoredHelpNotificationIds(stored).filter(
    (notificationId) => !validIds.has(notificationId),
  );

  return { granted: true, rules, staleNotificationIds };
}

export async function followHelpPost(
  postId: string,
  copy: HelpNotificationCopy,
  request: QdnRequestFunction = qdnRequest,
  now = Date.now(),
) {
  const subscription = await buildHelpReplyNotification({ after: now, copy, postId });

  await request({
    action: 'NOTIFICATION_ADD',
    subscriptions: [subscription],
  });

  return getHelpNotificationState(request);
}

export async function unfollowHelpPost(
  postId: string,
  request: QdnRequestFunction = qdnRequest,
) {
  await request({
    action: 'NOTIFICATION_REMOVE',
    notificationIds: [await buildHelpNotificationId(postId)],
  });

  return getHelpNotificationState(request);
}

// Replacing the same notification ids preserves the user's followed-thread set
// while rebinding every rule to Home's active account and refreshing localized
// copy plus the app's current (possibly mirrored) QDN identity.
export async function reconcileHelpNotifications(
  copy: HelpNotificationCopy,
  request: QdnRequestFunction = qdnRequest,
  isCurrent: () => boolean = () => true,
) {
  const state = await getHelpNotificationState(request);

  if (!state.granted || !isCurrent()) {
    return state;
  }

  if (state.staleNotificationIds.length > 0) {
    await request({
      action: 'NOTIFICATION_REMOVE',
      notificationIds: state.staleNotificationIds,
    });
  }

  if (state.rules.length === 0) {
    return state.staleNotificationIds.length > 0
      ? getHelpNotificationState(request)
      : state;
  }

  const subscriptions = await Promise.all(
    state.rules.map((rule) => buildHelpReplyNotification({
      after: rule.after,
      copy: {
        text: rule.text || copy.text,
        title: copy.title,
      },
      postId: rule.postId,
    })),
  );

  if (!isCurrent()) {
    return state;
  }

  await request({
    action: 'NOTIFICATION_ADD',
    subscriptions,
  });

  return getHelpNotificationState(request);
}
