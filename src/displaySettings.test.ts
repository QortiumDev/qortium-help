import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  applyDisplaySettings,
  getDisplaySettingsUpdateFromMessage,
  getInitialDisplaySettings,
  normalizeAccent,
  normalizeLanguage,
  normalizeTextSize,
  normalizeTheme,
  normalizeUiStyle,
  type QdnDisplaySettings,
} from './displaySettings';

const current: QdnDisplaySettings = {
  accent: 'green',
  language: 'en',
  textSize: 'medium',
  theme: 'light',
  uiStyle: 'classic',
};

describe('getDisplaySettingsUpdateFromMessage', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('updates accent from ACCENT_CHANGED action', () => {
    expect(getDisplaySettingsUpdateFromMessage({ action: 'ACCENT_CHANGED', accent: 'blue' }, current)).toEqual({
      ...current,
      accent: 'blue',
    });
  });

  it('uses qdnAccent alias for ACCENT_CHANGED action', () => {
    expect(getDisplaySettingsUpdateFromMessage({ action: 'ACCENT_CHANGED', qdnAccent: 'red' }, current)).toEqual({
      ...current,
      accent: 'red',
    });
  });

  it('returns null for invalid ACCENT_CHANGED values', () => {
    expect(getDisplaySettingsUpdateFromMessage({ action: 'ACCENT_CHANGED', accent: 'mauve' }, current)).toBeNull();
    expect(getDisplaySettingsUpdateFromMessage({ action: 'ACCENT_CHANGED', qdnAccent: null }, current)).toBeNull();
  });

  it('updates all supported fields for DISPLAY_SETTINGS_CHANGED', () => {
    expect(
      getDisplaySettingsUpdateFromMessage(
        {
          action: 'DISPLAY_SETTINGS_CHANGED',
          accent: 'orange',
          theme: 'dark',
          qdnLang: 'fr',
          qdnTextSize: 'large',
          uiStyle: 'modern',
        },
        current,
      ),
    ).toEqual({
      ...current,
      accent: 'orange',
      language: 'fr',
      textSize: 'large',
      theme: 'dark',
      uiStyle: 'modern',
    });
  });

  it('falls back to current settings for invalid DISPLAY_SETTINGS_CHANGED values', () => {
    expect(
      getDisplaySettingsUpdateFromMessage(
        {
          action: 'DISPLAY_SETTINGS_CHANGED',
          accent: 'invalid',
          language: 12,
          qdnTextSize: 'too-large',
          qdnTheme: 'nope',
        },
        current,
      ),
    ).toEqual(current);
  });

  it('updates language from LANGUAGE_CHANGED action using aliases', () => {
    expect(getDisplaySettingsUpdateFromMessage({ action: 'LANGUAGE_CHANGED', qdnLang: 'es' }, current)).toEqual({
      ...current,
      language: 'es',
    });

    expect(getDisplaySettingsUpdateFromMessage({ action: 'LANGUAGE_CHANGED', language: 'de' }, current)).toEqual({
      ...current,
      language: 'de',
    });
  });

  it('returns null for LANGUAGE_CHANGED invalid values', () => {
    expect(getDisplaySettingsUpdateFromMessage({ action: 'LANGUAGE_CHANGED', language: 'zz' }, current)).toBeNull();
  });

  it('updates text size from TEXT_SIZE_CHANGED action using aliases', () => {
    expect(getDisplaySettingsUpdateFromMessage({ action: 'TEXT_SIZE_CHANGED', qdnTextSize: 'large' }, current)).toEqual({
      ...current,
      textSize: 'large',
    });
  });

  it('returns null for TEXT_SIZE_CHANGED invalid values', () => {
    expect(getDisplaySettingsUpdateFromMessage({ action: 'TEXT_SIZE_CHANGED', qdnTextSize: 'giant' }, current)).toBeNull();
  });

  it('updates theme from THEME_CHANGED action', () => {
    expect(getDisplaySettingsUpdateFromMessage({ action: 'THEME_CHANGED', theme: 'dark' }, current)).toEqual({
      ...current,
      theme: 'dark',
    });
  });

  it('returns null for THEME_CHANGED invalid values', () => {
    expect(getDisplaySettingsUpdateFromMessage({ action: 'THEME_CHANGED', theme: 'ultra' }, current)).toBeNull();
  });

  it('updates UI style from UI_STYLE_CHANGED action using aliases', () => {
    expect(getDisplaySettingsUpdateFromMessage({ action: 'UI_STYLE_CHANGED', requestedHandler: 'UI', uiStyle: 'modern' }, current)).toEqual({
      ...current,
      uiStyle: 'modern',
    });

    expect(getDisplaySettingsUpdateFromMessage({ action: 'UI_STYLE_CHANGED', qdnUIStyle: 'classic' }, { ...current, uiStyle: 'modern' })).toEqual({
      ...current,
      uiStyle: 'classic',
    });
  });

  it('returns null for UI_STYLE_CHANGED invalid values', () => {
    expect(getDisplaySettingsUpdateFromMessage({ action: 'UI_STYLE_CHANGED', uiStyle: 'retro' }, current)).toBeNull();
  });

  it('ignores non-UI handler messages', () => {
    expect(getDisplaySettingsUpdateFromMessage({ action: 'UI_STYLE_CHANGED', requestedHandler: 'OTHER', uiStyle: 'modern' }, current)).toBeNull();
    expect(getDisplaySettingsUpdateFromMessage({ action: 'THEME_CHANGED', requestedHandler: 'OTHER', theme: 'dark' }, current)).toBeNull();
  });

  it('returns null for missing action or non-object data', () => {
    expect(getDisplaySettingsUpdateFromMessage({}, current)).toBeNull();
    expect(getDisplaySettingsUpdateFromMessage('DISPLAY_SETTINGS_CHANGED', current)).toBeNull();
    expect(getDisplaySettingsUpdateFromMessage(null, current)).toBeNull();
  });
});

