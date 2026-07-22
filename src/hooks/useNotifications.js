import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import {
    listMyNotifications,
    markAllNotificationsRead,
    markNotificationRead,
} from '../services/notifications';
import { startPerformanceMeasure } from '../utils/performance';

function mergeNotifications(current, incoming) {
    const byId = new Map(current.map((item) => [item.id, item]));
    incoming.forEach((item) => byId.set(item.id, item));
    return [...byId.values()];
}

export default function useNotifications({ pageSize = 25, autoLoad = true } = {}) {
    const { user } = useAuth();
    const [state, setState] = useState({
        uid: null,
        notifications: [],
        cursor: null,
        hasMore: false,
        loading: Boolean(user && autoLoad),
        loadingMore: false,
        error: '',
    });

    const refresh = useCallback(async () => {
        if (!user) {
            setState({
                uid: null,
                notifications: [],
                cursor: null,
                hasMore: false,
                loading: false,
                loadingMore: false,
                error: '',
            });
            return [];
        }

        setState((current) => ({
            ...current,
            uid: user.uid,
            loading: true,
            loadingMore: false,
            error: '',
        }));
        const finishMeasure = startPerformanceMeasure('notification-feed-page', {
            uid: user.uid,
            pageSize,
            page: 1,
        });

        try {
            const result = await listMyNotifications({ pageSize });
            const notifications = result?.notifications || [];
            setState({
                uid: user.uid,
                notifications,
                cursor: result?.nextCursor || null,
                hasMore: result?.hasMore === true,
                loading: false,
                loadingMore: false,
                error: '',
            });
            finishMeasure({ success: true, records: notifications.length });
            return notifications;
        } catch (error) {
            console.error('Notifications could not be loaded:', error);
            setState((current) => ({
                ...current,
                uid: user.uid,
                loading: false,
                loadingMore: false,
                error: error?.message || 'Notifications could not be loaded.',
            }));
            finishMeasure({ success: false, error: error?.code || error?.message });
            return [];
        }
    }, [pageSize, user]);

    const loadMore = useCallback(async () => {
        if (!user || !state.hasMore || !state.cursor || state.loadingMore) return [];
        setState((current) => ({ ...current, loadingMore: true, error: '' }));
        const finishMeasure = startPerformanceMeasure('notification-feed-page', {
            uid: user.uid,
            pageSize,
            page: 'next',
        });

        try {
            const result = await listMyNotifications({
                pageSize,
                cursor: state.cursor,
            });
            const incoming = result?.notifications || [];
            setState((current) => ({
                ...current,
                notifications: mergeNotifications(current.notifications, incoming),
                cursor: result?.nextCursor || null,
                hasMore: result?.hasMore === true,
                loadingMore: false,
                error: '',
            }));
            finishMeasure({ success: true, records: incoming.length });
            return incoming;
        } catch (error) {
            console.error('More notifications could not be loaded:', error);
            setState((current) => ({
                ...current,
                loadingMore: false,
                error: error?.message || 'More notifications could not be loaded.',
            }));
            finishMeasure({ success: false, error: error?.code || error?.message });
            return [];
        }
    }, [pageSize, state.cursor, state.hasMore, state.loadingMore, user]);

    useEffect(() => {
        if (!autoLoad) return undefined;
        queueMicrotask(() => refresh());
        return undefined;
    }, [autoLoad, refresh]);

    const setRead = useCallback(async (notificationId, read = true) => {
        const result = await markNotificationRead(notificationId, read);
        setState((current) => ({
            ...current,
            notifications: current.notifications.map((item) => (
                item.id === notificationId
                    ? {
                        ...item,
                        status: read ? 'read' : 'unread',
                        readAt: read ? new Date().toISOString() : null,
                    }
                    : item
            )),
        }));
        return result;
    }, []);

    const markAllRead = useCallback(async () => {
        const result = await markAllNotificationsRead();
        setState((current) => ({
            ...current,
            notifications: current.notifications.map((item) => ({
                ...item,
                status: 'read',
                readAt: item.readAt || new Date().toISOString(),
            })),
        }));
        return result;
    }, []);

    const notifications = useMemo(
        () => (user && state.uid === user.uid ? state.notifications : []),
        [state.notifications, state.uid, user],
    );

    return useMemo(() => ({
        notifications,
        loading: Boolean(user && state.uid === user.uid && state.loading),
        loadingMore: Boolean(user && state.uid === user.uid && state.loadingMore),
        hasMore: Boolean(user && state.uid === user.uid && state.hasMore),
        error: user && state.uid === user.uid ? state.error : '',
        refresh,
        loadMore,
        setRead,
        markAllRead,
    }), [
        loadMore,
        markAllRead,
        notifications,
        refresh,
        setRead,
        state.error,
        state.hasMore,
        state.loading,
        state.loadingMore,
        state.uid,
        user,
    ]);
}
