// src/components/VRMAvatar.jsx
// VRM avatar with three operating modes:
//   Mode 1 — "realtime-tracking":  Kalidokit drives both arms from MediaPipe (lobby + camera game)
//   Mode 2 — "animation-driven":   Pre-built FBX animations play per movement (EMG game)
//   Mode 3 — mirror therapy:       Affected side mirrors lead side (X-axis negated)
//
// Mode 1 is the EXISTING behavior — kept intact.
// Modes 2 and 3 are additive extensions.

import { VRMLoaderPlugin, VRMUtils } from "@pixiv/three-vrm";
import { useAnimations, useFBX, useGLTF } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { Hand, Pose } from "kalidokit";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { Euler, LoopOnce, Quaternion, Vector3 } from "three";
import { useVideoRecognition } from "../hooks/useVideoRecognition";
import { remapMixamoAnimationToVrm } from "../utils/remapMixamoAnimationToVrm";
import { createHandAnimation } from '../utils/createHandAnimation';
import { useCalibration } from '../hooks/useCalibration';
import { useGameStore, GAME_STATES } from '../hooks/useGameStore';

const tmpVec3 = new Vector3();
const tmpQuat = new Quaternion();
const tmpEuler = new Euler();
const neutralQuat = new Quaternion();
const rightArmDownQuat = new Quaternion().setFromEuler(new Euler(0, 0, -1.2));
const leftArmDownQuat  = new Quaternion().setFromEuler(new Euler(0, 0,  1.2));

// Wrist mode: lower arm neutral = elbow flexed to horizontal + supinated palm-toward-camera.
// Values MUST stay in sync with wristNeutralLowerArm() in createHandAnimation.js.
//   Y ±1.4 → elbow flexion angle (same axis as elbow_up; π/2 ≈ 1.57 = fully horizontal)
//   X ∓0.9 → forearm supination so palm faces camera from default sideways T-pose
function _makeWristLowerNeutral(side) {
  const sign = side === 'right' ? 1 : -1;
  return new Quaternion()
    .setFromEuler(new Euler(0, sign * 1.4, 0))
    .multiply(new Quaternion().setFromEuler(new Euler(-0.9, 0, 0)));
}
const wristNeutralRightLowerArm = _makeWristLowerNeutral('right');
const wristNeutralLeftLowerArm  = _makeWristLowerNeutral('left');

// ── Mirror therapy (gameplay): ported from reference RehabOrchestra VRMAvatar ──
// Drive only the non-affected arm from tracking; map onto affected bones via Euler flip.
/** @param {{ x: number; y: number; z: number }} e */
function mirrorEuler(e) {
  return { x: e.x, y: -e.y, z: -e.z };
}

function rotateBoneVrm(vrm, boneName, value, slerpFactor, flip = { x: 1, y: 1, z: 1 }) {
  const bone = vrm.humanoid.getNormalizedBoneNode(boneName);
  if (!bone) return;
  tmpEuler.set(value.x * flip.x, value.y * flip.y, value.z * flip.z);
  tmpQuat.setFromEuler(tmpEuler);
  bone.quaternion.slerp(tmpQuat, slerpFactor);
}

