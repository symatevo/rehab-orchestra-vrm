// src/App.jsx
// Main application entry point.
// State machine: LOBBY → WARMUP → PERFORMANCE ↔ PAUSED → RESULTS

import { Loader, Stats } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CameraWidget } from "./components/CameraWidget";
import { Experience } from "./components/Experience";
import { HUD } from "./components/HUD";
import { Lobby } from "./components/Lobby";
import { OrchestraGameOverlay } from "./components/OrchestraGameOverlay";
import { PauseMenu } from "./components/PauseMenu";
import { Results } from "./components/Results";
import { SessionProgressBar } from "./components/SessionProgressBar";
import { WarmUp } from "./components/WarmUp";
import { useCalibration } from "./hooks/useCalibration";
import { useGameStore, GAME_STATES } from "./hooks/useGameStore";
import { useHitDetection } from "./hooks/useHitDetection";
import { useMusicSync } from "./hooks/useMusicSync";
import { useMovementBridge } from "./hooks/useMovementBridge";
import { useSessionMetrics } from "./hooks/useSessionMetrics";
import { useAdaptation } from "./hooks/useAdaptation";
import { LEVEL_MAP } from "./data/levels";
import { useVideoRecognition } from "./hooks/useVideoRecognition";
import { NEVER_CUE } from "./data/movements";
import { buildMidiCueChart } from "./data/buildChart";
import { PoseBar } from "./components/PoseBar";
import { CueSpeedBar } from "./components/CueSpeedBar";



