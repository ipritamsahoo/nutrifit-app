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

  /* ── Plan View modal ───────────────────────────────── */
  const [showPlanModal, setShowPlanModal] = useState(false);
  const [patientPlan, setPatientPlan] = useState(null);
  const [planLoading, setPlanLoading] = useState(false);


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

  /* ── View Logs ─────────────────────────────────────── */
  async function handleViewLogs() {
    if (!selectedPatient) return;
    setShowLogsModal(true);
    try {
      const q = query(collection(db, 'logs'), where('uid', '==', selectedPatient.uid || selectedPatient.id), orderBy('date', 'desc'), limit(20));
      const snap = await getDocs(q);
      setPatientLogs(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch { setPatientLogs([]); }
  }

  /* ── View Plan ─────────────────────────────────────── */
  async function handleViewPlan() {
    if (!selectedPatient) return;
    setShowPlanModal(true);
    setPlanLoading(true);
    try {
      const q = query(collection(db, 'plans'), where('uid', '==', selectedPatient.uid || selectedPatient.id));
      const snap = await getDocs(q);
      const plans = snap.docs.map(d => d.data());
      const approved = plans
        .filter(p => !p.status || p.status === 'approved') // Include missing status for legacy safety
        .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
      setPatientPlan(approved[0] || null);
    } catch (e) {
      console.error(e);
      setPatientPlan(null);
    } finally {
      setPlanLoading(false);
    }
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
                <div className="col-b-header-actions">
                  <button className="col-b-logs-btn alt" onClick={handleViewPlan}><ClipboardList size={16}/> View Plan</button>
                  <button className="col-b-logs-btn" onClick={handleViewLogs}>View Logs</button>
                </div>
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

      {/* ═══ PLAN VIEW MODAL ═══ */}
      {showPlanModal && selectedPatient && (
        <div className="cmd-modal-overlay" onClick={() => setShowPlanModal(false)}>
          <div className="cmd-modal wide" onClick={e => e.stopPropagation()}>
            <div className="cmd-modal-header">
              <h2 className="cmd-modal-title"><ClipboardList size={20} className="mr-2" /> Active Plan — {selectedPatient.name}</h2>
              <button className="cmd-modal-close" onClick={() => setShowPlanModal(false)}><X size={20} /></button>
            </div>
            
            <div className="cmd-modal-body cmd-scroll plan-view-container">
              {planLoading ? (
                <div className="p-card-status-dot online" style={{width: 20, height: 20, margin: '2rem auto'}} />
              ) : patientPlan ? (
                <div className="plan-7day-grid">
                  {[1, 2, 3, 4, 5, 6, 7].map(day => {
                    let dietMeals = [];
                    const dData = patientPlan.diet_json;
                    if (dData) {
                      if (dData.days && dData.days[`day_${day}`]) {
                        // V2 Schema `m` can be a string ('breakfast:Oats|300') or object ({ meal_type: 'breakfast', name: 'Oats', cal: 300 })
                        dData.days[`day_${day}`].forEach(m => {
                          if (typeof m === 'string') {
                            dietMeals.push(m);
                          } else if (m && (m.name || m.meal)) {
                            dietMeals.push(`${m.meal_type}:${m.name || m.meal}|${m.cal || 0}`);
                          }
                        });
                      } else if (dData[`day_${day}`]) {
                        // V1 Schema / Legacy Fallback
                        const dX = dData[`day_${day}`];
                        if (Array.isArray(dX)) {
                          dX.forEach(m => {
                            if (typeof m === 'string') {
                              dietMeals.push(m);
                            } else if (m && (m.name || m.meal)) {
                              dietMeals.push(`${m.meal_type || 'meal'}:${m.name || m.meal}|${m.cal || 0}`);
                            }
                          });
                        } else if (typeof dX === 'object') {
                          Object.entries(dX).forEach(([mType, val]) => {
                            if (val) {
                               const mealName = typeof val === 'object' ? val.meal : val;
                               const isFormatted = mealName.includes('(') && mealName.includes('cal');
                               dietMeals.push(`${mType}:${mealName}|${isFormatted ? '' : '0'}`);
                            }
                          });
                        }
                      }
                    }

                    // Extract Workout
                    let workoutChar = patientPlan.workout_json?.sched?.[day - 1];
                    let workoutDetails = patientPlan.workout_json?.tpl?.[workoutChar];

                    // Fallback to V1 Manual Workflow Assignment (`workout_json.day_X.exercises`)
                    if (!workoutChar && patientPlan.workout_json?.[`day_${day}`]) {
                       workoutChar = 'V1';
                       const exList = patientPlan.workout_json[`day_${day}`].exercises || [];
                       workoutDetails = { ex: exList.map(ex => `${ex.name}|${ex.sets}x${ex.reps}`) };
                    }
                    
                    return (
                      <div key={day} className="plan-day-card">
                        <div className="pdc-header">Day {day}</div>
                        <div className="pdc-body">
                          
                          <div className="pdc-section diet">
                            <h4 className="pdc-section-title"><Sparkles size={12}/> Diet</h4>
                            {dietMeals.length > 0 ? (
                              <ul className="pdc-list">
                                {dietMeals.map((meal, idx) => {
                                  // Format: "breakfast:Oats|300"
                                  const [type, itemStr] = meal.split(':');
                                  const [itemName, cal] = (itemStr || meal).split('|');
                                  return (
                                    <li key={idx}>
                                      <span className="pdc-type">{type}</span>
                                      <span className="pdc-item">{itemName}</span>
                                      <span className="pdc-cal">{cal} cals</span>
                                    </li>
                                  );
                                })}
                              </ul>
                            ) : Object.keys(patientPlan.diet_json || {}).length === 0 ? (
                              <p className="pdc-empty" style={{ color: '#94a3b8' }}>Not Prescribed</p>
                            ) : (
                              <p className="pdc-empty">No diet tracked</p>
                            )}
                          </div>

                          <div className="pdc-divider" />

                          <div className="pdc-section workout">
                            <h4 className="pdc-section-title"><Activity size={12}/> Workout</h4>
                            {workoutDetails?.ex ? (
                              <ul className="pdc-list">
                                {workoutDetails.ex.map((ex, idx) => {
                                  // Format: "Exercise|3x12|r60"
                                  const parts = ex.split('|');
                                  const exName = parts[0];
                                  const exSets = parts[1] || "";
                                  return (
                                    <li key={idx}>
                                      <span className="pdc-item">{exName}</span>
                                      <span className="pdc-badge">{exSets}</span>
                                    </li>
                                  );
                                })}
                              </ul>
                            ) : Object.keys(patientPlan.workout_json || {}).length === 0 ? (
                              <p className="pdc-empty" style={{ color: '#94a3b8' }}>Not Prescribed</p>
                            ) : workoutChar === 'M' ? (
                              <p className="pdc-empty">Mobility / Rest</p>
                            ) : (
                              <p className="pdc-empty">Rest Day</p>
                            )}
                          </div>

                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="cmd-empty-state">
                  <AlertTriangle size={36} color="var(--text-disabled)" />
                  <h3>No Active Plan Found</h3>
                  <p>This patient currently does not have an approved AI or Deterministic plan.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
