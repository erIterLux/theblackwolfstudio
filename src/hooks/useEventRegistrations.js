import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { listMyEventRegistrations } from '../services/events';

export default function useEventRegistrations() {
  const { user } = useAuth();
  const [now, setNow] = useState(0);
  const [state, setState] = useState({
    uid: null,
    registrations: [],
    loading: Boolean(user),
    error: '',
  });

  const refresh = useCallback(async () => {
    if (!user) {
      setState({ uid: null, registrations: [], loading: false, error: '' });
      return [];
    }

    setState((current) => ({
      ...current,
      uid: user.uid,
      loading: true,
      error: '',
    }));

    try {
      const result = await listMyEventRegistrations();
      const registrations = result?.registrations || [];
      setState({ uid: user.uid, registrations, loading: false, error: '' });
      return registrations;
    } catch (error) {
      console.error('Event registrations could not be loaded:', error);
      setState({
        uid: user.uid,
        registrations: [],
        loading: false,
        error: error?.message || 'Event registrations could not be loaded.',
      });
      return [];
    }
  }, [user]);

  useEffect(() => {
    queueMicrotask(() => refresh());
  }, [refresh]);

  useEffect(() => {
    queueMicrotask(() => setNow(Date.now()));
  }, []);

  const registrations = useMemo(
    () => (user && state.uid === user.uid ? state.registrations : []),
    [user, state.uid, state.registrations],
  );

  const upcoming = registrations.filter((registration) => (
    new Date(registration.eventSnapshot?.endsAt || registration.eventSnapshot?.startsAt || 0).valueOf() >= now
    && registration.registrationStatus === 'confirmed'
  ));

  return useMemo(() => ({
    registrations,
    upcoming,
    nextRegistration: upcoming[0] || null,
    loading: Boolean(user && state.loading && state.uid === user.uid),
    error: user && state.uid === user.uid ? state.error : '',
    refresh,
  }), [registrations, upcoming, user, state.loading, state.uid, state.error, refresh]);
}
