import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import {
  listMyNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from '../services/notifications';

export default function useNotifications({ poll = true, limit = 100 } = {}) {
  const { user } = useAuth();
  const [state, setState] = useState({
    uid: null,
    notifications: [],
    unreadCount: 0,
    loading: Boolean(user),
    error: '',
  });

  const refresh = useCallback(async ({ quiet = false } = {}) => {
    if (!user) {
      setState({ uid: null, notifications: [], unreadCount: 0, loading: false, error: '' });
      return [];
    }
    if (!quiet) {
      setState((current) => ({ ...current, uid: user.uid, loading: true, error: '' }));
    }
    try {
      const result = await listMyNotifications({ limit });
      const notifications = result?.notifications || [];
      setState({
        uid: user.uid,
        notifications,
        unreadCount: Number(result?.unreadCount || 0),
        loading: false,
        error: '',
      });
      return notifications;
    } catch (error) {
      console.error('Notifications could not be loaded:', error);
      setState((current) => ({
        ...current,
        uid: user.uid,
        loading: false,
        error: error?.message || 'Notifications could not be loaded.',
      }));
      return [];
    }
  }, [limit, user]);

  useEffect(() => {
    queueMicrotask(() => refresh());
    if (!poll || !user) return undefined;
    const timer = window.setInterval(() => refresh({ quiet: true }), 60_000);
    return () => window.clearInterval(timer);
  }, [poll, refresh, user]);

  const setRead = useCallback(async (notificationId, read = true) => {
    await markNotificationRead(notificationId, read);
    setState((current) => {
      const notifications = current.notifications.map((item) => (
        item.id === notificationId
          ? { ...item, status: read ? 'read' : 'unread', readAt: read ? new Date().toISOString() : null }
          : item
      ));
      return {
        ...current,
        notifications,
        unreadCount: Math.max(0, current.unreadCount + (read ? -1 : 1)),
      };
    });
  }, []);

  const markAllRead = useCallback(async () => {
    await markAllNotificationsRead();
    setState((current) => ({
      ...current,
      notifications: current.notifications.map((item) => ({
        ...item,
        status: 'read',
        readAt: item.readAt || new Date().toISOString(),
      })),
      unreadCount: 0,
    }));
  }, []);

  const notifications = useMemo(
    () => (user && state.uid === user.uid ? state.notifications : []),
    [state.notifications, state.uid, user],
  );

  return useMemo(() => ({
    notifications,
    unreadCount: user && state.uid === user.uid ? state.unreadCount : 0,
    loading: Boolean(user && state.uid === user.uid && state.loading),
    error: user && state.uid === user.uid ? state.error : '',
    refresh,
    setRead,
    markAllRead,
  }), [notifications, state.unreadCount, state.loading, state.error, state.uid, user, refresh, setRead, markAllRead]);
}
