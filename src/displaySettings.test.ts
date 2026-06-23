import { describe, expect, it } from 'vitest';
import {
  getDisplaySettingsUpdateFromMessage,
  normalizeAccent,
  normalizeLanguage,
  normalizeTextSize,
  normalizeTheme,
  type QdnDisplaySettings,
} from './displaySettings';

const current: QdnDisplaySettings = {
  accent: 'green',
  language: 'en',
  textSize: 'medium',
  theme: 'light',
};

describe('getDisplaySettingsUpdateFromMessage', () => {
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
        },
        current,
      ),
    ).toEqual({
      ...current,
      accent: 'orange',
      language: 'fr',
      textSize: 'large',
      theme: 'dark',
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
  });

  it('normalizes text sizes and rejects invalid values', () => {
    expect(normalizeTextSize('extra-large')).toBe('extra-large');
    expect(normalizeTextSize('XL')).toBeNull();
    expect(normalizeLanguage('FR')).toBe('fr');
  });
});
