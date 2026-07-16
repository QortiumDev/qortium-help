import { describe, expect, it, vi } from 'vitest';
import {
  buildHelpNotificationId,
  buildHelpReplyNotification,
  canManageHelpNotifications,
  followHelpPost,
  getHelpNotificationState,
  hasHelpNotificationCapacity,
  parseHelpNotificationRules,
  reconcileHelpNotifications,
  unfollowHelpPost,
} from './notifications';

const copy = {
  text: 'Open Help to read the reply.',
  title: 'Reply activity in Help',
};

function storedRule(postId = 'post-123', after = 1_000) {
  return {
    accountAddress: 'Qabc',
    createdAt: '2026-07-16T12:00:00.000Z',
    event: 'RESOURCE_PUBLISHED',
    filters: {
      after,
      excludeBlocked: true,
      identifier: 'qhelp.feedback.v1.c.',
      service: 'JSON',
      title: `Reply ${postId}`,
    },
    link: `qdn://APP/Help/Help?post=${postId}`,
    notificationId: 'help.reply.3b97acffd5c638ce',
    text: copy.text,
    title: copy.title,
  };
}

describe('Help notifications', () => {
  it('requires the complete durable notification bridge', () => {
    expect(canManageHelpNotifications([
      'notification_has_permission',
      'NOTIFICATION_ADD',
      'NOTIFICATION_GET',
      'NOTIFICATION_REMOVE',
    ])).toBe(true);
    expect(canManageHelpNotifications(['NOTIFICATION_ADD', 'NOTIFICATION_REMOVE'])).toBe(false);
  });

  it('enforces Home’s 20-rule capacity before another follow', () => {
    const rule = parseHelpNotificationRules([storedRule()])[0];

    expect(hasHelpNotificationCapacity(Array.from({ length: 19 }, () => rule))).toBe(true);
    expect(hasHelpNotificationCapacity(Array.from({ length: 20 }, () => rule))).toBe(false);
  });

  it('uses the first eight SHA-256 bytes as a stable 16-hex suffix', async () => {
    await expect(buildHelpNotificationId('post-123')).resolves.toBe('help.reply.3b97acffd5c638ce');
    await expect(buildHelpNotificationId(' ')).rejects.toThrow('post id is required');
  });

  it('builds the exact reply-resource subscription with a mirror-safe link', async () => {
    const subscription = await buildHelpReplyNotification({
      after: 1_234,
      copy,
      postId: 'post-123',
    });

    expect(subscription).toMatchObject({
      event: 'RESOURCE_PUBLISHED',
      filters: {
        after: 1_234,
        excludeBlocked: true,
        identifier: 'qhelp.feedback.v1.c.',
        service: 'JSON',
        title: 'Reply post-123',
      },
      link: 'qdn://APP/Help/Help?post=post-123',
      text: copy.text,
      title: copy.title,
    });
    expect(subscription.notificationId).toMatch(/^help\.reply\.[a-f0-9]{16}$/);
  });

  it('accepts only Help reply rules whose link and filters agree', () => {
    expect(parseHelpNotificationRules([storedRule()])).toEqual([{
      accountAddress: 'Qabc',
      after: 1_000,
      createdAt: '2026-07-16T12:00:00.000Z',
      link: 'qdn://APP/Help/Help?post=post-123',
      notificationId: 'help.reply.3b97acffd5c638ce',
      postId: 'post-123',
      text: copy.text,
      title: copy.title,
    }]);
    expect(parseHelpNotificationRules([{ ...storedRule(), filters: { ...storedRule().filters, title: 'Reply other' } }])).toEqual([]);
    expect(parseHelpNotificationRules([{ ...storedRule(), link: 'https://example.com/?post=post-123' }])).toEqual([]);
    expect(parseHelpNotificationRules(null)).toEqual([]);
  });

  it('treats a revoked grant as an empty state without reading rules', async () => {
    const request = vi.fn().mockResolvedValue({ granted: false });

    await expect(getHelpNotificationState(request)).resolves.toEqual({
      granted: false,
      rules: [],
      staleNotificationIds: [],
    });
    expect(request).toHaveBeenCalledTimes(1);
    expect(request).toHaveBeenCalledWith({ action: 'NOTIFICATION_HAS_PERMISSION' });
  });

  it('adds and removes one deterministic rule', async () => {
    const request = vi.fn()
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ granted: true })
      .mockResolvedValueOnce([storedRule()])
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ granted: true })
      .mockResolvedValueOnce([]);

    await followHelpPost('post-123', copy, request, 5_000);
    expect(request.mock.calls[0][0]).toMatchObject({
      action: 'NOTIFICATION_ADD',
      subscriptions: [{
        filters: { after: 5_000, title: 'Reply post-123' },
      }],
    });

    await unfollowHelpPost('post-123', request);
    expect(request.mock.calls[3][0]).toMatchObject({
      action: 'NOTIFICATION_REMOVE',
      notificationIds: [expect.stringMatching(/^help\.reply\.[a-f0-9]{16}$/)],
    });
  });

  it('propagates permission denial without creating local follow state', async () => {
    const request = vi.fn().mockRejectedValue(new Error('Notification permission was denied.'));

    await expect(followHelpPost('post-123', copy, request, 5_000)).rejects.toThrow(
      'Notification permission was denied.',
    );
    expect(request).toHaveBeenCalledTimes(1);
    expect(request.mock.calls[0][0]).toMatchObject({ action: 'NOTIFICATION_ADD' });
  });

  it('rebinds existing rules while preserving their original after checkpoint', async () => {
    const existing = {
      ...storedRule('post-123', 42),
      text: 'The followed thread title',
    };
    const request = vi.fn()
      .mockResolvedValueOnce({ granted: true })
      .mockResolvedValueOnce([existing])
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ granted: true })
      .mockResolvedValueOnce([{ ...existing, accountAddress: 'Qnew' }]);

    const result = await reconcileHelpNotifications(copy, request);

    expect(request.mock.calls[2][0]).toMatchObject({
      action: 'NOTIFICATION_ADD',
      subscriptions: [{
        filters: { after: 42 },
        text: 'The followed thread title',
        title: copy.title,
      }],
    });
    expect(result.rules[0]?.accountAddress).toBe('Qnew');
  });

  it('does not rebind rules after the selected-account generation changes', async () => {
    const request = vi.fn()
      .mockResolvedValueOnce({ granted: true })
      .mockResolvedValueOnce([storedRule()]);

    await reconcileHelpNotifications(copy, request, () => false);

    expect(request).toHaveBeenCalledTimes(2);
    expect(request).not.toHaveBeenCalledWith(expect.objectContaining({ action: 'NOTIFICATION_ADD' }));
  });

  it('removes corrupt Help rule ids instead of duplicating or stranding them', async () => {
    const corrupt = {
      ...storedRule(),
      notificationId: 'help.reply.ffffffffffffffff',
    };
    const request = vi.fn()
      .mockResolvedValueOnce({ granted: true })
      .mockResolvedValueOnce([corrupt])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce({ granted: true })
      .mockResolvedValueOnce([]);

    const result = await reconcileHelpNotifications(copy, request);

    expect(request.mock.calls[2][0]).toEqual({
      action: 'NOTIFICATION_REMOVE',
      notificationIds: ['help.reply.ffffffffffffffff'],
    });
    expect(result).toEqual({ granted: true, rules: [], staleNotificationIds: [] });
    expect(request).not.toHaveBeenCalledWith(expect.objectContaining({ action: 'NOTIFICATION_ADD' }));
  });
});
