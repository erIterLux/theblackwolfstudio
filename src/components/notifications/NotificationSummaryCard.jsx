import { ArrowRight, BellRing } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useNotificationCenter } from '../../context/NotificationContext';

export default function NotificationSummaryCard() {
    const { unreadCount, loading, error } = useNotificationCenter();

    return (
        <article className="dashboard-card dashboard-card--notifications">
            <div className="dashboard-card__heading">
                <BellRing aria-hidden="true" />
                <div>
                    <p className="eyebrow">Notifications</p>
                    <h2>{loading ? 'Checking updates…' : unreadCount ? `${unreadCount} need attention` : 'You are caught up'}</h2>
                </div>
            </div>

            {error && <p className="notification-summary__error">{error}</p>}
            {!loading && !error && unreadCount > 0 && (
                <p>
                    Open the notification center to review booking changes, waivers,
                    payments, progression feedback, and studio announcements.
                </p>
            )}
            {!loading && !error && unreadCount === 0 && (
                <p>New booking, waiver, payment, progression, and studio updates will appear here.</p>
            )}

            <Link to="/member/notifications" className="text-link">
                Open notifications <ArrowRight size={17} aria-hidden="true" />
            </Link>
        </article>
    );
}
