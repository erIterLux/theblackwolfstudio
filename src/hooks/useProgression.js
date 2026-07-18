import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { getMyProgression } from '../services/progression';

export default function useProgression() {
  const { user } = useAuth();
  const [state, setState] = useState({ data: null, loading: Boolean(user), error: '' });

  const refresh = useCallback(async () => {
    if (!user) {
      setState({ data: null, loading: false, error: '' });
      return null;
    }

    setState((current) => ({ ...current, loading: true, error: '' }));
    try {
      const data = await getMyProgression();
      setState({ data, loading: false, error: '' });
      return data;
    } catch (error) {
      console.error('Progression load failed:', error);
      setState({ data: null, loading: false, error: error?.message || 'Progression could not be loaded.' });
      return null;
    }
  }, [user]);

  useEffect(() => {
    queueMicrotask(() => refresh());
  }, [refresh]);

  return { ...state, refresh };
}
