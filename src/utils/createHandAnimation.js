// src/utils/createHandAnimation.js
// Creates THREE.AnimationClip objects for each rehab movement.
//
// IMPORTANT: Before playing any animation, VRMAvatar sets the upperArm bone
// to the down position (via useEffect when mode = 'animation-driven').
// So all animations here assume upperArm is already down — no need to animate it.
//
// Coordinate system (VRM normalized bones, avatar facing +Z toward camera):
//   X → left (+) / right (-)
//   Y → up (+) / down (-)
//   Z → forward toward camera (+) / backward (-)
//
// Lower arm axes (when upper arm is pointing DOWN after rightArmDownQuat):
//   Y rotation → swings arm up/forward in sagittal plane (same as elbow_up)
//   X rotation → forearm roll (pronation / supination)
//   Z rotation → swings arm left/right in frontal plane
//
// Hand axes (when forearm is forward, palm toward camera):
//   Y rotation → dorsiflexion / palmar flexion (wrist up/down)
//   Z rotation → radial / ulnar deviation (wrist left/right)
//   X rotation → finger-axis roll (not used for wrist rehab)


import {
  AnimationClip,
  Euler,
  Quaternion,
  QuaternionKeyframeTrack,
} from 'three';

// ── Helpers ───────────────────────────────────────────────────────────────────

function q(ex, ey, ez) {
  const quat = new Quaternion();
  quat.setFromEuler(new Euler(ex, ey, ez, 'XYZ'));
  return quat;
}

function qMul(a, b) {
  return a.clone().multiply(b);
}

const NEUTRAL = new Quaternion(0, 0, 0, 1);

// Simple swing: neutral → peak → neutral
function swingTrack(nodeName, peakQuat, duration) {
  const half = duration / 2;
  return new QuaternionKeyframeTrack(
    nodeName + '.quaternion',
    [0, half, duration],
    [
      ...NEUTRAL.toArray(),
      ...peakQuat.toArray(),
      ...NEUTRAL.toArray(),
    ]
  );
}

function boneNode(vrm, boneName) {
  return vrm?.humanoid?.getNormalizedBoneNode(boneName);
}

// ── Wrist neutral lower arm position ─────────────────────────────────────────
// Forearm raised to horizontal, pointing toward camera, palm facing camera.
//
// Step 1 — Y rotation (same axis as elbow_up): elbow flexion to ~horizontal
//   sign=-1 for right, +1 for left (matches elbow_up sign convention)
// Step 2 — X rotation: forearm supination so palm rotates from sideways → camera-facing
//
// Tuning:
//   Y value 1.4  → elbow flexion angle (π/2 ≈ 1.57 = fully horizontal)
//   X value 0.9  → supination degree (higher = more palm-toward-camera)
//
// VRMAvatar.jsx has matching module-level constants that MUST stay in sync.
function wristNeutralLowerArm(s) {
  const sign = s === 'right' ? 1 : -1;
  const flex = q(0, sign * 1.4, 0);    // elbow flexion to horizontal
  const supi = q(-0.9, 0, 0);  // supinate: palm toward camera
  return flex.clone().multiply(supi);
}

// ── Wrist movements ───────────────────────────────────────────────────────────
// Lower arm holds at wristNeutralLowerArm throughout each animation.
// Only the hand joint animates for wrist flex/deviation.
// Finger joints animate for fist/open.

function makeWristUp(vrm, s, duration = 1.4) {
  const lowerArmNode = boneNode(vrm, `${s}LowerArm`);
  const handNode     = boneNode(vrm, `${s}Hand`);
  if (!lowerArmNode || !handNode) return new AnimationClip(`wrist_up_${s}`, duration, []);

  const base = wristNeutralLowerArm(s);
  const sign = s === 'right' ? -1 : 1;
  // Y axis = dorsiflexion (hand bends upward relative to forearm)
  const handPeak = q(0, 0, -sign * 0.6);

  return new AnimationClip(`wrist_up_${s}`, duration, [
    // Lower arm stays at wrist-neutral position throughout
    new QuaternionKeyframeTrack(
      lowerArmNode.name + '.quaternion',
      [0, duration],
      [...base.toArray(), ...base.toArray()]
    ),
    swingTrack(handNode.name, handPeak, duration),
  ]);
}

