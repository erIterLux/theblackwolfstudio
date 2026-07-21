import {
    ArrowLeft,
    Ban,
    CalendarClock,
    Clock3,
    History,
    MapPin,
    RotateCcw,
    Users,
} from 'lucide-react';
import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import usePrivateTrainingBookings from '../hooks/usePrivateTrainingBookings';
import usePrivateTrainingPurchases from '../hooks/usePrivateTrainingPurchases';
import { updatePrivateTrainingBooking } from '../services/privateTraining';

function formatDate(value, includeTime = false, timeZone = 'America/New_York') {
    const date = value ? new Date(value) : null;
    if (!date || Number.isNaN(date.valueOf())) return 'Not available';
    return new Intl.DateTimeFormat('en-US', {
        timeZone,
        weekday: includeTime ? 'long' : undefined,
        month: 'long',
        day: 'numeric',
        year: 'numeric',
        hour: includeTime ? 'numeric' : undefined,
        minute: includeTime ? '2-digit' : undefined,
    }).format(date);
}

function statusLabel(status) {
    const labels = {
        active: 'Active',
        used: 'Completed',
        expired: 'Expired',
        requested: 'Awaiting confirmation',
        confirmed: 'Confirmed',
        rescheduled: 'Rescheduled',
        completed: 'Completed',
        canceled: 'Canceled',
        late_canceled: 'Canceled late',
        no_show: 'Missed session',
    };
    return labels[status] || String(status || 'Pending').replaceAll('_', ' ');
}

function availableSessions(purchase) {
    return Math.max(
        0,
        Number(purchase.remainingSessions || 0) - Number(purchase.reservedSessions || 0),
    );
}

