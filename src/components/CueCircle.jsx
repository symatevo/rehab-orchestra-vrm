// src/components/CueCircle.jsx
// Individual traveling cue circle.
//
// Position for directional (up/down) cues is JS-driven from songTime — matching
// the reference CueOverlay approach. This ensures the pop animation always starts
// from the cue's actual on-screen position (no snap-to-landing glitch).
// Close cues still use a CSS shrink animation (no position, just scale — no glitch).

import { memo } from 'react';
import { MOVEMENT_MAP } from '../data/movements';

const LAND_Y      = 34;   // hit zone — % from viewport bottom (must match CueLane)
const RING_BOTTOM = '44%';

const UP_FROM   = 12;   // UP cue spawns at 12% from bottom, travels to LAND_Y
const DOWN_FROM = 82;   // DOWN cue spawns at 82% from bottom, travels to LAND_Y

const UP_MOVEMENTS    = new Set(['wrist_up', 'wrist_up_hold', 'elbow_up', 'elbow_up_hold']);
const DOWN_MOVEMENTS  = new Set(['elbow_down', 'elbow_down_hold', 'wrist_down']);
const CLOSE_MOVEMENTS = new Set(['wrist_fist', 'wrist_open']);
const KIND_APPROACH   = { up: 'up', holdUp: 'up', down: 'down', holdDown: 'down', close: 'close' };

function getApproachType(movementId, kind) {
  if (kind && KIND_APPROACH[kind]) return KIND_APPROACH[kind];
  if (UP_MOVEMENTS.has(movementId))    return 'up';
  if (DOWN_MOVEMENTS.has(movementId))  return 'down';
  if (CLOSE_MOVEMENTS.has(movementId)) return 'close';
  return 'down';
}

function getMovementVisual(movement, kind) {
  if (kind === 'close') {
    return { fill: 'rgba(20,184,166,0.95)', ringColor: 'rgba(255,255,255,0.80)', isHold: false, isFistLike: true };
  }
  if (kind === 'up' || kind === 'holdUp') {
    return { fill: 'rgba(14,165,233,0.95)', ringColor: 'rgba(186,230,253,0.9)', isHold: kind === 'holdUp', isFistLike: false };
  }
  if (kind === 'down' || kind === 'holdDown') {
    return { fill: 'rgba(139,92,246,0.95)', ringColor: 'rgba(221,214,254,0.9)', isHold: kind === 'holdDown', isFistLike: false };
  }
  if (!movement) {
    return { fill: 'rgba(14,165,233,0.95)', ringColor: 'rgba(186,230,253,0.9)', isHold: false, isFistLike: false };
  }
  if (movement.hold) {
    const isDown = DOWN_MOVEMENTS.has(movement.id);
    return {
      fill:      isDown ? 'rgba(139,92,246,0.95)' : 'rgba(251,191,36,0.95)',
      ringColor: isDown ? 'rgba(221,214,254,0.9)'  : 'rgba(253,230,138,0.9)',
      isHold: true, isFistLike: false,
    };
  }
  const id = movement.id ?? '';
  if (CLOSE_MOVEMENTS.has(id)) return { fill: 'rgba(20,184,166,0.95)', ringColor: 'rgba(255,255,255,0.80)', isHold: false, isFistLike: true };
  if (DOWN_MOVEMENTS.has(id))  return { fill: 'rgba(139,92,246,0.95)', ringColor: 'rgba(221,214,254,0.9)',  isHold: false, isFistLike: false };
  return { fill: 'rgba(14,165,233,0.95)', ringColor: 'rgba(186,230,253,0.9)', isHold: false, isFistLike: false };
}

