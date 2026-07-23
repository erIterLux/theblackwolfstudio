import {
    ArrowLeft,
    CalendarDays,
    Check,
    ChevronLeft,
    ChevronRight,
    Clock3,
    MapPin,
    RefreshCw,
    Sparkles,
    Users,
} from 'lucide-react';
import {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
} from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import usePrivateTrainingBookings from '../hooks/usePrivateTrainingBookings';
import useStudioRole from '../hooks/useStudioRole';
import usePrivateTrainingPurchases from '../hooks/usePrivateTrainingPurchases';
import {
    createPrivateTrainingBooking,
    listPrivateTrainingAvailability,
    updatePrivateTrainingBooking,
} from '../services/privateTraining';

function dateKey(value, timeZone = 'America/New_York') {
    return new Intl.DateTimeFormat('en-CA', {
        timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).format(new Date(value));
}

function formatDate(value, timeZone) {
    return new Intl.DateTimeFormat('en-US', {
        timeZone,
        weekday: 'long',
        month: 'long',
        day: 'numeric',
    }).format(new Date(value));
}

function formatShortDate(value, timeZone) {
    return new Intl.DateTimeFormat('en-US', {
        timeZone,
        weekday: 'short',
        month: 'short',
        day: 'numeric',
    }).format(new Date(value));
}

function formatTime(value, timeZone) {
    return new Intl.DateTimeFormat('en-US', {
        timeZone,
        hour: 'numeric',
        minute: '2-digit',
    }).format(new Date(value));
}

function availableCredits(purchase) {
    if (Number.isFinite(Number(purchase.availableSessions))) {
        return Number(purchase.availableSessions);
    }
    return Math.max(
        0,
        Number(purchase.remainingSessions || 0) - Number(purchase.reservedSessions || 0),
    );
}

function availabilityEmptyState(availability) {
    const state = availability?.availabilityState || {};
    const duration = Number(state.durationMinutes || availability?.purchase?.durationMinutes || 60);
    const supported = Array.isArray(state.supportedDurations)
        ? state.supportedDurations.filter((value) => Number.isFinite(Number(value)))
        : [];

    switch (state.code) {
        case 'no_saved_availability':
            return {
                title: 'Instructor availability has not been published yet.',
                message: 'Recurring hours must be saved before members can choose an online booking time.',
            };
        case 'online_booking_disabled':
            return {
                title: 'Online private-training booking is paused.',
                message: 'The recurring hours are saved, but “Accept new private-training bookings” is currently turned off.',
            };
        case 'duration_not_enabled':
            return {
                title: `${duration}-minute sessions are not enabled for online booking.`,
                message: supported.length
                    ? `This package requires ${duration} minutes. The instructor is currently offering ${supported.join(', ')}-minute sessions online.`
                    : `This package requires ${duration} minutes, but no matching session duration is currently enabled.`,
            };
        case 'hours_shorter_than_session':
            return {
                title: 'The recurring time windows are shorter than this session.',
                message: `This package requires ${duration} minutes. Add a recurring window that is at least ${duration} minutes long.`,
            };
        case 'outside_booking_window':
            return {
                title: 'The saved hours fall outside the current booking window.',
                message: 'Check the minimum-notice and maximum-advance settings, then refresh the available times.',
            };
        case 'fully_booked':
            return {
                title: 'The available hours are already reserved.',
                message: 'Every matching time in the current search period conflicts with another booking.',
            };
        case 'no_hours_in_range':
            return {
                title: 'No recurring hours fall inside the current search period.',
                message: 'Add weekly hours or a special-date availability override, then refresh the available times.',
            };
        default:
            return {
                title: 'No online times are currently available.',
                message: 'Check the instructor booking settings or try again after availability is updated.',
            };
    }
}

const STEPS = [
    { number: 1, label: 'Package' },
    { number: 2, label: 'Participants' },
    { number: 3, label: 'Time' },
    { number: 4, label: 'Review' },
];

export default function PrivateTrainingBookingPage() {
    const navigate = useNavigate();
    const { isInstructor } = useStudioRole();
    const [searchParams] = useSearchParams();
    const { bookings } = usePrivateTrainingBookings();
    const {
        activePurchases,
        loading: purchaseLoading,
        error: purchaseError,
    } = usePrivateTrainingPurchases();
    const bookingId = searchParams.get('bookingId') || '';
    const initialPurchaseId = searchParams.get('purchaseId') || '';
    const isReschedule = Boolean(bookingId);
    const [purchaseId, setPurchaseId] = useState(initialPurchaseId);
    const [participantSelection, setParticipantSelection] = useState({ purchaseId: '', ids: [] });
    const [availability, setAvailability] = useState(null);
    const [selectedDateKey, setSelectedDateKey] = useState('');
    const [selectedSlot, setSelectedSlot] = useState(null);
    const [note, setNote] = useState('');
    const [activeStep, setActiveStep] = useState(isReschedule ? 3 : 1);
    const [loadingSlots, setLoadingSlots] = useState(false);
    const [busy, setBusy] = useState(false);
    const [message, setMessage] = useState('');
    const availabilityRequestRef = useRef(0);

    const rescheduleBooking = useMemo(
        () => bookings.find((booking) => booking.id === bookingId) || null,
        [bookings, bookingId],
    );

    const bookablePurchases = useMemo(
        () => activePurchases.filter((purchase) => (
            availableCredits(purchase) > 0 || purchase.id === rescheduleBooking?.purchaseId
        )),
        [activePurchases, rescheduleBooking],
    );

    const effectivePurchaseId = rescheduleBooking?.purchaseId
        || purchaseId
        || bookablePurchases[0]?.id
        || '';

    const selectedPurchase = useMemo(
        () => bookablePurchases.find((purchase) => purchase.id === effectivePurchaseId) || null,
        [bookablePurchases, effectivePurchaseId],
    );

    const selectedParticipantIds = useMemo(() => {
        if (rescheduleBooking?.participantIds?.length) return rescheduleBooking.participantIds;
        if (!selectedPurchase) return [];
        const validIds = new Set((selectedPurchase.participants || []).map((participant) => participant.id));
        if (participantSelection.purchaseId !== selectedPurchase.id) return [...validIds];
        return participantSelection.ids.filter((id) => validIds.has(id));
    }, [participantSelection, rescheduleBooking, selectedPurchase]);

    const loadAvailability = useCallback(async ({ quiet = false } = {}) => {
        if (!effectivePurchaseId) return;
        const requestId = availabilityRequestRef.current + 1;
        availabilityRequestRef.current = requestId;
        if (!quiet) setLoadingSlots(true);
        setMessage('');
        setSelectedSlot(null);
        try {
            const result = await listPrivateTrainingAvailability({
                purchaseId: effectivePurchaseId,
                bookingId: bookingId || undefined,
            });
            if (availabilityRequestRef.current !== requestId) return;
            setAvailability(result);
        } catch (error) {
            console.error(error);
            if (availabilityRequestRef.current !== requestId) return;
            setAvailability(null);
            setMessage(error?.message || 'Available session times could not be loaded.');
        } finally {
            if (availabilityRequestRef.current === requestId) setLoadingSlots(false);
        }
    }, [bookingId, effectivePurchaseId]);

    useEffect(() => {
        if (!effectivePurchaseId) return;
        queueMicrotask(() => loadAvailability());
    }, [effectivePurchaseId, loadAvailability]);

    const groupedSlots = useMemo(() => {
        const groups = new Map();
        for (const slot of availability?.slots || []) {
            const dayKey = dateKey(slot.startsAt, slot.timezone);
            const key = `${slot.instructorUid}-${dayKey}`;
            if (!groups.has(key)) {
                groups.set(key, {
                    key,
                    dateKey: dayKey,
                    dateLabel: formatDate(slot.startsAt, slot.timezone),
                    shortDateLabel: formatShortDate(slot.startsAt, slot.timezone),
                    instructorUid: slot.instructorUid,
                    instructorName: slot.instructorName,
                    timezone: slot.timezone,
                    location: slot.location,
                    locationType: slot.locationType,
                    slots: [],
                });
            }
            groups.get(key).slots.push(slot);
        }
        return [...groups.values()];
    }, [availability]);

    const dateOptions = useMemo(() => {
        const dates = new Map();
        for (const group of groupedSlots) {
            if (!dates.has(group.dateKey)) {
                dates.set(group.dateKey, {
                    dateKey: group.dateKey,
                    label: group.shortDateLabel,
                    startsAt: group.slots[0]?.startsAt,
                    timezone: group.timezone,
                });
            }
        }
        return [...dates.values()].sort((left, right) => new Date(left.startsAt) - new Date(right.startsAt));
    }, [groupedSlots]);

    const activeDateKey = dateOptions.some((option) => option.dateKey === selectedDateKey)
        ? selectedDateKey
        : dateOptions[0]?.dateKey || '';

    const visibleGroups = useMemo(
        () => groupedSlots.filter((group) => group.dateKey === activeDateKey),
        [activeDateKey, groupedSlots],
    );

    const emptyState = useMemo(
        () => availabilityEmptyState(availability),
        [availability],
    );

    const selectedParticipants = useMemo(() => {
        const selected = new Set(selectedParticipantIds);
        return (selectedPurchase?.participants || []).filter((participant) => selected.has(participant.id));
    }, [selectedParticipantIds, selectedPurchase]);

    const stepComplete = useMemo(() => ({
        1: Boolean(selectedPurchase),
        2: selectedParticipantIds.length > 0,
        3: Boolean(selectedSlot),
        4: false,
    }), [selectedParticipantIds.length, selectedPurchase, selectedSlot]);

    const canOpenStep = (step) => {
        if (isReschedule && step < 3) return false;
        if (step === 1) return true;
        if (step === 2) return Boolean(selectedPurchase);
        if (step === 3) return Boolean(selectedPurchase && selectedParticipantIds.length);
        if (step === 4) return Boolean(selectedPurchase && selectedParticipantIds.length && selectedSlot);
        return false;
    };

    const openStep = (step) => {
        if (!canOpenStep(step)) return;
        setMessage('');
        setActiveStep(step);
    };

    const toggleParticipant = (id) => {
        const nextIds = selectedParticipantIds.includes(id)
            ? selectedParticipantIds.filter((value) => value !== id)
            : [...selectedParticipantIds, id];
        setParticipantSelection({ purchaseId: selectedPurchase?.id || '', ids: nextIds });
    };

    const choosePackage = (purchase) => {
        if (isReschedule) return;
        setPurchaseId(purchase.id);
        setParticipantSelection({
            purchaseId: purchase.id,
            ids: (purchase.participants || []).map((participant) => participant.id),
        });
        setSelectedSlot(null);
        setMessage('');
        setActiveStep(2);
    };

    const chooseNextAvailable = () => {
        const slot = availability?.slots?.[0];
        if (!slot) return;
        setSelectedDateKey(dateKey(slot.startsAt, slot.timezone));
        setSelectedSlot(slot);
        setMessage('');
    };

    const continueFromParticipants = () => {
        if (!selectedParticipantIds.length) {
            setMessage('Choose at least one registered participant.');
            return;
        }
        setMessage('');
        setActiveStep(3);
    };

    const continueFromTime = () => {
        if (!selectedSlot) {
            setMessage('Choose an available session time.');
            return;
        }
        setMessage('');
        setActiveStep(4);
    };

    const submit = async (event) => {
        event.preventDefault();
        if (!selectedPurchase || !selectedSlot) {
            setMessage('Choose a package and an available session time.');
            setActiveStep(selectedPurchase ? 3 : 1);
            return;
        }
        if (!selectedParticipantIds.length) {
            setMessage('Choose at least one registered participant.');
            setActiveStep(2);
            return;
        }

        setBusy(true);
        setMessage('');
        try {
            const result = bookingId
                ? await updatePrivateTrainingBooking({
                    bookingId,
                    action: 'reschedule',
                    instructorUid: selectedSlot.instructorUid,
                    startsAt: selectedSlot.startsAt,
                    note,
                })
                : await createPrivateTrainingBooking({
                    purchaseId: selectedPurchase.id,
                    instructorUid: selectedSlot.instructorUid,
                    startsAt: selectedSlot.startsAt,
                    participantIds: selectedParticipantIds,
                    locationType: selectedSlot.locationType,
                    location: selectedSlot.location,
                    note,
                });
            navigate('/member/private-training', {
                replace: true,
                state: {
                    bookingMessage: bookingId
                        ? 'Your private-training session was rescheduled.'
                        : result.status === 'requested'
                            ? 'Your session request was sent to the instructor.'
                            : 'Your private-training session is confirmed.',
                },
            });
        } catch (error) {
            console.error(error);
            setMessage(error?.message || 'The session could not be booked. Please choose another time and try again.');
            setActiveStep(3);
            try {
                await loadAvailability({ quiet: true });
            } catch {
                // Keep the original booking error visible.
            }
        } finally {
            setBusy(false);
        }
    };

    if (purchaseLoading) {
        return <p className="page-loader">Loading private-training packages…</p>;
    }

    return (
        <section className="member-page booking-page">
            <div className="container booking-page__container">
                <div className="member-header member-header--refined">
                    <div>
                        <Link className="text-link" to="/member/private-training">
                            <ArrowLeft size={17} /> Private training
                        </Link>
                        <p className="eyebrow">{isReschedule ? 'Reschedule a session' : 'Book a session'}</p>
                        <h1>{isReschedule ? 'Choose a new private-training time.' : 'Book your next private-training session.'}</h1>
                        <p>
                            {isReschedule
                                ? 'Your credit stays reserved while you select a new available time.'
                                : 'Move through four clear steps. Your credit is reserved only after the booking is submitted.'}
                        </p>
                    </div>
                </div>

                {purchaseError && <p className="form-status form-status--error" role="alert">{purchaseError}</p>}
                {message && <p className="form-status form-status--error" role="alert">{message}</p>}

                {!bookablePurchases.length ? (
                    <article className="empty-state-card">
                        <h2>No bookable session credits</h2>
                        <p>
                            Purchase a private-training package or wait for an existing
                            booking to be completed or canceled.
                        </p>
                        <Link className="button" to="/private-training">Explore packages</Link>
                    </article>
                ) : (
                    <form className="booking-workflow" onSubmit={submit}>
                        <nav className="booking-stepper" aria-label="Private-training booking steps">
                            <ol>
                                {STEPS.map((step) => {
                                    const complete = stepComplete[step.number];
                                    const current = activeStep === step.number;
                                    const available = canOpenStep(step.number);
                                    return (
                                        <li key={step.number} className={current ? 'is-current' : complete ? 'is-complete' : ''}>
                                            <button
                                                type="button"
                                                onClick={() => openStep(step.number)}
                                                disabled={!available}
                                                aria-current={current ? 'step' : undefined}
                                            >
                                                <span>{complete ? <Check size={16} /> : step.number}</span>
                                                <strong>{step.label}</strong>
                                            </button>
                                        </li>
                                    );
                                })}
                            </ol>
                        </nav>

                        <div className="booking-workflow__layout">
                            <main className="booking-workflow__main">
                                {activeStep === 1 && (
                                    <section className="booking-panel booking-step-panel" aria-labelledby="booking-package-title">
                                        <div className="booking-panel__heading">
                                            <CalendarDays aria-hidden="true" />
                                            <div>
                                                <p className="eyebrow">Step 1 of 4</p>
                                                <h2 id="booking-package-title">Choose a package</h2>
                                            </div>
                                        </div>

                                        <div className="booking-package-options">
                                            {bookablePurchases.map((purchase) => (
                                                <button
                                                    type="button"
                                                    className={purchase.id === effectivePurchaseId ? 'is-active' : ''}
                                                    key={purchase.id}
                                                    onClick={() => choosePackage(purchase)}
                                                    disabled={isReschedule}
                                                    aria-pressed={purchase.id === effectivePurchaseId}
                                                >
                                                    <strong>{purchase.offerName}</strong>
                                                    <span>{availableCredits(purchase)} available session{availableCredits(purchase) === 1 ? '' : 's'}</span>
                                                    <small>{purchase.sessionDurationMinutes || 60} minutes per session</small>
                                                </button>
                                            ))}
                                        </div>

                                        <div className="booking-step-actions booking-step-actions--end">
                                            <button type="button" className="button" onClick={() => setActiveStep(2)} disabled={!selectedPurchase}>
                                                Continue <ChevronRight size={17} />
                                            </button>
                                        </div>
                                    </section>
                                )}

                                {activeStep === 2 && selectedPurchase && (
                                    <section className="booking-panel booking-step-panel" aria-labelledby="booking-participants-title">
                                        <div className="booking-panel__heading">
                                            <Users aria-hidden="true" />
                                            <div>
                                                <p className="eyebrow">Step 2 of 4</p>
                                                <h2 id="booking-participants-title">Who is attending?</h2>
                                            </div>
                                        </div>
                                        <p className="booking-help">
                                            One booking uses one package session whether one, two, or three registered participants attend.
                                        </p>
                                        <div className="booking-participant-options">
                                            {(selectedPurchase.participants || []).map((participant) => {
                                                const selected = selectedParticipantIds.includes(participant.id);
                                                return (
                                                    <button
                                                        type="button"
                                                        className={selected ? 'is-active' : ''}
                                                        key={participant.id}
                                                        onClick={() => !isReschedule && toggleParticipant(participant.id)}
                                                        disabled={isReschedule}
                                                        aria-pressed={selected}
                                                    >
                                                        <span className="booking-check"><Check size={16} /></span>
                                                        <strong>{participant.fullName}</strong>
                                                    </button>
                                                );
                                            })}
                                        </div>
                                        <div className="booking-step-actions">
                                            <button type="button" className="button button--secondary" onClick={() => setActiveStep(1)} disabled={isReschedule}>
                                                <ChevronLeft size={17} /> Back
                                            </button>
                                            <button type="button" className="button" onClick={continueFromParticipants} disabled={!selectedParticipantIds.length}>
                                                Find a time <ChevronRight size={17} />
                                            </button>
                                        </div>
                                    </section>
                                )}

                                {activeStep === 3 && (
                                    <section className="booking-panel booking-step-panel" aria-labelledby="booking-time-title">
                                        <div className="booking-panel__heading booking-panel__heading--actions">
                                            <Clock3 aria-hidden="true" />
                                            <div>
                                                <p className="eyebrow">Step 3 of 4</p>
                                                <h2 id="booking-time-title">Choose an available time</h2>
                                            </div>
                                            <button
                                                type="button"
                                                className="icon-button"
                                                onClick={() => loadAvailability()}
                                                disabled={loadingSlots}
                                                aria-label="Refresh available session times"
                                            >
                                                <RefreshCw size={17} className={loadingSlots ? 'spin' : ''} />
                                            </button>
                                        </div>

                                        {loadingSlots && (
                                            <p className="quote-loading" role="status"><RefreshCw className="spin" size={17} /> Loading available times…</p>
                                        )}

                                        {!loadingSlots && availability && !groupedSlots.length && (
                                            <div className="booking-no-slots">
                                                <h3>{emptyState.title}</h3>
                                                <p>{emptyState.message}</p>
                                                {availability?.availabilityState?.rangeStart && (
                                                    <small>
                                                        Checked {availability.availabilityState.rangeStart} through {availability.availabilityState.rangeEnd}.
                                                    </small>
                                                )}
                                                <div className="booking-no-slots__actions">
                                                    {isInstructor && (
                                                        <Link className="text-link" to="/instructor/availability">
                                                            Review instructor availability
                                                        </Link>
                                                    )}
                                                    <Link className="text-link" to="/contact?interest=private-training">
                                                        Contact the studio
                                                    </Link>
                                                </div>
                                            </div>
                                        )}

                                        {!loadingSlots && groupedSlots.length > 0 && (
                                            <>
                                                <div className="booking-time-toolbar">
                                                    <div>
                                                        <span className="booking-time-toolbar__label">Available dates</span>
                                                        <div className="booking-date-options" aria-label="Available private-training dates">
                                                            {dateOptions.map((option) => (
                                                                <button
                                                                    type="button"
                                                                    key={option.dateKey}
                                                                    className={activeDateKey === option.dateKey ? 'is-active' : ''}
                                                                    onClick={() => setSelectedDateKey(option.dateKey)}
                                                                    aria-pressed={activeDateKey === option.dateKey}
                                                                >
                                                                    {option.label}
                                                                </button>
                                                            ))}
                                                        </div>
                                                    </div>
                                                    <button type="button" className="button button--secondary booking-next-available" onClick={chooseNextAvailable}>
                                                        <Sparkles size={16} /> Choose next available
                                                    </button>
                                                </div>

                                                <div className="booking-slot-groups">
                                                    {visibleGroups.map((group) => (
                                                        <article className="booking-slot-group" key={group.key}>
                                                            <div>
                                                                <p className="eyebrow">{group.instructorName}</p>
                                                                <h3>{group.dateLabel}</h3>
                                                                {group.location && (
                                                                    <p><MapPin size={15} /> {group.location}</p>
                                                                )}
                                                            </div>
                                                            <div className="booking-slot-options">
                                                                {group.slots.map((slot) => {
                                                                    const selected = selectedSlot?.startsAt === slot.startsAt
                                                                        && selectedSlot?.instructorUid === slot.instructorUid;
                                                                    return (
                                                                        <button
                                                                            type="button"
                                                                            className={selected ? 'is-active' : ''}
                                                                            key={`${slot.instructorUid}-${slot.startsAt}`}
                                                                            onClick={() => {
                                                                                setSelectedSlot(slot);
                                                                                setMessage('');
                                                                            }}
                                                                            aria-pressed={selected}
                                                                        >
                                                                            {formatTime(slot.startsAt, slot.timezone)}
                                                                        </button>
                                                                    );
                                                                })}
                                                            </div>
                                                        </article>
                                                    ))}
                                                </div>
                                            </>
                                        )}

                                        <div className="booking-step-actions">
                                            <button type="button" className="button button--secondary" onClick={() => setActiveStep(2)} disabled={isReschedule}>
                                                <ChevronLeft size={17} /> Back
                                            </button>
                                            <button type="button" className="button" onClick={continueFromTime} disabled={!selectedSlot}>
                                                Review booking <ChevronRight size={17} />
                                            </button>
                                        </div>
                                    </section>
                                )}

                                {activeStep === 4 && (
                                    <section className="booking-panel booking-step-panel booking-review-panel" aria-labelledby="booking-review-title">
                                        <div className="booking-panel__heading">
                                            <Check aria-hidden="true" />
                                            <div>
                                                <p className="eyebrow">Step 4 of 4</p>
                                                <h2 id="booking-review-title">Review and submit</h2>
                                            </div>
                                        </div>

                                        <dl className="booking-review-details">
                                            <div><dt>Package</dt><dd>{selectedPurchase?.offerName || '—'}</dd></div>
                                            <div><dt>Participants</dt><dd>{selectedParticipants.map((participant) => participant.fullName).join(', ') || '—'}</dd></div>
                                            <div><dt>Date</dt><dd>{selectedSlot ? formatDate(selectedSlot.startsAt, selectedSlot.timezone) : '—'}</dd></div>
                                            <div><dt>Time</dt><dd>{selectedSlot ? `${formatTime(selectedSlot.startsAt, selectedSlot.timezone)} · ${selectedPurchase?.sessionDurationMinutes || 60} minutes` : '—'}</dd></div>
                                            <div><dt>Instructor</dt><dd>{selectedSlot?.instructorName || '—'}</dd></div>
                                            <div><dt>Location</dt><dd>{selectedSlot?.location || 'Details provided by the studio'}</dd></div>
                                        </dl>

                                        <label className="booking-note-field">
                                            Optional note for the instructor
                                            <textarea
                                                rows="4"
                                                maxLength="1200"
                                                value={note}
                                                onChange={(event) => setNote(event.target.value)}
                                                placeholder="Share the focus you want for this session or anything the instructor should know."
                                            />
                                            <small>{note.length}/1200 characters</small>
                                        </label>

                                        <div className="booking-credit-notice">
                                            <strong>One session credit will be reserved.</strong>
                                            <span>The credit is used after the session is completed and may be restored according to the cancellation policy.</span>
                                        </div>

                                        <div className="booking-step-actions">
                                            <button type="button" className="button button--secondary" onClick={() => setActiveStep(3)}>
                                                <ChevronLeft size={17} /> Change time
                                            </button>
                                            <button className="button" type="submit" disabled={busy || !selectedSlot || !selectedParticipantIds.length}>
                                                {busy
                                                    ? isReschedule ? 'Rescheduling…' : 'Booking…'
                                                    : isReschedule
                                                        ? 'Save new time'
                                                        : selectedSlot?.requiresApproval
                                                            ? 'Request session'
                                                            : 'Confirm booking'}
                                            </button>
                                        </div>
                                    </section>
                                )}
                            </main>

                            <aside className="booking-summary-card" aria-label="Current booking summary">
                                <p className="eyebrow">Booking summary</p>
                                <h2>{selectedPurchase?.offerName || 'Choose a package'}</h2>
                                <dl>
                                    <div>
                                        <dt>Credit</dt>
                                        <dd>{selectedPurchase ? `${availableCredits(selectedPurchase)} available` : '—'}</dd>
                                    </div>
                                    <div>
                                        <dt>Participants</dt>
                                        <dd>{selectedParticipantIds.length || '—'}</dd>
                                    </div>
                                    <div>
                                        <dt>Date</dt>
                                        <dd>{selectedSlot ? formatShortDate(selectedSlot.startsAt, selectedSlot.timezone) : 'Not selected'}</dd>
                                    </div>
                                    <div>
                                        <dt>Time</dt>
                                        <dd>{selectedSlot ? formatTime(selectedSlot.startsAt, selectedSlot.timezone) : 'Not selected'}</dd>
                                    </div>
                                    <div>
                                        <dt>Instructor</dt>
                                        <dd>{selectedSlot?.instructorName || 'Not selected'}</dd>
                                    </div>
                                </dl>
                                {selectedSlot?.location && <p><MapPin size={15} /> {selectedSlot.location}</p>}
                                {selectedSlot?.timezone && <small>Times shown in {selectedSlot.timezone.replaceAll('_', ' ')}</small>}
                            </aside>
                        </div>
                    </form>
                )}
            </div>
        </section>
    );
}
