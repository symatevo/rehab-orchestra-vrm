// src/components/SessionProgressBar.jsx
// Top-center progress bar matching reference design.
// Fills as the patient hits cues; sparkles inside the liquid fill.
// "Fever" mode (6+ streak) enlarges the bar and adds bonus sparkles.

import { useMemo } from 'react';
import { useGameStore } from '../hooks/useGameStore';

const SPARKLE_BASE  = 8;
const SPARKLE_BONUS = 10;

function SparkleField({ count, seed, intense }) {
  const items = useMemo(() => {
    const out = [];
    let s = seed;
    const rnd = () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
    for (let i = 0; i < count; i++) {
      out.push({
        id: i,
        left:  rnd() * 100,
        top:   rnd() * 100,
        delay: rnd() * 2.4,
        dur:   1.2 + rnd() * 1.6,
        size:  2.5 * (0.35 + rnd() * 0.85),
      });
    }
    return out;
  }, [count, seed]);

  return (
    <div
      aria-hidden
      style={{
        pointerEvents: 'none', position: 'absolute', inset: 0,
        overflow: 'hidden', borderRadius: 'inherit',
        opacity: intense ? 1 : 0.9, mixBlendMode: 'screen',
      }}
    >
      {items.map((p) => (
        <span
          key={p.id}
          className="session-progress-sparkle"
          style={{
            position: 'absolute',
            left: `${p.left}%`,
            top:  `${p.top}%`,
            width:  `${p.size}px`,
            height: `${p.size}px`,
            borderRadius: '50%',
            background: 'white',
            boxShadow: '0 0 6px 2px rgba(255,255,255,0.85)',
            animationDelay:    `${p.delay}s`,
            animationDuration: `${p.dur}s`,
          }}
        />
      ))}
    </div>
  );
}

export function SessionProgressBar({ totalCues }) {
  const hitCount    = useGameStore((s) => s.hitCount);
  const streakCount = useGameStore((s) => s.streakCount);
  const fever = streakCount >= 6;
  const fill  = totalCues > 0 ? Math.min(100, (hitCount / totalCues) * 100) : 0;

  return (
    <div
      aria-hidden
      style={{
        pointerEvents: 'none',
        position: 'fixed',
        left: '50%',
        top: 'max(0.95rem, env(safe-area-inset-top))',
        zIndex: 56,
        width: 'min(72vw, 14rem)',
        transform: `translateX(-50%) scale(${fever ? 1.04 : 1})`,
        transition: 'transform 0.5s ease-out',
        filter: fever ? 'drop-shadow(0 8px 18px rgba(251,146,60,0.4))' : 'none',
      }}
    >
      <div style={{
        position: 'relative', overflow: 'hidden',
        borderRadius: 8, border: '1px solid rgba(255,255,255,0.25)',
        background: 'rgba(15,23,42,0.35)',
        padding: '5px 6px',
        boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
        backdropFilter: 'blur(12px)',
      }}>
        <div style={{
          position: 'relative', height: 10, borderRadius: 6,
          background: 'rgba(2,6,23,0.7)',
          boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.1)',
          overflow: 'hidden',
        }}>
          <div
            className="session-progress-liquid"
            style={{
              position: 'absolute', inset: '0 auto 0 0',
              borderRadius: 6, width: `${fill}%`,
              transition: 'width 0.3s ease-out',
            }}
          />
          <SparkleField count={SPARKLE_BASE}  seed={41}  intense={false} />
          {fever && <SparkleField count={SPARKLE_BONUS} seed={902} intense />}
        </div>
      </div>
    </div>
  );
}
