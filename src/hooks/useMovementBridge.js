// src/hooks/useMovementBridge.js
// Unified movement detection interface — the rest of the game never directly
// reads MediaPipe or EMG; it only listens to events from this hook.
//
// Camera detection uses personalized ROM thresholds from useROMCalibration.
// Anti-jitter debounce: a movement fires only when detected in ≥3 consecutive frames.

import { useRef, useCallback, useEffect } from 'react';
import { useVideoRecognition } from './useVideoRecognition';
import { useGameStore, GAME_STATES } from './useGameStore';

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

  // WRIST UP / DOWN: middle fingertip Y relative to wrist base, normalized by hand size.
  // This detects actual wrist flex/extension rather than whole-arm elevation —
  // if the arm rises, both wrist and fingertip move together so the relative value stays flat.
  const tip_middle = handLandmarks[12];
  // 2D reference length (wrist → middle MCP) — also used below for left/right deviation
  const refLen2D = Math.hypot(mcp_middle.x - wristBase.x, mcp_middle.y - wristBase.y) + 0.001;
  // handVec still needed for wrist left/right detection below
  const handVec = vec(wristBase, mcp_middle);
  // MediaPipe Y: 0 = top of frame, 1 = bottom. Positive → tip above wrist (extension/UP)
  const tipVertical = (wristBase.y - tip_middle.y) / refLen2D;

  const wristUpThresh   = thresholds.wrist_up   ?? 0.65;
  const wristDownThresh = thresholds.wrist_down ?? 0.45;
  if (tipVertical > wristUpThresh) {
    events.push({ movementId: 'wrist_up',   value: tipVertical,           confidence: Math.min(1, (tipVertical - wristUpThresh)           / wristUpThresh)   });
  } else if (tipVertical < -wristDownThresh) {
    events.push({ movementId: 'wrist_down', value: Math.abs(tipVertical), confidence: Math.min(1, (Math.abs(tipVertical) - wristDownThresh) / wristDownThresh) });
  }

  // WRIST LEFT / RIGHT (radial/ulnar deviation)
  // For right hand: thumb side deviation = wrist_left (radial)
  // For left hand: anatomically mirrored
  const deviationAngle = Math.atan2(handVec.x, Math.abs(handVec.y) + 1e-8) * (180 / Math.PI);
  const lateralSign = side === 'right' ? 1 : -1;   // anatomical mirror

  const wristLeftThresh  = thresholds.wrist_left  ?? 10;
  const wristRightThresh = thresholds.wrist_right ?? 10;

  if (deviationAngle * lateralSign < -wristLeftThresh) {
    events.push({ movementId: 'wrist_left',  value: Math.abs(deviationAngle), confidence: Math.min(1, Math.abs(deviationAngle) / (wristLeftThresh * 2)) });
  } else if (deviationAngle * lateralSign > wristRightThresh) {
    events.push({ movementId: 'wrist_right', value: Math.abs(deviationAngle), confidence: Math.min(1, Math.abs(deviationAngle) / (wristRightThresh * 2)) });
  }

  // WRIST FIST: reference isHandFist — tip-to-wrist < MCP-to-wrist × ratio, min 3 fingers closed
  const fistRatio = thresholds.wrist_fist_ratio ?? 0.95;
  let closedFingers = 0;
  for (let i = 0; i < 4; i++) {
    if (dist3(tips[i], wristBase) < dist3(mcps[i], wristBase) * fistRatio) closedFingers++;
  }
  if (closedFingers >= 3) {
    events.push({ movementId: 'wrist_fist', value: closedFingers, confidence: closedFingers / 4 });
  }

  // WRIST OPEN: fingertip spread (mean distance between adjacent fingertips)
  const meanFistDist = tips.reduce((sum, tip, i) => sum + dist3(tip, mcps[i]), 0) / tips.length;
  const fistThresh = thresholds.wrist_fist ?? 0.10;
  const openThresh = thresholds.wrist_open ?? 0.08;
  const spread = (dist3(tips[0], tips[1]) + dist3(tips[1], tips[2]) + dist3(tips[2], tips[3])) / 3;
  if (spread > openThresh && meanFistDist > fistThresh * 1.5) {
    events.push({ movementId: 'wrist_open', value: spread, confidence: Math.min(1, spread / (openThresh * 2)) });
  }

  return events;
}

