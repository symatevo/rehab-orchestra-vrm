// src/hooks/useCueSequencer.js
// Generates a sorted timeline of cues from calibration + level config + game phase.
// This is the "brain" of the game — all cue scheduling flows from here.

import { useMemo } from 'react';
import { NEVER_CUE } from '../data/movements';

// Phase rules — drives cue density, side selection, and movement set
const PHASE_RULES = {
  warmup_first_half: {
    beatsPerCue: 4,
    includeTargets: false,
    bothSidesAllowed: false,   // only nonAffectedSide
  },
  warmup_second_half: {
    beatsPerCue: 3,
    includeTargets: false,
    bothSidesAllowed: true,
  },
  game_intro: {
    beatsPerCue: 2.5,
    includeTargets: false,
    bothSidesAllowed: true,
  },
  game_build: {
    beatsPerCue: 2,
    includeTargets: true,
    targetFrequency: 0.2,
    targetOnAffectedOnly: true,
    bothSidesAllowed: true,
  },
  game_peak: {
    beatsPerCue: 1.5,
    includeTargets: true,
    targetFrequency: 0.4,
    bothSidesAllowed: true,
  },
  game_resolution: {
    beatsPerCue: 3,
    includeTargets: false,
    bothSidesAllowed: true,
    endOnSuccess: true,
  },
};

// Seeded pseudo-random (deterministic per session for reproducibility)
function seededRandom(seed) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    return (s >>> 0) / 0xffffffff;
  };
}

/**
 * useCueSequencer — returns a sorted array of cue objects.
 *
 * @param {object} options
 * @param {object} options.calibration — from useCalibration()
 * @param {object} options.levelConfig  — from LEVELS[id]
 * @param {string} options.gamePhase    — one of the PHASE_RULES keys
 * @param {number} options.currentBPM   — may differ from base due to adaptation
 * @param {number} options.seed         — deterministic seed for this session
 */
export function useCueSequencer({ calibration, levelConfig, gamePhase, currentBPM, seed = 42 }) {
  return useMemo(() => {
    if (!calibration || !levelConfig || !gamePhase) return [];

    const rand = seededRandom(seed);
    const rules = PHASE_RULES[gamePhase] ?? PHASE_RULES.game_intro;
    const bpm = currentBPM ?? calibration.baseBPM ?? 55;
    const beatInterval = 60 / bpm;   // seconds per beat

    // Build movement pools
    const easyPool = (calibration.easyMovements ?? []).filter(
      (id) => !NEVER_CUE.includes(id) && !id.includes('avoid')
    );
    const targetPool = rules.includeTargets
      ? (calibration.targetMovements ?? []).filter(
          (id) => !NEVER_CUE.includes(id) && !id.includes('avoid')
        )
      : [];

    // Apply MRC-based movement restrictions
    const mrc = calibration.affectedMRC ?? 3;
    const filterForMRC = (id) => {
      if (id.endsWith('_hold') && mrc < 3) return false;
      if ((id === 'elbow_diagonal_ul' || id === 'elbow_diagonal_ur') && mrc < 4) return false;
      return true;
    };

    const filteredEasy = easyPool.filter(filterForMRC);
    const filteredTarget = targetPool.filter(filterForMRC);

    if (filteredEasy.length === 0) {
      console.warn('[useCueSequencer] No easy movements available for phase:', gamePhase);
      return [];
    }

    // Determine which sides can receive cues
    const { affectedSide, nonAffectedSide, isMirrorTherapy, mirrorLeadSide, leftControl, rightControl } = calibration;
    const sides = [];

    if (isMirrorTherapy) {
      // Mirror therapy: only lead side gets cues
      if (mirrorLeadSide) sides.push(mirrorLeadSide);
    } else {
      // Determine active sides based on control modes
      if (leftControl !== 'blocked')  sides.push('left');
      if (rightControl !== 'blocked') sides.push('right');

      // Warmup first half: only nonAffectedSide
      if (!rules.bothSidesAllowed || gamePhase === 'warmup_first_half') {
        const keep = sides.filter((s) => s === nonAffectedSide);
        if (keep.length > 0) sides.length = 0, sides.push(...keep);
      }
    }

    if (sides.length === 0) return [];

    // Generate beat timestamps for the phase duration
    const durationSeconds = levelConfig.durationSeconds ?? 180;
    const phaseStart = getPhaseStartTime(gamePhase, durationSeconds);
    const phaseEnd   = getPhaseEndTime(gamePhase, durationSeconds);

    const cues = [];
    let cueIndex = 0;
    let lastSide = null;
    let sameSideCount = 0;
    let targetBudget = Math.floor((phaseEnd - phaseStart) / beatInterval / (rules.beatsPerCue ?? 2) * (rules.targetFrequency ?? 0));

    let t = phaseStart + beatInterval * (rules.beatsPerCue ?? 2);

    while (t < phaseEnd - beatInterval) {
      // Side selection — avoid 3+ consecutive same side
      let side;
      if (sides.length === 1) {
        side = sides[0];
      } else if (sameSideCount >= 2) {
        side = sides.find((s) => s !== lastSide) ?? sides[0];
      } else {
        side = sides[Math.floor(rand() * sides.length)];
      }

      if (side === lastSide) {
        sameSideCount++;
      } else {
        sameSideCount = 1;
        lastSide = side;
      }

      // Movement selection
      let movementId;
      let tag = 'easy';

      const useTarget = rules.includeTargets &&
        filteredTarget.length > 0 &&
        targetBudget > 0 &&
        rand() < (rules.targetFrequency ?? 0) &&
        (!rules.targetOnAffectedOnly || side === affectedSide);

      if (useTarget) {
        movementId = filteredTarget[Math.floor(rand() * filteredTarget.length)];
        tag = 'yellow';
        targetBudget--;
      } else {
        movementId = filteredEasy[Math.floor(rand() * filteredEasy.length)];
        tag = 'easy';
      }

      cues.push({
        id: `cue_${String(++cueIndex).padStart(4, '0')}`,
        time: parseFloat(t.toFixed(3)),
        side,
        movementId,
        tag,
      });

      t += beatInterval * (rules.beatsPerCue ?? 2);
    }

    return cues.sort((a, b) => a.time - b.time);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [calibration, levelConfig, gamePhase, currentBPM, seed]);
}

// Phase timing within a 3-minute song
function getPhaseStartTime(phase, totalDuration) {
  const map = {
    warmup_first_half:  0,
    warmup_second_half: totalDuration * 0.5,
    game_intro:         0,
    game_build:         45,
    game_peak:          90,
    game_resolution:    135,
  };
  return map[phase] ?? 0;
}

function getPhaseEndTime(phase, totalDuration) {
  const map = {
    warmup_first_half:  totalDuration * 0.5,
    warmup_second_half: totalDuration,
    game_intro:         45,
    game_build:         90,
    game_peak:          135,
    game_resolution:    totalDuration,
  };
  return map[phase] ?? totalDuration;
}
