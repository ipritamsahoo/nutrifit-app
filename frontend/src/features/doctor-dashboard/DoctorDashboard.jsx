/**
 * DoctorDashboard.jsx
 * ====================
 * Doctor's admin portal with full functionality:
 *   - Patient list (fetched from Firestore where doctor_id matches)
 *   - Add Patient modal (calls /create-insider backend)
 *   - Assign Prescription (manual diet/workout + AI assist option)
 *   - View patient progress logs
 */

import { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { collection, query, where, getDocs, orderBy, limit } from 'firebase/firestore';
import { db } from '../../firebase/config';
import './DoctorDashboard.css';

const API_URL = 'http://localhost:8000';

export default function DoctorDashboard() {
  const { currentUser, userData, logout } = useAuth();
  const navigate = useNavigate();

  // ── State ─────────────────────────────────────────────────
  const [patients, setPatients] = useState([]);
  const [loadingPatients, setLoadingPatients] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showPrescriptionModal, setShowPrescriptionModal] = useState(false);
  const [selectedPatient, setSelectedPatient] = useState(null);
  const [showLogsModal, setShowLogsModal] = useState(false);
  const [patientLogs, setPatientLogs] = useState([]);

  // Add Patient form
  const [newName, setNewName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [addError, setAddError] = useState('');
  const [addLoading, setAddLoading] = useState(false);

  // Prescription form
  const [prescriptionTab, setPrescriptionTab] = useState('manual'); // 'manual' | 'ai'
  const [dietText, setDietText] = useState('');
  const [workoutText, setWorkoutText] = useState('');
  const [calories, setCalories] = useState('');
  const [water, setWater] = useState('');
  const [notes, setNotes] = useState('');
  const [prescError, setPrescError] = useState('');
  const [prescLoading, setPrescLoading] = useState(false);

  // AI assist form
  const [aiAge, setAiAge] = useState('');
  const [aiWeight, setAiWeight] = useState('');
  const [aiHeight, setAiHeight] = useState('');
  const [aiGoal, setAiGoal] = useState('Stay Fit');
  const [aiMedical, setAiMedical] = useState('');
  const [aiPlan, setAiPlan] = useState(null);
  const [aiLoading, setAiLoading] = useState(false);

  // ── Fetch patients ────────────────────────────────────────
  useEffect(() => {
    if (!currentUser) return;
    fetchPatients();
  }, [currentUser]);

  async function fetchPatients() {
    setLoadingPatients(true);
    try {
      const q = query(
        collection(db, 'users'),
        where('doctor_id', '==', currentUser.uid),
        where('role', '==', 'insider')
      );
      const snap = await getDocs(q);
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setPatients(list);
    } catch (err) {
      console.error('Error fetching patients:', err);
    } finally {
      setLoadingPatients(false);
    }
  }

  // ── Add Patient ───────────────────────────────────────────
  async function handleAddPatient(e) {
    e.preventDefault();
    setAddError('');
    setAddLoading(true);

    try {
      const res = await fetch(`${API_URL}/create-insider`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          doctor_uid: currentUser.uid,
          patient_name: newName,
          patient_email: newEmail,
          patient_password: newPassword,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Failed to create patient');

      // Refresh patient list
      await fetchPatients();
      setShowAddModal(false);
      setNewName(''); setNewEmail(''); setNewPassword('');
    } catch (err) {
      setAddError(err.message);
    } finally {
      setAddLoading(false);
    }
  }

  // ── Assign Prescription (Manual) ──────────────────────────
  async function handleAssignPrescription(e) {
    e.preventDefault();
    setPrescError('');
    setPrescLoading(true);

    try {
      // Parse diet and workout text as JSON
      let dietJson = {};
      let workoutJson = {};

      try {
        if (dietText.trim()) dietJson = JSON.parse(dietText);
      } catch {
        // If not valid JSON, wrap as simple text
        dietJson = { plan: dietText };
      }

      try {
        if (workoutText.trim()) workoutJson = JSON.parse(workoutText);
      } catch {
        workoutJson = { plan: workoutText };
      }

      const res = await fetch(`${API_URL}/assign-prescription`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          doctor_uid: currentUser.uid,
          patient_uid: selectedPatient.uid,
          diet_json: dietJson,
          workout_json: workoutJson,
          daily_calories_target: calories ? parseInt(calories) : null,
          daily_water_liters: water ? parseFloat(water) : null,
          notes,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Failed to assign prescription');

      setShowPrescriptionModal(false);
      resetPrescriptionForm();
      alert('✅ Prescription assigned successfully!');
    } catch (err) {
      setPrescError(err.message);
    } finally {
      setPrescLoading(false);
    }
  }

  // ── AI Assist – Generate Draft ────────────────────────────
  async function handleAiGenerate(e) {
    e.preventDefault();
    setAiLoading(true);
    setPrescError('');

    try {
      const res = await fetch(`${API_URL}/generate-plan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          uid: selectedPatient.uid,
          age: parseInt(aiAge),
          weight: parseFloat(aiWeight),
          height: parseFloat(aiHeight),
          goal: aiGoal,
          medical_conditions: aiMedical,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'AI generation failed');

      setAiPlan(data.plan);
      // Auto-fill the prescription form with AI output
      setDietText(JSON.stringify(data.plan.diet_plan || {}, null, 2));
      setWorkoutText(JSON.stringify(data.plan.workout_plan || {}, null, 2));
      setCalories(data.plan.daily_calories_target?.toString() || '');
      setWater(data.plan.daily_water_liters?.toString() || '');
      setNotes(data.plan.notes || '');
      setPrescriptionTab('manual'); // Switch to manual to review/edit
    } catch (err) {
      setPrescError(err.message);
    } finally {
      setAiLoading(false);
    }
  }

  // ── View Patient Logs ─────────────────────────────────────
  async function handleViewLogs(patient) {
    setSelectedPatient(patient);
    setShowLogsModal(true);

    try {
      const q = query(
        collection(db, 'logs'),
        where('uid', '==', patient.uid),
        orderBy('date', 'desc'),
        limit(20)
      );
      const snap = await getDocs(q);
      setPatientLogs(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (err) {
      console.error('Error fetching logs:', err);
      setPatientLogs([]);
    }
  }

  function resetPrescriptionForm() {
    setDietText(''); setWorkoutText(''); setCalories('');
    setWater(''); setNotes(''); setPrescError('');
    setAiAge(''); setAiWeight(''); setAiHeight('');
    setAiGoal('Stay Fit'); setAiMedical(''); setAiPlan(null);
    setPrescriptionTab('manual');
  }

  function openPrescription(patient) {
    setSelectedPatient(patient);
    resetPrescriptionForm();
    setShowPrescriptionModal(true);
  }

  function handleLogout() {
    logout();
    navigate('/login');
  }

  // ── Render ────────────────────────────────────────────────
  return (
    <div className="doctor-page">
      <div className="bg-blob blob-1" />
      <div className="bg-blob blob-2" />

      {/* Header */}
      <header className="doctor-header">
        <div className="doctor-brand">
          <span>🩺</span>
          <h1>HonFit — Doctor Portal</h1>
        </div>
        <div className="doctor-actions">
          <span className="doctor-name">
            Dr. {userData?.name || currentUser?.email?.split('@')[0]}
          </span>
          <button className="btn-ghost" onClick={handleLogout}>Logout</button>
        </div>
      </header>

      <main className="doctor-content">
        {/* Stats Bar */}
        <div className="stats-bar">
          <div className="stat-card">
            <span className="stat-num">{patients.length}</span>
            <span className="stat-label">Total Patients</span>
          </div>
          <button className="btn-primary add-btn" onClick={() => setShowAddModal(true)}>
            ➕ Add Patient
          </button>
        </div>

        {/* Patient List */}
        <section className="patients-section">
          <h2>Your Patients</h2>

          {loadingPatients ? (
            <div className="loading-msg">Loading patients…</div>
          ) : patients.length === 0 ? (
            <div className="empty-msg">
              <p>No patients yet. Click "Add Patient" to get started.</p>
            </div>
          ) : (
            <div className="patient-grid">
              {patients.map(p => (
                <div className="patient-card" key={p.id}>
                  <div className="pc-info">
                    <div className="pc-avatar">{p.name?.charAt(0)?.toUpperCase() || '?'}</div>
                    <div>
                      <h3>{p.name}</h3>
                      <p className="pc-email">{p.email}</p>
                    </div>
                  </div>
                  <div className="pc-actions">
                    <button className="btn-sm btn-accent" onClick={() => openPrescription(p)}>
                      📋 Prescribe
                    </button>
                    <button className="btn-sm btn-ghost-sm" onClick={() => handleViewLogs(p)}>
                      📊 Logs
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </main>

      {/* ════════ ADD PATIENT MODAL ════════ */}
      {showAddModal && (
        <div className="modal-overlay" onClick={() => setShowAddModal(false)}>
          <div className="modal-card" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>➕ Add New Patient</h2>
              <button className="modal-close" onClick={() => setShowAddModal(false)}>✕</button>
            </div>

            {addError && <div className="error-msg">{addError}</div>}

            <form onSubmit={handleAddPatient}>
              <div className="input-group">
                <label>Patient Name</label>
                <input type="text" value={newName} onChange={e => setNewName(e.target.value)}
                       placeholder="Patient full name" required />
              </div>
              <div className="input-group">
                <label>Patient Email</label>
                <input type="email" value={newEmail} onChange={e => setNewEmail(e.target.value)}
                       placeholder="patient@email.com" required />
              </div>
              <div className="input-group">
                <label>Password</label>
                <input type="text" value={newPassword} onChange={e => setNewPassword(e.target.value)}
                       placeholder="Min 6 characters" required minLength={6} />
              </div>
              <button className="btn-primary" type="submit" disabled={addLoading}>
                {addLoading ? 'Creating…' : 'Create Patient Account'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* ════════ PRESCRIPTION MODAL ════════ */}
      {showPrescriptionModal && selectedPatient && (
        <div className="modal-overlay" onClick={() => setShowPrescriptionModal(false)}>
          <div className="modal-card modal-wide" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>📋 Prescribe for {selectedPatient.name}</h2>
              <button className="modal-close" onClick={() => setShowPrescriptionModal(false)}>✕</button>
            </div>

            {/* Tab Toggle: Manual vs AI Assist */}
            <div className="tab-toggle">
              <button className={prescriptionTab === 'manual' ? 'active' : ''}
                      onClick={() => setPrescriptionTab('manual')}>
                ✏️ Manual
              </button>
              <button className={prescriptionTab === 'ai' ? 'active' : ''}
                      onClick={() => setPrescriptionTab('ai')}>
                🤖 AI Assist
              </button>
            </div>

            {prescError && <div className="error-msg">{prescError}</div>}

            {/* AI Assist Tab */}
            {prescriptionTab === 'ai' && (
              <form onSubmit={handleAiGenerate} className="ai-form">
                <p className="ai-hint">Enter patient metrics and AI will generate a draft plan. You can then review and edit it before assigning.</p>
                <div className="form-row">
                  <div className="input-group">
                    <label>Age</label>
                    <input type="number" value={aiAge} onChange={e => setAiAge(e.target.value)}
                           placeholder="25" required min={10} max={120} />
                  </div>
                  <div className="input-group">
                    <label>Weight (kg)</label>
                    <input type="number" step="0.1" value={aiWeight} onChange={e => setAiWeight(e.target.value)}
                           placeholder="70" required />
                  </div>
                  <div className="input-group">
                    <label>Height (cm)</label>
                    <input type="number" step="0.1" value={aiHeight} onChange={e => setAiHeight(e.target.value)}
                           placeholder="175" required />
                  </div>
                </div>
                <div className="form-row">
                  <div className="input-group flex-2">
                    <label>Goal</label>
                    <select value={aiGoal} onChange={e => setAiGoal(e.target.value)}>
                      <option>Lose Weight</option>
                      <option>Build Muscle</option>
                      <option>Stay Fit</option>
                      <option>Improve Flexibility</option>
                    </select>
                  </div>
                  <div className="input-group flex-2">
                    <label>Medical Conditions</label>
                    <input type="text" value={aiMedical} onChange={e => setAiMedical(e.target.value)}
                           placeholder="e.g. Knee injury" />
                  </div>
                </div>
                <button className="btn-primary" type="submit" disabled={aiLoading}>
                  {aiLoading ? '🧠 Generating AI Plan…' : '🤖 Generate AI Draft'}
                </button>
                {aiPlan && (
                  <div className="ai-success">
                    ✅ AI plan generated! Switch to "Manual" tab to review and assign it.
                  </div>
                )}
              </form>
            )}

            {/* Manual Tab */}
            {prescriptionTab === 'manual' && (
              <form onSubmit={handleAssignPrescription}>
                <div className="input-group">
                  <label>Diet Plan (JSON or text)</label>
                  <textarea value={dietText} onChange={e => setDietText(e.target.value)}
                            placeholder='e.g. {"breakfast": "Oats + fruits", "lunch": "Grilled chicken + salad"}'
                            rows={5} />
                </div>
                <div className="input-group">
                  <label>Workout Plan (JSON or text)</label>
                  <textarea value={workoutText} onChange={e => setWorkoutText(e.target.value)}
                            placeholder='e.g. {"exercises": [{"name": "Squats", "sets": 3, "reps": 12}]}'
                            rows={5} />
                </div>
                <div className="form-row">
                  <div className="input-group">
                    <label>Daily Calories Target</label>
                    <input type="number" value={calories} onChange={e => setCalories(e.target.value)}
                           placeholder="2000" />
                  </div>
                  <div className="input-group">
                    <label>Daily Water (L)</label>
                    <input type="number" step="0.1" value={water} onChange={e => setWater(e.target.value)}
                           placeholder="2.5" />
                  </div>
                </div>
                <div className="input-group">
                  <label>Doctor's Notes</label>
                  <textarea value={notes} onChange={e => setNotes(e.target.value)}
                            placeholder="Any special instructions…" rows={3} />
                </div>
                <button className="btn-primary" type="submit" disabled={prescLoading}>
                  {prescLoading ? 'Assigning…' : '💊 Assign Prescription'}
                </button>
              </form>
            )}
          </div>
        </div>
      )}

      {/* ════════ PATIENT LOGS MODAL ════════ */}
      {showLogsModal && selectedPatient && (
        <div className="modal-overlay" onClick={() => setShowLogsModal(false)}>
          <div className="modal-card modal-wide" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>📊 Workout Logs — {selectedPatient.name}</h2>
              <button className="modal-close" onClick={() => setShowLogsModal(false)}>✕</button>
            </div>

            {patientLogs.length === 0 ? (
              <div className="empty-msg">
                <p>No workout logs recorded yet for this patient.</p>
              </div>
            ) : (
              <div className="logs-table-wrap">
                <table className="logs-table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Exercise</th>
                      <th>Reps</th>
                      <th>Accuracy</th>
                    </tr>
                  </thead>
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
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
