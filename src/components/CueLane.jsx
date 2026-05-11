// src/components/CueLane.jsx
// One cue lane rendered as a full-viewport overlay.

import { useEffect, useMemo, useRef, useState } from 'react';
import { CueCircle } from './CueCircle';

// CueCircle uses CSS animations so it only needs a stable mountSongTime (the songTime
// at the moment the cue first entered the viewport). We track that here so CueCircle
// never receives a changing songTime prop and React.memo can bail out between hits.


const DEFAULT_TRAVEL_S = 1.85;  // fallback when cue.travel is unset
const LAND_Y_BOTTOM = 34;   // hit-zone center: 34% from viewport bottom
const RING_BOTTOM   = 44;   // dashed ring CSS bottom %
// Keep a graded cue in the DOM just long enough for the pop animation (longest = 0.44s)
const POP_LINGER_S  = 0.55;

export function CueLane({
  side,
  laneX = 50,
  allCues = [],
  songTime,
  timingWindowMs = 900,
  cueGrades = {},
}) {
  // Stable snapshot of songTime at the moment each cue first became visible.
  // This lets CueCircle compute its CSS animation-delay once at mount and never
  // need songTime again — React.memo then prevents position-driven re-renders.
  const mountTimesRef = useRef({});

  // ── Visible cues (travelling + briefly lingering after grade) ───────────────
  const visibleCues = useMemo(() => {
    return allCues.filter((cue) => {
      if (cue.side !== side && cue.side !== 'both') return false;
      const travelSec   = cue.travel ?? DEFAULT_TRAVEL_S;
      const spawnTime   = cue.time - travelSec;
      const graded      = !!cueGrades[cue.id];
      const despawnTime = graded ? cue.time + POP_LINGER_S : cue.time + 1.0;
      const visible     = songTime >= spawnTime && songTime <= despawnTime;
      // Capture the songTime on first appearance so CueCircle gets a stable value
      if (visible && mountTimesRef.current[cue.id] === undefined) {
        mountTimesRef.current[cue.id] = songTime;
      }
      return visible;
    });
  }, [allCues, side, songTime, cueGrades]);

  // ── Grade flash entries + fist FX trigger ───────────────────────────────────
  const [flashes,  setFlashes]  = useState([]);
  const [fistFxAt, setFistFxAt] = useState(0);
  const seenGrades = useRef(new Set());

  useEffect(() => {
    const newEntries = [];
    for (const [cueId, grade] of Object.entries(cueGrades)) {
      const cue = allCues.find((c) => c.id === cueId && (c.side === side || c.side === 'both'));
      if (cue && !seenGrades.current.has(cueId)) {
        seenGrades.current.add(cueId);
        newEntries.push({ key: `${cueId}-${grade}`, grade });
        // Fist FX: amber ring flash when a fist cue is hit (reference CueOverlay fistFxAt)
        if (cue.movementId === 'wrist_fist' || cue.kind === 'close') {
          if (grade === 'perfect' || grade === 'good') setFistFxAt(performance.now());
        }
      }
    }
    if (newEntries.length === 0) return;
    setFlashes((prev) => [...prev, ...newEntries]);
    const timer = setTimeout(() => {
      const keys = new Set(newEntries.map((e) => e.key));
      setFlashes((prev) => prev.filter((f) => !keys.has(f.key)));
    }, 850);
    return () => clearTimeout(timer);
  }, [cueGrades, allCues, side]);

  // ── Perfect/good hit burst (shockwave + 8 particles) ────────────────────────
  const burstCue = useMemo(
    () => visibleCues.find((c) => {
      const g = cueGrades[c.id];
      // Only burst for non-fist cues (fist gets its own FX)
      const isFist = c.movementId === 'wrist_fist' || c.kind === 'close';
      return !isFist && (g === 'perfect' || g === 'good');
    }),
    [visibleCues, cueGrades]
  );

  // Fist FX visible for 360ms (reference duration)
  const fistFxVisible = (performance.now() - fistFxAt) < 360;

  return (
    <div style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 50 }}>

      {/* ── Lane guide line ── */}
      <div style={{
        position: 'absolute', left: `${laneX}%`, bottom: `${LAND_Y_BOTTOM}%`,
        height: 'min(38vh, 300px)', width: 2,
        background: 'linear-gradient(to top, rgba(56,189,248,0.9), rgba(186,230,253,0.7), transparent)',
        transform: 'translateX(-50%)',
      }} />

      {/* ── Dashed hit-zone ring ── */}
      <div style={{
        position: 'absolute', left: `${laneX}%`, bottom: `${RING_BOTTOM}%`,
        width: '4.75rem', height: '4.75rem', borderRadius: '50%',
        border: '2px dashed rgba(224,242,254,0.95)',
        background: 'rgba(255,255,255,0.10)',
        boxShadow: '0 0 30px rgba(56,189,248,0.42)',
        transform: 'translate(-50%, 50%)',
      }} />

      {/* ── Travelling cue circles ── */}
      {visibleCues.map((cue) => (
        <CueCircle
          key={cue.id}
          id={cue.id}
          movementId={cue.movementId}
          kind={cue.kind}
          tag={cue.tag}
          laneX={laneX}
          scheduledTime={cue.time}
          songTime={songTime}
          mountSongTime={mountTimesRef.current[cue.id] ?? songTime}
          grade={cueGrades[cue.id] ?? null}
          landYBottom={LAND_Y_BOTTOM}
          travelMs={(cue.travel ?? DEFAULT_TRAVEL_S) * 1000}
        />
      ))}

      {/* ── Grade feedback label (PERFECT / GOOD / LATE / MISS) ── */}
      {flashes.map(({ key, grade }) => {
        const isGreat = grade === 'perfect' || grade === 'good';
        const cls     = isGreat ? 'animate-feedback-great' : grade === 'late' ? 'animate-feedback-late' : 'animate-feedback-miss';
        const label   = grade === 'perfect' ? 'PERFECT!' : grade === 'good' ? 'GOOD!' : grade === 'late' ? 'LATE' : grade === 'wrong' ? 'WRONG' : 'MISS';
        const color   = grade === 'perfect' ? '#34d399' : grade === 'good' ? '#60a5fa' : grade === 'late' ? '#fbbf24' : '#f87171';
        return (
          <div
            key={key}
            className={cls}
            style={{
              position: 'absolute', left: `${laneX}%`, bottom: `${RING_BOTTOM + 4}%`,
              fontSize: isGreat ? 17 : 14, fontWeight: 900,
              color, letterSpacing: 1.5, textShadow: `0 0 16px ${color}99`,
              whiteSpace: 'nowrap', pointerEvents: 'none', userSelect: 'none', zIndex: 55,
            }}
          >
            {label}
          </div>
        );
      })}

      {/* ── Fist FX: amber ring + glow (reference CueOverlay fistFxAt) ── */}
      {fistFxVisible && (
        <>
          <div
            className="animate-fist-flash"
            style={{
              position: 'absolute', left: `${laneX}%`, bottom: `${RING_BOTTOM}%`,
              width: '3.5rem', height: '3.5rem', borderRadius: '50%',
              border: '1px solid rgba(251,191,36,0.9)',
              transform: 'translateX(-50%)',
            }}
          />
          <div
            className="animate-fist-core"
            style={{
              position: 'absolute', left: `${laneX}%`, bottom: `${RING_BOTTOM}%`,
              width: '2.25rem', height: '2.25rem', borderRadius: '50%',
              background: 'rgba(251,191,36,0.35)',
              filter: 'blur(3px)',
              transform: 'translateX(-50%)',
            }}
          />
        </>
      )}

      {/* ── PERFECT/GOOD: shockwave ring + 8 burst particles ── */}
      {burstCue && (
        <BurstEffect key={burstCue.id} laneX={laneX} ringBottom={RING_BOTTOM} />
      )}
    </div>
  );
}

// Separate component so key change forces CSS animation remount on each new hit
function BurstEffect({ laneX, ringBottom }) {
  return (
    <>
      <div
        className="animate-hit-shockwave"
        style={{
          position: 'absolute', left: `${laneX}%`, bottom: `${ringBottom}%`,
          width: '5rem', height: '5rem', borderRadius: '50%',
          border: '1px solid rgba(224,242,254,0.9)',
          transform: 'translateX(-50%)',
        }}
      />
      {Array.from({ length: 8 }, (_, i) => (
        <span
          key={i}
          className="animate-hit-particle"
          style={{
            position: 'absolute', left: `${laneX}%`, bottom: `${ringBottom}%`,
            display: 'block', width: 8, height: 8, borderRadius: '50%',
            background: 'rgba(186,230,253,0.95)',
            transform: 'translateX(-50%)',
            willChange: 'transform, opacity',
            '--p-angle': `${i * 45}deg`,
            '--p-dist':  `${22 + i * 3}px`,
          }}
        />
      ))}
    </>
  );
}
