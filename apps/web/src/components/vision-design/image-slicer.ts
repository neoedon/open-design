export const DEFAULT_SLICE_SIZE = 4096;
export const MAX_IMAGE_FILES = 5;
export const MAX_IMAGE_FILE_SIZE = 50 * 1024 * 1024;
export const MAX_SLICE_COUNT = 2048;
export const MAX_OUTPUT_PIXELS = 8192 * 8192;

export interface SlicePlanOptions {
  targetWidth?: number | null;
  maxSliceWidth?: number;
  maxSliceHeight?: number;
}

export interface SlicePlanItem {
  row: number;
  column: number;
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
}

export interface SlicePlan {
  sourceWidth: number;
  sourceHeight: number;
  outputWidth: number;
  outputHeight: number;
  resized: boolean;
  columns: number;
  rows: number;
  slices: SlicePlanItem[];
}

function positiveInteger(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${label}必须是大于 0 的整数。`);
  }
  return value;
}

export function calculateSlicePlan(
  sourceWidth: number,
  sourceHeight: number,
  options: SlicePlanOptions = {},
): SlicePlan {
  positiveInteger(sourceWidth, '原图宽度');
  positiveInteger(sourceHeight, '原图高度');
  const maxSliceWidth = positiveInteger(
    options.maxSliceWidth ?? DEFAULT_SLICE_SIZE,
    '切片宽度',
  );
  const maxSliceHeight = positiveInteger(
    options.maxSliceHeight ?? DEFAULT_SLICE_SIZE,
    '切片高度',
  );
  const targetWidth = options.targetWidth ?? null;
  if (targetWidth !== null) positiveInteger(targetWidth, '目标宽度');

  const outputWidth = targetWidth ?? sourceWidth;
  const outputHeight = targetWidth === null
    ? sourceHeight
    : Math.floor(sourceHeight * (targetWidth / sourceWidth));
  if (outputHeight < 1) throw new Error('缩放后高度小于 1px，请增大目标宽度。');
  if (outputWidth * outputHeight > MAX_OUTPUT_PIXELS) {
    throw new Error('输出图片不能超过 67.1 百万像素，请降低目标宽度。');
  }

  const columns = Math.ceil(outputWidth / maxSliceWidth);
  const rows = Math.ceil(outputHeight / maxSliceHeight);
  if (columns * rows > MAX_SLICE_COUNT) {
    throw new Error(`单张图片最多生成 ${MAX_SLICE_COUNT} 张切片，请增大切片宽高。`);
  }
  const slices: SlicePlanItem[] = [];

  for (let row = 0; row < rows; row += 1) {
    const top = row * maxSliceHeight;
    const bottom = Math.min((row + 1) * maxSliceHeight, outputHeight);
    for (let column = 0; column < columns; column += 1) {
      const left = column * maxSliceWidth;
      const right = Math.min((column + 1) * maxSliceWidth, outputWidth);
      slices.push({
        row,
        column,
        left,
        top,
        right,
        bottom,
        width: right - left,
        height: bottom - top,
      });
    }
  }

  return {
    sourceWidth,
    sourceHeight,
    outputWidth,
    outputHeight,
    resized: targetWidth !== null,
    columns,
    rows,
    slices,
  };
}
