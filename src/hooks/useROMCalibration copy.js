// src/hooks/useROMCalibration.js
// Records Range-of-Motion during warm-up to set personalised detection thresholds.
//
// Clinical rationale: patients with motor impairments have widely varying ROM.
// Hardcoded angle thresholds would either miss most movements (too high)
// or fire constantly (too low). Recording the patient's actual maximum and
// using 60% of that gives a reliably achievable target.

import { useRef, useCallback, useEffect } from 'react';
import { useVideoRecognition } from './useVideoRecognition';

// Minimum viable thresholds when a patient can barely move
const MINIMUM_THRESHOLDS = {
  angle: 3,    // degrees — any visible wrist/elbow movement triggers detection
  ratio: 0.05, // ratio for grip measurements
};

// 60% of max — clinically validated: achievable but not trivially triggered
const THRESHOLD_FACTOR = 0.60;

// ── Geometry helpers (duplicated from useMovementBridge to keep hook self-contained) ──
function vec(a, b) { return { x: b.x - a.x, y: b.y - a.y, z: (b.z ?? 0) - (a.z ?? 0) }; }
function dist3(a, b) {
  const dx = a.x - b.x, dy = a.y - b.y, dz = (a.z ?? 0) - (b.z ?? 0);
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

// Extract the raw measurement value for a given movement from MediaPipe hand landmarks.
// Returns null if landmarks are unavailable.
function extractMeasurement(movementId, handLandmarks) {
  if (!handLandmarks || handLandmarks.length < 21) return null;

  const wristBase  = handLandmarks[0];
  const mcpMiddle  = handLandmarks[9];
  const tips = [handLandmarks[8], handLandmarks[12], handLandmarks[16], handLandmarks[20]];
  const mcps = [handLandmarks[5], handLandmarks[9], handLandmarks[13], handLandmarks[17]];
  const handVec = vec(wristBase, mcpMiddle);

  if (movementId === 'wrist_up' || movementId === 'wrist_up_hold') {
    const angle = -Math.atan2(handVec.y, Math.sqrt(handVec.x ** 2 + (handVec.z ?? 0) ** 2)) * (180 / Math.PI);
    return Math.max(0, angle);
  }
  if (movementId === 'wrist_left' || movementId === 'wrist_left_hold' ||
      movementId === 'wrist_right' || movementId === 'wrist_right_hold') {
    const angle = Math.atan2(handVec.x, Math.abs(handVec.y) + 1e-8) * (180 / Math.PI);
    return Math.abs(angle);
  }
  if (movementId === 'wrist_open') {
    return (dist3(tips[0], tips[1]) + dist3(tips[1], tips[2]) + dist3(tips[2], tips[3])) / 3;
  }
  if (movementId === 'wrist_fist') {
    // For fist: patient IS closing their hand during recording.
    // Record (1 - normalised dist) so that a tighter fist = higher recorded value.
    const meanDist = tips.reduce((sum, tip, i) => sum + dist3(tip, mcps[i]), 0) / tips.length;
    // Invert: 0.20 open hand → 0, 0.03 tight fist → ~0.17 (stored as max, used as fist threshold)
    return Math.max(0, 0.20 - meanDist);
  }
  return null;
}

export function useROMCalibration({ calibration }) {
  // Raw maximum values observed per movement per recording session
  const rawMaxValues = useRef({});     // { movementId: maxValue }
  const isRecording = useRef(false);
  const currentMovementId = useRef(null);
  const recordingTimer = useRef(null);
  const sampleBuffer = useRef([]);

  // Records are locked after first successful attempt
  const lockedMovements = useRef(new Set());

  const startRecording = useCallback((movementId) => {
    if (lockedMovements.current.has(movementId)) {
      // Already calibrated — don't overwrite with subsequent attempts
      return;
    }
    isRecording.current = true;
    currentMovementId.current = movementId;
    sampleBuffer.current = [];

    // Auto-stop after 3 seconds
    if (recordingTimer.current) clearTimeout(recordingTimer.current);
    recordingTimer.current = setTimeout(() => {
      stopRecording();
    }, 3000);
  }, []);

  const stopRecording = useCallback(() => {
    if (!isRecording.current) return;
    isRecording.current = false;

    const movementId = currentMovementId.current;
    if (!movementId) return;

    const samples = sampleBuffer.current;
    if (samples.length > 0) {
      const maxVal = Math.max(...samples);
      rawMaxValues.current[movementId] = maxVal;
      lockedMovements.current.add(movementId);

      if (maxVal < (isRatioMeasurement(movementId) ? MINIMUM_THRESHOLDS.ratio * 5 : MINIMUM_THRESHOLDS.angle * 2)) {
        console.warn(`[useROMCalibration] Very low ROM for ${movementId}: ${maxVal.toFixed(2)} — setting minimum threshold`);
      }
    }

    currentMovementId.current = null;
    sampleBuffer.current = [];
    if (recordingTimer.current) {
      clearTimeout(recordingTimer.current);
      recordingTimer.current = null;
    }
  }, []);

  // Called every frame during recording with the current measurement value
  const recordSample = useCallback((value) => {
    if (!isRecording.current) return;
    if (typeof value === 'number' && !isNaN(value)) {
      sampleBuffer.current.push(Math.abs(value));
    }
  }, []);

  // Returns the final threshold object for all recorded movements
  const getROMThresholds = useCallback(() => {
    const thresholds = {};
    const raw = rawMaxValues.current;

    for (const [movementId, maxVal] of Object.entries(raw)) {
      if (movementId === 'wrist_fist') {
        // Stored as (0.20 - meanDist) — convert back to distance threshold.
        // maxVal = tightest fist reached. Set detection threshold slightly looser.
        const tightestDist = Math.max(0, 0.20 - maxVal);
        // Allow up to THRESHOLD_FACTOR looser than their tightest fist
        thresholds.wrist_fist = tightestDist + (0.20 - tightestDist) * (1 - THRESHOLD_FACTOR);
        continue;
      }

      const isRatio = isRatioMeasurement(movementId);
      const minThresh = isRatio ? MINIMUM_THRESHOLDS.ratio : MINIMUM_THRESHOLDS.angle;

      const computed = maxVal * THRESHOLD_FACTOR;
      thresholds[movementId] = Math.max(computed, minThresh);
    }

    // Add neutral_angle (for elbow rest position)
    if (raw.neutral_angle !== undefined) {
      thresholds.neutral_angle = raw.neutral_angle;
    } else {
      thresholds.neutral_angle = 165; // typical resting elbow angle
    }

    return thresholds;
  }, []);

  // Returns the raw maximum values for session metrics reporting
  const getRawROM = useCallback(() => {
    return { ...rawMaxValues.current };
  }, []);

  // Record the patient's neutral/resting position (call during the rest cue)
  const recordNeutralAngle = useCallback((elbowAngleDeg) => {
    if (typeof elbowAngleDeg === 'number' && !isNaN(elbowAngleDeg)) {
      rawMaxValues.current.neutral_angle = elbowAngleDeg;
    }
  }, []);

  // Called every MediaPipe frame — extracts the right measurement for the active movement
  const setROMCalibrationCallback = useVideoRecognition((s) => s.setROMCalibrationCallback);
  const affectedSide = calibration?.affectedSide ?? 'right';
  const jointFocus   = calibration?.jointFocus   ?? 'wrist';

  const processFrame = useCallback((results) => {
    if (!isRecording.current || !currentMovementId.current) return;
    const movementId = currentMovementId.current;

    let handLandmarks = null;
    if (jointFocus === 'wrist') {
      handLandmarks = affectedSide === 'left' ? results.leftHandLandmarks : results.rightHandLandmarks;
    }

    const value = extractMeasurement(movementId, handLandmarks);
    if (value !== null) recordSample(value);
  }, [affectedSide, jointFocus, recordSample]);

  useEffect(() => {
    setROMCalibrationCallback(processFrame);
    return () => setROMCalibrationCallback(null);
  }, [setROMCalibrationCallback, processFrame]);

  return { startRecording, stopRecording, recordSample, recordNeutralAngle, getROMThresholds, getRawROM };
}

// Grip measurements are ratios (0–1), not angles
function isRatioMeasurement(movementId) {
  return movementId === 'wrist_fist' || movementId === 'wrist_open';
}