// expr01: smoothed expression01 value for this side (passed in from hook ref)
function detectElbowMovements(poseLandmarks, side, thresholds, expr01) {
  if (!poseLandmarks || poseLandmarks.length < 33) return [];
  const events = [];

  // MediaPipe Pose landmark indices
  const shoulderIdx = side === 'left' ? 11 : 12;
  const elbowIdx    = side === 'left' ? 13 : 14;
  const wristIdx    = side === 'left' ? 15 : 16;

  const shoulder = poseLandmarks[shoulderIdx];
  const elbow    = poseLandmarks[elbowIdx];
  const wrist    = poseLandmarks[wristIdx];

  // Skip if landmarks are not visible
  if ((shoulder.visibility ?? 1) < 0.4) return [];
  if ((elbow.visibility    ?? 1) < 0.4) return [];
  if ((wrist.visibility    ?? 1) < 0.4) return [];

  // ELBOW UP / DOWN: expression01 approach (matches reference project)
  // thresholds.elbow_up_expr  — draggable UP line (default 0.57)
  // thresholds.elbow_down_expr — derived from draggable DOWN line (default ≈ 0.20)
  const upThresh   = thresholds.elbow_up_expr   ?? 0.57;
  const downThresh = thresholds.elbow_down_expr ?? 0.20;

  if (expr01 >= upThresh) {
    events.push({ movementId: 'elbow_up',   value: expr01, confidence: Math.min(1, (expr01 - upThresh)   / (1 - upThresh)) });
  } else if (expr01 <= downThresh) {
    events.push({ movementId: 'elbow_down', value: expr01, confidence: Math.min(1, (downThresh - expr01) / downThresh) });
  }

  const elbowAngle = computeElbowAngle(shoulder, elbow, wrist);

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

  // ELBOW DIAGONAL: UP + lateral at 70% of individual thresholds
  const diagThreshFactor = 0.70;
  if (expr01 >= (thresholds.elbow_up_expr ?? 0.57) * diagThreshFactor) {
    if (horizDeviation < -elbowLeftThresh  * diagThreshFactor)
      events.push({ movementId: 'elbow_diagonal_ul', value: expr01, confidence: 0.7 });
    if (horizDeviation >  elbowRightThresh * diagThreshFactor)
      events.push({ movementId: 'elbow_diagonal_ur', value: expr01, confidence: 0.7 });
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

// ── Fist check (exact reference isHandFist.js — Math.hypot, closed ≥ 3) ──────
function isHandFistCheck(lm) {
  if (!lm || lm.length < 21) return false;
  const w = lm[0];
  const tips = [8, 12, 16, 20];
  const mcps = [5, 9, 13, 17];
  let closed = 0;
  for (let i = 0; i < 4; i++) {
    const t = lm[tips[i]], m = lm[mcps[i]];
    if (Math.hypot(t.x-w.x, t.y-w.y, (t.z??0)-(w.z??0)) <
        Math.hypot(m.x-w.x, m.y-w.y, (m.z??0)-(w.z??0)) * 0.95) closed++;
  }
  return closed >= 3;
}

// ── Hook ─────────────────────────────────────────────────────────────────────

/**
 * useMovementBridge
 * Subscribes to MediaPipe results from useVideoRecognition and emits
 * detected movement events for the game to consume.
 *
 * Also exposes `poseStateRef` — updated every MediaPipe frame with per-side
 * { expr01, isFist } so callers can do continuous frame-based hit detection
 * (ported from reference GameSession.jsx / handExpressionFromPose.js).
 *
 * @param {object} calibration — from useCalibration()
 * @param {object} romThresholds — from useROMCalibration.getROMThresholds()
 * @param {function} onMovement — callback: (event) => void
 *   event: { side, movementId, confidence, timestamp, source }
 */
export function useMovementBridge({ calibration, romThresholds, onMovement, onPoseUpdate }) {
  const latestResults = useRef(null);
  const leftDebouncer  = useRef(createDebouncer(3));
  const rightDebouncer = useRef(createDebouncer(3));
  const isTracking = useRef(false);

  // Smoothed expression01 per side for elbow up/down (alpha=0.72, matches reference)
  const expr01Smooth = useRef({ left: 0.5, right: 0.5 });

  // Continuous pose state — read every game tick for frame-based hit detection
  const poseStateRef = useRef({ left: { expr01: 0.5, isFist: false }, right: { expr01: 0.5, isFist: false } });

  // Hold detection: track how long a movement has been continuously active
  const holdTimers = useRef({});  // { 'left:wrist_up': startTimestamp }

  // Stable refs — avoids re-registering MediaPipe callback on every render.
  // All four inputs are kept in refs so processResults never needs to be recreated.
  const onMovementRef    = useRef(onMovement);
  const onPoseUpdateRef  = useRef(onPoseUpdate);
  const calibrationRef   = useRef(calibration);
  const thresholdsRef    = useRef(romThresholds);
  useEffect(() => { onMovementRef.current   = onMovement;    });
  useEffect(() => { onPoseUpdateRef.current = onPoseUpdate;  });
  useEffect(() => { calibrationRef.current  = calibration;   });
  useEffect(() => { thresholdsRef.current   = romThresholds; });

  const emgConnected    = useGameStore((s) => s.emgConnected);
  const gamePhase       = useGameStore((s) => s.phase);
  const emgConnectedRef = useRef(emgConnected);
  const gamePhaseRef    = useRef(gamePhase);
  useEffect(() => { emgConnectedRef.current = emgConnected; });
  useEffect(() => { gamePhaseRef.current = gamePhase; });

  // Subscribe to MediaPipe results via the dedicated movement-detection callback
  // (separate from the main resultsCallback used by VRMAvatar for bone tracking)
  const setMovementDetectionCallback = useVideoRecognition((state) => state.setMovementDetectionCallback);

  const processResults = useCallback((results) => {
    if (!results || !onMovementRef.current) return;
    latestResults.current = results;
    isTracking.current = true;

    // Always read from refs so this callback never needs to be recreated.
    const calibration  = calibrationRef.current;
    const thresholds   = thresholdsRef.current ?? {};
    const emgConnected = emgConnectedRef.current;
    const jointFocus   = calibration?.jointFocus   ?? 'wrist';
    const leftControl  = calibration?.leftControl;
    const rightControl = calibration?.rightControl;
    const now = performance.now();

    const processSide = (side, control) => {
      if (control === 'blocked') return;
      if (control === 'emg' && emgConnected) return; // real EMG device handles this side
      if (calibration?.isMirrorTherapy && side === calibration.affectedSide) return;

      let rawEvents = [];

      // Update smoothed expression01 (alpha=0.55 — faster response than reference 0.72;
      // 0.72 adds ~66ms lag that causes missed peaks at 100ms processFrame intervals)
      const wristPoseIdx = side === 'left' ? 15 : 16;
      const wristPose = results.poseLandmarks?.[wristPoseIdx];
      if (wristPose) {
        const raw = 1 - wristPose.y;
        const clamped = Math.max(0, Math.min(1, raw));
        expr01Smooth.current[side] = 0.55 * expr01Smooth.current[side] + 0.45 * clamped;
      }

      // Always track fist state regardless of jointFocus (for continuous processFrame)
      const handLandmarksForFist = side === 'left' ? results.leftHandLandmarks : results.rightHandLandmarks;
      const isFist = isHandFistCheck(handLandmarksForFist);

      // Write to poseStateRef every frame — read by App.jsx processFrame each game tick
      poseStateRef.current[side] = { expr01: expr01Smooth.current[side], isFist };

      if (jointFocus === 'wrist') {
        // Camera is NOT mirrored for MediaPipe: leftHandLandmarks = patient's left hand
        const handLandmarks = side === 'left' ? results.leftHandLandmarks : results.rightHandLandmarks;
        rawEvents = detectWristMovements(handLandmarks, results.poseLandmarks, side, thresholds);
      } else {
        rawEvents = detectElbowMovements(results.poseLandmarks, side, thresholds, expr01Smooth.current[side]);
      }

      const debouncer = side === 'left' ? leftDebouncer.current : rightDebouncer.current;
      const firedEvents = debouncer.process(rawEvents);

      firedEvents.forEach(({ movementId, confidence }) => {
        //console.log(`Detected: ${movementId}`);
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

    // During performance only: copy lead limb pose onto affected side for PoseBar / hit logic.
    const inPerformance = gamePhaseRef.current === GAME_STATES.PERFORMANCE
      || gamePhaseRef.current === GAME_STATES.PAUSED;
    if (
      inPerformance
      && calibration?.isMirrorTherapy
      && calibration.mirrorLeadSide
      && calibration.affectedSide
    ) {
      const lead = calibration.mirrorLeadSide;
      const aff = calibration.affectedSide;
      if (lead !== aff) {
        const src = poseStateRef.current[lead];
        if (src) poseStateRef.current[aff] = { expr01: src.expr01, isFist: src.isFist };
      }
    }

    // Run hit detection at MediaPipe cadence (~30 fps) instead of waiting for the 100ms game tick.
    // This eliminates the up-to-100ms gap that caused arm-peak misses.
    onPoseUpdateRef.current?.();

    // Mirror therapy: fire the same events on the affected side that fired on the non-affected side
    if (calibration?.isMirrorTherapy && calibration.affectedSide) {
      const mirrorSide    = calibration.affectedSide;
      const leadSide      = mirrorSide === 'left' ? 'right' : 'left';
      const leadControl   = leadSide === 'left' ? leftControl : rightControl;
      if (leadControl !== 'blocked') {
        let rawEvents = [];
        if (jointFocus === 'wrist') {
          const handLandmarks = leadSide === 'left' ? results.leftHandLandmarks : results.rightHandLandmarks;
          rawEvents = detectWristMovements(handLandmarks, results.poseLandmarks, leadSide, thresholds);
        } else {
          rawEvents = detectElbowMovements(results.poseLandmarks, leadSide, thresholds, expr01Smooth.current[leadSide]);
        }
        const debouncer = mirrorSide === 'left' ? leftDebouncer.current : rightDebouncer.current;
        const firedEvents = debouncer.process(rawEvents);
        firedEvents.forEach(({ movementId, confidence }) => {
          onMovementRef.current({
            side: mirrorSide,
            movementId,
            confidence,
            timestamp: now,
            source: 'mirror',
          });
        });
      }
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps — all inputs are read from stable refs

  useEffect(() => {
    // Capture whatever callback was active before we register ours.
    // On cleanup (e.g. WarmUp unmounting) we restore it instead of nulling,
    // so App's bridge regains control without needing to re-run its own effect.
    const prev = useVideoRecognition.getState().movementDetectionCallback ?? null;
    setMovementDetectionCallback(processResults);
    return () => setMovementDetectionCallback(prev);
  }, [setMovementDetectionCallback, processResults]);

  return { isTracking, poseStateRef };
}
