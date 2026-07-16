import { afterEach, describe, expect, it, vi } from 'vitest';

const { qdnRequestMock } = vi.hoisted(() => ({
  qdnRequestMock: vi.fn(),
}));

vi.mock('./qdnRequest', () => ({
  qdnRequest: qdnRequestMock,
}));

import {
  FEEDBACK_SCHEMA,
  buildCommentIdentifier,
  buildPostIdentifier,
  buildWritableNames,
  getCommentIdFromIdentifier,
  getPostIdFromIdentifier,
  loadFeedbackCommentsForPost,
  loadFeedbackCommentsPage,
  loadFeedbackPostById,
  loadFeedbackPostsPage,
  setPostStatusPayload,
  truncateUtf8,
  updateCommentPayload,
  updatePostPayload,
  type FeedbackCommentPayload,
  type FeedbackPostPayload,
} from './qdnFeedback';

afterEach(() => {
  vi.useRealTimers();
  qdnRequestMock.mockReset();
});

const MAX_IDENTIFIER_LENGTH = 64;

function postPayload(id: string, updatedAt = 1_000): FeedbackPostPayload {
  return {
    app: null,
    attachments: [],
    body: `Body ${id}`,
    createdAt: 1_000,
    id,
    kind: 'post',
    schema: FEEDBACK_SCHEMA,
    status: 'open',
    title: `Title ${id}`,
    type: 'issue',
    updatedAt,
  };
}

function commentPayload(id: string, postId: string): FeedbackCommentPayload {
  return {
    attachments: [],
    body: `Comment ${id}`,
    createdAt: 1_000,
    id,
    kind: 'comment',
    postId,
    schema: FEEDBACK_SCHEMA,
    updatedAt: 1_000,
  };
}

function resource(identifier: string, latestSignature: string, updated = 1_000) {
  return {
    created: 1_000,
    identifier,
    latestSignature,
    name: 'QortiumDev',
    service: 'JSON',
    updated,
  };
}

describe('feedback identifiers', () => {
  it('truncates QDN metadata by UTF-8 bytes without splitting characters', () => {
    expect(truncateUtf8('abc😀def', 7)).toBe('abc😀');
    expect(new TextEncoder().encode(truncateUtf8('ééé', 5)).byteLength).toBeLessThanOrEqual(5);
  });

  it('builds and parses post identifiers', () => {
    expect(buildPostIdentifier('post123')).toBe('qhelp.feedback.v1.p.post123');
    expect(getPostIdFromIdentifier('qhelp.feedback.v1.p.post123')).toBe('post123');
    expect(getPostIdFromIdentifier('qhelp.feedback.v1.c.comment456')).toBeNull();
  });

  it('builds and parses comment identifiers', () => {
    expect(buildCommentIdentifier('comment456')).toBe('qhelp.feedback.v1.c.comment456');
    expect(getCommentIdFromIdentifier('qhelp.feedback.v1.c.comment456')).toBe('comment456');
    expect(getCommentIdFromIdentifier('qhelp.feedback.v1.p.post123')).toBeNull();
  });

  it('keeps comment identifiers within the QDN identifier byte limit', () => {
    // A realistic worst case: a fresh comment on a legacy post that still used a
    // long random id. The comment identifier embeds only its own id, so it stays
    // well under the limit (the old "post.comment" scheme overflowed it -> API 127).
    const longCommentId = 'k1abcd'.padEnd(24, 'z');

    expect(buildCommentIdentifier(longCommentId).length).toBeLessThanOrEqual(MAX_IDENTIFIER_LENGTH);
  });
});

