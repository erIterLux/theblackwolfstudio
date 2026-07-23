import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { listProgressionContent } from '../services/progressionContent';

export default function useProgressionContent(filters = {}) {
  const { user } = useAuth();
  const filterKey = JSON.stringify(filters);
  const [state, setState] = useState({ items: [], loading: Boolean(user), error: '' });

  const refresh = useCallback(async () => {
    if (!user) {
      setState({ items: [], loading: false, error: '' });
      return [];
    }

    setState((current) => ({ ...current, loading: true, error: '' }));
    try {
      const result = await listProgressionContent(JSON.parse(filterKey));
      const items = result?.items || [];
      setState({ items, loading: false, error: '' });
      return items;
    } catch (error) {
      console.error('Progression content load failed:', error);
      setState({
        items: [],
        loading: false,
        error: error?.message || 'Training references could not be loaded.',
      });
      return [];
    }
  }, [user, filterKey]);

  useEffect(() => {
    queueMicrotask(() => refresh());
  }, [refresh]);

  return { ...state, refresh };
}
