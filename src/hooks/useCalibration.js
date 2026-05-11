// src/hooks/useCalibration.js
// Reads, validates, and enriches the calibration payload from localStorage.
// ALL game parameters flow from this hook — never hardcode patient values.

import { useMemo } from 'react';
import { MOVEMENTS, NEVER_CUE } from '../data/movements';
import { useGameStore } from './useGameStore';

// MRC grade → base game parameters.
// Clinical rationale: lower MRC = slower tempo and wider timing window
// so the patient has more time to attempt each movement.
const MRC_CONFIG = {
  0: { bpm: null,  windowMs: null,   note: 'mirror therapy only' },
  1: { bpm: null,  windowMs: null,   note: 'mirror therapy only' },
  2: { bpm: 50,    windowMs: 1000,   note: 'horizontal movements easy, up/fist as targets' },
  3: { bpm: 55,    windowMs: 900,    note: 'hold variants as challenge' },
  4: { bpm: 62,    windowMs: 700,    note: 'full vocabulary, holds frequent' },
  5: { bpm: 65,    windowMs: 600,    note: 'all movements, fastest' },
};

// Demo calibration used when no real calibration exists.
// Allows the game to run end-to-end during development.
const DEMO_CALIBRATION = {
  patientId: 'DEMO-1',
  age: 45,
  gender: 'unknown',
  affectedSide: 'right',
  nonAffectedSide: 'left',
  jointFocus: 'wrist',
  leftControl: 'camera',
  rightControl: 'camera',
  isMirrorTherapy: false,
  mirrorLeadSide: null,
  affectedMRC: 3,
  easyMovements: ['wrist_up', 'wrist_down'],
  targetMovements: ['wrist_fist'],
  movements: [
    { id: 'wrist_up',   tag: 'easy',   included: true, manuallySet: false },
    { id: 'wrist_down', tag: 'easy',   included: true, manuallySet: false },
    { id: 'wrist_fist', tag: 'yellow', included: true, manuallySet: false },
  ],
  motor: {
    left:  { shoulder: true, elbow: true, wrist: true, amputee: false, ampLevel: null, affected: false },
    right: { shoulder: true, elbow: true, wrist: true, amputee: false, ampLevel: null, affected: true  },
  },
  savedAt: new Date().toISOString(),
  _isDemo: true,
};

function parseCalibration() {
  try {
    const raw = localStorage.getItem('calibration');
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    console.error('[useCalibration] Failed to parse calibration JSON:', e);
    return null;
  }
}

function validateCalibration(cal) {
  if (!cal) {
    return { isValid: false, validationError: 'No calibration data found. Please complete the calibration first.' };
  }
  if (cal.leftControl === 'blocked' && cal.rightControl === 'blocked') {
    return { isValid: false, validationError: 'Unable to start — please review the motor assessment in calibration.' };
  }
  // MRC 0-1 without mirror therapy is unusual — allow but warn
  if ((cal.affectedMRC === 0 || cal.affectedMRC === 1) && !cal.isMirrorTherapy) {
    console.warn('[useCalibration] MRC ≤ 1 without mirror therapy — check calibration. Proceeding anyway.');
  }
  return { isValid: true, validationError: null };
}

function deriveParams(cal) {
  const mrc = cal.affectedMRC ?? 3;
  const mrcConfig = MRC_CONFIG[mrc] ?? MRC_CONFIG[3];
  const jointFocus = cal.jointFocus ?? 'wrist';
  const library = MOVEMENTS[jointFocus] ?? MOVEMENTS.wrist;

  // Filter movement library to only movements present in calibration.
  // `included` is an optional field — treat its absence as true (backward compat).
  const movementsArray = cal.movements ?? [];
  const includedIds = new Set(
    movementsArray
      .filter((m) => m.included !== false && !NEVER_CUE.includes(m.id))
      .map((m) => m.id)
  );

  // If no movements were tagged in calibration, include all library movements
  const movementLibrary = includedIds.size > 0
    ? library.filter((m) => includedIds.has(m.id))
    : library.filter((m) => !NEVER_CUE.includes(m.id));

  // Hold variants only allowed for MRC ≥ 3
  const allowHolds = mrc >= 3;
  // Diagonal elbow only for MRC ≥ 4
  const allowDiagonals = mrc >= 4;

  const filteredLibrary = movementLibrary.filter((m) => {
    if (m.hold && !allowHolds) return false;
    if (m.rotationDeg !== undefined && !allowDiagonals) return false;
    return true;
  });

  // Session history from localStorage
  const patientId = cal.patientId ?? 'UNKNOWN';
  let sessionHistory = [];
  try {
    const raw = localStorage.getItem(`sessions_${patientId}`);
    sessionHistory = raw ? JSON.parse(raw) : [];
  } catch (_) { sessionHistory = []; }

  const nextSessionNumber = sessionHistory.length + 1;

  // useAnimations: true if either side needs EMG → pre-built animation mode
  const useAnimations = cal.leftControl === 'emg' || cal.rightControl === 'emg';

  return {
    baseBPM: mrcConfig.bpm,
    timingWindowMs: mrcConfig.windowMs,
    movementLibrary: filteredLibrary,
    useAnimations,
    sessionHistory,
    nextSessionNumber,
    allowHolds,
    allowDiagonals,
  };
}

