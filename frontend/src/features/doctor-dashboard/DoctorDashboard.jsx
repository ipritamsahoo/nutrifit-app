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


  /* ── 7-Day Chart State ─────────────────────────────── */
  const [patientWeeklyData, setPatientWeeklyData] = useState([]);
  const [activeDay, setActiveDay] = useState(null);

  useEffect(() => {
    if (!selectedPatient) return;
    const fetchWeeklyData = async () => {
      try {
        const patientId = selectedPatient.uid || selectedPatient.id;
        const q = query(
          collection(db, 'logs'),
          where('uid', '==', patientId)
        );
        const snap = await getDocs(q);
        const logsMap = {};
        snap.forEach(doc => {
          const data = doc.data();
          let dayKey = data.workout_day;

          // Inference Fallback 1: Deep scan for Day marker in any field
          if (!dayKey) {
            const rawString = JSON.stringify(data);
            const match = rawString.match(/day_([1-7])/);
            if (match) dayKey = `day_${match[1]}`;
          }

          if (dayKey) {
            // Favor the most recent log for each protocol day
            if (!logsMap[dayKey] || data.timestamp > logsMap[dayKey].timestamp) {
              logsMap[dayKey] = data;
            }
          }
        });

        // Build sequential array for Day 1 through 7
        const dataArray = [];
        for (let i = 1; i <= 7; i++) {
           const key = `day_${i}`;
           const history = logsMap[key];
           dataArray.push({
             day: `Day ${i}`,
             // Use new daily metrics with multiple fallbacks for legacy data
             diet: history ? (history.dietAdherence ?? history.dAdh ?? history.adherence ?? 0) : 0,
             workout: history ? (history.exerciseAdherence ?? history.eAdh ?? history.adherence ?? 0) : 0
           });
        }
        setPatientWeeklyData(dataArray);
      } catch (err) {
        console.error('Failed to fetch patient 7-day logs:', err);
        setPatientWeeklyData([]);
      }
    };
    fetchWeeklyData();
  }, [selectedPatient]);

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

              {/* 7-Day Progress Analytics Chart */}
              <div className="analytics-section" style={{ marginTop: '24px' }}>
                <div className="analytics-header">
                  <div>
                    <h3 className="section-title">7-Day Progress Analytics</h3>
                    <p className="section-subtitle">Daily completion trends across key protocol metrics.</p>
                  </div>
                  <div className="legend-group">
                    <div className="legend-item"><div className="dot dot-diet"></div> Diet</div>
                    <div className="legend-item"><div className="dot dot-workout"></div> Therapy</div>
                  </div>
                </div>
                
                <div className="chart-wrapper">
                  <div className="chart-inner">
                    <div className="y-axis">
                      <span className="axis-label" style={{ top: '0%' }}>100%</span>
                      <span className="axis-label" style={{ top: '50%' }}>50%</span>
                      <span className="axis-label" style={{ top: '100%' }}>0%</span>
                    </div>

                    <div className="svg-container">
                      <svg className="chart-svg" viewBox="0 0 100 45" preserveAspectRatio="none" onMouseLeave={() => setActiveDay(null)}>
                        <rect x="0" y="5" width="100" height="17.5" fill="#F8FAFC" />
                        {patientWeeklyData.map((_, i) => (
                          <line key={`v-${i}`} x1={5 + i * 15} y1="5" x2={5 + i * 15} y2="40" className="v-grid-line" />
                        ))}
                        <line x1="0" y1="5" x2="100" y2="5" className="h-grid-line" />
                        <line x1="0" y1="22.5" x2="100" y2="22.5" className="h-grid-line" />
                        <line x1="0" y1="40" x2="100" y2="40" className="chart-base-line" />
                        {patientWeeklyData.map((d, i) => {
                          const baseX = 5 + i * 15;
                          const dietH = (d.diet / 100) * 35;
                          const workoutH = (d.workout / 100) * 35;
                          return (
                            <g key={i}>
                              <rect x={baseX - 3.5} y={40 - dietH} width="3" height={dietH} className="bar-diet" />
                              <rect x={baseX + 0.5} y={40 - workoutH} width="3" height={workoutH} className="bar-workout" />
                              <rect x={baseX - 6} y={0} width={12} height={45} fill="transparent" onMouseEnter={() => setActiveDay(i)} className="chart-hit-area" />
                            </g>
                          );
                        })}
                      </svg>
                      {activeDay !== null && patientWeeklyData[activeDay] && (
                        <div className="chart-tooltip" style={{ left: `${Math.min(Math.max(5 + activeDay * 15, 12), 88)}%` }}>
                          <div className="tooltip-day">{patientWeeklyData[activeDay].day}</div>
                          <div className="tooltip-row">
                            <span>Diet</span>
                            <span style={{fontWeight:'bold', color: 'var(--clinical-slate-900)'}}>{patientWeeklyData[activeDay].diet}%</span>
                          </div>
                          <div className="tooltip-row">
                            <span>Therapy</span>
                            <span style={{fontWeight:'bold', color: 'var(--clinical-slate-900)'}}>{patientWeeklyData[activeDay].workout}%</span>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="x-axis">
                    {patientWeeklyData.map((d, i) => (
                      <span key={i} className="x-label" style={{ left: `${(5 + i * 15)}%` }}>{d.day}</span>
                    ))}
                  </div>
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