function makeWristUpHold(vrm, s, duration = 2.4) {
  const lowerArmNode = boneNode(vrm, `${s}LowerArm`);
  const handNode     = boneNode(vrm, `${s}Hand`);
  if (!lowerArmNode || !handNode) return new AnimationClip(`wrist_up_hold_${s}`, duration, []);

  const base = wristNeutralLowerArm(s);
  const sign = s === 'right' ? -1 : 1;
  const handPeak = q(0, 0, -sign * 0.6);

  const t1 = duration * 0.20;  // reach peak
  const t2 = duration * 0.75;  // hold until here
  const t3 = duration;          // return to neutral

  return new AnimationClip(`wrist_up_hold_${s}`, duration, [
    new QuaternionKeyframeTrack(
      lowerArmNode.name + '.quaternion',
      [0, t3],
      [...base.toArray(), ...base.toArray()]
    ),
    new QuaternionKeyframeTrack(
      handNode.name + '.quaternion',
      [0, t1, t2, t3],
      [
        ...NEUTRAL.toArray(),
        ...handPeak.toArray(),
        ...handPeak.toArray(),  // hold at peak
        ...NEUTRAL.toArray(),
      ]
    ),
  ]);
}

// Palmar flexion — opposite peak rotation on the same axis as wrist_up (see makeWristUp).
function makeWristDown(vrm, s, duration = 1.4) {
  const lowerArmNode = boneNode(vrm, `${s}LowerArm`);
  const handNode     = boneNode(vrm, `${s}Hand`);
  if (!lowerArmNode || !handNode) return new AnimationClip(`wrist_down_${s}`, duration, []);

  const base = wristNeutralLowerArm(s);
  const sign = s === 'right' ? -1 : 1;
  const handPeak = q(0, 0, sign * 0.6);

  return new AnimationClip(`wrist_down_${s}`, duration, [
    new QuaternionKeyframeTrack(
      lowerArmNode.name + '.quaternion',
      [0, duration],
      [...base.toArray(), ...base.toArray()]
    ),
    swingTrack(handNode.name, handPeak, duration),
  ]);
}

function makeWristLeft(vrm, s, duration = 1.4) {
  const lowerArmNode = boneNode(vrm, `${s}LowerArm`);
  const handNode     = boneNode(vrm, `${s}Hand`);
  if (!lowerArmNode || !handNode) return new AnimationClip(`wrist_left_${s}`, duration, []);

  const base = wristNeutralLowerArm(s);
  const sign = s === 'right' ? -1 : -1;
  // Z axis = radial/ulnar deviation (hand tilts left relative to forearm)
  const handPeak = q(0, sign * 0.55, 0);

  return new AnimationClip(`wrist_left_${s}`, duration, [
    new QuaternionKeyframeTrack(
      lowerArmNode.name + '.quaternion',
      [0, duration],
      [...base.toArray(), ...base.toArray()]
    ),
    swingTrack(handNode.name, handPeak, duration),
  ]);
}

function makeWristLeftHold(vrm, s, duration = 2.4) {
  const lowerArmNode = boneNode(vrm, `${s}LowerArm`);
  const handNode     = boneNode(vrm, `${s}Hand`);
  if (!lowerArmNode || !handNode) return new AnimationClip(`wrist_left_hold_${s}`, duration, []);

  const base = wristNeutralLowerArm(s);
  const sign = s === 'right' ? -1 : -1;
  const handPeak = q(0, sign * 0.55, 0);

  const t1 = duration * 0.20;
  const t2 = duration * 0.75;
  const t3 = duration;

  return new AnimationClip(`wrist_left_hold_${s}`, duration, [
    new QuaternionKeyframeTrack(
      lowerArmNode.name + '.quaternion',
      [0, t3],
      [...base.toArray(), ...base.toArray()]
    ),
    new QuaternionKeyframeTrack(
      handNode.name + '.quaternion',
      [0, t1, t2, t3],
      [
        ...NEUTRAL.toArray(),
        ...handPeak.toArray(),
        ...handPeak.toArray(),
        ...NEUTRAL.toArray(),
      ]
    ),
  ]);
}

