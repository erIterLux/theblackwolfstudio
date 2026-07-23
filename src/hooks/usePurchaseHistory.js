import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { listMyPurchaseHistory } from '../services/purchases';

const EMPTY = {
    membership: null,
    membershipPayments: [],
    orders: [],
    summary: {
        activeMembership: false,
        oneTimePurchaseCount: 0,
        paidOneTimePurchaseCount: 0,
        remainingPrivateSessions: 0,
        upcomingEvents: 0,
    },
};

export default function usePurchaseHistory({ enabled = true } = {}) {
    const { user } = useAuth();
    const [data, setData] = useState(EMPTY);
    const [loading, setLoading] = useState(Boolean(user && enabled));
    const [error, setError] = useState('');

    const refresh = useCallback(async ({ force = true } = {}) => {
        if (!enabled) return null;
        if (!user) {
            setData(EMPTY);
            setLoading(false);
            return null;
        }

        setLoading(true);
        setError('');
        try {
            const result = await listMyPurchaseHistory({ force });
            setData({
                membership: result?.membership || null,
                membershipPayments: result?.membershipPayments || [],
                orders: result?.orders || [],
                summary: { ...EMPTY.summary, ...(result?.summary || {}) },
            });
            return result;
        } catch (nextError) {
            console.error('Purchase history failed:', nextError);
            setError(nextError?.message || 'Purchase history could not be loaded.');
            return null;
        } finally {
            setLoading(false);
        }
    }, [enabled, user]);

    useEffect(() => {
        if (!enabled) return undefined;
        queueMicrotask(() => refresh({ force: false }));
        return undefined;
    }, [enabled, refresh]);

    return useMemo(() => ({
        ...data,
        loading: enabled ? loading : false,
        error: enabled ? error : '',
        refresh,
    }), [data, enabled, loading, error, refresh]);
}
