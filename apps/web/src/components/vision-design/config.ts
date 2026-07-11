export const DEFAULT_VISION_DESIGN_BASE_URL =
  'https://neoedon.github.io/vision-design-platform';

export const VISION_DESIGN_BASE_URL = (
  process.env.NEXT_PUBLIC_VISION_DESIGN_BASE_URL || DEFAULT_VISION_DESIGN_BASE_URL
).replace(/\/+$/, '');

function configuredDashboardUrl(value: string | undefined): string {
  const candidate = value?.trim();
  if (!candidate) return '';
  try {
    const url = new URL(candidate);
    const isLocalDevelopment = url.protocol === 'http:'
      && (url.hostname === '127.0.0.1' || url.hostname === 'localhost');
    return url.protocol === 'https:' || isLocalDevelopment ? url.toString() : '';
  } catch {
    return '';
  }
}

// Credential-bearing tools and internal documents are intentionally opt-in.
// Do not derive either URL from the public asset base: a public static origin
// is not an acceptable default trust boundary for Figma PATs or internal docs.
export const VISION_DESIGN_FIGMA_DASHBOARD_URL = configuredDashboardUrl(
  process.env.NEXT_PUBLIC_VISION_DESIGN_FIGMA_DASHBOARD_URL,
);

export const VISION_DESIGN_GUIDELINE_URL = configuredDashboardUrl(
  process.env.NEXT_PUBLIC_VISION_DESIGN_GUIDELINE_URL,
);

export function visionDesignAssetUrl(assetPath: string): string {
  const encodedPath = assetPath
    .replace(/^\/+/, '')
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');
  return `${VISION_DESIGN_BASE_URL}/${encodedPath}`;
}