describe('paged feedback loading', () => {
  it('passes offsets and server-side search fields to the post resource search', async () => {
    const first = resource(buildPostIdentifier('page-one'), 'page-one-signature', 2_000);
    const second = resource(buildPostIdentifier('page-two'), 'page-two-signature', 3_000);

    qdnRequestMock.mockImplementation(async (request: Record<string, unknown>) => {
      if (request.action === 'SEARCH_QDN_RESOURCES') {
        return [first, second];
      }

      if (request.identifier === first.identifier) {
        return postPayload('page-one', 2_000);
      }

      return postPayload('page-two', 3_000);
    });

    const page = await loadFeedbackPostsPage({
      limit: 2,
      offset: 40,
      query: '  wallet  ',
      title: '  transfer issue  ',
    });

    expect(qdnRequestMock.mock.calls[0]?.[0]).toEqual({
      action: 'SEARCH_QDN_RESOURCES',
      identifier: 'qhelp.feedback.v1.p.',
      includeMetadata: true,
      includeStatus: true,
      limit: 2,
      mode: 'ALL',
      offset: 40,
      prefix: false,
      query: 'wallet',
      reverse: true,
      service: 'JSON',
      title: 'transfer issue',
    });
    expect(page).toMatchObject({
      hasMore: true,
      limit: 2,
      nextOffset: 42,
      offset: 40,
    });
    expect(page.posts.map((post) => post.payload.id)).toEqual(['page-two', 'page-one']);
  });

  it('terminates paging after a short resource page', async () => {
    const only = resource(buildPostIdentifier('last-page'), 'last-page-signature');

    qdnRequestMock.mockImplementation(async (request: Record<string, unknown>) => {
      return request.action === 'SEARCH_QDN_RESOURCES' ? [only] : postPayload('last-page');
    });

    const page = await loadFeedbackPostsPage({ limit: 10, offset: 20 });

    expect(page.hasMore).toBe(false);
    expect(page.nextOffset).toBeNull();
    expect(page.offset).toBe(20);
    expect(page.posts).toHaveLength(1);
  });

  it('loads and locally verifies comments for only the requested post', async () => {
    const matching = resource(buildCommentIdentifier('matching-comment'), 'matching-signature', 2_000);
    const falsePositive = resource(buildCommentIdentifier('other-comment'), 'other-signature', 3_000);

    qdnRequestMock.mockImplementation(async (request: Record<string, unknown>) => {
      if (request.action === 'SEARCH_QDN_RESOURCES') {
        return [matching, falsePositive];
      }

      if (request.identifier === matching.identifier) {
        return commentPayload('matching-comment', 'post-123');
      }

      return commentPayload('other-comment', 'different-post');
    });

    const page = await loadFeedbackCommentsForPost(' post-123 ', { limit: 20, offset: 60 });

    expect(qdnRequestMock.mock.calls[0]?.[0]).toEqual({
      action: 'SEARCH_QDN_RESOURCES',
      identifier: 'qhelp.feedback.v1.c.',
      includeMetadata: true,
      includeStatus: true,
      limit: 20,
      mode: 'ALL',
      offset: 60,
      prefix: false,
      query: undefined,
      reverse: true,
      service: 'JSON',
      title: 'Reply post-123',
    });
    expect(page.comments.map((comment) => comment.payload.id)).toEqual(['matching-comment']);
    expect(page.hasMore).toBe(false);
    expect(page.nextOffset).toBeNull();
  });

  it('reuses a cached payload only while latestSignature is unchanged', async () => {
    let latestSignature = 'cache-signature-one';
    let fetchCount = 0;
    const identifier = buildPostIdentifier('cached-post');

    qdnRequestMock.mockImplementation(async (request: Record<string, unknown>) => {
      if (request.action === 'SEARCH_QDN_RESOURCES') {
        return [resource(identifier, latestSignature)];
      }

      fetchCount += 1;
      return postPayload('cached-post', fetchCount);
    });

    await loadFeedbackPostsPage({ limit: 10 });
    await loadFeedbackPostsPage({ limit: 10 });
    expect(fetchCount).toBe(1);

    latestSignature = 'cache-signature-two';
    await loadFeedbackPostsPage({ limit: 10 });
    expect(fetchCount).toBe(2);
  });

  it('loads generic comment pages for orphan detection', async () => {
    const first = resource(buildCommentIdentifier('first-comment'), 'first-signature', 2_000);
    const second = resource(buildCommentIdentifier('second-comment'), 'second-signature', 3_000);

    qdnRequestMock.mockImplementation(async (request: Record<string, unknown>) => {
      if (request.action === 'SEARCH_QDN_RESOURCES') {
        return [first, second];
      }

      return request.identifier === first.identifier
        ? commentPayload('first-comment', 'post-one')
        : commentPayload('second-comment', 'missing-post');
    });

    const page = await loadFeedbackCommentsPage({ limit: 2, offset: 80 });

    expect(qdnRequestMock.mock.calls[0]?.[0]).toMatchObject({
      identifier: 'qhelp.feedback.v1.c.',
      limit: 2,
      offset: 80,
      prefix: true,
    });
    expect(page.comments.map((comment) => comment.payload.id)).toEqual([
      'first-comment',
      'second-comment',
    ]);
    expect(page.nextOffset).toBe(82);
  });

  it('resolves a post deep link outside the current page by exact identifier', async () => {
    const exact = resource(buildPostIdentifier('older-post'), 'older-signature', 2_000);

    qdnRequestMock.mockImplementation(async (request: Record<string, unknown>) => {
      return request.action === 'SEARCH_QDN_RESOURCES' ? [exact] : postPayload('older-post', 2_000);
    });

    const post = await loadFeedbackPostById(' older-post ');

    expect(qdnRequestMock.mock.calls[0]?.[0]).toMatchObject({
      identifier: buildPostIdentifier('older-post'),
      prefix: false,
    });
    expect(post?.payload.id).toBe('older-post');
  });
});