/** Healthy side = RIGHT avatar bones when patient’s LEFT is affected (damaged). */
function applyStarterRightHalfMirror(vrm, pose, rigR, delta) {
  if (!pose) return;
  const da = delta * 5;
  const dh = delta * 12;
  rotateBoneVrm(vrm, 'rightUpperArm', pose.RightUpperArm, da);
  rotateBoneVrm(vrm, 'rightLowerArm', pose.RightLowerArm, da);
  if (!rigR) return;
  rotateBoneVrm(vrm, 'rightHand', {
    z: pose.RightHand?.z ?? 0,
    y: rigR.RightWrist.y,
    x: rigR.RightWrist.x,
  }, dh);
  rotateBoneVrm(vrm, 'rightRingProximal', rigR.RightRingProximal, dh);
  rotateBoneVrm(vrm, 'rightRingIntermediate', rigR.RightRingIntermediate, dh);
  rotateBoneVrm(vrm, 'rightRingDistal', rigR.RightRingDistal, dh);
  rotateBoneVrm(vrm, 'rightIndexProximal', rigR.RightIndexProximal, dh);
  rotateBoneVrm(vrm, 'rightIndexIntermediate', rigR.RightIndexIntermediate, dh);
  rotateBoneVrm(vrm, 'rightIndexDistal', rigR.RightIndexDistal, dh);
  rotateBoneVrm(vrm, 'rightMiddleProximal', rigR.RightMiddleProximal, dh);
  rotateBoneVrm(vrm, 'rightMiddleIntermediate', rigR.RightMiddleIntermediate, dh);
  rotateBoneVrm(vrm, 'rightMiddleDistal', rigR.RightMiddleDistal, dh);
  rotateBoneVrm(vrm, 'rightThumbMetacarpal', rigR.RightThumbProximal, dh);
  rotateBoneVrm(vrm, 'rightThumbProximal', rigR.RightThumbIntermediate, dh);
  rotateBoneVrm(vrm, 'rightThumbDistal', rigR.RightThumbDistal, dh);
  rotateBoneVrm(vrm, 'rightLittleProximal', rigR.RightLittleProximal, dh);
  rotateBoneVrm(vrm, 'rightLittleIntermediate', rigR.RightLittleIntermediate, dh);
  rotateBoneVrm(vrm, 'rightLittleDistal', rigR.RightLittleDistal, dh);
}

/** Healthy side = LEFT avatar bones when patient’s RIGHT is affected. */
function applyStarterLeftHalfMirror(vrm, pose, rigL, delta) {
  if (!pose) return;
  const da = delta * 5;
  const dh = delta * 12;
  rotateBoneVrm(vrm, 'leftUpperArm', pose.LeftUpperArm, da);
  rotateBoneVrm(vrm, 'leftLowerArm', pose.LeftLowerArm, da);
  if (!rigL) return;
  rotateBoneVrm(vrm, 'leftHand', {
    z: -(pose.LeftHand?.z ?? 0),
    y: rigL.LeftWrist.y,
    x: rigL.LeftWrist.x,
  }, dh);
  rotateBoneVrm(vrm, 'leftRingProximal', rigL.LeftRingProximal, dh);
  rotateBoneVrm(vrm, 'leftRingIntermediate', rigL.LeftRingIntermediate, dh);
  rotateBoneVrm(vrm, 'leftRingDistal', rigL.LeftRingDistal, dh);
  rotateBoneVrm(vrm, 'leftIndexProximal', rigL.LeftIndexProximal, dh);
  rotateBoneVrm(vrm, 'leftIndexIntermediate', rigL.LeftIndexIntermediate, dh);
  rotateBoneVrm(vrm, 'leftIndexDistal', rigL.LeftIndexDistal, dh);
  rotateBoneVrm(vrm, 'leftMiddleProximal', rigL.LeftMiddleProximal, dh);
  rotateBoneVrm(vrm, 'leftMiddleIntermediate', rigL.LeftMiddleIntermediate, dh);
  rotateBoneVrm(vrm, 'leftMiddleDistal', rigL.LeftMiddleDistal, dh);
  rotateBoneVrm(vrm, 'leftThumbProximal', rigL.LeftThumbIntermediate, dh);
  rotateBoneVrm(vrm, 'leftThumbMetacarpal', rigL.LeftThumbProximal, dh);
  rotateBoneVrm(vrm, 'leftThumbDistal', rigL.LeftThumbDistal, dh);
  rotateBoneVrm(vrm, 'leftLittleProximal', rigL.LeftLittleProximal, dh);
  rotateBoneVrm(vrm, 'leftLittleIntermediate', rigL.LeftLittleIntermediate, dh);
  rotateBoneVrm(vrm, 'leftLittleDistal', rigL.LeftLittleDistal, dh);
}

