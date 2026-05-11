// src/components/Lobby.jsx
// Lobby screen — patient's first impression of the game.
// The "wow moment": avatar mirrors patient's real hand movements via Kalidokit.
// Physiotherapist selects level and session number, then clicks Start Warm-Up.


import { useCalibration } from '../hooks/useCalibration';
import { useGameStore } from '../hooks/useGameStore';
import { LEVELS, getRecommendedLevelId } from '../data/levels';
import { useState, useEffect, useRef, useCallback } from 'react';
// Design tokens
const NAVY    = '#1a2f6e';
const BLUE    = '#2563eb';
const LBLUE   = '#2d4a9e';
const GREEN   = '#16a34a';

const DEFAULT_WIDTH      = 420;
const MAX_WIDTH          = 600;
const COLLAPSE_THRESHOLD = 100;

export function Lobby({ onStartWarmup }) {
  
  const [panelWidth, setPanelWidth] = useState(DEFAULT_WIDTH);
const [isDragging, setIsDragging] = useState(false);
const dragStartX     = useRef(0);
const dragStartWidth = useRef(DEFAULT_WIDTH);

  const calibration = useCalibration();
  const { selectedLevelId, setSelectedLevelId, sessionNumber, setSessionNumber, emgConnected, bumpCalibrationVersion } = useGameStore();

  const [emgError, setEmgError]         = useState(false);
  const [loadError, setLoadError]       = useState(null);
  const [loadSuccess, setLoadSuccess]   = useState(null);
  const fileInputRef = useRef(null);

  // Set default level from patient history (re-runs whenever calibration changes)
  useEffect(() => {
    const recommended = getRecommendedLevelId(calibration.sessionHistory ?? []);
    setSelectedLevelId(recommended);
    setSessionNumber(calibration.nextSessionNumber ?? 1);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [calibration.patientId]);  // re-run when patient switches

  const handleLoadPatientFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(ev.target.result);
        if (!data.patientId) throw new Error('Missing patientId — is this a calibration file?');
        localStorage.setItem('calibration', JSON.stringify(data));
        setLoadError(null);
        setLoadSuccess(`Loaded: ${data.patientId}`);
        bumpCalibrationVersion();
        setTimeout(() => setLoadSuccess(null), 3000);
      } catch (err) {
        setLoadError(`Invalid file: ${err.message}`);
      }
    };
    reader.readAsText(file);
    // Reset so same file can be re-selected
    e.target.value = '';
  };

  const needsEMG = calibration.leftControl === 'emg' || calibration.rightControl === 'emg';

  const handleStartWarmup = () => {
    if (needsEMG && !emgConnected) {
      setEmgError(true);
      return;
    }
    setEmgError(false);
    onStartWarmup?.(selectedLevelId);
  };
const isCollapsed = panelWidth < COLLAPSE_THRESHOLD;

const onDragHandleMouseDown = useCallback((e) => {
  e.preventDefault();
  setIsDragging(true);
  dragStartX.current     = e.clientX;
  dragStartWidth.current = panelWidth;
}, [panelWidth]);

