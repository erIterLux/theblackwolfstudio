import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { listMyPrivateTrainingPurchases } from '../services/privateTraining';

export default function usePrivateTrainingPurchases({ enabled = true } = {}) {
    const { user } = useAuth();
    const [state, setState] = useState({
        uid: null,
        purchases: [],
        loading: Boolean(user && enabled),
        error: '',
    });

    const refresh = useCallback(async () => {
        if (!enabled) return [];
        if (!user) {
            setState({ uid: null, purchases: [], loading: false, error: '' });
            return [];
        }

        setState((current) => ({
            ...current,
            uid: user.uid,
            loading: true,
            error: '',
        }));

        try {
            const result = await listMyPrivateTrainingPurchases();
            const purchases = result?.purchases || [];
            setState({ uid: user.uid, purchases, loading: false, error: '' });
            return purchases;
        } catch (error) {
            console.error('Private training purchases could not be loaded:', error);
            setState({
                uid: user.uid,
                purchases: [],
                loading: false,
                error: error?.message || 'Private training could not be loaded.',
            });
            return [];
        }
    }, [enabled, user]);

    useEffect(() => {
        if (!enabled) return undefined;
        queueMicrotask(() => refresh());
        return undefined;
    }, [enabled, refresh]);

    const purchases = useMemo(
        () => (user && state.uid === user.uid ? state.purchases : []),
        [user, state.uid, state.purchases],
    );
    const loading = Boolean(enabled && user && state.loading && state.uid === user.uid);
    const error = enabled && user && state.uid === user.uid ? state.error : '';

    return useMemo(() => ({
        purchases,
        loading,
        error,
        refresh,
        activePurchases: purchases.filter((item) => item.status === 'active'),
        remainingSessions: purchases
            .filter((item) => item.status === 'active')
            .reduce((total, item) => total + Number(item.remainingSessions || 0), 0),
    }), [purchases, loading, error, refresh]);
}
