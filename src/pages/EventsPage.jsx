import {
  CalendarDays,
  Clock3,
  MapPin,
  ShieldCheck,
  TicketCheck,
  Users,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import EventCheckoutForm from '../components/events/EventCheckoutForm';
import SectionHeading from '../components/SectionHeading';
import { listPublishedEvents } from '../services/events';

function formatEventDate(value) {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.valueOf())) return '';
  return date.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatEventTime(value) {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.valueOf())) return '';
  return date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  });
}

function formatMoney(cents, currency = 'usd') {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: String(currency || 'usd').toUpperCase(),
    maximumFractionDigits: 0,
  }).format(Number(cents || 0) / 100);
}

function registrationLabel(event) {
  if (event.registrationState === 'open') return 'Registration open';
  if (event.registrationState === 'sold_out') return 'Sold out';
  if (event.registrationState === 'not_open') return 'Registration opens soon';
  return 'Registration closed';
}

export default function EventsPage() {
  const [searchParams] = useSearchParams();
  const [events, setEvents] = useState([]);
  const [selectedEventId, setSelectedEventId] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    listPublishedEvents()
      .then((result) => {
        if (!cancelled) setEvents(result?.events || []);
      })
      .catch((nextError) => {
        if (!cancelled) {
          console.error(nextError);
          setError(nextError?.message || 'Upcoming events could not be loaded.');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const selectedEvent = useMemo(
    () => events.find((event) => event.id === selectedEventId) || null,
    [events, selectedEventId],
  );
  const canceled = searchParams.get('purchase') === 'canceled';

  return (
    <>
      <section className="page-hero page-hero--compact events-hero">
        <div className="container page-hero__inner">
          <p className="eyebrow eyebrow--light">Events and workshops</p>
          <h1>Focused training experiences throughout the year.</h1>
          <p>
            Register for practical workshops, special-topic training, and
            community events. Membership is not required.
          </p>
        </div>
      </section>

      <section className="section section--light events-page">
        <div className="container">
          {canceled && (
            <div className="commerce-notice" role="status">
              Checkout was canceled. No payment was completed and no event spots were registered.
            </div>
          )}

          {!selectedEvent && (
            <>
              <SectionHeading
                eyebrow="Upcoming events"
                title="Choose an event and register each participant."
                body="One person may pay for a group, but every attendee is tracked separately and will complete an event-specific waiver before check-in."
              />

              {loading && <p className="page-loader">Loading upcoming events…</p>}
              {error && <p className="form-status form-status--error">{error}</p>}

              {!loading && !error && !events.length && (
                <article className="empty-state-card">
                  <CalendarDays size={38} aria-hidden="true" />
                  <h2>No upcoming events are published yet.</h2>
                  <p>New workshops and special training dates will appear here.</p>
                </article>
              )}

              <div className="event-card-grid">
                {events.map((event) => {
                  const canRegister = event.registrationState === 'open';
                  return (
                    <article className="event-card" key={event.id}>
                      <div className="event-card__status-row">
                        <span className={`event-state is-${event.registrationState}`}>
                          {registrationLabel(event)}
                        </span>
                        {event.remainingSeats != null && (
                          <span>{event.remainingSeats} spot{event.remainingSeats === 1 ? '' : 's'} left</span>
                        )}
                      </div>

                      <div>
                        <p className="eyebrow">{formatEventDate(event.startsAt)}</p>
                        <h2>{event.title}</h2>
                        <p>{event.shortDescription}</p>
                      </div>

                      <div className="event-card__details">
                        <span><Clock3 size={17} /> {formatEventTime(event.startsAt)}–{formatEventTime(event.endsAt)}</span>
                        <span><MapPin size={17} /> {event.location?.name || event.location?.address || 'Location announced soon'}</span>
                        <span><Users size={17} /> Up to {event.maxParticipantsPerOrder} people per registration</span>
                        <span><ShieldCheck size={17} /> Separate waiver required for each participant</span>
                      </div>

                      <div className="event-card__footer">
                        <div>
                          <span>Per participant</span>
                          <strong>{formatMoney(event.pricePerParticipantCents, event.currency)}</strong>
                        </div>
                        <button
                          className="button"
                          type="button"
                          disabled={!canRegister}
                          onClick={() => setSelectedEventId(event.id)}
                        >
                          <TicketCheck size={17} /> {canRegister ? 'Register' : registrationLabel(event)}
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>
            </>
          )}

          {selectedEvent && (
            <EventCheckoutForm
              event={selectedEvent}
              onCancel={() => setSelectedEventId('')}
            />
          )}
        </div>
      </section>
    </>
  );
}
