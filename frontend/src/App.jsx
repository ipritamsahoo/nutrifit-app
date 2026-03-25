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
      alignItems: 'center', justifyContent: 'center', background: '#0a0a0a', color: '#fff',
      fontFamily: 'system-ui, sans-serif'
    }}>
      <div style={{ 
        width: '40px', height: '40px', border: '3px solid rgba(255,255,255,0.1)',
        borderTopColor: '#6366f1', borderRadius: '50%', animation: 'spin 1s linear infinite',
        marginBottom: '16px'
      }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      <p style={{ opacity: 0.6, fontSize: '14px', letterSpacing: '0.05em' }}>NUTRIFIT INITIALIZING...</p>
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
          background: '#0a0a0a', color: '#ef4444', textAlign: 'center', padding: '20px' 
        }}>
          <div>
            <h2 style={{ marginBottom: '12px' }}>Profile Initialization Error</h2>
            <p style={{ color: '#fff', opacity: 0.7 }}>
              We found your account but couldn't verify your clinical role.<br/>
              Please contact your administrator or try logging out.
            </p>
            <button 
              onClick={() => window.location.href = '/login'} 
              style={{ 
                marginTop: '24px', padding: '10px 20px', borderRadius: '6px', 
                background: '#dc2626', color: '#fff', border: 'none', cursor: 'pointer' 
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
