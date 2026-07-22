import { ArrowRight, CalendarDays, MapPin, ShieldCheck, Users } from 'lucide-react';
import { Link } from 'react-router-dom';
import useEventRegistrations from '../../hooks/useEventRegistrations';

function formatDate(value) {
    const date = value ? new Date(value) : null;
    if (!date || Number.isNaN(date.valueOf())) return '';
    return date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
    });
}

export default function EventSummaryCard({ dashboardState }) {
    const hasDashboardState = dashboardState !== undefined;
    const remote = useEventRegistrations({ enabled: !hasDashboardState });
    const summary = dashboardState?.data || null;
    const nextRegistration = hasDashboardState
        ? summary?.nextRegistration || null
        : remote.nextRegistration;
    const upcomingCount = hasDashboardState
        ? Number(summary?.upcomingCount || 0)
        : remote.upcoming.length;
    const loading = hasDashboardState ? dashboardState?.loading === true : remote.loading;
    const error = hasDashboardState ? dashboardState?.error || '' : remote.error;

    return (
        <article className="dashboard-card dashboard-card--events">
            <div className="dashboard-card__heading">
                <CalendarDays aria-hidden="true" />
                <div>
                    <p className="eyebrow">Events</p>
                    <h2>{nextRegistration ? 'Your next event' : 'Upcoming training events'}</h2>
                </div>
            </div>

            {loading && <p className="dashboard-hint">Loading event registrations…</p>}
            {error && <p className="form-status form-status--error">{error}</p>}

            {!loading && !error && nextRegistration && (
                <>
                    <div className="dashboard-event-highlight">
                        <strong>{nextRegistration.eventSnapshot?.title}</strong>
                        <span>{formatDate(nextRegistration.eventSnapshot?.startsAt)}</span>
                    </div>
                    <div className="dashboard-event-meta">
                        <span><MapPin size={16} aria-hidden="true" /> {nextRegistration.eventSnapshot?.location?.name || 'Location announced soon'}</span>
                        <span><Users size={16} aria-hidden="true" /> {nextRegistration.participantCount} participant{nextRegistration.participantCount === 1 ? '' : 's'}</span>
                        <span><ShieldCheck size={16} aria-hidden="true" /> Waivers tracked separately</span>
                    </div>
                    {upcomingCount > 1 && <p className="dashboard-hint">Plus {upcomingCount - 1} more upcoming registration{upcomingCount === 2 ? '' : 's'}.</p>}
                    <Link className="text-link" to="/member/events">View registrations <ArrowRight size={17} aria-hidden="true" /></Link>
                </>
            )}

            {!loading && !error && !nextRegistration && (
                <>
                    <p>Register for workshops and special training without needing a membership.</p>
                    <Link className="text-link" to="/events">Browse events <ArrowRight size={17} aria-hidden="true" /></Link>
                </>
            )}
        </article>
    );
}