describe('display setting normalizers', () => {
  it('normalizes theme and accent text casing', () => {
    expect(normalizeTheme('DARK')).toBe('dark');
    expect(normalizeTheme('none')).toBeNull();
    expect(normalizeAccent('Cyan')).toBe('cyan');
    expect(normalizeAccent('mauve')).toBeNull();
    expect(normalizeUiStyle('MODERN')).toBe('modern');
    expect(normalizeUiStyle('retro')).toBeNull();
  });

  it('normalizes text sizes and rejects invalid values', () => {
    expect(normalizeTextSize('extra-large')).toBe('extra-large');
    expect(normalizeTextSize('XL')).toBeNull();
    expect(normalizeLanguage('FR')).toBe('fr');
  });
});

describe('initial display settings', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('reads uiStyle from the render URL before host globals', () => {
    vi.stubGlobal('window', {
      _qdnAccent: 'yellow',
      _qdnLang: 'en',
      _qdnTextSize: 'small',
      _qdnTheme: 'light',
      _qdnUiStyle: 'classic',
      location: {
        search: '?theme=dark&textSize=large&lang=fr&accent=blue&uiStyle=modern',
      },
    });

    expect(getInitialDisplaySettings()).toEqual({
      accent: 'blue',
      language: 'fr',
      textSize: 'large',
      theme: 'dark',
      uiStyle: 'modern',
    });
  });

  it('falls back to classic for invalid or absent uiStyle values', () => {
    vi.stubGlobal('window', {
      _qdnUIStyle: 'retro',
      location: {
        search: '?uiStyle=banana',
      },
    });

    expect(getInitialDisplaySettings()).toMatchObject({
      uiStyle: 'classic',
    });
  });

  it('uses the host uiStyle global when no query value is present', () => {
    vi.stubGlobal('window', {
      _qdnUIStyle: 'modern',
      location: {
        search: '',
      },
    });

    expect(getInitialDisplaySettings()).toMatchObject({
      uiStyle: 'modern',
    });
  });
});

describe('applyDisplaySettings', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('applies display settings to the document root before paint', () => {
    const root = {
      dataset: {} as Record<string, string>,
      dir: '',
      lang: '',
      style: {} as Record<string, string>,
    };

    vi.stubGlobal('document', {
      documentElement: root,
    });

    applyDisplaySettings({
      accent: 'purple',
      language: 'ar',
      textSize: 'huge',
      theme: 'dark',
      uiStyle: 'modern',
    });

    expect(root.dataset).toMatchObject({
      accent: 'purple',
      language: 'ar',
      textSize: 'huge',
      theme: 'dark',
      ui: 'modern',
    });
    expect(root.dir).toBe('rtl');
    expect(root.lang).toBe('ar');
    expect(root.style.colorScheme).toBe('dark');
  });
});
