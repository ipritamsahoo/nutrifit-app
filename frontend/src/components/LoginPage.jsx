/**
 * LoginPage.jsx
 * =============
 * Auth page with TWO signup paths:
 *   1. Doctor signup – selects "I am a Doctor" and creates own account.
 *   2. Outsider signup – selects "I am a Fitness Enthusiast" (self-user).
 *   3. Google login – auto-creates an outsider profile.
 *
 * Insiders (patients) do NOT sign up here. They login with credentials
 * provided by their Doctor.
 *
 * Premium dark glassmorphism UI.
 */

import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import './LoginPage.css';

export default function LoginPage() {
  const { login, signup } = useAuth();
  const navigate = useNavigate();

  const [isSignup, setIsSignup] = useState(false);
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [name, setName]         = useState('');
  const [role, setRole]         = useState('outsider');  // default for self-signup
  const [error, setError]       = useState('');
  const [loading, setLoading]   = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (isSignup) {
        // Only doctors and outsiders can self-signup
        await signup(email, password, name, role);
      } else {
        // Login works for ALL roles (doctor, insider, outsider)
        await login(email, password);
      }
      navigate('/');
    } catch (err) {
      setError(err.message.replace('Firebase: ', ''));
    } finally {
      setLoading(false);
    }
  }


  return (
    <div className="login-page">
      {/* Animated background blobs */}
      <div className="bg-blob blob-1" />
      <div className="bg-blob blob-2" />
      <div className="bg-blob blob-3" />

      <div className="login-card">
        <div className="login-brand">
          <span className="brand-icon">💪</span>
          <h1>HonFit</h1>
          <p>AI-Powered Fitness & Health</p>
        </div>

        <h2>{isSignup ? 'Create Account' : 'Welcome Back'}</h2>

        {error && <div className="error-msg">{error}</div>}

        <form onSubmit={handleSubmit}>
          {isSignup && (
            <>
              <div className="input-group">
                <label>Full Name</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="John Doe"
                  required
                />
              </div>

              <div className="input-group">
                <label>I am a</label>
                <div className="role-toggle">
                  <button
                    type="button"
                    className={role === 'outsider' ? 'active' : ''}
                    onClick={() => setRole('outsider')}
                  >
                    🏃 Fitness Enthusiast
                  </button>
                  <button
                    type="button"
                    className={role === 'doctor' ? 'active' : ''}
                    onClick={() => setRole('doctor')}
                  >
                    🩺 Doctor
                  </button>
                </div>
              </div>
            </>
          )}

          <div className="input-group">
            <label>Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
            />
          </div>

          <div className="input-group">
            <label>Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              minLength={6}
            />
          </div>

          <button className="submit-btn" type="submit" disabled={loading}>
            {loading ? 'Please wait…' : isSignup ? 'Sign Up' : 'Log In'}
          </button>
        </form>


        {!isSignup && (
          <p className="login-hint">
            <small>💡 Patients: Use the email & password your Doctor provided.</small>
          </p>
        )}

        <p className="toggle-text">
          {isSignup ? 'Already have an account?' : "Don't have an account?"}{' '}
          <button className="toggle-btn" onClick={() => { setIsSignup(!isSignup); setError(''); }}>
            {isSignup ? 'Log In' : 'Sign Up'}
          </button>
        </p>
      </div>
    </div>
  );
}
