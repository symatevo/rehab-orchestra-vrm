// src/components/OrchestraGameOverlay.jsx
// Orchestra sprite players shown during PERFORMANCE phase.
// Left side: 4 viola players. Right side: 4 cello players.
// Sprites animate at 92ms/frame via RAF, triggered by a simple BPM-based beat timer.
// Direct DOM backgroundImage/Position manipulation — no React re-renders.

import { useEffect, useRef } from 'react';
import { useGameStore, GAME_STATES } from '../hooks/useGameStore';

// ── Sprite definitions ────────────────────────────────────────────────────────

const BASE = '/models/Orchestra/Orchestra/';

const VIOLA_VARIANTS = {
  viola1: { url: `${BASE}viola1-normal-sprite/spritesheet.png`, frameW: 292, frameH: 482, cols: 2, rows: 2, frames: 4 },
  viola2: { url: `${BASE}viola2-normal-sprite/spritesheet.png`, frameW: 299, frameH: 489, cols: 4, rows: 2, frames: 8 },
  viola3: { url: `${BASE}viola3-normal-sprite/spritesheet.png`, frameW: 311, frameH: 509, cols: 2, rows: 2, frames: 4 },
  viola4: { url: `${BASE}viola4-normal-sprite/spritesheet.png`, frameW: 325, frameH: 484, cols: 4, rows: 1, frames: 4 },
};

const CELLO_VARIANTS = {
  cello1: { url: `${BASE}cello1-normal-sprite/spritesheet.png`, frameW: 306, frameH: 485, cols: 4, rows: 2, frames: 8 },
  cello3: { url: `${BASE}cello3-normal-sprite/spritesheet.png`, frameW: 325, frameH: 502, cols: 4, rows: 2, frames: 8 },
  cello4: { url: `${BASE}cello4-normal-sprite/spritesheet.png`, frameW: 325, frameH: 496, cols: 4, rows: 2, frames: 8 },
};

// Left side — viola players
const VIOLA_LAYOUT = [
  { key: 'viola1', left: '19.0vw', bottom: '-1vh',  scale: 0.8,  z: 33 },
  { key: 'viola2', left: '10vw',   bottom: '1.0vh', scale: 0.78, z: 32 },
  { key: 'viola3', left: '26.0vw', bottom: '6.0vh', scale: 0.7,  z: 25 },
  { key: 'viola4', left: '1vw',    bottom: '-3vh',  scale: 0.8,  z: 32 },
];

// Right side — cello players (mirror left layout)
const CELLO_LAYOUT = [
  { key: 'cello1', right: '16.0vw', bottom: '-1vh',  scale: 0.8,  z: 33 },
  { key: 'cello3', right: '5vw',    bottom: '1.0vh', scale: 0.78, z: 32 },
  { key: 'cello4', right: '23.0vw', bottom: '7.0vh', scale: 0.65, z: 25 },
  // 4th cello slot reuses cello1 sprite shifted far right
  { key: 'cello1', right: '-4vw',   bottom: '-3vh',  scale: 0.8,  z: 32 },
];

const FRAME_STEP_MS = 92;
const MIN_RETRIGGER_GAP_MS = 190;

// ── Preload all spritesheets ───────────────────────────────────────────────────
const ALL_SHEETS = [
  ...Object.values(VIOLA_VARIANTS),
  ...Object.values(CELLO_VARIANTS),
];

if (typeof window !== 'undefined') {
  for (const sheet of ALL_SHEETS) {
    const img = new window.Image();
    img.src = sheet.url;
    img.decode?.().catch(() => {});
  }
}

// ── Single sprite player ──────────────────────────────────────────────────────