describe('feedback updates', () => {
  it('updates post content while preserving identity', () => {
    vi.useFakeTimers();
    vi.setSystemTime(2_000);

    const post: FeedbackPostPayload = {
      attachments: [],
      body: 'old',
      createdAt: 1_000,
      id: 'post123',
      kind: 'post',
      schema: FEEDBACK_SCHEMA,
      status: 'open',
      title: 'Old',
      type: 'issue',
      updatedAt: 1_000,
    };

    expect(updatePostPayload(post, { app: '  Wallet  ', body: ' new ', title: ' New ', type: 'idea' })).toEqual({
      ...post,
      app: 'Wallet',
      body: 'new',
      title: 'New',
      type: 'idea',
      updatedAt: 2_000,
    });
  });

  it('clears the app tag when the patch app is empty', () => {
    vi.useFakeTimers();
    vi.setSystemTime(3_000);

    const post: FeedbackPostPayload = {
      app: 'Wallet',
      attachments: [],
      body: 'body',
      createdAt: 1_000,
      id: 'post123',
      kind: 'post',
      schema: FEEDBACK_SCHEMA,
      status: 'open',
      title: 'Title',
      type: 'issue',
      updatedAt: 1_000,
    };

    expect(updatePostPayload(post, { app: '', body: 'body', title: 'Title', type: 'issue' }).app).toBeNull();
  });

  it('marks a post complete while preserving its other fields', () => {
    vi.useFakeTimers();
    vi.setSystemTime(5_000);

    const post: FeedbackPostPayload = {
      attachments: [],
      body: 'body',
      createdAt: 1_000,
      id: 'post123',
      kind: 'post',
      schema: FEEDBACK_SCHEMA,
      status: 'open',
      title: 'Title',
      type: 'issue',
      updatedAt: 1_000,
    };

    expect(setPostStatusPayload(post, 'done')).toEqual({
      ...post,
      status: 'done',
      updatedAt: 5_000,
    });
  });

  it('updates comment content while preserving parent', () => {
    vi.useFakeTimers();
    vi.setSystemTime(3_000);

    const comment: FeedbackCommentPayload = {
      attachments: [],
      body: 'old',
      createdAt: 1_000,
      id: 'comment456',
      kind: 'comment',
      postId: 'post123',
      schema: FEEDBACK_SCHEMA,
      updatedAt: 1_000,
    };

    expect(updateCommentPayload(comment, ' new ')).toEqual({
      ...comment,
      body: 'new',
      updatedAt: 3_000,
    });
  });
});

describe('writable name ordering', () => {
  it('puts the primary name first and preserves API order for the remaining names', () => {
    expect(
      buildWritableNames('PrimaryName', [
        { name: 'zeta' },
        { name: 'alpha' },
        { name: 'middle' },
      ]),
    ).toEqual(['PrimaryName', 'zeta', 'alpha', 'middle']);
  });

  it('deduplicates the primary name without re-sorting API names', () => {
    expect(
      buildWritableNames('primary', [
        { name: 'older' },
        { name: 'Primary' },
        { name: 'newer' },
      ]),
    ).toEqual(['primary', 'older', 'newer']);
  });

  it('uses API order when there is no primary name', () => {
    expect(buildWritableNames('', ['bravo', 'alpha', { name: 'charlie' }])).toEqual([
      'bravo',
      'alpha',
      'charlie',
    ]);
  });
});