function makeWristRight(vrm, s, duration = 1.4) {
  const lowerArmNode = boneNode(vrm, `${s}LowerArm`);
  const handNode     = boneNode(vrm, `${s}Hand`);
  if (!lowerArmNode || !handNode) return new AnimationClip(`wrist_right_${s}`, duration, []);

  const base = wristNeutralLowerArm(s);
  const sign = s === 'right' ? -1 : -1;
  // Z axis, opposite direction from wrist_left
  const handPeak = q(0, -(sign * 0.5), 0);

  return new AnimationClip(`wrist_right_${s}`, duration, [
    new QuaternionKeyframeTrack(
      lowerArmNode.name + '.quaternion',
      [0, duration],
      [...base.toArray(), ...base.toArray()]
    ),
    swingTrack(handNode.name, handPeak, duration),
  ]);
}

function makeWristRightHold(vrm, s, duration = 2.4) {
  const lowerArmNode = boneNode(vrm, `${s}LowerArm`);
  const handNode     = boneNode(vrm, `${s}Hand`);
  if (!lowerArmNode || !handNode) return new AnimationClip(`wrist_right_hold_${s}`, duration, []);

  const base = wristNeutralLowerArm(s);
  const sign = s === 'right' ? -1 : -1;
  const handPeak = q(0, -(sign * 0.6), 0);

  const t1 = duration * 0.20;
  const t2 = duration * 0.75;
  const t3 = duration;

  return new AnimationClip(`wrist_right_hold_${s}`, duration, [
    new QuaternionKeyframeTrack(
      lowerArmNode.name + '.quaternion',
      [0, t3],
      [...base.toArray(), ...base.toArray()]
    ),
    new QuaternionKeyframeTrack(
      handNode.name + '.quaternion',
      [0, t1, t2, t3],
      [
        ...NEUTRAL.toArray(),
        ...handPeak.toArray(),
        ...handPeak.toArray(),
        ...NEUTRAL.toArray(),
      ]
    ),
  ]);
}

function makeWristFist(vrm, s, duration = 1.2) {
  const lowerArmNode = boneNode(vrm, `${s}LowerArm`);
  if (!lowerArmNode) return new AnimationClip(`wrist_fist_${s}`, duration, []);

  const base = wristNeutralLowerArm(s);
  const tracks = [
    new QuaternionKeyframeTrack(
      lowerArmNode.name + '.quaternion',
      [0, duration],
      [...base.toArray(), ...base.toArray()]
    ),
  ];

  const fingers = ['Index', 'Middle', 'Ring', 'Little'];
  const curlAmounts = [2, 3, 5];
  const sign = s === 'right' ? -1 : 1;
  fingers.forEach((f) => {
    ['Proximal', 'Intermediate', 'Distal'].forEach((seg, i) => {
      const node = boneNode(vrm, `${s}${f}${seg}`);
      if (node) tracks.push(swingTrack(node.name, q(0,0, sign * curlAmounts[i]), duration));
    });
  });

  const thumbMeta = boneNode(vrm, `${s}ThumbMetacarpal`);
  const thumbProx = boneNode(vrm, `${s}ThumbProximal`);
  const thumbDist = boneNode(vrm, `${s}ThumbDistal`);
  if (thumbMeta) tracks.push(swingTrack(thumbMeta.name, q(0, sign * 0.5, sign * 0.5), duration));
  if (thumbProx) tracks.push(swingTrack(thumbProx.name, q(0, -sign * 4, sign * 4), duration));
  if (thumbDist) tracks.push(swingTrack(thumbDist.name, q(0, sign * 5, sign * 8),   duration));

  return new AnimationClip(`wrist_fist_${s}`, duration, tracks);
}

