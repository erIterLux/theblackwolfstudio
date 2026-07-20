import {
  ArrowLeft,
  CalendarDays,
  CircleDollarSign,
  MapPin,
  Plus,
  RefreshCw,
  Save,
  ShieldAlert,
  ShieldCheck,
  UserCheck,
  Users,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import useStudioRole from '../hooks/useStudioRole';
import { listEventsAdmin, saveEvent } from '../services/events';

function toLocalInput(value) {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.valueOf())) return '';
  const offset = date.getTimezoneOffset() * 60 * 1000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function fromLocalInput(value) {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? '' : date.toISOString();
}

function dollars(cents) {
  return cents ? (Number(cents) / 100).toFixed(2) : '';
}

function cents(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.round(number * 100) : 0;
}

function emptyEvent() {
  const start = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  start.setHours(10, 0, 0, 0);
  const end = new Date(start.getTime() + 2 * 60 * 60 * 1000);
  return {
    id: '',
    title: '',
    shortDescription: '',
    longDescription: '',
    status: 'draft',
    startsAt: toLocalInput(start),
    endsAt: toLocalInput(end),
    registrationOpensAt: toLocalInput(new Date()),
    registrationClosesAt: toLocalInput(start),
    timezone: 'America/New_York',
    locationType: 'in_person',
    locationName: '',
    locationAddress: '',
    onlineUrl: '',
    capacity: 20,
    maxParticipantsPerOrder: 6,
    price: '',
    currency: 'usd',
    memberDiscountEligible: true,
    waiverRequired: true,
  };
}

function toDraft(event) {
  return {
    id: event.id,
    title: event.title || '',
    shortDescription: event.shortDescription || '',
    longDescription: event.longDescription || '',
    status: event.status || 'draft',
    startsAt: toLocalInput(event.startsAt),
    endsAt: toLocalInput(event.endsAt),
    registrationOpensAt: toLocalInput(event.registrationOpensAt),
    registrationClosesAt: toLocalInput(event.registrationClosesAt),
    timezone: event.timezone || 'America/New_York',
    locationType: event.location?.type || 'in_person',
    locationName: event.location?.name || '',
    locationAddress: event.location?.address || '',
    onlineUrl: event.location?.onlineUrl || '',
    capacity: Number(event.capacity || 20),
    maxParticipantsPerOrder: Number(event.maxParticipantsPerOrder || 6),
    price: dollars(event.pricePerParticipantCents),
    currency: event.currency || 'usd',
    memberDiscountEligible: event.memberDiscountEligible !== false,
    waiverRequired: event.waiverRequired !== false,
  };
}

function formatDate(value) {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.valueOf())) return '';
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function readable(value) {
  return String(value || '').replaceAll('_', ' ');
}

