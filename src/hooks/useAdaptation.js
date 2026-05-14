// src/hooks/useAdaptation.js
// Real-time difficulty adjustment — monitors performance every 15 seconds
// and adjusts BPM and cue density to keep the patient in the "challenge zone".
//
// Clinical note: adaptation is never punitive — it quietly makes things easier
// when a patient struggles, and gently increases challenge when they thrive.

import { useRef, useCallback, useEffect } from 'react';
import { useGameStore } from './useGameStore';

const EVALUATION_INTERVAL_MS = 15_000;  // check every 15 seconds
const THRIVING_DURATION_MS    = 30_000;  // must thrive for 30 seconds before increasing

export function useAdaptation({ baseBPM, onAdaptation }) {
  const currentBPM       = useRef(baseBPM ?? 55);
  const densityMultiplier = useRef(1.0);
  const easyOnlyMode     = useRef(false);

  const lastEvalTime     = useRef(Date.now());
  const thrivingStart    = useRef(null);

  // Rolling windows for accuracy calculation
  const recentHitCount  = useRef(0);
  const recentMissCount = useRef(0);

  const { setCurrentBPM, setDensityMultiplier } = useGameStore.getState();

  const recordHit = useCallback(() => { recentHitCount.current++; }, []);
  const recordMiss = useCallback(() => { recentMissCount.current++; }, []);

  const evaluate = useCallback(() => {
    const total = recentHitCount.current + recentMissCount.current;
    if (total < 3) return;  // not enough data to judge

    const accuracy = recentHitCount.current / total;

    // Reset window
    recentHitCount.current  = 0;
    recentMissCount.current = 0;

    const base = baseBPM ?? 55;
    const MIN_BPM = base - 10;
    const MAX_BPM = base + 15;

    if (accuracy < 0.50) {
      // Struggling — reduce difficulty
      const newBPM = Math.max(MIN_BPM, currentBPM.current - 3);
      if (newBPM !== currentBPM.current || densityMultiplier.current !== 0.7) {
        currentBPM.current = newBPM;
        densityMultiplier.current = 0.7;
        easyOnlyMode.current = true;
        thrivingStart.current = null;
        setCurrentBPM(newBPM);
        setDensityMultiplier(0.7);
        onAdaptation?.({ reason: 'struggling', fromBPM: currentBPM.current, toBPM: newBPM, accuracy });
      }
    } else if (accuracy > 0.85) {
      // Doing well — track how long
      if (!thrivingStart.current) {
        thrivingStart.current = Date.now();
      }

      const thrivingDuration = Date.now() - thrivingStart.current;
      if (thrivingDuration >= THRIVING_DURATION_MS) {
        // Sustained high performance — increase challenge
        const newBPM = Math.min(MAX_BPM, currentBPM.current + 3);
        if (newBPM !== currentBPM.current || densityMultiplier.current !== 1.0) {
          const prev = currentBPM.current;
          currentBPM.current = newBPM;
          densityMultiplier.current = 1.0;
          easyOnlyMode.current = false;
          setCurrentBPM(newBPM);
          setDensityMultiplier(1.0);
          onAdaptation?.({ reason: 'thriving', fromBPM: prev, toBPM: newBPM, accuracy });
          thrivingStart.current = null; // reset for next cycle
        }
      }
    } else {
      // Moderate performance — maintain current
      thrivingStart.current = null;
    }
  }, [baseBPM, onAdaptation, setCurrentBPM, setDensityMultiplier]);

  // Run evaluation on interval
  useEffect(() => {
    const interval = setInterval(() => {
      evaluate();
    }, EVALUATION_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [evaluate]);

  // Sync initial BPM to store
  useEffect(() => {
    if (baseBPM) {
      currentBPM.current = baseBPM;
      setCurrentBPM(baseBPM);
    }
  }, [baseBPM, setCurrentBPM]);

  const reset = useCallback(() => {
    const base = baseBPM ?? 55;
    currentBPM.current       = base;
    densityMultiplier.current = 1.0;
    easyOnlyMode.current      = false;
    lastEvalTime.current      = Date.now();
    thrivingStart.current     = null;
    recentHitCount.current    = 0;
    recentMissCount.current   = 0;
    setCurrentBPM(base);
    setDensityMultiplier(1.0);
  }, [baseBPM, setCurrentBPM, setDensityMultiplier]);

  return {
    recordHit,
    recordMiss,
    reset,
    getCurrentBPM: () => currentBPM.current,
    getDensityMultiplier: () => densityMultiplier.current,
    isEasyOnlyMode: () => easyOnlyMode.current,
  };
}
