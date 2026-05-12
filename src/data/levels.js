// src/data/levels.js
// Level definitions for RehabOrchestra.

import { assetUrl } from '../utils/assetUrl';
// Each level has a song, BPM, duration, and beat map.
// Beat maps are generated from BPM — the CueSequencer attaches movements to cue beats.

// Generate an array of beat timestamps (in seconds) from a BPM and duration
function generateBeats(bpm, durationSeconds, startOffsetSeconds = 2) {
  const beatInterval = 60 / bpm;
  const beats = [];
  for (let t = startOffsetSeconds; t < durationSeconds - 2; t += beatInterval) {
    beats.push(parseFloat(t.toFixed(3)));
  }
  return beats;
}

// Generate cue beat indices — every Nth beat is a potential cue attachment point
function generateCueBeats(beats, everyN = 2) {
  return beats.map((_, i) => i).filter((i) => i % everyN === 0);
}

// Build a complete level definition
// Includes `music` and `cueSequence` for backward compatibility with Experience.jsx
function buildLevel(id, name, songPath, bpm, durationSeconds, everyN = 2) {
  const beats = generateBeats(bpm, durationSeconds);
  const cueBeats = generateCueBeats(beats, everyN);
  return {
    id,
    name,
    song:        songPath,   // used by useMusicSync (new system)
    music:       songPath,   // used by Experience.jsx (legacy system)
    speed:       0.3,        // legacy arrow speed — not used by new cue system
    cueSequence: [],         // empty — new system uses 2D HTML cue lanes instead
    bpm,
    durationSeconds,
    beats,
    cueBeats,
  };
}

export const LEVELS = [
  buildLevel(
    1,
    'Level 1 — Carnival of the Animals (The Swan)',
    assetUrl('music/game.mp3'),
    48,
    151,
    2
  ),
  buildLevel(
    2,
    'Level 2 — Numb (Orchestra)',
    assetUrl('music/Numb Orchestra.m4a'),
    54,
    180,
    2
  ),
  buildLevel(
    3,
    'Level 3 — Dancing Queen',
    assetUrl('music/ABBA-Dancing-Queen.m4a'),
    60,
    180,
    2
  ),
  buildLevel(
    4,
    'Level 4 — Viva La Vida',
    assetUrl('music/Coldplay-Viva-La-Vida-Epic-Orchestra.m4a'),
    63,
    180,
    2
  ),
  buildLevel(
    5,
    'Level 5 — Pirates of the Caribbean',
    assetUrl('music/Pirates.m4a'),
    65,
    180,
    2
  ),
];

// Map from level id to level config
export const LEVEL_MAP = Object.fromEntries(LEVELS.map((l) => [l.id, l]));

// Recommended session for each level (determines default selection in lobby)
export const LEVEL_SESSION_MAP = {
  1: [1],
  2: [2],
  3: [2],
  4: [3],
  5: [3],
};

// Given session history, return the recommended level id
export function getRecommendedLevelId(sessionHistory = []) {
  // Find the lowest level not yet completed with >= 3 stars
  for (const level of LEVELS) {
    const sessions = sessionHistory.filter((s) => s.levelId === level.id);
    const hasThreeStars = sessions.some((s) => (s.hitRate ?? 0) >= 0.8);
    if (!hasThreeStars) return level.id;
  }
  // All completed — default to level 1 for replay
  return 1;
}
