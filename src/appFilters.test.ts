import { describe, expect, it } from 'vitest';
import { APP_FILTER_ALL, APP_FILTER_UNTAGGED, buildAppFilterOptions, filterPostsByApp } from './appFilters';

function post(app?: string | null) {
  return {
    payload: {
      app,
    },
  };
}

describe('app filter helpers', () => {
  it('builds all, untagged, and tagged app options from current posts', () => {
    expect(buildAppFilterOptions([post('Wallet'), post(null), post('Chat'), post('wallet')])).toEqual([
      { count: 4, kind: 'all', label: 'All', value: APP_FILTER_ALL },
      { count: 1, kind: 'untagged', label: 'Untagged', value: APP_FILTER_UNTAGGED },
      { count: 1, kind: 'app', label: 'Chat', value: 'Chat' },
      { count: 2, kind: 'app', label: 'Wallet', value: 'Wallet' },
    ]);
  });

  it('keeps an unknown selected app visible for direct links', () => {
    expect(buildAppFilterOptions([post('Wallet')], 'qortium-home')).toEqual([
      { count: 1, kind: 'all', label: 'All', value: APP_FILTER_ALL },
      { count: 0, kind: 'untagged', label: 'Untagged', value: APP_FILTER_UNTAGGED },
      { count: 0, kind: 'app', label: 'qortium-home', value: 'qortium-home' },
      { count: 1, kind: 'app', label: 'Wallet', value: 'Wallet' },
    ]);
  });

  it('filters posts by all, untagged, and app-specific selections', () => {
    const posts = [post('Wallet'), post(null), post('Chat'), post('wallet')];

    expect(filterPostsByApp(posts, APP_FILTER_ALL)).toHaveLength(4);
    expect(filterPostsByApp(posts, APP_FILTER_UNTAGGED)).toEqual([posts[1]]);
    expect(filterPostsByApp(posts, 'wallet')).toEqual([posts[0], posts[3]]);
    expect(filterPostsByApp(posts, 'Unknown')).toEqual([]);
  });
});
