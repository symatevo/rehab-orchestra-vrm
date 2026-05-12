// src/data/buildChart.js
// Ported from reference RehabOrchestra buildChart.js.
// Generates music-synced cues from MIDI note data.
// Adapted for our project: supports two-hand mode (alternating left/right) and mirror therapy.

import carnivalSwanSong from './orchestra/carnivalSwanSong.json';
import { assetUrl } from '../utils/assetUrl';

/** @typedef {'up'|'down'|'holdUp'|'holdDown'|'close'} CueKind */

const BEATS_PER_STROKE = 2;

// Map reference cue kind → our movementId
const KIND_TO_MOVEMENT_ID = {
  up:       'elbow_up',
  down:     'elbow_down',
  holdUp:   'elbow_up',
  holdDown: 'elbow_down',
  close:    'wrist_fist',
};

function assignTravelFromRhythm(chart) {
  chart.forEach((c, i) => {
    const prevHit = i > 0 ? chart[i - 1].hitTime : Math.max(0, c.hitTime - 4);
    const ioi     = Math.max(0.82, c.hitTime - prevHit);
    c.travel      = Math.min(3.2, Math.max(1.35, ioi * 1.35));
  });
}

function collectNotes(tracks, startT, endT) {
  const out = [];
  for (const tr of tracks) {
    for (const n of tr.notes) {
      if (n.time < startT || n.time > endT) continue;
      const midi = typeof n.midi === 'number' ? n.midi : guessMidiFromName(n.name);
      out.push({ t: n.time, vel: n.velocity ?? 0.5, midi, dur: n.duration ?? 0.1 });
    }
  }
  out.sort((a, b) => a.t - b.t);
  return out;
}

