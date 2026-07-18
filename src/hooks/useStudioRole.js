import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { syncMyStudioRole } from '../services/progression';

export default function useStudioRole() {
  const { user } = useAuth();
  const [state, setState] = useState({ role: 'member', loading: Boolean(user), error: '' });

  const refresh = useCallback(async () => {
    if (!user) {
      setState({ role: 'member', loading: false, error: '' });
      return 'member';
    }

    setState((current) => ({ ...current, loading: true, error: '' }));
    try {
      const result = await syncMyStudioRole();
      if (result?.refreshToken) await user.getIdToken(true);
      const token = await user.getIdTokenResult();
      const role = String(token.claims.role || result?.role || 'member');
      setState({ role, loading: false, error: '' });
      return role;
    } catch (error) {
      console.error('Studio role sync failed:', error);
      setState({ role: 'member', loading: false, error: 'Studio role could not be verified.' });
      return 'member';
    }
  }, [user]);

  useEffect(() => {
    queueMicrotask(() => refresh());
  }, [refresh]);

  return {
    ...state,
    isInstructor: state.role === 'instructor' || state.role === 'admin',
    refresh,
  };
}