// useCalibration — returns an enriched calibration object.
// Re-reads localStorage whenever calibrationVersion is bumped (e.g. after patient switch).
export function useCalibration() {
  const calibrationVersion = useGameStore((s) => s.calibrationVersion);
  return useMemo(() => {
    const raw = parseCalibration();
    const source = raw ?? DEMO_CALIBRATION;
    const { isValid, validationError } = validateCalibration(raw);
    const derived = deriveParams(source);

    // Derive easyMovements/targetMovements from the movements array.
    // The calibration tool uses tag:'green' for easy and tag:'yellow' for targets.
    // `included` is optional — absence means included.
    const movementsArray = source.movements ?? [];
    const derivedEasy   = movementsArray
      .filter((m) => m.included !== false && !NEVER_CUE.includes(m.id) && (m.tag === 'easy' || m.tag === 'green'))
      .map((m) => m.id);
    const derivedTarget = movementsArray
      .filter((m) => m.included !== false && !NEVER_CUE.includes(m.id) && m.tag === 'yellow')
      .map((m) => m.id);
    const easyMovements   = (source.easyMovements   && source.easyMovements.length   > 0) ? source.easyMovements   : derivedEasy;
    const targetMovements = (source.targetMovements && source.targetMovements.length > 0) ? source.targetMovements : derivedTarget;

    return {
      // Raw calibration passthrough
      patientId:       source.patientId,
      age:             source.age,
      gender:          source.gender,
      jointFocus:      source.jointFocus,
      affectedSide:    source.affectedSide,
      nonAffectedSide: source.nonAffectedSide,
      leftControl:     source.leftControl,
      rightControl:    source.rightControl,
      isMirrorTherapy: source.isMirrorTherapy,
      mirrorLeadSide:  source.mirrorLeadSide,
      affectedMRC:     source.affectedMRC,
      easyMovements,
      targetMovements,
      movements:       movementsArray,
      motor:           source.motor,
      savedAt:         source.savedAt,
      isDemo:          !!source._isDemo,

      // Validation
      isValid,
      validationError,

      // Derived game parameters
      ...derived,
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [calibrationVersion]); // re-reads whenever physio switches patient
}

// Standalone getter for use outside React (e.g., in Zustand actions)
export function getCalibration() {
  const raw = parseCalibration();
  const source = raw ?? DEMO_CALIBRATION;
  const { isValid, validationError } = validateCalibration(raw);
  const derived = deriveParams(source);
  const movementsArray = source.movements ?? [];
  const derivedEasy   = movementsArray
    .filter((m) => m.included !== false && !NEVER_CUE.includes(m.id) && (m.tag === 'easy' || m.tag === 'green'))
    .map((m) => m.id);
  const derivedTarget = movementsArray
    .filter((m) => m.included !== false && !NEVER_CUE.includes(m.id) && m.tag === 'yellow')
    .map((m) => m.id);
  const easyMovements   = (source.easyMovements   && source.easyMovements.length   > 0) ? source.easyMovements   : derivedEasy;
  const targetMovements = (source.targetMovements && source.targetMovements.length > 0) ? source.targetMovements : derivedTarget;
  return { ...source, easyMovements, targetMovements, isValid, validationError, ...derived, isDemo: !!source._isDemo };
}
