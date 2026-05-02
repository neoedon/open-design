import { useEffect, useMemo, useRef, useState } from 'react';
import { useT } from '../../i18n';
import { Icon } from '../Icon';
import type { PetConfig } from '../../types';
import { ambientLines, resolveActivePet } from './pets';
import { PetSpriteFace } from './PetSpriteFace';

interface Props {
  pet: PetConfig | undefined;
  onTuck: () => void;
  onOpenSettings: () => void;
}

const STORAGE_KEY = 'open-design:pet-position';

interface Position {
  // Distances from the right/bottom of the viewport so the overlay
  // sticks to the corner across resizes. Saved in localStorage.
  right: number;
  bottom: number;
}

const DEFAULT_POSITION: Position = { right: 24, bottom: 24 };

function loadPosition(): Position {
  if (typeof window === 'undefined') return DEFAULT_POSITION;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_POSITION;
    const parsed = JSON.parse(raw) as Partial<Position>;
    return {
      right: typeof parsed.right === 'number' ? parsed.right : DEFAULT_POSITION.right,
      bottom: typeof parsed.bottom === 'number' ? parsed.bottom : DEFAULT_POSITION.bottom,
    };
  } catch {
    return DEFAULT_POSITION;
  }
}

function savePosition(p: Position) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(p));
  } catch {
    /* ignore */
  }
}

// Compact floating sprite + speech bubble. Rendered at the document
// root via App.tsx so it stays put when the user navigates between
// the entry and project views.
export function PetOverlay({ pet, onTuck, onOpenSettings }: Props) {
  const t = useT();
  const active = useMemo(() => resolveActivePet(pet), [pet]);
  const [bubbleOpen, setBubbleOpen] = useState(false);
  const [ambientIdx, setAmbientIdx] = useState(0);
  const [position, setPosition] = useState<Position>(() => loadPosition());
  const dragRef = useRef<{
    startX: number;
    startY: number;
    startRight: number;
    startBottom: number;
    moved: boolean;
  } | null>(null);

  // Show the greeting briefly the first time the overlay mounts after a
  // wake. Auto-tuck the bubble after 4s so it does not linger forever.
  useEffect(() => {
    if (!active) return;
    setBubbleOpen(true);
    const id = window.setTimeout(() => setBubbleOpen(false), 4000);
    return () => window.clearTimeout(id);
  }, [active?.id]);

  useEffect(() => {
    savePosition(position);
  }, [position]);

  const lines = useMemo(
    () => (active ? [active.greeting, ...ambientLines(active.name)] : []),
    [active],
  );
  const visibleLine = lines.length > 0 ? lines[ambientIdx % lines.length] : '';

  if (!active) return null;

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    const target = event.currentTarget;
    target.setPointerCapture(event.pointerId);
    dragRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      startRight: position.right,
      startBottom: position.bottom,
      moved: false,
    };
  };

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;
    if (!drag.moved && Math.abs(dx) + Math.abs(dy) < 4) return;
    drag.moved = true;
    // Convert pointer movement into right/bottom offsets so the sprite
    // tracks the cursor while staying anchored to the corner system.
    const nextRight = Math.max(8, Math.min(window.innerWidth - 80, drag.startRight - dx));
    const nextBottom = Math.max(8, Math.min(window.innerHeight - 80, drag.startBottom - dy));
    setPosition({ right: nextRight, bottom: nextBottom });
  };

  const onPointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    dragRef.current = null;
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      /* ignore */
    }
    // A tap (no drag) toggles the speech bubble and rotates the line.
    if (drag && !drag.moved) {
      setBubbleOpen((open) => {
        const next = !open;
        if (next) setAmbientIdx((i) => (i + 1) % Math.max(1, lines.length));
        return next;
      });
    }
  };

  return (
    <div
      className="pet-overlay"
      role="complementary"
      aria-label={t('pet.overlayAria')}
      style={{
        right: position.right,
        bottom: position.bottom,
        // The accent drives the halo, the bubble border, and the focus
        // ring on the action buttons via CSS custom property cascade.
        ['--pet-accent' as string]: active.accent,
      }}
    >
      {bubbleOpen ? (
        <div className="pet-bubble" role="status">
          <div className="pet-bubble-name">{active.name}</div>
          <div className="pet-bubble-line">{visibleLine}</div>
          <div className="pet-bubble-actions">
            <button
              type="button"
              className="pet-bubble-btn"
              onClick={onOpenSettings}
              title={t('pet.settingsTitle')}
            >
              <Icon name="settings" size={12} />
              <span>{t('pet.changePet')}</span>
            </button>
            <button
              type="button"
              className="pet-bubble-btn"
              onClick={onTuck}
              title={t('pet.tuckTitle')}
            >
              <Icon name="close" size={12} />
              <span>{t('pet.tuck')}</span>
            </button>
          </div>
        </div>
      ) : null}
      <div
        className="pet-sprite"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        title={t('pet.spriteTitle', { name: active.name })}
        aria-label={t('pet.spriteAria', { name: active.name })}
        style={{
          ['--pet-anim' as string]: `pet-${active.animation}`,
        }}
      >
        <PetSpriteFace active={active} className="pet-sprite-glyph" />
        <span className="pet-sprite-shadow" aria-hidden />
      </div>
    </div>
  );
}
