/**
 * DoctorDashboard.jsx — 3-Column Command Center (Vanilla CSS)
 * ============================================================
 * Col A (25%)  → Patient Directory  (Firebase)
 * Col B (45%)  → Monitoring & Analytics
 * Col C (30%)  → AI Co-Pilot Prescription (FastAPI)
 *
 * All styles live in DoctorDashboard.css (no Tailwind needed).
 */

import { useState, useEffect } from 'react';
import {
  Search, Filter, Activity, AlertTriangle, Sparkles,
  Send, User, ChevronDown, CheckCircle, Plus, X,
  Flame, Timer, Check, Stethoscope, LogOut, AlertCircle,
  ClipboardList, UserPlus
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { collection, query, where, getDocs, orderBy, limit, onSnapshot } from 'firebase/firestore';
import { db } from '../../firebase/config';
import './DoctorDashboard.css';
import EnrollPrescribeModal from './EnrollPrescribeModal';
import DoctorChatbotWidget from './DoctorChatbotWidget';

const API_URL = 'http://localhost:8000';

/* ── Helpers ──────────────────────────────────────────── */
const ProfileEmoji = ({ gender }) => (
  <span role="img" aria-label="profile">
    {gender?.toLowerCase() === 'female' ? '👩' : '👨'}
  </span>
);

function adhClass(score) {
  if (score >= 80) return 'green';
  if (score >= 50) return 'amber';
  return 'red';
}

export default function DoctorDashboard() {
  const { currentUser, userData, logout, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  /* ── Patient state ─────────────────────────────────── */
  const [patients, setPatients] = useState([]);
  const [loadingPatients, setLoadingPatients] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedPatient, setSelectedPatient] = useState(null);

  /* ── Logs state ────────────────────────────────────── */
  const [showLogsModal, setShowLogsModal] = useState(false);
  const [patientLogs, setPatientLogs] = useState([]);

  /* ── Add Patient modal ─────────────────────────────── */
  const [showAddModal, setShowAddModal] = useState(false);

  /* ── AI Prescription (Column C) ────────────────────── */
  const [isGenerating, setIsGenerating] = useState(false);
  const [loadingText, setLoadingText] = useState('');
  const [toast, setToast] = useState(false);
  const [prescription, setPrescription] = useState({
    goal: 'Weight Loss - 1500 Cal',
    detox: '', breakfast: '', lunch: '', snack: '', dinner: '',
    exercises: []
  });

  /* ── Real-time Patient Listener ────────────────────── */
  useEffect(() => {
    if (!currentUser) return;

    setLoadingPatients(true);
    const q = query(
      collection(db, 'users'),
      where('doctor_id', '==', currentUser.uid),
      where('role', '==', 'insider')
    );

    const unsubscribe = onSnapshot(q, (snap) => {
      const data = snap.docs.map(d => {
        const raw = d.data();
        return {
          id: d.id, ...raw,
          adherence: raw.adherence ?? 0,
          dietAdherence: raw.dietAdherence ?? 0,
          exerciseAdherence: raw.exerciseAdherence ?? 0,
          caloriesBurned: raw.caloriesBurned ?? 0,
          workoutDuration: raw.workoutDuration ?? 0,
          condition: raw.condition || 'General Fitness',
          gender: raw.gender || 'male',
        };
      });
      setPatients(data);
      // Update selected patient data if they are in the list
      if (data.length > 0 && !selectedPatient) {
        setSelectedPatient(data[0]);
      } else if (selectedPatient) {
        const updated = data.find(p => p.id === selectedPatient.id);
        if (updated) setSelectedPatient(updated);
      }
      setLoadingPatients(false);
    }, (err) => {
      console.error('Error listening to patients:', err);
      setLoadingPatients(false);
    });

    return () => unsubscribe();
  }, [currentUser]);

  useEffect(() => {
    if (selectedPatient?.goal) setPrescription(p => ({ ...p, goal: selectedPatient.goal }));
  }, [selectedPatient]);


  /* ── View Logs ─────────────────────────────────────── */
  async function handleViewLogs() {
    if (!selectedPatient) return;
    setShowLogsModal(true);
    try {
      const q = query(collection(db, 'logs'), where('uid', '==', selectedPatient.uid), orderBy('date', 'desc'), limit(20));
      const snap = await getDocs(q);
      setPatientLogs(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch { setPatientLogs([]); }
  }

  /* ── AI Generate ───────────────────────────────────── */
  async function handleGenerateAI() {
    if (!selectedPatient) return;
    setIsGenerating(true);
    setLoadingText('Analyzing Patient Data...');
    setTimeout(() => setLoadingText('Structuring Workouts...'), 600);
    setTimeout(() => setLoadingText('Optimizing Nutrition...'), 1200);
    try {
      const res = await fetch(`${API_URL}/generate-plan`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          uid: selectedPatient.uid, age: 25, weight: 70, height: 170,
          goal: prescription.goal,
          medical_conditions: selectedPatient.condition || '',
        }),
      });
      if (res.ok) {
        const data = await res.json();
        const fullPlan = data.plan || {};
        
        // Gemini returns a 7-day structure. We extract Day 1 for the initial prescription.
        const d1Diet = fullPlan.diet_plan?.day_1 || {};
        const d1Workout = fullPlan.workout_plan?.day_1 || {};

        setPrescription(p => ({
          ...p,
          detox: d1Diet.detox 
            ? (typeof d1Diet.detox === 'object' ? `${d1Diet.detox.meal}${d1Diet.detox.calories ? ` (${d1Diet.detox.calories} cal)` : ''}` : d1Diet.detox)
            : '',
          breakfast: d1Diet.breakfast
            ? (typeof d1Diet.breakfast === 'object' ? `${d1Diet.breakfast.meal}${d1Diet.breakfast.calories ? ` (${d1Diet.breakfast.calories} cal)` : ''}` : d1Diet.breakfast)
            : '',
          lunch: d1Diet.lunch
            ? (typeof d1Diet.lunch === 'object' ? `${d1Diet.lunch.meal}${d1Diet.lunch.calories ? ` (${d1Diet.lunch.calories} cal)` : ''}` : d1Diet.lunch)
            : '',
          snack: d1Diet.snacks
            ? (typeof d1Diet.snacks === 'object' ? `${d1Diet.snacks.meal}${d1Diet.snacks.calories ? ` (${d1Diet.snacks.calories} cal)` : ''}` : d1Diet.snacks)
            : '',
          dinner: d1Diet.dinner
            ? (typeof d1Diet.dinner === 'object' ? `${d1Diet.dinner.meal}${d1Diet.dinner.calories ? ` (${d1Diet.dinner.calories} cal)` : ''}` : d1Diet.dinner)
            : '',
          exercises: (d1Workout.exercises || []).map(ex => ({
            name: ex.name, sets: ex.sets || 3, reps: ex.reps || 10
          })),
        }));
      } else { fallbackAI(); }
    } catch { fallbackAI(); }
    finally { setIsGenerating(false); setLoadingText(''); }
  }

  function fallbackAI() {
    setPrescription(p => ({
      ...p,
      detox: 'Warm lemon water with cinnamon.',
      breakfast: '2 Scrambled eggs, 1 slice whole-wheat toast, 1/2 avocado.',
      lunch: 'Grilled chicken (150g), quinoa (1/2 cup), steamed broccoli.',
      snack: 'Greek yogurt (100g) with a handful of almonds.',
      dinner: 'Baked salmon (120g) with asparagus and mixed green salad.',
      exercises: [
        { name: 'Bodyweight Squats', sets: 3, reps: 15 },
        { name: 'Push-ups (Modified)', sets: 3, reps: 10 },
        { name: 'Plank', sets: 3, reps: '45 sec' },
      ],
    }));
  }

  /* ── Save & Send ───────────────────────────────────── */
  async function handleSaveAndSend() {
    if (!selectedPatient) return;
    try {
      await fetch(`${API_URL}/assign-prescription`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          doctor_uid: currentUser.uid, patient_uid: selectedPatient.uid,
          diet_json: {
            detox: prescription.detox, breakfast: prescription.breakfast,
            lunch: prescription.lunch, snack: prescription.snack, dinner: prescription.dinner,
          },
          workout_json: { exercises: prescription.exercises },
          notes: `Goal: ${prescription.goal}`,
        }),
      });
    } catch (err) { console.error('Send error:', err); }
    setToast(true);
    setTimeout(() => setToast(false), 3000);
  }

  function handleLogout() { logout(); navigate('/login'); }

  const filtered = patients.filter(p =>
    p.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    p.email?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  /* ── Loading ───────────────────────────────────────── */
  if (authLoading || (currentUser && loadingPatients)) return (
    <div className="cmd-loading" style={{ 
      height: '100vh', width: '100%', display: 'flex', alignItems: 'center', 
      justifyContent: 'center', background: '#f8fafc', color: '#2563eb' 
    }}>
      <div className="cmd-spinner" style={{
        width: '40px', height: '40px', border: '3px solid rgba(255,255,255,0.1)',
        borderTopColor: 'currentColor', borderRadius: '50%', animation: 'spin 1s linear infinite'
      }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );

  /* ══════════════════════════════════════════════════════
     RENDER
     ══════════════════════════════════════════════════════ */
  return (
    <div className="cmd-center">

      {/* ═══ COLUMN A — Patient Directory ═══ */}
      <div className="col-a">
        <div className="col-a-header">
          <div className="col-a-brand">
            <div className="col-a-brand-left">
              <div className="col-a-logo"><Stethoscope size={22} /></div>
              <h1 className="col-a-title">NutriFit <span className="col-a-title-accent">-</span> Doctor Portal</h1>
            </div>
            <div className="col-a-btns">
              <button className="col-a-icon-btn" onClick={() => setShowAddModal(true)} title="Add Patient"><UserPlus size={18} /></button>
              <button className="col-a-icon-btn danger" onClick={handleLogout} title="Logout"><LogOut size={18} /></button>
            </div>
          </div>
          <div className="col-a-search-wrap">
            <Search className="col-a-search-icon" size={18} />
            <input className="col-a-search-input" type="text" placeholder="Search patients..."
              value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
            <Filter className="col-a-filter-icon" size={18} />
          </div>
        </div>

        <div className="col-a-list cmd-scroll">
          {filtered.length === 0 ? (
            <div className="col-a-empty">{patients.length === 0 ? 'No patients yet. Click + to add.' : 'No matches found.'}</div>
          ) : filtered.map(patient => (
            <div key={patient.id}
              className={`p-card ${selectedPatient?.id === patient.id ? 'active' : ''}`}
              onClick={() => setSelectedPatient(patient)}>
              <div className="p-card-row">
                <div className="p-card-avatar-wrap">
                  <div className="p-card-avatar"><ProfileEmoji gender={patient.gender} /></div>
                  <div className={`p-card-status-dot ${patient.adherence >= 50 ? 'online' : 'offline'}`} />
                </div>
                <div className="p-card-info">
                  <p className="p-card-name">{patient.name}</p>
                  <p className="p-card-sub">{patient.condition}</p>
                </div>
                <div className={`adh-badge adh-${adhClass(patient.adherence)}`}>
                  <span className="adh-badge-num">{patient.adherence}%</span>
                  <span className="adh-badge-label">Score</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ═══ COLUMN B — Monitoring & Analytics ═══ */}
      <div className="col-b">
        {selectedPatient ? (
          <>
            <div className="col-b-header">
              <div className="col-b-header-row">
                <div>
                  <h2 className="col-b-name">{selectedPatient.name}</h2>
                  <div className="col-b-meta">
                    <span className="col-b-meta-item"><User size={14} /> {selectedPatient.condition}</span>
                    {selectedPatient.adherence > 0 && (
                      <><span>•</span>
                        <span className="col-b-meta-item col-b-active"><Activity size={14} /> Active</span></>
                    )}
                  </div>
                </div>
                <button className="col-b-logs-btn" onClick={handleViewLogs}>View Logs</button>
              </div>
            </div>

            <div className="col-b-content cmd-scroll">
              {/* Alert */}
              {selectedPatient.recentAlert && (
                <div className="col-b-alert">
                  <div className="col-b-alert-icon"><AlertCircle size={20} /></div>
                  <div>
                    <p className="col-b-alert-title">Action Required</p>
                    <p className="col-b-alert-text">{selectedPatient.recentAlert}</p>
                  </div>
                </div>
              )}

              {/* Vitals */}
              <div className="vitals-grid">
                <div className="vital-card">
                  <div className="vital-icon orange"><Flame size={20} /></div>
                  <div><p className="vital-label">Burned</p><p className="vital-value">{selectedPatient.caloriesBurned ? `${selectedPatient.caloriesBurned} kcal` : '—'}</p></div>
                </div>
                <div className="vital-card">
                  <div className="vital-icon cyan"><Timer size={20} /></div>
                  <div><p className="vital-label">Duration</p><p className="vital-value">{selectedPatient.workoutDuration ? `${selectedPatient.workoutDuration} min` : '—'}</p></div>
                </div>
              </div>

              {/* Adherence Analytics */}
              <div className="analytics-grid">
                <div className="analytics-card">
                  <h3 className="analytics-title">Adherence Breakdown</h3>
                  <div className="bar-group">
                    <div className="bar-header">
                      <span className="bar-label">Diet & Nutrition</span>
                      <span className={`bar-value ${adhClass(selectedPatient.dietAdherence)}`}>{selectedPatient.dietAdherence}%</span>
                    </div>
                    <div className="bar-track">
                      <div className={`bar-fill ${adhClass(selectedPatient.dietAdherence)}`} style={{ width: `${selectedPatient.dietAdherence}%` }} />
                    </div>
                  </div>
                  <div className="bar-group">
                    <div className="bar-header">
                      <span className="bar-label">Exercise & Mobility</span>
                      <span className={`bar-value ${selectedPatient.exerciseAdherence >= 80 ? 'violet' : adhClass(selectedPatient.exerciseAdherence)}`}>{selectedPatient.exerciseAdherence}%</span>
                    </div>
                    <div className="bar-track">
                      <div className={`bar-fill ${selectedPatient.exerciseAdherence >= 80 ? 'violet' : adhClass(selectedPatient.exerciseAdherence)}`} style={{ width: `${selectedPatient.exerciseAdherence}%` }} />
                    </div>
                  </div>
                </div>

                {/* Circular Gauge */}
                <div className="analytics-card centered">
                  <div className="gauge-wrap">
                    <svg className="gauge-svg" viewBox="0 0 96 96">
                      <circle className="gauge-bg" cx="48" cy="48" r="36" strokeWidth="8" fill="transparent" />
                      <circle className={`gauge-fill ${adhClass(selectedPatient.adherence)}`}
                        cx="48" cy="48" r="36" strokeWidth="8" fill="transparent"
                        strokeDasharray={`${(selectedPatient.adherence / 100) * 226} 226`}
                        strokeLinecap="round" />
                    </svg>
                    <div className="gauge-text">
                      <span className="gauge-num">{selectedPatient.adherence}%</span>
                    </div>
                  </div>
                  <p className="gauge-label">Overall Adherence</p>
                </div>
              </div>
            </div>
          </>
        ) : (
          <div className="col-b-placeholder">Select a patient to view analytics</div>
        )}
      </div>

      {/* ═══ COLUMN C — AI Co-Pilot ═══ */}
      <div className="col-c">
        <div className="col-c-header">
          <div className="col-c-header-row">
            <Sparkles size={18} className="col-c-header-icon" />
            <h2 className="col-c-header-title">AI Co-Pilot</h2>
          </div>
          <p className="col-c-header-sub">Auto-generate optimized plans based on patient data.</p>
        </div>

        <div className="col-c-content cmd-scroll">
          {/* Goal Selector */}
          <div>
            <label className="goal-label">Patient Goal</label>
            <div className="goal-select-wrap">
              <select className="goal-select" value={prescription.goal}
                onChange={e => setPrescription({ ...prescription, goal: e.target.value })}>
                <option value="Weight Loss - 1500 Cal">Weight Loss - 1500 Cal</option>
                <option value="Weight Loss - 1200 Cal">Weight Loss - 1200 Cal</option>
                <option value="Muscle Gain - 3000 Cal">Muscle Gain - 3000 Cal</option>
                <option value="Rehab & Mobility">Rehab &amp; Mobility</option>
                <option value="Maintenance">Maintenance</option>
              </select>
              <ChevronDown className="goal-chevron" size={18} />
            </div>
          </div>

          {/* AI Generate Button */}
          <button className={`ai-gen-btn ${isGenerating ? 'loading' : 'ready'}`}
            onClick={handleGenerateAI} disabled={isGenerating || !selectedPatient}>
            {isGenerating && <div className="pulse-bg" />}
            {isGenerating ? (
              <><div className="spinner" /><span>{loadingText}</span></>
            ) : (
              <><Sparkles size={18} /> Generate AI Draft</>
            )}
          </button>

          <div className="col-c-divider" />

          {/* Meal Inputs */}
          <div>
            <div className="sec-header">
              <h3 className="sec-title">
                Nutrition Plan
                {prescription.breakfast && <CheckCircle size={14} className="sec-check" />}
              </h3>
            </div>
            {[
              { id: 'detox', label: 'Morning Detox / Early Snack' },
              { id: 'breakfast', label: 'Breakfast' },
              { id: 'lunch', label: 'Lunch' },
              { id: 'snack', label: 'Evening Snack' },
              { id: 'dinner', label: 'Dinner' },
            ].map(meal => (
              <div className="meal-group" key={meal.id}>
                <label className="meal-label">{meal.label}</label>
                <textarea className={`meal-textarea ${prescription[meal.id] ? 'filled' : ''}`}
                  rows={2} placeholder={`Enter ${meal.label.toLowerCase()}...`}
                  value={prescription[meal.id]}
                  onChange={e => setPrescription({ ...prescription, [meal.id]: e.target.value })} />
              </div>
            ))}
          </div>

          <div className="col-c-divider" />

          {/* Exercise Assignor */}
          <div>
            <div className="sec-header" style={{ marginBottom: 16 }}>
              <h3 className="sec-title">
                Workout Routine
                {prescription.exercises.length > 0 && <CheckCircle size={14} className="sec-check" />}
              </h3>
              <button className="add-manual-btn"
                onClick={() => setPrescription({ ...prescription, exercises: [...prescription.exercises, { name: '', sets: 3, reps: 10 }] })}>
                <Plus size={14} /> Add Manual
              </button>
            </div>

            {prescription.exercises.length === 0 ? (
              <div className="ex-empty">Click 'Generate AI Draft' or add exercises manually.</div>
            ) : (
              <div className="ex-list">
                {prescription.exercises.map((ex, idx) => (
                  <div className="ex-row" key={idx}>
                    <input className="ex-name-input" type="text" value={ex.name}
                      onChange={e => {
                        const n = [...prescription.exercises]; n[idx].name = e.target.value;
                        setPrescription({ ...prescription, exercises: n });
                      }} />
                    <div className="ex-nums">
                      <div className="ex-num-col">
                        <span className="ex-num-label">Sets</span>
                        <input className="ex-num-input" type="text" value={ex.sets}
                          onChange={e => {
                            const n = [...prescription.exercises]; n[idx].sets = e.target.value;
                            setPrescription({ ...prescription, exercises: n });
                          }} />
                      </div>
                      <div className="ex-num-col">
                        <span className="ex-num-label">Reps</span>
                        <input className="ex-num-input wide" type="text" value={ex.reps}
                          onChange={e => {
                            const n = [...prescription.exercises]; n[idx].reps = e.target.value;
                            setPrescription({ ...prescription, exercises: n });
                          }} />
                      </div>
                    </div>
                    <button className="ex-remove-btn"
                      onClick={() => setPrescription({ ...prescription, exercises: prescription.exercises.filter((_, i) => i !== idx) })}>
                      <X size={16} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div style={{ height: 64 }} />
        </div>

        {/* Footer */}
        <div className="col-c-footer">
          {toast && (
            <div className="cmd-toast">
              <Check size={16} className="cmd-toast-icon" />
              Prescription synced successfully!
            </div>
          )}
          <button className="approve-btn" onClick={handleSaveAndSend} disabled={!selectedPatient}>
            Approve & Send to Patient <Send size={16} />
          </button>
        </div>
      </div>

      {/* ═══ ENROLL & PRESCRIBE MODAL ═══ */}
      {showAddModal && (
        <EnrollPrescribeModal
          doctorUid={currentUser.uid}
          onSuccess={() => { setShowAddModal(false); }}
          onClose={() => setShowAddModal(false)}
        />
      )}

      {/* ═══ LOGS MODAL ═══ */}
      {showLogsModal && selectedPatient && (
        <div className="cmd-modal-overlay" onClick={() => setShowLogsModal(false)}>
          <div className="cmd-modal wide" onClick={e => e.stopPropagation()}>
            <div className="cmd-modal-header">
              <h2 className="cmd-modal-title">📊 Logs — {selectedPatient.name}</h2>
              <button className="cmd-modal-close" onClick={() => setShowLogsModal(false)}><X size={20} /></button>
            </div>
            {patientLogs.length === 0 ? (
              <p className="logs-empty">No workout logs recorded yet.</p>
            ) : (
              <table className="cmd-logs-table">
                <thead><tr><th>Date</th><th>Exercise</th><th>Reps</th><th>Accuracy</th></tr></thead>
                <tbody>
                  {patientLogs.map(log => (
                    <tr key={log.id}>
                      <td>{log.date || '—'}</td>
                      <td>{log.exercise_name || '—'}</td>
                      <td>{log.reps_count ?? '—'}</td>
                      <td>{log.accuracy ? `${log.accuracy}%` : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* ═══ FLOATING AI CHATBOT ═══ */}
      <DoctorChatbotWidget />
    </div>
  );
}
