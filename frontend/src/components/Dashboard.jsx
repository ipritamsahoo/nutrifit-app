/**
 * Dashboard.jsx
 * =============
 * Patient dashboard that displays the AI-generated plan (diet + workout),
 * and gives access to the Workout Camera mode.
 */

import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { collection, query, where, orderBy, limit, getDocs } from 'firebase/firestore';
import { db } from '../firebase/config';
import './Dashboard.css';

export default function Dashboard() {
  const { currentUser, userRole, logout } = useAuth();
  const navigate = useNavigate();

  const [plan, setPlan] = useState(null);
  const [loading, setLoading] = useState(true);

  /* ── Fetch latest plan from Firestore ─────────────────────── */
  useEffect(() => {
    async function fetchPlan() {
      try {
        const q = query(
          collection(db, 'plans'),
          where('uid', '==', currentUser.uid),
          orderBy('created_at', 'desc'),
          limit(1)
        );
        const snap = await getDocs(q);
        if (!snap.empty) {
          setPlan({ id: snap.docs[0].id, ...snap.docs[0].data() });
        }
      } catch (err) {
        console.error('Error fetching plan:', err);
      } finally {
        setLoading(false);
      }
    }
    if (currentUser) fetchPlan();
  }, [currentUser]);

  function handleLogout() {
    logout();
    navigate('/login');
  }

  if (loading) {
    return (
      <div className="dash-page">
        <div className="dash-loading"><div className="spinner" /> Loading your plan…</div>
      </div>
    );
  }

  return (
    <div className="dash-page">
      {/* Top bar */}
      <header className="dash-header">
        <div className="dash-brand">
          <span>💪</span>
          <h1>NutriFit</h1>
        </div>
        <div className="dash-actions">
          <button className="btn-outline" onClick={() => navigate('/onboarding')}>
            🔄 New Plan
          </button>
          <button className="btn-outline" onClick={() => navigate('/workout')}>
            🎥 Start Workout
          </button>
          <button className="btn-ghost" onClick={handleLogout}>Logout</button>
        </div>
      </header>

      <main className="dash-content">
        <h2 className="dash-greeting">
          Welcome back{currentUser?.email ? `, ${currentUser.email.split('@')[0]}` : ''}! 👋
        </h2>

        {!plan ? (
          <div className="no-plan-card">
            <p>You don't have a plan yet.</p>
            <button className="submit-btn" onClick={() => navigate('/onboarding')}>
              🚀 Generate Your First AI Plan
            </button>
          </div>
        ) : (
          <div className="plan-grid">
            {/* Diet Plan */}
            <section className="plan-section">
              <h3>🥗 Your 7-Day Diet Plan</h3>
              <div className="plan-days">
                {plan.diet_json && Object.entries(plan.diet_json).map(([day, meals]) => (
                  <div className="day-card" key={day}>
                    <h4>{day.replace('_', ' ').toUpperCase()}</h4>
                    {Object.entries(meals).map(([mealName, meal]) => (
                      <div className="meal-row" key={mealName}>
                        <span className="meal-name">{mealName}</span>
                        <span className="meal-desc">{typeof meal === 'object' ? meal.meal : meal}</span>
                        {typeof meal === 'object' && meal.calories && (
                          <span className="meal-cal">{meal.calories} cal</span>
                        )}
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </section>

            {/* Workout Plan */}
            <section className="plan-section">
              <h3>🏋️ Your 7-Day Workout Plan</h3>
              <div className="plan-days">
                {plan.workout_json && Object.entries(plan.workout_json).map(([day, data]) => (
                  <div className="day-card" key={day}>
                    <h4>{day.replace('_', ' ').toUpperCase()}</h4>
                    {data.exercises?.map((ex, i) => (
                      <div className="exercise-row" key={i}>
                        <span className="ex-name">{ex.name}</span>
                        <span className="ex-detail">{ex.sets}×{ex.reps} • {ex.target_muscle}</span>
                      </div>
                    ))}
                    {data.duration_minutes && (
                      <div className="day-duration">⏱ {data.duration_minutes} min</div>
                    )}
                  </div>
                ))}
              </div>
            </section>

            {/* Extra info */}
            {(plan.daily_calories_target || plan.notes) && (
              <section className="plan-section info-section">
                <h3>📋 Summary</h3>
                {plan.daily_calories_target && (
                  <p><strong>Daily Calories Target:</strong> {plan.daily_calories_target} kcal</p>
                )}
                {plan.daily_water_liters && (
                  <p><strong>Daily Water:</strong> {plan.daily_water_liters} L</p>
                )}
                {plan.notes && <p className="plan-notes">{plan.notes}</p>}
              </section>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
