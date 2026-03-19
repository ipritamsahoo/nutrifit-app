/**
 * App.jsx
 * =======
 * Root component with React Router.
 * Routes:
 *   /login       → LoginPage
 *   /onboarding  → OnboardingForm (patient metrics)
 *   /workout     → CameraView (pose tracking)
 *   /            → Dashboard (patient plan view)
 */

import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import AuthProvider, { useAuth } from './contexts/AuthContext';
import LoginPage from './components/LoginPage';
import OnboardingForm from './components/OnboardingForm';
import Dashboard from './components/Dashboard';
import CameraView from './components/CameraView';

/* ── Protected route wrapper ──────────────────────────────── */
function PrivateRoute({ children }) {
  const { currentUser, loading } = useAuth();
  if (loading) return null;
  return currentUser ? children : <Navigate to="/login" />;
}

/* ── Public route (redirect if logged in) ─────────────────── */
function PublicRoute({ children }) {
  const { currentUser, loading } = useAuth();
  if (loading) return null;
  return currentUser ? <Navigate to="/" /> : children;
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<PublicRoute><LoginPage /></PublicRoute>} />
          <Route path="/onboarding" element={<PrivateRoute><OnboardingForm /></PrivateRoute>} />
          <Route path="/workout" element={<PrivateRoute><CameraView /></PrivateRoute>} />
          <Route path="/" element={<PrivateRoute><Dashboard /></PrivateRoute>} />
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