function applyFrame(el, sheet, frame) {
  if (!el) return;
  const safeFrame = Math.max(0, Math.min(frame, sheet.frames - 1));
  const col = safeFrame % sheet.cols;
  const row = Math.floor(safeFrame / sheet.cols);
  const pctX = sheet.cols > 1 ? (col / (sheet.cols - 1)) * 100 : 0;
  const pctY = sheet.rows > 1 ? (row / (sheet.rows - 1)) * 100 : 0;
  el.style.backgroundImage = `url("${sheet.url}")`;
  el.style.backgroundSize  = `${sheet.cols * 100}% ${sheet.rows * 100}%`;
  el.style.backgroundPosition = `${pctX}% ${pctY}%`;
}

function SpritePlayer({ sheet, position, zIndex, scale, triggerSeqRef, playerIndex, totalPlayers }) {
  const divRef  = useRef(null);
  const animRef = useRef({ frame: 0, frameAt: 0, active: false });
  const lastTriggerRef = useRef(0);

  const anchorH = sheet.frameH * scale;
  const anchorW = (sheet.frameW / sheet.frameH) * anchorH;

  // Subscribe to trigger sequence — play animation on every Nth beat where N = playerIndex
  useEffect(() => {
    let rafId = 0;

    const tick = () => {
      const now = performance.now();
      const anim = animRef.current;

      // Check for new trigger from beat timer
      const seq = triggerSeqRef.current;
      if (seq > 0 && ((seq - 1) % totalPlayers) === playerIndex) {
        if (now - lastTriggerRef.current >= MIN_RETRIGGER_GAP_MS) {
          lastTriggerRef.current = now;
          anim.frame = 0;
          anim.frameAt = now;
          anim.active = true;
          applyFrame(divRef.current, sheet, 0);
        }
      }

      if (anim.active) {
        if (now - anim.frameAt >= FRAME_STEP_MS) {
          anim.frameAt = now;
          anim.frame += 1;
          if (anim.frame >= sheet.frames) {
            anim.active = false;
            anim.frame = 0;
            applyFrame(divRef.current, sheet, 0);
          } else {
            applyFrame(divRef.current, sheet, anim.frame);
          }
        }
      }

      rafId = requestAnimationFrame(tick);
    };

    applyFrame(divRef.current, sheet, 0);
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [sheet]);

  return (
    <div
      ref={divRef}
      aria-hidden
      style={{
        position: 'fixed',
        width: anchorW,
        height: anchorH,
        backgroundRepeat: 'no-repeat',
        filter: 'drop-shadow(0 10px 18px rgba(0,0,0,0.45))',
        pointerEvents: 'none',
        zIndex,
        ...position,
      }}
    />
  );
}

// ── Overlay ───────────────────────────────────────────────────────────────────

export function OrchestraGameOverlay({ bpm = 48 }) {
  const phase = useGameStore((s) => s.phase);
  const triggerSeqRef = useRef(0);

  // BPM-based beat timer that increments triggerSeqRef every beat
  useEffect(() => {
    if (phase !== GAME_STATES.PERFORMANCE) return;
    triggerSeqRef.current = 0;
    const beatMs = (60 / bpm) * 1000;
    const id = setInterval(() => {
      triggerSeqRef.current += 1;
    }, beatMs);
    return () => clearInterval(id);
  }, [phase, bpm]);

  if (phase !== GAME_STATES.PERFORMANCE) return null;

  const totalViola = VIOLA_LAYOUT.length;
  const totalCello = CELLO_LAYOUT.length;

  return (
    <>
      {VIOLA_LAYOUT.map(({ key, scale, z, ...pos }, i) => (
        <SpritePlayer
          key={`viola-${i}`}
          sheet={VIOLA_VARIANTS[key]}
          position={pos}
          zIndex={z}
          scale={scale}
          triggerSeqRef={triggerSeqRef}
          playerIndex={i}
          totalPlayers={totalViola}
        />
      ))}
      {CELLO_LAYOUT.map(({ key, scale, z, ...pos }, i) => (
        <SpritePlayer
          key={`cello-${i}`}
          sheet={CELLO_VARIANTS[key]}
          position={pos}
          zIndex={z}
          scale={scale}
          triggerSeqRef={triggerSeqRef}
          playerIndex={i}
          totalPlayers={totalCello}
        />
      ))}
    </>
  );
}
