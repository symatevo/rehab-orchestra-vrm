// src/hooks/useHitDetection.js
// Compares movement events from useMovementBridge to the active cue timeline.
// Grades hits as perfect / good / late / wrong / miss.
//
// Clinical note: miss feedback is never harsh — a cue simply fades,
// no discouraging sound or animation.

import { useRef, useCallback } from 'react';
import { useGameStore } from './useGameStore';

// ── Continuous match score (ported exactly from reference cueTiming.js) ───────
// UP  cues: expression01 range [0.38, 0.78] — higher arm = higher score
// DOWN cues: expression01 range [0.18, 0.56] inverted — lower arm = higher score
// CLOSE cues: matched by isFist boolean
// Returns 0..1, or -1 when not an expr01/fist cue
export function cueMatchScore(movementId, kind, expr01, isFist) {
  // Resolve effective kind from kind prop or movementId
  let eff = kind;
  if (!eff) {
    const base = (movementId ?? '').replace(/_hold$/, '');
    if (base === 'elbow_up'   || base === 'wrist_up')   eff = 'up';
    else if (base === 'elbow_down' || base === 'wrist_down') eff = 'down';
    else if (base === 'wrist_fist')                       eff = 'close';
  }

  const x = Math.max(0, Math.min(1, expr01));
  if (eff === 'up'   || eff === 'holdUp')   return Math.max(0, Math.min(1, (x - 0.38) / 0.40));
  if (eff === 'down' || eff === 'holdDown') return Math.max(0, Math.min(1, (0.56 - x) / 0.38));
  if (eff === 'close')                       return isFist ? 1 : 0;
  return -1;
}

// Movements graded via continuous cueMatchScore (not event debouncing)
const EXPR01_MOVEMENTS   = new Set(['elbow_up', 'elbow_down', 'wrist_up', 'wrist_down']);
const EXPR01_KINDS       = new Set(['up', 'down', 'holdUp', 'holdDown', 'close']);

// Hit grades and their point values
export const HIT_GRADES = {
  perfect: { label: 'PERFECT', points: 200 },
  good:    { label: 'GOOD',    points: 100 },
  late:    { label: 'LATE',    points:  50 },
  wrong:   { label: 'WRONG',   points:   0 },
  miss:    { label: 'MISS',    points:   0 },
};

/**
 * useHitDetection
 *
 * @param {object} params
 * @param {number} params.timingWindowMs — full hit window (from calibration)
 * @param {function} params.onHit  — (cueId, grade, points, side, movementId) => void
 * @param {function} params.onMiss — (cueId, side, movementId) => void
 */
