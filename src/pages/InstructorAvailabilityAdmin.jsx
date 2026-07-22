import {
    ArrowLeft,
    Ban,
    CalendarDays,
    Clock3,
    Plus,
    Save,
    Trash2,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import useStudioRole from '../hooks/useStudioRole';
import {
    deleteInstructorAvailabilityOverride,
    getMyInstructorAvailability,
    saveInstructorAvailabilityOverride,
    saveMyInstructorAvailability,
} from '../services/privateTraining';

const DAYS = [
    ['1', 'Monday'],
    ['2', 'Tuesday'],
    ['3', 'Wednesday'],
    ['4', 'Thursday'],
    ['5', 'Friday'],
    ['6', 'Saturday'],
    ['0', 'Sunday'],
];

const EMPTY_WEEKLY = Object.fromEntries(DAYS.map(([key]) => [key, []]));
const DURATIONS = [30, 45, 60, 75, 90, 120];

const DEFAULT_DRAFT = {
    displayName: '',
    email: '',
    active: true,
    timezone: 'America/New_York',
    requiresApproval: false,
    minNoticeHours: 12,
    maxAdvanceDays: 60,
    bufferMinutes: 15,
    cancellationNoticeHours: 24,
    lateCancellationConsumesCredit: true,
    defaultLocationType: 'in_person',
    defaultLocation: '',
    remoteInstructions: '',
    supportedDurations: [60],
    weekly: EMPTY_WEEKLY,
};

function normalizeDraft(availability = {}) {
    return {
        ...DEFAULT_DRAFT,
        ...availability,
        weekly: Object.fromEntries(DAYS.map(([key]) => [
            key,
            Array.isArray(availability.weekly?.[key])
                ? availability.weekly[key]
                : [],
        ])),
        supportedDurations: availability.supportedDurations?.length
            ? availability.supportedDurations
            : [60],
    };
}

function todayKey() {
    return new Date().toISOString().slice(0, 10);
}

export default function InstructorAvailabilityAdmin() {
    const { isInstructor, loading: roleLoading, error: roleError } = useStudioRole();
    const [draft, setDraft] = useState(DEFAULT_DRAFT);
    const [overrides, setOverrides] = useState([]);
    const [overrideDraft, setOverrideDraft] = useState({
        dateKey: todayKey(),
        mode: 'blocked',
        windows: [{ start: '09:00', end: '12:00' }],
        note: '',
    });
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState('');
    const [message, setMessage] = useState('');

    const load = useCallback(async () => {
        setLoading(true);
        setMessage('');
        try {
            const result = await getMyInstructorAvailability();
            setDraft(normalizeDraft(result?.availability));
            setOverrides(result?.overrides || []);
        } catch (error) {
            console.error(error);
            setMessage(error?.message || 'Availability could not be loaded.');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        if (isInstructor) queueMicrotask(load);
    }, [isInstructor, load]);

    const activeDays = useMemo(
        () => DAYS.filter(([key]) => draft.weekly[key]?.length).length,
        [draft.weekly],
    );

    const updateWindow = (dayKey, index, patch) => {
        setDraft((current) => ({
            ...current,
            weekly: {
                ...current.weekly,
                [dayKey]: current.weekly[dayKey].map((window, windowIndex) => (
                    windowIndex === index ? { ...window, ...patch } : window
                )),
            },
        }));
    };

    const addWindow = (dayKey) => {
        setDraft((current) => ({
            ...current,
            weekly: {
                ...current.weekly,
                [dayKey]: [...current.weekly[dayKey], { start: '17:00', end: '20:00' }],
            },
        }));
    };

    const removeWindow = (dayKey, index) => {
        setDraft((current) => ({
            ...current,
            weekly: {
                ...current.weekly,
                [dayKey]: current.weekly[dayKey].filter((_, windowIndex) => windowIndex !== index),
            },
        }));
    };

    const toggleDuration = (duration) => {
        setDraft((current) => {
            const selected = current.supportedDurations.includes(duration);
            const supportedDurations = selected
                ? current.supportedDurations.filter((value) => value !== duration)
                : [...current.supportedDurations, duration].sort((left, right) => left - right);
            return {
                ...current,
                supportedDurations: supportedDurations.length ? supportedDurations : [60],
            };
        });
    };

    const saveAvailability = async (event) => {
        event.preventDefault();
        setBusy('availability');
        setMessage('');
        try {
            await saveMyInstructorAvailability(draft);
            setMessage(
                draft.active
                    ? 'Instructor availability saved and published.'
                    : 'Instructor availability saved, but online booking remains paused.',
            );
            await load();
        } catch (error) {
            console.error(error);
            setMessage(error?.message || 'Availability could not be saved.');
        } finally {
            setBusy('');
        }
    };

    const saveOverride = async (event) => {
        event.preventDefault();
        setBusy('override');
        setMessage('');
        try {
            await saveInstructorAvailabilityOverride(overrideDraft);
            setMessage('Date override saved.');
            await load();
        } catch (error) {
            console.error(error);
            setMessage(error?.message || 'The date override could not be saved.');
        } finally {
            setBusy('');
        }
    };

    const removeOverride = async (dateKey) => {
        setBusy(`delete-${dateKey}`);
        setMessage('');
        try {
            await deleteInstructorAvailabilityOverride(dateKey);
            setMessage('Date override removed.');
            await load();
        } catch (error) {
            console.error(error);
            setMessage(error?.message || 'The date override could not be removed.');
        } finally {
            setBusy('');
        }
    };

    if (roleLoading || loading) return <p className="page-loader">Loading availability…</p>;
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
                        <p className="eyebrow">Instructor availability</p>
                        <h1>Control when private sessions can be booked.</h1>
                        <p>
                            Weekly hours create the normal schedule. Date overrides block a
                            day or replace its hours for a specific date.
                        </p>
                    </div>
                    <Link className="button button--ghost-light" to="/instructor/private-training/calendar">
                        Open booking calendar
                    </Link>
                </div>

                {message && (
                    <p className={`form-status ${message.includes('saved') || message.includes('removed') ? 'form-status--success' : 'form-status--error'}`}>
                        {message}
                    </p>
                )}

                <div className="availability-summary">
                    <div><strong>{activeDays}</strong><span>weekly days open</span></div>
                    <div><strong>{draft.minNoticeHours}</strong><span>hours minimum notice</span></div>
                    <div><strong>{draft.bufferMinutes}</strong><span>minutes between sessions</span></div>
                    <div><strong>{draft.cancellationNoticeHours}</strong><span>hours cancellation notice</span></div>
                </div>

                <div className={`availability-publish-status ${draft.active ? 'is-live' : 'is-paused'}`}>
                    <div>
                        <strong>{draft.active ? 'Online booking is active' : 'Online booking is paused'}</strong>
                        <span>
                            {activeDays
                                ? `${activeDays} recurring day${activeDays === 1 ? '' : 's'} configured.`
                                : 'No recurring days are configured.'}
                        </span>
                    </div>
                    <div>
                        <strong>Online session lengths</strong>
                        <span>{draft.supportedDurations.map((duration) => `${duration} min`).join(', ')}</span>
                    </div>
                </div>

                <form className="availability-editor" onSubmit={saveAvailability}>
                    <section className="booking-panel">
                        <div className="booking-panel__heading">
                            <Clock3 aria-hidden="true" />
                            <div>
                                <p className="eyebrow">Booking rules</p>
                                <h2>Availability settings</h2>
                            </div>
                        </div>

                        <div className="form-row form-row--three">
                            <label>
                                Instructor display name
                                <input
                                    required
                                    value={draft.displayName}
                                    onChange={(event) => setDraft((current) => ({ ...current, displayName: event.target.value }))}
                                />
                            </label>
                            <label>
                                Instructor email
                                <input
                                    type="email"
                                    value={draft.email || ''}
                                    onChange={(event) => setDraft((current) => ({ ...current, email: event.target.value }))}
                                />
                            </label>
                            <label>
                                Time zone
                                <input
                                    value={draft.timezone}
                                    onChange={(event) => setDraft((current) => ({ ...current, timezone: event.target.value }))}
                                />
                            </label>
                        </div>

                        <div className="form-row form-row--three">
                            <label>
                                Minimum notice (hours)
                                <input
                                    type="number"
                                    min="0"
                                    max="168"
                                    value={draft.minNoticeHours}
                                    onChange={(event) => setDraft((current) => ({ ...current, minNoticeHours: Number(event.target.value) }))}
                                />
                            </label>
                            <label>
                                Book up to (days ahead)
                                <input
                                    type="number"
                                    min="1"
                                    max="365"
                                    value={draft.maxAdvanceDays}
                                    onChange={(event) => setDraft((current) => ({ ...current, maxAdvanceDays: Number(event.target.value) }))}
                                />
                            </label>
                            <label>
                                Buffer between sessions
                                <input
                                    type="number"
                                    min="0"
                                    max="120"
                                    step="5"
                                    value={draft.bufferMinutes}
                                    onChange={(event) => setDraft((current) => ({ ...current, bufferMinutes: Number(event.target.value) }))}
                                />
                            </label>
                        </div>

                        <div className="form-row form-row--three">
                            <label>
                                Cancellation notice (hours)
                                <input
                                    type="number"
                                    min="0"
                                    max="336"
                                    value={draft.cancellationNoticeHours}
                                    onChange={(event) => setDraft((current) => ({ ...current, cancellationNoticeHours: Number(event.target.value) }))}
                                />
                            </label>
                            <label>
                                Default location type
                                <select
                                    value={draft.defaultLocationType}
                                    onChange={(event) => setDraft((current) => ({ ...current, defaultLocationType: event.target.value }))}
                                >
                                    <option value="in_person">In person</option>
                                    <option value="remote">Remote</option>
                                    <option value="client_location">Client location</option>
                                </select>
                            </label>
                            <label>
                                Default location
                                <input
                                    value={draft.defaultLocation}
                                    onChange={(event) => setDraft((current) => ({ ...current, defaultLocation: event.target.value }))}
                                    placeholder="Address or location note"
                                />
                            </label>
                        </div>

                        <label>
                            Remote-session instructions
                            <textarea
                                rows="3"
                                value={draft.remoteInstructions}
                                onChange={(event) => setDraft((current) => ({ ...current, remoteInstructions: event.target.value }))}
                                placeholder="Meeting details or when the link will be sent"
                            />
                        </label>

                        <fieldset className="duration-options">
                            <legend>Session durations offered</legend>
                            <div>
                                {DURATIONS.map((duration) => (
                                    <label className="checkbox-row" key={duration}>
                                        <input
                                            type="checkbox"
                                            checked={draft.supportedDurations.includes(duration)}
                                            onChange={() => toggleDuration(duration)}
                                        />
                                        {duration} minutes
                                    </label>
                                ))}
                            </div>
                        </fieldset>

                        <div className="availability-toggles">
                            <label className="checkbox-row">
                                <input
                                    type="checkbox"
                                    checked={draft.active}
                                    onChange={(event) => setDraft((current) => ({ ...current, active: event.target.checked }))}
                                />
                                Accept new private-training bookings
                            </label>
                            <label className="checkbox-row">
                                <input
                                    type="checkbox"
                                    checked={draft.requiresApproval}
                                    onChange={(event) => setDraft((current) => ({ ...current, requiresApproval: event.target.checked }))}
                                />
                                Require instructor confirmation before the booking is final
                            </label>
                            <label className="checkbox-row">
                                <input
                                    type="checkbox"
                                    checked={draft.lateCancellationConsumesCredit}
                                    onChange={(event) => setDraft((current) => ({ ...current, lateCancellationConsumesCredit: event.target.checked }))}
                                />
                                Use one credit for late cancellations
                            </label>
                        </div>
                    </section>

                    <section className="booking-panel">
                        <div className="booking-panel__heading">
                            <CalendarDays aria-hidden="true" />
                            <div>
                                <p className="eyebrow">Weekly schedule</p>
                                <h2>Recurring hours</h2>
                            </div>
                        </div>

                        <div className="weekly-availability-list">
                            {DAYS.map(([dayKey, label]) => (
                                <article className="weekly-availability-row" key={dayKey}>
                                    <div>
                                        <strong>{label}</strong>
                                        <span>{draft.weekly[dayKey].length ? 'Available' : 'Closed'}</span>
                                    </div>
                                    <div className="weekly-window-list">
                                        {draft.weekly[dayKey].map((window, index) => (
                                            <div className="weekly-window" key={`${dayKey}-${index}`}>
                                                <input
                                                    aria-label={`${label} start time`}
                                                    type="time"
                                                    value={window.start}
                                                    onChange={(event) => updateWindow(dayKey, index, { start: event.target.value })}
                                                />
                                                <span>to</span>
                                                <input
                                                    aria-label={`${label} end time`}
                                                    type="time"
                                                    value={window.end}
                                                    onChange={(event) => updateWindow(dayKey, index, { end: event.target.value })}
                                                />
                                                <button
                                                    type="button"
                                                    className="icon-button"
                                                    onClick={() => removeWindow(dayKey, index)}
                                                    aria-label={`Remove ${label} availability window`}
                                                >
                                                    <Trash2 size={17} />
                                                </button>
                                            </div>
                                        ))}
                                        <button type="button" className="text-link" onClick={() => addWindow(dayKey)}>
                                            <Plus size={16} /> Add hours
                                        </button>
                                    </div>
                                </article>
                            ))}
                        </div>
                    </section>

                    <button className="button" type="submit" disabled={busy === 'availability'}>
                        <Save size={17} /> {busy === 'availability' ? 'Saving…' : 'Save availability'}
                    </button>
                </form>

                <section className="booking-panel availability-overrides-panel">
                    <div className="booking-panel__heading">
                        <Ban aria-hidden="true" />
                        <div>
                            <p className="eyebrow">Specific dates</p>
                            <h2>Blocked days and special hours</h2>
                        </div>
                    </div>

                    <form className="override-form" onSubmit={saveOverride}>
                        <div className="form-row form-row--three">
                            <label>
                                Date
                                <input
                                    required
                                    type="date"
                                    value={overrideDraft.dateKey}
                                    onChange={(event) => setOverrideDraft((current) => ({ ...current, dateKey: event.target.value }))}
                                />
                            </label>
                            <label>
                                Override type
                                <select
                                    value={overrideDraft.mode}
                                    onChange={(event) => setOverrideDraft((current) => ({ ...current, mode: event.target.value }))}
                                >
                                    <option value="blocked">Unavailable all day</option>
                                    <option value="available">Use special hours</option>
                                </select>
                            </label>
                            <label>
                                Note
                                <input
                                    value={overrideDraft.note}
                                    onChange={(event) => setOverrideDraft((current) => ({ ...current, note: event.target.value }))}
                                    placeholder="Optional internal note"
                                />
                            </label>
                        </div>

                        {overrideDraft.mode === 'available' && (
                            <div className="weekly-window">
                                <input
                                    type="time"
                                    value={overrideDraft.windows[0]?.start || '09:00'}
                                    onChange={(event) => setOverrideDraft((current) => ({
                                        ...current,
                                        windows: [{ ...current.windows[0], start: event.target.value }],
                                    }))}
                                />
                                <span>to</span>
                                <input
                                    type="time"
                                    value={overrideDraft.windows[0]?.end || '12:00'}
                                    onChange={(event) => setOverrideDraft((current) => ({
                                        ...current,
                                        windows: [{ ...current.windows[0], end: event.target.value }],
                                    }))}
                                />
                            </div>
                        )}

                        <button className="button button--secondary" type="submit" disabled={busy === 'override'}>
                            {busy === 'override' ? 'Saving…' : 'Save date override'}
                        </button>
                    </form>

                    <div className="override-list">
                        {overrides.length ? overrides.map((override) => (
                            <article key={override.dateKey}>
                                <div>
                                    <strong>{new Date(`${override.dateKey}T12:00:00`).toLocaleDateString('en-US', {
                                        weekday: 'short',
                                        month: 'short',
                                        day: 'numeric',
                                        year: 'numeric',
                                    })}</strong>
                                    <span>{override.mode === 'blocked' ? 'Unavailable' : 'Special hours'}</span>
                                    {override.mode === 'available' && (
                                        <small>{(override.windows || []).map((window) => `${window.start}–${window.end}`).join(', ')}</small>
                                    )}
                                </div>
                                <button
                                    type="button"
                                    className="icon-button"
                                    onClick={() => removeOverride(override.dateKey)}
                                    disabled={busy === `delete-${override.dateKey}`}
                                    aria-label={`Remove override for ${override.dateKey}`}
                                >
                                    <Trash2 size={17} />
                                </button>
                            </article>
                        )) : (
                            <p className="dashboard-hint">No date-specific overrides have been added.</p>
                        )}
                    </div>
                </section>
            </div>
        </section>
    );
}
