import type { CSSProperties } from 'react';
import type { ResolvedPet } from './pets';

interface Props {
  active: ResolvedPet;
  className?: string;
  // Optional explicit pixel size; the overlay leaves it unset and
  // inherits container metrics, while the rail / settings preview
  // pin a concrete size to keep the cell shape consistent.
  size?: number;
}

// Renders the pet's face. Three cases:
//
//   1. No imageUrl — just the emoji glyph (legacy / built-ins).
//   2. imageUrl + frames === 1 — single static image, same float
//      animation as the emoji glyph (driven by --pet-anim on the
//      sprite parent).
//   3. imageUrl + frames > 1 — horizontal spritesheet, walked through
//      with a CSS `steps()` animation. We compute the inline animation
//      string here so each pet can have its own frame count / fps
//      without needing pre-baked CSS classes per frame combo.
export function PetSpriteFace({ active, className, size }: Props) {
  if (!active.imageUrl) {
    const style: CSSProperties | undefined = size
      ? { fontSize: Math.round(size * 0.85), width: size, height: size, lineHeight: 1 }
      : undefined;
    return (
      <span className={className} aria-hidden style={style}>
        {active.glyph}
      </span>
    );
  }
  const frames = Math.max(1, active.frames ?? 1);
  const fps = Math.max(1, active.fps ?? 6);
  const durationMs = Math.round((frames / fps) * 1000);
  if (frames === 1) {
    return (
      <span
        className={`${className ?? ''} pet-image static`.trim()}
        aria-hidden
        style={{
          backgroundImage: `url(${active.imageUrl})`,
          width: size,
          height: size,
        }}
      />
    );
  }
  return (
    <span
      className={`${className ?? ''} pet-image frames`.trim()}
      aria-hidden
      style={{
        backgroundImage: `url(${active.imageUrl})`,
        backgroundSize: `${frames * 100}% 100%`,
        // Inline animation string lets each pet pick its own step count
        // without needing one CSS class per (frames, fps) combo.
        animation: `pet-frames ${durationMs}ms steps(${frames}) infinite`,
        width: size,
        height: size,
      }}
    />
  );
}
