import { describe, expect, it } from 'vitest';
import { buildPostLink, getAppBaseAddress, getInitialPostId } from './deepLink';

describe('deep links', () => {
  it('reads the post id from the render query string', () => {
    expect(getInitialPostId('?identifier=Help&post=abc123&theme=dark')).toBe('abc123');
    expect(getInitialPostId('?theme=dark')).toBeNull();
    expect(getInitialPostId('')).toBeNull();
    expect(getInitialPostId('?post=%20')).toBeNull();
  });

  it('derives the app address from the Home render location', () => {
    expect(
      getAppBaseAddress({ pathname: '/render/APP/Help', search: '?identifier=Help&theme=dark' }),
    ).toBe('qdn://APP/Help/Help');
  });

  it('falls back to the published identity outside the render host', () => {
    expect(getAppBaseAddress({ pathname: '/', search: '' })).toBe('qdn://APP/Help/Help');
  });

  it('builds a shareable post link', () => {
    expect(buildPostLink('abc123', { pathname: '/render/APP/Help', search: '?identifier=Help' })).toBe(
      'qdn://APP/Help/Help?post=abc123',
    );
  });

  it('round-trips a built link back to its post id', () => {
    const link = buildPostLink('xyz-789', { pathname: '/render/APP/Help', search: '?identifier=Help' });
    const query = link.slice(link.indexOf('?'));

    expect(getInitialPostId(query)).toBe('xyz-789');
  });
});
