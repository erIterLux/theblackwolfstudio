import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { useAuth } from './AuthContext';
import { getAuthenticatedAppBootstrap } from '../services/appSession';
import { startPerformanceMeasure } from '../utils/performance';

const AppSessionContext = createContext(null);
const bootstrapRequests = new Map();

const EMPTY_SESSION = Object.freeze({
  uid: null,
  role: 'member',
  membership: null,
  unreadCount: 0,
  loading: false,
  error: '',
  loadedAt: 0,
});

function requestBootstrap(uid, force = false) {
  if (!force && bootstrapRequests.has(uid)) return bootstrapRequests.get(uid);
  const request = getAuthenticatedAppBootstrap()
    .finally(() => bootstrapRequests.delete(uid));
  bootstrapRequests.set(uid, request);
  return request;
}

export function AppSessionProvider({ children }) {
  const { user } = useAuth();
  const [state, setState] = useState(EMPTY_SESSION);

  const refresh = useCallback(async ({ quiet = false, force = true } = {}) => {
    if (!user) {
      setState(EMPTY_SESSION);
      return null;
    }

    if (!quiet) {
      setState((current) => ({
        ...current,
        uid: user.uid,
        loading: true,
        error: '',
      }));
    }

    const finishMeasure = startPerformanceMeasure('authenticated-app-bootstrap', {
      uid: user.uid,
      quiet,
    });

    try {
      const result = await requestBootstrap(user.uid, force);
      if (result?.refreshToken) await user.getIdToken(true);
      setState({
        uid: user.uid,
        role: result?.role || 'member',
        membership: result?.membership || null,
        unreadCount: Math.max(0, Number(result?.unreadCount || 0)),
        loading: false,
        error: '',
        loadedAt: Date.now(),
      });
      finishMeasure({ success: true });
      return result;
    } catch (error) {
      console.error('Authenticated app session could not be loaded:', error);
      setState((current) => ({
        ...current,
        uid: user.uid,
        loading: false,
        error: error?.message || 'Your member session could not be loaded.',
      }));
      finishMeasure({ success: false, error: error?.code || error?.message });
      return null;
    }
  }, [user]);

  useEffect(() => {
    if (!user) {
      queueMicrotask(() => setState(EMPTY_SESSION));
      return undefined;
    }

    let active = true;
    queueMicrotask(async () => {
      if (!active) return;
      await refresh({ force: false });
    });
    return () => { active = false; };
  }, [refresh, user]);

  const setUnreadCount = useCallback((value) => {
    setState((current) => {
      const next = typeof value === 'function' ? value(current.unreadCount) : value;
      return {
        ...current,
        unreadCount: Math.max(0, Number(next || 0)),
      };
    });
  }, []);

  const sessionMatchesUser = Boolean(user && state.uid === user.uid);
  const value = useMemo(() => ({
    role: sessionMatchesUser ? state.role : 'member',
    membership: sessionMatchesUser ? state.membership : null,
    unreadCount: sessionMatchesUser ? state.unreadCount : 0,
    loading: Boolean(user && (!sessionMatchesUser || state.loading)),
    error: sessionMatchesUser ? state.error : '',
    loadedAt: sessionMatchesUser ? state.loadedAt : 0,
    isInstructor: sessionMatchesUser
      && (state.role === 'instructor' || state.role === 'admin'),
    refresh,
    setUnreadCount,
  }), [
    refresh,
    sessionMatchesUser,
    setUnreadCount,
    state.error,
    state.loadedAt,
    state.loading,
    state.membership,
    state.role,
    state.unreadCount,
    user,
  ]);

  return (
    <AppSessionContext.Provider value={value}>
      {children}
    </AppSessionContext.Provider>
  );
}

export function useAppSession() {
  const value = useContext(AppSessionContext);
  if (!value) throw new Error('useAppSession must be used inside AppSessionProvider.');
  return value;
}
