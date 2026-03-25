/**
 * EnrollPrescribeModal.jsx
 * ========================
 * Unified modal: Create patient account + assign initial prescription in one flow.
 * Merges AddPatientModal (account fields) + PrescriptionModal (prescription UI).
 *
 * Uses the .rx-* CSS classes defined in DoctorDashboard.css.
 * Fully self-contained: manages account, diet, exercise, AI, and approval state.
 *
 * Props:
 *   - doctorUid : string       (currentUser.uid)
 *   - onSuccess : () => void   (refresh patient list after creation)
 *   - onClose   : () => void
 */

import { useState, useEffect } from 'react';
import { Chart as ChartJS, ArcElement, Tooltip, Legend } from 'chart.js';
import { Doughnut } from 'react-chartjs-2';

ChartJS.register(ArcElement, Tooltip, Legend);

const API_URL = 'http://localhost:8000';

export default function EnrollPrescribeModal({ doctorUid, onSuccess, onClose }) {

  /* ── Account fields (from AddPatientModal) ──────────── */
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');

  /* ── Patient demographics ──────────────────────────── */
  const [patientName, setPatientName] = useState('');
  const [age, setAge]                 = useState('');
  const [weight, setWeight]           = useState('');
  const [height, setHeight]           = useState('');
  const [medicalHistory, setMedicalHistory] = useState('');

  /* ── Plan type ─────────────────────────────────────── */
  const [planType, setPlanType] = useState('both'); // 'diet' | 'exercise' | 'both'

  /* ── Diet fields ───────────────────────────────────── */
  const [breakfast, setBreakfast] = useState('');
  const [lunch, setLunch]         = useState('');
  const [dinner, setDinner]       = useState('');
  const [showChart, setShowChart] = useState(false);

  /* ── Exercise fields ───────────────────────────────── */
  const [exercises, setExercises] = useState([]);

  /* ── Footer ────────────────────────────────────────── */
  const [duration, setDuration] = useState('2 Weeks');

  /* ── UI state ──────────────────────────────────────── */
  const [generating, setGenerating] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [showToast, setShowToast]   = useState(false);
  const [error, setError]           = useState('');

  /* ── Close on ESC ──────────────────────────────────── */
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  /* ── Exercise CRUD ─────────────────────────────────── */
  function addExercise() {
    setExercises(prev => [...prev, { id: Date.now().toString(), name: '', sets: 3, reps: 10 }]);
  }
  function updateExercise(id, field, value) {
    setExercises(prev => prev.map(ex => ex.id === id ? { ...ex, [field]: value } : ex));
  }
  function removeExercise(id) {
    setExercises(prev => prev.filter(ex => ex.id !== id));
  }

  /* ── AI Generate ───────────────────────────────────── */
  async function generateAI() {
    setGenerating(true);
    try {
      const res = await fetch(`${API_URL}/generate-plan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          uid: 'new-patient', // Temporary UID for generation
          age: parseInt(age) || 25,
          weight: parseFloat(weight) || 70,
          height: parseFloat(height) || 170,
          goal: 'Stay Fit',
          medical_conditions: medicalHistory,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        const fullPlan = data.plan || {};
        
        // Gemini returns a 7-day structure. We extract Day 1 for the initial prescription.
        const day1Diet = fullPlan.diet_plan?.day_1 || {};
        const day1Workout = fullPlan.workout_plan?.day_1 || {};

        if (day1Diet.breakfast) {
          const b = day1Diet.breakfast;
          setBreakfast(typeof b === 'object' ? `${b.meal}${b.calories ? ` (${b.calories} cal)` : ''}` : b);
        }
        if (day1Diet.lunch) {
          const l = day1Diet.lunch;
          setLunch(typeof l === 'object' ? `${l.meal}${l.calories ? ` (${l.calories} cal)` : ''}` : l);
        }
        if (day1Diet.dinner) {
          const d = day1Diet.dinner;
          setDinner(typeof d === 'object' ? `${d.meal}${d.calories ? ` (${d.calories} cal)` : ''}` : d);
        }

        if (day1Workout.exercises) {
          setExercises(day1Workout.exercises.map((ex, i) => ({
            id: `ex_${i}`, 
            name: ex.name || '', 
            sets: ex.sets || 3, 
            reps: ex.reps || 10,
          })));
        }
        setShowChart(true);
      } else {
        simulateFallback();
      }
    } catch (err) {
      console.error("[AI] Generation failed:", err);
      simulateFallback();
    } finally {
      setGenerating(false);
    }
  }

  function simulateFallback() {
    setBreakfast('• 1 bowl of Oatmeal with mixed berries\n• 1 scoop of whey protein (water)\n• 1 cup green tea');
    setLunch('• 150g Grilled chicken breast\n• 100g Quinoa\n• Steamed broccoli & asparagus');
    setDinner('• 150g Baked Atlantic Salmon\n• Sweet potato mash (small portion)\n• Mixed leaf salad with olive oil');
    setExercises([
      { id: 'ex_1', name: 'Straight Leg Raises', sets: 3, reps: 10 },
      { id: 'ex_2', name: 'Wall Slides',         sets: 3, reps: 12 },
      { id: 'ex_3', name: 'Ankle Pumps',         sets: 3, reps: 20 },
    ]);
    setShowChart(true);
  }

  /* ── Enroll & Prescribe: Create Account → Assign ──── */
  async function handleEnroll() {
    setError('');

    // Validate required account fields
    if (!patientName.trim() || !email.trim() || !password.trim()) {
      setError('Name, Email, and Password are required.');
      return;
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }

    setSubmitting(true);
    try {
      // Phase 1: Create patient account
      const createRes = await fetch(`${API_URL}/create-insider`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          doctor_uid: doctorUid,
          patient_name: patientName,
          patient_email: email,
          patient_password: password,
        }),
      });
      const createData = await createRes.json();
      if (!createRes.ok) throw new Error(createData.detail || 'Failed to create account');

      const patientUid = createData.patient_uid;

      // Phase 2: Assign prescription (only if diet/exercises exist)
      const dietJson    = { breakfast, lunch, dinner };
      const workoutJson = { exercises: exercises.map(({ name, sets, reps }) => ({ name, sets: +sets, reps: +reps })) };
      const hasPrescription = breakfast || lunch || dinner || exercises.length > 0;

      if (hasPrescription) {
        await fetch(`${API_URL}/assign-prescription`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            doctor_uid: doctorUid,
            patient_uid: patientUid,
            diet_json:    (planType === 'diet' || planType === 'both') ? dietJson    : {},
            workout_json: (planType === 'exercise' || planType === 'both') ? workoutJson : {},
            notes: `Duration: ${duration} | Medical: ${medicalHistory}`,
          }),
        });
      }

      setShowToast(true);
      setTimeout(() => {
        setShowToast(false);
        onSuccess();
        onClose();
      }, 2500);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  /* ── Chart data ────────────────────────────────────── */
  const chartData = {
    labels: ['Protein', 'Carbs', 'Fats'],
    datasets: [{ data: [40, 35, 25], backgroundColor: ['#8b5cf6', '#10b981', '#f59e0b'], borderWidth: 0, hoverOffset: 4 }],
  };
  const chartOptions = {
    responsive: true, maintainAspectRatio: false,
    plugins: {
      legend: { position: 'right', labels: { color: '#a1a1aa', font: { size: 10 } } },
      tooltip: { backgroundColor: '#18181b', titleColor: '#f4f4f5', bodyColor: '#d4d4d8', borderColor: '#3f3f46', borderWidth: 1 },
    },
    cutout: '70%',
  };

  const showDiet     = planType === 'diet'     || planType === 'both';
  const showExercise = planType === 'exercise' || planType === 'both';

  /* ── Plan-type card active styles ──────────────────── */
  function planActiveStyles(type) {
    const active = planType === type;
    const map = {
      diet:     { bg: 'rgba(59,130,246,0.1)',  border: 'rgba(59,130,246,0.5)',  glow: 'rgba(59,130,246,0.1)',  dot: '#60a5fa', inner: '#60a5fa', label: '#93c5fd', iconBg: 'rgba(59,130,246,0.2)', iconBorder: 'rgba(59,130,246,0.2)', icon: '#60a5fa' },
      exercise: { bg: 'rgba(249,115,22,0.1)',  border: 'rgba(249,115,22,0.5)',  glow: 'rgba(249,115,22,0.1)',  dot: '#fb923c', inner: '#fb923c', label: '#fdba74', iconBg: 'rgba(249,115,22,0.2)', iconBorder: 'rgba(249,115,22,0.2)', icon: '#fb923c' },
      both:     { bg: 'rgba(16,185,129,0.1)',  border: 'rgba(16,185,129,0.5)',  glow: 'rgba(16,185,129,0.1)',  dot: '#34d399', inner: '#34d399', label: '#6ee7b7', iconBg: 'rgba(16,185,129,0.2)', iconBorder: 'rgba(16,185,129,0.2)', icon: '#34d399' },
    };
    const c = map[type];
    if (!active) return {};
    return {
      card:  { background: c.bg, borderColor: c.border, boxShadow: `0 0 15px ${c.glow}` },
      dot:   { borderColor: c.dot },
      inner: { background: c.inner },
      label: { color: c.label },
      icon:  { background: c.iconBg, borderColor: c.iconBorder, color: c.icon },
    };
  }

  /* ══════════════════════════════════════════════════════
     RENDER
     ══════════════════════════════════════════════════════ */
  return (
    <>
      {/* Overlay */}
      <div className="rx-overlay">
        <div className="rx-backdrop-glow" />

        {/* Container */}
        <div className="rx-container">

          {/* ── HEADER ────────────────────────────────────── */}
          <div className="rx-header">
            <div className="rx-header-left">
              <div className="rx-header-icon">🩺</div>
              <div>
                <h1 className="rx-header-title">NutriFit Doctor Portal</h1>
                <p className="rx-header-sub">Enroll Patient & Prescribe Plan</p>
              </div>
            </div>
            <div className="rx-header-right">
              <div className="rx-status-badge">
                <span className="rx-status-dot" />
                System Online
              </div>
              <button className="rx-close-btn" onClick={onClose}>✕</button>
            </div>
          </div>

          {/* ── ERROR BANNER ──────────────────────────────── */}
          {error && (
            <div style={{
              margin: '0 24px', padding: '12px 16px',
              background: 'rgba(127,29,29,0.2)', border: '1px solid rgba(127,29,29,0.4)',
              borderRadius: '12px', color: '#fda4af', fontSize: '13px',
            }}>
              {error}
            </div>
          )}

          {/* ── BODY ──────────────────────────────────────── */}
          <div className="rx-body">
            <div className="rx-grid">

              {/* ─── Column 1 — Patient Info + Account ────── */}
              <div className="rx-col">
                <div className="rx-col-header">
                  <span className="rx-icon-indigo">👤</span>
                  <h2>Patient Details & Account</h2>
                </div>

                <div className="rx-field-group">
                  <label className="rx-label">Full Name <span style={{ color: '#f43f5e' }}>*</span></label>
                  <input className="rx-input" type="text" placeholder="e.g. Sam Das"
                    value={patientName} onChange={e => setPatientName(e.target.value)} />
                </div>

                {/* Account fields from AddPatientModal */}
                <div className="rx-field-group">
                  <label className="rx-label">Email (Gmail) <span style={{ color: '#f43f5e' }}>*</span></label>
                  <input className="rx-input" type="email" placeholder="patient@gmail.com"
                    value={email} onChange={e => setEmail(e.target.value)} />
                </div>

                <div className="rx-field-group">
                  <label className="rx-label">Password <span style={{ color: '#f43f5e' }}>*</span></label>
                  <input className="rx-input" type="text" placeholder="Min 6 characters"
                    value={password} onChange={e => setPassword(e.target.value)} />
                </div>

                <div className="rx-row-3">
                  <div className="rx-field-group">
                    <label className="rx-label">Age</label>
                    <input className="rx-input rx-input-center" type="text" placeholder="Years"
                      value={age} onChange={e => setAge(e.target.value)} />
                  </div>
                  <div className="rx-field-group">
                    <label className="rx-label">Weight</label>
                    <input className="rx-input rx-input-center" type="text" placeholder="kg/lbs"
                      value={weight} onChange={e => setWeight(e.target.value)} />
                  </div>
                  <div className="rx-field-group">
                    <label className="rx-label">Height</label>
                    <input className="rx-input rx-input-center" type="text" placeholder="ft/cm"
                      value={height} onChange={e => setHeight(e.target.value)} />
                  </div>
                </div>

                <div className="rx-field-group" style={{ paddingTop: 8 }}>
                  <label className="rx-label rx-label-danger">
                    ❤️‍🩹 Primary Medical Condition / History
                  </label>
                  <textarea className="rx-textarea-danger" rows={4} placeholder="Enter medical history..."
                    value={medicalHistory} onChange={e => setMedicalHistory(e.target.value)} />
                </div>
              </div>

              {/* ─── Column 2 — Plan Type ────────────────── */}
              <div className="rx-col">
                <div className="rx-col-header">
                  <span className="rx-icon-emerald">⚡</span>
                  <h2>Assign Plan Type</h2>
                </div>

                <div className="rx-plan-wrapper">
                  {/* Diet Only */}
                  <button className="rx-plan-card" onClick={() => setPlanType('diet')}
                    style={planActiveStyles('diet').card || {}}>
                    <div className="rx-plan-dot" style={planActiveStyles('diet').dot || {}}>
                      {planType === 'diet' && <div className="rx-plan-dot-inner" style={planActiveStyles('diet').inner || {}} />}
                    </div>
                    <div className="rx-plan-content">
                      <div className="rx-plan-icon-wrap" style={planActiveStyles('diet').icon || {}}>🍎</div>
                      <span className="rx-plan-label" style={planActiveStyles('diet').label || {}}>Diet Only</span>
                    </div>
                  </button>

                  {/* Exercise Only */}
                  <button className="rx-plan-card" onClick={() => setPlanType('exercise')}
                    style={planActiveStyles('exercise').card || {}}>
                    <div className="rx-plan-dot" style={planActiveStyles('exercise').dot || {}}>
                      {planType === 'exercise' && <div className="rx-plan-dot-inner" style={planActiveStyles('exercise').inner || {}} />}
                    </div>
                    <div className="rx-plan-content">
                      <div className="rx-plan-icon-wrap" style={planActiveStyles('exercise').icon || {}}>🏋️</div>
                      <span className="rx-plan-label" style={planActiveStyles('exercise').label || {}}>Exercise Only</span>
                    </div>
                  </button>

                  {/* Both */}
                  <button className="rx-plan-card" onClick={() => setPlanType('both')}
                    style={planActiveStyles('both').card || {}}>
                    <div className="rx-plan-dot" style={planActiveStyles('both').dot || {}}>
                      {planType === 'both' && <div className="rx-plan-dot-inner" style={planActiveStyles('both').inner || {}} />}
                    </div>
                    <div className="rx-plan-content">
                      <div className="rx-plan-icon-wrap" style={planActiveStyles('both').icon || {}}>⚡</div>
                      <div>
                        <span className="rx-plan-label" style={planActiveStyles('both').label || {}}>Both Diet & Exercise</span>
                        {planType === 'both' && (
                          <span className="rx-plan-sub" style={{ color: '#10b981' }}>Recommended for max results</span>
                        )}
                      </div>
                    </div>
                    {planType === 'both' && (
                      <span className="rx-plan-check" style={{ color: '#34d399' }}>✅</span>
                    )}
                  </button>
                </div>
              </div>

              {/* ─── Column 3 — Content (Diet + Exercise) ── */}
              <div className="rx-col rx-col-scroll">

                {/* Generate AI Button */}
                <button
                  className={`rx-generate-btn ${generating ? 'rx-generate-btn--loading' : ''}`}
                  onClick={generateAI}
                  disabled={generating}
                >
                  {generating ? '⏳' : '✨'}
                  <span>{generating ? 'Analyzing Profile & Generating...' : 'Generate Draft with NutriFit AI'}</span>
                </button>

                {/* Diet Section */}
                {showDiet && (
                  <div className="rx-diet-section">
                    <div className="rx-textarea-wrap">
                      <span className="rx-textarea-icon">🍽️</span>
                      <textarea className="rx-diet-input" placeholder="Breakfast Plan..." rows={3}
                        value={breakfast} onChange={e => setBreakfast(e.target.value)} />
                    </div>
                    <div className="rx-textarea-wrap">
                      <span className="rx-textarea-icon">🍽️</span>
                      <textarea className="rx-diet-input" placeholder="Lunch Plan..." rows={3}
                        value={lunch} onChange={e => setLunch(e.target.value)} />
                    </div>
                    <div className="rx-textarea-wrap">
                      <span className="rx-textarea-icon">🍽️</span>
                      <textarea className="rx-diet-input" placeholder="Dinner Plan..." rows={3}
                        value={dinner} onChange={e => setDinner(e.target.value)} />
                    </div>

                    {showChart && (
                      <div className="rx-chart-wrapper">
                        <p className="rx-chart-title">Macro Distribution Target</p>
                        <div className="rx-chart-canvas">
                          <Doughnut data={chartData} options={chartOptions} />
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Exercise Section */}
                {showExercise && (
                  <div className="rx-exercise-section">
                    <div className="rx-exercise-header">
                      <h3>Workout Routine <span className="rx-icon-emerald-sm">✅</span></h3>
                      <button className="rx-add-exercise" onClick={addExercise}>+ Add Manual</button>
                    </div>

                    <div className="rx-exercise-list">
                      {exercises.length === 0 ? (
                        <div className="rx-exercise-empty">No exercises generated yet.</div>
                      ) : (
                        exercises.map(ex => (
                          <div className="rx-exercise-row" key={ex.id}>
                            <input className="rx-exercise-name" type="text" placeholder="Exercise name..."
                              value={ex.name} onChange={e => updateExercise(ex.id, 'name', e.target.value)} />
                            <div className="rx-exercise-nums">
                              <div className="rx-exercise-num-group">
                                <span className="rx-exercise-num-label">SETS</span>
                                <input className="rx-exercise-num-input" type="number"
                                  value={ex.sets} onChange={e => updateExercise(ex.id, 'sets', e.target.value)} />
                              </div>
                              <div className="rx-exercise-num-group">
                                <span className="rx-exercise-num-label">REPS</span>
                                <input className="rx-exercise-num-input" type="number"
                                  value={ex.reps} onChange={e => updateExercise(ex.id, 'reps', e.target.value)} />
                              </div>
                              <button className="rx-exercise-remove" onClick={() => removeExercise(ex.id)}>✕</button>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                )}
              </div>

            </div>
          </div>

          {/* ── FOOTER ────────────────────────────────────── */}
          <div className="rx-footer">
            <div className="rx-footer-left">
              <div className="rx-footer-icon">📅</div>
              <div>
                <span className="rx-footer-label">Plan Duration</span>
                <div className="rx-select-wrap">
                  <select className="rx-select" value={duration} onChange={e => setDuration(e.target.value)}>
                    <option value="1 Week">1 Week</option>
                    <option value="2 Weeks">2 Weeks</option>
                    <option value="4 Weeks">4 Weeks</option>
                    <option value="3 Months">3 Months</option>
                  </select>
                  <span className="rx-select-chevron">▼</span>
                </div>
              </div>
            </div>

            <button
              className={`rx-approve-btn ${submitting ? 'rx-approve-btn--loading' : ''}`}
              onClick={handleEnroll}
              disabled={submitting}
            >
              <span>{submitting ? 'Creating Account & Sending...' : 'Enroll & Prescribe'}</span>
              {submitting ? '⏳' : '📨'}
            </button>
          </div>

        </div>{/* /rx-container */}
      </div>{/* /rx-overlay */}

      {/* ── Toast ──────────────────────────────────────── */}
      <div className={`rx-toast ${showToast ? 'rx-toast--visible' : ''}`}>
        <div className="rx-toast-icon">✅</div>
        <div>
          <p className="rx-toast-title">Patient Enrolled & Prescription Sent!</p>
          <p className="rx-toast-sub">Account created and plan assigned successfully.</p>
        </div>
      </div>
    </>
  );
}
