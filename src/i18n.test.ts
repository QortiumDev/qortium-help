import { describe, expect, it } from 'vitest';
import { EN_STRINGS } from './locales/en';

// i18n-6: guard against locale drift. Every non-en catalog must define exactly
// the same key set as the English source — no missing keys (which would silently
// fall back to English) and no stale extras left behind after a key is renamed.
const EN_KEYS = Object.keys(EN_STRINGS).sort();

const localeModules = import.meta.glob('./locales/*.ts', { eager: true }) as Record<
  string,
  { default?: Record<string, string> }
>;

const nonEnLocales = Object.entries(localeModules).filter(([path]) => !path.endsWith('/en.ts'));

describe('locale catalog parity', () => {
  it('presents the mixed Core, Home, and QDN app selector as products', () => {
    expect(EN_STRINGS['field.app']).toBe('Product');
    expect(EN_STRINGS['field.appPlaceholder']).toBe('Select a product (optional)');
  });

  it('ships a catalog for every non-en supported language', () => {
    expect(nonEnLocales.length).toBe(22);
  });

  for (const [path, module] of nonEnLocales) {
    it(`${path} defines exactly the en key set`, () => {
      const catalog = module.default;

      expect(catalog, `${path} must have a default export`).toBeTruthy();
      expect(Object.keys(catalog as Record<string, string>).sort()).toEqual(EN_KEYS);
    });
  }
});
