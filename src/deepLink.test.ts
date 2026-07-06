import { describe, expect, it } from 'vitest';
import { buildPostLink, getAppBaseAddress, getInitialComposerParams, getInitialPostId } from './deepLink';

describe('deep links', () => {
  it('reads the post id from the render query string', () => {
    expect(getInitialPostId('?post=abc123&theme=dark')).toBe('abc123');
    expect(getInitialPostId('?theme=dark')).toBeNull();
    expect(getInitialPostId('')).toBeNull();
    expect(getInitialPostId('?post=%20')).toBeNull();
  });

  it('reads composer pre-fill params from the query string', () => {
    expect(getInitialComposerParams('?new=Wallet&type=issue&theme=dark')).toEqual({ app: 'Wallet', type: 'issue' });
    expect(getInitialComposerParams('?new=Chat&type=idea')).toEqual({ app: 'Chat', type: 'idea' });
    expect(getInitialComposerParams('?new=%20')).toEqual({ app: null, type: null });
    expect(getInitialComposerParams('?type=bogus')).toEqual({ app: null, type: null });
    expect(getInitialComposerParams('')).toEqual({ app: null, type: null });
  });

  it('prefers the identity Core injects as page globals', () => {
    expect(
      getAppBaseAddress(
        { pathname: '/render/APP/Help/Help' },
        { _qdnService: 'APP', _qdnName: 'Operator', _qdnIdentifier: 'qhelp.mirror.v1' },
      ),
    ).toBe('qdn://APP/Operator/qhelp.mirror.v1');
  });

  it('derives the app address from the path-segment render location', () => {
    expect(getAppBaseAddress({ pathname: '/render/APP/Help/Help', search: '?theme=dark' }, {})).toBe(
      'qdn://APP/Help/Help',
    );
  });

  it('reads the identifier from the third path segment', () => {
    expect(getAppBaseAddress({ pathname: '/render/APP/Operator/qhelp.mirror.v1/index.html' }, {})).toBe(
      'qdn://APP/Operator/qhelp.mirror.v1',
    );
  });

  it('falls back to the published identity outside the render host', () => {
    expect(getAppBaseAddress({ pathname: '/', search: '' }, {})).toBe('qdn://APP/Help/Help');
  });

  it('builds a shareable post link', () => {
    expect(buildPostLink('abc123', { pathname: '/render/APP/Help/Help' }, {})).toBe(
      'qdn://APP/Help/Help?post=abc123',
    );
  });

  it('round-trips a built link back to its post id', () => {
    const link = buildPostLink('xyz-789', { pathname: '/render/APP/Help/Help' }, {});
    const query = link.slice(link.indexOf('?'));

    expect(getInitialPostId(query)).toBe('xyz-789');
  });
});