useEffect(() => {
  if (!isDragging) return;
  const onMouseMove = (e) => {
    const delta    = e.clientX - dragStartX.current;
    const newWidth = Math.max(0, Math.min(MAX_WIDTH, dragStartWidth.current + delta));
    setPanelWidth(newWidth);
  };
  const onMouseUp = (e) => {
    setIsDragging(false);
    const delta    = e.clientX - dragStartX.current;
    const newWidth = dragStartWidth.current + delta;
    if (newWidth < COLLAPSE_THRESHOLD) setPanelWidth(0);
  };
  window.addEventListener('mousemove', onMouseMove);
  window.addEventListener('mouseup',   onMouseUp);
  return () => {
    window.removeEventListener('mousemove', onMouseMove);
    window.removeEventListener('mouseup',   onMouseUp);
  };
}, [isDragging]);

  return (
    <div
      style={{
          position: 'fixed',
  inset: 0,
  zIndex: 100,
  display: 'flex',
  fontFamily: 'system-ui, Inter, sans-serif',
  pointerEvents: 'none',
  userSelect: isDragging ? 'none' : 'auto',
  cursor: isDragging ? 'col-resize' : 'default',
      }}
    >
      {/* Left panel — opaque white card area */}
      <div
        style={{
            width: panelWidth,
  height: '100%',
  background: 'linear-gradient(135deg, #e8f0fe 0%, #ffffff 80%)',
  boxShadow: isCollapsed ? 'none' : '4px 0 32px rgba(37,99,235,0.1)',
  display: 'flex',
  flexDirection: 'column',
  overflowY: isCollapsed ? 'hidden' : 'auto',
  overflowX: isCollapsed ? 'hidden' : 'auto',
  pointerEvents: isCollapsed ? 'none' : 'auto',
  transition: isDragging ? 'none' : 'width 0.18s ease',
  flexShrink: 0,
        }}
      >
        {/* Top bar inside panel */}
        <div style={{ padding: '0 20px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #e0e7f3', gap: 8 }}>
          <span style={{ fontSize: 13, color: LBLUE, fontWeight: 600, flexShrink: 0 }}>RehabOrchestra</span>

          {/* Patient file loader */}
          <input
            ref={fileInputRef}
            type="file"
            accept=".json"
            style={{ display: 'none' }}
            onChange={handleLoadPatientFile}
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            title="Load patient calibration file"
            style={{
              fontSize: 11,
              color: loadSuccess ? GREEN : LBLUE,
              background: loadSuccess ? '#f0fdf4' : '#f0f4ff',
              border: `1px solid ${loadSuccess ? '#bbf7d0' : '#c7d2fe'}`,
              borderRadius: 6,
              padding: '3px 9px',
              cursor: 'pointer',
              fontWeight: 500,
              whiteSpace: 'nowrap',
            }}
          >
            {loadSuccess ?? 'Switch Patient'}
          </button>

          {calibration.isDemo && (
            <span style={{ fontSize: 10, color: '#9ca3af', background: '#f3f4f6', padding: '2px 7px', borderRadius: 5, border: '1px solid #e5e7eb', flexShrink: 0 }}>
              DEMO
            </span>
          )}
          {needsEMG && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0 }}>
              <div style={{ width: 7, height: 7, borderRadius: '50%', background: emgConnected ? '#22c55e' : '#f87171' }} />
              <span style={{ fontSize: 11, color: emgConnected ? '#166534' : '#991b1b', fontWeight: 500 }}>
                {emgConnected ? 'Sensor on' : 'Sensor off'}
              </span>
            </div>
          )}
        </div>

        {/* Load error */}
        {loadError && (
          <div style={{ margin: '8px 20px 0', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '8px 12px' }}>
            <p style={{ margin: 0, fontSize: 12, color: '#991b1b' }}>{loadError}</p>
          </div>
        )}

        {/* Scrollable content */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 14, padding: '16px 20px' }}>

          {/* Patient card */}
          <div style={cardStyle}>
            <p style={{ margin: '4px 0 0', fontSize: 16, color: BLUE, fontWeight: 700 }}>
              {calibration.patientId}
            </p>
            <div style={{ display: 'flex', gap: 16, marginTop: 12, flexWrap: 'wrap' }}>
              <InfoPill label="Affected side"  value={calibration.affectedSide ?? '—'} />
              <InfoPill label="Focus"          value={calibration.jointFocus ?? '—'} />
              <InfoPill label="MRC grade"      value={String(calibration.affectedMRC ?? '—')} />
            </div>
          </div>

          {/* Validation error */}
          {!calibration.isValid && (
            <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 12, padding: '12px 16px' }}>
              <p style={{ margin: 0, fontSize: 13, color: '#991b1b' }}>
                ⚠ {calibration.validationError}
              </p>
            </div>
          )}

          {/* Session number */}
          <div style={{ ...cardStyle, padding: '10px 14px' }}>
  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
    <label style={{ ...labelStyle, fontSize: 10 }}>Session</label>
    <input
      type="number"
      min={1}
      value={sessionNumber}
      onChange={(e) => setSessionNumber(Number(e.target.value))}
      style={{ ...inputStyle, marginTop: 0, width: 64, padding: '4px 8px', fontSize: 13 }}
    />
  </div>
