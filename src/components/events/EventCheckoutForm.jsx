import {
    BadgePercent,
    CalendarCheck2,
    CreditCard,
    LoaderCircle,
    MapPin,
    ShieldCheck,
    UserRound,
    Users,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import {
    quoteEventCheckout,
    startEventCheckout,
} from '../../services/events';

function blankParticipant(index) {
    return {
        key: `event-participant-${index + 1}`,
        fullName: '',
        email: '',
        phone: '',
        isMinor: false,
        guardianName: '',
        guardianEmail: '',
        isPurchaser: false,
    };
}

function formatMoney(cents, currency = 'usd') {
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: String(currency || 'usd').toUpperCase(),
    }).format(Number(cents || 0) / 100);
}

function formatDateTime(value) {
    const date = value ? new Date(value) : null;
    if (!date || Number.isNaN(date.valueOf())) return 'Date announced separately';
    return date.toLocaleString('en-US', {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
    });
}

export default function EventCheckoutForm({ event, onCancel }) {
    const { user } = useAuth();
    const maxParticipants = Math.max(1, Math.min(12, Number(event.maxParticipantsPerOrder || 6)));
    const [participantCount, setParticipantCount] = useState(1);
    const [purchaserAttending, setPurchaserAttending] = useState(true);
    const [purchaser, setPurchaser] = useState({
        name: user?.displayName || '',
        email: user?.email || '',
        phone: '',
    });
    const [participants, setParticipants] = useState(() => (
        Array.from({ length: maxParticipants }, (_, index) => blankParticipant(index))
    ));
    const [discountCode, setDiscountCode] = useState('');
    const [appliedCode, setAppliedCode] = useState('');
    const [quote, setQuote] = useState(null);
    const [quoteLoading, setQuoteLoading] = useState(true);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        if (!user) return;
        queueMicrotask(() => {
            setPurchaser((current) => ({
                ...current,
                name: current.name || user.displayName || '',
                email: current.email || user.email || '',
            }));
        });
    }, [user]);

    useEffect(() => {
        if (!purchaserAttending) return;
        queueMicrotask(() => {
            setParticipants((current) => current.map((participant, index) => (
                index === 0
                    ? {
                        ...participant,
                        fullName: purchaser.name,
                        email: purchaser.email,
                        phone: purchaser.phone,
                        isPurchaser: true,
                    }
                    : participant
            )));
        });
    }, [purchaser, purchaserAttending]);

    useEffect(() => {
        let cancelled = false;
        queueMicrotask(() => {
            if (!cancelled) {
                setQuoteLoading(true);
                setError('');
            }
        });

        quoteEventCheckout({
            eventId: event.id,
            participantCount,
            discountCode: appliedCode,
        })
            .then((result) => {
                if (!cancelled) setQuote(result?.quote || null);
            })
            .catch((nextError) => {
                if (!cancelled) {
                    console.error(nextError);
                    setQuote(null);
                    setError(nextError?.message || 'Pricing could not be calculated.');
                }
            })
            .finally(() => {
                if (!cancelled) setQuoteLoading(false);
            });

        return () => {
            cancelled = true;
        };
    }, [event.id, participantCount, appliedCode]);

    const visibleParticipants = useMemo(
        () => participants.slice(0, participantCount),
        [participants, participantCount],
    );
    const isAlwaysFree = Number(event.pricePerParticipantCents || 0) === 0;
    const isFreeRegistration = quote?.totalCents === 0;

    const updateParticipant = (index, patch) => {
        setParticipants((current) => current.map((participant, participantIndex) => (
            participantIndex === index ? { ...participant, ...patch } : participant
        )));
    };

    const togglePurchaserAttending = (checked) => {
        setPurchaserAttending(checked);
        if (!checked) {
            updateParticipant(0, {
                fullName: '',
                email: '',
                phone: '',
                isPurchaser: false,
            });
        }
    };

    const beginCheckout = async (submitEvent) => {
        submitEvent.preventDefault();
        setError('');

        const invalidParticipant = visibleParticipants.find((participant) => (
            !participant.fullName.trim()
            || !participant.email.trim()
            || (
                participant.isMinor
                && (!participant.guardianName.trim() || !participant.guardianEmail.trim())
            )
        ));
        if (invalidParticipant) {
            setError('Complete the required information for every participant.');
            return;
        }

        setBusy(true);
        try {
            await startEventCheckout({
                eventId: event.id,
                participantCount,
                discountCode: appliedCode,
                purchaser,
                participants: visibleParticipants.map((participant, index) => ({
                    fullName: participant.fullName,
                    email: participant.email,
                    phone: participant.phone,
                    isMinor: participant.isMinor,
                    guardianName: participant.guardianName,
                    guardianEmail: participant.guardianEmail,
                    isPurchaser: purchaserAttending && index === 0,
                })),
            });
        } catch (nextError) {
            console.error(nextError);
            setError(nextError?.message || 'Event checkout could not be started.');
            setBusy(false);
        }
    };

    return (
        <form className="event-checkout" onSubmit={beginCheckout}>
            <div className="event-checkout__heading">
                <div>
                    <p className="eyebrow">Event registration</p>
                    <h2>{event.title}</h2>
                </div>
                <button className="text-link" type="button" onClick={onCancel}>
                    Choose another event
                </button>
            </div>

            <article className="event-signup-details">
                <div>
                    <CalendarCheck2 aria-hidden="true" />
                    <span><strong>{formatDateTime(event.startsAt)}</strong></span>
                </div>
                <div>
                    <MapPin aria-hidden="true" />
                    <span>
                        <strong>
                            {event.location?.name
                                || event.location?.address
                                || 'Location announced separately'}
                        </strong>
                    </span>
                </div>
                <p><strong>Membership:</strong> Not required. An account is optional.</p>
                {event.ageRequirement && (
                    <p><strong>Age requirement:</strong> {event.ageRequirement}</p>
                )}
                {event.prerequisites && (
                    <p><strong>Prerequisites or preparation:</strong> {event.prerequisites}</p>
                )}
                {event.cancellationPolicy && (
                    <p><strong>Cancellation and refund policy:</strong> {event.cancellationPolicy}</p>
                )}
                {event.accessibilityContact && (
                    <p><strong>Accessibility and accommodations:</strong> {event.accessibilityContact}</p>
                )}
                {event.participantNotice && (
                    <p><strong>Participant notice:</strong> {event.participantNotice}</p>
                )}
            </article>

            <div className="event-registration-explainer">
                <CalendarCheck2 aria-hidden="true" />
                <div>
                    <strong>Registration comes first.</strong>
                    <p>
                        {isAlwaysFree
                            ? 'Registration reserves each person’s place. Every participant must then have verified waiver coverage before event check-in.'
                            : 'Payment reserves each person’s place. Every participant must then have verified waiver coverage before event check-in.'}
                    </p>
                </div>
            </div>

            <section className="event-checkout__section">
                <div className="event-checkout__section-heading">
                    <Users aria-hidden="true" />
                    <div>
                        <h3>Who is attending?</h3>
                        <p>Each participant is tracked separately, even when one person pays.</p>
                    </div>
                </div>

                <label>
                    Number of participants
                    <select
                        value={participantCount}
                        onChange={(changeEvent) => setParticipantCount(Number(changeEvent.target.value))}
                    >
                        {Array.from({ length: maxParticipants }, (_, index) => index + 1).map((count) => (
                            <option value={count} key={count}>
                                {count} {count === 1 ? 'participant' : 'participants'}
                            </option>
                        ))}
                    </select>
                </label>

                <label className="checkbox-row">
                    <input
                        type="checkbox"
                        checked={purchaserAttending}
                        onChange={(changeEvent) => togglePurchaserAttending(changeEvent.target.checked)}
                    />
                    The purchaser is also attending
                </label>

                <div className="event-participant-forms">
                    {visibleParticipants.map((participant, index) => (
                        <fieldset className="event-participant-form" key={participant.key}>
                            <legend><UserRound size={17} /> Participant {index + 1}</legend>
                            <div className="form-row">
                                <label>
                                    Full legal name
                                    <input
                                        required
                                        value={participant.fullName}
                                        readOnly={purchaserAttending && index === 0}
                                        onChange={(changeEvent) => updateParticipant(index, {
                                            fullName: changeEvent.target.value,
                                        })}
                                    />
                                </label>
                                <label>
                                    Email for event and waiver
                                    <input
                                        required
                                        type="email"
                                        value={participant.email}
                                        readOnly={purchaserAttending && index === 0}
                                        onChange={(changeEvent) => updateParticipant(index, {
                                            email: changeEvent.target.value,
                                        })}
                                    />
                                </label>
                            </div>
                            <div className="form-row">
                                <label>
                                    Phone <span className="optional-label">optional</span>
                                    <input
                                        type="tel"
                                        value={participant.phone}
                                        readOnly={purchaserAttending && index === 0}
                                        onChange={(changeEvent) => updateParticipant(index, {
                                            phone: changeEvent.target.value,
                                        })}
                                    />
                                </label>
                                <label className="checkbox-row checkbox-row--field">
                                    <input
                                        type="checkbox"
                                        checked={participant.isMinor}
                                        onChange={(changeEvent) => updateParticipant(index, {
                                            isMinor: changeEvent.target.checked,
                                            guardianName: changeEvent.target.checked ? participant.guardianName : '',
                                            guardianEmail: changeEvent.target.checked ? participant.guardianEmail : '',
                                        })}
                                    />
                                    Participant is under 18
                                </label>
                            </div>
                            {participant.isMinor && (
                                <div className="form-row">
                                    <label>
                                        Parent or guardian full name
                                        <input
                                            required
                                            value={participant.guardianName}
                                            onChange={(changeEvent) => updateParticipant(index, {
                                                guardianName: changeEvent.target.value,
                                            })}
                                        />
                                    </label>
                                    <label>
                                        Parent or guardian email
                                        <input
                                            required
                                            type="email"
                                            value={participant.guardianEmail}
                                            onChange={(changeEvent) => updateParticipant(index, {
                                                guardianEmail: changeEvent.target.value,
                                            })}
                                        />
                                    </label>
                                </div>
                            )}
                        </fieldset>
                    ))}
                </div>
            </section>

            <section className="event-checkout__section">
                <div className="event-checkout__section-heading">
                    <CreditCard aria-hidden="true" />
                    <div>
                        <h3>Purchaser</h3>
                        <p>An account is not required. Confirmation will be sent to this email.</p>
                    </div>
                </div>
                <div className="form-row">
                    <label>
                        Full name
                        <input
                            required
                            value={purchaser.name}
                            onChange={(changeEvent) => setPurchaser((current) => ({
                                ...current,
                                name: changeEvent.target.value,
                            }))}
                        />
                    </label>
                    <label>
                        Email
                        <input
                            required
                            type="email"
                            value={purchaser.email}
                            onChange={(changeEvent) => setPurchaser((current) => ({
                                ...current,
                                email: changeEvent.target.value,
                            }))}
                        />
                    </label>
                </div>
                <label>
                    Phone <span className="optional-label">optional</span>
                    <input
                        type="tel"
                        value={purchaser.phone}
                        onChange={(changeEvent) => setPurchaser((current) => ({
                            ...current,
                            phone: changeEvent.target.value,
                        }))}
                    />
                </label>
            </section>

            <section className="event-checkout__section event-checkout__pricing">
                <div className="event-checkout__section-heading">
                    <BadgePercent aria-hidden="true" />
                    <div>
                        <h3>{isAlwaysFree ? 'Free registration' : 'Pricing and discounts'}</h3>
                        <p>
                            {isAlwaysFree
                                ? 'There is no charge for this event.'
                                : 'Signed-in member pricing is applied automatically when eligible.'}
                        </p>
                    </div>
                </div>
                {!isAlwaysFree && (
                    <div className="discount-code-row">
                        <label>
                            Promotion code <span className="optional-label">optional</span>
                            <input
                                value={discountCode}
                                onChange={(changeEvent) => setDiscountCode(changeEvent.target.value.toUpperCase())}
                                placeholder="ENTER CODE"
                            />
                        </label>
                        <button
                            className="button button--dark-ghost"
                            type="button"
                            onClick={() => setAppliedCode(discountCode.trim())}
                        >
                            Apply code
                        </button>
                    </div>
                )}

                {quoteLoading ? (
                    <p className="quote-loading"><LoaderCircle className="spin" /> Calculating price…</p>
                ) : quote && (
                    <div className="checkout-summary" aria-live="polite">
                        <div>
                            <span>{participantCount} event spot{participantCount === 1 ? '' : 's'}</span>
                            <strong>
                                {quote.subtotalCents === 0 ? 'Free' : formatMoney(quote.subtotalCents, quote.currency)}
                            </strong>
                        </div>
                        {quote.discountAmountCents > 0 && (
                            <div className="checkout-summary__discount">
                                <span>{quote.discount?.label || 'Discount'}</span>
                                <strong>−{formatMoney(quote.discountAmountCents, quote.currency)}</strong>
                            </div>
                        )}
                        <div className="checkout-summary__total">
                            <span>Total</span>
                            <strong>{quote.totalCents === 0 ? 'Free' : formatMoney(quote.totalCents, quote.currency)}</strong>
                        </div>
                    </div>
                )}
            </section>

            <div className="event-waiver-preview">
                <ShieldCheck aria-hidden="true" />
                <p>
                    {isFreeRegistration
                        ? 'This step completes registration only. A current membership waiver may cover an eligible member; every other participant receives an event-specific waiver by email.'
                        : 'Payment completes registration only. A current membership waiver may cover an eligible member; every other participant receives an event-specific waiver by email.'}
                </p>
            </div>
            <p className="event-waiver-email-note">
                Adult participants sign for themselves. A parent or legal guardian signs for
                a minor. The signer receives an emailed copy after completion.
                {event.mediaConsent?.enabled
                    ? ' Optional photo/video consent is kept separate and is offered to the signer on the waiver page.'
                    : ''}
            </p>

            {error && <p className="form-status form-status--error">{error}</p>}

            <div className="event-checkout__actions">
                <button className="button" type="submit" disabled={busy || quoteLoading || !quote}>
                    {busy ? <LoaderCircle className="spin" /> : <CalendarCheck2 />}
                    {busy
                        ? isFreeRegistration ? 'Completing registration…' : 'Opening secure checkout…'
                        : isFreeRegistration ? 'Complete free registration' : 'Register and continue to payment'}
                </button>
            </div>
        </form>
    );
}
