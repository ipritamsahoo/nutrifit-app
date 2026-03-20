/**
 * InsiderWorkspace.jsx
 * =====================
 * Workspace for both Insiders (doctor's patients) and Outsiders (after plan approval).
 * Shows "Today's Tasks" — current day's diet and workout from the active plan.
 * Provides direct access to MediaPipe AI Trainer.
 */

import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { collection, query, where, orderBy, limit, getDocs } from 'firebase/firestore';
import { db } from '../firebase/config';
import ExerciseImage from './ExerciseImage';
import './InsiderWorkspace.css';

export default function InsiderWorkspace() {
  const { currentUser, userRole, userData, logout } = useAuth();
  const navigate = useNavigate();

  const [plan, setPlan] = useState(null);
  const [loading, setLoading] = useState(true);
  const [todayKey, setTodayKey] = useState('day_1');

  // Calculate today's day key (day_1 to day_7 cycling)
  useEffect(() => {
    const dayOfWeek = new Date().getDay(); // 0=Sun, 1=Mon, ...
    const dayNum = dayOfWeek === 0 ? 7 : dayOfWeek; // Map Sun→7
    setTodayKey(`day_${dayNum}`);
  }, []);

  // Fetch active plan
  useEffect(() => {
    if (!currentUser) return;
    fetchPlan();
  }, [currentUser]);

  async function fetchPlan() {
    setLoading(true);
    try {
      // For insiders: get plan assigned by doctor (plan_type = 'manual')
      // For outsiders: get approved AI plan (status = 'approved')
      const q = query(
        collection(db, 'plans'),
        where('uid', '==', currentUser.uid)
      );
      const snap = await getDocs(q);
      if (!snap.empty) {
        const userPlans = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        // Sort by created_at descending in memory to avoid Firebase Index errors
        userPlans.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
        setPlan(userPlans[0]);
      }
    } catch (err) {
      console.error('Error fetching plan:', err);
    } finally {
      setLoading(false);
    }
  }

  function handleLogout() {
    logout();
    navigate('/login');
  }

  // Get today's data from plan
  const todayDiet = plan?.diet_json?.[todayKey] || plan?.diet_json?.plan || null;
  const todayWorkout = plan?.workout_json?.[todayKey] || plan?.workout_json?.plan || null;

  if (loading) {
    return (
      <div className="workspace-page">
        <div className="ws-loading"><div className="spinner" /> Loading your workspace…</div>
      </div>
    );
  }

  return (
    <div className="workspace-page">
      <div className="bg-blob blob-1" />
      <div className="bg-blob blob-2" />

      {/* Header */}
      <header className="ws-header">
        <div className="ws-brand">
          <span>💪</span>
          <h1>HonFit — My Workspace</h1>
        </div>
        <div className="ws-actions">
          <button className="btn-ghost" onClick={handleLogout}>Logout</button>
        </div>
      </header>

      <main className="ws-content">
        <h2 className="ws-greeting">
          Welcome, {userData?.name || currentUser?.email?.split('@')[0]}! 👋
        </h2>

        {!plan ? (
          <div className="no-plan-card">
            <div className="npc-icon">📋</div>
            <h3>No Active Plan Yet</h3>
            <p>
              {userRole === 'insider'
                ? "Your doctor hasn't assigned a plan yet. Please contact your doctor."
                : "Go to the Virtual Coach to create your personalized plan!"
              }
            </p>
            {userRole === 'outsider' && (
              <button className="btn-primary" onClick={() => navigate('/chat')}>
                🤖 Chat with Virtual Coach
              </button>
            )}
          </div>
        ) : (
          <>
            {/* Day Selector */}
            <div className="day-selector">
              {[1,2,3,4,5,6,7].map(d => (
                <button
                  key={d}
                  className={`day-btn ${todayKey === `day_${d}` ? 'active' : ''}`}
                  onClick={() => setTodayKey(`day_${d}`)}
                >
                  Day {d}
                </button>
              ))}
            </div>

            <div className="tasks-grid">
              {/* Diet Card */}
              <section className="task-card">
                <div className="tc-header">
                  <span>🥗</span>
                  <h3>Today's Diet</h3>
                </div>
                <div className="tc-body">
                  {todayDiet && typeof todayDiet === 'object' ? (
                    Object.entries(todayDiet).map(([mealName, meal]) => (
                      <div className="meal-item" key={mealName}>
                        <span className="meal-label">{mealName}</span>
                        <span className="meal-value">
                          {typeof meal === 'object' ? meal.meal : meal}
                        </span>
                        {typeof meal === 'object' && meal.calories && (
                          <span className="meal-cal">{meal.calories} cal</span>
                        )}
                      </div>
                    ))
                  ) : todayDiet ? (
                    <p className="plan-text">{String(todayDiet)}</p>
                  ) : (
                    <p className="no-data">No diet plan for this day.</p>
                  )}
                </div>
                {plan.daily_calories_target && (
                  <div className="tc-footer">
                    🔥 Daily Target: <strong>{plan.daily_calories_target} kcal</strong>
                    {plan.daily_water_liters && <> • 💧 {plan.daily_water_liters}L water</>}
                  </div>
                )}
              </section>

              {/* Workout Card */}
              <section className="task-card">
                <div className="tc-header">
                  <span>🏋️</span>
                  <h3>Today's Workout</h3>
                </div>
                <div className="tc-body">
                  {todayWorkout && typeof todayWorkout === 'object' ? (
                    <>
                      {todayWorkout.exercises?.map((ex, i) => (
                        <div className="exercise-item" key={i} style={{ display: 'flex', alignItems: 'center' }}>
                          <div className="ex-img-container">
                            <ExerciseImage name={ex.name} />
                          </div>
                          <div className="ex-item-content">
                            <div className="ex-name">{ex.name}</div>
                            <div className="ex-detail">
                              {ex.sets}×{ex.reps} • {ex.target_muscle}
                            </div>
                          </div>
                        </div>
                      ))}
                      {todayWorkout.duration_minutes && (
                        <div className="workout-duration">
                          ⏱ {todayWorkout.duration_minutes} min
                        </div>
                      )}
                    </>
                  ) : todayWorkout ? (
                    <p className="plan-text">{String(todayWorkout)}</p>
                  ) : (
                    <p className="no-data">No workout for this day. Rest day! 😴</p>
                  )}
                </div>

                {/* Start Workout Button */}
                {todayWorkout && (
                  <button className="btn-primary start-workout-btn" onClick={() => navigate('/workout')}>
                    🎥 Start AI Workout Tracker
                  </button>
                )}
              </section>
            </div>

            {/* Doctor's Notes */}
            {plan.notes && (
              <div className="notes-card">
                <h4>📝 {plan.plan_type === 'manual' ? "Doctor's Notes" : "AI Notes"}</h4>
                <p>{plan.notes}</p>
              </div>
            )}
          </>
        )}
      </main>

      {/* Floating Chatbot Button */}
      {userRole === 'outsider' && (
        <button 
          className="fab-chat" 
          onClick={() => navigate('/chat')}
          title="Ask Virtual Coach"
        >
          💬 AI Coach
        </button>
      )}
    </div>
  );
}
