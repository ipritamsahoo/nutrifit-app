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
  const [gender, setGender]           = useState('');
  const [weight, setWeight]           = useState('');
  const [height, setHeight]           = useState('');
  const [medicalHistory, setMedicalHistory] = useState('');

  /* ── Diet Specification fields ─────────────────────── */
  const [dietGoal, setDietGoal] = useState('');
  const [foodPreference, setFoodPreference] = useState('');
  const [bloodPressure, setBloodPressure] = useState('');
  const [activityLevel, setActivityLevel] = useState('');
  const [mealsPerDay, setMealsPerDay]     = useState('');
  const [restrictions, setRestrictions]   = useState([]);

  /* ── Plan type ─────────────────────────────────────── */
  const [planType, setPlanType] = useState(null); // 'diet' | 'exercise' | 'both' | null

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
  const [isPreviewMode, setIsPreviewMode] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [fullGeneratedPlan, setFullGeneratedPlan] = useState(null);
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
          gender: gender,
          weight: parseFloat(weight) || 70,
          height: parseFloat(height) || 170,
          goal: dietGoal || 'Maintain',
          medical_conditions: `${medicalHistory}${bloodPressure !== 'Normal' ? `, BP: ${bloodPressure}` : ''}`,
          food_preference: foodPreference,
          restrictions: restrictions.join(', '),
          activity_level: activityLevel,
          meals_per_day: parseInt(mealsPerDay) || 3,
          plan_mode: planType === 'diet' ? 'deterministic_diet' : 'ai',
          plan_type: planType
        }),
      });
      if (res.ok) {
        const data = await res.json();
        const fullPlan = data.plan || {};
        setFullGeneratedPlan(fullPlan); // Store the full 7-day data
        let day1Diet = {};
        let day1Workout = {};

        if (fullPlan.schema_version === 2) {
          // V2 Deterministic Schema Parsing
          const d1Diet = fullPlan.diet?.[0] || {};
          const meals = d1Diet.meals || {};
          
          day1Diet = {
            breakfast: meals.breakfast ? `${meals.breakfast.name} (${meals.breakfast.cal || 0} cal)` : '',
            lunch: meals.lunch ? `${meals.lunch.name} (${meals.lunch.cal || 0} cal)` : '',
            dinner: meals.dinner ? `${meals.dinner.name} (${meals.dinner.cal || 0} cal)` : '',
          };

          const day1Key = fullPlan.sched?.[0]; 
          const d1Template = fullPlan.tpl?.[day1Key] || {};
          
          day1Workout = {
            exercises: (d1Template.ex || []).map(str => {
               const parts = str.split('|');
               const name = parts[0] || str;
               const setsReps = parts[1] ? parts[1].split('x') : ['3', '10'];
               return { name, sets: setsReps[0] || 3, reps: setsReps[1] || 10 };
            })
          };
        } else {
          // Gemini / Deterministic returns a 7-day structure. We extract Day 1 for the initial preview edit.
          day1Diet = fullPlan.diet_plan?.day_1 || {};
          day1Workout = fullPlan.workout_plan?.day_1 || {};
        }

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
        setIsPreviewMode(true); // Transition to preview/edit phase
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
    setIsPreviewMode(true); // Must transition to preview even on fallback
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

      // Phase 2: Assign prescription (Full 7-day plan)
      let finalDietJson = {};
      let finalWorkoutJson = {};
  
      if (fullGeneratedPlan) {
        if (fullGeneratedPlan.schema_version === 2) {
          finalDietJson = { ...fullGeneratedPlan.diet };
          
          finalWorkoutJson = { 
            sched: fullGeneratedPlan.sched, 
            tpl: fullGeneratedPlan.tpl 
          };
          
          // Modify day 1 using the local state edits
          if (finalDietJson[0]) {
             finalDietJson[0].meals.breakfast = { name: breakfast };
             finalDietJson[0].meals.lunch = { name: lunch };
             finalDietJson[0].meals.dinner = { name: dinner };
          }
          
          if (finalWorkoutJson.sched && finalWorkoutJson.sched[0]) {
             const day1Key = finalWorkoutJson.sched[0];
             if (finalWorkoutJson.tpl[day1Key]) {
                 finalWorkoutJson.tpl[day1Key].ex = exercises.map(({ name, sets, reps }) => `${name}|${sets}x${reps}`);
             }
          }
        } else {
          // V1 Legacy Support
          if (fullGeneratedPlan.diet_plan) {
            finalDietJson = { ...fullGeneratedPlan.diet_plan };
            finalDietJson.day_1 = { breakfast, lunch, dinner };
          }
          if (fullGeneratedPlan.workout_plan) {
            finalWorkoutJson = { ...fullGeneratedPlan.workout_plan };
            finalWorkoutJson.day_1 = {
              exercises: exercises.map(({ name, sets, reps }) => ({ name, sets: +sets, reps: +reps }))
            };
          }
        }
      } else {
        finalDietJson    = { day_1: { breakfast, lunch, dinner } };
        finalWorkoutJson = { day_1: { exercises: exercises.map(({ name, sets, reps }) => ({ name, sets: +sets, reps: +reps })) } };
      }
  
      const hasPrescription = breakfast || lunch || dinner || exercises.length > 0;

      if (hasPrescription) {
        await fetch(`${API_URL}/assign-prescription`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            doctor_uid: doctorUid,
            patient_uid: patientUid,
            diet_json:    (planType === 'diet' || planType === 'both') ? finalDietJson    : {},
            workout_json: (planType === 'exercise' || planType === 'both') ? finalWorkoutJson : {},
            notes: `Goal: ${dietGoal} | Med: ${bloodPressure} | Pref: ${foodPreference} | Active: ${activityLevel} | Meals: ${mealsPerDay}`,
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
    datasets: [{ data: [40, 35, 25], backgroundColor: ['#2563eb', '#059669', '#f59e0b'], borderWidth: 0, hoverOffset: 4 }],
  };
  const chartOptions = {
    responsive: true, maintainAspectRatio: false,
    plugins: {
      legend: { position: 'right', labels: { color: '#64748b', font: { size: 10, weight: 'bold' } } },
      tooltip: { backgroundColor: '#0f172a', titleColor: '#ffffff', bodyColor: '#e2e8f0', borderColor: '#334155', borderWidth: 1 },
    },
    cutout: '70%',
  };

  const showDiet     = planType === 'diet'     || planType === 'both';
  const showExercise = planType === 'exercise' || planType === 'both';

  /* ── Plan-type card active styles ──────────────────── */
  function planActiveStyles(type) {
    const active = planType === type;
    const map = {
      diet:     { bg: '#eff6ff', border: '#2563eb', glow: 'rgba(37,99,235,0.1)',  dot: '#2563eb', inner: '#2563eb', label: '#1e40af', iconBg: '#dbeafe', iconBorder: '#dbeafe', icon: '#2563eb' },
      exercise: { bg: '#fff7ed', border: '#f97316', glow: 'rgba(249,115,22,0.1)',  dot: '#f97316', inner: '#f97316', label: '#9a3412', iconBg: '#ffedd5', iconBorder: '#ffedd5', icon: '#f97316' },
      both:     { bg: '#ecfdf5', border: '#059669', glow: 'rgba(5,150,105,0.1)',  dot: '#059669', inner: '#059669', label: '#065f46', iconBg: '#d1fae5', iconBorder: '#d1fae5', icon: '#059669' },
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

  const isBasicInfoValid = 
    patientName.trim() !== '' && 
    email.includes('@') && 
    password.length >= 6 &&
    age.trim() !== '' &&
    gender !== '' &&
    weight.trim() !== '' &&
    height.trim() !== '';
  
  const isDietSpecsValid = 
    dietGoal !== '' && 
    foodPreference !== '' && 
    bloodPressure !== '' && 
    (restrictions.length > 0 && restrictions[0] !== '') && 
    activityLevel !== '' && 
    mealsPerDay !== '';

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
                    <label className="rx-label">Gender</label>
                    <div className="rx-select-wrap">
                      <select className="rx-select" value={gender} onChange={e => setGender(e.target.value)}>
                        <option value="" disabled>Select Gender</option>
                        <option value="Male">Male</option>
                        <option value="Female">Female</option>
                        <option value="Other">Other</option>
                      </select>
                      <span className="rx-select-chevron">▼</span>
                    </div>
                  </div>
                </div>

                <div className="rx-row-3">
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
              </div>

              {/* ─── Column 2 — Plan Type ────────────────── */}
              <div className={`rx-col ${!isBasicInfoValid ? 'rx-col--locked' : ''}`} style={{ position: 'relative' }}>
                {!isBasicInfoValid && (
                  <div className="rx-step-lock-overlay">
                    <div className="rx-lock-badge">🔒 Step 1 Required</div>
                  </div>
                )}
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
              <div className={`rx-col rx-col-scroll ${!planType ? 'rx-col--locked' : ''}`} style={{ position: 'relative' }}>
                {!planType && (
                  <div className="rx-step-lock-overlay">
                    <div className="rx-lock-badge">🔒 Step 2 Required</div>
                  </div>
                )}
                
                {/* Generate AI Button (only shown if not in preview mode) */}
                {!isPreviewMode && (
                  <button
                    className={`rx-generate-btn ${generating ? 'rx-generate-btn--loading' : ''} ${(!isDietSpecsValid && planType === 'diet') ? 'rx-generate-btn--disabled' : ''}`}
                    onClick={generateAI}
                    disabled={generating || (!isDietSpecsValid && planType === 'diet')}
                  >
                    {generating ? '⏳' : '✨'}
                    <span>{generating ? 'Analyzing Profile & Generating...' : 'Generate Draft with NutriFit AI'}</span>
                  </button>
                )}

                {/* --- PREVIEW MODE HEADER --- */}
                {isPreviewMode && (
                  <div style={{ 
                    display: 'flex', 
                    justifyContent: 'space-between', 
                    alignItems: 'center', 
                    marginBottom: '15px',
                    background: 'rgba(56, 189, 248, 0.1)',
                    padding: '10px 15px',
                    borderRadius: '12px',
                    border: '1px solid rgba(56, 189, 248, 0.2)'
                  }}>
                    <span style={{ fontSize: '14px', fontWeight: '700', color: '#0369a1' }}>📋 Plan Draft Created</span>
                    <button 
                      onClick={() => setIsPreviewMode(false)}
                      style={{ 
                        fontSize: '11px', 
                        background: '#fff', 
                        border: '1px solid #0ea5e9', 
                        color: '#0ea5e9',
                        padding: '4px 8px',
                        borderRadius: '6px',
                        cursor: 'pointer',
                        fontWeight: '600'
                      }}
                    >
                      ↺ Change Parameters
                    </button>
                  </div>
                )}

                {/* Diet Section */}
                {showDiet && (
                  <div className="rx-diet-section">
                    
                    {!isPreviewMode ? (
                      /* Phase 1: Diet Specifications Section */
                      <div className="rx-diet-specs" style={{ 
                        background: '#f8fafc', 
                        borderRadius: '16px', 
                        padding: '16px', 
                        marginBottom: '20px',
                        border: '1px solid #e2e8f0'
                      }}>
                        <h4 style={{ fontSize: '15px', color: '#1e293b', marginBottom: '16px', display: 'flex', alignItems: 'center', fontWeight: '800' }}>
                          <span style={{ marginRight: '8px', fontSize: '18px' }}>🥗</span> Personalized Diet Protocol
                        </h4>
                        
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                          <div className="rx-field-group">
                            <label className="rx-label" style={{ color: '#2563eb' }}>🎯 Primary Goal</label>
                            <div className="rx-select-wrap">
                              <select className="rx-select" style={{ width: '100%' }} value={dietGoal} onChange={e => setDietGoal(e.target.value)}>
                                <option value="" disabled>Select Goal</option>
                                <option value="Weight Loss">Weight Loss</option>
                                <option value="Weight Gain">Weight Gain</option>
                                <option value="Maintain">Maintain</option>
                              </select>
                              <span className="rx-select-chevron">▼</span>
                            </div>
                          </div>

                          <div className="rx-field-group">
                            <label className="rx-label" style={{ color: '#059669' }}>🍎 Food Preference</label>
                            <div className="rx-select-wrap">
                              <select className="rx-select" style={{ width: '100%' }} value={foodPreference} onChange={e => setFoodPreference(e.target.value)}>
                                <option value="" disabled>Select Pref</option>
                                <option value="Veg">Pure Veg</option>
                                <option value="Non-veg">Non-Veg</option>
                                <option value="Eggetarian">Eggetarian</option>
                              </select>
                              <span className="rx-select-chevron">▼</span>
                            </div>
                          </div>

                          <div className="rx-field-group">
                            <label className="rx-label" style={{ color: '#dc2626' }}>🏥 Medical Link</label>
                            <div className="rx-select-wrap">
                              <select className="rx-select" style={{ width: '100%' }} value={bloodPressure} onChange={e => setBloodPressure(e.target.value)}>
                                <option value="" disabled>Select Link</option>
                                <option value="None">No Condition</option>
                                <option value="Diabetes">Diabetic</option>
                                <option value="BP">High BP</option>
                                <option value="Thyroid">Thyroid</option>
                              </select>
                              <span className="rx-select-chevron">▼</span>
                            </div>
                          </div>

                          <div className="rx-field-group">
                            <label className="rx-label" style={{ color: '#d97706' }}>🚫 Restriction</label>
                            <div className="rx-select-wrap">
                              <select className="rx-select" style={{ width: '100%' }} value={restrictions[0]} onChange={e => setRestrictions([e.target.value])}>
                                <option value="" disabled>Select Restriction</option>
                                <option value="None">No Restrictions</option>
                                <option value="No Sugar">Sugar Free</option>
                                <option value="Low Salt">Low Salt</option>
                                <option value="Low Oil">Low Oil</option>
                                <option value="Allergy">Allergy prone</option>
                              </select>
                              <span className="rx-select-chevron">▼</span>
                            </div>
                          </div>

                          <div className="rx-field-group">
                            <label className="rx-label" style={{ color: '#7c3aed' }}>🏃 Activity Level</label>
                            <div className="rx-select-wrap">
                              <select className="rx-select" style={{ width: '100%' }} value={activityLevel} onChange={e => setActivityLevel(e.target.value)}>
                                <option value="" disabled>Select Activity</option>
                                <option value="Sedentary">Sedentary (Office)</option>
                                <option value="Moderate">Moderate (Active)</option>
                                <option value="Active">High Athlete</option>
                              </select>
                              <span className="rx-select-chevron">▼</span>
                            </div>
                          </div>

                          <div className="rx-field-group">
                            <label className="rx-label" style={{ color: '#0891b2' }}>🍴 Meals Count</label>
                            <div className="rx-select-wrap">
                              <select className="rx-select" style={{ width: '100%' }} value={mealsPerDay} onChange={e => setMealsPerDay(e.target.value)}>
                                <option value="" disabled>Select Meals</option>
                                <option value="3">3 Full Meals</option>
                                <option value="4">4 Meals / Day</option>
                                <option value="5">5 Small Meals</option>
                              </select>
                              <span className="rx-select-chevron">▼</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    ) : (
                      /* Phase 2: Diet Preview & Edit Section */
                      <div className="rx-diet-preview" style={{ marginBottom: '25px' }}>
                        <div className="rx-meal-edit-group" style={{ marginBottom: '15px' }}>
                          <label style={{ fontSize: '11px', fontWeight: '800', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: '8px' }}>🌅 Breakfast</label>
                          <textarea 
                            className="rx-textarea"
                            style={{ width: '100%', minHeight: '80px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '12px', fontSize: '13px' }}
                            value={breakfast}
                            onChange={e => setBreakfast(e.target.value)}
                          />
                        </div>
                        <div className="rx-meal-edit-group" style={{ marginBottom: '15px' }}>
                          <label style={{ fontSize: '11px', fontWeight: '800', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: '8px' }}>☀️ Lunch</label>
                          <textarea 
                            className="rx-textarea"
                            style={{ width: '100%', minHeight: '80px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '12px', fontSize: '13px' }}
                            value={lunch}
                            onChange={e => setLunch(e.target.value)}
                          />
                        </div>
                        <div className="rx-meal-edit-group" style={{ marginBottom: '15px' }}>
                          <label style={{ fontSize: '11px', fontWeight: '800', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: '8px' }}>🌙 Dinner</label>
                          <textarea 
                            className="rx-textarea"
                            style={{ width: '100%', minHeight: '80px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '12px', fontSize: '13px' }}
                            value={dinner}
                            onChange={e => setDinner(e.target.value)}
                          />
                        </div>
                      </div>
                    )}

                    {showChart && (
                      <div className="rx-chart-wrapper" style={{ marginTop: '20px' }}>
                        <p className="rx-chart-title">Target Macro Distribution</p>
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

                    <div className="rx-exercise-list" style={{ maxHeight: isPreviewMode ? '300px' : 'none', overflowY: isPreviewMode ? 'auto' : 'visible' }}>
                      {exercises.length === 0 ? (
                        <div className="rx-exercise-empty" style={{ padding: '20px', textAlign: 'center', background: '#f8fafc', borderRadius: '12px', border: '1px dashed #cbd5e1', color: '#64748b' }}>
                          No exercises generated yet.
                        </div>
                      ) : (
                        exercises.map(ex => (
                          <div className="rx-exercise-row" key={ex.id} style={{ marginBottom: '10px', background: isPreviewMode ? '#fff' : 'transparent', padding: '8px', borderRadius: '10px', border: isPreviewMode ? '1px solid #e2e8f0' : 'none' }}>
                            <input className="rx-exercise-name" type="text" placeholder="Exercise name..."
                              style={{ flex: 1, border: 'none', background: 'transparent', fontWeight: '600', outline: 'none' }}
                              value={ex.name} onChange={e => updateExercise(ex.id, 'name', e.target.value)} />
                            <div className="rx-exercise-nums" style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                              <div className="rx-exercise-num-group">
                                <span style={{ fontSize: '9px', fontWeight: '800', color: '#94a3b8' }}>SETS</span>
                                <input className="rx-exercise-num-input" type="number"
                                  style={{ width: '40px', border: 'none', background: '#f1f5f9', borderRadius: '6px', textAlign: 'center', fontWeight: '700' }}
                                  value={ex.sets} onChange={e => updateExercise(ex.id, 'sets', e.target.value)} />
                              </div>
                              <div className="rx-exercise-num-group">
                                <span style={{ fontSize: '9px', fontWeight: '800', color: '#94a3b8' }}>REPS</span>
                                <input className="rx-exercise-num-input" type="number"
                                  style={{ width: '40px', border: 'none', background: '#f1f5f9', borderRadius: '6px', textAlign: 'center', fontWeight: '700' }}
                                  value={ex.reps} onChange={e => updateExercise(ex.id, 'reps', e.target.value)} />
                              </div>
                              <button className="rx-exercise-remove" onClick={() => removeExercise(ex.id)} style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: '14px' }}>✕</button>
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
              className={`rx-approve-btn ${submitting ? 'rx-approve-btn--loading' : ''} ${!isPreviewMode ? 'rx-approve-btn--inactive' : ''}`}
              onClick={handleEnroll}
              disabled={submitting || !isPreviewMode}
              style={{ 
                opacity: !isPreviewMode ? 0.6 : 1,
                cursor: !isPreviewMode ? 'not-allowed' : 'pointer',
                background: !isPreviewMode ? '#94a3b8' : 'linear-gradient(135deg, #0ea5e9 0%, #2563eb 100%)'
              }}
            >
              <span>{submitting ? 'Creating Account & Sending...' : isPreviewMode ? '✨ Approve & Enroll Patient' : '🔒 Preview Required'}</span>
              {submitting ? '⏳' : isPreviewMode ? '✅' : '🛡️'}
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
