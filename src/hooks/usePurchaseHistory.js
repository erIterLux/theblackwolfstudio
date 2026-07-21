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

export default function usePurchaseHistory() {
  const { user } = useAuth();
  const [data, setData] = useState(EMPTY);
  const [loading, setLoading] = useState(Boolean(user));
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    if (!user) {
      setData(EMPTY);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError('');
    try {
      const result = await listMyPurchaseHistory();
      setData({
        membership: result?.membership || null,
        membershipPayments: result?.membershipPayments || [],
        orders: result?.orders || [],
        summary: { ...EMPTY.summary, ...(result?.summary || {}) },
      });
    } catch (nextError) {
      console.error('Purchase history failed:', nextError);
      setError(nextError?.message || 'Purchase history could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    queueMicrotask(refresh);
  }, [refresh]);

  return useMemo(() => ({
    ...data,
    loading,
    error,
    refresh,
  }), [data, loading, error, refresh]);
}
