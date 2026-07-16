import { useEffect, useMemo, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { useAuth } from '../context/AuthContext';
import { db } from '../services/firebaseFirestore';

const LIVE_STATUSES = new Set(['active', 'trialing']);

export default function useMembership() {
  const { user } = useAuth();
  const [state, setState] = useState({
    uid: null,
    membership: null,
    error: '',
  });

  useEffect(() => {
    if (!user || !db) return undefined;

    return onSnapshot(
      doc(db, 'memberships', user.uid),
      (snapshot) => {
        setState({
          uid: user.uid,
          membership: snapshot.exists() ? { id: snapshot.id, ...snapshot.data() } : null,
          error: '',
        });
      },
      (nextError) => {
        console.error(nextError);
        setState({ uid: user.uid, membership: null, error: 'Membership status could not be loaded.' });
      },
    );
  }, [user]);

  const membership = user && state.uid === user.uid ? state.membership : null;
  const loading = Boolean(user && db && state.uid !== user.uid);
  const error = user && state.uid === user.uid ? state.error : '';

  return useMemo(() => ({
    membership,
    loading,
    error,
    isActive: LIVE_STATUSES.has(membership?.status),
    canUseWolfGuide: LIVE_STATUSES.has(membership?.status) && membership?.wolfGuideAccess === true,
  }), [membership, loading, error]);
}