// ── Cue timeline builder (not a hook — called once at performance start) ──────
// For elbow-focused levels with a known song, delegates to buildMidiCueChart (reference approach).
// Falls back to the BPM-grid approach for other levels / wrist exercises.
function buildFullTimeline(calibration, levelConfig, seed = 42) {
  if (!calibration || !levelConfig) return [];

  // Try MIDI-based chart first (better music sync, matches reference)
  const jointFocus = calibration.jointFocus ?? 'elbow';
  if (jointFocus === 'elbow' && levelConfig.song) {
    const midiChart = buildMidiCueChart(calibration, levelConfig.song);
    if (midiChart && midiChart.length > 0) return midiChart;
  }

  // ── BPM-grid fallback (used for wrist exercises or songs without MIDI data) ──

  const bpm = calibration.baseBPM ?? 55;
  const beatInterval = 60 / bpm;
  const duration = levelConfig.durationSeconds ?? 180;


  // Phase definitions: [startTime, endTime, beatsPerCue, includeTargets, targetFreq, targetOnAffected]
  const phases = [
    { name: 'intro',      start:   0, end:  45, beatsPerCue: 2.5, includeTargets: false },
    { name: 'build',      start:  45, end:  90, beatsPerCue: 2,   includeTargets: true,  targetFreq: 0.2, targetOnAffected: true },
    { name: 'peak',       start:  90, end: 135, beatsPerCue: 1.5, includeTargets: true,  targetFreq: 0.4 },
    { name: 'resolution', start: 135, end: duration, beatsPerCue: 3, includeTargets: false },
  ];

  // Build movement pools
  const mrc = calibration.affectedMRC ?? 3;
  const easyPool = (calibration.easyMovements ?? []).filter(id => !NEVER_CUE.includes(id));
  const targetPool = (calibration.targetMovements ?? []).filter(id => !NEVER_CUE.includes(id));

  const filterMRC = (id) => {
    if (id.endsWith('_hold') && mrc < 3) return false;
    if ((id === 'elbow_diagonal_ul' || id === 'elbow_diagonal_ur') && mrc < 4) return false;
    return true;
  };

  const easy   = easyPool.filter(filterMRC);
  const target = targetPool.filter(filterMRC);

  if (easy.length === 0) return [];

  const mirrorBothLanes = calibration.isMirrorTherapy;

  // Determine active sides (mirror therapy: lead performs once; cues use side 'both' — see below)
  const sides = [];
  if (!mirrorBothLanes) {
    if (calibration.leftControl  !== 'blocked') sides.push('left');
    if (calibration.rightControl !== 'blocked') sides.push('right');
  }

  if (!mirrorBothLanes && sides.length === 0) return [];

  // Non–mirror therapy: two hands tracked independently. Mirror therapy: single cue visible on both lanes.
  const bothSides = !mirrorBothLanes && sides.length >= 2;

  // Seeded PRNG for reproducibility
  let s = seed;
  const rand = () => {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    return (s >>> 0) / 0xffffffff;
  };

  const cues = [];
  let cueIndex = 0;
  let easyRotateIdx = -1;  // strictly alternates through easy movements (up → down → up …)

  for (const phase of phases) {
    let t = phase.start + beatInterval * phase.beatsPerCue;
    // Rare target budget: ≤8% of beats in any phase so easy (up/down) dominates
    const targetBudget = phase.includeTargets
      ? Math.ceil((phase.end - phase.start) / beatInterval / phase.beatsPerCue * Math.min(phase.targetFreq ?? 0, 0.08))
      : 0;
    let remainingTarget = targetBudget;

    while (t < phase.end - beatInterval) {
      // Movement selection — predominantly easy alternating, rarely target
      const useTarget = phase.includeTargets &&
        target.length > 0 &&
        remainingTarget > 0 &&
        rand() < Math.min(phase.targetFreq ?? 0, 0.08);

      let movementId, tag;
      if (useTarget) {
        movementId = target[Math.floor(rand() * target.length)];
        tag = 'yellow';
        remainingTarget--;
      } else {
        // Strict alternation across easy pool → up, down, up, down, …
        easyRotateIdx = (easyRotateIdx + 1) % easy.length;
        movementId = easy[easyRotateIdx];
        tag = 'easy';
      }

      const hitTime = parseFloat(t.toFixed(3));
      const n = String(++cueIndex).padStart(4, '0');

      if (bothSides) {
        // Both hands do the same movement simultaneously
        cues.push({ id: `cue_${n}_L`, time: hitTime, side: 'left',  movementId, tag, phase: phase.name });
        cues.push({ id: `cue_${n}_R`, time: hitTime, side: 'right', movementId, tag, phase: phase.name });
      } else if (mirrorBothLanes) {
        cues.push({ id: `cue_${n}`, time: hitTime, side: 'both', movementId, tag, phase: phase.name });
      } else {
        const side = sides[0];
        cues.push({ id: `cue_${n}`, time: hitTime, side, movementId, tag, phase: phase.name });
      }

      t += beatInterval * phase.beatsPerCue;
    }
  }

  const sorted = cues.sort((a, b) => a.time - b.time);

  // Assign travel times based on beat-to-beat IOI.
  // L+R pairs share the same beat time — skip siblings and use the interval to the next distinct beat.
  const beatTimes = [...new Set(sorted.map((c) => c.time))].sort((a, b) => a - b);
  const beatTravelMap = new Map();
  beatTimes.forEach((bt, i) => {
    const nextBt = beatTimes[i + 1];
    const ioi    = nextBt !== undefined ? nextBt - bt : 2.0;
    beatTravelMap.set(bt, Math.min(3.2, Math.max(1.35, ioi * 1.35)));
  });
  sorted.forEach((c) => { c.travel = beatTravelMap.get(c.time) ?? 1.85; });

  return sorted;
}

// ── Main App ──────────────────────────────────────────────────────────────────

