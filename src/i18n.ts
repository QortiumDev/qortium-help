import { EN_STRINGS } from './locales/en';

export type MessageValues = Record<string, string | number>;

export const SUPPORTED_LANGUAGES = [
  'ar',
  'de',
  'en',
  'es',
  'et',
  'fi',
  'fr',
  'he',
  'hu',
  'it',
  'ja',
  'ko',
  'nl',
  'pl',
  'pt',
  'ro',
  'ru',
  'sv',
  'zh-CN',
  'zh-TW',
] as const;

export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

export type MessageKey = keyof typeof EN_STRINGS;
type MessageCatalog = { [key in MessageKey]: string };

const SUPPORTED_LANGUAGE_SET = new Set<string>(SUPPORTED_LANGUAGES);
const RTL_LANGUAGES = new Set<string>(['ar', 'he']);
const DEFAULT_LANGUAGE: SupportedLanguage = 'en';
const EMPTY_CATALOGS: { [locale in SupportedLanguage]?: Partial<MessageCatalog> } = {};

function normalizeRawLanguage(language: string) {
  return language.trim().replace(/_/g, '-').toLowerCase();
}

function mapRawLanguage(language: string): SupportedLanguage | null {
  const normalized = normalizeRawLanguage(language);

  if (!normalized) {
    return null;
  }

  const explicit: Partial<Record<string, SupportedLanguage>> = {
    'en-gb': 'en',
    'en-us': 'en',
    'zh-cn': 'zh-CN',
    'zh-hans': 'zh-CN',
    'zh-hant': 'zh-TW',
    'zh-tw': 'zh-TW',
  };
  const mapped = explicit[normalized];

  if (mapped) {
    return mapped;
  }

  const [primary, ...rest] = normalized.split('-');

  if (primary && SUPPORTED_LANGUAGE_SET.has(primary)) {
    return primary as SupportedLanguage;
  }

  if (primary === 'zh') {
    if (rest.some((part) => part.includes('tw') || part.includes('hk') || part.includes('mo') || part.includes('hant'))) {
      return 'zh-TW';
    }

    return 'zh-CN';
  }

  return null;
}

export function normalizeLanguage(language: string | undefined): SupportedLanguage | null {
  return language ? mapRawLanguage(language) : null;
}

export function isRtlLanguage(language: SupportedLanguage) {
  return RTL_LANGUAGES.has(language);
}

function interpolate(message: string, values?: MessageValues) {
  if (!values) {
    return message;
  }

  return message.replace(/\{(\w+)\}/g, (match, key) => {
    const value = values[key];

    return value === undefined ? match : String(value);
  });
}

export function createTranslator(language: string | undefined) {
  const locale = normalizeLanguage(language) ?? DEFAULT_LANGUAGE;
  const catalog: MessageCatalog = { ...EN_STRINGS, ...EMPTY_CATALOGS[locale] } as MessageCatalog;

  return function translate(key: MessageKey, values?: MessageValues) {
    return interpolate(catalog[key] ?? EN_STRINGS[key], values);
  };
}

export type TranslateFunction = ReturnType<typeof createTranslator>;
