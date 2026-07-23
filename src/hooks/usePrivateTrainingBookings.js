import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { listMyPrivateTrainingBookings } from '../services/privateTraining';

const ACTIVE = new Set(['requested', 'confirmed', 'rescheduled']);

export default function usePrivateTrainingBookings({ enabled = true } = {}) {
    const { user } = useAuth();
    const [state, setState] = useState({
        uid: null,
        bookings: [],
        loading: Boolean(user && enabled),
        error: '',
    });

    const refresh = useCallback(async ({ force = true } = {}) => {
        if (!enabled) return [];
        if (!user) {
            setState({ uid: null, bookings: [], loading: false, error: '' });
            return [];
        }

        setState((current) => ({
            ...current,
            uid: user.uid,
            loading: true,
            error: '',
        }));

        try {
            const result = await listMyPrivateTrainingBookings({ force });
            const bookings = result?.bookings || [];
            setState({ uid: user.uid, bookings, loading: false, error: '' });
            return bookings;
        } catch (error) {
            console.error('Private-training bookings could not be loaded:', error);
            setState({
                uid: user.uid,
                bookings: [],
                loading: false,
                error: error?.message || 'Private-training bookings could not be loaded.',
            });
            return [];
        }
    }, [enabled, user]);

    useEffect(() => {
        if (!enabled) return undefined;
        queueMicrotask(() => refresh({ force: false }));
        return undefined;
    }, [enabled, refresh]);

    const bookings = useMemo(
        () => (user && state.uid === user.uid ? state.bookings : []),
        [user, state.uid, state.bookings],
    );

    const upcomingBookings = useMemo(() => bookings
        .filter((booking) => ACTIVE.has(booking.status) && new Date(booking.endsAt) > new Date())
        .sort((left, right) => new Date(left.startsAt) - new Date(right.startsAt)), [bookings]);

    const pastBookings = useMemo(() => bookings
        .filter((booking) => !upcomingBookings.some((upcoming) => upcoming.id === booking.id))
        .sort((left, right) => new Date(right.startsAt) - new Date(left.startsAt)), [bookings, upcomingBookings]);

    return useMemo(() => ({
        bookings,
        upcomingBookings,
        pastBookings,
        nextBooking: upcomingBookings[0] || null,
        loading: Boolean(enabled && user && state.loading && state.uid === user.uid),
        error: enabled && user && state.uid === user.uid ? state.error : '',
        refresh,
    }), [enabled, bookings, upcomingBookings, pastBookings, user, state.loading, state.uid, state.error, refresh]);
}
