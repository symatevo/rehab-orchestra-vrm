// src/hooks/useMovementBridge.js
// Unified movement detection interface — the rest of the game never directly
// reads MediaPipe or EMG; it only listens to events from this hook.
//
// Camera detection uses personalized ROM thresholds from useROMCalibration.
// Anti-jitter debounce: a movement fires only when detected in ≥3 consecutive frames.

import { useRef, useCallback, useEffect } from 'react';
import { useVideoRecognition } from './useVideoRecognition';
import { useGameStore } from './useGameStore';

// ── Geometry helpers ──────────────────────────────────────────────────────────

function dot(a, b) { return a.x * b.x + a.y * b.y + (a.z ?? 0) * (b.z ?? 0); }
function magnitude(v) { return Math.sqrt(v.x * v.x + v.y * v.y + (v.z ?? 0) * (v.z ?? 0)); }
function angleBetween(a, b) {
  const d = dot(a, b) / (magnitude(a) * magnitude(b) + 1e-8);
  return Math.acos(Math.max(-1, Math.min(1, d))) * (180 / Math.PI);
}
function vec(a, b) { return { x: b.x - a.x, y: b.y - a.y, z: (b.z ?? 0) - (a.z ?? 0) }; }
function dist3(a, b) {
  const dx = a.x - b.x, dy = a.y - b.y, dz = (a.z ?? 0) - (b.z ?? 0);
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

// Compute elbow angle (shoulder→elbow→wrist triangle)
function computeElbowAngle(shoulder, elbow, wrist) {
  const es = vec(elbow, shoulder);
  const ew = vec(elbow, wrist);
  return angleBetween(es, ew);
}

// ── Detection functions ───────────────────────────────────────────────────────

function detectWristMovements(handLandmarks, poseLandmarks, side, thresholds) {
  if (!handLandmarks || handLandmarks.length < 21) return [];
  const events = [];

  // MediaPipe Hand landmarks (camera-space, normalized 0–1)
  const wristBase = handLandmarks[0];
  const mcp_middle = handLandmarks[9];
  const mcp_index  = handLandmarks[5];
  const mcp_ring   = handLandmarks[13];
  const mcp_pinky  = handLandmarks[17];
  const tips = [handLandmarks[8], handLandmarks[12], handLandmarks[16], handLandmarks[20]];
  const mcps = [handLandmarks[5], handLandmarks[9], handLandmarks[13], handLandmarks[17]];

  // WRIST UP: use forearm vs hand tilt in Y
  // When wrist extends upward, the hand moves up relative to the wrist base.
  // We measure the elevation angle of the wrist→middle-MCP vector.
  const handVec = vec(wristBase, mcp_middle);
  const elevationAngle = -Math.atan2(handVec.y, Math.sqrt(handVec.x * handVec.x + (handVec.z ?? 0) * (handVec.z ?? 0))) * (180 / Math.PI);

  const wristUpThresh = thresholds.wrist_up ?? 15;
  if (elevationAngle > wristUpThresh) {
    events.push({ movementId: 'wrist_up', value: elevationAngle, confidence: Math.min(1, elevationAngle / (wristUpThresh * 2)) });
  }

  // WRIST LEFT / RIGHT (radial/ulnar deviation)
  // For right hand: thumb side deviation = wrist_left (radial)
  // For left hand: anatomically mirrored
  const deviationAngle = Math.atan2(handVec.x, Math.abs(handVec.y) + 1e-8) * (180 / Math.PI);
  const lateralSign = side === 'right' ? 1 : -1;   // anatomical mirror

  const wristLeftThresh  = thresholds.wrist_left  ?? 12;
  const wristRightThresh = thresholds.wrist_right ?? 12;

  if (deviationAngle * lateralSign < -wristLeftThresh) {
    events.push({ movementId: 'wrist_left',  value: Math.abs(deviationAngle), confidence: Math.min(1, Math.abs(deviationAngle) / (wristLeftThresh * 2)) });
  } else if (deviationAngle * lateralSign > wristRightThresh) {
    events.push({ movementId: 'wrist_right', value: Math.abs(deviationAngle), confidence: Math.min(1, Math.abs(deviationAngle) / (wristRightThresh * 2)) });
  }

  // WRIST FIST: mean distance fingertip→MCP compared to open baseline
  const meanFistDist = tips.reduce((sum, tip, i) => sum + dist3(tip, mcps[i]), 0) / tips.length;
  const fistThresh = thresholds.wrist_fist ?? 0.10;
  if (meanFistDist < fistThresh) {
    events.push({ movementId: 'wrist_fist', value: meanFistDist, confidence: Math.min(1, (fistThresh - meanFistDist) / fistThresh) });
  }

  // WRIST OPEN: fingertip spread (mean distance between adjacent fingertips)
  const openThresh = thresholds.wrist_open ?? 0.08;
  const spread = (dist3(tips[0], tips[1]) + dist3(tips[1], tips[2]) + dist3(tips[2], tips[3])) / 3;
  if (spread > openThresh && meanFistDist > fistThresh * 1.5) {
    events.push({ movementId: 'wrist_open', value: spread, confidence: Math.min(1, spread / (openThresh * 2)) });
  }

  return events;
}

function detectElbowMovements(poseLandmarks, side, thresholds) {
  if (!poseLandmarks || poseLandmarks.length < 33) return [];
  const events = [];

  // MediaPipe Pose landmark indices
  const shoulderIdx = side === 'left' ? 11 : 12;
  const elbowIdx    = side === 'left' ? 13 : 14;
  const wristIdx    = side === 'left' ? 15 : 16;

  const shoulder = poseLandmarks[shoulderIdx];
  const elbow    = poseLandmarks[elbowIdx];
  const wrist    = poseLandmarks[wristIdx];

  // Skip if landmarks are not visible (visibility < 0.5)
  if ((shoulder.visibility ?? 1) < 0.4) return [];
  if ((elbow.visibility    ?? 1) < 0.4) return [];
  if ((wrist.visibility    ?? 1) < 0.4) return [];  // occluded — skip rather than misfire

  const elbowAngle = computeElbowAngle(shoulder, elbow, wrist);
  const neutralAngle = thresholds.neutral_angle ?? 165;

  // ELBOW UP (flexion): angle decreases from resting value
  const elbowUpThresh = thresholds.elbow_up ?? 30;
  const flexionAmount = neutralAngle - elbowAngle;

  if (flexionAmount > elbowUpThresh) {
    events.push({ movementId: 'elbow_up', value: flexionAmount, confidence: Math.min(1, flexionAmount / (elbowUpThresh * 2)) });
  }

  // ELBOW LEFT / RIGHT: horizontal deviation of forearm vector
  const forearm = vec(elbow, wrist);
  const horizDeviation = Math.atan2(forearm.x, Math.abs(forearm.y) + 1e-8) * (180 / Math.PI);

  const elbowLeftThresh  = thresholds.elbow_left  ?? 15;
  const elbowRightThresh = thresholds.elbow_right ?? 15;

  if (horizDeviation < -elbowLeftThresh) {
    events.push({ movementId: 'elbow_left',  value: Math.abs(horizDeviation), confidence: Math.min(1, Math.abs(horizDeviation) / (elbowLeftThresh * 2)) });
  } else if (horizDeviation > elbowRightThresh) {
    events.push({ movementId: 'elbow_right', value: horizDeviation, confidence: Math.min(1, horizDeviation / (elbowRightThresh * 2)) });
  }

  // ELBOW DIAGONAL: both UP and lateral at 70% of individual thresholds
  const diagThreshFactor = 0.70;
  if (flexionAmount > elbowUpThresh * diagThreshFactor) {
    if (horizDeviation < -elbowLeftThresh  * diagThreshFactor)
      events.push({ movementId: 'elbow_diagonal_ul', value: flexionAmount, confidence: 0.7 });
    if (horizDeviation >  elbowRightThresh * diagThreshFactor)
      events.push({ movementId: 'elbow_diagonal_ur', value: flexionAmount, confidence: 0.7 });
  }

  return events;
}

// ── Debounce tracker ──────────────────────────────────────────────────────────
// A movement fires only when detected in ≥3 consecutive frames (~100ms at 30fps).
// This prevents single-frame noise from triggering false hits.

function createDebouncer(requiredFrames = 3) {
  const frameCount = {};      // movementId → consecutive frame count
  const active = {};          // movementId → currently fired and active
  const prevDetected = new Set(); // which movements were detected in the last frame

  return {
    process(detected) {
      const fired = [];
      const currentIds = new Set(detected.map((d) => d.movementId));

      // Reset any movement that was detected before but is gone now
      for (const id of prevDetected) {
        if (!currentIds.has(id)) {
          frameCount[id] = 0;
          active[id] = false;
        }
      }

      // Update prev set for next frame
      prevDetected.clear();
      for (const id of currentIds) prevDetected.add(id);

      // Increment count for currently detected movements
      detected.forEach(({ movementId }) => {
        frameCount[movementId] = (frameCount[movementId] ?? 0) + 1;
      });

      // Fire when threshold reached and not already active
      detected.forEach(({ movementId, confidence, value }) => {
        if ((frameCount[movementId] ?? 0) >= requiredFrames && !active[movementId]) {
          active[movementId] = true;
          fired.push({ movementId, confidence, value });
        }
      });

      return fired;
    },

    reset() {
      Object.keys(frameCount).forEach((k) => { frameCount[k] = 0; active[k] = false; });
      prevDetected.clear();
    },
  };
}

// ── Hook ─────────────────────────────────────────────────────────────────────

/**
 * useMovementBridge
 * Subscribes to MediaPipe results from useVideoRecognition and emits
 * detected movement events for the game to consume.
 *
 * @param {object} calibration — from useCalibration()
 * @param {object} romThresholds — from useROMCalibration.getROMThresholds()
 * @param {function} onMovement — callback: (event) => void
 *   event: { side, movementId, confidence, timestamp, source }
 */
export function useMovementBridge({ calibration, romThresholds, onMovement }) {
  const latestResults = useRef(null);
  const leftDebouncer  = useRef(createDebouncer(3));
  const rightDebouncer = useRef(createDebouncer(3));
  const isTracking = useRef(false);

  // Hold detection: track how long a movement has been continuously active
  const holdTimers = useRef({});  // { 'left:wrist_up': startTimestamp }

  // Stable ref for onMovement — avoids re-registering the MediaPipe callback
  // every render just because the caller passed a new inline function
  const onMovementRef = useRef(onMovement);
  useEffect(() => { onMovementRef.current = onMovement; });

  const emgConnected = useGameStore((s) => s.emgConnected);
  const jointFocus   = calibration?.jointFocus ?? 'wrist';
  const leftControl  = calibration?.leftControl;
  const rightControl = calibration?.rightControl;

  // Subscribe to MediaPipe results via the dedicated movement-detection callback
  // (separate from the main resultsCallback used by VRMAvatar for bone tracking)
  const setMovementDetectionCallback = useVideoRecognition((state) => state.setMovementDetectionCallback);

  const processResults = useCallback((results) => {
    if (!results || !onMovementRef.current) return;
    latestResults.current = results;
    isTracking.current = true;

    const thresholds = romThresholds ?? {};
    const now = performance.now();

    const processSide = (side, control) => {
      if (control === 'blocked') return;
      if (control === 'emg' && emgConnected) return; // real EMG device handles this side
      if (calibration?.isMirrorTherapy && side === calibration.affectedSide) return;

      let rawEvents = [];

      if (jointFocus === 'wrist') {
        // Camera is NOT mirrored for MediaPipe: leftHandLandmarks = patient's left hand
        const handLandmarks = side === 'left' ? results.leftHandLandmarks : results.rightHandLandmarks;
        rawEvents = detectWristMovements(handLandmarks, results.poseLandmarks, side, thresholds);
      } else {
        rawEvents = detectElbowMovements(results.poseLandmarks, side, thresholds);
      }

      const debouncer = side === 'left' ? leftDebouncer.current : rightDebouncer.current;
      const firedEvents = debouncer.process(rawEvents);

      firedEvents.forEach(({ movementId, confidence }) => {
        // Hold detection: if movement sustained > 500ms → upgrade to hold variant
        const holdKey = `${side}:${movementId}`;
        if (!holdTimers.current[holdKey]) {
          holdTimers.current[holdKey] = now;
        }
        const holdDuration = now - holdTimers.current[holdKey];
        let finalMovementId = movementId;

        if (holdDuration > 500 && (calibration?.affectedMRC ?? 3) >= 3) {
          const holdVariant = movementId + '_hold';
          // Only upgrade if hold variant exists in the calibration movement set
          const inCal = (calibration?.movements ?? []).some((m) => m.id === holdVariant && m.included !== false);
          if (inCal) finalMovementId = holdVariant;
        }

        onMovementRef.current({
          side,
          movementId: finalMovementId,
          confidence,
          timestamp: now,
          source: 'camera',
        });
      });

      // Clear hold timers for movements no longer detected
      Object.keys(holdTimers.current).forEach((key) => {
        if (key.startsWith(`${side}:`)) {
          const mid = key.slice(side.length + 1);
          if (!rawEvents.some((e) => e.movementId === mid)) {
            delete holdTimers.current[key];
          }
        }
      });
    };

    processSide('left',  leftControl);
    processSide('right', rightControl);
  }, [calibration, romThresholds, jointFocus, leftControl, rightControl, emgConnected]);

  useEffect(() => {
    setMovementDetectionCallback(processResults);
    return () => setMovementDetectionCallback(null);
  }, [setMovementDetectionCallback, processResults]);

  return { isTracking };
}