function App() {
  const calibration = useCalibration();
  // Selective selectors — App only re-renders when these specific slices change.
  // Previously `useGameStore()` (no selector) caused App to re-render on every
  // store update including high-frequency ones like streakCount and recentHits.
  const phase            = useGameStore((s) => s.phase);
  const selectedLevelId  = useGameStore((s) => s.selectedLevelId);
  const sessionNumber    = useGameStore((s) => s.sessionNumber);
  const isPaused         = useGameStore((s) => s.isPaused);
  const romThresholds    = useGameStore((s) => s.romThresholds);
  const currentBPM       = useGameStore((s) => s.currentBPM);
  const cueSpeedMultiplier = useGameStore((s) => s.cueSpeedMultiplier ?? 1);

  // Actions never change reference in Zustand — grab once via selector.
  const goToLobby        = useGameStore((s) => s.goToLobby);
  const goToWarmup       = useGameStore((s) => s.goToWarmup);
  const goToPerformance  = useGameStore((s) => s.goToPerformance);
  const goToResults      = useGameStore((s) => s.goToResults);
  const pause            = useGameStore((s) => s.pause);
  const resume           = useGameStore((s) => s.resume);
  const setTotalPossible = useGameStore((s) => s.setTotalPossible);
  const addScore         = useGameStore((s) => s.addScore);
  const addRecentHit     = useGameStore((s) => s.addRecentHit);
  const addRecentMiss    = useGameStore((s) => s.addRecentMiss);
  const setSongTime      = useGameStore((s) => s.setSongTime);
  const setFinalMetrics  = useGameStore((s) => s.setFinalMetrics);
  const incrementHitCount = useGameStore((s) => s.incrementHitCount);

  const levelConfig = LEVEL_MAP[selectedLevelId] ?? LEVEL_MAP[1];
  // Slow speed = wider timing window (easier to time), fast = tighter. Capped at 2000ms.
  const adjustedTimingWindowMs = Math.min(2000, Math.round((calibration.timingWindowMs ?? 900) / cueSpeedMultiplier));

  // ── Song time + cue state ────────────────────────────────────────────────
  const [songTime, setSongTimeLocal] = useState(0);
  const [cueGrades, setCueGrades]    = useState({});
  const songTimeRef  = useRef(0);
  const timelineRef  = useRef([]);  // stable full cue timeline

  const [cameraStarted, setCameraStarted] = useState(false);
  const [warmupDone, setWarmupDone] = useState(false);
  const gameEndTimeRef  = useRef(180);   // seconds — set to lastCue + 5 at game start
  const gameEndFiredRef = useRef(false); // prevents double-firing

  // Build full timeline once per performance (stable across song)
  const buildTimeline = useCallback(() => {
    timelineRef.current = buildFullTimeline(
      calibration,
      levelConfig,
      sessionNumber * (selectedLevelId + 1)
    );
    setTotalPossible(timelineRef.current.length * 200);
    // End 5s after the last cue so music fades naturally instead of playing to 180s
    const lastCueTime = timelineRef.current.reduce((mx, c) => Math.max(mx, c.time), 0);
    gameEndTimeRef.current  = lastCueTime + 5;
    gameEndFiredRef.current = false;
  }, [calibration, levelConfig, sessionNumber, selectedLevelId, setTotalPossible]);

  // ── Music sync ────────────────────────────────────────────────────────────
  const music = useMusicSync();
  const volumeRef = useRef(0.8);

  // ── Session metrics ───────────────────────────────────────────────────────
  const metrics = useSessionMetrics({
    calibration,
    levelId: selectedLevelId,
    sessionNumber,
  });

  // ── Difficulty adaptation ─────────────────────────────────────────────────
  // metricsRef keeps a stable reference to metrics so onAdaptation doesn't
  // change every render (which would cause useAdaptation's interval to reinstall).
  const metricsRef = useRef(metrics);
  metricsRef.current = metrics;
  const onAdaptation = useCallback(({ fromBPM, toBPM, reason }) => {
    metricsRef.current.recordAdaptation({ fromBPM, toBPM, reason });
  }, []);
  const adaptation = useAdaptation({
    baseBPM: calibration.baseBPM,
    onAdaptation,
  });

  // Keep a stable ref to adaptation.reset so handleStartPerformance doesn't
  // get a new reference every render (adaptation object is recreated each render).
  const adaptationResetRef = useRef(adaptation.reset);
  adaptationResetRef.current = adaptation.reset;

  // Grade feedback timeout cleanup
  const gradeTimeouts = useRef({});
  const clearGradeTimeout = (cueId) => {
    if (gradeTimeouts.current[cueId]) {
      clearTimeout(gradeTimeouts.current[cueId]);
      delete gradeTimeouts.current[cueId];
    }
  };

  // ── Hit detection ─────────────────────────────────────────────────────────
  const hitDetection = useHitDetection({
    timingWindowMs: adjustedTimingWindowMs,
    onHit: (cueId, grade, points, side, movementId, cue, timingOffset, reactionTime) => {
      clearGradeTimeout(cueId);
      setCueGrades((prev) => ({ ...prev, [cueId]: grade }));
      // 1500ms: longer than POP_LINGER_S (0.55s) + any feedback animation (0.8s)
      // prevents the cue from "reappearing" after the pop animation finishes
      gradeTimeouts.current[cueId] = setTimeout(() => {
        setCueGrades((prev) => { const n = { ...prev }; delete n[cueId]; return n; });
      }, 1500);

      if (['perfect', 'good', 'late'].includes(grade)) {
        addScore(points);
        incrementHitCount();
        useGameStore.getState().incrementStreak();
        music.onStreak(useGameStore.getState().streakCount);
        music.onHit(grade);
        adaptation.recordHit();
        addRecentHit(grade);
        metrics.recordHit({ cueId, side, movementId, grade, timingOffset, reactionTime });
      } else {
        useGameStore.getState().resetStreak();
        music.onHit(grade);
        adaptation.recordMiss();
        addRecentMiss();
        metrics.recordMiss({ cueId, side, movementId });
      }
    },
    onMiss: (cueId, side, movementId) => {
      clearGradeTimeout(cueId);
      setCueGrades((prev) => ({ ...prev, [cueId]: 'miss' }));
      gradeTimeouts.current[cueId] = setTimeout(() => {
        setCueGrades((prev) => { const n = { ...prev }; delete n[cueId]; return n; });
      }, 1500);
      useGameStore.getState().resetStreak();
      music.onMiss();
      adaptation.recordMiss();
      addRecentMiss();
      metrics.recordMiss({ cueId, side, movementId });
    },
  });

  // ── Movement bridge ───────────────────────────────────────────────────────
  const { poseStateRef } = useMovementBridge({
    calibration,
    romThresholds,
    onMovement: (event) => {
      if (phase !== GAME_STATES.PERFORMANCE || isPaused) return;
      hitDetection.processMovementEvent(event, songTimeRef.current);
      if (event.value != null) metrics.recordROM({ movementId: event.movementId, side: event.side, value: event.value });
    },
    // Run hit detection at MediaPipe cadence (~30 fps) so arm peaks aren't missed
    // between 100ms game-loop ticks.
    onPoseUpdate: () => {
      if (phase !== GAME_STATES.PERFORMANCE || isPaused) return;
      hitDetection.processFrame(poseStateRef.current, songTimeRef.current);
    },
  });

  // ── Song time tracking loop ───────────────────────────────────────────────
  useEffect(() => {
    if (phase !== GAME_STATES.PERFORMANCE) return;
    if (isPaused) return;

    const interval = setInterval(() => {
      const t = music.getSongTime();
      songTimeRef.current = t;
      setSongTimeLocal(t);
      setSongTime(t);

      const tl = timelineRef.current;

      const expireThreshS = adjustedTimingWindowMs / 1000;
      tl.forEach((cue) => {
        // Register when cue spawns (travel time before hit)
        const travelSec = cue.travel ?? 1.85;
        if (t >= cue.time - travelSec && t <= cue.time + expireThreshS) {
          hitDetection.registerCue(cue);
        }
        // Expire (trigger miss) after the detection window closes
        if (t > cue.time + expireThreshS) {
          hitDetection.expireCue(cue.id);
        }
      });

      // Continuous frame-based check for elbow_up / elbow_down cues.
      // Uses reference cueMatchScore (expr01 ranges) so the cue grades as soon
      // as the pose matches — no discrete event needed, no debounce lock issue.
      hitDetection.processFrame(poseStateRef.current, t);

      // Song complete: 5s after last cue, fade music out over 3s then go to results
      if (t >= gameEndTimeRef.current && !gameEndFiredRef.current) {
        gameEndFiredRef.current = true;
        music.fadeOutSong(3);
        setTimeout(() => {
          const finalMet = metrics.finalizeSession();
          setFinalMetrics(finalMet);
          goToResults(finalMet);
        }, 3000);
      }
    }, 100);

    return () => clearInterval(interval);
  }, [phase, isPaused]);  // eslint-disable-line react-hooks/exhaustive-deps

  // ── State transitions ─────────────────────────────────────────────────────
  const handleStartWarmup = useCallback((levelId) => {
    goToWarmup(levelId);
  }, [goToWarmup]);

  const handleWarmupComplete = useCallback(() => {
  setWarmupDone(true);
}, []);

  const handleStartPerformance = useCallback(() => {
  setWarmupDone(false);
  buildTimeline();
  hitDetection.reset();
  adaptationResetRef.current();
  setCueGrades({});
  songTimeRef.current = 0;
  setSongTimeLocal(0);
  gameEndFiredRef.current = false;
  goToPerformance();
  music.startSong(levelConfig.song);
}, [buildTimeline, hitDetection, goToPerformance, music, levelConfig]);

  const handlePause = useCallback(() => {
    pause('manual');
    music.pauseSong();
  }, [pause, music]);

  const handleResume = useCallback(() => {
    resume();
    music.resumeSong();
  }, [resume, music]);

  const handleRestart = useCallback(() => {
    music.stopSong();
    hitDetection.reset();
    setCueGrades({});
    goToWarmup(selectedLevelId);
  }, [music, hitDetection, goToWarmup, selectedLevelId]);

  const handleExitToLobby = useCallback(() => {
    music.stopSong();
    // Cancel all pending grade-removal timeouts and clear grades UI
    Object.keys(gradeTimeouts.current).forEach((id) => {
      clearTimeout(gradeTimeouts.current[id]);
    });
    gradeTimeouts.current = {};
    setCueGrades({});
    goToLobby();
  }, [music, goToLobby]);

  const handleNextLevel = useCallback(() => {
    music.stopSong();
    goToWarmup(Math.min(5, selectedLevelId + 1));
  }, [music, goToWarmup, selectedLevelId]);

  const handlePlayAgain = useCallback(() => {
    music.stopSong();
    Object.keys(gradeTimeouts.current).forEach((id) => {
      clearTimeout(gradeTimeouts.current[id]);
    });
    gradeTimeouts.current = {};
    setCueGrades({});
    goToLobby();
  }, [music, goToLobby]);

  // ── Sync legacy game state for VRMAvatar backward compat ─────────────────
  useEffect(() => {
    const vr = useVideoRecognition.getState();
    if (phase === GAME_STATES.PERFORMANCE || phase === GAME_STATES.PAUSED) {
      vr.setGameState('started');
    } else {
      vr.setGameState('waiting');
    }
  }, [phase]);

  // ── Render ────────────────────────────────────────────────────────────────
  const isPerformance = phase === GAME_STATES.PERFORMANCE || phase === GAME_STATES.PAUSED;

  return (
    <>
      {/* 3D Canvas — always present */}
      <CameraWidget onCameraStart={() => setCameraStarted(true)} />
      <Loader />
      <Canvas
        shadows
        camera={{ position: [0, 0.5, 2.3], fov: 30 }}
        gl={{ antialias: false }}
        dpr={[1, 1.5]}
      >
        <color attach="background" args={[isPerformance ? "#152238" : "#1a1a2e"]} />
        {!isPerformance && <fog attach="fog" args={["#1a1a2e", 10, 20]} />}
        {import.meta.env.DEV && <Stats />}
        <Suspense>
          <Experience />
        </Suspense>
      </Canvas>

      {/* LOBBY */}
      {phase === GAME_STATES.LOBBY && (
  <>
    <Lobby onStartWarmup={handleStartWarmup} />
    {cameraStarted && (
      <div style={{
        position: 'fixed',
        bottom: 15,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 150,
      }}>
        <button
          onClick={() => handleStartWarmup(selectedLevelId)}
          disabled={!calibration.isValid}
          style={{
            padding: '18px 48px',
            background: calibration.isValid ? '#2563eb' : '#d1d5db',
            color: '#ffffff',
            border: 'none',
            borderRadius: 16,
            fontSize: 18,
            fontWeight: 700,
            cursor: calibration.isValid ? 'pointer' : 'not-allowed',
            boxShadow: calibration.isValid
              ? '0 8px 32px rgba(37,99,235,0.45), 0 2px 8px rgba(0,0,0,0.3)'
              : 'none',
            letterSpacing: 0.4,
          }}
        >
          Start Warm-Up →
        </button>
      </div>
    )}
  </>
)}

      {/* WARM-UP */}
      {/* WARM-UP */}
{phase === GAME_STATES.WARMUP && !warmupDone && (
  <WarmUp onComplete={handleWarmupComplete} />
)}

      {warmupDone && phase === GAME_STATES.WARMUP && (
  <div style={{
    position: 'fixed',
    inset: 0,
    zIndex: 300,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'rgba(5,10,30,0.75)',
    backdropFilter: 'blur(8px)',
  }}>
    <div style={{ fontSize: 48, marginBottom: 16 }}>🎼</div>
    <h2 style={{
      color: '#ffffff',
      fontSize: 32,
      fontWeight: 700,
      margin: '0 0 8px',
      textShadow: '0 0 30px rgba(99,132,255,0.6)',
    }}>
      Ready to perform?
    </h2>
    <p style={{ color: 'rgba(180,195,255,0.7)', fontSize: 15, margin: '0 0 32px' }}>
      Great warm-up! Now let's play.
    </p>
    <button
      onClick={handleStartPerformance}
      style={{
        padding: '18px 52px',
        background: 'linear-gradient(135deg, #2563eb, #1d4ed8)',
        color: '#ffffff',
        border: 'none',
        borderRadius: 16,
        fontSize: 20,
        fontWeight: 700,
        cursor: 'pointer',
        boxShadow: '0 8px 32px rgba(37,99,235,0.5)',
        letterSpacing: 0.4,
      }}
      onMouseEnter={(e) => e.currentTarget.style.transform = 'scale(1.04)'}
      onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
    >
      Start Game 🎵
    </button>
  </div>
)}

      {/* Orchestra sprite overlay — shown during performance only */}
      <OrchestraGameOverlay bpm={levelConfig.bpm ?? 48} />

      {/* Session progress bar — centered at top during performance */}
      {isPerformance && (
        <SessionProgressBar totalCues={timelineRef.current.length} />
      )}

      {/* HUD (shown during performance and pause) */}
      {isPerformance && (
        <HUD
          allCues={timelineRef.current}
          songTime={songTime}
          songDuration={levelConfig.durationSeconds ?? 180}
          timingWindowMs={adjustedTimingWindowMs}
          cueGrades={cueGrades}
          onPause={handlePause}
        />
      )}

      {/* Pose bar — right edge expression indicator (both hands) */}
      {isPerformance && <PoseBar poseStateRef={poseStateRef} />}
      {isPerformance && <CueSpeedBar />}

      {/* PAUSE MENU */}
      {phase === GAME_STATES.PAUSED && (
        <PauseMenu
          onResume={handleResume}
          onRestart={handleRestart}
          onExitToLobby={handleExitToLobby}
          onVolumeChange={(v) => { volumeRef.current = v; music.setVolume(v); }}
          volume={volumeRef.current}
        />
      )}

      {/* RESULTS */}
      {phase === GAME_STATES.RESULTS && (
        <Results
          metrics={useGameStore.getState().finalMetrics}
          onPlayAgain={handlePlayAgain}
          onNextLevel={handleNextLevel}
          onExit={handleExitToLobby}
        />
      )}
    </>
  );
}

export default App;