function makeWristOpen(vrm, s, duration = 1.2) {
const lowerArmNode = boneNode(vrm, `${s}LowerArm`);
  if (!lowerArmNode) return new AnimationClip(`wrist_fist_${s}`, duration, []);

  const base = wristNeutralLowerArm(s);
  const tracks = [
    new QuaternionKeyframeTrack(
      lowerArmNode.name + '.quaternion',
      [0, duration],
      [...base.toArray(), ...base.toArray()]
    ),
  ];

  
  const fingers = ['Index'];
  const curlAmounts = [0.2, 0, 0];
  const sign = s === 'right' ? -1 : 1;
  fingers.forEach((f) => {
    ['Proximal', 'Intermediate', 'Distal'].forEach((seg, i) => {
      const node = boneNode(vrm, `${s}${f}${seg}`);
      if (node) tracks.push(swingTrack(node.name, q(0, -sign * curlAmounts[i], 0), duration));
    });
  });

  const fingers_c = ['Middle'];
  const curlAmounts_c = [0.1, 0, 0];
  fingers_c.forEach((f) => {
    ['Proximal', 'Intermediate', 'Distal'].forEach((seg, i) => {
      const node = boneNode(vrm, `${s}${f}${seg}`);
      if (node) tracks.push(swingTrack(node.name, q(0, -sign * curlAmounts_c[i], 0), duration));
    });
  });
  const fingers_d = ['Ring'];
  const curlAmounts_d = [0.1, 0, 0];
  fingers_d.forEach((f) => {
    ['Proximal', 'Intermediate', 'Distal'].forEach((seg, i) => {
      const node = boneNode(vrm, `${s}${f}${seg}`);
      if (node) tracks.push(swingTrack(node.name, q(0, sign * curlAmounts_d[i], 0), duration));
    });
  });
  const fingers_b = ['Little'];
  const curlAmounts_b = [0.2, 0, 0];
  fingers_b.forEach((f) => {
    ['Proximal', 'Intermediate', 'Distal'].forEach((seg, i) => {
      const node = boneNode(vrm, `${s}${f}${seg}`);
      if (node) tracks.push(swingTrack(node.name, q(0, sign * curlAmounts_b[i], 0), duration));
    });
  });
  const thumbMeta = boneNode(vrm, `${s}ThumbMetacarpal`);
  const thumbProx = boneNode(vrm, `${s}ThumbProximal`);
  const thumbDist = boneNode(vrm, `${s}ThumbDistal`);
  if (thumbMeta) tracks.push(swingTrack(thumbMeta.name, q(0, -sign * 0.1, 0), duration));
  if (thumbProx) tracks.push(swingTrack(thumbProx.name, q(0, 0, 0), duration));
  if (thumbDist) tracks.push(swingTrack(thumbDist.name, q(0,0, 0),   duration));

  return new AnimationClip(`wrist_fist_${s}`, duration, tracks);
}


// ── Elbow movements ───────────────────────────────────────────────────────────
// Upper arm is already down (set by VRMAvatar useEffect).
// Only lowerArm moves. DO NOT MODIFY THESE — elbow animations work correctly.

function makeElbowUp(vrm, s, duration = 1.6) {
  const lowerArmNode = boneNode(vrm, `${s}LowerArm`);
  if (!lowerArmNode) return new AnimationClip(`elbow_up_${s}`, duration, []);

  const sign = s === 'right' ? -1 : 1;

  // Just go up directly from neutral
  const upQuat = q(0, -(sign * 1.5), 0);

  const t1 = duration * 0.5;
  const t2 = duration;

  return new AnimationClip(`elbow_up_${s}`, duration, [
    new QuaternionKeyframeTrack(
      lowerArmNode.name + '.quaternion',
      [0, t1, t2],
      [
        ...NEUTRAL.toArray(),
        ...upQuat.toArray(),
        ...NEUTRAL.toArray(),
      ]
    ),
  ]);
}
function makeElbowLeft(vrm, s, duration = 1.6) {
  const lowerArmNode = boneNode(vrm, `${s}LowerArm`);
  if (!lowerArmNode) return new AnimationClip(`elbow_left_${s}`, duration, []);

  const sign = s === 'right' ? 1 : -1;
  const forwardQuat = q(sign * 0.2, 0, 0);
  const leftQuat = q(0, sign * 2, 1.2);

  const t1 = duration * 0.3;  // forward
  const t2 = duration * 0.7;  // left
  const t3 = duration;         // back to neutral

  return new AnimationClip(`elbow_right_${s}`, duration, [
    new QuaternionKeyframeTrack(
      lowerArmNode.name + '.quaternion',
      [0, t1, t2, t3],
      [
        ...NEUTRAL.toArray(),
        ...forwardQuat.toArray(),
        ...leftQuat.toArray(),
        ...NEUTRAL.toArray(),
      ]
    ),
  ]);
}

