/**
 * AuthContext.jsx
 * ===============
 * Provides Firebase Auth state to the entire app via React Context.
 * Exposes: currentUser, loading, login, signup, logout, role.
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
  const [userRole, setUserRole] = useState(null); // 'patient' | 'doctor'
  const [loading, setLoading] = useState(true);

  /* ── Listen for auth state changes ─────────────────────────── */
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      setCurrentUser(user);
      if (user) {
        // Fetch the user's role from Firestore
        const snap = await getDoc(doc(db, 'users', user.uid));
        if (snap.exists()) {
          setUserRole(snap.data().role);
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
    // Create a user profile document in Firestore
    await setDoc(doc(db, 'users', cred.user.uid), {
      uid: cred.user.uid,
      name,
      role,          // 'patient' or 'doctor'
      bio: '',
      createdAt: new Date().toISOString(),
    });
    setUserRole(role);
    return cred;
  }

  function login(email, password) {
    return signInWithEmailAndPassword(auth, email, password);
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
