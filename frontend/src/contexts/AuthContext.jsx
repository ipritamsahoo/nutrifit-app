/**
 * AuthContext.jsx
 * ===============
 * Provides Firebase Auth state to the entire app via React Context.
 * Exposes: currentUser, loading, login, signup, logout, userRole.
 */

import { createContext, useContext, useEffect, useState } from 'react';
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
} from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { auth, db } from '../firebase/config';

const AuthContext = createContext(null);

export function useAuth() {
  return useContext(AuthContext);
}

export default function AuthProvider({ children }) {
  const [currentUser, setCurrentUser] = useState(null);
  const [userRole, setUserRole] = useState(null);
  const [loading, setLoading] = useState(true);

  /* ── Listen for auth state changes ─────────────────────────── */
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      setCurrentUser(user);
      if (user) {
        try {
          const snap = await getDoc(doc(db, 'users', user.uid));
          if (snap.exists()) {
            setUserRole(snap.data().role);
          }
        } catch (err) {
          console.warn('[Auth] Could not fetch user role:', err);
        }
      } else {
        setUserRole(null);
      }
      setLoading(false);
    });
    return unsub;
  }, []);

  /* ── Auth helpers ──────────────────────────────────────────── */
  async function signup(email, password, name, role) {
    const cred = await createUserWithEmailAndPassword(auth, email, password);

    // Write user profile to Firestore
    // Wrapped in try/catch so auth still succeeds even if Firestore write fails
    try {
      await setDoc(doc(db, 'users', cred.user.uid), {
        uid: cred.user.uid,
        name,
        role,
        bio: '',
        createdAt: new Date().toISOString(),
      });
    } catch (err) {
      console.error('[Auth] Firestore user doc write failed:', err);
    }

    // Manually set state so we don't rely on onAuthStateChanged race
    setCurrentUser(cred.user);
    setUserRole(role);
    setLoading(false);

    return cred;
  }

  async function login(email, password) {
    const cred = await signInWithEmailAndPassword(auth, email, password);

    // Fetch role immediately so it's ready before navigation
    try {
      const snap = await getDoc(doc(db, 'users', cred.user.uid));
      if (snap.exists()) {
        setUserRole(snap.data().role);
      }
    } catch (err) {
      console.warn('[Auth] Could not fetch user role on login:', err);
    }

    setCurrentUser(cred.user);
    setLoading(false);

    return cred;
  }

  function logout() {
    setUserRole(null);
    return signOut(auth);
  }

  const value = { currentUser, userRole, loading, signup, login, logout };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}
