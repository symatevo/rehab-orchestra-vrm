// src/data/movements.js
// Complete movement library for the RehabOrchestra game.
// These IDs are referenced by calibration, cue sequencer, hit detection, and the VRM avatar.

export const MOVEMENTS = {
  wrist: [
    { id: 'wrist_rest',        name: 'Wrist Rest',        arrow: '●', img: 'wrist_rest',   hold: false },
    { id: 'wrist_up',          name: 'Wrist Up',          arrow: '↑', img: 'wrist_up',     hold: false },
    { id: 'wrist_up_hold',     name: 'Wrist Up Hold',     arrow: '↑', img: 'wrist_up',     hold: true  },
    { id: 'wrist_down',        name: 'Wrist Down',        arrow: '↓', img: 'wrist_up',     hold: false },
    //{ id: 'wrist_left',        name: 'Wrist Left',        arrow: '←', img: 'wrist_left',   hold: false },
    //{ id: 'wrist_left_hold',   name: 'Wrist Left Hold',   arrow: '←', img: 'wrist_left',   hold: true  },
    //{ id: 'wrist_right',       name: 'Wrist Right',       arrow: '→', img: 'wrist_right',  hold: false },
    //{ id: 'wrist_right_hold',  name: 'Wrist Right Hold',  arrow: '→', img: 'wrist_right',  hold: true  },
    { id: 'wrist_fist',        name: 'Wrist Fist',        arrow: '✊', img: 'wrist_fist',   hold: false },
    { id: 'wrist_open',        name: 'Wrist Open',        arrow: '🖐', img: 'wrist_open',   hold: false },
  ],
  elbow: [
    { id: 'elbow_rest',         name: 'Elbow Rest',         arrow: '●', img: 'elbow_rest',  hold: false },
    { id: 'elbow_up',           name: 'Elbow Up',           arrow: '↑', img: 'elbow_up',    hold: false },
    { id: 'elbow_up_hold',      name: 'Elbow Up Hold',      arrow: '↑', img: 'elbow_up',    hold: true  },
    { id: 'elbow_down',         name: 'Elbow Down',         arrow: '↓', img: 'elbow_up',    hold: false },
    { id: 'elbow_down_hold',    name: 'Elbow Down Hold',    arrow: '↓', img: 'elbow_up',    hold: true  },
    //{ id: 'wrist_fist',        name: 'Wrist Fist',        arrow: '✊', img: 'wrist_fist',   hold: false },
    //{ id: 'elbow_left',         name: 'Elbow Left',         arrow: '←', img: 'elbow_left',  hold: false },
    //{ id: 'elbow_left_hold',    name: 'Elbow Left Hold',    arrow: '←', img: 'elbow_left',  hold: true  },
    //{ id: 'elbow_right',        name: 'Elbow Right',        arrow: '→', img: 'elbow_right', hold: false },
    //{ id: 'elbow_right_hold',   name: 'Elbow Right Hold',   arrow: '→', img: 'elbow_right', hold: true  },
    //{ id: 'elbow_diagonal_ul',  name: 'Elbow Up-Left',      arrow: '↑', img: 'elbow_up',    hold: false, rotationDeg: -45 },
    //{ id: 'elbow_diagonal_ur',  name: 'Elbow Up-Right',     arrow: '↑', img: 'elbow_up',    hold: false, rotationDeg:  45 },
  ],
};

// These movement IDs are NEVER shown as visual cues — internal state only
export const NEVER_CUE = ['wrist_rest', 'elbow_rest'];

// Lookup map: movementId → movement definition
export const MOVEMENT_MAP = {};
Object.values(MOVEMENTS).forEach((arr) => {
  arr.forEach((m) => { MOVEMENT_MAP[m.id] = m; });
});

// Given a jointFocus and a list of movement IDs from calibration,
// return the full movement definitions with unknown IDs gracefully skipped.
export function resolveMovements(jointFocus, ids = []) {
  const library = MOVEMENTS[jointFocus] ?? MOVEMENTS.wrist;
  return ids
    .map((id) => library.find((m) => m.id === id))
    .filter(Boolean);
}
