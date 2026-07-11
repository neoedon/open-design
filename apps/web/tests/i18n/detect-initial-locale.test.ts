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

<<<<<<< HEAD
describe('detectInitialLocale defaults', () => {
=======
describe('detectInitialLocale viaim defaults', () => {
>>>>>>> de88ab56c2a7977aeb8979ee8163a07448a14b14
  beforeEach(() => {
    window.localStorage.clear();
    setNavigatorLanguages(['en-US']);
  });

  afterEach(() => {
    window.localStorage.clear();
  });

<<<<<<< HEAD
  it('preserves a manually selected language', () => {
=======
  it('preserves a manually-tagged localStorage pick', () => {
>>>>>>> de88ab56c2a7977aeb8979ee8163a07448a14b14
    setStoredLocale('ja', 'manual');
    setNavigatorLanguages(['fr-FR']);

    expect(detectInitialLocale()).toBe('ja');
  });

<<<<<<< HEAD
  it('ignores an untagged legacy value and defaults to Simplified Chinese', () => {
=======
  it('ignores an untagged legacy value and uses Simplified Chinese', () => {
>>>>>>> de88ab56c2a7977aeb8979ee8163a07448a14b14
    setStoredLocale('ja', 'untagged');

    expect(detectInitialLocale()).toBe('zh-CN');
  });

<<<<<<< HEAD
  it('defaults to Simplified Chinese when a manual value is unsupported', () => {
=======
  it('uses Simplified Chinese when a manual value is unsupported', () => {
>>>>>>> de88ab56c2a7977aeb8979ee8163a07448a14b14
    setStoredLocale('xx-YY', 'manual');
    setNavigatorLanguages(['de-DE']);

    expect(detectInitialLocale()).toBe('zh-CN');
  });

<<<<<<< HEAD
  it('does not let the browser language override the product default', () => {
    setNavigatorLanguages(['ko-KR', 'fr-FR']);

=======
  it('defaults to Simplified Chinese regardless of browser language', () => {
    setNavigatorLanguages(['ko-KR']);
>>>>>>> de88ab56c2a7977aeb8979ee8163a07448a14b14
    expect(detectInitialLocale()).toBe('zh-CN');
  });
});
