// src/components/HitLine.jsx
// Static horizontal hit line positioned near the avatar's hand.
// Contains a TARGET INDICATOR circle showing the NEXT incoming cue's movement.
// The hit line glows when a cue is in the hit zone.

import { MOVEMENT_MAP } from '../data/movements';

const TAG_COLORS = {
  easy:   '#22c55e',
  yellow: '#f59e0b',
};

/**
 * HitLine
 *
 * @prop {string}  side          — 'left' | 'right'
 * @prop {string}  nextArrow     — arrow symbol for the next cue
 * @prop {string}  nextTag       — 'easy' | 'yellow' for target indicator color
 * @prop {string}  nextMovementId — for rotation deg lookup
 * @prop {boolean} isActive      — true when a cue is in the hit zone (glow)
 */
export function HitLine({ side, nextArrow, nextTag = 'easy', nextMovementId, isActive }) {
  const movement = MOVEMENT_MAP[nextMovementId ?? ''];
  const rotDeg   = movement?.rotationDeg ?? 0;
  const tagColor = TAG_COLORS[nextTag] ?? TAG_COLORS.easy;

  const glowColor = isActive ? 'rgba(96, 165, 250, 0.85)' : 'rgba(96, 165, 250, 0.45)';
  const lineOpacity = isActive ? 1 : 0.75;

  return (
    <div
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 0,
        height: 6,
        transform: `translateX(${side === 'left' ? '2%' : '-2%'})`,
        background: `linear-gradient(to right, transparent, ${glowColor}, transparent)`,
        boxShadow: isActive ? '0 0 12px rgba(96,165,250,0.65)' : '0 0 6px rgba(96,165,250,0.28)',
        opacity: lineOpacity,
        transition: 'opacity 0.1s, background 0.1s',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 5,
        pointerEvents: 'none',
      }}
    >
      {/* Target indicator circle */}
      <div
        style={{
          position: 'absolute',
          width: 98,
          height: 98,
          borderRadius: '50%',
          border: `4px solid ${tagColor}`,
          background: 'radial-gradient(circle, rgba(15,23,42,0.58), rgba(15,23,42,0.88))',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          opacity: isActive ? 0.92 : 0.72,
          transition: 'opacity 0.1s',
          boxShadow: isActive
            ? `0 0 0 2px rgba(3,7,18,0.8), 0 0 16px ${tagColor}aa, 0 6px 12px rgba(0,0,0,0.35)`
            : `0 0 0 2px rgba(3,7,18,0.8), 0 0 10px ${tagColor}66`,
        }}
      >
        {nextArrow && (
          <span
            style={{
              fontSize: 42,
              fontWeight: 900,
              color: '#ffffff',
              opacity: 1,
              transform: rotDeg ? `rotate(${rotDeg}deg)` : undefined,
              lineHeight: 1,
              textShadow: '0 0 6px rgba(255,255,255,0.55), 0 1px 6px rgba(0,0,0,0.75)',
              userSelect: 'none',
            }}
          >
            {nextArrow}
          </span>
        )}
      </div>
    </div>
  );
}
