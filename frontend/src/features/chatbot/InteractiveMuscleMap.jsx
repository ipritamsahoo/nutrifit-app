/**
 * InteractiveMuscleMap.jsx — MuscleWiki SVG with positioned pill buttons
 * SVG is non-interactive; pill buttons overlaid at anatomical positions.
 */
import React, { useState, useRef, useEffect, useCallback } from 'react';
import './InteractiveMuscleMap.css';
import svgRaw from './muscleFrontSvg.txt?raw';

// Each button: SVG group id, label, and position (% from top-left of the SVG container)
const MUSCLE_BUTTONS = [
  // Left column — curved arc following body silhouette
  { id: 'front-shoulders', label: 'Shoulders', top: '16%', left: '22%' },
  { id: 'biceps',          label: 'Biceps',    top: '30%', left: '17%' },
  { id: 'forearms',        label: 'Forearms',  top: '44%', left: '14%' },
  { id: 'quads',           label: 'Quads',     top: '62%', left: '18%' },
  // Right column — curved arc mirrored
  { id: 'traps',           label: 'Neck',      top: '16%', left: '78%' },
  { id: 'chest',           label: 'Chest',     top: '30%', left: '83%' },
  { id: 'abdominals',      label: 'Abs',       top: '44%', left: '86%' },
  { id: 'calves',          label: 'Calves',    top: '62%', left: '82%' },
];

export default function InteractiveMuscleMap({ onConfirm, onSkip }) {
  const [selectedIds, setSelectedIds] = useState([]);
  const svgRef = useRef(null);
  const [ready, setReady] = useState(false);

  // Inject SVG once
  useEffect(() => {
    if (!svgRef.current) return;
    try {
      const cleaned = svgRaw.replace(/class="[^"]*"/g, '');
      svgRef.current.innerHTML = cleaned;

      const svg = svgRef.current.querySelector('svg');
      if (svg) {
        svg.classList.add('mmw-svg');
        svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
        svg.removeAttribute('style');
      }

      // Hide joint circles
      ['shoulders','elbow','wrist','hips','knees','ankles'].forEach(jId => {
        const el = svgRef.current.querySelector('#' + jId);
        if (el) el.style.display = 'none';
      });

      // Make EVERYTHING non-interactive (no direct SVG clicks)
      svgRef.current.style.pointerEvents = 'none';

      // Set all muscle paths to default gray
      const allGroups = svgRef.current.querySelectorAll('g[id]');
      allGroups.forEach(g => {
        g.querySelectorAll('path').forEach(p => {
          p.style.transition = 'all 0.3s ease';
        });
      });

      setReady(true);
    } catch (err) {
      console.error('[MuscleMap] Init failed:', err);
    }
  }, []);

  // Update SVG highlight colors when selection changes
  useEffect(() => {
    if (!ready || !svgRef.current) return;

    MUSCLE_BUTTONS.forEach(({ id }) => {
      const g = svgRef.current.querySelector('#' + CSS.escape(id));
      if (!g) return;
      const sel = selectedIds.includes(id);

      g.querySelectorAll('path').forEach(p => {
        p.style.fill = sel ? '#ef4444' : '#e2e8f0';
        p.style.stroke = sel ? '#991b1b' : '#484a68';
        p.style.strokeWidth = sel ? '3' : '2.5';
        p.style.filter = sel ? 'drop-shadow(0 0 14px rgba(239,68,68,0.6))' : 'none';
      });
    });
  }, [ready, selectedIds]);

  const toggle = (id) => {
    setSelectedIds(prev =>
      prev.includes(id) ? prev.filter(s => s !== id) : [...prev, id]
    );
  };

  const handleConfirm = useCallback(() => {
    const labels = selectedIds.map(
      id => MUSCLE_BUTTONS.find(b => b.id === id)?.label || id
    );
    onConfirm(labels);
  }, [selectedIds, onConfirm]);

  return (
    <div className="muscle-map-widget">
      <div className="mmw-header">
        <span className="mmw-icon">🏋️</span>
        <h3>Select target muscles</h3>
        <p>Tap the labels to select body parts</p>
      </div>

      {/* SVG + Positioned pill buttons */}
      <div className="mmw-body-wrapper">
        <div className="mmw-svg-holder" ref={svgRef} />

        {/* Pill buttons overlaid on the SVG */}
        {MUSCLE_BUTTONS.map(({ id, label, top, left }) => (
          <button
            key={id}
            className={`mmw-pill ${selectedIds.includes(id) ? 'active' : ''}`}
            style={{ top, left }}
            onClick={() => toggle(id)}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Selected chips */}
      {selectedIds.length > 0 && (
        <div className="mmw-selected-chips">
          {selectedIds.map(id => {
            const m = MUSCLE_BUTTONS.find(b => b.id === id);
            return (
              <span key={id} className="mmw-chip"
                onClick={() => toggle(id)}>
                {m?.label || id} ✕
              </span>
            );
          })}
        </div>
      )}

      <div className="mmw-actions">
        <button className="mmw-btn-fullbody" onClick={() => {
          const allIds = MUSCLE_BUTTONS.map(b => b.id);
          setSelectedIds(prev => prev.length === allIds.length ? [] : allIds);
        }}>
          {selectedIds.length === MUSCLE_BUTTONS.length ? '✖ Deselect All' : '💪 Full Body'}
        </button>
        <button className="mmw-btn-confirm" onClick={handleConfirm}
          disabled={selectedIds.length === 0}>
          ✅ Confirm ({selectedIds.length})
        </button>
        <button className="mmw-btn-skip" onClick={onSkip}>Skip →</button>
      </div>
    </div>
  );
}
