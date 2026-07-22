import { Bell } from 'lucide-react';
import { PrefetchNavLink } from '../PrefetchLink';
import { useNotificationCenter } from '../../context/NotificationContext';

export default function NotificationBell({
    onNavigate,
    to = '/member/notifications',
}) {
    const { unreadCount, loading } = useNotificationCenter();
    const label = unreadCount > 0
        ? `${unreadCount} unread notification${unreadCount === 1 ? '' : 's'}`
        : 'Notifications';

    return (
        <PrefetchNavLink
            className="notification-bell"
            to={to}
            onClick={onNavigate}
            aria-label={label}
            title={label}
        >
            <Bell size={20} aria-hidden="true" />
            {!loading && unreadCount > 0 && (
                <span className="notification-bell__count" aria-hidden="true">
                    {unreadCount > 99 ? '99+' : unreadCount}
                </span>
            )}
        </PrefetchNavLink>
    );
}
