import {
    ArrowLeft,
    CalendarDays,
    Clock3,
    MapPin,
    ShieldCheck,
    TicketCheck,
    Users,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { getPublishedEvent } from '../services/events';
import { eventLocationParts } from '../utils/eventLocation';

function formatDate(value) {
    const date = value ? new Date(value) : null;
    if (!date || Number.isNaN(date.valueOf())) return 'Date announced soon';
    return date.toLocaleDateString('en-US', {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
        year: 'numeric',
    });
}

function formatTime(value) {
    const date = value ? new Date(value) : null;
    if (!date || Number.isNaN(date.valueOf())) return '';
    return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

function formatPrice(cents, currency = 'usd') {
    const amount = Number(cents || 0);
    if (!amount) return 'Free';
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: String(currency || 'usd').toUpperCase(),
        maximumFractionDigits: 0,
    }).format(amount / 100);
}

function registrationLabel(state) {
    if (state === 'open') return 'Register for this event';
    if (state === 'sold_out') return 'Event sold out';
    if (state === 'not_open') return 'Registration opens soon';
    return 'Registration closed';
}

export default function EventDetailPage() {
    const { eventId } = useParams();
    const [event, setEvent] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        let cancelled = false;
        getPublishedEvent(eventId)
            .then((result) => {
                if (!cancelled) setEvent(result?.event || null);
            })
            .catch((nextError) => {
                if (cancelled) return;
                console.error(nextError);
                setError(nextError?.code === 'functions/not-found'
                    ? 'This event is no longer available.'
                    : nextError?.message || 'The event details could not be loaded.');
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, [eventId]);

    if (loading) {
        return <section className="section--light offering-detail-page"><div className="container"><p className="page-loader">Loading event details…</p></div></section>;
    }

    if (error || !event) {
        return (
            <section className="section--light offering-detail-page">
                <div className="container">
                    <article className="empty-state-card offering-detail-state">
                        <CalendarDays size={38} />
                        <h1>Event unavailable</h1>
                        <p>{error || 'This event is no longer available.'}</p>
                        <Link className="button" to="/events">View upcoming events</Link>
                    </article>
                </div>
            </section>
        );
    }

    const location = eventLocationParts(event.location);
    const information = [
        ['Age requirement', event.ageRequirement],
        ['Prerequisites and preparation', event.prerequisites],
        ['Participant information', event.participantNotice],
        ['Cancellation and refunds', event.cancellationPolicy],
        ['Accessibility and accommodations', event.accessibilityContact],
    ].filter(([, value]) => value);
    const canRegister = event.registrationState === 'open';

    return (
        <section className="section--light offering-detail-page">
            <div className="container offering-detail-container">
                <Link className="text-link offering-detail-back" to="/events">
                    <ArrowLeft size={17} /> All events
                </Link>

                <article className="offering-detail-card">
                    <header className="offering-detail-hero">
                        <div>
                            <p className="eyebrow">Event details</p>
                            <h1>{event.title}</h1>
                            <p className="offering-detail-lead">
                                {event.longDescription || event.shortDescription}
                            </p>
                        </div>
                        <aside className="offering-detail-price">
                            <span>{Number(event.pricePerParticipantCents || 0) ? 'Per participant' : 'Registration'}</span>
                            <strong>{formatPrice(event.pricePerParticipantCents, event.currency)}</strong>
                            {event.remainingSeats != null && (
                                <small>{event.remainingSeats} spot{event.remainingSeats === 1 ? '' : 's'} remaining</small>
                            )}
                        </aside>
                    </header>

                    <div className="offering-detail-facts">
                        <div><CalendarDays /><span><small>Date</small><strong>{formatDate(event.startsAt)}</strong></span></div>
                        <div><Clock3 /><span><small>Time</small><strong>{formatTime(event.startsAt)}–{formatTime(event.endsAt)}</strong></span></div>
                        <div>
                            <MapPin />
                            <span>
                                <small>Location</small>
                                <strong>{location[0] || 'Location announced soon'}</strong>
                                {location.slice(1).map((part) => <em key={part}>{part}</em>)}
                            </span>
                        </div>
                        <div><Users /><span><small>Registration group</small><strong>Up to {event.maxParticipantsPerOrder} participants</strong></span></div>
                        <div><ShieldCheck /><span><small>Waiver</small><strong>{event.waiverRequired ? 'Verified coverage required' : 'No event waiver required'}</strong></span></div>
                    </div>

                    {information.length > 0 && (
                        <section className="offering-detail-information">
                            <div>
                                <p className="eyebrow">Before you register</p>
                                <h2>Everything you need to know</h2>
                            </div>
                            <dl>
                                {information.map(([label, value]) => (
                                    <div key={label}>
                                        <dt>{label}</dt>
                                        <dd>{value}</dd>
                                    </div>
                                ))}
                            </dl>
                        </section>
                    )}

                    <footer className="offering-detail-actions">
                        {canRegister ? (
                            <Link className="button" to={`/events/${encodeURIComponent(event.id)}/register`}>
                                <TicketCheck size={17} /> Register for this event
                            </Link>
                        ) : (
                            <button className="button" type="button" disabled>
                                <TicketCheck size={17} /> {registrationLabel(event.registrationState)}
                            </button>
                        )}
                        <Link className="button button--dark-ghost" to="/events">Choose another event</Link>
                    </footer>
                </article>
            </div>
        </section>
    );
}
