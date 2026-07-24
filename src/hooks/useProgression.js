import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { invalidateMemberDashboardSummaryCache } from '../services/memberDashboard';
import { getMyProgression } from '../services/progression';

export default function useProgression({ enabled = true } = {}) {
    const { user } = useAuth();
    const [state, setState] = useState({
        data: null,
        loading: Boolean(user && enabled),
        error: '',
    });

    const refresh = useCallback(async ({ force = true } = {}) => {
        if (!enabled) return null;
        if (!user) {
            setState({ data: null, loading: false, error: '' });
            return null;
        }

        setState((current) => ({ ...current, loading: true, error: '' }));
        try {
            const data = await getMyProgression({ force });
            invalidateMemberDashboardSummaryCache(user.uid);
            setState({ data, loading: false, error: '' });
            return data;
        } catch (error) {
            console.error('Progression load failed:', error);
            setState({
                data: null,
                loading: false,
                error: error?.message || 'Progression could not be loaded.',
            });
            return null;
        }
    }, [enabled, user]);

    useEffect(() => {
        if (!enabled) return undefined;
        queueMicrotask(() => refresh({ force: false }));
        return undefined;
    }, [enabled, refresh]);

    return { ...state, loading: enabled ? state.loading : false, refresh };
}
