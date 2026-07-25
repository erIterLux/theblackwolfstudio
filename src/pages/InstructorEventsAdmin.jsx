import {
  AlertTriangle,
  ArrowLeft,
  CalendarCheck2,
  CalendarDays,
  ClipboardCheck,
  FileSignature,
  LayoutDashboard,
  MapPin,
  Plus,
  RefreshCw,
  Search,
  Settings,
  ShieldAlert,
  ShieldCheck,
  Users,
} from 'lucide-react';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Link } from 'react-router-dom';
import InstructorEventEditor from '../components/events/InstructorEventEditor';
import InstructorEventParticipants from '../components/events/InstructorEventParticipants';
import { BLACK_WOLF_EVENT_WAIVER, standardBlackWolfWaiverFields } from '../config/blackWolfEventWaiver';
import useStudioRole from '../hooks/useStudioRole';
import {
  getEventAdminDetail,
  listEventsAdmin,
  saveEvent,
} from '../services/events';

const EVENT_FILTERS = [
  ['upcoming', 'Upcoming'],
  ['draft', 'Drafts & hidden'],
  ['past', 'Past & archived'],
  ['all', 'All'],
];

const WORKSPACE_VIEWS = [
  ['overview', 'Overview', LayoutDashboard],
  ['registrations', 'Registrations', Users],
  ['waivers', 'Waivers', FileSignature],
  ['settings', 'Settings', Settings],
];

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

function dollars(value) {
  if (value === null || value === undefined || value === '') return '';
  const number = Number(value);
  return Number.isFinite(number) ? (number / 100).toFixed(2) : '';
}

function cents(value) {
  if (String(value ?? '').trim() === '') return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? Math.round(number * 100) : null;
}

function localDateValue(value) {
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.valueOf()) ? date.valueOf() : null;
}

function twoHoursAfter(value) {
  const timestamp = localDateValue(value);
  return timestamp == null ? '' : toLocalInput(new Date(timestamp + 2 * 60 * 60 * 1000));
}

function validateDraft(draft) {
  const startsAt = localDateValue(draft.startsAt);
  const endsAt = localDateValue(draft.endsAt);
  const registrationOpensAt = localDateValue(draft.registrationOpensAt);
  const registrationClosesAt = localDateValue(draft.registrationClosesAt);
  const pricePerParticipantCents = cents(draft.price);

  if (startsAt == null || endsAt == null) return 'Enter valid event start and end times.';
  if (endsAt <= startsAt) return 'The event end time must be after the start time.';
  if (registrationOpensAt == null || registrationClosesAt == null) {
    return 'Enter valid registration opening and closing times.';
  }
  if (registrationOpensAt > registrationClosesAt) {
    return 'Registration must open before it closes.';
  }
  if (registrationClosesAt > startsAt) {
    return 'Registration must close by the event start time.';
  }
  if (pricePerParticipantCents == null) {
    return 'Enter a price of 0 or greater. Use 0 for a free event.';
  }
  if (draft.status === 'published') {
    if (!String(draft.waiverVersion || '').trim()) return 'Enter a waiver version before publishing.';
    if (!String(draft.waiverTitle || '').trim()) return 'Enter a waiver title before publishing.';
    if (!String(draft.waiverBody || '').trim()) return 'The Black Wolf Studio waiver text is required before publishing.';
    if (!String(draft.waiverAcknowledgement || '').trim()) return 'Enter the waiver acknowledgement before publishing.';
  }
  return '';
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
    price: '0.00',
    currency: 'usd',
    memberDiscountEligible: true,
    ageRequirement: '',
    prerequisites: '',
    cancellationPolicy: '',
    accessibilityContact: '',
    participantNotice: '',
    mediaConsentEnabled: false,
    mediaConsentText: 'I agree that the Studio may use photographs or video of this participant for Studio communications and promotion.',
    waiverRequired: true,
    alwaysRequireEventWaiver: false,
    ...standardBlackWolfWaiverFields(),
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
    capacity: event.capacity || 20,
    maxParticipantsPerOrder: event.maxParticipantsPerOrder || 6,
    price: dollars(event.pricePerParticipantCents),
    currency: event.currency || 'usd',
    memberDiscountEligible: event.memberDiscountEligible !== false,
    ageRequirement: event.ageRequirement || '',
    prerequisites: event.prerequisites || '',
    cancellationPolicy: event.cancellationPolicy || '',
    accessibilityContact: event.accessibilityContact || '',
    participantNotice: event.participantNotice || '',
    mediaConsentEnabled: event.mediaConsent?.enabled === true,
    mediaConsentText: event.mediaConsent?.text || '',
    waiverRequired: event.waiverRequired !== false,
    alwaysRequireEventWaiver: event.alwaysRequireEventWaiver === true,
    waiverVersion: event.waiver?.version || BLACK_WOLF_EVENT_WAIVER.version,
    waiverTitle: event.waiver?.title || BLACK_WOLF_EVENT_WAIVER.title,
    waiverBody: event.waiver?.body || BLACK_WOLF_EVENT_WAIVER.body,
    waiverAcknowledgement: event.waiver?.acknowledgement || BLACK_WOLF_EVENT_WAIVER.acknowledgement,
    waiverMinorAcknowledgement: event.waiver?.minorAcknowledgement || BLACK_WOLF_EVENT_WAIVER.minorAcknowledgement,
  };
}

