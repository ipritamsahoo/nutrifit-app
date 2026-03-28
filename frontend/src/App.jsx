/**
 * App.jsx
 * =======
 * Root component with role-based routing.
 *
 * Routes:
 *   /login            → LoginPage (public)
 *   /                 → Redirects based on role:
 *                        doctor   → /doctor
 *                        insider  → /workspace
 *                        outsider → /chat (if no plan) or /workspace (if plan exists)
 *   /doctor           → DoctorDashboard (doctor only)
 *   /doctor/patient/:id → Patient detail & prescription
 *   /workspace        → Workspace / Today's Tasks (insider & outsider)
 *   /chat             → Virtual Coach Chatbot (outsider only)
 *   /workout          → CameraView / MediaPipe AI Trainer
 */

import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import AuthProvider, { useAuth } from './contexts/AuthContext';
import LoginPage from './features/auth/LoginPage';
import DoctorDashboard from './features/doctor-dashboard/DoctorDashboard';
import UserWorkspace from './features/patient-workspace/UserWorkspace';
import OutsiderChatbot from './features/chatbot/OutsiderChatbot';
import CameraView from './features/camera/CameraView';

/* ── Global Loading Component ────────────────────────────────── */
function GlobalLoading() {
  return (
    <div style={{
      height: '100vh', width: '100%', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', background: 'var(--nf-bg)', color: 'var(--nf-text-main)',
      fontFamily: "'Inter', system-ui, sans-serif"
    }}>
      <div style={{ 
        width: '44px', height: '44px', border: '3px solid var(--nf-border)',
        borderTopColor: 'var(--nf-primary)', borderRadius: '50%', animation: 'spin 1s cubic-bezier(0.4, 0, 0.2, 1) infinite',
        marginBottom: '20px', boxShadow: '0 0 15px var(--nf-glow)'
      }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      <p style={{ 
        fontWeight: 800, fontSize: '13px', letterSpacing: '0.15em', 
        color: 'var(--nf-text-muted)', textTransform: 'uppercase' 
      }}>NutriFit Initializing</p>
    </div>
  );
}


/* ── Role-based Protected Route ──────────────────────────────── */
function PrivateRoute({ children, allowedRoles }) {
  const { currentUser, userRole, loading } = useAuth();
  if (loading) return <GlobalLoading />;
  if (!currentUser) return <Navigate to="/login" />;
  if (allowedRoles && !allowedRoles.includes(userRole)) {
    // Redirect to their own home if they try to access a wrong route
    return <Navigate to="/" />;
  }
  return children;
}

/* ── Public route (redirect if already logged in) ────────────── */
function PublicRoute({ children }) {
  const { currentUser, userRole, loading } = useAuth();
  if (loading) return <GlobalLoading />;
  // Only redirect to home if user is fully authenticated with a profile/role
  if (currentUser && userRole) return <Navigate to="/" />;
  return children;
}

/* ── Smart Home Redirect based on role ───────────────────────── */
function HomeRedirect() {
  const { userRole, hasPlan, loading } = useAuth();
  if (loading) return <GlobalLoading />;

  switch (userRole) {
    case 'doctor':
      return <Navigate to="/doctor" replace />;
    case 'insider':
      return <Navigate to="/workspace" replace />;
    case 'outsider':
      return hasPlan ? <Navigate to="/workspace" replace /> : <Navigate to="/chat" replace />;
    default:
      // If we are here, currentUser exists (via PrivateRoute) but role is missing
      // Instead of looping to /login, we show a clinical error or redirect to setup
      return (
        <div style={{ 
          height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', 
          background: 'var(--nf-bg)', color: '#ef4444', textAlign: 'center', padding: '20px' 
        }}>
          <div style={{ 
            background: 'var(--nf-surface)', padding: '40px', borderRadius: '24px', 
            border: '1px solid var(--nf-border)', boxShadow: 'var(--shadow-clinical)', maxWidth: '440px' 
          }}>
            <h2 style={{ marginBottom: '12px', color: 'var(--nf-text-main)', fontWeight: 800 }}>Profile Initialization Error</h2>
            <p style={{ color: 'var(--nf-text-muted)', opacity: 0.9, lineHeight: 1.6 }}>
              We found your account but couldn't verify your clinical role.<br/>
              Please contact your administrator or try logging out.
            </p>
            <button 
              onClick={() => window.location.href = '/login'} 
              style={{ 
                marginTop: '24px', padding: '14px 28px', borderRadius: '14px', 
                background: 'var(--nf-gradient)', color: '#fff', border: 'none', cursor: 'pointer',
                fontWeight: 800, boxShadow: '0 4px 12px rgba(37, 99, 235, 0.2)',
                transition: 'all 0.2s'
              }}
            >
              Back to Login
            </button>
          </div>
        </div>
      );
  }
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          {/* Public */}
          <Route path="/login" element={<PublicRoute><LoginPage /></PublicRoute>} />

          {/* Smart home redirect */}
          <Route path="/" element={<PrivateRoute><HomeRedirect /></PrivateRoute>} />

          {/* Doctor routes */}
          <Route path="/doctor" element={
            <PrivateRoute allowedRoles={['doctor']}>
              <DoctorDashboard />
            </PrivateRoute>
          } />

          {/* Outsider chatbot */}
          <Route path="/chat" element={
            <PrivateRoute allowedRoles={['outsider']}>
              <OutsiderChatbot />
            </PrivateRoute>
          } />

          {/* Unified Workspace – for both insiders (doctor's patients) and outsiders (self users) */}
          <Route path="/workspace" element={
            <PrivateRoute allowedRoles={['insider', 'outsider']}>
              <UserWorkspace />
            </PrivateRoute>
          } />

          {/* Workout camera – all members */}
          <Route path="/workout" element={
            <PrivateRoute allowedRoles={['insider', 'outsider']}>
              <CameraView />
            </PrivateRoute>
          } />

          {/* Catch-all */}
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