function guessMidiFromName(name) {
  if (!name) return 60;
  const m = name.match(/^([A-Ga-g])([#b]?)(\d+)$/);
  if (!m) return 60;
  const pcs = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  let sem = pcs[m[1].toUpperCase()];
  if (sem === undefined) return 60;
  if (m[2] === '#') sem += 1;
  if (m[2] === 'b') sem -= 1;
  return (parseInt(m[3], 10) + 1) * 12 + sem;
}

function mergeOnsets(notes, mergeSec) {
  if (!notes.length) return [];
  const out = [];
  for (const n of notes) {
    if (!out.length || n.t - out[out.length - 1] >= mergeSec) out.push(n.t);
  }
  return out;
}

function buildStrokeGridTimes(startAt, stopAt, beatSec) {
  const step = BEATS_PER_STROKE * beatSec;
  const out  = [];
  for (let k = 0; k < 8000; k++) {
    const ht = startAt + k * step;
    if (ht > stopAt - 0.04) break;
    out.push(ht);
  }
  return out;
}

function nearestGridIndex(gridTimes, target) {
  let best = 0, bd = Infinity;
  for (let i = 0; i < gridTimes.length; i++) {
    const d = Math.abs(gridTimes[i] - target);
    if (d < bd) { bd = d; best = i; }
  }
  return best;
}

function buildHoldFistPlan(gridTimes, onsets, startAt, stopAt, beatSec) {
  const N    = gridTimes.length;
  const span = Math.max(1e-6, stopAt - startAt);
  const fistCueIndex = N >= 10 ? Math.max(3, Math.min(N - 4, Math.floor(N * 0.4))) : -1;
  const holdCueIds   = new Set();

  if (N < 12 || onsets.length < 4) return { fistCueIndex, holdCueIds };

  const ranked = [];
  for (let i = 0; i < onsets.length - 1; i++) {
    const gap = onsets[i + 1] - onsets[i];
    const mid = (onsets[i] + onsets[i + 1]) / 2;
    const u   = (mid - startAt) / span;
    if (u < 0.18 || u > 0.82) continue;
    if (gap < beatSec * 1.02) continue;
    ranked.push({ gap, idx: nearestGridIndex(gridTimes, mid) });
  }
  ranked.sort((a, b) => b.gap - a.gap);

  const want = N >= 18 ? 2 : 1;
  for (const r of ranked) {
    if (holdCueIds.size >= want) break;
    if (Math.abs(r.idx - fistCueIndex) <= 1) continue;
    let tooClose = false;
    for (const h of holdCueIds) { if (Math.abs(h - r.idx) < 6) { tooClose = true; break; } }
    if (!tooClose) holdCueIds.add(r.idx);
  }
  return { fistCueIndex, holdCueIds };
}

function conductorKindSlot(i, hitTime, gridTimes, span, startAt, beatSec, plan) {
  if (plan.fistCueIndex >= 0 && i === plan.fistCueIndex) return { kind: 'close' };
  const gapToNext = i < gridTimes.length - 1 ? gridTimes[i + 1] - hitTime : beatSec * 8;
  if (plan.holdCueIds.has(i)) {
    const holdSec = Math.max(1.05, Math.min(2.35, Math.max(gapToNext * 0.55, beatSec * 1.55)));
    return { kind: 'holdUp', holdSec };
  }
  return { kind: 'down' };
}

function microWarpTowardOnsets(chart, onsets, maxSec = 0.042) {
  if (!chart.length || !onsets.length) return;
  for (let i = 0; i < chart.length; i++) {
    const c  = chart[i];
    const lo = i > 0 ? chart[i - 1].hitTime + 0.065 : -Infinity;
    const hi = i < chart.length - 1 ? chart[i + 1].hitTime - 0.065 : Infinity;
    let bestT = c.hitTime, bestDist = Infinity;
    for (const o of onsets) {
      if (o <= lo || o >= hi) continue;
      const d = Math.abs(o - c.hitTime);
      if (d <= maxSec && d < bestDist) { bestDist = d; bestT = o; }
    }
    c.hitTime = Number(bestT.toFixed(4));
  }
}

function applyVerticalConductingSequence(chart) {
  let prevPlain   = 'up';
  let pendingRepeat = null;
  for (const c of chart) {
    if (c.kind === 'close') continue;
    const isHold = (typeof c.holdSec === 'number' && c.holdSec > 0) || c.kind === 'holdUp' || c.kind === 'holdDown';
    if (isHold) {
      c.kind        = prevPlain === 'down' ? 'holdUp' : 'holdDown';
      pendingRepeat = prevPlain;
      continue;
    }
    if (pendingRepeat !== null) {
      c.kind        = pendingRepeat;
      prevPlain     = pendingRepeat;
      pendingRepeat = null;
      continue;
    }
    const next = prevPlain === 'down' ? 'up' : 'down';
    c.kind    = next;
    prevPlain = next;
  }
}

function trimCuesInsideHolds(chart, beatSec) {
  const buffer = Math.max(0.18, beatSec * 0.38);
  const out    = [];
  let blockUntil = -Infinity;
  for (const c of chart) {
    if (c.hitTime < blockUntil) continue;
    out.push(c);
    if ((c.kind === 'holdUp' || c.kind === 'holdDown') && typeof c.holdSec === 'number') {
      blockUntil = c.hitTime + c.holdSec + buffer;
    }
  }
  return out;
}

function quantizePreserveOrder(chart, beatSec) {
  const step    = beatSec / 8;
  const minBump = Math.max(step * 0.25, 0.068);
  let last      = -Infinity;
  for (const c of chart) {
    let h = Math.round(c.hitTime / step) * step;
    if (h <= last + minBump - 1e-6) h = Number((last + minBump).toFixed(5));
    c.hitTime = Number(h.toFixed(4));
    last      = c.hitTime;
  }
}

// Song data map — add more entries as songs get MIDI data
const SONG_DATA = {
  [assetUrl('music/game.mp3')]: carnivalSwanSong,
};

/**
 * Build a music-synced cue chart from MIDI data (reference approach).
 * Adapted for our calibration: supports two-hand (alternating sides) and mirror therapy.
 *
 * @param {object} calibration
 * @param {string} songPath  — levelConfig.song
 * @returns {object[]|null}  — our cue format, or null if no MIDI data for this song
 */
export function buildMidiCueChart(calibration, songPath) {
  const songData = SONG_DATA[songPath];
  if (!songData) return null;  // no MIDI data → fall back to BPM-grid

  const bpm     = songData.header?.bpm ?? calibration.baseBPM ?? 48;
  const durSec  = songData.duration ?? 151;
  const tracks  = (songData.tracks ?? []).map((tr) => ({
    id: tr.id,
    instrument: tr.instrument,
    notes: (tr.notes ?? []).map((n) => ({
      time:     n.time,
      duration: n.duration,
      velocity: n.velocity,
      name:     n.name,
      midi:     n.midi,
    })),
  }));

  const beatSec = 60 / bpm;
  const startAt = beatSec * 7;
  const stopAt  = Math.max(startAt + beatSec * 4, durSec - beatSec * 3);
  const span    = Math.max(1e-6, stopAt - startAt);

  const notes        = collectNotes(tracks, startAt, stopAt);
  const mergedOnsets = mergeOnsets(notes, 0.045);
  const gridTimes    = buildStrokeGridTimes(startAt, stopAt, beatSec);
  const plan         = buildHoldFistPlan(gridTimes, mergedOnsets, startAt, stopAt, beatSec);

  let chart = gridTimes.map((hitTime, i) => {
    const { kind, holdSec } = conductorKindSlot(i, hitTime, gridTimes, span, startAt, beatSec, plan);
    return { id: i, hitTime, side: 'both', travel: 2.85, kind, ...(holdSec !== undefined ? { holdSec } : {}) };
  });

  microWarpTowardOnsets(chart, mergedOnsets);
  chart.forEach((c, idx) => { c.id = idx; });
  applyVerticalConductingSequence(chart);
  chart = trimCuesInsideHolds(chart, beatSec);
  chart.forEach((c, idx) => { c.id = idx; });
  quantizePreserveOrder(chart, beatSec);
  assignTravelFromRhythm(chart);

  // Normally two cues per beat (L+R). Mirror therapy: one cue with side 'both' so both lanes show
  // the same token while the patient moves only the lead limb (avatar + pose mirror the motion).
  const result = [];
  chart.forEach((c, i) => {
    const base = {
      movementId: KIND_TO_MOVEMENT_ID[c.kind] ?? 'elbow_up',
      kind:       c.kind,
      travel:     c.travel,
      tag:        c.kind === 'close' ? 'fist' : (c.kind === 'holdUp' || c.kind === 'holdDown') ? 'yellow' : 'easy',
      phase:      'midi',
      ...(c.holdSec ? { holdSec: c.holdSec } : {}),
    };
    const n = String(i).padStart(4, '0');
    if (calibration?.isMirrorTherapy) {
      result.push({ id: `cue_${n}`, time: c.hitTime, side: 'both', ...base });
    } else {
      result.push({ id: `cue_${n}_L`, time: c.hitTime, side: 'left',  ...base });
      result.push({ id: `cue_${n}_R`, time: c.hitTime, side: 'right', ...base });
    }
  });
  return result;
}
