import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import {
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
} from 'firebase/auth';
import { isFirebaseConfigured } from '../services/firebase';
import { auth } from '../services/firebaseAuth';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(isFirebaseConfigured);

  useEffect(() => {
    if (!auth) return undefined;

    return onAuthStateChanged(auth, (nextUser) => {
      setUser(nextUser);
      setLoading(false);
    });
  }, []);

  const value = useMemo(
    () => ({
      user,
      loading,
      isFirebaseConfigured,
      signIn: (email, password) => {
        if (!auth) throw new Error('Firebase is not configured yet.');
        return signInWithEmailAndPassword(auth, email, password);
      },
      signUp: (email, password) => {
        if (!auth) throw new Error('Firebase is not configured yet.');
        return createUserWithEmailAndPassword(auth, email, password);
      },
      signInWithGoogle: () => {
        if (!auth) throw new Error('Firebase is not configured yet.');
        return signInWithPopup(auth, new GoogleAuthProvider());
      },
      signOutUser: () => (auth ? signOut(auth) : Promise.resolve()),
    }),
    [user, loading],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside AuthProvider.');
  return value;
}