export default function InstructorEventsAdmin() {
  const { isInstructor, loading: roleLoading, error: roleError, refresh: refreshRole } = useStudioRole();
  const [events, setEvents] = useState([]);
  const [registrations, setRegistrations] = useState([]);
  const [draft, setDraft] = useState(emptyEvent);
  const [selectedEventId, setSelectedEventId] = useState('');
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  const load = useCallback(async () => {
    if (!isInstructor) return;
    setLoading(true);
    setMessage('');
    try {
      const result = await listEventsAdmin();
      setEvents(result?.events || []);
      setRegistrations(result?.registrations || []);
    } catch (error) {
      console.error(error);
      setMessage(error?.message || 'Events could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, [isInstructor]);

  useEffect(() => {
    queueMicrotask(() => load());
  }, [load]);

  const selectedRegistrations = useMemo(
    () => registrations.filter((registration) => registration.eventId === selectedEventId),
    [registrations, selectedEventId],
  );

  const updateDraft = (patch) => setDraft((current) => ({ ...current, ...patch }));

  const save = async (submitEvent) => {
    submitEvent.preventDefault();
    setBusy(true);
    setMessage('');
    try {
      const result = await saveEvent({
        eventId: draft.id || undefined,
        title: draft.title,
        shortDescription: draft.shortDescription,
        longDescription: draft.longDescription,
        status: draft.status,
        startsAt: fromLocalInput(draft.startsAt),
        endsAt: fromLocalInput(draft.endsAt),
        registrationOpensAt: fromLocalInput(draft.registrationOpensAt),
        registrationClosesAt: fromLocalInput(draft.registrationClosesAt),
        timezone: draft.timezone,
        location: {
          type: draft.locationType,
          name: draft.locationName,
          address: draft.locationAddress,
          onlineUrl: draft.onlineUrl,
        },
        capacity: draft.capacity,
        maxParticipantsPerOrder: draft.maxParticipantsPerOrder,
        pricePerParticipantCents: cents(draft.price),
        currency: draft.currency,
        memberDiscountEligible: draft.memberDiscountEligible,
        waiverRequired: draft.waiverRequired,
      });
      await load();
      const eventId = result?.eventId || draft.id;
      setSelectedEventId(eventId);
      setMessage('Event saved.');
      const updated = (await listEventsAdmin()).events?.find((event) => event.id === eventId);
      if (updated) setDraft(toDraft(updated));
    } catch (error) {
      console.error(error);
      setMessage(error?.message || 'The event could not be saved.');
    } finally {
      setBusy(false);
    }
  };

  if (roleLoading) return <div className="page-loader">Verifying instructor access…</div>;
  if (!isInstructor) {
    return (
      <section className="section section--light">
        <div className="container role-gate">
          <ShieldAlert size={42} />
          <h1>Instructor access required</h1>
          <p>{roleError || 'This area is available to instructors and administrators.'}</p>
          <button className="button" type="button" onClick={refreshRole}>Check access again</button>
        </div>
      </section>
    );
  }

  return (
    <section className="instructor-admin-page events-admin-page">
      <div className="container">
        <div className="admin-page-heading">
          <div>
            <Link className="text-link" to="/member"><ArrowLeft size={17} /> Member home</Link>
            <p className="eyebrow">Instructor tools</p>
            <h1>Events and registration</h1>
            <p>Create events and track every paid participant separately. Waiver signing and check-in remain distinct states.</p>
          </div>
          <button className="button button--dark-ghost" type="button" onClick={load} disabled={loading}>
            <RefreshCw size={17} /> Refresh
          </button>
        </div>

        {message && <p className="form-status">{message}</p>}

        <div className="events-admin-layout">
          <aside className="events-admin-list">
            <div className="events-admin-panel-heading">
              <div><CalendarDays /><h2>Events</h2></div>
              <button
                type="button"
                className="text-link"
                onClick={() => {
                  setDraft(emptyEvent());
                  setSelectedEventId('');
                }}
              >
                <Plus size={16} /> New
              </button>
            </div>
            {events.map((event) => (
              <button
                type="button"
                key={event.id}
                className={draft.id === event.id ? 'is-active' : ''}
                onClick={() => {
                  setDraft(toDraft(event));
                  setSelectedEventId(event.id);
                }}
              >
                <strong>{event.title}</strong>
                <span>{formatDate(event.startsAt)}</span>
                <small>{event.registeredSeats || 0}/{event.capacity} registered · {readable(event.registrationState)}</small>
              </button>
            ))}
            {!events.length && !loading && <p>No events created yet.</p>}
          </aside>

          <form className="events-admin-editor" onSubmit={save}>
            <div className="events-admin-panel-heading">
              <div><CalendarDays /><h2>{draft.id ? 'Edit event' : 'New event'}</h2></div>
            </div>

            <label>
              Event title
              <input required value={draft.title} onChange={(event) => updateDraft({ title: event.target.value })} />
            </label>
            <label>
              Short description
              <textarea required rows="3" value={draft.shortDescription} onChange={(event) => updateDraft({ shortDescription: event.target.value })} />
            </label>
            <label>
              Full description <span className="optional-label">optional</span>
              <textarea rows="5" value={draft.longDescription} onChange={(event) => updateDraft({ longDescription: event.target.value })} />
            </label>

            <div className="form-row">
              <label>Starts<input required type="datetime-local" value={draft.startsAt} onChange={(event) => updateDraft({ startsAt: event.target.value })} /></label>
              <label>Ends<input required type="datetime-local" value={draft.endsAt} onChange={(event) => updateDraft({ endsAt: event.target.value })} /></label>
            </div>
            <div className="form-row">
              <label>Registration opens<input required type="datetime-local" value={draft.registrationOpensAt} onChange={(event) => updateDraft({ registrationOpensAt: event.target.value })} /></label>
              <label>Registration closes<input required type="datetime-local" value={draft.registrationClosesAt} onChange={(event) => updateDraft({ registrationClosesAt: event.target.value })} /></label>
            </div>

            <div className="form-row form-row--three">
              <label>
                Capacity
                <input type="number" min="1" max="2000" value={draft.capacity} onChange={(event) => updateDraft({ capacity: event.target.value })} />
              </label>
              <label>
                Max per purchase
                <input type="number" min="1" max="12" value={draft.maxParticipantsPerOrder} onChange={(event) => updateDraft({ maxParticipantsPerOrder: event.target.value })} />
              </label>
              <label>
                Price per person ($)
                <input required inputMode="decimal" value={draft.price} onChange={(event) => updateDraft({ price: event.target.value })} />
              </label>
            </div>

            <div className="events-admin-subheading"><MapPin /><h3>Location</h3></div>
            <div className="form-row">
              <label>
                Format
                <select value={draft.locationType} onChange={(event) => updateDraft({ locationType: event.target.value })}>
                  <option value="in_person">In person</option>
                  <option value="online">Online</option>
                  <option value="hybrid">Hybrid</option>
                </select>
              </label>
              <label>
                Location name
                <input value={draft.locationName} onChange={(event) => updateDraft({ locationName: event.target.value })} />
              </label>
            </div>
            <label>
              Address <span className="optional-label">optional</span>
              <input value={draft.locationAddress} onChange={(event) => updateDraft({ locationAddress: event.target.value })} />
            </label>
            {(draft.locationType === 'online' || draft.locationType === 'hybrid') && (
              <label>
                Online link <span className="optional-label">kept in the event record</span>
                <input type="url" value={draft.onlineUrl} onChange={(event) => updateDraft({ onlineUrl: event.target.value })} />
              </label>
            )}

            <div className="form-row">
              <label>
                Status
                <select value={draft.status} onChange={(event) => updateDraft({ status: event.target.value })}>
                  <option value="draft">Draft</option>
                  <option value="published">Published</option>
                  <option value="hidden">Hidden</option>
                  <option value="canceled">Canceled</option>
                  <option value="completed">Completed</option>
                  <option value="archived">Archived</option>
                </select>
              </label>
              <label>
                Time zone
                <input value={draft.timezone} onChange={(event) => updateDraft({ timezone: event.target.value })} />
              </label>
            </div>

            <label className="checkbox-row">
              <input type="checkbox" checked={draft.memberDiscountEligible} onChange={(event) => updateDraft({ memberDiscountEligible: event.target.checked })} />
              Eligible for automatic member pricing
            </label>
            <label className="checkbox-row">
              <input type="checkbox" checked={draft.waiverRequired} onChange={(event) => updateDraft({ waiverRequired: event.target.checked })} />
              Require a separate waiver for every participant
            </label>

            <button className="button" type="submit" disabled={busy}>
              <Save size={17} /> {busy ? 'Saving…' : 'Save event'}
            </button>
          </form>
        </div>

        <section className="events-admin-registrations">
          <div className="events-admin-section-heading">
            <div>
              <p className="eyebrow">Participant tracking</p>
              <h2>{selectedEventId ? 'Registrations for selected event' : 'Select an event to view registrations'}</h2>
            </div>
            {selectedEventId && <span>{selectedRegistrations.reduce((total, item) => total + Number(item.participantCount || 0), 0)} participants</span>}
          </div>

          {selectedEventId && !selectedRegistrations.length && <p>No paid registrations for this event yet.</p>}
          <div className="events-admin-registration-list">
            {selectedRegistrations.map((registration) => (
              <article key={registration.id} className="events-admin-registration-card">
                <div className="events-admin-registration-card__heading">
                  <div>
                    <strong>{registration.purchaser?.name}</strong>
                    <span>{registration.purchaser?.email}</span>
                  </div>
                  <span className="event-person-status is-confirmed">Paid and registered</span>
                </div>
                <div className="events-admin-participant-list">
                  {(registration.participants || []).map((participant) => (
                    <div key={participant.id}>
                      <div>
                        <strong>{participant.fullName}</strong>
                        <span>{participant.email}{participant.isMinor ? ` · Minor · Guardian: ${participant.guardianName}` : ''}</span>
                      </div>
                      <div>
                        <span><ShieldCheck size={15} /> {readable(participant.waiverStatus)}</span>
                        <span><UserCheck size={15} /> {readable(participant.checkInStatus)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </article>
            ))}
          </div>
        </section>
      </div>
    </section>
  );
}
