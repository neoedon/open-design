export const DEFAULT_VISION_DESIGN_BASE_URL =
  'https://neoedon.github.io/vision-design-platform';

export const VISION_DESIGN_BASE_URL = (
  process.env.NEXT_PUBLIC_VISION_DESIGN_BASE_URL || DEFAULT_VISION_DESIGN_BASE_URL
).replace(/\/+$/, '');

export function visionDesignAssetUrl(assetPath: string): string {
  const encodedPath = assetPath
    .replace(/^\/+/, '')
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');
  return `${VISION_DESIGN_BASE_URL}/${encodedPath}`;
}
