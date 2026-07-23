import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { getMemberDashboardSummary } from '../services/memberDashboard';
import { startPerformanceMeasure } from '../utils/performance';

const CACHE_TTL_MS = 30_000;
const dashboardRequests = new Map();
const dashboardCache = new Map();

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

function requestDashboard(uid, force = false) {
  const cached = dashboardCache.get(uid);
  if (!force && cached && Date.now() - cached.cachedAt < CACHE_TTL_MS) {
    return Promise.resolve(cached.data);
  }
  if (!force && dashboardRequests.has(uid)) return dashboardRequests.get(uid);

  const request = getMemberDashboardSummary()
    .then((data) => {
      dashboardCache.set(uid, { data, cachedAt: Date.now() });
      return data;
    })
    .finally(() => dashboardRequests.delete(uid));
  dashboardRequests.set(uid, request);
  return request;
}

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
      const result = await requestDashboard(user.uid, force);
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
