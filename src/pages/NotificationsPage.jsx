import {
    BellRing,
    CalendarClock,
    CheckCheck,
    ChevronRight,
    CircleDollarSign,
    Dumbbell,
    Megaphone,
    RefreshCw,
    ShieldCheck,
    SlidersHorizontal,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useNotificationCenter } from '../context/NotificationContext';
import useNotifications from '../hooks/useNotifications';
import {
    getMyNotificationPreferences,
    saveMyNotificationPreferences,
} from '../services/notifications';

const filters = [
    ['all', 'All'],
    ['unread', 'Unread'],
    ['bookings', 'Private training'],
    ['events', 'Events'],
    ['progression', 'Progression'],
    ['payments', 'Payments'],
    ['announcements', 'Announcements'],
];

const preferenceOptions = [
    ['announcements', 'Studio announcements', 'New programs, events, schedule updates, and studio news.'],
    ['bookingReminders', 'Private-training reminders', 'Reminders before a confirmed private-training session.'],
    ['eventReminders', 'Event reminders', 'Upcoming event reminders and incomplete-waiver notices.'],
    ['progression', 'Progression feedback', 'Instructor feedback and progression decisions.'],
    ['creditExpiration', 'Expiring session credits', 'Warnings when unused private-training credits are nearing expiration.'],
];

function iconFor(category) {
    if (category === 'bookings') return CalendarClock;
    if (category === 'events') return ShieldCheck;
    if (category === 'progression') return Dumbbell;
    if (category === 'payments') return CircleDollarSign;
    if (category === 'announcements') return Megaphone;
    return BellRing;
}

