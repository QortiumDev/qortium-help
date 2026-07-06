export const APP_FILTER_ALL = '';
export const APP_FILTER_UNTAGGED = '__qhelp_untagged__';

export type AppFilterValue = string;

export type AppTaggedPost = {
  payload: {
    app?: string | null;
  };
};

export type AppFilterOption = {
  count: number;
  kind: 'all' | 'app' | 'untagged';
  label: string;
  value: AppFilterValue;
};

function normalizeAppName(value: string | null | undefined) {
  return value?.trim() ?? '';
}

function appKey(value: string) {
  return value.toLowerCase();
}

export function buildAppFilterOptions(posts: AppTaggedPost[], selectedValue: AppFilterValue = APP_FILTER_ALL): AppFilterOption[] {
  const appCounts = new Map<string, { count: number; label: string; value: string }>();
  let untaggedCount = 0;

  for (const post of posts) {
    const app = normalizeAppName(post.payload.app);

    if (!app) {
      untaggedCount += 1;
      continue;
    }

    const key = appKey(app);
    const existing = appCounts.get(key);

    if (existing) {
      existing.count += 1;
    } else {
      appCounts.set(key, { count: 1, label: app, value: app });
    }
  }

  const appOptions = [...appCounts.values()]
    .sort((a, b) => a.label.localeCompare(b.label))
    .map((app): AppFilterOption => ({
      count: app.count,
      kind: 'app',
      label: app.label,
      value: app.value,
    }));

  const selectedApp = normalizeAppName(selectedValue);

  if (selectedApp && selectedApp !== APP_FILTER_UNTAGGED && !appCounts.has(appKey(selectedApp))) {
    appOptions.unshift({
      count: 0,
      kind: 'app',
      label: selectedApp,
      value: selectedApp,
    });
  }

  return [
    {
      count: posts.length,
      kind: 'all',
      label: 'All',
      value: APP_FILTER_ALL,
    },
    {
      count: untaggedCount,
      kind: 'untagged',
      label: 'Untagged',
      value: APP_FILTER_UNTAGGED,
    },
    ...appOptions,
  ];
}

export function filterPostsByApp<T extends AppTaggedPost>(posts: T[], selectedValue: AppFilterValue): T[] {
  const selectedApp = normalizeAppName(selectedValue);

  if (!selectedApp) {
    return posts;
  }

  if (selectedApp === APP_FILTER_UNTAGGED) {
    return posts.filter((post) => !normalizeAppName(post.payload.app));
  }

  const selectedKey = appKey(selectedApp);

  return posts.filter((post) => {
    const app = normalizeAppName(post.payload.app);

    return app ? appKey(app) === selectedKey : false;
  });
}
