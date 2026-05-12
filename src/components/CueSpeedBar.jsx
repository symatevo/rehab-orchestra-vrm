// src/components/CueSpeedBar.jsx
// Vertical drag bar that controls how fast visual cues travel down the lane.
// Drag UP → faster cues. Drag DOWN → slower cues.
// Range: 0.3x (very slow) to 2.5x (very fast). Default 1.0x (normal).

import { useRef, useCallback } from 'react';
import { useGameStore } from '../hooks/useGameStore';

const BAR_H  = 120;
const MIN_MUL = 0.3;
const MAX_MUL = 2.5;

function mulToBarPct(mul) {
  return (mul - MIN_MUL) / (MAX_MUL - MIN_MUL);
}

export function CueSpeedBar() {
  const cueSpeedMultiplier    = useGameStore((s) => s.cueSpeedMultiplier ?? 1.0);
  const setCueSpeedMultiplier = useGameStore((s) => s.setCueSpeedMultiplier);

  const barRef = useRef(null);
  const barPct = mulToBarPct(cueSpeedMultiplier);

  const startDrag = useCallback((e) => {
    e.preventDefault();
    const bar = barRef.current;
    if (!bar) return;

    const onMove = (mv) => {
      const rect = bar.getBoundingClientRect();
      const pct  = 1 - (mv.clientY - rect.top) / rect.height;
      const clamped = Math.max(0, Math.min(1, pct));
      setCueSpeedMultiplier(MIN_MUL + clamped * (MAX_MUL - MIN_MUL));
    };

    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup',   onUp);
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup',   onUp);
  }, [setCueSpeedMultiplier]);

  return (
    <div style={{
      position: 'fixed', right: 84, top: '26%',
      zIndex: 40,
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
      background: 'rgba(0,0,0,0.50)',
      border: '1px solid rgba(251,191,36,0.22)',
      borderRadius: 12, padding: '8px 10px',
      pointerEvents: 'none',
    }}>
      <div style={{
        fontSize: 8, color: 'rgba(251,191,36,0.85)',
        fontWeight: 700, letterSpacing: 1.5, textTransform: 'uppercase',
        marginBottom: 2,
      }}>
        Speed
      </div>

      <div
        ref={barRef}
        onMouseDown={startDrag}
        style={{
          position: 'relative',
          width: 20, height: BAR_H,
          background: 'rgba(15,23,42,0.65)',
          border: '1px solid rgba(255,255,255,0.15)',
          borderRadius: 8,
          cursor: 'ns-resize',
          pointerEvents: 'auto',
        }}
      >
        {/* Fill */}
        <div style={{
          position: 'absolute', bottom: 0, left: 0, right: 0,
          height: `${barPct * 100}%`,
          borderRadius: 8,
          background: 'linear-gradient(to top, rgba(251,191,36,0.25), rgba(251,191,36,0.65))',
        }} />

        {/* Handle line */}
        <div style={{
          position: 'absolute',
          left: -4, right: -4,
          bottom: `${barPct * 100}%`,
          height: 3,
          background: 'rgba(251,191,36,0.9)',
          borderRadius: 2,
          boxShadow: '0 0 6px rgba(251,191,36,0.65)',
          pointerEvents: 'none',
        }}>
          <span style={{
            position: 'absolute', right: -34, top: -7,
            fontSize: 8, color: 'rgba(251,191,36,0.9)', fontWeight: 700,
            whiteSpace: 'nowrap', userSelect: 'none',
          }}>
            {cueSpeedMultiplier.toFixed(1)}x
          </span>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1, marginTop: 2 }}>
        <span style={{ fontSize: 7, color: 'rgba(255,255,255,0.35)' }}>fast</span>
        <span style={{ fontSize: 7, color: 'rgba(255,255,255,0.25)' }}>▲▼</span>
        <span style={{ fontSize: 7, color: 'rgba(255,255,255,0.35)' }}>slow</span>
      </div>
    </div>
  );
}
