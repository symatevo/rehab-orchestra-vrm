// src/components/ResultsRoseRain.jsx
// Falling rose petals on the results screen (same as reference project).
import { useMemo } from 'react';

const ROSE_COUNT = 42;

export function ResultsRoseRain() {
  const roses = useMemo(() => {
    const out = [];
    let s = 777;
    const rnd = () => {
      s = (s * 1103515245 + 12345) & 0x7fffffff;
      return s / 0x7fffffff;
    };
    for (let i = 0; i < ROSE_COUNT; i++) {
      out.push({
        id: i,
        left:  rnd() * 100,
        delay: rnd() * 0.85,
        dur:   2.4 + rnd() * 2.2,
        drift: (rnd() - 0.5) * 140,
        size:  30 + rnd() * 44,
        rot:   rnd() * 720 - 360,
      });
    }
    return out;
  }, []);

  return (
    <div
      aria-hidden
      style={{ pointerEvents: 'none', position: 'fixed', inset: 0, zIndex: 71, overflow: 'hidden' }}
    >
      {roses.map((r) => (
        <img
          key={r.id}
          src="/rose.png"
          alt=""
          className="results-rose"
          style={{
            position: 'absolute',
            left:  `${r.left}%`,
            top:   '-14vh',
            width: `${r.size}px`,
            height: 'auto',
            opacity: 0.9,
            willChange: 'transform',
            animationDelay:    `${r.delay}s`,
            animationDuration: `${r.dur}s`,
            '--rose-drift': `${r.drift}px`,
            '--rose-rot':   `${r.rot}deg`,
          }}
        />
      ))}
    </div>
  );
}
