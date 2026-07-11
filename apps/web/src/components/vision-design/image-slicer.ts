export const DEFAULT_SLICE_SIZE = 4096;
export const MAX_IMAGE_FILES = 5;
export const MAX_IMAGE_FILE_SIZE = 25 * 1024 * 1024;
export const MAX_TOTAL_IMAGE_FILE_SIZE = 64 * 1024 * 1024;
export const MAX_SLICE_COUNT = 2048;
export const MAX_TOTAL_SLICE_COUNT = 4096;
export const MAX_SOURCE_PIXELS = 32 * 1024 * 1024;
export const MAX_OUTPUT_PIXELS = 32 * 1024 * 1024;
export const MAX_TOTAL_OUTPUT_PIXELS = 64 * 1024 * 1024;
export const MAX_ZIP_BYTES = 128 * 1024 * 1024;
const MAX_IMAGE_HEADER_BYTES = 1024 * 1024;

export interface ImageDimensions {
  width: number;
  height: number;
}

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

function dimensions(width: number, height: number): ImageDimensions | null {
  return Number.isSafeInteger(width) && width > 0 && Number.isSafeInteger(height) && height > 0
    ? { width, height }
    : null;
}

function ascii(bytes: Uint8Array, start: number, length: number): string {
  return String.fromCharCode(...bytes.subarray(start, start + length));
}

export function parseSupportedImageDimensions(bytes: Uint8Array): ImageDimensions | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (
    bytes.length >= 24
    && bytes[0] === 0x89
    && ascii(bytes, 1, 3) === 'PNG'
    && ascii(bytes, 12, 4) === 'IHDR'
  ) {
    return dimensions(view.getUint32(16), view.getUint32(20));
  }
  if (bytes.length >= 10 && (ascii(bytes, 0, 6) === 'GIF87a' || ascii(bytes, 0, 6) === 'GIF89a')) {
    return dimensions(view.getUint16(6, true), view.getUint16(8, true));
  }
  if (bytes.length >= 26 && ascii(bytes, 0, 2) === 'BM') {
    return dimensions(Math.abs(view.getInt32(18, true)), Math.abs(view.getInt32(22, true)));
  }
  if (bytes.length >= 30 && ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 4) === 'WEBP') {
    const kind = ascii(bytes, 12, 4);
    if (kind === 'VP8X') {
      const width = 1 + bytes[24]! + (bytes[25]! << 8) + (bytes[26]! << 16);
      const height = 1 + bytes[27]! + (bytes[28]! << 8) + (bytes[29]! << 16);
      return dimensions(width, height);
    }
    if (kind === 'VP8 ' && bytes[23] === 0x9d && bytes[24] === 0x01 && bytes[25] === 0x2a) {
      return dimensions(view.getUint16(26, true) & 0x3fff, view.getUint16(28, true) & 0x3fff);
    }
    if (kind === 'VP8L' && bytes[20] === 0x2f) {
      const bits = view.getUint32(21, true);
      return dimensions((bits & 0x3fff) + 1, ((bits >>> 14) & 0x3fff) + 1);
    }
  }
  if (bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    const startOfFrameMarkers = new Set([
      0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf,
    ]);
    let offset = 2;
    while (offset + 3 < bytes.length) {
      while (offset < bytes.length && bytes[offset] === 0xff) offset += 1;
      const marker = bytes[offset++];
      if (marker == null || marker === 0xda || marker === 0xd9) break;
      if (marker === 0x00 || (marker >= 0xd0 && marker <= 0xd8)) continue;
      if (offset + 1 >= bytes.length) break;
      const segmentLength = view.getUint16(offset);
      if (segmentLength < 2 || offset + segmentLength > bytes.length) break;
      if (startOfFrameMarkers.has(marker) && segmentLength >= 7) {
        return dimensions(view.getUint16(offset + 5), view.getUint16(offset + 3));
      }
      offset += segmentLength;
    }
  }
  return null;
}

export function assertSourcePixelLimit(width: number, height: number): void {
  positiveInteger(width, '原图宽度');
  positiveInteger(height, '原图高度');
  if (width > Math.floor(MAX_SOURCE_PIXELS / height)) {
    throw new Error('原图不能超过 33.6 百万像素。');
  }
}

export async function readSupportedImageDimensions(file: File): Promise<ImageDimensions> {
  const header = new Uint8Array(
    await file.slice(0, Math.min(file.size, MAX_IMAGE_HEADER_BYTES)).arrayBuffer(),
  );
  const result = parseSupportedImageDimensions(header);
  if (!result) {
    throw new Error('无法安全读取图片尺寸，仅支持 PNG、JPEG、WebP、GIF 和 BMP。');
  }
  assertSourcePixelLimit(result.width, result.height);
  return result;
}

export function calculateSlicePlan(
  sourceWidth: number,
  sourceHeight: number,
  options: SlicePlanOptions = {},
): SlicePlan {
  positiveInteger(sourceWidth, '原图宽度');
  positiveInteger(sourceHeight, '原图高度');
  assertSourcePixelLimit(sourceWidth, sourceHeight);
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
  if (!Number.isSafeInteger(outputHeight) || outputWidth > Math.floor(MAX_OUTPUT_PIXELS / outputHeight)) {
    throw new Error('输出图片不能超过 33.6 百万像素，请降低目标宽度。');
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
