// src/hooks/useGameStore.js
// Central Zustand store for the RehabOrchestra game state machine.
// This is the NEW state machine layered on top of the existing useVideoRecognition store.

import { create } from 'zustand';

export const GAME_STATES = {
  LOBBY:       'lobby',
  WARMUP:      'warmup',
  PERFORMANCE: 'performance',
  PAUSED:      'paused',
  RESULTS:     'results',
};

export const useGameStore = create((set, get) => ({
  // ── App Phase ────────────────────────────────────────────────────────────────
  phase: GAME_STATES.LOBBY,
  setPhase: (phase) => set({ phase }),

  // ── Selected level ───────────────────────────────────────────────────────────
  selectedLevelId: 1,
  setSelectedLevelId: (id) => set({ selectedLevelId: id }),

  // ── Session number (editable by physio in lobby) ─────────────────────────────
  sessionNumber: 1,
  setSessionNumber: (n) => set({ sessionNumber: n }),

  // ── Warm-up state ────────────────────────────────────────────────────────────
  warmupComplete: false,
  setWarmupComplete: (val) => set({ warmupComplete: val }),
  romThresholds: {},          // set by useROMCalibration during warm-up
  setROMThresholds: (t) => set({ romThresholds: t }),
  cueSpeedMultiplier: 1.0,
  setCueSpeedMultiplier: (v) => set({ cueSpeedMultiplier: Math.max(0.3, Math.min(2.5, v)) }),

  // ── Performance state ────────────────────────────────────────────────────────
  isPaused: false,
  pauseReason: null,          // null | 'manual' | 'emg_disconnect'
  pause: (reason = 'manual') => set({ isPaused: true, pauseReason: reason }),
  resume: () => set({ isPaused: false, pauseReason: null }),

  // Current song time in seconds (updated by useMusicSync every frame)
  songTime: 0,
  setSongTime: (t) => set({ songTime: t }),

  // Current BPM (may differ from base due to adaptation)
  currentBPM: 55,
  setCurrentBPM: (bpm) => set({ currentBPM: bpm }),

  // Density multiplier from adaptation (1.0 = normal, 0.7 = fewer cues)
  densityMultiplier: 1.0,
  setDensityMultiplier: (d) => set({ densityMultiplier: d }),

  // ── Hit tracking (for live adaptation) ──────────────────────────────────────
  recentHits: [],     // grades from last 30 seconds: 'perfect'|'good'|'late'
  recentMisses: [],   // timestamps of misses
  addRecentHit: (grade) => set((s) => ({ recentHits: [...s.recentHits, { grade, t: Date.now() }] })),
  addRecentMiss: () => set((s) => ({ recentMisses: [...s.recentMisses, Date.now()] })),

  // ── Score (internal — conductor baton fill uses this) ────────────────────────
  score: 0,
  totalPossible: 0,
  addScore: (pts) => set((s) => ({ score: s.score + pts })),
  setTotalPossible: (n) => set({ totalPossible: n }),

  // Streak
  streakCount: 0,
  setStreak: (n) => set({ streakCount: n }),
  incrementStreak: () => set((s) => ({ streakCount: s.streakCount + 1 })),
  resetStreak: () => set({ streakCount: 0 }),

  // Hit count for progress bar (successful hits only)
  hitCount: 0,
  incrementHitCount: () => set((s) => ({ hitCount: s.hitCount + 1 })),

  // ── EMG connection ────────────────────────────────────────────────────────────
  emgConnected: false,
  setEMGConnected: (v) => set({ emgConnected: v }),

  // ── Session metrics payload (set by useSessionMetrics at end) ────────────────
  finalMetrics: null,
  setFinalMetrics: (m) => set({ finalMetrics: m }),

  // ── Calibration reload ───────────────────────────────────────────────────────
  // Increment to force useCalibration to re-read localStorage
  calibrationVersion: 0,
  bumpCalibrationVersion: () => set((s) => ({ calibrationVersion: s.calibrationVersion + 1 })),

  // ── Session key — incremented each time a performance begins ─────────────────
  // Used as React key on CueLane to force remount and clear accumulated refs.
  sessionKey: 0,

  // ── State transition helpers ─────────────────────────────────────────────────
  goToLobby: () => set({
    phase: GAME_STATES.LOBBY,
    isPaused: false,
    pauseReason: null,
    warmupComplete: false,
    score: 0,
    totalPossible: 0,
    streakCount: 0,
    hitCount: 0,
    recentHits: [],
    recentMisses: [],
    songTime: 0,
    finalMetrics: null,
  }),

  goToWarmup: (levelId) => set({
    phase: GAME_STATES.WARMUP,
    selectedLevelId: levelId ?? get().selectedLevelId,
    warmupComplete: false,
    romThresholds: {},
    score: 0,
    totalPossible: 0,
    streakCount: 0,
    hitCount: 0,
    recentHits: [],
    recentMisses: [],
    songTime: 0,
  }),

  goToPerformance: () => set((s) => ({
    phase: GAME_STATES.PERFORMANCE,
    isPaused: false,
    score: 0,
    totalPossible: 0,
    streakCount: 0,
    hitCount: 0,
    recentHits: [],
    recentMisses: [],
    songTime: 0,
    sessionKey: s.sessionKey + 1,
  })),

  goToResults: (metrics) => set({
    phase: GAME_STATES.RESULTS,
    finalMetrics: metrics ?? null,
    isPaused: false,
  }),
}));
