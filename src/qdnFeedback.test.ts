import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  FEEDBACK_SCHEMA,
  buildCommentIdentifier,
  buildPostIdentifier,
  buildWritableNames,
  getCommentIdFromIdentifier,
  getPostIdFromIdentifier,
  setPostStatusPayload,
  updateCommentPayload,
  updatePostPayload,
  type FeedbackCommentPayload,
  type FeedbackPostPayload,
} from './qdnFeedback';

afterEach(() => {
  vi.useRealTimers();
});

const MAX_IDENTIFIER_LENGTH = 64;

describe('feedback identifiers', () => {
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
