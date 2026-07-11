import { describe, expect, it } from 'vitest';

import { BRAND_LOGO_CATEGORIES, MISANS_FONTS } from '../../../src/components/vision-design/BrandAssetsView';

describe('Vision Design brand asset catalogue', () => {
  it('keeps the committed single, combined, app and MiSans inventory', () => {
    expect(BRAND_LOGO_CATEGORIES.map((category) => [category.id, category.assets.length])).toEqual([
      ['single', 3],
      ['combined', 24],
      ['app', 2],
    ]);
    expect(MISANS_FONTS).toHaveLength(10);
    expect(MISANS_FONTS.map((font) => font.weight)).toEqual([100, 200, 300, 350, 400, 500, 600, 650, 700, 900]);
  });
});
