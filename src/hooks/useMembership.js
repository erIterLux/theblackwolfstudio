import { useEffect, useMemo, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { useAuth } from '../context/AuthContext';
import { db } from '../services/firebaseFirestore';

const LIVE_STATUSES = new Set(['active', 'trialing']);

const EMPTY_STATE = {
    uid: null,
    membership: null,
    loading: false,
    error: '',
};

export default function useMembership() {
    const { user } = useAuth();
    const [state, setState] = useState(EMPTY_STATE);

    useEffect(() => {
        let cancelled = false;
        let unsubscribe = null;

        if (!user || !db) {
            setState(EMPTY_STATE);
            return undefined;
        }

        setState({
            uid: user.uid,
            membership: null,
            loading: true,
            error: '',
        });

        const startListener = async () => {
            try {
                // Make sure Firebase Auth has issued a usable token before Firestore
                // begins the owner-only membership listener.
                await user.getIdToken();

                if (cancelled) return;

                unsubscribe = onSnapshot(
                    doc(db, 'memberships', user.uid),
                    (snapshot) => {
                        if (cancelled) return;

                        setState({
                            uid: user.uid,
                            membership: snapshot.exists()
                                ? { id: snapshot.id, ...snapshot.data() }
                                : null,
                            loading: false,
                            error: '',
                        });
                    },
                    (nextError) => {
                        if (cancelled) return;

                        console.error('Membership listener failed:', {
                            code: nextError?.code,
                            message: nextError?.message,
                            uid: user.uid,
                        });

                        setState({
                            uid: user.uid,
                            membership: null,
                            loading: false,
                            error: nextError?.code === 'permission-denied'
                                ? 'Membership access could not be verified. Please sign out and back in, then try again.'
                                : 'Membership status could not be loaded.',
                        });
                    },
                );
            } catch (nextError) {
                if (cancelled) return;

                console.error('Membership authentication failed:', nextError);

                setState({
                    uid: user.uid,
                    membership: null,
                    loading: false,
                    error: 'Your sign-in session could not be verified. Please sign in again.',
                });
            }
        };

        startListener();

        return () => {
            cancelled = true;
            unsubscribe?.();
        };
    }, [user]);

    const membership = user && state.uid === user.uid
        ? state.membership
        : null;

    const loading = Boolean(
        user
        && db
        && state.uid === user.uid
        && state.loading,
    );

    const error = user && state.uid === user.uid
        ? state.error
        : '';

    return useMemo(() => ({
        membership,
        loading,
        error,
        isActive: LIVE_STATUSES.has(membership?.status),
        canUseWolfGuide:
            LIVE_STATUSES.has(membership?.status)
            && membership?.wolfGuideAccess === true,
    }), [membership, loading, error]);
}
