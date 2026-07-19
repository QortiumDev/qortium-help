import { describe, expect, it } from 'vitest';
import {
  buildPostLink,
  getAppBaseAddress,
  getInitialAppFilter,
  getInitialComposerParams,
  getInitialDeveloperReferenceRequested,
  getInitialFeedFilter,
  getInitialNewPostRequested,
  getInitialPostId,
  readHelpRoute,
  resolveHelpRouteViewState,
  routeUrl,
  shouldReplaceHistory,
} from './deepLink';

describe('deep links', () => {
  it('reads the post id from the render query string', () => {
    expect(getInitialPostId('?post=abc123&theme=dark')).toBe('abc123');
    expect(getInitialPostId('?theme=dark')).toBeNull();
    expect(getInitialPostId('')).toBeNull();
    expect(getInitialPostId('?post=%20')).toBeNull();
  });

  it('reads the app filter from the query string', () => {
    expect(getInitialAppFilter('?app=Wallet&type=issue&theme=dark')).toBe('Wallet');
    expect(getInitialAppFilter('?app=qortium-home&type=idea')).toBe('qortium-home');
    expect(getInitialAppFilter('?app=%20')).toBeNull();
    expect(getInitialAppFilter('?new=Wallet')).toBeNull();
    expect(getInitialAppFilter('')).toBeNull();
  });

  it('detects new post deep links from the query string', () => {
    expect(getInitialNewPostRequested('?new')).toBe(true);
    expect(getInitialNewPostRequested('?new=Wallet')).toBe(true);
    expect(getInitialNewPostRequested('?app=Wallet')).toBe(false);
    expect(getInitialNewPostRequested('')).toBe(false);
  });

  it('detects developer reference deep links from the query string', () => {
    expect(getInitialDeveloperReferenceRequested('?view=developers')).toBe(true);
    expect(getInitialDeveloperReferenceRequested('?view=reference&theme=dark')).toBe(true);
    expect(getInitialDeveloperReferenceRequested('?view=developer')).toBe(true);
    expect(getInitialDeveloperReferenceRequested('?view=feedback')).toBe(false);
    expect(getInitialDeveloperReferenceRequested('')).toBe(false);
  });

  it('reads composer pre-fill params from new post links', () => {
    expect(getInitialComposerParams('?new=Wallet&type=issue&theme=dark')).toEqual({ app: 'Wallet', type: 'issue' });
    expect(getInitialComposerParams('?new=Chat&type=idea')).toEqual({ app: 'Chat', type: 'idea' });
    expect(getInitialComposerParams('?new=qortium-core&type=issue')).toEqual({ app: 'qortium-core', type: 'issue' });
    expect(getInitialComposerParams('?new=qortium-home&type=idea')).toEqual({ app: 'qortium-home', type: 'idea' });
    expect(getInitialComposerParams('?new&type=idea')).toEqual({ app: null, type: 'idea' });
    expect(getInitialComposerParams('?new=Wallet&type=open')).toEqual({ app: 'Wallet', type: null });
    expect(getInitialComposerParams('?app=Wallet&type=issue')).toEqual({ app: null, type: null });
    expect(getInitialComposerParams('?type=bogus')).toEqual({ app: null, type: null });
    expect(getInitialComposerParams('')).toEqual({ app: null, type: null });
  });

  it('reads feed filter params from the query string', () => {
    expect(getInitialFeedFilter('?type=all')).toBe('all');
    expect(getInitialFeedFilter('?type=open')).toBe('open');
    expect(getInitialFeedFilter('?type=completed')).toBe('completed');
    expect(getInitialFeedFilter('?type=done')).toBe('completed');
    expect(getInitialFeedFilter('?app=Wallet&type=issue')).toBe('issue');
    expect(getInitialFeedFilter('?type=issues')).toBe('issue');
    expect(getInitialFeedFilter('?type=ideas')).toBe('idea');
    expect(getInitialFeedFilter('?type=orphans')).toBe('orphan');
    expect(getInitialFeedFilter('?type=my-apps')).toBe('myApps');
    expect(getInitialFeedFilter('?type=my_apps')).toBe('myApps');
    expect(getInitialFeedFilter('?type=myapps')).toBe('myApps');
    expect(getInitialFeedFilter('?type=my%20apps')).toBe('myApps');
    expect(getInitialFeedFilter('?type=bogus')).toBeNull();
    expect(getInitialFeedFilter('')).toBeNull();
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

  it('parses one canonical route with the established precedence', () => {
    expect(readHelpRoute('?view=reference&post=ignored&new=ignored')).toEqual({ kind: 'reference' });
    expect(readHelpRoute('?post=post-1&new=ignored&type=idea')).toEqual({ kind: 'post', postId: 'post-1' });
    expect(readHelpRoute('?new=Wallet&type=issue')).toEqual({
      app: 'Wallet',
      kind: 'compose',
      type: 'issue',
    });
    expect(readHelpRoute('?app=Chat&type=done')).toEqual({
      appFilter: 'Chat',
      filter: 'completed',
      kind: 'list',
    });
    expect(readHelpRoute('')).toEqual({ appFilter: null, filter: 'all', kind: 'list' });
  });

  it('serializes routes while replacing stale Help keys and preserving host parameters', () => {
    const location = {
      hash: '#host-anchor',
      pathname: '/render/APP/Help/Help',
      search: '?theme=dark&lang=fr&post=old&new=Wallet&type=issue&view=developers&futureHost=1',
    };

    expect(routeUrl({ kind: 'post', postId: 'post / 2' }, location)).toBe(
      '/render/APP/Help/Help?theme=dark&lang=fr&futureHost=1&post=post+%2F+2#host-anchor',
    );
    expect(routeUrl({ appFilter: 'Qortium Home', filter: 'idea', kind: 'list' }, location)).toBe(
      '/render/APP/Help/Help?theme=dark&lang=fr&futureHost=1&app=Qortium+Home&type=idea#host-anchor',
    );
    expect(routeUrl({ app: 'Chat', kind: 'compose', type: 'issue' }, location)).toBe(
      '/render/APP/Help/Help?theme=dark&lang=fr&futureHost=1&new=Chat&type=issue#host-anchor',
    );
    expect(routeUrl({ app: null, kind: 'compose', type: null }, location)).toBe(
      '/render/APP/Help/Help?theme=dark&lang=fr&futureHost=1&new#host-anchor',
    );
    expect(routeUrl({ appFilter: null, filter: 'myApps', kind: 'list' }, location)).toBe(
      '/render/APP/Help/Help?theme=dark&lang=fr&futureHost=1&type=my-apps#host-anchor',
    );
    expect(routeUrl({ kind: 'reference' }, location)).toBe(
      '/render/APP/Help/Help?theme=dark&lang=fr&futureHost=1&view=developers#host-anchor',
    );
  });

  it('clears detail state when returning to the unfiltered list', () => {
    expect(routeUrl(
      { appFilter: null, filter: 'all', kind: 'list' },
      { pathname: '/render/APP/Help/Help', search: '?post=post-a&theme=light' },
    )).toBe('/render/APP/Help/Help?theme=light');
  });

  it('uses replacement history only for canonicalizing terminal transitions', () => {
    expect(shouldReplaceHistory('standard')).toBe(false);
    expect(shouldReplaceHistory('published-post')).toBe(true);
    expect(shouldReplaceHistory('deleted-post')).toBe(true);
    expect(shouldReplaceHistory('invalid-target')).toBe(true);
  });

  it('rehydrates visible state for Back and Forward routes without a reload', () => {
    expect(resolveHelpRouteViewState({ kind: 'post', postId: 'post-a' }, true)).toEqual({
      pendingPostId: null,
      selectedPostId: 'post-a',
      view: 'detail',
    });
    expect(resolveHelpRouteViewState({ kind: 'post', postId: 'post-b' }, false)).toEqual({
      pendingPostId: 'post-b',
      selectedPostId: null,
      view: 'list',
    });
    expect(resolveHelpRouteViewState({ appFilter: 'Chat', filter: 'open', kind: 'list' })).toEqual({
      appFilter: 'Chat',
      filter: 'open',
      pendingPostId: null,
      selectedPostId: null,
      view: 'list',
    });
    expect(resolveHelpRouteViewState({ app: 'Wallet', kind: 'compose', type: 'idea' })).toEqual({
      composer: { app: 'Wallet', type: 'idea' },
      pendingPostId: null,
      selectedPostId: null,
      view: 'compose',
    });
    expect(resolveHelpRouteViewState({ kind: 'reference' })).toEqual({
      pendingPostId: null,
      selectedPostId: null,
      view: 'reference',
    });
  });
});
