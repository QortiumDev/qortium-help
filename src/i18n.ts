import { EN_STRINGS } from './locales/en';
import arStrings from './locales/ar';
import deStrings from './locales/de';
import elStrings from './locales/el';
import esStrings from './locales/es';
import etStrings from './locales/et';
import fiStrings from './locales/fi';
import frStrings from './locales/fr';
import heStrings from './locales/he';
import hiStrings from './locales/hi';
import huStrings from './locales/hu';
import itStrings from './locales/it';
import jaStrings from './locales/ja';
import koStrings from './locales/ko';
import nbStrings from './locales/nb';
import nlStrings from './locales/nl';
import plStrings from './locales/pl';
import ptStrings from './locales/pt';
import roStrings from './locales/ro';
import ruStrings from './locales/ru';
import svStrings from './locales/sv';
import zhCnStrings from './locales/zh-CN';
import zhTwStrings from './locales/zh-TW';

export type MessageValues = Record<string, string | number>;

export const SUPPORTED_LANGUAGES = [
  'ar',
  'de',
  'el',
  'en',
  'es',
  'et',
  'fi',
  'fr',
  'he',
  'hi',
  'hu',
  'it',
  'ja',
  'ko',
  'nb',
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
const CATALOGS: { [locale in SupportedLanguage]?: Partial<MessageCatalog> } = {
  ar: arStrings,
  de: deStrings,
  el: elStrings,
  es: esStrings,
  et: etStrings,
  fi: fiStrings,
  fr: frStrings,
  he: heStrings,
  hi: hiStrings,
  hu: huStrings,
  it: itStrings,
  ja: jaStrings,
  ko: koStrings,
  nb: nbStrings,
  nl: nlStrings,
  pl: plStrings,
  pt: ptStrings,
  ro: roStrings,
  ru: ruStrings,
  sv: svStrings,
  'zh-CN': zhCnStrings,
  'zh-TW': zhTwStrings,
};

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
  const catalog: MessageCatalog = { ...EN_STRINGS, ...CATALOGS[locale] } as MessageCatalog;

  return function translate(key: MessageKey, values?: MessageValues) {
    return interpolate(catalog[key] ?? EN_STRINGS[key], values);
  };
}

export type TranslateFunction = ReturnType<typeof createTranslator>;