/** Mirror RIGHT-side solve onto LEFT bones (affected left limb). */
function applyMirroredLeftFromRightSolve(vrm, pose, rigR, delta) {
  if (!pose || !rigR) return;
  const da = delta * 5;
  const dh = delta * 12;
  rotateBoneVrm(vrm, 'leftUpperArm', mirrorEuler(pose.RightUpperArm), da);
  rotateBoneVrm(vrm, 'leftLowerArm', mirrorEuler(pose.RightLowerArm), da);
  rotateBoneVrm(vrm, 'leftHand', {
    z: -(pose.RightHand?.z ?? 0),
    x: mirrorEuler(rigR.RightWrist).x,
    y: mirrorEuler(rigR.RightWrist).y,
  }, dh);
  rotateBoneVrm(vrm, 'leftRingProximal', mirrorEuler(rigR.RightRingProximal), dh);
  rotateBoneVrm(vrm, 'leftRingIntermediate', mirrorEuler(rigR.RightRingIntermediate), dh);
  rotateBoneVrm(vrm, 'leftRingDistal', mirrorEuler(rigR.RightRingDistal), dh);
  rotateBoneVrm(vrm, 'leftIndexProximal', mirrorEuler(rigR.RightIndexProximal), dh);
  rotateBoneVrm(vrm, 'leftIndexIntermediate', mirrorEuler(rigR.RightIndexIntermediate), dh);
  rotateBoneVrm(vrm, 'leftIndexDistal', mirrorEuler(rigR.RightIndexDistal), dh);
  rotateBoneVrm(vrm, 'leftMiddleProximal', mirrorEuler(rigR.RightMiddleProximal), dh);
  rotateBoneVrm(vrm, 'leftMiddleIntermediate', mirrorEuler(rigR.RightMiddleIntermediate), dh);
  rotateBoneVrm(vrm, 'leftMiddleDistal', mirrorEuler(rigR.RightMiddleDistal), dh);
  rotateBoneVrm(vrm, 'leftThumbMetacarpal', mirrorEuler(rigR.RightThumbProximal), dh);
  rotateBoneVrm(vrm, 'leftThumbProximal', mirrorEuler(rigR.RightThumbIntermediate), dh);
  rotateBoneVrm(vrm, 'leftThumbDistal', mirrorEuler(rigR.RightThumbDistal), dh);
  rotateBoneVrm(vrm, 'leftLittleProximal', mirrorEuler(rigR.RightLittleProximal), dh);
  rotateBoneVrm(vrm, 'leftLittleIntermediate', mirrorEuler(rigR.RightLittleIntermediate), dh);
  rotateBoneVrm(vrm, 'leftLittleDistal', mirrorEuler(rigR.RightLittleDistal), dh);
}

/** Mirror LEFT-side solve onto RIGHT bones (affected right limb). */
function applyMirroredRightFromLeftSolve(vrm, pose, rigL, delta) {
  if (!pose || !rigL) return;
  const da = delta * 5;
  const dh = delta * 12;
  rotateBoneVrm(vrm, 'rightUpperArm', mirrorEuler(pose.LeftUpperArm), da);
  rotateBoneVrm(vrm, 'rightLowerArm', mirrorEuler(pose.LeftLowerArm), da);
  rotateBoneVrm(vrm, 'rightHand', {
    z: pose.LeftHand?.z ?? 0,
    x: mirrorEuler(rigL.LeftWrist).x,
    y: mirrorEuler(rigL.LeftWrist).y,
  }, dh);
  rotateBoneVrm(vrm, 'rightRingProximal', mirrorEuler(rigL.LeftRingProximal), dh);
  rotateBoneVrm(vrm, 'rightRingIntermediate', mirrorEuler(rigL.LeftRingIntermediate), dh);
  rotateBoneVrm(vrm, 'rightRingDistal', mirrorEuler(rigL.LeftRingDistal), dh);
  rotateBoneVrm(vrm, 'rightIndexProximal', mirrorEuler(rigL.LeftIndexProximal), dh);
  rotateBoneVrm(vrm, 'rightIndexIntermediate', mirrorEuler(rigL.LeftIndexIntermediate), dh);
  rotateBoneVrm(vrm, 'rightIndexDistal', mirrorEuler(rigL.LeftIndexDistal), dh);
  rotateBoneVrm(vrm, 'rightMiddleProximal', mirrorEuler(rigL.LeftMiddleProximal), dh);
  rotateBoneVrm(vrm, 'rightMiddleIntermediate', mirrorEuler(rigL.LeftMiddleIntermediate), dh);
  rotateBoneVrm(vrm, 'rightMiddleDistal', mirrorEuler(rigL.LeftMiddleDistal), dh);
  rotateBoneVrm(vrm, 'rightThumbMetacarpal', mirrorEuler(rigL.LeftThumbProximal), dh);
  rotateBoneVrm(vrm, 'rightThumbProximal', mirrorEuler(rigL.LeftThumbIntermediate), dh);
  rotateBoneVrm(vrm, 'rightThumbDistal', mirrorEuler(rigL.LeftThumbDistal), dh);
  rotateBoneVrm(vrm, 'rightLittleProximal', mirrorEuler(rigL.LeftLittleProximal), dh);
  rotateBoneVrm(vrm, 'rightLittleIntermediate', mirrorEuler(rigL.LeftLittleIntermediate), dh);
  rotateBoneVrm(vrm, 'rightLittleDistal', mirrorEuler(rigL.LeftLittleDistal), dh);
}


