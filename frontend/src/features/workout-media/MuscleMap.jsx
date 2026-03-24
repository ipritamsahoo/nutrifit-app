import React from 'react';
import { MALE_FRONT_PATHS, MALE_BACK_PATHS, MUSCLE_SLUG_MAP } from './MuscleMapData';

/**
 * MuscleMap Component - Professional Version
 * Uses anatomically correct SVG paths.
 */

const COLORS = {
  base: 'rgba(255, 255, 255, 0.08)',
  highlight: '#6366f1',
  glow: 'rgba(99, 102, 241, 0.6)',
  skeleton: 'rgba(255, 255, 255, 0.03)'
};

const MuscleMap = ({ muscleName, size = 50 }) => {
  // 1. Find the slug for the given muscle name
  const targetSlug = MUSCLE_SLUG_MAP[muscleName] || null;

  // 2. Determine if we should show Front or Back
  const isBackMuscle = (slug) => {
    const backSlugs = ['upper-back', 'lower-back', 'gluteal', 'hamstring', 'trapezius', 'triceps'];
    return backSlugs.includes(slug);
  };

  const view = isBackMuscle(targetSlug) ? 'back' : 'front';
  const muscleGroups = view === 'front' ? MALE_FRONT_PATHS : MALE_BACK_PATHS;

  return (
    <div className="muscle-map-pro" style={{ width: size, height: size * 1.2, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <svg viewBox="0 0 1000 1000" width="100%" height="100%" preserveAspectRatio="xMidYMid meet">
        {/* Background Silhouette/Skeleton */}
        <path
          d="M500,50 L580,80 L620,150 L650,250 L680,400 L700,550 L650,850 L580,950 L500,900 L420,950 L350,850 L300,550 L320,400 L350,250 L380,150 L420,80 Z"
          fill={COLORS.skeleton}
          stroke="rgba(255,255,255,0.05)"
          strokeWidth="2"
        />

        {muscleGroups.map((group) => {
          const isHighlighted = group.slug === targetSlug;
          return (
            <g key={group.slug}>
              {group.paths.map((pathStr, idx) => (
                <path
                  key={`${group.slug}-${idx}`}
                  d={pathStr}
                  fill={isHighlighted ? COLORS.highlight : COLORS.base}
                  style={{
                    transition: 'all 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
                    filter: isHighlighted ? `drop-shadow(0 0 8px ${COLORS.glow})` : 'none',
                    opacity: isHighlighted ? 1 : 0.6
                  }}
                />
              ))}
            </g>
          );
        })}
      </svg>
    </div>
  );
};

export default MuscleMap;