function formatTime(value) {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.valueOf())) return '';
    const difference = Date.now() - date.getTime();
    const minutes = Math.floor(difference / 60_000);
    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}d ago`;
    return new Intl.DateTimeFormat('en-US', {
        month: 'short',
        day: 'numeric',
        year: date.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined,
    }).format(date);
}

export default function NotificationsPage() {
    const navigate = useNavigate();
    const {
        unreadCount,
        loading: countLoading,
        error: countError,
        refresh: refreshUnreadCount,
        adjustUnreadCount,
        setUnreadCount,
    } = useNotificationCenter();
    const {
        notifications,
        loading,
        loadingMore,
        hasMore,
        error: feedError,
        refresh: refreshFeed,
        loadMore,
        setRead: setFeedRead,
        markAllRead: markFeedAllRead,
    } = useNotifications({ pageSize: 25 });
    const [filter, setFilter] = useState('all');
    const [preferences, setPreferences] = useState(null);
    const [actionBusy, setActionBusy] = useState(false);
    const [preferenceStatus, setPreferenceStatus] = useState({
        loading: true,
        saving: false,
        message: '',
    });

    useEffect(() => {
        let active = true;
        getMyNotificationPreferences()
            .then((result) => {
                if (!active) return;
                setPreferences(result?.preferences?.optional || {});
                setPreferenceStatus({ loading: false, saving: false, message: '' });
            })
            .catch((preferenceError) => {
                console.error('Notification preferences could not be loaded:', preferenceError);
                if (!active) return;
                setPreferenceStatus({
                    loading: false,
                    saving: false,
                    message: preferenceError?.message || 'Notification preferences could not be loaded.',
                });
            });
        return () => { active = false; };
    }, []);

    const visible = useMemo(() => notifications.filter((item) => {
        if (filter === 'all') return true;
        if (filter === 'unread') return item.status === 'unread';
        return item.category === filter;
    }), [filter, notifications]);

    const setRead = async (item, read) => {
        const result = await setFeedRead(item.id, read);
        if (result?.changed) adjustUnreadCount(read ? -1 : 1);
    };

    const openNotification = async (item) => {
        try {
            if (item.status === 'unread') await setRead(item, true);
        } catch (readError) {
            console.error('Notification could not be marked read:', readError);
        }
        navigate(item.actionPath || '/member');
    };

    const refreshAll = async () => {
        await Promise.all([
            refreshFeed(),
            refreshUnreadCount(),
        ]);
    };

    const markAllRead = async () => {
        setActionBusy(true);
        try {
            await markFeedAllRead();
            setUnreadCount(0);
            await refreshUnreadCount({ quiet: true });
        } catch (error) {
            console.error('Notifications could not be marked read:', error);
        } finally {
            setActionBusy(false);
        }
    };

    const savePreferences = async () => {
        if (!preferences) return;
        setPreferenceStatus({ loading: false, saving: true, message: '' });
        try {
            await saveMyNotificationPreferences(preferences);
            setPreferenceStatus({ loading: false, saving: false, message: 'Preferences saved.' });
        } catch (saveError) {
            console.error('Notification preferences could not be saved:', saveError);
            setPreferenceStatus({
                loading: false,
                saving: false,
                message: saveError?.message || 'Preferences could not be saved.',
            });
        }
    };

    const error = feedError || countError;

    return (
        <section className="member-page notification-page">
            <div className="container">
                <header className="notification-page__header">
                    <div>
                        <p className="eyebrow">Notification center</p>
                        <h1>Updates that need your attention</h1>
                        <p>
                            Booking changes, event waivers, payment status, progression feedback,
                            expiring credits, and studio announcements are kept together here.
                        </p>
                    </div>
                    <div className="notification-page__header-actions">
                        <button
                            className="button button--ghost-light"
                            type="button"
                            onClick={refreshAll}
                            disabled={loading || countLoading}
                        >
                            <RefreshCw size={17} aria-hidden="true" /> Refresh
                        </button>
                        <button
                            className="button"
                            type="button"
                            onClick={markAllRead}
                            disabled={!unreadCount || actionBusy}
                        >
                            <CheckCheck size={17} aria-hidden="true" />
                            {actionBusy ? 'Updating…' : 'Mark all read'}
                        </button>
                    </div>
                </header>

                <div className="notification-layout">
                    <main className="notification-panel" aria-busy={loading || loadingMore}>
                        <div className="notification-panel__topline">
                            <div>
                                <p className="eyebrow">Inbox</p>
                                <h2>{unreadCount ? `${unreadCount} unread` : 'All caught up'}</h2>
                            </div>
                            <div className="notification-filters" aria-label="Notification filters">
                                {filters.map(([value, label]) => (
                                    <button
                                        className={filter === value ? 'is-active' : ''}
                                        key={value}
                                        type="button"
                                        onClick={() => setFilter(value)}
                                        aria-pressed={filter === value}
                                    >
                                        {label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {error && <div className="notification-message notification-message--error" role="alert">{error}</div>}
                        {loading && <div className="notification-empty">Loading notifications…</div>}
                        {!loading && !error && visible.length === 0 && (
                            <div className="notification-empty">
                                <BellRing size={30} aria-hidden="true" />
                                <h3>No notifications in this view</h3>
                                <p>
                                    {hasMore
                                        ? 'More notifications are available. Load the next page to continue searching this category.'
                                        : 'New updates will appear here as studio activity occurs.'}
                                </p>
                            </div>
                        )}

                        {!loading && visible.length > 0 && (
                            <div className="notification-list">
                                {visible.map((item) => {
                                    const Icon = iconFor(item.category);
                                    return (
                                        <article
                                            className={`notification-item ${item.status === 'unread' ? 'is-unread' : ''} is-${item.priority || 'normal'}`}
                                            key={item.id}
                                        >
                                            <div className="notification-item__icon"><Icon aria-hidden="true" /></div>
                                            <div className="notification-item__body">
                                                <div className="notification-item__meta">
                                                    <span>{item.categoryLabel || item.category}</span>
                                                    <time dateTime={item.createdAt || undefined}>{formatTime(item.createdAt)}</time>
                                                </div>
                                                <h3>{item.title}</h3>
                                                <p>{item.message}</p>
                                                <div className="notification-item__actions">
                                                    <button className="text-link" type="button" onClick={() => openNotification(item)}>
                                                        {item.actionLabel || 'View details'} <ChevronRight size={16} aria-hidden="true" />
                                                    </button>
                                                    <button
                                                        className="notification-item__read-toggle"
                                                        type="button"
                                                        onClick={() => setRead(item, item.status !== 'read')}
                                                    >
                                                        Mark {item.status === 'read' ? 'unread' : 'read'}
                                                    </button>
                                                </div>
                                            </div>
                                        </article>
                                    );
                                })}
                            </div>
                        )}

                        {!loading && hasMore && (
                            <div className="notification-load-more">
                                <button className="button button--ghost" type="button" onClick={loadMore} disabled={loadingMore}>
                                    {loadingMore ? 'Loading more…' : 'Load 25 more'}
                                </button>
                            </div>
                        )}
                    </main>

                    <aside className="notification-preferences">
                        <div className="notification-preferences__heading">
                            <SlidersHorizontal aria-hidden="true" />
                            <div>
                                <p className="eyebrow">Preferences</p>
                                <h2>Optional alerts</h2>
                            </div>
                        </div>
                        <p>
                            Payment status, booking changes, and registration changes always remain visible
                            because they affect purchases or scheduled attendance.
                        </p>

                        {preferenceStatus.loading && <p>Loading preferences…</p>}
                        {!preferenceStatus.loading && preferences && (
                            <div className="notification-preference-list">
                                {preferenceOptions.map(([key, title, description]) => (
                                    <label className="notification-preference" key={key}>
                                        <input
                                            type="checkbox"
                                            checked={preferences[key] !== false}
                                            onChange={(event) => setPreferences((current) => ({
                                                ...current,
                                                [key]: event.target.checked,
                                            }))}
                                        />
                                        <span>
                                            <strong>{title}</strong>
                                            <small>{description}</small>
                                        </span>
                                    </label>
                                ))}
                            </div>
                        )}

                        <button className="button" type="button" onClick={savePreferences} disabled={!preferences || preferenceStatus.saving}>
                            {preferenceStatus.saving ? 'Saving…' : 'Save preferences'}
                        </button>
                        {preferenceStatus.message && (
                            <p className="notification-preferences__status" role="status">{preferenceStatus.message}</p>
                        )}
                    </aside>
                </div>
            </div>
        </section>
    );
}
