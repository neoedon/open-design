import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync(
  new URL('../../src/styles/home/entry-layout.css', import.meta.url),
  'utf8',
);

function firstRule(selector: string): string {
  const start = css.indexOf(`${selector} {`);
  if (start < 0) throw new Error(`Missing CSS rule for ${selector}`);
  const end = css.indexOf('}', start);
  if (end < 0) throw new Error(`Unclosed CSS rule for ${selector}`);
  return css.slice(start, end + 1);
}

describe('entry navigation rail overflow', () => {
  it('keeps tooltips visible at normal heights and scrolls only in short viewports', () => {
    const defaultGroup = firstRule('.entry-nav-rail__group');
    expect(defaultGroup).toContain('min-height: 0');
    expect(defaultGroup).toContain('flex: 1 1 auto');
    expect(defaultGroup).not.toContain('overflow-y');

    expect(css).toMatch(
      /@media \(max-height: 720px\)\s*\{\s*\.entry-nav-rail__group\s*\{[^}]*overflow-y:\s*auto;[^}]*overflow-x:\s*hidden;/s,
    );
  });

  it('keeps the footer outside the scrolling group', () => {
    expect(firstRule('.entry-nav-rail__footer')).toContain('flex: 0 0 auto');
  });

  it('keeps navigation targets at their usable size inside the short-height scroller', () => {
    expect(firstRule('.entry-nav-rail__btn')).toContain('flex: 0 0 38px');
  });
});