export function useHitDetection({ timingWindowMs, onHit, onMiss }) {
  // activeCues: { [cueId]: { id, time, side, movementId, tag, graded: bool } }
  const activeCues = useRef({});
  const gradedCues = useRef(new Set());

  // Register a cue as "in play" when it spawns
  const registerCue = useCallback((cue) => {
    if (!gradedCues.current.has(cue.id) && !activeCues.current[cue.id]) {
      activeCues.current[cue.id] = { ...cue, graded: false, enteredAt: performance.now() };
    }
  }, []);

  // Remove a cue from active tracking (called when it exits the lane)
  const expireCue = useCallback((cueId) => {
    const cue = activeCues.current[cueId];
    if (cue && !cue.graded) {
      // Cue passed without being hit — that's a miss
      delete activeCues.current[cueId];
      gradedCues.current.add(cueId);
      onMiss?.(cueId, cue.side === 'both' ? 'left' : cue.side, cue.movementId);
    } else {
      delete activeCues.current[cueId];
    }
  }, [onMiss]);

  // Called by useMovementBridge when a movement is detected
  const processMovementEvent = useCallback((event, songTimeSeconds) => {
    const { side, movementId, timestamp } = event;
    const window = timingWindowMs ?? 900;
    const nowMs = songTimeSeconds * 1000;

    // Find the nearest active (ungraded) cue on the same side (or 'both')
    const candidates = Object.values(activeCues.current).filter(
      (c) => (c.side === side || c.side === 'both') && !c.graded
    );

    if (candidates.length === 0) return;  // no cue — player moved between cues, that's fine

    // Find closest in time
    const nearest = candidates.reduce((best, c) => {
      const diff = Math.abs(c.time * 1000 - nowMs);
      return diff < best.diff ? { cue: c, diff } : best;
    }, { cue: null, diff: Infinity });

    if (!nearest.cue) return;

    const cue = nearest.cue;
    const rawOffset = nowMs - cue.time * 1000;  // positive = late, negative = early
    const offset = Math.abs(rawOffset);

    // Only grade if within the full timing window
    if (offset > window) return;

    const reactionTime = cue.enteredAt ? (performance.now() - cue.enteredAt) : 0;

    cue.graded = true;
    gradedCues.current.add(cue.id);
    delete activeCues.current[cue.id];

    // For kind-based cues (MIDI chart), movement matching is done by processFrame.
    // processMovementEvent only handles legacy movementId-based cues.
    const baseMovement = movementId.replace(/_hold$/, '');
    const cueBase      = cue.movementId?.replace(/_hold$/, '') ?? '';
    // Also accept kind-based match (e.g. event 'elbow_up' hitting a kind='up' cue)
    const kindMatch = cue.kind === 'up'    && (baseMovement === 'elbow_up'   || baseMovement === 'wrist_up')
                   || cue.kind === 'down'  && baseMovement === 'elbow_down'
                   || cue.kind === 'close' && baseMovement === 'wrist_fist';
    if (baseMovement !== cueBase && !kindMatch) {
      onHit?.(cue.id, 'wrong', 0, side, movementId, cue, rawOffset, reactionTime);
      return;
    }

    // Grade by timing precision
    let grade;
    if      (offset <= window * 0.25) grade = 'perfect';
    else if (offset <= window * 0.50) grade = 'good';
    else                               grade = 'late';

    const points = HIT_GRADES[grade].points;
    onHit?.(cue.id, grade, points, side, movementId, cue, rawOffset, reactionTime);
  }, [timingWindowMs, onHit]);

  // Called every game tick — continuous expression01 check.
  // Ported from reference GameSession.jsx: checks pose against active cues each frame.
  //
  // Reference timing (cueTiming.js):
  //   window open:  hitTime − 0.45 s  (arm in position early → still PERFECT)
  //   perfect zone: t ≤ hitTime + 0.22 s
  //   good zone:    hitTime + 0.22 < t ≤ hitTime + 0.40 s
  //   late zone:    hitTime + 0.40 < t ≤ hitTime + 0.60 s
  //   miss:         t > hitTime + 0.60 s (expireCue handles this)
  const processFrame = useCallback((poseState, songTimeSeconds) => {
    const t = songTimeSeconds;

    for (const cue of Object.values(activeCues.current)) {
      if (cue.graded) continue;

      const base   = (cue.movementId ?? '').replace(/_hold$/, '');
      const kindOk = cue.kind && EXPR01_KINDS.has(cue.kind);
      const movOk  = EXPR01_MOVEMENTS.has(base);
      if (!kindOk && !movOk) continue;

      // Detection window: [hitTime − 0.45, hitTime + 0.60]
      if (t < cue.time - 0.45) continue;
      if (t > cue.time + 0.60) continue;

      // Per-side pose: each cue has an explicit side ('left' or 'right')
      // 'both' is only used by mirror-therapy / BPM-grid fallback
      let expr01, isFist, hitSide;
      if (cue.side === 'both') {
        const L = poseState?.left  ?? {};
        const R = poseState?.right ?? {};
        const sL = cueMatchScore(cue.movementId, cue.kind, L.expr01 ?? 0.5, L.isFist ?? false);
        const sR = cueMatchScore(cue.movementId, cue.kind, R.expr01 ?? 0.5, R.isFist ?? false);
        if (sL >= sR) { expr01 = L.expr01 ?? 0.5; isFist = L.isFist ?? false; hitSide = 'left'; }
        else          { expr01 = R.expr01 ?? 0.5; isFist = R.isFist ?? false; hitSide = 'right'; }
      } else {
        const s = poseState?.[cue.side] ?? {};
        expr01  = s.expr01 ?? 0.5;
        isFist  = s.isFist ?? false;
        hitSide = cue.side;
      }

      const score = cueMatchScore(cue.movementId, cue.kind, expr01, isFist);

      // Also check against user-adjustable thresholds from the PoseBar.
      // getState() is safe inside a callback — non-reactive Zustand read.
      const storeT     = useGameStore.getState().romThresholds ?? {};
      const upThresh   = storeT.elbow_up_expr   ?? 0.57;
      const downDisp   = storeT.elbow_down_disp ?? 0.38;
      // Resolve effective kind for threshold check
      let effKind = cue.kind;
      if (!effKind) {
        const b = (cue.movementId ?? '').replace(/_hold$/, '');
        if (b === 'elbow_up'   || b === 'wrist_up')   effKind = 'up';
        else if (b === 'elbow_down' || b === 'wrist_down') effKind = 'down';
        else if (b === 'wrist_fist')                   effKind = 'close';
      }
      const thresholdMatch =
        ((effKind === 'up'   || effKind === 'holdUp')   && expr01 >= upThresh) ||
        ((effKind === 'down' || effKind === 'holdDown') && expr01 <= downDisp) ||
        (effKind === 'close' && isFist);

      if (score < 0.38 && !thresholdMatch) continue;

      // First frame pose matches within window → grade (reference exact)
      cue.graded = true;
      gradedCues.current.add(cue.id);
      delete activeCues.current[cue.id];

      const reactionTime = cue.enteredAt ? (performance.now() - cue.enteredAt) : 0;
      const rawOffset = (t - cue.time) * 1000;

      let grade;
      if      (t <= cue.time + 0.22) grade = 'perfect';
      else if (t <= cue.time + 0.40) grade = 'good';
      else                            grade = 'late';

      const points = HIT_GRADES[grade].points;
      onHit?.(cue.id, grade, points, hitSide, cue.movementId, cue, rawOffset, reactionTime);
    }
  }, [onHit]);

  // Reset all tracking (call between phases)
  const reset = useCallback(() => {
    activeCues.current = {};
    gradedCues.current = new Set();
  }, []);

  return { registerCue, expireCue, processMovementEvent, processFrame, reset };
}
