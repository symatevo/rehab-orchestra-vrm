// src/components/PoseBar.jsx
// Vertical expression bars on the right edge — shows per-side arm height (expr01).
// The two threshold lines are draggable: drag UP line to change minimum height for
// UP detection; drag DOWN line to change maximum height for DOWN detection.

import { useEffect, useRef, useState, useCallback } from 'react';
import { useGameStore } from '../hooks/useGameStore';

const BAR_H = 120;  // px — must match the rendered bar height

export function PoseBar({ poseStateRef }) {
  const { romThresholds, setROMThresholds } = useGameStore();

  const [vals, setVals] = useState({ left: 0.5, right: 0.5 });

  // Threshold values (0–1, fraction of bar height from bottom)
  const [upThresh,   setUpThresh]   = useState(() => romThresholds?.elbow_up_expr   ?? 0.57);
  const [downThresh, setDownThresh] = useState(() => romThresholds?.elbow_down_disp ?? 0.38);

  // Sync thresholds to the store — called only on mouseup to avoid flooding
  // the Zustand store (and all its subscribers) on every mousemove at 60fps.
  const syncToStore = useCallback((up, down) => {
    setROMThresholds({
      ...romThresholds,
      elbow_up_expr:   up,
      elbow_down_disp: down,
      elbow_down_expr: Math.max(0.05, down - 0.18),
    });
  }, [setROMThresholds, romThresholds]); // eslint-disable-line react-hooks/exhaustive-deps

  // 80ms interval — enough for smooth visual without 60fps re-renders
  useEffect(() => {
    const id = setInterval(() => {
      const ps = poseStateRef?.current;
      if (ps) {
        setVals(prev => {
          const nl = ps.left?.expr01  ?? 0.5;
          const nr = ps.right?.expr01 ?? 0.5;
          if (Math.abs(nl - prev.left) < 0.01 && Math.abs(nr - prev.right) < 0.01) return prev;
          return { left: nl, right: nr };
        });
      }
    }, 80);
    return () => clearInterval(id);
  }, [poseStateRef]);

  // ── Drag logic ────────────────────────────────────────────────────────────────
  const barRef = useRef(null);

  const startDrag = useCallback((e, which) => {
    e.preventDefault();
    const bar = barRef.current;
    if (!bar) return;

    // Use a ref to track the latest value so onUp can sync to the store once
    const latestVal = { current: which === 'up' ? upThresh : downThresh };

    const onMove = (mv) => {
      const rect = bar.getBoundingClientRect();
      const pct = 1 - (mv.clientY - rect.top) / rect.height;
      const clamped = Math.max(0.05, Math.min(0.97, pct));
      latestVal.current = clamped;
      // Update local React state (visual only, no store write)
      if (which === 'up')   setUpThresh(clamped);
      if (which === 'down') setDownThresh(clamped);
    };

    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup',   onUp);
      // Single store write on release — avoids 60fps Zustand updates during drag
      const up   = which === 'up'   ? latestVal.current : upThresh;
      const down = which === 'down' ? latestVal.current : downThresh;
      syncToStore(up, down);
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup',   onUp);
  }, [upThresh, downThresh, syncToStore]);

  return (
    <div style={{
      position: 'fixed', right: 14, top: '26%',
      zIndex: 40,
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
      background: 'rgba(0,0,0,0.50)',
      border: '1px solid rgba(56,189,248,0.22)',
      borderRadius: 12, padding: '8px 10px',
      // container itself is non-interactive; individual elements opt-in
      pointerEvents: 'none',
    }}>
      <div style={{
        fontSize: 8, color: 'rgba(186,230,253,0.85)',
        fontWeight: 700, letterSpacing: 1.5, textTransform: 'uppercase',
        marginBottom: 2,
      }}>
        Conduct
      </div>

      {/* Shared draggable threshold area — sits behind bars, captures drags */}
      <div
        ref={barRef}
        style={{
          position: 'relative',
          width: '100%', height: BAR_H,
          display: 'flex', alignItems: 'flex-end', justifyContent: 'center', gap: 8,
          pointerEvents: 'none',
        }}
      >
        <BarColumn value={vals.left}  label="L" color="#34d399" glowColor="rgba(52,211,153,0.8)"  />
        <BarColumn value={vals.right} label="R" color="#60a5fa" glowColor="rgba(96,165,250,0.8)" />

        {/* ── UP threshold line — draggable ── */}
        <div
          title={`UP threshold: ${Math.round(upThresh * 100)}% — drag to adjust`}
          onMouseDown={(e) => startDrag(e, 'up')}
          style={{
            position: 'absolute',
            left: -4, right: -4,
            bottom: `${upThresh * 100}%`,
            height: 3,
            background: 'rgba(56,189,248,0.85)',
            borderRadius: 2,
            cursor: 'ns-resize',
            pointerEvents: 'auto',
            zIndex: 10,
            boxShadow: '0 0 6px rgba(56,189,248,0.6)',
          }}
        >
          <span style={{
            position: 'absolute', right: -22, top: -7,
            fontSize: 8, color: 'rgba(56,189,248,0.9)', fontWeight: 700,
            whiteSpace: 'nowrap', userSelect: 'none',
          }}>
            ↑{Math.round(upThresh * 100)}%
          </span>
        </div>

        {/* ── DOWN threshold line — draggable ── */}
        <div
          title={`DOWN threshold: ${Math.round(downThresh * 100)}% — drag to adjust`}
          onMouseDown={(e) => startDrag(e, 'down')}
          style={{
            position: 'absolute',
            left: -4, right: -4,
            bottom: `${downThresh * 100}%`,
            height: 3,
            background: 'rgba(139,92,246,0.85)',
            borderRadius: 2,
            cursor: 'ns-resize',
            pointerEvents: 'auto',
            zIndex: 10,
            boxShadow: '0 0 6px rgba(139,92,246,0.5)',
          }}
        >
          <span style={{
            position: 'absolute', right: -22, top: -7,
            fontSize: 8, color: 'rgba(139,92,246,0.9)', fontWeight: 700,
            whiteSpace: 'nowrap', userSelect: 'none',
          }}>
            ↓{Math.round(downThresh * 100)}%
          </span>
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', marginTop: 2 }}>
        <span style={{ fontSize: 8, color: 'rgba(255,255,255,0.4)' }}>low</span>
        <span style={{ fontSize: 8, color: 'rgba(255,255,255,0.4)' }}>high</span>
      </div>
    </div>
  );
}

function BarColumn({ value, label, color, glowColor }) {
  const pct = Math.round(Math.max(0, Math.min(1, value)) * 100);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
      <div style={{
        position: 'relative', width: 12, height: BAR_H,
        background: 'rgba(15,23,42,0.65)',
        border: '1px solid rgba(255,255,255,0.15)',
        borderRadius: 8, overflow: 'visible',
      }}>
        {/* Fill bar */}
        <div style={{
          position: 'absolute', bottom: 0, left: 0, right: 0,
          height: `${pct}%`,
          borderRadius: 8,
          background: `linear-gradient(to top, ${color}44, ${color}cc)`,
          transition: 'height 55ms linear',
          overflow: 'hidden',
        }} />
        {/* Indicator dot */}
        <div style={{
          position: 'absolute',
          bottom: `calc(${pct}% - 2px)`,
          left: -2, right: -2,
          height: 4, borderRadius: 9999,
          background: color,
          boxShadow: `0 0 8px 2px ${glowColor}`,
          transition: 'bottom 55ms linear',
        }} />
      </div>
      <div style={{ fontSize: 9, color: 'rgba(186,230,253,0.7)', fontWeight: 700 }}>{label}</div>
    </div>
  );
}
