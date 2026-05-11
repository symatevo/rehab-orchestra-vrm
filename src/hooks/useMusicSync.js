// src/hooks/useMusicSync.js
// Web Audio API music system — three layers:
//   1. Background track (continuous)
//   2. Feedback sounds (hit/miss/streak)
//   3. Song progress tracking
//
// AudioContext is created on first user gesture (browser requirement).
// All sounds gracefully skip if their asset files are missing.

import { useRef, useCallback, useEffect } from 'react';

// Feedback sound paths — gracefully skipped if files don't exist
const FEEDBACK_SOUNDS = {
  hit_perfect:  '/sounds/hit_perfect.mp3',
  hit_good:     '/sounds/hit_good.mp3',
  miss:         '/sounds/miss.mp3',
  wrong:        '/sounds/wrong.mp3',
  streak_5:     '/sounds/streak_5.mp3',
  streak_10:    '/sounds/streak_10.mp3',
  bravo:        '/sounds/bravo.mp3',
};

export function useMusicSync() {
  const audioCtxRef   = useRef(null);
  const bgSourceRef   = useRef(null);
  const bgGainRef     = useRef(null);
  const startTimeRef  = useRef(null);   // audioCtx.currentTime when song started
  const songBufferRef = useRef(null);
  const soundBuffers  = useRef({});     // preloaded feedback buffers
  const volumeRef     = useRef(0.8);

  // Initialize AudioContext on first call (must be after user gesture)
  const getContext = useCallback(() => {
    if (!audioCtxRef.current) {
      audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioCtxRef.current.state === 'suspended') {
      audioCtxRef.current.resume();
    }
    return audioCtxRef.current;
  }, []);

  // Load an audio file and return an AudioBuffer, or null if file is missing
  const loadBuffer = useCallback(async (url) => {
    try {
      const ctx = getContext();
      const res = await fetch(url);
      if (!res.ok) return null;
      const arrayBuf = await res.arrayBuffer();
      return await ctx.decodeAudioData(arrayBuf);
    } catch (e) {
      // Gracefully skip missing/corrupt audio files
      return null;
    }
  }, [getContext]);

  // Preload feedback sounds in the background
  const preloadFeedbackSounds = useCallback(async () => {
    const entries = Object.entries(FEEDBACK_SOUNDS);
    await Promise.all(entries.map(async ([key, url]) => {
      soundBuffers.current[key] = await loadBuffer(url);
    }));
  }, [loadBuffer]);

  // Play a preloaded feedback sound
  const playFeedbackSound = useCallback((key, volumeScale = 0.6) => {
    const buffer = soundBuffers.current[key];
    if (!buffer) return;   // file was missing — silent skip
    try {
      const ctx = getContext();
      const source = ctx.createBufferSource();
      const gain = ctx.createGain();
      gain.gain.value = volumeRef.current * volumeScale;
      source.buffer = buffer;
      source.connect(gain).connect(ctx.destination);
      source.start(0);
    } catch (_) {}
  }, [getContext]);

  // Load and start the background song
  const startSong = useCallback(async (songUrl) => {
    const ctx = getContext();

    // Stop any currently playing song
    if (bgSourceRef.current) {
      try { bgSourceRef.current.stop(); } catch (_) {}
      bgSourceRef.current = null;
    }

    // Preload feedback sounds while song loads (parallel)
    preloadFeedbackSounds();

    const buffer = await loadBuffer(songUrl);
    if (!buffer) {
      console.warn('[useMusicSync] Could not load song:', songUrl);
      // Still track time so the game can progress without audio
      startTimeRef.current = performance.now() / 1000;
      return;
    }

    songBufferRef.current = buffer;

    bgGainRef.current = ctx.createGain();
    bgGainRef.current.gain.value = volumeRef.current;
    bgGainRef.current.connect(ctx.destination);

    bgSourceRef.current = ctx.createBufferSource();
    bgSourceRef.current.buffer = buffer;
    bgSourceRef.current.connect(bgGainRef.current);
    bgSourceRef.current.start(0);

    startTimeRef.current = ctx.currentTime;
  }, [getContext, loadBuffer, preloadFeedbackSounds]);

  // Get current song position in seconds
  const getSongTime = useCallback(() => {
    if (startTimeRef.current === null) return 0;
    const ctx = audioCtxRef.current;
    if (ctx && bgSourceRef.current) {
      return ctx.currentTime - startTimeRef.current;
    }
    // Fallback: wall-clock time (when no AudioContext)
    return performance.now() / 1000 - startTimeRef.current;
  }, []);

  // Pause (suspend AudioContext)
  const pauseSong = useCallback(() => {
    if (audioCtxRef.current?.state === 'running') {
      audioCtxRef.current.suspend();
    }
  }, []);

  // Resume
  const resumeSong = useCallback(() => {
    if (audioCtxRef.current?.state === 'suspended') {
      audioCtxRef.current.resume();
    }
  }, []);

  // Stop and clean up
  const stopSong = useCallback(() => {
    if (bgSourceRef.current) {
      try { bgSourceRef.current.stop(); } catch (_) {}
      bgSourceRef.current = null;
    }
    startTimeRef.current = null;
  }, []);

  // Fade out song over durationSec then stop
  const fadeOutSong = useCallback((durationSec = 3) => {
    if (bgGainRef.current && audioCtxRef.current) {
      const ctx = audioCtxRef.current;
      const now = ctx.currentTime;
      bgGainRef.current.gain.cancelScheduledValues(now);
      bgGainRef.current.gain.setValueAtTime(bgGainRef.current.gain.value, now);
      bgGainRef.current.gain.linearRampToValueAtTime(0, now + durationSec);
      setTimeout(() => {
        if (bgSourceRef.current) {
          try { bgSourceRef.current.stop(); } catch (_) {}
          bgSourceRef.current = null;
        }
        startTimeRef.current = null;
      }, durationSec * 1000 + 100);
    } else {
      stopSong();
    }
  }, [stopSong]);

  // Set master volume (0–1)
  const setVolume = useCallback((vol) => {
    volumeRef.current = vol;
    if (bgGainRef.current) bgGainRef.current.gain.value = vol;
  }, []);

  // Feedback sound helpers
  const onHit = useCallback((grade) => {
    if (grade === 'perfect')      playFeedbackSound('hit_perfect');
    else if (grade === 'good')    playFeedbackSound('hit_good');
    else if (grade === 'wrong')   playFeedbackSound('wrong', 0.4);
  }, [playFeedbackSound]);

  const onMiss = useCallback(() => {
    // Clinical: miss sound is never harsh — just a muted, subtle cue
    playFeedbackSound('miss', 0.3);
  }, [playFeedbackSound]);

  const onStreak = useCallback((streakCount) => {
    if (streakCount === 10)       playFeedbackSound('streak_10');
    else if (streakCount === 5)   playFeedbackSound('streak_5');
  }, [playFeedbackSound]);

  const onBravo = useCallback(() => {
    playFeedbackSound('bravo', 1.0);
  }, [playFeedbackSound]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopSong();
      if (audioCtxRef.current) {
        audioCtxRef.current.close().catch(() => {});
        audioCtxRef.current = null;
      }
    };
  }, [stopSong]);

  return { startSong, pauseSong, resumeSong, stopSong, fadeOutSong, getSongTime, setVolume, onHit, onMiss, onStreak, onBravo };
}
