/**
 * OnboardingForm.jsx
 * ==================
 * Collects patient health metrics (age, weight, height, goal, medical conditions).
 * Sends them to the FastAPI backend to generate an AI plan.
 * Saves the health profile to Firestore.
 */

import { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import './OnboardingForm.css';

const API_URL = 'http://localhost:8000';

const GOALS = [
  { value: 'Lose Weight', icon: '🔥', desc: 'Burn fat & get lean' },
  { value: 'Build Muscle', icon: '💪', desc: 'Gain strength & mass' },
  { value: 'Stay Fit', icon: '🏃', desc: 'Maintain overall health' },
  { value: 'Improve Flexibility', icon: '🧘', desc: 'Stretch & recover' },
];

export default function OnboardingForm() {
  const { currentUser } = useAuth();
  const navigate = useNavigate();

  const [age, setAge]         = useState('');
  const [weight, setWeight]   = useState('');
  const [height, setHeight]   = useState('');
  const [goal, setGoal]       = useState('');
  const [medical, setMedical] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    if (!goal) { setError('Please select a fitness goal.'); return; }
    setError('');
    setLoading(true);

    try {
      const res = await fetch(`${API_URL}/generate-plan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          uid: currentUser.uid,
          age: parseInt(age),
          weight: parseFloat(weight),
          height: parseFloat(height),
          goal,
          medical_conditions: medical,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.detail || 'Failed to generate plan');
      }

      navigate('/dashboard');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="onboarding-page">
      <div className="bg-blob ob-blob-1" />
      <div className="bg-blob ob-blob-2" />

      <div className="onboarding-card">
        <h1 className="ob-title">Tell us about yourself</h1>
        <p className="ob-subtitle">We'll generate a 100% personalized AI plan for you</p>

        {error && <div className="error-msg">{error}</div>}

        <form onSubmit={handleSubmit}>
          <div className="ob-row">
            <div className="input-group">
              <label>Age</label>
              <input type="number" value={age} onChange={e => setAge(e.target.value)}
                     placeholder="25" required min={10} max={120} />
            </div>
            <div className="input-group">
              <label>Weight (kg)</label>
              <input type="number" step="0.1" value={weight} onChange={e => setWeight(e.target.value)}
                     placeholder="70" required min={20} />
            </div>
            <div className="input-group">
              <label>Height (cm)</label>
              <input type="number" step="0.1" value={height} onChange={e => setHeight(e.target.value)}
                     placeholder="175" required min={100} />
            </div>
          </div>

          <div className="input-group">
            <label>Fitness Goal</label>
            <div className="goal-grid">
              {GOALS.map(g => (
                <button key={g.value} type="button"
                        className={`goal-card ${goal === g.value ? 'active' : ''}`}
                        onClick={() => setGoal(g.value)}>
                  <span className="goal-icon">{g.icon}</span>
                  <span className="goal-label">{g.value}</span>
                  <span className="goal-desc">{g.desc}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="input-group">
            <label>Medical Conditions / Allergies (optional)</label>
            <textarea value={medical} onChange={e => setMedical(e.target.value)}
                      placeholder="e.g. Knee injury, lactose intolerant…"
                      rows={3} />
          </div>

          <button className="submit-btn" type="submit" disabled={loading}>
            {loading ? (
              <span className="btn-loading">
                <span className="spinner-sm" /> Generating your AI plan…
              </span>
            ) : '🚀 Generate My Plan'}
          </button>
        </form>
      </div>
    </div>
  );
}
