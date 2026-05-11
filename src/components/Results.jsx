// src/components/Results.jsx
// Post-session screen with rose-rain celebration + full clinical summary.
// Two-layer layout:
//   Patient view  — large emotional feedback, simple movement count
//   Therapist view — expandable clinical panel with all metrics + explanations

import { useEffect, useState } from 'react';
import { ResultsRoseRain } from './ResultsRoseRain';

const BLUE  = '#2563eb';
const NAVY  = '#1a2f6e';
const LBLUE = '#2d4a9e';
const GREEN = '#16a34a';
const RED   = '#dc2626';
const AMBER = '#d97706';

export function Results({ metrics, onPlayAgain, onNextLevel, onExit }) {
  const [showBravo,   setShowBravo]   = useState(false);
  const [showStats,   setShowStats]   = useState(false);
  const [showButtons, setShowButtons] = useState(false);
  const [showClinical,setShowClinical]= useState(false);

  // Applause + staggered reveal
  useEffect(() => {
    const audio = new Audio('/audio/applause.mp3');
    audio.volume = 0.85;
    audio.play().catch(() => {});

    const t1 = setTimeout(() => setShowBravo(true),   300);
    const t2 = setTimeout(() => setShowStats(true),   1800);
    const t3 = setTimeout(() => setShowButtons(true), 2600);
    return () => {
      audio.pause();
      clearTimeout(t1); clearTimeout(t2); clearTimeout(t3);
    };
  }, []);

  const hitRate   = metrics?.hitRate   ?? 0;
  const hitCount  = Math.round((metrics?.totalCues ?? 0) * hitRate);
  const totalCues = metrics?.totalCues ?? 0;
  const stars     = hitRate >= 0.8 ? 3 : hitRate >= 0.6 ? 2 : 1;

  return (
    <div style={{
      position: 'fixed', inset: 0,
      background: 'linear-gradient(160deg, #0f172a 0%, #1e3a5f 60%, #0f172a 100%)',
      zIndex: 400, display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      fontFamily: 'system-ui, Inter, sans-serif', overflow: 'hidden',
    }}>
      {/* Rose rain */}
      <ResultsRoseRain />

      {/* Content layer */}
      <div style={{ position: 'relative', zIndex: 72, display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%', maxWidth: 520, padding: '0 20px' }}>

        {/* BRAVO */}
        {showBravo && (
          <div style={{ textAlign: 'center', animation: 'bravoIn 0.6s cubic-bezier(0.34,1.56,0.64,1) forwards', marginBottom: 8 }}>
            <div style={{ fontSize: 52, marginBottom: 4 }}>🎼</div>
            <h1 style={{ fontSize: 64, fontWeight: 900, color: '#ffffff', margin: 0, letterSpacing: 2, textShadow: '0 0 60px rgba(96,165,250,0.7)' }}>
              BRAVO!
            </h1>
            <div style={{ fontSize: 32, marginTop: 4 }}>
              {'⭐'.repeat(stars)}{'☆'.repeat(3 - stars)}
            </div>
          </div>
        )}

        {/* Stats card */}
        {showStats && metrics && (
          <div style={{
            background: 'rgba(255,255,255,0.08)', backdropFilter: 'blur(16px)',
            border: '1px solid rgba(255,255,255,0.15)', borderRadius: 20,
            padding: '22px 32px', width: '100%',
            animation: 'fadeUp 0.5s ease-out forwards', marginBottom: 16,
          }}>
            {/* Main stat */}
            <p style={{ fontSize: 17, color: 'rgba(200,215,255,0.9)', textAlign: 'center', margin: '0 0 12px' }}>
              You performed{' '}
              <strong style={{ color: '#ffffff', fontSize: 20 }}>{hitCount}</strong>
              {' '}out of{' '}
              <strong style={{ color: '#ffffff', fontSize: 20 }}>{totalCues}</strong>
              {' '}movements
            </p>

            {/* Hit rate bar */}
            <div style={{ height: 18, background: 'rgba(255,255,255,0.12)', borderRadius: 9, overflow: 'hidden', marginBottom: 6 }}>
              <div style={{
                height: '100%', width: `${hitRate * 100}%`,
                background: hitRate >= 0.8 ? `linear-gradient(90deg,${GREEN},#4ade80)` : hitRate >= 0.6 ? `linear-gradient(90deg,${AMBER},#fbbf24)` : `linear-gradient(90deg,${RED},#f87171)`,
                borderRadius: 9, transition: 'width 1.2s ease-out',
              }} />
            </div>
            <p style={{ fontSize: 28, fontWeight: 800, color: '#ffffff', textAlign: 'center', margin: '0 0 16px' }}>
              {Math.round(hitRate * 100)}%
            </p>

            {/* Clinical toggle */}
            <button
              onClick={() => setShowClinical(v => !v)}
              style={{ width: '100%', background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: 10, padding: '9px 14px', fontSize: 13, color: 'rgba(200,215,255,0.9)', cursor: 'pointer', fontWeight: 600, letterSpacing: 0.3 }}
            >
              {showClinical ? '▲ Hide clinical summary' : '▼ Therapist clinical summary'}
            </button>

            {showClinical && <ClinicalPanel metrics={metrics} />}
          </div>
        )}

        {/* Buttons */}
        {showButtons && (
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center', animation: 'fadeUp 0.4s ease-out forwards' }}>
            <button onClick={onPlayAgain} style={btn('#2563eb','#fff')}>Play Again</button>
            <button onClick={onNextLevel} style={btn('rgba(255,255,255,0.12)','#fff')}>Next Level →</button>
            <button onClick={onExit}      style={btn('rgba(255,255,255,0.06)','rgba(200,215,255,0.7)')}>Exit</button>
          </div>
        )}
      </div>

      <style>{`
        @keyframes bravoIn { from { transform: scale(0.6); opacity: 0; } to { transform: scale(1); opacity: 1; } }
        @keyframes fadeUp  { from { transform: translateY(16px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
      `}</style>
    </div>
  );
}

// ── Clinical panel ────────────────────────────────────────────────────────────

function ClinicalPanel({ metrics }) {
  const m = metrics;
  const fatigue = m.fatigueIndex != null
    ? m.fatigueIndex > 1.15 ? { label: 'Declined', color: RED }
    : m.fatigueIndex < 0.85 ? { label: 'Improved', color: GREEN }
    : { label: 'Stable', color: AMBER }
    : null;

  const asymmetry = m.asymmetryRatio != null
    ? m.asymmetryRatio >= 0.9 ? { label: 'Symmetric', color: GREEN }
    : m.asymmetryRatio >= 0.65 ? { label: 'Mild asymmetry', color: AMBER }
    : { label: 'Notable asymmetry', color: RED }
    : null;

  return (
    <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 0 }}>
      <SectionHeader>Movement Performance</SectionHeader>
      <MetricRow
        label="Total Cues"
        value={m.totalCues}
        tip="Total number of movement cues shown during the session."
      />
      <MetricRow
        label="Hit Rate"
        value={`${pct(m.hitRate)}%`}
        color={m.hitRate >= 0.8 ? GREEN : m.hitRate >= 0.6 ? AMBER : RED}
        tip="Fraction of cues where the patient responded in time (any grade: perfect/good/late)."
      />
      <MetricRow
        label="Perfect Hits"
        value={`${pct(m.perfectRate)}%`}
        tip="Cues hit within the tightest timing window (≤25% of the full window). Indicates motor precision."
      />
      <MetricRow
        label="Good Hits"
        value={`${pct(m.goodRate)}%`}
        tip="Cues hit within 25–50% of the timing window."
      />
      <MetricRow
        label="Late Hits"
        value={`${pct(m.lateRate)}%`}
        tip="Cues hit within 50–100% of the timing window. Suggests slower reaction or hesitation."
      />
      <MetricRow
        label="Missed Cues"
        value={`${pct(m.missRate)}%`}
        color={m.missRate > 0.4 ? RED : undefined}
        tip="Cues that passed without any response. High values may indicate fatigue or difficulty."
      />
      {m.wrongRate > 0 && (
        <MetricRow
          label="Wrong Movement"
          value={`${pct(m.wrongRate)}%`}
          color={m.wrongRate > 0.15 ? AMBER : undefined}
          tip="Patient responded but performed the incorrect movement type. May indicate confusion or motor substitution."
        />
      )}

      <SectionHeader>Timing Quality</SectionHeader>
      <MetricRow
        label="Mean Timing Offset"
        value={m.meanTimingOffsetMs > 0 ? `+${Math.round(m.meanTimingOffsetMs)}ms` : `${Math.round(m.meanTimingOffsetMs)}ms`}
        tip="Average timing error vs the beat. Positive = consistently late, negative = early. Closer to 0 = better synchronisation."
      />
      <MetricRow
        label="Timing Variability (SD)"
        value={`±${Math.round(m.sdTimingOffsetMs)}ms`}
        tip="Standard deviation of timing errors. Lower = more consistent rhythm. High values suggest irregular motor control."
      />
      <MetricRow
        label="Reaction Time"
        value={`${Math.round(m.meanReactionTimeMs)}ms avg`}
        tip="Average time from cue reaching the hit zone to patient response. Lower = faster motor reaction."
      />

      <SectionHeader>Bilateral Symmetry</SectionHeader>
      {m.affectedHitRate != null && (
        <MetricRow
          label="Affected Side Hit Rate"
          value={`${pct(m.affectedHitRate)}%`}
          color={m.affectedHitRate < 0.5 ? RED : m.affectedHitRate < 0.7 ? AMBER : GREEN}
          tip="Hit rate specifically for the affected (weaker) limb. Key rehabilitation outcome measure."
        />
      )}
      {m.unaffectedHitRate != null && (
        <MetricRow
          label="Unaffected Side Hit Rate"
          value={`${pct(m.unaffectedHitRate)}%`}
          tip="Hit rate for the healthy limb. Used as reference baseline for asymmetry calculation."
        />
      )}
      {asymmetry && (
        <MetricRow
          label="Symmetry Index"
          value={`${asymmetry.label} (${m.asymmetryRatio?.toFixed(2) ?? '—'})`}
          color={asymmetry.color}
          tip="Ratio of affected÷unaffected hit rate. 1.0 = perfect symmetry, <0.65 = notable asymmetry requiring attention."
        />
      )}

      <SectionHeader>Endurance & Adaptation</SectionHeader>
      {fatigue && (
        <MetricRow
          label="Performance Trend"
          value={fatigue.label}
          color={fatigue.color}
          tip="Compares hit rate in the first half vs second half of the session. 'Declined' may indicate fatigue; 'Improved' indicates warm-up benefit."
        />
      )}
      <MetricRow
        label="Difficulty Adaptations"
        value={m.difficultyAdaptations ?? 0}
        tip="How many times the game automatically adjusted BPM (speed). Frequent adaptations suggest the initial level was poorly calibrated."
      />
      <MetricRow
        label="Starting BPM"
        value={m.startBPM ?? '—'}
        tip="Beats per minute at session start. Determines cue frequency."
      />
      <MetricRow
        label="Final BPM"
        value={m.finalBPM ?? '—'}
        tip="BPM at session end. Higher than start = patient improved and difficulty was increased."
      />
      {m.streakMax > 0 && (
        <MetricRow
          label="Best Streak"
          value={m.streakMax}
          tip="Longest consecutive sequence of successful hits. Reflects sustained attention and motor control."
        />
      )}

      {m.emgDisconnects > 0 && (
        <>
          <SectionHeader>Device</SectionHeader>
          <MetricRow
            label="EMG Signal Drops"
            value={m.emgDisconnects}
            color={m.emgDisconnects > 3 ? RED : AMBER}
            tip="Number of times the EMG electrode lost contact during the session. High values indicate poor electrode placement."
          />
        </>
      )}
    </div>
  );
}

