import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchAccountAvatar, parseAccountAvatarResponse, resolveNameOwner } from './avatar';
import { hasHomeBridge, qdnRequest } from './qdnRequest';

vi.mock('./qdnRequest', () => ({
  hasAction: (actions: string[], action: string) => actions.some((candidate) => candidate.toUpperCase() === action.toUpperCase()),
  hasHomeBridge: vi.fn(),
  qdnRequest: vi.fn(),
}));

const ADDRESS = 'QT4zHex8JEULmBhYmKd5UhpiNA46T5wUko';

describe('pointer-aware Help avatars', () => {
  const hasHomeBridgeMock = vi.mocked(hasHomeBridge);
  const qdnRequestMock = vi.mocked(qdnRequest);
  const actions = ['GET_NAME_DATA', 'FETCH_ACCOUNT_AVATAR'];

  beforeEach(() => {
    hasHomeBridgeMock.mockReset();
    qdnRequestMock.mockReset();
    hasHomeBridgeMock.mockReturnValue(true);
  });

  it('uses the resolved name owner, then accepts only a bounded pointer avatar for that address', async () => {
    qdnRequestMock.mockResolvedValueOnce({ name: 'Alice', owner: ADDRESS });
    await expect(resolveNameOwner('Alice', actions)).resolves.toBe(ADDRESS);
    expect(qdnRequestMock).toHaveBeenCalledWith({ action: 'GET_NAME_DATA', name: 'Alice' });

    qdnRequestMock.mockResolvedValueOnce({
      address: ADDRESS,
      body: 'AQIDBA==',
      contentLength: 4,
      contentType: 'image/png',
      descriptor: { identifier: '', name: 'Alice', service: 'THUMBNAIL' },
      encoding: 'base64',
      source: 'POINTER',
    });
    await expect(fetchAccountAvatar(ADDRESS, actions)).resolves.toMatchObject({ kind: 'ready' });
    expect(qdnRequestMock).toHaveBeenLastCalledWith({ action: 'FETCH_ACCOUNT_AVATAR', address: ADDRESS, maxBytes: 500 * 1024 });
  });

  it('fails closed for a mismatched address, raw URL, or malformed pointer descriptor', () => {
    expect(parseAccountAvatarResponse({ address: 'Qother' }, ADDRESS)).toEqual({ kind: 'unavailable' });
    expect(parseAccountAvatarResponse({
      address: ADDRESS,
      body: 'https://node.invalid/avatar.png',
      contentLength: 4,
      contentType: 'image/png',
      encoding: 'base64',
      source: 'LEGACY',
    }, ADDRESS)).toEqual({ kind: 'unavailable' });
    expect(parseAccountAvatarResponse({
      address: ADDRESS,
      body: 'AQIDBA==',
      contentLength: 4,
      contentType: 'image/png',
      encoding: 'base64',
      source: 'POINTER',
    }, ADDRESS)).toEqual({ kind: 'unavailable' });
  });

  it('keeps a bounded retry path for a matching pending pointer response', () => {
    expect(parseAccountAvatarResponse({
      address: ADDRESS,
      descriptor: { identifier: '', name: 'Alice', service: 'THUMBNAIL' },
      retryAfterSeconds: 999,
      source: 'POINTER',
      status: 'PENDING',
    }, ADDRESS)).toEqual({ kind: 'pending', retryAfterSeconds: 30 });
  });

  it('does not resolve names or avatars when the Home capabilities are unavailable', async () => {
    await expect(resolveNameOwner('Bob', [])).resolves.toBeNull();
    await expect(fetchAccountAvatar(ADDRESS, [])).resolves.toEqual({ kind: 'unavailable' });
    expect(qdnRequestMock).not.toHaveBeenCalled();
  });
});
