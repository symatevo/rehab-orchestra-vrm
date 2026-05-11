import { create } from "zustand";

const avatars = [
    "473123972523113312.vrm",
    "1936068264543422871.vrm",
    "8535979820947282204.vrm",
    "837104583446848408.vrm",
    "7221401080668022904.vrm",
];

export const useVideoRecognition = create((set, get) => ({
    warmupAvatarMovement: null,
    setWarmupAvatarMovement: (m) => set({ warmupAvatarMovement: m }),
    warmupAvatarMode: 'realtime-tracking',        
setWarmupAvatarMode: (m) => set({ warmupAvatarMode: m }),  
    videoElement: null,
    setVideoElement: (videoElement) => set({ videoElement }),
    resultsCallback: null,
    setResultsCallback: (resultsCallback) => set({ resultsCallback }),
    // Separate callback for movement detection (useMovementBridge)
    // Kept separate so VRMAvatar and movement detection don't overwrite each other
    movementDetectionCallback: null,
    setMovementDetectionCallback: (cb) => set({ movementDetectionCallback: cb }),
    romCalibrationCallback: null,
    setROMCalibrationCallback: (cb) => set({ romCalibrationCallback: cb }),

    // avatar cycling
    avatarIndex: 2,
    currentAvatar: avatars[2],
    cycleAvatar: () => {
        const next = (get().avatarIndex + 1) % avatars.length;
        set({ avatarIndex: next, currentAvatar: avatars[next] });
    },
    gameState: "waiting",
    setGameState: (gameState) => set({ gameState }),

    paused: false,
    setPaused: (paused) => set({ paused }),


    score: 0,
    addScore: (points) => set((state) => ({ score: state.score + points })),
    currentLevelIndex: 0,
    setCurrentLevelIndex: (i) => set({ currentLevelIndex: i }),
    totalArrows: 0,
    setTotalArrows: (n) => set({ totalArrows: n }),
    hitArrows: 0,
    incrementHitArrows: () => set((state) => ({ hitArrows: state.hitArrows + 1 })),
    levelComplete: false,
    setLevelComplete: (val) => set({ levelComplete: val }),
    lastHitResult: null,
    hitResultCount: 0,
    setLastHitResult: (result) => set((state) => ({
        lastHitResult: result,
        hitResultCount: state.hitResultCount + 1,
    })),
    //arrowPositions: {},
    arrowPositions: {},
    updateArrowPosition: (id, z) => set((state) => ({
        arrowPositions: { ...state.arrowPositions, [id]: z }
    })),
    removeArrowPosition: (id) => set((state) => {
        const next = { ...state.arrowPositions };
        delete next[id];
        return { arrowPositions: next };
    }),
    hitTriggeredId: null,
    triggerHit: (id) => set({ hitTriggeredId: id }),
    clearHitTriggered: () => set({ hitTriggeredId: null }),
    masteredMovements: new Set(),
    masterMovement: (side) => set((state) => ({
        masteredMovements: new Set([...state.masteredMovements, side])
    })),
    bothHitCount: 0,
    incrementBothHit: () => set((state) => ({ bothHitCount: state.bothHitCount + 1 })),
    resetBothHit: () => set({ bothHitCount: 0 }),

    resetLevel: () => set({
        score: 0,
        hitArrows: 0,
        totalArrows: 0,
        levelComplete: false,
        lastHitResult: null,
        hitResultCount: 0,
        arrowPositions: {},
        hitTriggeredId: null,
        masteredMovements: new Set(),
        bothHitCount: 0,
        gameState: "waiting",
    }),
}));