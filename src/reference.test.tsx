import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import Reference, { REFERENCE_SNIPPETS } from './Reference';

describe('Help developer reference', () => {
  it('documents the stable schema and identifier formats', () => {
    const html = renderToStaticMarkup(<Reference />);

    expect(html).toContain('qortium.help.feedback.v1');
    expect(html).toContain('qhelp.feedback.v1.p.');
    expect(html).toContain('qhelp.feedback.v1.c.');
    expect(html).toContain('64 UTF-8 bytes');
    expect(html).toContain('Orphan replies');
  });

  it('documents metadata limits and name-based ownership', () => {
    const html = renderToStaticMarkup(<Reference />);

    expect(html).toContain('80');
    expect(html).toContain('240');
    expect(html).toContain('5');
    expect(html).toContain('QDN ownership is name-based');
    expect(html).toContain('Tagged app owners do not own reporter posts.');
  });

  it('provides bridge examples for every feedback resource operation', () => {
    expect(REFERENCE_SNIPPETS.featureDetection).toContain("action: 'SHOW_ACTIONS'");
    expect(REFERENCE_SNIPPETS.featureDetection).toContain("action: 'GET_HOST_INFO'");
    expect(REFERENCE_SNIPPETS.publish).toContain("action: 'PUBLISH_QDN_RESOURCE'");
    expect(REFERENCE_SNIPPETS.search).toContain("action: 'SEARCH_QDN_RESOURCES'");
    expect(REFERENCE_SNIPPETS.fetch).toContain("action: 'FETCH_QDN_RESOURCE'");
    expect(REFERENCE_SNIPPETS.delete).toContain("action: 'DELETE_QDN_RESOURCE'");
    expect(REFERENCE_SNIPPETS.avatar).toContain("action: 'GET_NAME_DATA'");
    expect(REFERENCE_SNIPPETS.avatar).toContain("action: 'FETCH_ACCOUNT_AVATAR'");
  });

  it('keeps the publish example aligned with the Help v1 resource contract', () => {
    expect(REFERENCE_SNIPPETS.publish).toContain("service: 'JSON'");
    expect(REFERENCE_SNIPPETS.publish).toContain("filename: 'feedback.json'");
    expect(REFERENCE_SNIPPETS.publish).toContain('qhelp.feedback.v1.p.');
    expect(REFERENCE_SNIPPETS.publish).toContain("['qortium-help', 'feedback', 'v1', 'post', payload.type]");
  });

  it('documents the owner-address boundary for pointer-aware author avatars', () => {
    const html = renderToStaticMarkup(<Reference />);

    expect(html).toContain('Author avatars');
    expect(html).toContain('never builds a direct thumbnail URL');
  });

  it('documents the pointer-aware avatar contract and safe fallback behaviour', () => {
    const html = renderToStaticMarkup(<Reference />);

    expect(html).toContain('Account and group avatars');
    expect(html).toContain("status: &#x27;PENDING&#x27;");
    expect(html).toContain('500 KiB');
    expect(html).toContain('latest resource revision');
    expect(html).toContain('avatar: null');
  });

  it('provides copyable feature detection, read, and setter examples for avatars', () => {
    expect(REFERENCE_SNIPPETS.avatarFeatureDetection).toContain("'FETCH_ACCOUNT_AVATAR'");
    expect(REFERENCE_SNIPPETS.avatarFeatureDetection).toContain("'SET_GROUP_AVATAR'");
    expect(REFERENCE_SNIPPETS.fetchAvatar).toContain("status === 'PENDING'");
    expect(REFERENCE_SNIPPETS.fetchAvatar).toContain('retryAfterSeconds');
    expect(REFERENCE_SNIPPETS.fetchAvatar).toContain("source is 'POINTER' or 'LEGACY'");
    expect(REFERENCE_SNIPPETS.fetchAvatar).toContain('URL.createObjectURL(new Blob');
    expect(REFERENCE_SNIPPETS.setAvatarPointer).toContain("action: 'SET_ACCOUNT_AVATAR'");
    expect(REFERENCE_SNIPPETS.setAvatarPointer).toContain('avatar: null');
  });
});
