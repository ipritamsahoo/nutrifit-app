/**
 * AuthContext.jsx
 * ===============
 * Provides Firebase Auth state to the entire app via React Context.
 *
 * Roles:
 *   - "doctor"   → The administrator who creates patients & prescriptions
 *   - "insider"  → A patient created by a doctor (no chatbot, sees Today's Tasks)
 *   - "outsider"  → A self-registered user (gets AI chatbot experience)
 *
 * Exposes: currentUser, loading, login, signup, logout, userRole, userData.
 */

import { createContext, useContext, useEffect, useState } from 'react';
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
} from 'firebase/auth';
import { doc, getDoc, setDoc, collection, query, where, getDocs, limit } from 'firebase/firestore';
import { auth, db } from '../firebase/config';

const AuthContext = createContext(null);

export function useAuth() {
  return useContext(AuthContext);
}

export default function AuthProvider({ children }) {
  const [currentUser, setCurrentUser] = useState(null);
  const [userRole, setUserRole] = useState(null);   // "doctor" | "insider" | "outsider"
  const [userData, setUserData] = useState(null);    // full Firestore user doc
  const [hasPlan, setHasPlan] = useState(false);     // whether outsider has a plan
  const [loading, setLoading] = useState(true);

  /* ── Listen for auth state changes ─────────────────────────── */
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      setCurrentUser(user);
      if (user) {
        try {
          const snap = await getDoc(doc(db, 'users', user.uid));
          if (snap.exists()) {
            const data = snap.data();
            setUserRole(data.role);
            setUserData(data);

            const planQ = query(collection(db, 'plans'), where('uid', '==', user.uid), limit(1));
            const planSnap = await getDocs(planQ);
            setHasPlan(!planSnap.empty);
          }
        } catch (err) {
          console.warn('[Auth] Could not fetch user role:', err);
        }
      } else {
        setUserRole(null);
        setUserData(null);
        setHasPlan(false);
      }
      setLoading(false);
    });
    return unsub;
  }, []);

  /* ── Auth helpers ──────────────────────────────────────────── */

  /**
   * signup – used by DOCTORS and OUTSIDERS only.
   * Insiders are created by Doctors via the backend (Firebase Admin SDK).
   */
  async function signup(email, password, name, role) {
    const cred = await createUserWithEmailAndPassword(auth, email, password);

    const userDoc = {
      uid: cred.user.uid,
      name,
      email,
      role,          // "doctor" or "outsider"
      bio: '',
      createdAt: new Date().toISOString(),
    };

    try {
      await setDoc(doc(db, 'users', cred.user.uid), userDoc);
    } catch (err) {
      console.error('[Auth] Firestore user doc write failed:', err);
    }

    setCurrentUser(cred.user);
    setUserRole(role);
    setUserData(userDoc);
    setLoading(false);

    return cred;
  }

  async function login(email, password) {
    const cred = await signInWithEmailAndPassword(auth, email, password);

    try {
      const snap = await getDoc(doc(db, 'users', cred.user.uid));
      if (snap.exists()) {
        const data = snap.data();
        setUserRole(data.role);
        setUserData(data);

        const planQ = query(collection(db, 'plans'), where('uid', '==', cred.user.uid), limit(1));
        const planSnap = await getDocs(planQ);
        setHasPlan(!planSnap.empty);
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
    setUserData(null);
    setHasPlan(false);
    return signOut(auth);
  }

  const value = {
    currentUser,
    userRole,
    userData,
    hasPlan,
    loading,
    signup,
    login,
    logout,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}
