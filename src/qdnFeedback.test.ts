import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  FEEDBACK_SCHEMA,
  buildCommentIdentifier,
  buildPostIdentifier,
  getCommentPartsFromIdentifier,
  getPostIdFromIdentifier,
  updateCommentPayload,
  updatePostPayload,
  type FeedbackCommentPayload,
  type FeedbackPostPayload,
} from './qdnFeedback';

afterEach(() => {
  vi.useRealTimers();
});

describe('feedback identifiers', () => {
  it('builds and parses post identifiers', () => {
    expect(buildPostIdentifier('post123')).toBe('qhelp.feedback.v1.p.post123');
    expect(getPostIdFromIdentifier('qhelp.feedback.v1.p.post123')).toBe('post123');
    expect(getPostIdFromIdentifier('qhelp.feedback.v1.c.post123.comment456')).toBeNull();
  });

  it('builds and parses comment identifiers', () => {
    expect(buildCommentIdentifier('post123', 'comment456')).toBe('qhelp.feedback.v1.c.post123.comment456');
    expect(getCommentPartsFromIdentifier('qhelp.feedback.v1.c.post123.comment456')).toEqual({
      commentId: 'comment456',
      postId: 'post123',
    });
    expect(getCommentPartsFromIdentifier('qhelp.feedback.v1.p.post123')).toBeNull();
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
      title: 'Old',
      type: 'issue',
      updatedAt: 1_000,
    };

    expect(updatePostPayload(post, { body: ' new ', title: ' New ', type: 'idea' })).toEqual({
      ...post,
      body: 'new',
      title: 'New',
      type: 'idea',
      updatedAt: 2_000,
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
