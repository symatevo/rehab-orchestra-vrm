// src/components/PauseMenu.jsx
// Pause overlay — appears on ESC or pause button.
// Also shown when EMG disconnects during game.

import { useState } from 'react';
import { useGameStore } from '../hooks/useGameStore';

const BLUE = '#2563eb';
const NAVY = '#1a2f6e';

/**
 * PauseMenu
 *
 * @prop {function} onResume       — resume performance
 * @prop {function} onRestart      — restart warm-up for same level
 * @prop {function} onExitToLobby  — go to lobby
 * @prop {function} onVolumeChange — (0–1) volume change
 * @prop {number}   volume         — current volume (0–1)
 */
export function PauseMenu({ onResume, onRestart, onExitToLobby, onVolumeChange, volume = 0.8 }) {
  const { pauseReason, emgConnected } = useGameStore();
  const isEMGDisconnect = pauseReason === 'emg_disconnect';
  const [localVolume, setLocalVolume] = useState(volume);

  const handleVolume = (v) => {
    setLocalVolume(v);
    onVolumeChange?.(v);
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(10, 20, 60, 0.75)',
        backdropFilter: 'blur(12px)',
        zIndex: 300,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: 'system-ui, Inter, sans-serif',
      }}
    >
      <div
        style={{
          background: '#ffffff',
          borderRadius: 20,
          padding: '36px 40px',
          minWidth: 340,
          boxShadow: '0 24px 64px rgba(0,0,0,0.3)',
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
        }}
      >
        {/* Title */}
        <h2 style={{ margin: 0, fontSize: 24, color: NAVY, fontWeight: 700, textAlign: 'center' }}>
          {isEMGDisconnect ? 'Arm Sensor Disconnected' : 'Game Paused'}
        </h2>

        {/* EMG disconnect message */}
        {isEMGDisconnect && (
          <p style={{ margin: 0, fontSize: 14, color: '#6b7280', textAlign: 'center' }}>
            Please reconnect the arm sensor, then press Resume.
          </p>
        )}

        {/* Buttons */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 8 }}>
          <button
            onClick={onResume}
            disabled={isEMGDisconnect && !emgConnected}
            style={{
              ...menuBtn,
              background: (isEMGDisconnect && !emgConnected) ? '#d1d5db' : BLUE,
              color: '#ffffff',
              cursor: (isEMGDisconnect && !emgConnected) ? 'not-allowed' : 'pointer',
            }}
          >
            ▶ Resume
          </button>

          {!isEMGDisconnect && (
            <>
              <button onClick={onRestart} style={{ ...menuBtn, background: '#f0f4ff', color: NAVY }}>
                ↺ Restart Level
              </button>
              <button onClick={onExitToLobby} style={{ ...menuBtn, background: '#f0f4ff', color: NAVY }}>
                ← Exit to Lobby
              </button>
            </>
          )}
        </div>

        {/* Volume slider */}
        <div style={{ marginTop: 8 }}>
          <label style={{ fontSize: 12, color: '#6b7280', display: 'block', marginBottom: 6 }}>
            Music Volume
          </label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 16 }}>🔈</span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={localVolume}
              onChange={(e) => handleVolume(parseFloat(e.target.value))}
              style={{ flex: 1, accentColor: BLUE }}
            />
            <span style={{ fontSize: 16 }}>🔊</span>
          </div>
        </div>
      </div>
    </div>
  );
}

const menuBtn = {
  padding: '12px 0',
  borderRadius: 10,
  border: 'none',
  fontSize: 15,
  fontWeight: 600,
  cursor: 'pointer',
  textAlign: 'center',
  transition: 'transform 0.1s, opacity 0.1s',
};