// Movement ID → Mixamo animation clip name mapping
// These map to FBX files that should exist in /public/models/animations/


export const VRMAvatar = ({
  avatar,
  // Mode: 'realtime-tracking' (default) | 'animation-driven' | 'idle'
  mode = 'realtime-tracking',
  // For animation-driven mode: the current detected movementId
  activeMovement = null,
  // Mirror therapy config
  isMirrorTherapy = false,
  mirrorLeadSide = null,
  ...props
}) => {
  const { scene, userData } = useGLTF(
    `models/${avatar}`,
    undefined,
    undefined,
    (loader) => {
      loader.register((parser) => new VRMLoaderPlugin(parser));
    }
  );

  const gamePhase = useGameStore((s) => s.phase);
  const assetC = useFBX("models/animations/Breathing Idle.fbx");

  const currentVrm = userData.vrm;
// Temporary debug — remove after

const calibration = useCalibration();
const affectedSide = calibration?.affectedSide ?? 'right';
const jointFocus   = calibration?.jointFocus   ?? 'elbow';

// Build all movement clips once per avatar load
const allClips = useMemo(() => {
  if (!currentVrm) return [];
  const visualSide = calibration?.isMirrorTherapy
    ? affectedSide
    : (affectedSide === 'left' ? 'right' : 'left');
  const movementIds = [
    'wrist_up', 'wrist_up_hold',
    'wrist_down',
    'wrist_left', 'wrist_left_hold',
    'wrist_right', 'wrist_right_hold',
    'wrist_fist', 'wrist_open',
    'elbow_up', 'elbow_up_hold',
    'elbow_left', 'elbow_left_hold',
    'elbow_right', 'elbow_right_hold',
    'elbow_diagonal_ul', 'elbow_diagonal_ur',
    'idle',
  ];
  return movementIds.map((id) => {
    const clip = createHandAnimation(currentVrm, id, visualSide);
    clip.name = id;
    return clip;
  });
}, [currentVrm, affectedSide, calibration?.isMirrorTherapy]);

const idleClip = useMemo(() => {
  if (!currentVrm || !assetC) return null;
  const clip = remapMixamoAnimationToVrm(currentVrm, assetC);
  clip.name = 'idle';
  return clip;
}, [assetC, currentVrm]);

const allClipsWithIdle = useMemo(() => {
  const movClips = allClips.filter(c => c.name !== 'idle');
  return idleClip ? [...movClips, idleClip] : movClips;
}, [allClips, idleClip]);

const { actions } = useAnimations(allClipsWithIdle, currentVrm.scene);
const lastAnimName = useRef('idle');

  useEffect(() => {
    const vrm = userData.vrm;
    VRMUtils.removeUnnecessaryVertices(scene);
    VRMUtils.combineSkeletons(scene);
    VRMUtils.combineMorphs(vrm);
    vrm.scene.traverse((obj) => { obj.frustumCulled = false; });

    // Reduce texture anisotropy for game performance
    vrm.scene.traverse((object) => {
      if (object.isMesh && object.material) {
        const mat = object.material;
        if (mat.map)       mat.map.anisotropy = 1;
        if (mat.normalMap) mat.normalMap.anisotropy = 1;
      }
    });
  }, [scene, userData.vrm]);

  // ── Mode 1: Real-time Kalidokit tracking ─────────────────────────────────
  const setResultsCallback = useVideoRecognition((state) => state.setResultsCallback);
  const videoElement       = useVideoRecognition((state) => state.videoElement);
  const gameState          = useVideoRecognition((state) => state.gameState);

  const riggedPose      = useRef();
  const riggedLeftHand  = useRef();
  const riggedRightHand = useRef();

  // Legacy tap-to-start detection (keep for backward compat)
  const setGameState        = useVideoRecognition((state) => state.setGameState);
  const setLastHitResult    = useVideoRecognition((state) => state.setLastHitResult);
  const addScore            = useVideoRecognition((state) => state.addScore);
  const triggerHit          = useVideoRecognition((state) => state.triggerHit);
  const incrementHitArrows  = useVideoRecognition((state) => state.incrementHitArrows);
  const masterMovement      = useVideoRecognition((state) => state.masterMovement);
  const incrementBothHit    = useVideoRecognition((state) => state.incrementBothHit);
  const resetBothHit        = useVideoRecognition((state) => state.resetBothHit);

  const prevLeftHandY    = useRef(null);
  const tapCount         = useRef(0);
  const lastTapTime      = useRef(null);
  const TAP_WINDOW       = 1500;
  const armRaiseCooldown      = useRef(0);
  const armRaiseCooldownRight = useRef(0);
  const prevRightHandY   = useRef(null);
  const HIT_LINE_Z       = -2.5;

  useEffect(() => {
    if (!videoElement) {
      riggedPose.current = null;
      riggedLeftHand.current = null;
      riggedRightHand.current = null;
    }
  }, [videoElement]);

  const resultsCallback = useCallback(
    (results) => {
      if (!videoElement || !currentVrm) return;

      // Only run Kalidokit solving in realtime-tracking mode
      // Skip in animation-driven mode — saves significant CPU (neural net inference)
      if (mode !== 'realtime-tracking') return;

      if (results.za && results.poseLandmarks) {
        riggedPose.current = Pose.solve(results.za, results.poseLandmarks, {
          runtime: "mediapipe",
          video: videoElement,
        });
      }
      // Mirror effect: left hand landmarks → right avatar hand
      if (results.leftHandLandmarks) {
        riggedRightHand.current = Hand.solve(results.leftHandLandmarks, "Right");
      }
      if (results.rightHandLandmarks) {
        riggedLeftHand.current = Hand.solve(results.rightHandLandmarks, "Left");
      }
    },
    [videoElement, currentVrm, mode]
  );

  useEffect(() => {
    setResultsCallback(resultsCallback);
  }, [resultsCallback, setResultsCallback]);

 useEffect(() => {
  if (gamePhase !== GAME_STATES.LOBBY) {
    actions['idle']?.stop();
    return;
  }
  // In lobby — play idle only if camera is off
  if (videoElement) {
    actions['idle']?.stop();
    return;
  }
  const t = setTimeout(() => actions['idle']?.reset().play(), 100);
  return () => {
    clearTimeout(t);
    actions['idle']?.stop();
  };
}, [actions, gamePhase, videoElement]);

// ── Set both arms to rest when animation-driven mode starts ──────────────
useEffect(() => {
  const vrm = userData.vrm;
  if (!vrm) return;

  if (mode === 'animation-driven') {
    // Snap BOTH upper arms down and all other arm/hand bones to neutral.
    // The animation mixer will override the animated arm's bones while playing;
    // this ensures neither arm carries over a camera-tracked pose.
    for (const side of ['left', 'right']) {
      const downQuat = side === 'right' ? rightArmDownQuat : leftArmDownQuat;
      const upperArm = vrm.humanoid.getNormalizedBoneNode(`${side}UpperArm`);
      if (upperArm) upperArm.quaternion.copy(downQuat);

      // Wrist mode: snap lower arm to forward/supinated position; elbow mode: identity
      const lowerArm = vrm.humanoid.getNormalizedBoneNode(`${side}LowerArm`);
      if (lowerArm) {
        if (jointFocus === 'wrist') {
          const wNeutral = side === 'right' ? wristNeutralRightLowerArm : wristNeutralLeftLowerArm;
          lowerArm.quaternion.copy(wNeutral);
        } else {
          lowerArm.quaternion.set(0, 0, 0, 1);
        }
      }

      const toReset = [
        `${side}Hand`,
        ...['Index', 'Middle', 'Ring', 'Little'].flatMap(f =>
          ['Proximal', 'Intermediate', 'Distal'].map(seg => `${side}${f}${seg}`)
        ),
        `${side}ThumbMetacarpal`,
        `${side}ThumbProximal`,
        `${side}ThumbDistal`,
      ];
      toReset.forEach(boneName => {
        const node = vrm.humanoid.getNormalizedBoneNode(boneName);
        if (node) node.quaternion.set(0, 0, 0, 1);
      });
    }
  } else {
    // Leaving animation-driven — reset both upper arms to T-pose
    for (const side of ['left', 'right']) {
      const upperArm = vrm.humanoid.getNormalizedBoneNode(`${side}UpperArm`);
      if (upperArm) upperArm.quaternion.set(0, 0, 0, 1);
    }
  }
}, [mode, userData.vrm]);

  // ── Mode 2: Animation-driven — switch clip based on activeMovement ────────
  useEffect(() => {
  if (mode !== 'animation-driven') {
    Object.values(actions).forEach((action) => action?.stop());
    lastAnimName.current = null;
    return;
  }

  const targetName = activeMovement ?? null;
  if (!targetName) {
    if (lastAnimName.current && actions[lastAnimName.current]) {
      actions[lastAnimName.current]?.fadeOut(0.3);
    }
    lastAnimName.current = null;
    return;
  }

  const actionName = actions[targetName] ? targetName : null;
  if (!actionName) return;

  // Always re-trigger — null always precedes a new cue, so same-movement
  // re-triggers are intentional (each cue is a separate demo repetition).
  actions[lastAnimName.current]?.fadeOut(0.3);
  const anim = actions[actionName];
  if (anim) {
    anim.setLoop(LoopOnce, 1);
    anim.clampWhenFinished = false;
    anim.reset().fadeIn(0.3).play();
  }
  lastAnimName.current = actionName;
}, [mode, activeMovement, actions]);

  // ── Bone rotation helper ──────────────────────────────────────────────────
  const rotateBone = (boneName, value, slerpFactor, flip = { x: 1, y: 1, z: 1 }) => {
    if (!userData.vrm) return;
    rotateBoneVrm(userData.vrm, boneName, value, slerpFactor, flip);
  };

  // ── Mirror therapy (animation-driven only): legacy quaternion mirror ─────
  const applyMirrorTherapyQuaternion = (delta) => {
    if (!isMirrorTherapy || !mirrorLeadSide || !affectedSide) return;
    if (!riggedPose.current) return;

    const leadArmName  = mirrorLeadSide   === 'left' ? 'left'  : 'right';
    const affArmName   = affectedSide     === 'left' ? 'left'  : 'right';

    // Copy lead arm bones to affected arm, negate X for sagittal mirror (EMG / clip-driven limbs)
    const upperLead = userData.vrm.humanoid.getNormalizedBoneNode(`${leadArmName}UpperArm`);
    const lowerLead = userData.vrm.humanoid.getNormalizedBoneNode(`${leadArmName}LowerArm`);
    const upperAff  = userData.vrm.humanoid.getNormalizedBoneNode(`${affArmName}UpperArm`);
    const lowerAff  = userData.vrm.humanoid.getNormalizedBoneNode(`${affArmName}LowerArm`);

    if (upperLead && upperAff) {
      upperAff.quaternion.copy(upperLead.quaternion);
      // Negate X component for sagittal plane mirror
      const q = upperAff.quaternion;
      q.set(-q.x, q.y, q.z, q.w);
    }
    if (lowerLead && lowerAff) {
      lowerAff.quaternion.copy(lowerLead.quaternion);
      const q = lowerAff.quaternion;
      q.set(-q.x, q.y, q.z, q.w);
    }
  };

  // ── useFrame ──────────────────────────────────────────────────────────────
  useFrame((_, delta) => {
    if (!userData.vrm) return;

    if (mode === 'realtime-tracking' && riggedPose.current) {
      const vrm = userData.vrm;

      if (isMirrorTherapy && affectedSide && vrm?.humanoid) {
        const pose = riggedPose.current;
        const rigL = riggedLeftHand.current;
        const rigR = riggedRightHand.current;
        if (affectedSide === 'right') {
          applyStarterRightHalfMirror(vrm, pose, rigR, delta);
          applyMirroredLeftFromRightSolve(vrm, pose, rigR, delta);
        } else {
          applyStarterLeftHalfMirror(vrm, pose, rigL, delta);
          applyMirroredRightFromLeftSolve(vrm, pose, rigL, delta);
        }
      } else {
        // Drive all arm + hand bones from Kalidokit (lobby / normal gameplay)
        rotateBone("leftUpperArm",  riggedPose.current.LeftUpperArm,  delta * 5);
        rotateBone("leftLowerArm",  riggedPose.current.LeftLowerArm,  delta * 5);
        rotateBone("rightUpperArm", riggedPose.current.RightUpperArm, delta * 5);
        rotateBone("rightLowerArm", riggedPose.current.RightLowerArm, delta * 5);

        const driveFinger = (prefix, rigged) => {
          if (!rigged) return;
          const s = delta * 12;
          const side = prefix;
          const Side = side[0].toUpperCase() + side.slice(1);

          rotateBone(`${side}Hand`,            { z: riggedPose.current[`${Side}Hand`].z, y: rigged[`${Side}Wrist`].y, x: rigged[`${Side}Wrist`].x }, s);
          ['Ring', 'Index', 'Middle', 'Little'].forEach((finger) => {
            ['Proximal', 'Intermediate', 'Distal'].forEach((seg) => {
              const key = `${Side}${finger}${seg}`;
              if (rigged[key]) rotateBone(`${side}${finger}${seg}`, rigged[key], s);
            });
          });
          ['Proximal', 'Intermediate', 'Distal'].forEach((seg) => {
            const key = `${Side}Thumb${seg}`;
            const boneName = seg === 'Intermediate' ? `${side}ThumbMetacarpal` : `${side}Thumb${seg}`;
            if (rigged[key]) rotateBone(boneName, rigged[key], s);
          });
        };

        driveFinger('left',  riggedLeftHand.current);
        driveFinger('right', riggedRightHand.current);
      }

      // ── Legacy tap-to-start ──────────────────────────────────────────────
      if (gameState === "waiting") {
        const leftHandY = riggedPose.current.LeftHand?.y;
        if (leftHandY !== undefined && prevLeftHandY.current !== null) {
          const deltaY = prevLeftHandY.current - leftHandY;
          if (Math.abs(deltaY) > 0.05 && deltaY < 0) {
            const now = Date.now();
            if (tapCount.current === 0) {
              tapCount.current = 1;
              lastTapTime.current = now;
            } else if (tapCount.current === 1 && now - lastTapTime.current > 500 && now - lastTapTime.current < 1500) {
              tapCount.current = 0;
              lastTapTime.current = null;
              setGameState("preview");
            }
          }
          if (tapCount.current === 1 && lastTapTime.current && Date.now() - lastTapTime.current > TAP_WINDOW) {
            tapCount.current = 0;
            lastTapTime.current = null;
          }
        }
        prevLeftHandY.current = leftHandY ?? null;
      }

      // ── Legacy arm-raise hit detection ───────────────────────────────────
      if (gameState === "started") {
        if (prevLeftHandY.current === null) prevLeftHandY.current = riggedPose.current.LeftHand?.y ?? 0;
        if (prevRightHandY.current === null) prevRightHandY.current = riggedPose.current.RightHand?.y ?? 0;

        const checkHand = (handY, prevHandY, cooldownRef, side) => {
          if (handY === undefined || prevHandY.current === null) return;
          const dy = prevHandY.current - handY;
          if (dy > 0.05 && cooldownRef.current <= 0) {
            cooldownRef.current = 0.8;
            const arrowPositions = useVideoRecognition.getState().arrowPositions;
            const entries = Object.entries(arrowPositions).filter(([id]) => id.endsWith(`-${side}`));
            if (entries.length > 0) {
              const closest = entries.reduce((best, [id, z]) => {
                const dist = Math.abs(z - HIT_LINE_Z);
                return dist < best.dist ? { id, z, dist } : best;
              }, { id: null, z: null, dist: Infinity });
              const diff = closest.z - HIT_LINE_Z;
              if (closest.dist < 0.9) {
                triggerHit(closest.id);
                incrementHitArrows();
                const isBothCue = closest.id.includes("-right")
                  ? useVideoRecognition.getState().arrowPositions[closest.id.replace("-right", "-left")] !== undefined
                  : useVideoRecognition.getState().arrowPositions[closest.id.replace("-left", "-right")] !== undefined;
                if (isBothCue) {
                  const newCount = useVideoRecognition.getState().bothHitCount + 1;
                  incrementBothHit();
                  if (newCount >= 2) { masterMovement("both"); resetBothHit(); }
                } else {
                  masterMovement(side);
                }
                if (closest.dist < 0.15) { setLastHitResult("PERFECT"); addScore(100); }
                else if (diff < 0)       { setLastHitResult("EARLY");   addScore(50); }
                else                     { setLastHitResult("LATE");    addScore(30); }
              }
            }
          }
          if (cooldownRef.current > 0) cooldownRef.current -= delta;
          prevHandY.current = handY ?? null;
        };
        checkHand(riggedPose.current.LeftHand?.y,  prevLeftHandY,  armRaiseCooldown,      "right");
        checkHand(riggedPose.current.RightHand?.y, prevRightHandY, armRaiseCooldownRight, "left");
      }
    } else if (mode === 'animation-driven') {
      const vrm = userData.vrm;

      // IMPORTANT: drei's useAnimations registers its own useFrame that calls
      // mixer.update() BEFORE this useFrame runs (it was registered first in the
      // component body).  If we slerp unconditionally we overwrite the mixer's
      // bone values every frame, killing the animation.
      // Only pull bones toward rest when NO clip is actively playing.
      const isAnimActive = lastAnimName.current != null
        && actions[lastAnimName.current]?.isRunning();

      if (!isAnimActive) {
        for (const side of ['left', 'right']) {
          const downQuat = side === 'right' ? rightArmDownQuat : leftArmDownQuat;
          const upperArm = vrm.humanoid.getNormalizedBoneNode(`${side}UpperArm`);
          if (upperArm) upperArm.quaternion.slerp(downQuat, 0.3);

          // Wrist mode: lower arm slerps to forward/supinated position; elbow mode: identity
          const lowerArm = vrm.humanoid.getNormalizedBoneNode(`${side}LowerArm`);
          if (lowerArm) {
            const lowerTarget = jointFocus === 'wrist'
              ? (side === 'right' ? wristNeutralRightLowerArm : wristNeutralLeftLowerArm)
              : neutralQuat;
            lowerArm.quaternion.slerp(lowerTarget, 0.3);
          }

          const hand = vrm.humanoid.getNormalizedBoneNode(`${side}Hand`);
          if (hand) hand.quaternion.slerp(neutralQuat, 0.3);

          for (const finger of ['Index', 'Middle', 'Ring', 'Little']) {
            for (const seg of ['Proximal', 'Intermediate', 'Distal']) {
              const b = vrm.humanoid.getNormalizedBoneNode(`${side}${finger}${seg}`);
              if (b) b.quaternion.slerp(neutralQuat, 0.3);
            }
          }

          for (const seg of ['Proximal', 'Intermediate', 'Distal']) {
            const bName = seg === 'Intermediate'
              ? `${side}ThumbMetacarpal`
              : `${side}Thumb${seg}`;
            const b = vrm.humanoid.getNormalizedBoneNode(bName);
            if (b) b.quaternion.slerp(neutralQuat, 0.3);
          }
        }
      }

      if (isMirrorTherapy) applyMirrorTherapyQuaternion(delta);
    }
    userData.vrm.update(delta);
  });

  return (
    <group {...props}>
      <primitive
        object={scene}
        scale-x={1}
        rotation-y={Math.PI}
      />
    </group>
  );
};
