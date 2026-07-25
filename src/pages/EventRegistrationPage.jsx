import { ArrowLeft, CalendarDays } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import EventCheckoutForm from '../components/events/EventCheckoutForm';
import { getPublishedEvent } from '../services/events';

function registrationStateLabel(state) {
    if (state === 'sold_out') return 'This event is sold out.';
    if (state === 'not_open') return 'Registration for this event is not open yet.';
    return 'Registration for this event is closed.';
}

export default function EventRegistrationPage() {
    const { eventId } = useParams();
    const navigate = useNavigate();
    const [event, setEvent] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        let cancelled = false;
        queueMicrotask(() => {
            if (!cancelled) {
                setEvent(null);
                setLoading(true);
                setError('');
            }
        });

        getPublishedEvent(eventId)
            .then((result) => {
                if (!cancelled) setEvent(result?.event || null);
            })
            .catch((nextError) => {
                if (!cancelled) {
                    console.error(nextError);
                    setError(
                        nextError?.code === 'functions/not-found'
                            ? 'This event is no longer available for registration.'
                            : nextError?.message || 'The event registration page could not be loaded.',
                    );
                }
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });

        return () => {
            cancelled = true;
        };
    }, [eventId]);

    return (
        <section className="section section--light event-registration-page">
            <div className="container event-registration-page__inner">
                <Link className="text-link event-registration-page__back" to="/events">
                    <ArrowLeft size={17} /> All events
                </Link>

                {loading && <p className="page-loader">Loading event registration…</p>}

                {!loading && error && (
                    <article className="empty-state-card event-registration-page__state">
                        <CalendarDays size={38} aria-hidden="true" />
                        <h1>Registration unavailable</h1>
                        <p>{error}</p>
                        <Link className="button" to="/events">View upcoming events</Link>
                    </article>
                )}

                {!loading && !error && event && (
                    event.registrationState === 'open' ? (
                        <EventCheckoutForm
                            event={event}
                            onCancel={() => navigate('/events')}
                        />
                    ) : (
                        <article className="empty-state-card event-registration-page__state">
                            <CalendarDays size={38} aria-hidden="true" />
                            <p className="eyebrow">Event registration</p>
                            <h1>{event.title}</h1>
                            <p>{registrationStateLabel(event.registrationState)}</p>
                            <Link className="button" to="/events">View upcoming events</Link>
                        </article>
                    )
                )}
            </div>
        </section>
    );
}