export default function MemberPrivateTrainingPage() {
    const location = useLocation();
    const {
        purchases,
        activePurchases,
        remainingSessions,
        loading: purchaseLoading,
        error: purchaseError,
        refresh: refreshPurchases,
    } = usePrivateTrainingPurchases();
    const {
        upcomingBookings,
        pastBookings,
        loading: bookingLoading,
        error: bookingError,
        refresh: refreshBookings,
    } = usePrivateTrainingBookings();
    const [busy, setBusy] = useState('');
    const [message, setMessage] = useState(location.state?.bookingMessage || '');

    const cancelBooking = async (booking) => {
        const confirmed = window.confirm(
            'Cancel this private-training session? The saved cancellation policy determines whether the credit is restored.',
        );
        if (!confirmed) return;
        setBusy(booking.id);
        setMessage('');
        try {
            const result = await updatePrivateTrainingBooking({
                bookingId: booking.id,
                action: 'cancel',
                note: 'Canceled by member from the private-training page.',
            });
            setMessage(
                result.status === 'late_canceled'
                    ? 'The session was canceled inside the notice window and the credit was used.'
                    : 'The session was canceled and the credit was restored.',
            );
            await Promise.all([refreshBookings(), refreshPurchases()]);
        } catch (error) {
            console.error(error);
            setMessage(error?.message || 'The booking could not be canceled.');
        } finally {
            setBusy('');
        }
    };

    const loading = purchaseLoading || bookingLoading;
    const error = purchaseError || bookingError;

    return (
        <section className="member-page private-member-page">
            <div className="container">
                <div className="member-header member-header--refined">
                    <div>
                        <Link className="text-link" to="/member">
                            <ArrowLeft size={17} /> Member home
                        </Link>
                        <p className="eyebrow">Private training</p>
                        <h1>Your packages and booked sessions</h1>
                        <p>
                            Book available times, see reserved credits, manage upcoming
                            sessions, and review completed package use.
                        </p>
                    </div>
                    <div className="header-button-group">
                        {activePurchases.some((purchase) => availableSessions(purchase) > 0) && (
                            <Link className="button" to="/member/private-training/book">
                                Book a session
                            </Link>
                        )}
                        <Link className="button button--ghost-light" to="/private-training">
                            Buy another package
                        </Link>
                    </div>
                </div>

                {message && (
                    <p className={`form-status ${message.includes('could not') || message.includes('inside') ? 'form-status--error' : 'form-status--success'}`}>
                        {message}
                    </p>
                )}

                <div className="private-member-summary">
                    <div><strong>{activePurchases.length}</strong><span>active packages</span></div>
                    <div><strong>{remainingSessions}</strong><span>unused sessions</span></div>
                    <div><strong>{upcomingBookings.length}</strong><span>upcoming bookings</span></div>
                </div>

                {loading && <p className="page-loader">Loading private training…</p>}
                {error && (
                    <div className="form-status form-status--error">
                        <p>{error}</p>
                        <button
                            type="button"
                            className="text-link"
                            onClick={() => Promise.all([refreshPurchases(), refreshBookings()])}
                        >
                            Try again
                        </button>
                    </div>
                )}

                {!loading && !error && Boolean(upcomingBookings.length) && (
                    <section className="member-bookings-section">
                        <div className="section-heading-inline">
                            <div>
                                <p className="eyebrow">Upcoming</p>
                                <h2>Your booked sessions</h2>
                            </div>
                        </div>

                        <div className="member-booking-list">
                            {upcomingBookings.map((booking) => (
                                <article className="member-booking-card" key={booking.id}>
                                    <div className="member-booking-card__heading">
                                        <div>
                                            <p className="eyebrow">{statusLabel(booking.status)}</p>
                                            <h3>{formatDate(booking.startsAt, true, booking.timezone)}</h3>
                                        </div>
                                        <span className={`booking-status is-${booking.status}`}>
                                            {statusLabel(booking.status)}
                                        </span>
                                    </div>

                                    <div className="member-booking-details">
                                        <span><Clock3 size={17} /> {booking.durationMinutes} minutes</span>
                                        <span><Users size={17} /> {(booking.participants || []).map((participant) => participant.fullName).join(', ')}</span>
                                        <span><MapPin size={17} /> {booking.location || booking.locationType?.replaceAll('_', ' ') || 'Location will be confirmed'}</span>
                                    </div>

                                    {booking.memberNote && <p className="booking-note"><strong>Your note:</strong> {booking.memberNote}</p>}

                                    <div className="member-booking-actions">
                                        <Link
                                            className="button button--secondary"
                                            to={`/member/private-training/book?bookingId=${encodeURIComponent(booking.id)}&purchaseId=${encodeURIComponent(booking.purchaseId)}`}
                                        >
                                            <RotateCcw size={17} /> Choose another time
                                        </Link>
                                        <button
                                            type="button"
                                            className="button button--danger"
                                            onClick={() => cancelBooking(booking)}
                                            disabled={busy === booking.id}
                                        >
                                            <Ban size={17} /> {busy === booking.id ? 'Canceling…' : 'Cancel session'}
                                        </button>
                                    </div>

                                    <p className="dashboard-hint">
                                        Cancel or reschedule before the saved notice window to have
                                        the reserved credit returned automatically.
                                    </p>
                                </article>
                            ))}
                        </div>
                    </section>
                )}

                {!loading && !error && !purchases.length && (
                    <article className="empty-state-card">
                        <h2>No private training packages yet.</h2>
                        <p>
                            Choose a single-session or multi-session package for one to three
                            participants.
                        </p>
                        <Link className="button" to="/private-training">Explore private training</Link>
                    </article>
                )}

                {!loading && !error && Boolean(purchases.length) && (
                    <section className="member-packages-section">
                        <div className="section-heading-inline">
                            <div>
                                <p className="eyebrow">Package balances</p>
                                <h2>Your session credits</h2>
                            </div>
                        </div>

                        <div className="private-purchase-list">
                            {purchases.map((purchase) => {
                                const available = availableSessions(purchase);
                                const reserved = Number(purchase.reservedSessions || 0);
                                return (
                                    <article className="private-purchase-card" key={purchase.id}>
                                        <div className="private-purchase-card__top">
                                            <div>
                                                <p className="eyebrow">{statusLabel(purchase.status)}</p>
                                                <h2>{purchase.offerName}</h2>
                                            </div>
                                            <span className={`private-package-status is-${purchase.status || 'pending'}`}>
                                                {statusLabel(purchase.status)}
                                            </span>
                                        </div>

                                        <div className="private-credit-grid">
                                            <div><strong>{available}</strong><span>available to book</span></div>
                                            <div><strong>{reserved}</strong><span>reserved for bookings</span></div>
                                            <div><strong>{purchase.usedSessions || 0}</strong><span>used</span></div>
                                        </div>

                                        <div className="private-purchase-meta">
                                            <span><Clock3 size={17} /> {purchase.sessionDurationMinutes} minutes per session</span>
                                            <span><CalendarClock size={17} /> Use by {formatDate(purchase.expiresAt)}</span>
                                            <span><Users size={17} /> {purchase.participantCount} registered participant{purchase.participantCount === 1 ? '' : 's'}</span>
                                            <span><History size={17} /> {purchase.totalSessions} total credits</span>
                                        </div>

                                        <div className="private-participant-list">
                                            <p className="footer-heading">Registered group</p>
                                            <div>
                                                {(purchase.participants || []).map((participant) => (
                                                    <span key={participant.id}>{participant.fullName}</span>
                                                ))}
                                            </div>
                                        </div>

                                        {purchase.status === 'active' && available > 0 && (
                                            <Link className="button" to={`/member/private-training/book?purchaseId=${encodeURIComponent(purchase.id)}`}>
                                                Book from this package
                                            </Link>
                                        )}
                                    </article>
                                );
                            })}
                        </div>
                    </section>
                )}

                {!loading && !error && Boolean(pastBookings.length) && (
                    <details className="past-bookings-details">
                        <summary>Past and closed bookings ({pastBookings.length})</summary>
                        <div className="past-booking-list">
                            {pastBookings.map((booking) => (
                                <article key={booking.id}>
                                    <strong>{formatDate(booking.startsAt, true, booking.timezone)}</strong>
                                    <span>{statusLabel(booking.status)}</span>
                                    <span>{(booking.participants || []).map((participant) => participant.fullName).join(', ')}</span>
                                </article>
                            ))}
                        </div>
                    </details>
                )}
            </div>
        </section>
    );
}
