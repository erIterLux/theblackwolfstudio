import {
    ArrowLeft,
    CalendarDays,
    CircleDollarSign,
    ClipboardCheck,
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
import SignedWaiverDocumentActions from '../components/waivers/SignedWaiverDocumentActions';
import useStudioRole from '../hooks/useStudioRole';
import { BLACK_WOLF_EVENT_WAIVER, standardBlackWolfWaiverFields } from '../config/blackWolfEventWaiver';
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

function dollars(value) {
    if (value === null || value === undefined || value === '') return '';
    const number = Number(value);
    return Number.isFinite(number) ? (number / 100).toFixed(2) : '';
}

function cents(value) {
    if (String(value ?? '').trim() === '') return null;
    const number = Number(value);
    return Number.isFinite(number) && number >= 0
        ? Math.round(number * 100)
        : null;
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
    if (draft.waiverRequired && draft.status === 'published') {
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
        capacity: Number(event.capacity || 20),
        maxParticipantsPerOrder: Number(event.maxParticipantsPerOrder || 6),
        price: dollars(event.pricePerParticipantCents),
        currency: event.currency || 'usd',
        memberDiscountEligible: event.memberDiscountEligible !== false,
        ageRequirement: event.ageRequirement || '',
        prerequisites: event.prerequisites || '',
        cancellationPolicy: event.cancellationPolicy || '',
        accessibilityContact: event.accessibilityContact || '',
        participantNotice: event.participantNotice || '',
        mediaConsentEnabled: event.mediaConsent?.enabled === true,
        mediaConsentText: event.mediaConsent?.text || 'I agree that the Studio may use photographs or video of this participant for Studio communications and promotion.',
        waiverRequired: event.waiverRequired !== false,
        alwaysRequireEventWaiver: event.alwaysRequireEventWaiver === true,
        waiverVersion: event.waiver?.version || BLACK_WOLF_EVENT_WAIVER.version,
        waiverTitle: event.waiver?.title || BLACK_WOLF_EVENT_WAIVER.title,
        waiverBody: event.waiver?.body || BLACK_WOLF_EVENT_WAIVER.body,
        waiverAcknowledgement: event.waiver?.acknowledgement || BLACK_WOLF_EVENT_WAIVER.acknowledgement,
        waiverMinorAcknowledgement: event.waiver?.minorAcknowledgement || BLACK_WOLF_EVENT_WAIVER.minorAcknowledgement,
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
    const [messageType, setMessageType] = useState('');

    const load = useCallback(async ({ force = false } = {}) => {
        if (!isInstructor) return;
        setLoading(true);
        setMessage('');
        setMessageType('');
        try {
            const result = await listEventsAdmin({ force });
            setEvents(result?.events || []);
            setRegistrations(result?.registrations || []);
        } catch (error) {
            console.error(error);
            setMessage(error?.message || 'Events could not be loaded.');
            setMessageType('error');
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

    const applyStandardWaiver = () => {
        const currentBody = String(draft.waiverBody || '').trim();
        const standardBody = BLACK_WOLF_EVENT_WAIVER.body.trim();
        const replacingCustomWaiver = currentBody && currentBody !== standardBody;

        if (
            replacingCustomWaiver
            && !window.confirm(
                'Replace the current waiver fields with The Black Wolf Studio standard New Jersey waiver?',
            )
        ) {
            return;
        }

        updateDraft(standardBlackWolfWaiverFields());
        setMessage('The Black Wolf Studio standard waiver was applied. Save the event to keep it.');
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

    const save = async (submitEvent) => {
        submitEvent.preventDefault();
        const validationMessage = validateDraft(draft);
        if (validationMessage) {
            setMessage(validationMessage);
            setMessageType('error');
            return;
        }

        setBusy(true);
        setMessage('');
        setMessageType('');
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
                ageRequirement: draft.ageRequirement,
                prerequisites: draft.prerequisites,
                cancellationPolicy: draft.cancellationPolicy,
                accessibilityContact: draft.accessibilityContact,
                participantNotice: draft.participantNotice,
                mediaConsent: {
                    enabled: draft.mediaConsentEnabled,
                    text: draft.mediaConsentText,
                },
                waiverRequired: true,
                alwaysRequireEventWaiver: draft.alwaysRequireEventWaiver,
                waiver: {
                    version: draft.waiverVersion,
                    title: draft.waiverTitle,
                    body: draft.waiverBody,
                    acknowledgement: draft.waiverAcknowledgement,
                    minorAcknowledgement: draft.waiverMinorAcknowledgement,
                },
            });
            await load();
            const eventId = result?.eventId || draft.id;
            setSelectedEventId(eventId);
            setMessage(Number(draft.price) === 0 ? 'Free event saved.' : 'Event saved.');
            setMessageType('success');
            const updated = (await listEventsAdmin()).events?.find((event) => event.id === eventId);
            if (updated) setDraft(toDraft(updated));
        } catch (error) {
            console.error(error);
            setMessage(error?.message || 'The event could not be saved.');
            setMessageType('error');
        } finally {
            setBusy(false);
        }
    };

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
                        <h1>Events and registration</h1>
                        <p>Create paid or free events and track every participant separately. Waiver signing and check-in remain distinct states.</p>
                    </div>
                    <button className="button button--dark-ghost" type="button" onClick={() => load({ force: true })} disabled={loading}>
                        <RefreshCw size={17} /> Refresh
                    </button>
                </div>

                {message && (
                    <p className={`form-status${messageType === 'error' ? ' form-status--error' : ''}`}>
                        {message}
                    </p>
                )}

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
                            <label>
                                Starts
                                <input
                                    required
                                    type="datetime-local"
                                    value={draft.startsAt}
                                    onChange={(event) => updateStart(event.target.value)}
                                />
                            </label>
                            <label>
                                Ends
                                <input
                                    required
                                    type="datetime-local"
                                    min={draft.startsAt}
                                    value={draft.endsAt}
                                    onChange={(event) => updateDraft({ endsAt: event.target.value })}
                                />
                            </label>
                        </div>
                        <div className="form-row">
                            <label>
                                Registration opens
                                <input
                                    required
                                    type="datetime-local"
                                    max={draft.registrationClosesAt || draft.startsAt}
                                    value={draft.registrationOpensAt}
                                    onChange={(event) => updateDraft({ registrationOpensAt: event.target.value })}
                                />
                            </label>
                            <label>
                                Registration closes
                                <input
                                    required
                                    type="datetime-local"
                                    min={draft.registrationOpensAt}
                                    max={draft.startsAt}
                                    value={draft.registrationClosesAt}
                                    onChange={(event) => updateDraft({ registrationClosesAt: event.target.value })}
                                />
                            </label>
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
                                Price per person ($) <span className="optional-label">enter 0 for free</span>
                                <input
                                    required
                                    type="number"
                                    inputMode="decimal"
                                    min="0"
                                    step="0.01"
                                    value={draft.price}
                                    onChange={(event) => updateDraft({ price: event.target.value })}
                                />
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

                        <div className="events-admin-subheading"><Users /><h3>Participant information</h3></div>
                        <div className="form-row">
                            <label>
                                Age requirement <span className="optional-label">optional</span>
                                <input
                                    value={draft.ageRequirement}
                                    onChange={(event) => updateDraft({ ageRequirement: event.target.value })}
                                    placeholder="Example: Ages 16+"
                                />
                            </label>
                            <label>
                                Accessibility contact <span className="optional-label">optional</span>
                                <input
                                    value={draft.accessibilityContact}
                                    onChange={(event) => updateDraft({ accessibilityContact: event.target.value })}
                                    placeholder="Email or phone for accommodations"
                                />
                            </label>
                        </div>
                        <label>
                            Prerequisites or preparation <span className="optional-label">optional</span>
                            <textarea
                                rows="3"
                                value={draft.prerequisites}
                                onChange={(event) => updateDraft({ prerequisites: event.target.value })}
                            />
                        </label>
                        <label>
                            Cancellation and refund policy <span className="optional-label">recommended</span>
                            <textarea
                                rows="3"
                                value={draft.cancellationPolicy}
                                onChange={(event) => updateDraft({ cancellationPolicy: event.target.value })}
                            />
                        </label>
                        <label>
                            Participant notice <span className="optional-label">optional</span>
                            <textarea
                                rows="3"
                                value={draft.participantNotice}
                                onChange={(event) => updateDraft({ participantNotice: event.target.value })}
                                placeholder="What to bring, physical intensity, or other important details"
                            />
                        </label>
                        <label className="checkbox-row">
                            <input
                                type="checkbox"
                                checked={draft.mediaConsentEnabled}
                                onChange={(event) => updateDraft({
                                    mediaConsentEnabled: event.target.checked,
                                })}
                            />
                            Offer a separate optional photo/video consent
                        </label>
                        {draft.mediaConsentEnabled && (
                            <label>
                                Photo/video consent text
                                <textarea
                                    rows="3"
                                    value={draft.mediaConsentText}
                                    onChange={(event) => updateDraft({
                                        mediaConsentText: event.target.value,
                                    })}
                                />
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
                        <div className="events-admin-subheading"><ShieldCheck /><h3>Event waiver</h3></div>
                        <div className="event-waiver-admin-note">
                            <strong>Each participant must have verified waiver coverage.</strong>
                            <span>The approved New Jersey release is stored with an event-specific scope. Current membership waivers cover eligible events unless the override below is selected.</span>
                            <button
                                className="button button--dark-ghost"
                                type="button"
                                onClick={applyStandardWaiver}
                            >
                                <ShieldCheck size={17} /> Use Black Wolf standard waiver
                            </button>
                        </div>
                        <label className="checkbox-row">
                            <input
                                type="checkbox"
                                checked={draft.alwaysRequireEventWaiver}
                                onChange={(event) => updateDraft({
                                    alwaysRequireEventWaiver: event.target.checked,
                                })}
                            />
                            Always require this event-specific waiver, even for members
                        </label>
                        <div className="form-row">
                            <label>
                                Waiver version
                                <input
                                    required={draft.status === 'published'}
                                    value={draft.waiverVersion}
                                    onChange={(event) => updateDraft({ waiverVersion: event.target.value })}
                                    placeholder="1 or 2026-01"
                                />
                            </label>
                            <label>
                                Waiver title
                                <input
                                    required={draft.status === 'published'}
                                    value={draft.waiverTitle}
                                    onChange={(event) => updateDraft({ waiverTitle: event.target.value })}
                                />
                            </label>
                        </div>
                        <label>
                            The Black Wolf Studio waiver text
                            <textarea
                                required={draft.status === 'published'}
                                rows="12"
                                value={draft.waiverBody}
                                onChange={(event) => updateDraft({ waiverBody: event.target.value })}
                                placeholder="The Black Wolf Studio standard waiver will appear here."
                            />
                        </label>
                        <label>
                            Adult participant acknowledgement
                            <textarea
                                required={draft.status === 'published'}
                                rows="2"
                                value={draft.waiverAcknowledgement}
                                onChange={(event) => updateDraft({ waiverAcknowledgement: event.target.value })}
                            />
                        </label>
                        <label>
                            Parent or guardian acknowledgement
                            <textarea
                                required={draft.status === 'published'}
                                rows="2"
                                value={draft.waiverMinorAcknowledgement}
                                onChange={(event) => updateDraft({ waiverMinorAcknowledgement: event.target.value })}
                            />
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
                        {selectedEventId && (
                            <div className="events-admin-section-actions">
                                <span>
                                    {selectedRegistrations.reduce(
                                        (total, item) => total + Number(item.participantCount || 0),
                                        0,
                                    )} participants
                                </span>
                                <Link
                                    className="button button--small"
                                    to={`/instructor/events/${encodeURIComponent(selectedEventId)}/check-in`}
                                >
                                    <ClipboardCheck size={16} /> Open check-in
                                </Link>
                            </div>
                        )}
                    </div>

                    {selectedEventId && !selectedRegistrations.length && <p>No registrations for this event yet.</p>}
                    <div className="events-admin-registration-list">
                        {selectedRegistrations.map((registration) => (
                            <article key={registration.id} className="events-admin-registration-card">
                                <div className="events-admin-registration-card__heading">
                                    <div>
                                        <strong>{registration.purchaser?.name}</strong>
                                        <span>{registration.purchaser?.email}</span>
                                    </div>
                                    <span className="event-person-status is-confirmed">
                                        {Number(registration.pricing?.totalCents || 0) === 0
                                            ? 'Free registration confirmed'
                                            : 'Paid and registered'}
                                    </span>
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
                                                {['signed', 'covered'].includes(participant.waiverStatus) && (
                                                    <SignedWaiverDocumentActions
                                                        scope="event"
                                                        waiverId={participant.waiverId || participant.id}
                                                        participantName={participant.fullName}
                                                        coverageSource={participant.coverageSource}
                                                    />
                                                )}
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
