import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useRef,
    useState,
} from 'react';
import { useAuth } from './AuthContext';
import { useAppSession } from './AppSessionContext';
import { startPerformanceMeasure } from '../utils/performance';

const NotificationContext = createContext(null);
const POLL_INTERVAL_MS = 5 * 60 * 1000;
const MIN_FOCUS_REFRESH_MS = 60 * 1000;

export function NotificationProvider({ children }) {
    const { user } = useAuth();
    const {
        unreadCount,
        loading: sessionLoading,
        error: sessionError,
        loadedAt,
        setUnreadCount,
    } = useAppSession();
    const [state, setState] = useState({ loading: false, error: '' });
    const lastRefreshRef = useRef(0);
    const fallbackAttemptedRef = useRef(false);

    const refresh = useCallback(async ({ quiet = false } = {}) => {
        if (!user) {
            setUnreadCount(0);
            setState({ loading: false, error: '' });
            return 0;
        }

        if (!quiet) setState({ loading: true, error: '' });
        const finishMeasure = startPerformanceMeasure('notification-unread-count', {
            uid: user.uid,
            quiet,
        });

        try {
            const { getMyNotificationUnreadCount } = await import('../services/notifications');
            const result = await getMyNotificationUnreadCount();
            const nextCount = Math.max(0, Number(result?.unreadCount || 0));
            setUnreadCount(nextCount);
            lastRefreshRef.current = Date.now();
            setState({ loading: false, error: '' });
            finishMeasure({ success: true, unreadCount: nextCount });
            return nextCount;
        } catch (error) {
            console.error('Notification count could not be refreshed:', error);
            setState({
                loading: false,
                error: error?.message || 'Notification count could not be loaded.',
            });
            finishMeasure({ success: false, error: error?.code || error?.message });
            return unreadCount;
        }
    }, [setUnreadCount, unreadCount, user]);

    useEffect(() => {
        if (loadedAt) lastRefreshRef.current = loadedAt;
    }, [loadedAt]);

    useEffect(() => {
        if (!user) {
            fallbackAttemptedRef.current = false;
            return undefined;
        }
        if (sessionLoading || loadedAt || fallbackAttemptedRef.current) return undefined;
        fallbackAttemptedRef.current = true;
        queueMicrotask(() => refresh({ quiet: true }));
        return undefined;
    }, [loadedAt, refresh, sessionLoading, user]);

    useEffect(() => {
        if (!user) return undefined;

        const refreshIfVisible = () => {
            if (document.visibilityState !== 'visible') return;
            if (Date.now() - lastRefreshRef.current < MIN_FOCUS_REFRESH_MS) return;
            refresh({ quiet: true });
        };

        const timer = window.setInterval(refreshIfVisible, POLL_INTERVAL_MS);
        window.addEventListener('focus', refreshIfVisible);
        document.addEventListener('visibilitychange', refreshIfVisible);

        return () => {
            window.clearInterval(timer);
            window.removeEventListener('focus', refreshIfVisible);
            document.removeEventListener('visibilitychange', refreshIfVisible);
        };
    }, [refresh, user]);

    const adjustUnreadCount = useCallback((delta) => {
        setUnreadCount((current) => Math.max(0, current + Number(delta || 0)));
    }, [setUnreadCount]);

    const value = useMemo(() => ({
        unreadCount,
        loading: sessionLoading || state.loading,
        error: state.error || sessionError,
        refresh,
        adjustUnreadCount,
        setUnreadCount,
    }), [
        adjustUnreadCount,
        refresh,
        sessionError,
        sessionLoading,
        setUnreadCount,
        state.error,
        state.loading,
        unreadCount,
    ]);

    return <NotificationContext.Provider value={value}>{children}</NotificationContext.Provider>;
}

export function useNotificationCenter() {
    const value = useContext(NotificationContext);
    if (!value) throw new Error('useNotificationCenter must be used inside NotificationProvider.');
    return value;
}