function SectionHeader({ children }) {
  return (
    <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1.5, textTransform: 'uppercase', color: 'rgba(148,163,200,0.7)', padding: '12px 0 4px', borderBottom: '1px solid rgba(255,255,255,0.06)', marginBottom: 2 }}>
      {children}
    </div>
  );
}

function MetricRow({ label, value, color, tip }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <div
        onClick={() => setOpen(v => !v)}
        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13, padding: '5px 0', cursor: tip ? 'pointer' : 'default', borderBottom: '1px solid rgba(255,255,255,0.04)' }}
      >
        <span style={{ color: 'rgba(180,195,255,0.75)', display: 'flex', alignItems: 'center', gap: 5 }}>
          {label}
          {tip && <span style={{ fontSize: 10, color: 'rgba(148,163,200,0.5)', border: '1px solid rgba(148,163,200,0.3)', borderRadius: '50%', width: 14, height: 14, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>?</span>}
        </span>
        <span style={{ fontWeight: 700, color: color ?? '#ffffff' }}>{value}</span>
      </div>
      {open && tip && (
        <div style={{ fontSize: 11, color: 'rgba(180,195,255,0.6)', background: 'rgba(255,255,255,0.05)', borderRadius: 6, padding: '6px 10px', marginBottom: 4, lineHeight: 1.5 }}>
          {tip}
        </div>
      )}
    </div>
  );
}

function pct(v) { return Math.round((v ?? 0) * 100); }

function btn(bg, color) {
  return {
    padding: '12px 24px', borderRadius: 12, border: '1px solid rgba(255,255,255,0.15)',
    fontSize: 14, fontWeight: 700, cursor: 'pointer', background: bg, color,
    backdropFilter: 'blur(8px)',
  };
}
