// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { detectInitialLocale } from '../../src/i18n';

const LS_KEY = 'open-design:locale';
const LS_SOURCE_KEY = 'open-design:locale-source';

function setStoredLocale(locale: string, source: 'manual' | 'untagged' = 'manual'): void {
  window.localStorage.setItem(LS_KEY, locale);
  if (source === 'manual') {
    window.localStorage.setItem(LS_SOURCE_KEY, 'manual');
  } else {
    window.localStorage.removeItem(LS_SOURCE_KEY);
  }
}

function setNavigatorLanguages(languages: readonly string[]): void {
  Object.defineProperty(window.navigator, 'languages', {
    configurable: true,
    get: () => languages,
  });
  Object.defineProperty(window.navigator, 'language', {
    configurable: true,
    get: () => languages[0] ?? 'en',
  });
}

describe('detectInitialLocale defaults', () => {
  beforeEach(() => {
    window.localStorage.clear();
    setNavigatorLanguages(['en-US']);
  });

  afterEach(() => {
    window.localStorage.clear();
  });

  it('preserves a manually selected language', () => {
    setStoredLocale('ja', 'manual');
    setNavigatorLanguages(['fr-FR']);

    expect(detectInitialLocale()).toBe('ja');
  });

  it('ignores an untagged legacy value and defaults to Simplified Chinese', () => {
    setStoredLocale('ja', 'untagged');

    expect(detectInitialLocale()).toBe('zh-CN');
  });

  it('defaults to Simplified Chinese when a manual value is unsupported', () => {
    setStoredLocale('xx-YY', 'manual');
    setNavigatorLanguages(['de-DE']);

    expect(detectInitialLocale()).toBe('zh-CN');
  });

  it('does not let the browser language override the product default', () => {
    setNavigatorLanguages(['ko-KR', 'fr-FR']);

    expect(detectInitialLocale()).toBe('zh-CN');
  });
});