function makeElbowRight(vrm, s, duration = 1.6) {
  const lowerArmNode = boneNode(vrm, `${s}LowerArm`);
  if (!lowerArmNode) return new AnimationClip(`elbow_right_${s}`, duration, []);

  const sign = s === 'right' ? 1 : -1;

  const forwardQuat = q((sign * 0.5), 0, 0);  // arm goes forward first
  const rightQuat   = qMul(forwardQuat.clone(), q(0, 0, -1.3));  // then right from forward

  const t1 = duration * 0.3;  // forward
  const t2 = duration * 0.7;  // right
  const t3 = duration;         // back to neutral

  return new AnimationClip(`elbow_right_${s}`, duration, [
    new QuaternionKeyframeTrack(
      lowerArmNode.name + '.quaternion',
      [0, t1, t2, t3],
      [
        ...NEUTRAL.toArray(),
        ...forwardQuat.toArray(),
        ...rightQuat.toArray(),
        ...NEUTRAL.toArray(),
      ]
    ),
  ]);
}

function makeElbowDiagonalUL(vrm, s, duration = 1.6) {
  const lowerArmNode = boneNode(vrm, `${s}LowerArm`);
  if (!lowerArmNode) return new AnimationClip(`elbow_diagonal_ul_${s}`, duration, []);

  const sign = s === 'right' ? 1 : -1;
  const peakQuat = q(0, (sign * 1.5), (0.8));

  const t1 = duration * 0.5;
  const t2 = duration;

  return new AnimationClip(`elbow_diagonal_ul_${s}`, duration, [
    new QuaternionKeyframeTrack(
      lowerArmNode.name + '.quaternion',
      [0, t1, t2],
      [
        ...NEUTRAL.toArray(),
        ...peakQuat.toArray(),
        ...NEUTRAL.toArray(),
      ]
    ),
  ]);
}

function makeElbowDiagonalUR(vrm, s, duration = 1.6) {
  const lowerArmNode = boneNode(vrm, `${s}LowerArm`);
  if (!lowerArmNode) return new AnimationClip(`elbow_diagonal_ur_${s}`, duration, []);

  const sign = s === 'right' ? 1 : -1;
  const peakQuat = q(0, sign * 1.5, -(0.8));

  const t1 = duration * 0.5;
  const t2 = duration;

  return new AnimationClip(`elbow_diagonal_ur_${s}`, duration, [
    new QuaternionKeyframeTrack(
      lowerArmNode.name + '.quaternion',
      [0, t1, t2],
      [
        ...NEUTRAL.toArray(),
        ...peakQuat.toArray(),
        ...NEUTRAL.toArray(),
      ]
    ),
  ]);
}

// Hold structure: rise quickly → hold at peak → return to neutral
// Keyframe times must be strictly ascending: [0, t1, t2, t3]
// where t1 < t2 < t3 = duration.

function makeElbowUpHold(vrm, s, duration = 2.4) {
  const lowerArmNode = boneNode(vrm, `${s}LowerArm`);
  if (!lowerArmNode) return new AnimationClip(`elbow_up_hold_${s}`, duration, []);

  const sign = s === 'right' ? 1 : -1;
  const upQuat = q(0, sign * 1.5, 0);  // same peak as makeElbowUp

  const t1 = duration * 0.20;  // 0.48s — reach peak
  const t2 = duration * 0.75;  // 1.80s — hold until here
  const t3 = duration;          // 2.40s — back to neutral

  return new AnimationClip(`elbow_up_hold_${s}`, duration, [
    new QuaternionKeyframeTrack(
      lowerArmNode.name + '.quaternion',
      [0, t1, t2, t3],
      [
        ...NEUTRAL.toArray(),
        ...upQuat.toArray(),
        ...upQuat.toArray(),  // stays at peak during hold
        ...NEUTRAL.toArray(),
      ]
    ),
  ]);
}

