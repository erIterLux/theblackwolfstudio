import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { isFirebaseConfigured } from '../services/firebaseConfig';

const AuthContext = createContext(null);
let authClientPromise;

function loadAuthClient() {
  if (!authClientPromise) {
    authClientPromise = Promise.all([
      import('firebase/auth'),
      import('../services/firebaseAuth'),
    ]).then(([authSdk, { auth }]) => ({ ...authSdk, auth }));
  }
  return authClientPromise;
}

function authIsRouteCritical(pathname) {
  return pathname === '/login'
    || pathname === '/membership'
    || pathname.startsWith('/events/waiver/')
    || pathname.startsWith('/private-training/waiver/')
    || pathname.startsWith('/member')
    || pathname.startsWith('/instructor')
    || pathname.startsWith('/order/');
}

export function AuthProvider({ children }) {
  const { pathname } = useLocation();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(isFirebaseConfigured);

  useEffect(() => {
    if (!isFirebaseConfigured) return undefined;

    let active = true;
    let unsubscribe;
    const connect = async () => {
      try {
        const { auth, onAuthStateChanged } = await loadAuthClient();
        if (!active || !auth) return;
        unsubscribe = onAuthStateChanged(auth, (nextUser) => {
          if (!active) return;
          setUser(nextUser);
          setLoading(false);
        });
      } catch (error) {
        console.error('Firebase authentication could not be initialized:', error);
        if (active) setLoading(false);
      }
    };

    let idleHandle;
    let timer;
    if (authIsRouteCritical(pathname)) {
      queueMicrotask(connect);
    } else if ('requestIdleCallback' in window) {
      idleHandle = window.requestIdleCallback(connect, { timeout: 1800 });
    } else {
      timer = window.setTimeout(connect, 900);
    }

    return () => {
      active = false;
      unsubscribe?.();
      if (idleHandle) window.cancelIdleCallback(idleHandle);
      if (timer) window.clearTimeout(timer);
    };
  }, [pathname]);

  const value = useMemo(
    () => ({
      user,
      loading,
      isFirebaseConfigured,
      signIn: async (email, password) => {
        if (!isFirebaseConfigured) throw new Error('Firebase is not configured yet.');
        const { auth, signInWithEmailAndPassword } = await loadAuthClient();
        return signInWithEmailAndPassword(auth, email, password);
      },
      signUp: async (email, password) => {
        if (!isFirebaseConfigured) throw new Error('Firebase is not configured yet.');
        const { auth, createUserWithEmailAndPassword } = await loadAuthClient();
        return createUserWithEmailAndPassword(auth, email, password);
      },
      signInWithGoogle: async () => {
        if (!isFirebaseConfigured) throw new Error('Firebase is not configured yet.');
        const { auth, GoogleAuthProvider, signInWithPopup } = await loadAuthClient();
        return signInWithPopup(auth, new GoogleAuthProvider());
      },
      signOutUser: async () => {
        if (!isFirebaseConfigured) return;
        const { auth, signOut } = await loadAuthClient();
        if (auth) await signOut(auth);
      },
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
