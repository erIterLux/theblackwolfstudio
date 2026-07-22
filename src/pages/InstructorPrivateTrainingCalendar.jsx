import {
    ArrowLeft,
    Ban,
    CalendarClock,
    CheckCircle2,
    Clock3,
    RefreshCw,
    RotateCcw,
    UserRoundCheck,
    Users,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import useStudioRole from '../hooks/useStudioRole';
import {
    listPrivateTrainingBookingsAdmin,
    updatePrivateTrainingBooking,
} from '../services/privateTraining';

const ACTIVE_STATUSES = new Set(['requested', 'confirmed', 'rescheduled']);

function formatDateTime(value, timeZone = 'America/New_York') {
    const date = value ? new Date(value) : null;
    if (!date || Number.isNaN(date.valueOf())) return 'Time not available';
    return new Intl.DateTimeFormat('en-US', {
        timeZone,
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
    }).format(date);
}

function statusLabel(status) {
    const labels = {
        requested: 'Awaiting confirmation',
        confirmed: 'Confirmed',
        rescheduled: 'Rescheduled',
        completed: 'Completed',
        canceled: 'Canceled',
        late_canceled: 'Canceled late',
        no_show: 'No-show',
    };
    return labels[status] || String(status || 'Unknown').replaceAll('_', ' ');
}

function localDateTimeValue(value) {
    const date = value ? new Date(value) : null;
    if (!date || Number.isNaN(date.valueOf())) return '';
    const offset = date.getTimezoneOffset() * 60 * 1000;
    return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

export default function InstructorPrivateTrainingCalendar() {
    const { isInstructor, loading: roleLoading, error: roleError } = useStudioRole();
    const [bookings, setBookings] = useState([]);
    const [filter, setFilter] = useState('upcoming');
    const [search, setSearch] = useState('');
    const [forms, setForms] = useState({});
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState('');
    const [message, setMessage] = useState('');

    const load = useCallback(async () => {
        setLoading(true);
        setMessage('');
        try {
            const result = await listPrivateTrainingBookingsAdmin();
            setBookings(result?.bookings || []);
        } catch (error) {
            console.error(error);
            setMessage(error?.message || 'Private-training bookings could not be loaded.');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        if (isInstructor) queueMicrotask(load);
    }, [isInstructor, load]);

    const visibleBookings = useMemo(() => {
        const now = new Date();
        const query = search.trim().toLowerCase();
        return bookings
            .filter((booking) => {
                if (filter === 'upcoming') {
                    return ACTIVE_STATUSES.has(booking.status) && new Date(booking.endsAt) >= now;
                }
                if (filter === 'requested') return booking.status === 'requested';
                if (filter === 'completed') return booking.status === 'completed';
                if (filter === 'closed') return ['canceled', 'late_canceled', 'no_show'].includes(booking.status);
                return true;
            })
            .filter((booking) => {
                if (!query) return true;
                const haystack = [
                    booking.purchaser?.displayName,
                    booking.purchaser?.email,
                    booking.offerName,
                    booking.instructorName,
                    ...(booking.participants || []).map((participant) => participant.fullName),
                ].join(' ').toLowerCase();
                return haystack.includes(query);
            })
            .sort((left, right) => new Date(left.startsAt) - new Date(right.startsAt));
    }, [bookings, filter, search]);

    const counts = useMemo(() => ({
        upcoming: bookings.filter((booking) => ACTIVE_STATUSES.has(booking.status) && new Date(booking.endsAt) >= new Date()).length,
        requested: bookings.filter((booking) => booking.status === 'requested').length,
        today: bookings.filter((booking) => (
            ACTIVE_STATUSES.has(booking.status)
            && new Date(booking.startsAt).toDateString() === new Date().toDateString()
        )).length,
    }), [bookings]);

    const updateForm = (bookingId, patch) => {
        setForms((current) => ({
            ...current,
            [bookingId]: {
                startsAt: localDateTimeValue(bookings.find((booking) => booking.id === bookingId)?.startsAt),
                note: '',
                ...current[bookingId],
                ...patch,
            },
        }));
    };

    const runAction = async (booking, action, extra = {}) => {
        const form = forms[booking.id] || {};
        setBusy(`${booking.id}-${action}`);
        setMessage('');
        try {
            await updatePrivateTrainingBooking({
                bookingId: booking.id,
                action,
                note: form.note || undefined,
                ...extra,
            });
            setMessage(`Booking ${action.replaceAll('_', ' ')} saved.`);
            await load();
        } catch (error) {
            console.error(error);
            setMessage(error?.message || 'The booking could not be updated.');
        } finally {
            setBusy('');
        }
    };

    const reschedule = async (booking) => {
        const form = forms[booking.id] || {};
        if (!form.startsAt) {
            setMessage('Choose a new date and time.');
            return;
        }
        await runAction(booking, 'reschedule', {
            startsAt: new Date(form.startsAt).toISOString(),
            instructorUid: booking.instructorUid,
        });
    };

    if (roleLoading || loading) return <p className="page-loader">Loading booking calendar…</p>;
    if (roleError || !isInstructor) {
        return <p className="form-status form-status--error">Instructor access is required.</p>;
    }

    return (
        <section className="member-page instructor-booking-page">
            <div className="container">
                <div className="member-header member-header--refined">
                    <div>
                        <Link className="text-link" to="/instructor">
                            <ArrowLeft size={17} /> Instructor overview
                        </Link>
                        <p className="eyebrow">Private training calendar</p>
                        <h1>Review and manage booked sessions.</h1>
                        <p>
                            Confirm requests, update times, record attendance, and close the
                            booking without manually changing package credits.
                        </p>
                    </div>
                    <div className="header-button-group">
                        <Link className="button button--ghost-light" to="/instructor/availability">
                            Availability
                        </Link>
                        <Link className="button button--ghost-light" to="/instructor/private-training">
                            Packages
                        </Link>
                    </div>
                </div>

                {message && (
                    <p className={`form-status ${message.includes('saved') ? 'form-status--success' : 'form-status--error'}`}>
                        {message}
                    </p>
                )}

                <div className="booking-admin-summary">
                    <div><CalendarClock /><strong>{counts.upcoming}</strong><span>upcoming</span></div>
                    <div><Clock3 /><strong>{counts.requested}</strong><span>awaiting confirmation</span></div>
                    <div><UserRoundCheck /><strong>{counts.today}</strong><span>scheduled today</span></div>
                </div>

                <div className="booking-admin-toolbar">
                    <input
                        type="search"
                        value={search}
                        onChange={(event) => setSearch(event.target.value)}
                        placeholder="Search member, participant, package, or email"
                    />
                    <select value={filter} onChange={(event) => setFilter(event.target.value)}>
                        <option value="upcoming">Upcoming</option>
                        <option value="requested">Awaiting confirmation</option>
                        <option value="completed">Completed</option>
                        <option value="closed">Canceled and missed</option>
                        <option value="all">All bookings</option>
                    </select>
                    <button type="button" className="button button--secondary" onClick={load}>
                        <RefreshCw size={17} /> Refresh
                    </button>
                </div>

                {!visibleBookings.length ? (
                    <article className="empty-state-card">
                        <h2>No bookings match this view.</h2>
                        <p>New confirmed or requested sessions will appear here.</p>
                    </article>
                ) : (
                    <div className="booking-admin-list">
                        {visibleBookings.map((booking) => {
                            const form = forms[booking.id] || {
                                startsAt: localDateTimeValue(booking.startsAt),
                                note: '',
                            };
                            const active = ACTIVE_STATUSES.has(booking.status);
                            return (
                                <article className="booking-admin-card" key={booking.id}>
                                    <div className="booking-admin-card__heading">
                                        <div>
                                            <p className="eyebrow">{statusLabel(booking.status)}</p>
                                            <h2>{booking.purchaser?.displayName || booking.purchaser?.email || 'Member'}</h2>
                                            <p>{booking.offerName}</p>
                                        </div>
                                        <span className={`booking-status is-${booking.status}`}>{statusLabel(booking.status)}</span>
                                    </div>

                                    <div className="booking-admin-card__details">
                                        <span><CalendarClock size={17} /> {formatDateTime(booking.startsAt, booking.timezone)}</span>
                                        <span><Clock3 size={17} /> {booking.durationMinutes} minutes</span>
                                        <span><Users size={17} /> {(booking.participants || []).map((participant) => participant.fullName).join(', ')}</span>
                                        <span>{booking.location || booking.locationType?.replaceAll('_', ' ') || 'Location not set'}</span>
                                    </div>

                                    {booking.memberNote && (
                                        <div className="booking-note"><strong>Member note</strong><p>{booking.memberNote}</p></div>
                                    )}

                                    {active && (
                                        <div className="booking-admin-actions">
                                            <label>
                                                Instructor note
                                                <textarea
                                                    rows="2"
                                                    value={form.note}
                                                    onChange={(event) => updateForm(booking.id, { note: event.target.value })}
                                                    placeholder="Optional note saved with the action"
                                                />
                                            </label>

                                            <div className="booking-reschedule-row">
                                                <label>
                                                    New date and time
                                                    <input
                                                        type="datetime-local"
                                                        value={form.startsAt}
                                                        onChange={(event) => updateForm(booking.id, { startsAt: event.target.value })}
                                                    />
                                                </label>
                                                <button
                                                    type="button"
                                                    className="button button--secondary"
                                                    onClick={() => reschedule(booking)}
                                                    disabled={Boolean(busy)}
                                                >
                                                    <RotateCcw size={17} /> Reschedule
                                                </button>
                                            </div>

                                            <div className="booking-action-buttons">
                                                {booking.status === 'requested' && (
                                                    <button
                                                        type="button"
                                                        className="button"
                                                        onClick={() => runAction(booking, 'confirm')}
                                                        disabled={Boolean(busy)}
                                                    >
                                                        <CheckCircle2 size={17} /> Confirm
                                                    </button>
                                                )}
                                                {booking.status !== 'requested' && (
                                                    <button
                                                        type="button"
                                                        className="button"
                                                        onClick={() => runAction(booking, 'complete')}
                                                        disabled={Boolean(busy)}
                                                    >
                                                        <CheckCircle2 size={17} /> Mark completed
                                                    </button>
                                                )}
                                                <button
                                                    type="button"
                                                    className="button button--secondary"
                                                    onClick={() => runAction(booking, 'no_show')}
                                                    disabled={Boolean(busy) || booking.status === 'requested'}
                                                >
                                                    <UserRoundCheck size={17} /> No-show
                                                </button>
                                                <button
                                                    type="button"
                                                    className="button button--danger"
                                                    onClick={() => runAction(booking, 'cancel')}
                                                    disabled={Boolean(busy)}
                                                >
                                                    <Ban size={17} /> Cancel and restore credit
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </article>
                            );
                        })}
                    </div>
                )}
            </div>
        </section>
    );
}
