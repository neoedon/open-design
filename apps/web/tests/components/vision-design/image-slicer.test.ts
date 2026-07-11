import { describe, expect, it } from 'vitest';

import {
  calculateSlicePlan,
  parseSupportedImageDimensions,
} from '../../../src/components/vision-design/image-slicer';

describe('calculateSlicePlan', () => {
  it('splits a 5000 x 5000 image into four 4096-bounded tiles', () => {
    const plan = calculateSlicePlan(5000, 5000);
    expect(plan).toMatchObject({
      outputWidth: 5000,
      outputHeight: 5000,
      columns: 2,
      rows: 2,
      resized: false,
    });
    expect(plan.slices.map(({ width, height }) => [width, height])).toEqual([
      [4096, 4096],
      [904, 4096],
      [4096, 904],
      [904, 904],
    ]);
  });

  it('scales 790 x 1280 to 750 x 1215 using Math.floor before slicing', () => {
    const plan = calculateSlicePlan(790, 1280, { targetWidth: 750 });
    expect(plan).toMatchObject({
      outputWidth: 750,
      outputHeight: 1215,
      resized: true,
      columns: 1,
      rows: 1,
    });
  });

  it('rejects non-positive dimensions', () => {
    expect(() => calculateSlicePlan(0, 100)).toThrow('原图宽度');
    expect(() => calculateSlicePlan(100, 100, { maxSliceWidth: -1 })).toThrow('切片宽度');
  });

  it('rejects plans that would exhaust the browser or overflow ZIP entry counts', () => {
    expect(() => calculateSlicePlan(8193, 8192)).toThrow('百万像素');
    expect(() => calculateSlicePlan(46, 45, { maxSliceWidth: 1, maxSliceHeight: 1 })).toThrow(
      '最多生成 2048 张切片',
    );
    expect(calculateSlicePlan(45, 45, { maxSliceWidth: 1, maxSliceHeight: 1 }).slices).toHaveLength(2025);
  });

  it('reads dimensions from a PNG header before browser decoding', () => {
    const bytes = new Uint8Array(24);
    bytes.set([0x89, 0x50, 0x4e, 0x47], 0);
    bytes.set([0x49, 0x48, 0x44, 0x52], 12);
    const view = new DataView(bytes.buffer);
    view.setUint32(16, 5000);
    view.setUint32(20, 4000);

    expect(parseSupportedImageDimensions(bytes)).toEqual({ width: 5000, height: 4000 });
    expect(parseSupportedImageDimensions(new Uint8Array([1, 2, 3]))).toBeNull();
  });
});