function formatDate(value, includeTime = false) {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.valueOf())) return 'Date not set';
  return date.toLocaleString('en-US', includeTime
    ? {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      }
    : { month: 'short', day: 'numeric', year: 'numeric' });
}

function readable(value) {
  return String(value || '').replaceAll('_', ' ');
}

function eventBucket(event) {
  if (['draft', 'hidden'].includes(event.status)) return 'draft';
  if (
    ['completed', 'canceled', 'archived'].includes(event.status)
    || new Date(event.endsAt || event.startsAt || 0).valueOf() < Date.now()
  ) return 'past';
  return 'upcoming';
}

function sortEvents(events, filter) {
  return [...events].sort((left, right) => {
    const leftDate = new Date(left.startsAt || 0).valueOf();
    const rightDate = new Date(right.startsAt || 0).valueOf();
    return filter === 'past' ? rightDate - leftDate : leftDate - rightDate;
  });
}

function sameDraft(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

export default function InstructorEventsAdmin() {
  const {
    isInstructor,
    loading: roleLoading,
    error: roleError,
    refresh: refreshRole,
  } = useStudioRole();
  const initialDraft = useMemo(() => emptyEvent(), []);
  const [events, setEvents] = useState([]);
  const [draft, setDraft] = useState(initialDraft);
  const [savedDraft, setSavedDraft] = useState(initialDraft);
  const [selectedEventId, setSelectedEventId] = useState('');
  const [activeView, setActiveView] = useState('overview');
  const [eventFilter, setEventFilter] = useState('upcoming');
  const [eventQuery, setEventQuery] = useState('');
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState('');
  const [waiverOpen, setWaiverOpen] = useState(false);
  const detailRequestRef = useRef(0);

  const dirty = !sameDraft(draft, savedDraft);
  const selectedEvent = events.find((event) => event.id === selectedEventId)
    || detail?.event
    || null;

  const load = useCallback(async ({ force = false } = {}) => {
    if (!isInstructor) return [];
    setLoading(true);
    try {
      const result = await listEventsAdmin({ force });
      const nextEvents = result?.events || [];
      setEvents(nextEvents);
      return nextEvents;
    } catch (error) {
      console.error(error);
      setMessage(error?.message || 'Events could not be loaded.');
      setMessageType('error');
      return [];
    } finally {
      setLoading(false);
    }
  }, [isInstructor]);

  const loadDetail = useCallback(async (eventId) => {
    const requestId = detailRequestRef.current + 1;
    detailRequestRef.current = requestId;
    if (!eventId) {
      setDetail(null);
      return;
    }
    setDetailLoading(true);
    try {
      const result = await getEventAdminDetail(eventId);
      if (requestId !== detailRequestRef.current) return;
      setDetail(result || null);
    } catch (error) {
      if (requestId !== detailRequestRef.current) return;
      console.error(error);
      setMessage(error?.message || 'Selected-event participants could not be loaded.');
      setMessageType('error');
    } finally {
      if (requestId === detailRequestRef.current) setDetailLoading(false);
    }
  }, []);

  useEffect(() => {
    queueMicrotask(() => load());
  }, [load]);

  useEffect(() => {
    if (!dirty) return undefined;
    const preventAccidentalExit = (event) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', preventAccidentalExit);
    return () => window.removeEventListener('beforeunload', preventAccidentalExit);
  }, [dirty]);

  const confirmDiscard = () => (
    !dirty || window.confirm('Discard the unsaved event changes?')
  );

  const chooseEvent = (event) => {
    if (!confirmDiscard()) return;
    const nextDraft = toDraft(event);
    setSelectedEventId(event.id);
    setDraft(nextDraft);
    setSavedDraft(nextDraft);
    setActiveView('overview');
    setWaiverOpen(false);
    setMessage('');
    setMessageType('');
    setDetail(null);
    loadDetail(event.id);
  };

  const createEvent = () => {
    if (!confirmDiscard()) return;
    detailRequestRef.current += 1;
    const nextDraft = emptyEvent();
    setSelectedEventId('');
    setDraft(nextDraft);
    setSavedDraft(nextDraft);
    setDetail(null);
    setDetailLoading(false);
    setActiveView('settings');
    setWaiverOpen(false);
    setMessage('');
    setMessageType('');
  };

  const updateDraft = (patch) => setDraft((current) => ({ ...current, ...patch }));

  const applyStandardWaiver = () => {
    const currentBody = String(draft.waiverBody || '').trim();
    const replacingCustomWaiver = currentBody
      && currentBody !== BLACK_WOLF_EVENT_WAIVER.body.trim();
    if (
      replacingCustomWaiver
      && !window.confirm('Replace the custom waiver with the Black Wolf standard New Jersey waiver?')
    ) return;
    updateDraft(standardBlackWolfWaiverFields());
    setMessage('The standard waiver was restored. Save the event to keep it.');
    setMessageType('success');
  };

  const updateStart = (nextStart) => {
    setDraft((current) => {
      const previousStart = current.startsAt;
      const previousStartValue = localDateValue(previousStart);
      const nextStartValue = localDateValue(nextStart);
      const currentEndValue = localDateValue(current.endsAt);
      const currentCloseValue = localDateValue(current.registrationClosesAt);
      const closeFollowedStart = current.registrationClosesAt === previousStart;
      return {
        ...current,
        startsAt: nextStart,
        endsAt: nextStartValue != null
          && (currentEndValue == null || currentEndValue <= nextStartValue)
          ? twoHoursAfter(nextStart)
          : current.endsAt,
        registrationClosesAt: nextStartValue != null
          && (
            closeFollowedStart
            || previousStartValue == null
            || currentCloseValue == null
            || currentCloseValue > nextStartValue
          )
          ? nextStart
          : current.registrationClosesAt,
      };
    });
  };

  const save = async (submitEvent, statusOverride) => {
    submitEvent.preventDefault();
    const nextDraft = {
      ...draft,
      status: statusOverride || draft.status,
    };
    const validationMessage = validateDraft(nextDraft);
    if (validationMessage) {
      setMessage(validationMessage);
      setMessageType('error');
      if (validationMessage.toLowerCase().includes('waiver')) setWaiverOpen(true);
      return;
    }

    setBusy(true);
    setMessage('');
    setMessageType('');
    try {
      const result = await saveEvent({
        eventId: nextDraft.id || undefined,
        title: nextDraft.title,
        shortDescription: nextDraft.shortDescription,
        longDescription: nextDraft.longDescription,
        status: nextDraft.status,
        startsAt: fromLocalInput(nextDraft.startsAt),
        endsAt: fromLocalInput(nextDraft.endsAt),
        registrationOpensAt: fromLocalInput(nextDraft.registrationOpensAt),
        registrationClosesAt: fromLocalInput(nextDraft.registrationClosesAt),
        timezone: nextDraft.timezone,
        location: {
          type: nextDraft.locationType,
          name: nextDraft.locationName,
          address: nextDraft.locationAddress,
          onlineUrl: nextDraft.onlineUrl,
        },
        capacity: nextDraft.capacity,
        maxParticipantsPerOrder: nextDraft.maxParticipantsPerOrder,
        pricePerParticipantCents: cents(nextDraft.price),
        currency: nextDraft.currency,
        memberDiscountEligible: nextDraft.memberDiscountEligible,
        ageRequirement: nextDraft.ageRequirement,
        prerequisites: nextDraft.prerequisites,
        cancellationPolicy: nextDraft.cancellationPolicy,
        accessibilityContact: nextDraft.accessibilityContact,
        participantNotice: nextDraft.participantNotice,
        mediaConsent: {
          enabled: nextDraft.mediaConsentEnabled,
          text: nextDraft.mediaConsentText,
        },
        waiverRequired: true,
        alwaysRequireEventWaiver: nextDraft.alwaysRequireEventWaiver,
        waiver: {
          version: nextDraft.waiverVersion,
          title: nextDraft.waiverTitle,
          body: nextDraft.waiverBody,
          acknowledgement: nextDraft.waiverAcknowledgement,
          minorAcknowledgement: nextDraft.waiverMinorAcknowledgement,
        },
      });
      const eventId = result?.eventId || nextDraft.id;
      const nextEvents = await load({ force: true });
      const updated = nextEvents.find((event) => event.id === eventId);
      const saved = updated ? toDraft(updated) : { ...nextDraft, id: eventId };
      setSelectedEventId(eventId);
      setDraft(saved);
      setSavedDraft(saved);
      setActiveView('overview');
      setMessage(nextDraft.status === 'published' ? 'Event published.' : 'Event saved.');
      setMessageType('success');
      loadDetail(eventId);
    } catch (error) {
      console.error(error);
      setMessage(error?.message || 'The event could not be saved.');
      setMessageType('error');
    } finally {
      setBusy(false);
    }
  };

  const filteredEvents = useMemo(() => {
    const query = eventQuery.trim().toLowerCase();
    const matches = events.filter((event) => {
      const matchesBucket = eventFilter === 'all' || eventBucket(event) === eventFilter;
      const matchesQuery = !query || [
        event.title,
        event.location?.name,
        event.location?.address,
        event.status,
      ].filter(Boolean).join(' ').toLowerCase().includes(query);
      return matchesBucket && matchesQuery;
    });
    return sortEvents(matches, eventFilter);
  }, [eventFilter, eventQuery, events]);

  const counts = useMemo(() => ({
    upcoming: events.filter((event) => eventBucket(event) === 'upcoming').length,
    draft: events.filter((event) => eventBucket(event) === 'draft').length,
    past: events.filter((event) => eventBucket(event) === 'past').length,
    all: events.length,
  }), [events]);

  if (roleLoading) return <div className="page-loader">Verifying instructor access…</div>;
  if (!isInstructor) {
    return (
      <section className="section section--light">
        <div className="container role-gate">
          <ShieldAlert size={32} />
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
            <Link className="text-link" to="/instructor"><ArrowLeft size={17} /> Instructor overview</Link>
            <p className="eyebrow">Instructor tools</p>
            <h1>Event workspace</h1>
            <p>Choose the event first, then work in one focused activity at a time.</p>
          </div>
          <div className="events-admin-heading-actions">
            <button className="button button--dark-ghost" type="button" onClick={() => load({ force: true })} disabled={loading}>
              <RefreshCw size={17} /> Refresh
            </button>
            <button className="button" type="button" onClick={createEvent}>
              <Plus size={17} /> New event
            </button>
          </div>
        </div>

        {message && (
          <p className={`form-status${messageType === 'error' ? ' form-status--error' : ''}`}>
            {message}
          </p>
        )}

        <div className="events-admin-catalog-controls">
          <label className="events-admin-search">
            <Search size={18} aria-hidden="true" />
            <input
              type="search"
              value={eventQuery}
              onChange={(event) => setEventQuery(event.target.value)}
              placeholder="Search events or locations"
            />
          </label>
          <div className="events-admin-catalog-filters" role="group" aria-label="Event filters">
            {EVENT_FILTERS.map(([value, label]) => (
              <button
                key={value}
                type="button"
                className={eventFilter === value ? 'is-active' : ''}
                onClick={() => setEventFilter(value)}
              >
                {label} ({counts[value]})
              </button>
            ))}
          </div>
        </div>

        <div className="events-admin-workspace">
          <aside className="events-admin-list" aria-label="Event list" aria-busy={loading}>
            <div className="events-admin-panel-heading">
              <div><CalendarDays /><h2>{EVENT_FILTERS.find(([value]) => value === eventFilter)?.[1]}</h2></div>
              <span>{filteredEvents.length}</span>
            </div>
            {filteredEvents.map((event) => (
              <button
                type="button"
                key={event.id}
                className={selectedEventId === event.id ? 'is-active' : ''}
                onClick={() => chooseEvent(event)}
              >
                <span className="events-admin-list__title-row">
                  <strong>{event.title}</strong>
                  <small className={`event-state is-${event.registrationState || event.status}`}>
                    {readable(event.status)}
                  </small>
                </span>
                <span>{formatDate(event.startsAt, true)}</span>
                <small>
                  {event.registeredSeats || 0}/{event.capacity} registered ·{' '}
                  {readable(event.registrationState)}
                </small>
              </button>
            ))}
            {loading && !events.length && (
              <p className="events-admin-list__loading" role="status">Loading events…</p>
            )}
            {!filteredEvents.length && !loading && (
              <div className="events-admin-list__empty">
                <p>No events match this view.</p>
                <button className="text-link" type="button" onClick={() => {
                  setEventQuery('');
                  setEventFilter('all');
                }}>
                  Show all events
                </button>
              </div>
            )}
          </aside>

          <div className="events-admin-activity">
            {!selectedEventId && activeView !== 'settings' && (
              <article className="events-admin-select-state">
                <CalendarCheck2 size={34} aria-hidden="true" />
                <h2>Select an event</h2>
                <p>Choose an event to review registrations, waivers, or day-of check-in.</p>
                <button className="button" type="button" onClick={createEvent}>
                  <Plus size={17} /> Create a new event
                </button>
              </article>
            )}

            {activeView === 'settings' && !selectedEventId && (
              <div className="events-admin-create-heading">
                <p className="eyebrow">New event</p>
                <h2>Create event</h2>
                <p>Work through the six sections, save a draft, then publish deliberately.</p>
              </div>
            )}

            {selectedEvent && (
              <>
                <header className="events-admin-context">
                  <div>
                    <p className="eyebrow">Selected event</p>
                    <h2>{selectedEvent.title}</h2>
                    <div className="events-admin-context__meta">
                      <span><CalendarDays size={16} /> {formatDate(selectedEvent.startsAt, true)}</span>
                      <span><MapPin size={16} /> {selectedEvent.location?.name || 'Location not set'}</span>
                      <span><Users size={16} /> {selectedEvent.registeredSeats || detail?.summary?.participantCount || 0}/{selectedEvent.capacity}</span>
                      <span className={`event-state is-${selectedEvent.registrationState || selectedEvent.status}`}>
                        {readable(selectedEvent.status)} · {readable(selectedEvent.registrationState)}
                      </span>
                    </div>
                  </div>
                  {dirty && (
                    <span className="events-admin-unsaved">
                      <AlertTriangle size={16} /> Unsaved changes
                    </span>
                  )}
                </header>

                <nav className="events-admin-activity-tabs" aria-label="Selected event activities">
                  {WORKSPACE_VIEWS.map(([value, label, Icon]) => (
                    <button
                      key={value}
                      type="button"
                      className={activeView === value ? 'is-active' : ''}
                      onClick={() => setActiveView(value)}
                    >
                      <Icon size={17} aria-hidden="true" /> {label}
                    </button>
                  ))}
                  <Link
                    to={`/instructor/events/${encodeURIComponent(selectedEventId)}/check-in`}
                    onClick={(event) => {
                      if (!confirmDiscard()) event.preventDefault();
                    }}
                  >
                    <ClipboardCheck size={17} aria-hidden="true" /> Check-in
                  </Link>
                </nav>
              </>
            )}

            {selectedEvent && activeView === 'overview' && (
              <section className="events-admin-overview" aria-busy={detailLoading}>
                {detailLoading && (
                  <p className="events-admin-overview__loading" role="status">
                    Loading registration and waiver activity…
                  </p>
                )}
                <div className="events-admin-overview__metrics">
                  <article><Users /><strong>{detailLoading ? '—' : detail?.summary?.participantCount || 0}</strong><span>Participants</span></article>
                  <article><ShieldCheck /><strong>{detailLoading ? '—' : detail?.summary?.waiverCompleteCount || 0}</strong><span>Waivers complete</span></article>
                  <article><FileSignature /><strong>{detailLoading ? '—' : detail?.summary?.waiverPendingCount || 0}</strong><span>Need signatures</span></article>
                  <article><ClipboardCheck /><strong>{detailLoading ? '—' : detail?.summary?.checkedInCount || 0}</strong><span>Checked in</span></article>
                </div>
                <div className="events-admin-overview__actions">
                  <button className="ui-panel" type="button" onClick={() => setActiveView('registrations')}>
                    <Users size={22} />
                    <span><strong>Manage registrations</strong><small>Participant contacts, readiness, and purchaser context</small></span>
                  </button>
                  <button className="ui-panel" type="button" onClick={() => setActiveView('waivers')}>
                    <FileSignature size={22} />
                    <span><strong>Follow up on waivers</strong><small>Send reminders and open signed PDF records</small></span>
                  </button>
                  <Link className="ui-panel" to={`/instructor/events/${encodeURIComponent(selectedEventId)}/check-in`}>
                    <ClipboardCheck size={22} />
                    <span><strong>Open day-of check-in</strong><small>Work through ready and blocked arrivals</small></span>
                  </Link>
                </div>
              </section>
            )}

            {selectedEvent && activeView === 'registrations' && (
              <InstructorEventParticipants
                key={`${selectedEventId}-registrations`}
                registrations={detail?.registrations || []}
                loading={detailLoading}
                mode="registrations"
              />
            )}

            {selectedEvent && activeView === 'waivers' && (
              <InstructorEventParticipants
                key={`${selectedEventId}-waivers`}
                registrations={detail?.registrations || []}
                loading={detailLoading}
                mode="waivers"
              />
            )}

            {activeView === 'settings' && (
              <InstructorEventEditor
                draft={draft}
                busy={busy}
                waiverOpen={waiverOpen}
                setWaiverOpen={setWaiverOpen}
                updateDraft={updateDraft}
                updateStart={updateStart}
                applyStandardWaiver={applyStandardWaiver}
                onSubmit={save}
                onPublish={(event) => save(event, 'published')}
              />
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
