// src/components/WarmUp.jsx
// New warm-up flow: for each movement in the sequence:
//   DEMO_WATCH  → 4 arrows travel the lane, avatar animates on hit
//   COUNTDOWN   → 3, 2, 1
//   PRACTICE    → 3 arrows travel, user does the movement (geometry detection)
//   BRAVO       → positive feedback, auto-advances to next movement
//   DONE        → all movements complete

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useCalibration } from '../hooks/useCalibration';
import { useGameStore } from '../hooks/useGameStore';
import { useMovementBridge } from '../hooks/useMovementBridge';
import { useVideoRecognition } from '../hooks/useVideoRecognition';
import { CueLane } from './CueLane';
import { PoseBar } from './PoseBar';
import { MOVEMENT_MAP } from '../data/movements';
import { cueMatchScore } from '../hooks/useHitDetection';

// Ambient sparkle field shown during PRACTICE ("Your Turn") phase
function PracticeSparkles() {
  const items = useMemo(() => {
    const out = [];
    let s = 1337;
    const rnd = () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
    for (let i = 0; i < 22; i++) {
      out.push({
        id: i,
        left: rnd() * 96 + 2,
        top:  rnd() * 90 + 5,
        delay: rnd() * 3,
        dur:   1.4 + rnd() * 1.8,
        size:  3 + rnd() * 5,
      });
    }
    return out;
  }, []);

  return (
    <div aria-hidden style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'hidden' }}>
      {items.map((p) => (
        <span
          key={p.id}
          className="session-progress-sparkle"
          style={{
            position: 'absolute',
            left: `${p.left}%`, top: `${p.top}%`,
            width: `${p.size}px`, height: `${p.size}px`,
            borderRadius: '50%',
            background: 'white',
            boxShadow: '0 0 8px 3px rgba(186,230,253,0.8)',
            animationDelay: `${p.delay}s`,
            animationDuration: `${p.dur}s`,
          }}
        />
      ))}
    </div>
  );
}

// ── Constants ────────────────────────────────────────────────────────────────
const TRAVEL_DURATION_MS = 2000;   // how long one arrow takes to reach hit line
const CUE_INTERVAL_S     = 2.5;    // seconds between arrows
const DEMO_CUES          = 4;      // arrows shown during demo phase
const PRACTICE_CUES      = 3;      // arrows shown during practice phase
const BRAVO_DURATION_MS  = 2000;   // how long bravo screen shows
const TIMING_WINDOW_MS   = 900;    // hit detection window
const AVATAR_LEAD_MS     = 300;    // fire avatar animation this many ms before cue hits line

const PHASES = {
  DEMO_WATCH: 'demo_watch',
  COUNTDOWN:  'countdown',
  PRACTICE:   'practice',
  BRAVO:      'bravo',
  DONE:       'done',
};

// ── Cue timeline builder for warm-up ─────────────────────────────────────────
// Returns array of cue objects starting at t=0 spaced by CUE_INTERVAL_S
function buildCues(movementId, count, side) {
  const cues = [];
  for (let i = 0; i < count; i++) {
    const t = (TRAVEL_DURATION_MS / 1000) + i * CUE_INTERVAL_S;
    cues.push({
      id:            `warmup_${movementId}_${i}`,
      time:          t,
      side,
      movementId,
      tag:           'easy',
      phase:         'warmup',
    });
  }
  return cues;
}

// ── Zustand store slice for warmup avatar control ─────────────────────────────
// We communicate with VRMAvatar (inside Canvas) via useVideoRecognition store
// by reusing the existing activeMovement pattern.
// We add warmupAvatarMovement to useVideoRecognition store at runtime.

