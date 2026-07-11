import { describe, expect, it } from 'vitest';

import { cssColorToHex, mixHexColors } from '../../../src/components/vision-design/figma-dashboard';

describe('cssColorToHex', () => {
  it('normalizes short, long, rgb and rgba colors', () => {
    expect(cssColorToHex('#abc')).toBe('#AABBCC');
    expect(cssColorToHex('#c96442')).toBe('#C96442');
    expect(cssColorToHex('rgb(26, 25, 22)')).toBe('#1A1916');
    expect(cssColorToHex('rgba(37, 99, 235, 0.16)')).toBe('#2563EB');
  });

  it('rejects unsupported color syntax', () => {
    expect(cssColorToHex('transparent')).toBeNull();
    expect(cssColorToHex('color-mix(in srgb, red, blue)')).toBeNull();
  });

  it('builds an opaque soft accent against the live surface', () => {
    expect(mixHexColors('#C96442', '#FDFCFA', 0.12)).toBe('#F7EAE4');
    expect(mixHexColors('#D97A56', '#222120', 0.12)).toBe('#382C26');
  });
});
