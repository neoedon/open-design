export type FigmaDashboardViewMode = 'map' | 'changelog';

export function cssColorToHex(value: string): string | null {
  const trimmed = value.trim();
  if (/^#[0-9a-f]{6}$/i.test(trimmed)) return trimmed.toUpperCase();
  if (/^#[0-9a-f]{3}$/i.test(trimmed)) {
    return `#${trimmed.slice(1).split('').map((part) => `${part}${part}`).join('')}`.toUpperCase();
  }
  const channels = trimmed.match(/^rgba?\(\s*(\d+(?:\.\d+)?)\D+(\d+(?:\.\d+)?)\D+(\d+(?:\.\d+)?)(?:\D+[\d.]+)?\s*\)$/i);
  if (!channels) return null;
  const hex = channels.slice(1, 4).map((part) => Math.max(0, Math.min(255, Math.round(Number(part)))).toString(16).padStart(2, '0')).join('');
  return `#${hex}`.toUpperCase();
}

export function computedTokenHex(styles: CSSStyleDeclaration, name: string, fallback: string): string {
  return cssColorToHex(styles.getPropertyValue(name)) ?? fallback;
}

export function mixHexColors(foreground: string, background: string, foregroundRatio: number): string {
  const ratio = Math.max(0, Math.min(1, foregroundRatio));
  const parse = (value: string) => {
    const normalized = cssColorToHex(value);
    if (!normalized) throw new Error(`Unsupported color: ${value}`);
    return [1, 3, 5].map((offset) => Number.parseInt(normalized.slice(offset, offset + 2), 16));
  };
  const foregroundChannels = parse(foreground);
  const backgroundChannels = parse(background);
  const mixed = foregroundChannels.map((channel, index) => Math.round(
    channel * ratio + backgroundChannels[index]! * (1 - ratio),
  ));
  return `#${mixed.map((channel) => channel.toString(16).padStart(2, '0')).join('')}`.toUpperCase();
}