// ── Main component ────────────────────────────────────────────────────────────
export function WarmUp({ onComplete, romCal }) {
  const calibration        = useCalibration();
  const { setROMThresholds } = useGameStore();

  // Build sequence once — all easy + ALL target movements (no slice cap).
  // easyMovements and targetMovements already exclude tag:'avoid' movements.
  const sequence = useRef(
    [...new Set([...(calibration.easyMovements ?? []), ...(calibration.targetMovements ?? [])])]
  );

  const [movIndex, setMovIndex] = useState(0);
  const [phase, setPhase]       = useState(PHASES.DEMO_WATCH);
  const [countdown, setCountdown] = useState(3);

  // Fake song time — counts up from 0, resets each phase
  const [songTime, setSongTime]   = useState(0);
  const songTimeRef               = useRef(0);
  const timerRef                  = useRef(null);

  // Cues for current phase
  const [cues, setCues]           = useState([]);
  const [cueGrades, setCueGrades] = useState({});

  // Cues + detection lane: mirror-therapy warmup uses NON-affected side (lead limb).
  const mirrorWarmupCueSide =
    calibration.nonAffectedSide ?? calibration.mirrorLeadSide ??
    (calibration.affectedSide === 'left' ? 'right' : 'left');
  const warmupCueSide = calibration.isMirrorTherapy ? mirrorWarmupCueSide : (calibration.affectedSide ?? 'right');

  // Current movement
  const currentMovId  = sequence.current[movIndex];
  const currentMov    = MOVEMENT_MAP[currentMovId];
  const isLast        = movIndex >= sequence.current.length - 1;

  // ── Avatar active movement — communicated via store ───────────────────────
  // We store it in a ref and update a zustand field
  const setWarmupAvatar = useVideoRecognition((s) => s.setWarmupAvatarMovement);

  // ── Song time ticker ──────────────────────────────────────────────────────
  const startTimer = useCallback(() => {
    const startMs = Date.now();
    songTimeRef.current = 0;
    setSongTime(0);
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      // Use real elapsed wall-clock time so songTime stays in sync with
      // setTimeout-based avatar triggers, which also run on wall-clock time.
      // CueCircle uses CSS animations for position so 100ms ticks are fine —
      // movement smoothness comes from the browser compositor, not React renders.
      const elapsed = (Date.now() - startMs) / 1000;
      songTimeRef.current = elapsed;
      setSongTime(elapsed);
    }, 100);
  }, []);

  const stopTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  // ── Phase: DEMO_WATCH ─────────────────────────────────────────────────────

  const setWarmupAvatarMode = useVideoRecognition((s) => s.setWarmupAvatarMode);

// ← add this new useEffect right after:
useEffect(() => {
  if (phase === PHASES.DEMO_WATCH) {
    setWarmupAvatarMode('animation-driven');
  } else {
    // PRACTICE, COUNTDOWN, BRAVO — all mirror the patient
    setWarmupAvatarMode('realtime-tracking');
  }
}, [phase]);

