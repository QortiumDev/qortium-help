import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ReferenceNavigation, REFERENCE_SECTIONS, referenceSectionUrl } from './ReferenceNavigation';
import { readHelpRoute } from './deepLink';

describe('Home-safe reference sections', () => {
  it('canonicalizes only owned route keys and survives Core injected base URLs', () => {
    const href = referenceSectionUrl('https://node.test/render/APP/Help/Help/?view=reference&view=developer&post=old&new=Wallet&qdnHomeBridge=fixture&theme=dark&future=a&future=b#old', 'metadata');
    const target = new URL(href, 'https://node.test/render/APP/Help/Help/');
    expect(target.pathname).toBe('/render/APP/Help/Help/');
    expect(target.searchParams.getAll('view')).toEqual(['developers']);
    expect(target.searchParams.has('post')).toBe(false);
    expect(target.searchParams.has('new')).toBe(false);
    expect(target.searchParams.get('qdnHomeBridge')).toBe('fixture');
    expect(target.searchParams.get('theme')).toBe('dark');
    expect(target.searchParams.getAll('future')).toEqual(['a', 'b']);
    expect(target.hash).toBe('#metadata');
    expect(readHelpRoute(target.search)).toEqual({ kind: 'reference' });
  });
  it('renders real document links for every section rather than base-sensitive bare fragments', () => {
    const html = renderToStaticMarkup(<ReferenceNavigation />);
    expect(html).toContain('aria-label="Developer reference sections"');
    for (const [id] of REFERENCE_SECTIONS) expect(html).toContain(`href="/?view=developers#${id}"`);
    expect(html).not.toContain('href="#');
  });
});