export const CueCircle = memo(function CueCircle({
  id,
  movementId,
  kind,
  tag,
  laneX,
  scheduledTime,
  songTime,        // current song time — drives JS position for directional cues
  mountSongTime,   // songTime captured at first appearance — used for close cue elapsed
  grade,
  landYBottom = LAND_Y,
  travelMs,
}) {
  const movement = MOVEMENT_MAP[movementId];
  const approach = getApproachType(movementId, kind);

  const arrow = kind === 'up'   || kind === 'holdUp'   ? '↑'
               : kind === 'down' || kind === 'holdDown' ? '↓'
               : kind === 'close'                       ? '✊'
               : (movement?.arrow ?? '?');
  const { fill, ringColor, isHold, isFistLike } = getMovementVisual(movement, kind);

  // Pop animation class (applied on grade; overrides travel)
  let popClass = '';
  if (grade) {
    if (isFistLike) {
      if (grade === 'perfect' || grade === 'good') popClass = 'animate-cue-fist-pop-perfect';
      else if (grade === 'late')                   popClass = 'animate-cue-fist-pop-late';
      else                                          popClass = 'animate-cue-fist-pop-miss';
    } else {
      if (grade === 'perfect' || grade === 'good') popClass = 'animate-cue-pop-perfect';
      else if (grade === 'late')                   popClass = 'animate-cue-pop-late';
      else                                          popClass = 'animate-cue-pop-miss';
    }
  }

  // ── CLOSE cue: fixed at ring, CSS shrink animation (no position glitch) ──────
  if (approach === 'close') {
    const spawnTime = scheduledTime - travelMs / 1000;
    const elapsed   = Math.round(Math.max(0, ((mountSongTime ?? songTime) - spawnTime) * 1000));
    const holding   = songTime < spawnTime;
    return (
      <div
        style={{
          position: 'absolute',
          left: `${laneX}%`,
          bottom: RING_BOTTOM,
          transform: 'translate(-50%, 50%)',
          pointerEvents: 'none',
          opacity: holding ? 0 : 1,
        }}
      >
        <div
          data-cue-id={id}
          className={popClass || undefined}
          style={{
            width: '4.75rem',
            height: '4.75rem',
            borderRadius: '50%',
            background: fill,
            boxShadow: `0 0 0 3px ${ringColor}, 0 4px 14px rgba(0,0,0,0.28)`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            willChange: 'transform',
            ...(!grade && {
              animationName:           'cue-close-shrink',
              animationDuration:       `${travelMs}ms`,
              animationTimingFunction: 'linear',
              animationFillMode:       'both',
              animationDelay:          `-${elapsed}ms`,
            }),
          }}
        >
          <span style={{ fontSize: '2.1rem', lineHeight: 1, filter: 'drop-shadow(0 1px 4px rgba(0,0,0,0.45))', userSelect: 'none' }}>
            {arrow}
          </span>
        </div>
      </div>
    );
  }

  // ── Directional cue: JS-driven position (mirrors reference CueOverlay) ────────
  // p slightly overshoots 1.0 (→ 1.12) so the cue sits a little past the ring
  // at hit time, matching reference behaviour and keeping it visible at grade time.
  const spawnTime = scheduledTime - travelMs / 1000;
  const travelSec = travelMs / 1000;
  const pRaw   = Math.min(1.12, Math.max(0, (songTime - spawnTime) / travelSec));
  const pPos   = Math.min(1, pRaw);
  const start  = approach === 'up' ? UP_FROM : DOWN_FROM;
  const y      = start + pPos * (landYBottom - start);
  const holding = songTime < spawnTime;

  const holdBars = (
    <span style={{ marginTop: 4, display: 'flex', alignItems: 'flex-end', gap: 4, pointerEvents: 'none' }}>
      <span style={{ width: 4, height: 10, borderRadius: 9999, background: 'rgba(255,255,255,0.95)', display: 'block' }} />
      <span style={{ width: 4, height: 16, borderRadius: 9999, background: 'rgba(255,255,255,0.95)', display: 'block' }} />
      <span style={{ width: 4, height: 10, borderRadius: 9999, background: 'rgba(255,255,255,0.95)', display: 'block' }} />
    </span>
  );

  const shapeStyle = isHold
    ? { minWidth: '6.25rem', minHeight: '4rem', padding: '10px 12px', borderRadius: 16 }
    : { width: '4.25rem', height: '4.25rem', borderRadius: '50%' };

  return (
    <div
      data-cue-id={id}
      className={popClass || undefined}
      style={{
        position: 'absolute',
        left: `${laneX}%`,
        bottom: `calc(${y}% + 1.75rem)`,
        transform: 'translateX(-50%)',
        background: fill,
        boxShadow: `0 0 0 3px ${ringColor}, 0 4px 14px rgba(0,0,0,0.28)`,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        pointerEvents: 'none',
        userSelect: 'none',
        opacity: holding ? 0 : 1,
        willChange: 'transform',
        ...shapeStyle,
        // Hold cue: pulsing box-shadow glow — animates a different property than
        // the pop class (transform/opacity), so they coexist without conflict.
        ...(isHold && !grade && {
          animationName:           'cue-hold-glow',
          animationDuration:       '1.15s',
          animationTimingFunction: 'ease-in-out',
          animationFillMode:       'none',
          animationDelay:          '0s',
          animationIterationCount: 'infinite',
        }),
      }}
    >
      <span style={{ fontSize: isFistLike ? '2.1rem' : '2.85rem', lineHeight: 1, fontWeight: 900, filter: 'drop-shadow(0 1px 4px rgba(0,0,0,0.45))', userSelect: 'none' }}>
        {arrow}
      </span>
      {isHold && holdBars}
    </div>
  );
});
