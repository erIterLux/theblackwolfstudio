import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { getMemberDashboardSummary } from '../services/memberDashboard';
import { startPerformanceMeasure } from '../utils/performance';

const EMPTY = {
  membership: null,
  role: 'member',
  progression: { data: null, accessAvailable: false, error: '' },
  privateTraining: null,
  events: null,
  purchases: null,
  attentionItems: [],
  meta: null,
};

export default function useMemberDashboardSummary({ enabled = true } = {}) {
  const { user } = useAuth();
  const [state, setState] = useState({
    uid: null,
    data: EMPTY,
    loading: Boolean(user && enabled),
    error: '',
  });

  const refresh = useCallback(async ({ force = true } = {}) => {
    if (!enabled) return null;
    if (!user) {
      setState({ uid: null, data: EMPTY, loading: false, error: '' });
      return null;
    }

    setState((current) => ({
      ...current,
      uid: user.uid,
      loading: true,
      error: '',
    }));

    const finishMeasure = startPerformanceMeasure('member-dashboard-summary', {
      uid: user.uid,
      force,
    });

    try {
      const result = await getMemberDashboardSummary(user.uid, { force });
      setState({
        uid: user.uid,
        data: { ...EMPTY, ...(result || {}) },
        loading: false,
        error: '',
      });
      finishMeasure({
        success: true,
        serverDurationMs: result?.meta?.durationMs,
      });
      return result;
    } catch (error) {
      console.error('Member dashboard summary could not be loaded:', error);
      setState({
        uid: user.uid,
        data: EMPTY,
        loading: false,
        error: error?.message || 'Your dashboard summary could not be loaded.',
      });
      finishMeasure({ success: false, error: error?.code || error?.message });
      return null;
    }
  }, [enabled, user]);

  useEffect(() => {
    if (!enabled) return undefined;
    queueMicrotask(() => refresh({ force: false }));
    return undefined;
  }, [enabled, refresh]);

  const matchesUser = Boolean(user && state.uid === user.uid);
  return useMemo(() => ({
    data: matchesUser ? state.data : EMPTY,
    loading: Boolean(enabled && user && (!matchesUser || state.loading)),
    error: enabled && matchesUser ? state.error : '',
    refresh,
  }), [enabled, matchesUser, refresh, state.data, state.error, state.loading, user]);
}
