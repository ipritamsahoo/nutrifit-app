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
import InsiderWorkspace from './features/patient-workspace/InsiderWorkspace';
import OutsiderWorkspace from './features/outsider-workspace/OutsiderWorkspace';
import OutsiderChatbot from './features/chatbot/OutsiderChatbot';
import CameraView from './features/camera/CameraView';

/* ── Role-based Protected Route ──────────────────────────────── */
function PrivateRoute({ children, allowedRoles }) {
  const { currentUser, userRole, loading } = useAuth();
  if (loading) return null;
  if (!currentUser) return <Navigate to="/login" />;
  if (allowedRoles && !allowedRoles.includes(userRole)) {
    // Redirect to their own home if they try to access a wrong route
    return <Navigate to="/" />;
  }
  return children;
}

/* ── Public route (redirect if already logged in) ────────────── */
function PublicRoute({ children }) {
  const { currentUser, loading } = useAuth();
  if (loading) return null;
  return currentUser ? <Navigate to="/" /> : children;
}

/* ── Smart Home Redirect based on role ───────────────────────── */
function HomeRedirect() {
  const { userRole, hasPlan, loading } = useAuth();
  if (loading) return null;

  switch (userRole) {
    case 'doctor':
      return <Navigate to="/doctor" replace />;
    case 'insider':
      return <Navigate to="/workspace" replace />;
    case 'outsider':
      return hasPlan ? <Navigate to="/outsider-workspace" replace /> : <Navigate to="/chat" replace />;
    default:
      return <Navigate to="/login" replace />;
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

          {/* Workspace – for insiders (doctor's patients) */}
          <Route path="/workspace" element={
            <PrivateRoute allowedRoles={['insider']}>
              <InsiderWorkspace />
            </PrivateRoute>
          } />

          {/* Outsider Workspace – after plan approval */}
          <Route path="/outsider-workspace" element={
            <PrivateRoute allowedRoles={['outsider']}>
              <OutsiderWorkspace />
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
