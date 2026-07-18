export const BUILT_IN_PRODUCT_NAMES = ['qortium-core', 'qortium-home'] as const;

const BUILT_IN_PRODUCT_KEYS = new Set(BUILT_IN_PRODUCT_NAMES.map((name) => name.toLowerCase()));

function normalizeProductName(value: string | null | undefined) {
  return value?.trim().toLowerCase() ?? '';
}

export function mergeProductNames(appNames: string[]) {
  const products = new Map<string, string>();

  for (const name of [...appNames, ...BUILT_IN_PRODUCT_NAMES]) {
    const trimmed = name.trim();

    if (trimmed) {
      products.set(trimmed.toLowerCase(), trimmed);
    }
  }

  return [...products.values()].sort((a, b) => a.localeCompare(b));
}

export function canOpenProductAsQdnApp(value: string | null | undefined) {
  const product = normalizeProductName(value);

  return !!product && !BUILT_IN_PRODUCT_KEYS.has(product);
}
