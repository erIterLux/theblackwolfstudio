import { ArrowRight, CalendarClock, Clock3, Users } from 'lucide-react';
import { Link } from 'react-router-dom';
import usePrivateTrainingBookings from '../../hooks/usePrivateTrainingBookings';
import usePrivateTrainingPurchases from '../../hooks/usePrivateTrainingPurchases';

function nearestExpiration(purchases) {
    return purchases
        .map((item) => item.expiresAt ? new Date(item.expiresAt) : null)
        .filter((value) => value && !Number.isNaN(value.valueOf()))
        .sort((left, right) => left - right)[0] || null;
}

function availableSessions(purchases) {
    return purchases.reduce((total, item) => (
        total + Math.max(
            0,
            Number(item.remainingSessions || 0) - Number(item.reservedSessions || 0),
        )
    ), 0);
}

function formatBooking(value, timeZone = 'America/New_York') {
    const date = value ? new Date(value) : null;
    if (!date || Number.isNaN(date.valueOf())) return 'Scheduled time';
    return new Intl.DateTimeFormat('en-US', {
        timeZone,
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
    }).format(date);
}

export default function PrivateTrainingSummaryCard() {
    const {
        activePurchases,
        loading: purchaseLoading,
        error: purchaseError,
    } = usePrivateTrainingPurchases();
    const {
        nextBooking,
        loading: bookingLoading,
        error: bookingError,
    } = usePrivateTrainingBookings();

    if (purchaseLoading || bookingLoading) {
        return (
            <article className="dashboard-card private-training-summary-card">
                <p>Loading private training…</p>
            </article>
        );
    }

    const error = purchaseError || bookingError;
    if (error) {
        return (
            <article className="dashboard-card private-training-summary-card">
                <p className="form-error">{error}</p>
            </article>
        );
    }

    const available = availableSessions(activePurchases);
    const reserved = activePurchases.reduce(
        (total, purchase) => total + Number(purchase.reservedSessions || 0),
        0,
    );
    const expiration = nearestExpiration(activePurchases);

    return (
        <article className="dashboard-card private-training-summary-card">
            <div className="dashboard-card__heading">
                <Users aria-hidden="true" />
                <div>
                    <p className="eyebrow">Private training</p>
                    <h2>
                        {nextBooking
                            ? 'Your next private session'
                            : available > 0
                                ? 'Session credits ready'
                                : 'Train one to one—or together'}
                    </h2>
                </div>
            </div>

            {nextBooking ? (
                <>
                    <div className="next-private-booking">
                        <CalendarClock aria-hidden="true" />
                        <div>
                            <strong>{formatBooking(nextBooking.startsAt, nextBooking.timezone)}</strong>
                            <span>{nextBooking.status === 'requested' ? 'Awaiting confirmation' : 'Confirmed'} · {nextBooking.participantCount} participant{nextBooking.participantCount === 1 ? '' : 's'}</span>
                        </div>
                    </div>
                    <p className="dashboard-hint">
                        {available} available credit{available === 1 ? '' : 's'} · {reserved} reserved
                    </p>
                    <Link className="text-link" to="/member/private-training">
                        View booking <ArrowRight size={17} />
                    </Link>
                </>
            ) : available > 0 ? (
                <>
                    <div className="private-training-summary-card__balance">
                        <strong>{available}</strong>
                        <span>available session{available === 1 ? '' : 's'} across {activePurchases.length} active package{activePurchases.length === 1 ? '' : 's'}</span>
                    </div>
                    {expiration && (
                        <p className="dashboard-hint">
                            <Clock3 size={16} /> Nearest expiration: {expiration.toLocaleDateString('en-US', {
                                month: 'short',
                                day: 'numeric',
                                year: 'numeric',
                            })}
                        </p>
                    )}
                    <Link className="text-link" to="/member/private-training/book">
                        Book a session <ArrowRight size={17} />
                    </Link>
                </>
            ) : (
                <>
                    <p>
                        Purchase a private package for yourself or a registered group of up
                        to three people. Members receive eligible pricing automatically.
                    </p>
                    <Link className="text-link" to="/private-training">
                        Explore private training <ArrowRight size={17} />
                    </Link>
                </>
            )}
        </article>
    );
}
