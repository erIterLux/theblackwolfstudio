import { ArrowRight, BellRing } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useNotificationCenter } from '../../context/NotificationContext';

export default function NotificationSummaryCard() {
  const { notifications, unreadCount, loading, error } = useNotificationCenter();
  const unread = notifications.filter((item) => item.status === 'unread').slice(0, 3);

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
      {!loading && !error && unread.length > 0 && (
        <div className="notification-summary__items">
          {unread.map((item) => (
            <div key={item.id}>
              <strong>{item.title}</strong>
              <span>{item.message}</span>
            </div>
          ))}
        </div>
      )}
      {!loading && !error && unread.length === 0 && (
        <p>Booking changes, waivers, payments, progression feedback, and studio news will appear here.</p>
      )}

      <Link to="/member/notifications" className="text-link">
        Open notifications <ArrowRight size={17} aria-hidden="true" />
      </Link>
    </article>
  );
}