</div>

          {/* Level selection */}
          <div style={cardStyle}>
            <label style={labelStyle}>Select level</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
              {LEVELS.map((level) => {
                const isSelected = selectedLevelId === level.id;
                const completed = (calibration.sessionHistory ?? []).some(
                  (s) => s.levelId === level.id && s.hitRate >= 0.8
                );
                return (
                  <button
                    key={level.id}
                    onClick={() => setSelectedLevelId(level.id)}
                    style={{
                      padding: '10px 14px',
                      borderRadius: 10,
                      border: `2px solid ${isSelected ? BLUE : '#e0e7f3'}`,
                      background: isSelected ? '#eff6ff' : '#ffffff',
                      color: isSelected ? BLUE : NAVY,
                      fontWeight: isSelected ? 600 : 400,
                      fontSize: 13,
                      cursor: 'pointer',
                      textAlign: 'left',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      transition: 'border-color 0.15s, background 0.15s',
                    }}
                  >
                    <span>{level.name}</span>
                    <span style={{ fontSize: 11, color: completed ? '#22c55e' : '#9ca3af' }}>
                      {completed ? '★★★' : `${level.bpm} BPM`}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* EMG error */}
          {emgError && (
            <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 12, padding: '12px 16px' }}>
              <p style={{ margin: 0, fontSize: 13, color: '#991b1b' }}>
                Please connect the arm sensor before starting.
              </p>
            </div>
          )}

          {/* Session history summary */}
          {(calibration.sessionHistory ?? []).length > 0 && (
            <div style={cardStyle}>
              <p style={labelStyle}>Previous sessions</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
                {calibration.sessionHistory.slice(-3).reverse().map((s, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: NAVY }}>
                    <span>Session {s.sessionNumber} — Level {s.levelId}</span>
                    <span style={{ color: LBLUE, fontWeight: 500 }}>{Math.round((s.hitRate ?? 0) * 100)}%</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <p style={{ margin: 0, fontSize: 11, color: '#9ca3af', textAlign: 'center' }}>
            Enable camera. Move your hands — the conductor mirrors you. .
          </p>
        </div>
      </div>
      {/* Drag handle */}
<div
  onMouseDown={onDragHandleMouseDown}
  onClick={() => { if (isCollapsed) setPanelWidth(0); }}
  title={isCollapsed ? 'Click to open' : 'Drag to resize'}
  style={{
    width: 14,
    height: '100%',
    cursor: 'col-resize',
    pointerEvents: 'auto',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    background: isDragging ? 'rgba(37,99,235,0.12)' : 'transparent',
    transition: 'background 0.15s',
  }}
>
  <div style={{ display: 'flex', flexDirection: 'column', gap: 4, opacity: isDragging ? 0.9 : 0.3 }}>
    {[0,1,2,3,4].map((i) => (
      <div key={i} style={{ width: 3, height: 3, borderRadius: '50%', background: BLUE }} />
    ))}
  </div>
  {isCollapsed && (
    <span style={{ position: 'absolute', fontSize: 16, color: BLUE, opacity: 0.7 }}>›</span>
  )}
</div>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function InfoPill({ label, value }) {
  return (
    <div style={{ background: '#f0f4ff', borderRadius: 8, padding: '5px 10px' }}>
      <span style={{ fontSize: 10, color: '#6b7280', display: 'block', textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</span>
      <span style={{ fontSize: 13, color: NAVY, fontWeight: 600, textTransform: 'capitalize' }}>{value}</span>
    </div>
  );
}

// ── Style constants ────────────────────────────────────────────────────────────

const cardStyle = {
  background: '#ffffff',
  border: '1px solid #e0e7f3',
  borderRadius: 16,
  padding: '18px 20px',
  boxShadow: '0 1px 6px rgba(37,99,235,0.06)',
};

const labelStyle = {
  fontSize: 11,
  color: '#6b7280',
  textTransform: 'uppercase',
  letterSpacing: 0.8,
  fontWeight: 600,
  margin: 0,
};

const inputStyle = {
  marginTop: 8,
  width: '100%',
  padding: '8px 12px',
  borderRadius: 8,
  border: '1px solid #e0e7f3',
  fontSize: 16,
  color: NAVY,
  fontWeight: 600,
  outline: 'none',
  background: '#f8faff',
  boxSizing: 'border-box',
};
