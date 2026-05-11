// src/hooks/useSessionMetrics.js
// Accumulates all session data in a ref (not state — no re-renders).
// Produces a complete metrics report and triggers JSON download at end of session.

import { useRef, useCallback } from 'react';

export function useSessionMetrics({ calibration, levelId, sessionNumber }) {
  // All raw records stored in refs — zero re-renders during gameplay
  const hits   = useRef([]);   // { cueId, side, movementId, grade, timingOffset, reactionTime, t }
  const misses = useRef([]);   // { cueId, side, movementId, t }
  const romRecords  = useRef({});   // { movementId: maxAngle }
  const adaptations = useRef([]);   // { t, reason, fromBPM, toBPM }
  const startBPM    = useRef(calibration?.baseBPM ?? 55);
  const finalBPM    = useRef(calibration?.baseBPM ?? 55);
  const emgDisconnects = useRef(0);
  const romCalibrationFailed = useRef([]);
  const streakMax   = useRef(0);

  const recordHit = useCallback(({ cueId, side, movementId, grade, timingOffset, reactionTime }) => {
    hits.current.push({ cueId, side, movementId, grade, timingOffset, reactionTime, t: Date.now() });
  }, []);

  const recordMiss = useCallback(({ cueId, side, movementId }) => {
    misses.current.push({ cueId, side, movementId, t: Date.now() });
  }, []);

  const recordROM = useCallback(({ movementId, maxAngle }) => {
    romRecords.current[movementId] = maxAngle;
    if (maxAngle < 5) {
      romCalibrationFailed.current.push(movementId);
    }
  }, []);

  const recordAdaptation = useCallback(({ reason, fromBPM, toBPM }) => {
    adaptations.current.push({ t: Date.now(), reason, fromBPM, toBPM });
    finalBPM.current = toBPM;
  }, []);

  const recordEMGDisconnect = useCallback(() => {
    emgDisconnects.current++;
  }, []);

  const updateStreakMax = useCallback((streak) => {
    if (streak > streakMax.current) streakMax.current = streak;
  }, []);

  const finalizeSession = useCallback(() => {
    const allHits = hits.current;
    const allMisses = misses.current;

    const totalCues = allHits.length + allMisses.length;
    const hitCount = allHits.filter((h) => ['perfect', 'good', 'late'].includes(h.grade)).length;
    const perfectCount = allHits.filter((h) => h.grade === 'perfect').length;
    const goodCount    = allHits.filter((h) => h.grade === 'good').length;
    const lateCount    = allHits.filter((h) => h.grade === 'late').length;
    const missCount    = allMisses.length;
    const wrongCount   = allHits.filter((h) => h.grade === 'wrong').length;

    const hitRate     = totalCues > 0 ? hitCount     / totalCues : 0;
    const perfectRate = totalCues > 0 ? perfectCount / totalCues : 0;
    const goodRate    = totalCues > 0 ? goodCount    / totalCues : 0;
    const lateRate    = totalCues > 0 ? lateCount    / totalCues : 0;
    const missRate    = totalCues > 0 ? missCount    / totalCues : 0;
    const wrongRate   = totalCues > 0 ? wrongCount   / totalCues : 0;

    // Per-side rates
    const affectedSide    = calibration?.affectedSide ?? 'right';
    const nonAffectedSide = calibration?.nonAffectedSide ?? 'left';

    const affHits   = allHits.filter((h) => h.side === affectedSide && ['perfect','good','late'].includes(h.grade)).length;
    const affTotal  = [...allHits, ...allMisses].filter((h) => h.side === affectedSide).length;
    const unaHits   = allHits.filter((h) => h.side === nonAffectedSide && ['perfect','good','late'].includes(h.grade)).length;
    const unaTotal  = [...allHits, ...allMisses].filter((h) => h.side === nonAffectedSide).length;

    const affectedHitRate    = affTotal  > 0 ? affHits  / affTotal  : 0;
    const unaffectedHitRate  = unaTotal  > 0 ? unaHits  / unaTotal  : 0;
    const asymmetryRatio     = unaffectedHitRate > 0 ? affectedHitRate / unaffectedHitRate : null;

    // Timing stats
    const timingOffsets = allHits.filter((h) => h.timingOffset != null).map((h) => h.timingOffset);
    const reactionTimes = allHits.filter((h) => h.reactionTime != null).map((h) => h.reactionTime);

    const mean = (arr) => arr.length > 0 ? arr.reduce((s, v) => s + v, 0) / arr.length : 0;
    const std  = (arr) => {
      if (arr.length < 2) return 0;
      const m = mean(arr);
      return Math.sqrt(arr.reduce((s, v) => s + (v - m) ** 2, 0) / (arr.length - 1));
    };

    const meanTimingOffsetMs = mean(timingOffsets);
    const sdTimingOffsetMs   = std(timingOffsets);
    const meanReactionTimeMs = mean(reactionTimes);

    // Fatigue index: hit rate in first half vs second half of session (by timestamp)
    const allEvents = [...allHits, ...allMisses].sort((a, b) => a.t - b.t);
    let fatigueIndex = null;
    if (allEvents.length >= 4) {
      const midT = (allEvents[0].t + allEvents[allEvents.length - 1].t) / 2;
      const firstHalfHits  = allHits.filter((h) => h.t <= midT && ['perfect','good','late'].includes(h.grade)).length;
      const firstHalfTotal = allEvents.filter((e) => e.t <= midT).length;
      const secondHalfHits  = allHits.filter((h) => h.t > midT && ['perfect','good','late'].includes(h.grade)).length;
      const secondHalfTotal = allEvents.filter((e) => e.t > midT).length;
      const firstRate  = firstHalfTotal  > 0 ? firstHalfHits  / firstHalfTotal  : 0;
      const secondRate = secondHalfTotal > 0 ? secondHalfHits / secondHalfTotal : 0;
      fatigueIndex = secondRate > 0 ? firstRate / secondRate : null;
    }

    const metrics = {
      patientId:    calibration?.patientId ?? 'UNKNOWN',
      sessionNumber,
      date:         new Date().toISOString(),
      levelId,
      songName:     `Level ${levelId}`,

      totalCues,
      hitRate:     parseFloat(hitRate.toFixed(3)),
      perfectRate: parseFloat(perfectRate.toFixed(3)),
      goodRate:    parseFloat(goodRate.toFixed(3)),
      lateRate:    parseFloat(lateRate.toFixed(3)),
      missRate:    parseFloat(missRate.toFixed(3)),
      wrongRate:   parseFloat(wrongRate.toFixed(3)),

      affectedHitRate:   parseFloat(affectedHitRate.toFixed(3)),
      unaffectedHitRate: parseFloat(unaffectedHitRate.toFixed(3)),
      asymmetryRatio:    asymmetryRatio !== null ? parseFloat(asymmetryRatio.toFixed(3)) : null,

      meanTimingOffsetMs: parseFloat(meanTimingOffsetMs.toFixed(1)),
      sdTimingOffsetMs:   parseFloat(sdTimingOffsetMs.toFixed(1)),
      meanReactionTimeMs: parseFloat(meanReactionTimeMs.toFixed(1)),

      movementROM: { ...romRecords.current },

      fatigueIndex: fatigueIndex !== null ? parseFloat(fatigueIndex.toFixed(3)) : null,

      difficultyAdaptations: adaptations.current.length,
      adaptationLog:         adaptations.current,
      startBPM:  startBPM.current,
      finalBPM:  finalBPM.current,

      emgDisconnects:      emgDisconnects.current,
      romCalibrationFailed: [...romCalibrationFailed.current],

      controlMode: {
        left:  calibration?.leftControl,
        right: calibration?.rightControl,
      },

      streakMax: streakMax.current,
    };

    // Persist to localStorage
    try {
      const key = `sessions_${calibration?.patientId ?? 'UNKNOWN'}`;
      const history = JSON.parse(localStorage.getItem(key) || '[]');
      history.push(metrics);
      localStorage.setItem(key, JSON.stringify(history));
    } catch (e) {
      console.warn('[useSessionMetrics] Failed to persist session:', e);
    }

    // Auto-download JSON report
    try {
      const dateStr = new Date().toISOString().slice(0, 10);
      const filename = `${calibration?.patientId ?? 'session'}_session${sessionNumber}_${dateStr}.json`;
      const blob = new Blob([JSON.stringify(metrics, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) {
      console.warn('[useSessionMetrics] Failed to download report:', e);
    }

    return metrics;
  }, [calibration, levelId, sessionNumber]);

  return { recordHit, recordMiss, recordROM, recordAdaptation, recordEMGDisconnect, updateStreakMax, finalizeSession };
}
