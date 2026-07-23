import {
    ArrowLeft,
    Ban,
    CalendarDays,
    Clock3,
    Copy,
    Eraser,
    Eye,
    Plus,
    Save,
    Trash2,
    WandSparkles,
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

const TIMEZONES = [
    ['America/New_York', 'Eastern time'],
    ['America/Chicago', 'Central time'],
    ['America/Denver', 'Mountain time'],
    ['America/Phoenix', 'Arizona time'],
    ['America/Los_Angeles', 'Pacific time'],
    ['America/Anchorage', 'Alaska time'],
    ['Pacific/Honolulu', 'Hawaii time'],
];

function minutesFromTime(value) {
    const [hours, minutes] = String(value || '').split(':').map(Number);
    if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
    return (hours * 60) + minutes;
}

function validateAvailabilityDraft(draft) {
    const errors = [];
    const warnings = [];
    const minimumDuration = Math.min(...(draft.supportedDurations?.length ? draft.supportedDurations : [60]));

    for (const [dayKey, label] of DAYS) {
        const windows = draft.weekly?.[dayKey] || [];
        const normalized = [];
        windows.forEach((window, index) => {
            const start = minutesFromTime(window.start);
            const end = minutesFromTime(window.end);
            if (start == null || end == null || end <= start) {
                errors.push(`${label} window ${index + 1} must end after it starts.`);
                return;
            }
            normalized.push({ start, end });
            if ((end - start) < minimumDuration) {
                warnings.push(`${label} has a window shorter than the shortest enabled session (${minimumDuration} minutes).`);
            }
        });
        normalized.sort((left, right) => left.start - right.start);
        for (let index = 1; index < normalized.length; index += 1) {
            if (normalized[index].start < normalized[index - 1].end) {
                errors.push(`${label} has overlapping availability windows.`);
                break;
            }
        }
    }

    if (!draft.active) warnings.push('Online booking is paused. Members will not see any times until it is turned back on.');
    if (!Object.values(draft.weekly || {}).some((windows) => windows?.length)) {
        warnings.push('No recurring weekly hours are configured. Only special-date availability can create bookable times.');
    }

    return { errors, warnings: [...new Set(warnings)] };
}

function buildWeeklyPreview(draft) {
    const windows = Object.values(draft.weekly || {}).flat();
    const totalMinutes = windows.reduce((sum, window) => {
        const start = minutesFromTime(window.start);
        const end = minutesFromTime(window.end);
        return sum + (start != null && end != null && end > start ? end - start : 0);
    }, 0);
    const buffer = Math.max(0, Number(draft.bufferMinutes || 0));
    const durationSlots = (draft.supportedDurations || []).map((duration) => ({
        duration,
        slots: windows.reduce((sum, window) => {
            const start = minutesFromTime(window.start);
            const end = minutesFromTime(window.end);
            if (start == null || end == null || end <= start) return sum;
            return sum + Math.max(0, Math.floor(((end - start) + buffer) / (Number(duration) + buffer)));
        }, 0),
    }));
    return {
        totalHours: Math.round((totalMinutes / 60) * 10) / 10,
        windowCount: windows.length,
        durationSlots,
    };
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
    const [messageTone, setMessageTone] = useState('');
    const [savedSnapshot, setSavedSnapshot] = useState('');
    const [sourceDay, setSourceDay] = useState('1');

    const load = useCallback(async ({ force = false, preserveMessage = false } = {}) => {
        setLoading(true);
        if (!preserveMessage) setMessage('');
        try {
            const result = await getMyInstructorAvailability({ force });
            const normalized = normalizeDraft(result?.availability);
            setDraft(normalized);
            setSavedSnapshot(JSON.stringify(normalized));
            setOverrides(result?.overrides || []);
        } catch (error) {
            console.error(error);
            setMessageTone('error');
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

    const isDirty = useMemo(
        () => Boolean(savedSnapshot && JSON.stringify(draft) !== savedSnapshot),
        [draft, savedSnapshot],
    );

    const validation = useMemo(() => validateAvailabilityDraft(draft), [draft]);
    const weeklyPreview = useMemo(() => buildWeeklyPreview(draft), [draft]);

    useEffect(() => {
        const preventAccidentalExit = (event) => {
            if (!isDirty) return;
            event.preventDefault();
            event.returnValue = '';
        };
        window.addEventListener('beforeunload', preventAccidentalExit);
        return () => window.removeEventListener('beforeunload', preventAccidentalExit);
    }, [isDirty]);

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

    const copySourceSchedule = (target) => {
        const sourceWindows = draft.weekly[sourceDay] || [];
        if (!sourceWindows.length) {
            setMessageTone('error');
            setMessage('Choose a source day that already has at least one availability window.');
            return;
        }
        const targetKeys = target === 'weekdays'
            ? ['1', '2', '3', '4', '5']
            : DAYS.map(([key]) => key);
        setDraft((current) => ({
            ...current,
            weekly: {
                ...current.weekly,
                ...Object.fromEntries(targetKeys.map((key) => [
                    key,
                    sourceWindows.map((window) => ({ ...window })),
                ])),
            },
        }));
        setMessageTone('success');
        setMessage(`Copied ${DAYS.find(([key]) => key === sourceDay)?.[1] || 'the source day'} hours to ${target === 'weekdays' ? 'Monday through Friday' : 'every day'}. Save to publish the change.`);
    };

    const clearWeeklySchedule = () => {
        setDraft((current) => ({
            ...current,
            weekly: Object.fromEntries(DAYS.map(([key]) => [key, []])),
        }));
        setMessageTone('success');
        setMessage('Recurring hours cleared in this draft. Save to publish the change.');
    };

    const saveAvailability = async (event) => {
        event.preventDefault();
        const nextValidation = validateAvailabilityDraft(draft);
        if (nextValidation.errors.length) {
            setMessageTone('error');
            setMessage(nextValidation.errors[0]);
            return;
        }
        setBusy('availability');
        setMessage('');
        try {
            await saveMyInstructorAvailability(draft);
            setMessageTone('success');
            setMessage(
                draft.active
                    ? 'Instructor availability saved and published.'
                    : 'Instructor availability saved, but online booking remains paused.',
            );
            await load({ preserveMessage: true });
        } catch (error) {
            console.error(error);
            setMessageTone('error');
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
            setMessageTone('success');
            setMessage('Date override saved.');
            await load({ preserveMessage: true });
        } catch (error) {
            console.error(error);
            setMessageTone('error');
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
            setMessageTone('success');
            setMessage('Date override removed.');
            await load({ preserveMessage: true });
        } catch (error) {
            console.error(error);
            setMessageTone('error');
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
                    <p className={`form-status ${messageTone === 'success' ? 'form-status--success' : 'form-status--error'}`} role={messageTone === 'error' ? 'alert' : 'status'}>
                        {message}
                    </p>
                )}

                <div className="availability-summary">
                    <div><strong>{activeDays}</strong><span>weekly days open</span></div>
                    <div><strong>{draft.minNoticeHours}</strong><span>hours minimum notice</span></div>
                    <div><strong>{draft.bufferMinutes}</strong><span>minutes between sessions</span></div>
                    <div><strong>{draft.cancellationNoticeHours}</strong><span>hours cancellation notice</span></div>
                </div>

                <div className={`availability-edit-state ${isDirty ? 'is-dirty' : 'is-saved'}`}>
                    <div>
                        <strong>{isDirty ? 'Unsaved availability changes' : 'Availability is up to date'}</strong>
                        <span>{isDirty ? 'Review the preview and save before leaving this page.' : 'The settings below match the published schedule.'}</span>
                    </div>
                    <button className="button" type="button" onClick={saveAvailability} disabled={!isDirty || busy === 'availability' || validation.errors.length > 0}>
                        <Save size={17} /> {busy === 'availability' ? 'Saving…' : 'Save changes'}
                    </button>
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
                                <select
                                    value={draft.timezone}
                                    onChange={(event) => setDraft((current) => ({ ...current, timezone: event.target.value }))}
                                >
                                    {!TIMEZONES.some(([value]) => value === draft.timezone) && <option value={draft.timezone}>{draft.timezone}</option>}
                                    {TIMEZONES.map(([value, label]) => <option key={value} value={value}>{label} — {value}</option>)}
                                </select>
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

                        <div className="availability-shortcuts" aria-label="Recurring schedule shortcuts">
                            <div>
                                <WandSparkles aria-hidden="true" />
                                <div>
                                    <strong>Schedule shortcuts</strong>
                                    <span>Copy one configured day instead of entering the same hours repeatedly.</span>
                                </div>
                            </div>
                            <label>
                                Source day
                                <select value={sourceDay} onChange={(event) => setSourceDay(event.target.value)}>
                                    {DAYS.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
                                </select>
                            </label>
                            <button type="button" className="button button--secondary" onClick={() => copySourceSchedule('weekdays')}>
                                <Copy size={16} /> Copy to weekdays
                            </button>
                            <button type="button" className="button button--secondary" onClick={() => copySourceSchedule('all')}>
                                <Copy size={16} /> Copy to every day
                            </button>
                            <button type="button" className="button button--ghost" onClick={clearWeeklySchedule}>
                                <Eraser size={16} /> Clear recurring hours
                            </button>
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
                        <div className="availability-member-preview">
                            <div className="availability-member-preview__heading">
                                <Eye aria-hidden="true" />
                                <div>
                                    <p className="eyebrow">Member booking preview</p>
                                    <h3>What this weekly schedule can support</h3>
                                </div>
                            </div>
                            <div className="availability-preview-metrics">
                                <div><strong>{weeklyPreview.totalHours}</strong><span>open hours per week</span></div>
                                <div><strong>{weeklyPreview.windowCount}</strong><span>availability windows</span></div>
                                {weeklyPreview.durationSlots.map((item) => (
                                    <div key={item.duration}><strong>{item.slots}</strong><span>possible {item.duration}-minute starts</span></div>
                                ))}
                            </div>
                            <small>Preview counts are estimates before existing bookings, notice rules, and date overrides are applied.</small>
                        </div>

                        {!!validation.errors.length && (
                            <div className="availability-validation is-error" role="alert">
                                <strong>Fix before saving</strong>
                                <ul>{validation.errors.map((item) => <li key={item}>{item}</li>)}</ul>
                            </div>
                        )}
                        {!!validation.warnings.length && (
                            <div className="availability-validation is-warning">
                                <strong>Review these settings</strong>
                                <ul>{validation.warnings.map((item) => <li key={item}>{item}</li>)}</ul>
                            </div>
                        )}
                    </section>

                    <button className="button" type="submit" disabled={busy === 'availability' || validation.errors.length > 0 || !isDirty}>
                        <Save size={17} /> {busy === 'availability' ? 'Saving…' : isDirty ? 'Save availability' : 'Availability saved'}
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
