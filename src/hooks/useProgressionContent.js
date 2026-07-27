import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { listProgressionContent } from '../services/progressionContent';

export default function useProgressionContent(filters = {}) {
  const { user } = useAuth();
  const filterKey = JSON.stringify(filters);
  const [state, setState] = useState({
    items: [],
    libraryAccessLevel: 'basic',
    loading: Boolean(user),
    error: '',
  });

  const refresh = useCallback(async ({ force = true } = {}) => {
    if (!user) {
      setState({
        items: [],
        libraryAccessLevel: 'basic',
        loading: false,
        error: '',
      });
      return [];
    }

    setState((current) => ({ ...current, loading: true, error: '' }));
    try {
      const result = await listProgressionContent(JSON.parse(filterKey), { force });
      const items = result?.items || [];
      setState({
        items,
        libraryAccessLevel: result?.libraryAccessLevel || 'basic',
        loading: false,
        error: '',
      });
      return items;
    } catch (error) {
      console.error('Progression content load failed:', error);
      setState({
        items: [],
        libraryAccessLevel: 'basic',
        loading: false,
        error: error?.message || 'Training references could not be loaded.',
      });
      return [];
    }
  }, [user, filterKey]);

  useEffect(() => {
    queueMicrotask(() => refresh({ force: false }));
  }, [refresh]);

  return { ...state, refresh };
}
