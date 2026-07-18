import { describe, expect, it } from 'vitest';
import { BUILT_IN_PRODUCT_NAMES, canOpenProductAsQdnApp, mergeProductNames } from './products';

describe('feedback products', () => {
  it('always includes Core and Home alongside discovered QDN apps', () => {
    expect(BUILT_IN_PRODUCT_NAMES).toEqual(['qortium-core', 'qortium-home']);
    expect(mergeProductNames(['Chat', 'Help', 'QORTIUM-HOME'])).toEqual([
      'Chat',
      'Help',
      'qortium-core',
      'qortium-home',
    ]);
  });

  it('does not offer QDN APP navigation for built-in non-QDN products', () => {
    expect(canOpenProductAsQdnApp('qortium-core')).toBe(false);
    expect(canOpenProductAsQdnApp(' QORTIUM-HOME ')).toBe(false);
  });

  it('preserves QDN APP navigation for discovered apps', () => {
    expect(canOpenProductAsQdnApp('Chat')).toBe(true);
    expect(canOpenProductAsQdnApp('')).toBe(false);
    expect(canOpenProductAsQdnApp(null)).toBe(false);
  });
});