function makeElbowLeftHold(vrm, s, duration = 2.4) {
  const lowerArmNode = boneNode(vrm, `${s}LowerArm`);
  if (!lowerArmNode) return new AnimationClip(`elbow_left_hold_${s}`, duration, []);

  const sign = s === 'right' ? 1 : -1;
  const forwardQuat = q((0), sign * 0.3, 0);
  const leftQuat = q(0, sign * 2, 1.2);  // same axis/peak as makeElbowLeft

  const t1 = duration * 0.1;
  const t2 = duration * 0.75;
  const t3 = duration;

  return new AnimationClip(`elbow_left_hold_${s}`, duration, [
    new QuaternionKeyframeTrack(
      lowerArmNode.name + '.quaternion',
      [0, t1, t2, t3],
      [
        ...NEUTRAL.toArray(),
        ...leftQuat.toArray(),
        ...leftQuat.toArray(),  // stays at peak during hold
        ...NEUTRAL.toArray(),
      ]
    ),
  ]);
}

function makeElbowRightHold(vrm, s, duration = 2.4) {
  const lowerArmNode = boneNode(vrm, `${s}LowerArm`);
  if (!lowerArmNode) return new AnimationClip(`elbow_right_hold_${s}`, duration, []);

  // Same peak as makeElbowRight: arm goes forward then sideways
  const sign = s === 'right' ? 1 : -1;
  const forwardQuat = q((sign * 0.5), 0, 0);
  const rightQuat   = qMul(forwardQuat.clone(), q(0, 0, -1.3));

  const t1 = duration * 0.1;
  const t2 = duration * 0.75;
  const t3 = duration;

  return new AnimationClip(`elbow_right_hold_${s}`, duration, [
    new QuaternionKeyframeTrack(
      lowerArmNode.name + '.quaternion',
      [0, t1, t2, t3],
      [
        ...NEUTRAL.toArray(),
        ...rightQuat.toArray(),
        ...rightQuat.toArray(),  // stays at peak during hold
        ...NEUTRAL.toArray(),
      ]
    ),
  ]);
}

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * createHandAnimation
 *
 * @param {VRM}    vrm          — the loaded VRM instance (userData.vrm)
 * @param {string} movementId   — e.g. 'wrist_up', 'elbow_left'
 * @param {string} affectedSide — 'left' | 'right'
 * @returns {THREE.AnimationClip}
 */
export function createHandAnimation(vrm, movementId, affectedSide = 'right') {
  const s = affectedSide;

  switch (movementId) {
    case 'wrist_up':
      return makeWristUp(vrm, s);
    case 'wrist_up_hold':
      return makeWristUpHold(vrm, s);

    case 'wrist_down':
      return makeWristDown(vrm, s);

    case 'wrist_left':
      return makeWristLeft(vrm, s);
    case 'wrist_left_hold':
      return makeWristLeftHold(vrm, s);

    case 'wrist_right':
      return makeWristRight(vrm, s);
    case 'wrist_right_hold':
      return makeWristRightHold(vrm, s);

    case 'wrist_fist':
      return makeWristFist(vrm, s);

    case 'wrist_open':
      return makeWristOpen(vrm, s);

    case 'elbow_up':
        return makeElbowUp(vrm, s);
    case 'elbow_up_hold':
      return makeElbowUpHold(vrm, s);

    case 'elbow_left':
      return makeElbowLeft(vrm, s);

    case 'elbow_left_hold':
  return makeElbowLeftHold(vrm, s);

    case 'elbow_right':
      return makeElbowRight(vrm, s);

    case 'elbow_right_hold':
  return makeElbowRightHold(vrm, s);

    case 'elbow_diagonal_ul':
      return makeElbowDiagonalUL(vrm, s);

    case 'elbow_diagonal_ur':
      return makeElbowDiagonalUR(vrm, s);

    default:
      return new AnimationClip(`idle_${s}`, 1.0, []);
  }
}
