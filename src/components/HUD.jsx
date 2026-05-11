// src/components/HUD.jsx
// In-game HUD: pause button, cue lanes, streak badge, streak sparkles.
// The SessionProgressBar (top-center liquid fill) is rendered by App.jsx independently.

import { useEffect, useMemo } from 'react';
import { useGameStore } from '../hooks/useGameStore';
import { CueLane } from './CueLane';

// ── Streak sparkles (≥ 6 streak) — reference SessionWideSparkles ─────────────
// 20 particles, GPU-composited (will-change: transform), minimal DOM cost.
function StreakSparkles() {
  const streakCount = useGameStore((s) => s.streakCount);
  const active = streakCount >= 6;

  const particles = useMemo(() => {
    const out = [];
    let s = 7919;
    const rnd = () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
    const COLORS = ['#fbbf24', '#60a5fa', '#34d399', '#f472b6', '#a78bfa', '#fb7185'];
    for (let i = 0; i < 20; i++) {
      out.push({
        id:    i,
        left:  4 + rnd() * 92,
        top:   4 + rnd() * 92,
        delay: rnd() * 2.4,
        dur:   1.0 + rnd() * 1.2,
        size:  5 + rnd() * 8,
        color: COLORS[i % COLORS.length],
      });
    }
    return out;
  }, []);

  if (!active) return null;

  return (
    <div aria-hidden style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 52 }}>
      {particles.map((p) => (
        <span
          key={p.id}
          className="animate-streak-sparkle"
          style={{
            position:     'absolute',
            left:         `${p.left}%`,
            top:          `${p.top}%`,
            width:        `${p.size}px`,
            height:       `${p.size}px`,
            borderRadius: '50%',
            background:   p.color,
            boxShadow:    `0 0 ${p.size * 2}px ${p.size * 0.8}px ${p.color}99`,
            willChange:   'transform, opacity',
            '--ss-dur':   `${p.dur}s`,
            '--ss-delay': `${p.delay}s`,
          }}
        />
      ))}
    </div>
  );
}

export function HUD({ allCues = [], songTime = 0, songDuration = 180, timingWindowMs, cueGrades = {}, onPause }) {
  const { streakCount } = useGameStore();

  // ESC → pause
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onPause?.(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onPause]);

  return (
    <>
    <StreakSparkles />
    <div style={{
      position: 'fixed', inset: 0,
      pointerEvents: 'none', zIndex: 50,
      fontFamily: 'system-ui, Inter, sans-serif',
    }}>
      {/* Pause button — top right */}
      <button
        onClick={onPause}
        style={{
          position: 'absolute', top: 12, right: 16,
          width: 44, height: 44,
          background: 'rgba(255,255,255,0.15)',
          backdropFilter: 'blur(8px)',
          border: '1px solid rgba(255,255,255,0.3)',
          borderRadius: 10, color: '#ffffff', fontSize: 20,
          cursor: 'pointer', display: 'flex',
          alignItems: 'center', justifyContent: 'center',
          pointerEvents: 'auto', zIndex: 60,
        }}
      >⏸</button>

      {/* Left cue lane */}
      <CueLane
        side="left"
        laneX={45.65}
        allCues={allCues}
        songTime={songTime}
        timingWindowMs={timingWindowMs}
        cueGrades={cueGrades}
      />

      {/* Right cue lane */}
      <CueLane
        side="right"
        laneX={54.35}
        allCues={allCues}
        songTime={songTime}
        timingWindowMs={timingWindowMs}
        cueGrades={cueGrades}
      />

      {/* Streak badge */}
      {streakCount >= 5 && (
        <div style={{
          position: 'absolute', bottom: 32, left: '50%',
          transform: 'translateX(-50%)',
          background: streakCount >= 6 ? 'rgba(251,146,60,0.95)' : 'rgba(245,158,11,0.9)',
          backdropFilter: 'blur(8px)',
          borderRadius: 20, padding: '6px 18px',
          color: '#ffffff', fontSize: 13, fontWeight: 700,
          letterSpacing: 0.5,
          boxShadow: streakCount >= 6
            ? '0 0 24px rgba(251,146,60,0.7), 0 0 8px rgba(255,200,50,0.5)'
            : '0 0 16px rgba(245,158,11,0.5)',
        }}>
          🔥 {streakCount} streak!
        </div>
      )}
    </div>
    </>
  );
}