useEffect(() => {
  return () => {
    setWarmupAvatarMode('realtime-tracking');
    setWarmupAvatar(null);
  };
}, []);

  useEffect(() => {
    if (phase !== PHASES.DEMO_WATCH || !currentMovId) return;
    setCueGrades({});

    setCues(buildCues(currentMovId, DEMO_CUES, warmupCueSide));
    startTimer();

    // Total demo duration: last cue hits line + 1s buffer
    const demoDuration = ((TRAVEL_DURATION_MS / 1000) + (DEMO_CUES - 1) * CUE_INTERVAL_S + 1) * 1000;
    const t = setTimeout(() => {
      stopTimer();
      setPhase(PHASES.COUNTDOWN);
      setCountdown(3);
    }, demoDuration);

    return () => { clearTimeout(t); stopTimer(); };
  }, [phase, movIndex]);

  // Avatar trigger during DEMO — fires when each cue hits the line
  useEffect(() => {
    if (phase !== PHASES.DEMO_WATCH || !currentMovId) return;
    const timers = [];

    const isHold       = currentMovId.endsWith('_hold');
    // Hold clips are 2.4s long (rise → hold → return-to-neutral, return starts at 1.8s).
    // Fire null at 2000ms (during the return phase) to guarantee a 500ms gap
    // before the next cue trigger at CUE_INTERVAL_S=2500ms — prevents the null
    // and next-cue state updates from racing in the same React render.
    const avatarHoldMs = isHold ? 2000 : 1200;

    for (let i = 0; i < DEMO_CUES; i++) {
      const hitMs = i * CUE_INTERVAL_S * 1000 + TRAVEL_DURATION_MS - AVATAR_LEAD_MS;
      const t = setTimeout(() => {
        setWarmupAvatar?.(currentMovId);
        setTimeout(() => setWarmupAvatar?.(null), avatarHoldMs);
      }, hitMs);
      timers.push(t);
    }
    return () => timers.forEach(clearTimeout);
  }, [phase, movIndex, currentMovId]);

  // ── Phase: COUNTDOWN ──────────────────────────────────────────────────────
  useEffect(() => {
    if (phase !== PHASES.COUNTDOWN) return;
    if (countdown <= 0) {
      setPhase(PHASES.PRACTICE);
      return;
    }
    const t = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [phase, countdown]);

  // ── Phase: PRACTICE ───────────────────────────────────────────────────────
  const practiceHitsRef = useRef(0);
  const gradedCueIds    = useRef(new Set());

  useEffect(() => {
    if (phase !== PHASES.PRACTICE || !currentMovId) return;
    practiceHitsRef.current = 0;
    gradedCueIds.current.clear();
    setCueGrades({});
    setCues(buildCues(currentMovId, PRACTICE_CUES, warmupCueSide));
    startTimer();

    // Timeout fallback — move on after all cues pass + 2s even if not all hit
    const practiceDuration = ((TRAVEL_DURATION_MS / 1000) + (PRACTICE_CUES - 1) * CUE_INTERVAL_S + 2) * 1000;
    const t = setTimeout(() => {
      stopTimer();
      setPhase(PHASES.BRAVO);
    }, practiceDuration);

    return () => { clearTimeout(t); stopTimer(); };
  }, [phase, movIndex]);

  // ── Movement detection during PRACTICE ───────────────────────────────────
  // gradeWarmupCue is called from both the event path and the processFrame path
  const gradeWarmupCue = useCallback((activeCue) => {
    if (gradedCueIds.current.has(activeCue.id)) return;
    gradedCueIds.current.add(activeCue.id);
    setCueGrades((prev) => ({ ...prev, [activeCue.id]: 'perfect' }));
    practiceHitsRef.current += 1;
    if (practiceHitsRef.current >= PRACTICE_CUES) {
      stopTimer();
      setTimeout(() => setPhase(PHASES.BRAVO), 400);
    }
  }, [stopTimer]);

  const handleMovement = useCallback((event) => {
    if (phase !== PHASES.PRACTICE) return;
    if (event.movementId !== currentMovId) return;
    if (calibration.isMirrorTherapy && event.side !== warmupCueSide) return;

    const now = songTimeRef.current;
    const activeCue = cues.find((cue) => {
      const offset = Math.abs(cue.time - now) * 1000;
      return offset <= TIMING_WINDOW_MS;
    });
    if (activeCue) gradeWarmupCue(activeCue);
  }, [phase, currentMovId, cues, gradeWarmupCue, calibration.isMirrorTherapy, warmupCueSide]);

  // Use a stable ref-wrapper so we can reference poseStateRef after useMovementBridge returns
  const frameCheckRef = useRef(null);

  // Stable empty object — passing `{}` inline would be a new reference every render,
  // re-creating processResults and re-registering the MediaPipe callback each tick.
  const emptyThresholds = useRef({});

  const { poseStateRef } = useMovementBridge({
    calibration,
    romThresholds: emptyThresholds.current,
    onMovement: handleMovement,
    // Delegate to frameCheckRef so the handler can reference poseStateRef (which isn't
    // available until after useMovementBridge returns — see assignment below).
    onPoseUpdate: () => frameCheckRef.current?.(),
  });

  // Assign the handler after poseStateRef is available.
  // Re-assigned every render so it always closes over latest phase/cues/etc.
  frameCheckRef.current = () => {
    if (phase !== PHASES.PRACTICE) return;
    const now = songTimeRef.current;
    const activeCue = cues.find((cue) => {
      const offset = Math.abs(cue.time - now) * 1000;
      return offset <= TIMING_WINDOW_MS && !gradedCueIds.current.has(cue.id);
    });
    if (!activeCue) return;
    const st = poseStateRef.current?.[warmupCueSide] ?? {};
    const expr01 = st.expr01 ?? 0.5;
    const isFist = st.isFist ?? false;
    const score  = cueMatchScore(currentMovId, null, expr01, isFist);
    const storeT = useGameStore.getState().romThresholds ?? {};
    const upT    = storeT.elbow_up_expr   ?? 0.57;
    const downT  = storeT.elbow_down_disp ?? 0.38;
    const hit    = (score >= 0.38)
                || (currentMovId.includes('up')   && expr01 >= upT)
                || (currentMovId.includes('down') && expr01 <= downT)
                || (currentMovId === 'wrist_fist' && isFist);
    if (hit) gradeWarmupCue(activeCue);
  };

  // ── Phase: BRAVO ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (phase !== PHASES.BRAVO) return;
    const t = setTimeout(() => {
      if (isLast) {
        setPhase(PHASES.DONE);
      } else {
        setMovIndex((i) => i + 1);
        setPhase(PHASES.DEMO_WATCH);
      }
    }, BRAVO_DURATION_MS);
    return () => clearTimeout(t);
  }, [phase, isLast]);

  // ── Phase: DONE ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (phase !== PHASES.DONE) return;
    setROMThresholds({});
    onComplete?.();
  }, [phase]);

  // ── Render ────────────────────────────────────────────────────────────────

  // DONE — render nothing while onComplete fires
  if (phase === PHASES.DONE) return null;

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      zIndex: 200,
      pointerEvents: 'none',
      fontFamily: 'system-ui, Inter, sans-serif',
    }}>

      {/* ── Top label — movement name + phase hint ── */}
      <div style={{
        position: 'absolute',
        top: 24,
        left: '50%',
        transform: 'translateX(-50%)',
        textAlign: 'center',
        zIndex: 10,
      }}>
        <div style={{
          background: 'rgba(10,15,40,0.72)',
          backdropFilter: 'blur(12px)',
          borderRadius: 16,
          padding: '10px 28px',
          border: '1px solid rgba(99,132,255,0.25)',
        }}>
          <p style={{ margin: 0, fontSize: 11, color: 'rgba(180,195,255,0.7)', letterSpacing: 1, textTransform: 'uppercase' }}>
            {phase === PHASES.DEMO_WATCH ? 'Watch the movement' : phase === PHASES.PRACTICE ? 'Your turn' : ''}
          </p>
          <p style={{ margin: '2px 0 0', fontSize: 22, fontWeight: 700, color: '#ffffff' }}>
            {currentMov?.arrow ?? ''} {currentMov?.name ?? currentMovId}
          </p>
          <p style={{ margin: '2px 0 0', fontSize: 11, color: 'rgba(150,165,220,0.6)' }}>
            {movIndex + 1} / {sequence.current.length}
          </p>
        </div>
      </div>

      {/* ── Progress bar ── */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: 'rgba(255,255,255,0.08)', zIndex: 10 }}>
        <div style={{
          height: '100%',
          width: `${(movIndex / Math.max(1, sequence.current.length)) * 100}%`,
          background: '#2563eb',
          transition: 'width 0.4s',
        }} />
      </div>

      {/* ── Sparkles during "Your Turn" and Bravo ── */}
      {(phase === PHASES.PRACTICE || phase === PHASES.BRAVO) && <PracticeSparkles />}

      {/* ── Cue lane: mirror warmup = non-affected side; otherwise affected side ── */}
      {(phase === PHASES.DEMO_WATCH || phase === PHASES.PRACTICE) && (
        <CueLane
          side={warmupCueSide}
          laneX={warmupCueSide === 'left' ? 45.65 : 54.35}
          allCues={cues}
          songTime={songTime}
          timingWindowMs={TIMING_WINDOW_MS}
          cueGrades={cueGrades}
        />
      )}

      {/* ── COUNTDOWN overlay ── */}
      {phase === PHASES.COUNTDOWN && (
        <div style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          pointerEvents: 'none',
        }}>
          <div style={{
            fontSize: countdown > 0 ? 120 : 56,
            fontWeight: 900,
            color: countdown > 0 ? '#ffffff' : '#60a5fa',
            textShadow: '0 0 60px rgba(99,132,255,0.6)',
            lineHeight: 1,
            transition: 'font-size 0.15s',
          }}>
            {countdown > 0 ? countdown : 'Go!'}
          </div>
          <p style={{ marginTop: 16, fontSize: 16, color: 'rgba(180,195,255,0.8)', fontWeight: 500 }}>
            Now you try
          </p>
        </div>
      )}

      {/* ── BRAVO overlay ── */}
      {phase === PHASES.BRAVO && (
        <div style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          pointerEvents: 'none',
          animation: 'bravoFadeIn 0.4s ease-out',
        }}>
          <div style={{ fontSize: 64, lineHeight: 1 }}>🎉</div>
          <div style={{
            marginTop: 16,
            fontSize: 48,
            fontWeight: 900,
            color: '#ffffff',
            textShadow: '0 0 40px rgba(96,165,250,0.8), 0 0 80px rgba(96,165,250,0.4)',
            letterSpacing: 2,
          }}>
            Bravo!
          </div>
          {!isLast && (
            <p style={{ marginTop: 12, fontSize: 15, color: 'rgba(180,195,255,0.7)' }}>
              Next movement coming up…
            </p>
          )}
        </div>
      )}

      {/* ── Pose bar — show L/R arm height so player can see their movement level ── */}
      <PoseBar poseStateRef={poseStateRef} />

      <style>{`
        @keyframes bravoFadeIn {
          from { opacity: 0; transform: scale(0.85); }
          to   { opacity: 1; transform: scale(1); }
        }
      `}</style>
    </div>
  );
}