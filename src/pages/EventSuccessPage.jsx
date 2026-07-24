import {
    AlertCircle,
    ArrowRight,
    CalendarCheck2,
    CheckCircle2,
    Clock3,
    Copy,
    Home,
    MailCheck,
    ShieldCheck,
    UserCheck,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { getEventRegistration } from '../services/events';
import { getStudioOrder } from '../services/studioCommerce';

function formatDateTime(value) {
    const date = value ? new Date(value) : null;
    if (!date || Number.isNaN(date.valueOf())) return '';
    return date.toLocaleString('en-US', {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
    });
}

function readableStatus(value) {
    return String(value || '').replaceAll('_', ' ');
}

function waiverPath(participant) {
    const token = participant?.waiverAccessToken || '';
    return `/events/waiver/${encodeURIComponent(participant.id)}${token ? `?token=${encodeURIComponent(token)}` : ''}`;
}

export default function EventSuccessPage() {
    const [searchParams] = useSearchParams();
    const orderId = searchParams.get('order_id') || '';
    const tokenFromUrl = searchParams.get('access_token') || '';
    const storageKey = orderId ? `black-wolf-event-order:${orderId}` : '';
    const accessToken = useMemo(() => {
        if (tokenFromUrl && storageKey) {
            sessionStorage.setItem(storageKey, tokenFromUrl);
            return tokenFromUrl;
        }
        return storageKey ? sessionStorage.getItem(storageKey) || '' : '';
    }, [storageKey, tokenFromUrl]);

    const [order, setOrder] = useState(null);
    const [registration, setRegistration] = useState(null);
    const [participants, setParticipants] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [copiedId, setCopiedId] = useState('');

    useEffect(() => {
        if (!tokenFromUrl) return;
        const url = new URL(window.location.href);
        url.searchParams.delete('access_token');
        window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
    }, [tokenFromUrl]);

    useEffect(() => {
        let cancelled = false;
        let timer = null;
        let attempts = 0;

        const load = async () => {
            if (!orderId) {
                setError('The event confirmation is missing its registration number.');
                setLoading(false);
                return;
            }

            attempts += 1;
            try {
                const orderResult = await getStudioOrder(orderId, accessToken);
                if (cancelled) return;
                const nextOrder = orderResult?.order || null;
                setOrder(nextOrder);

                if (nextOrder?.paymentStatus === 'paid') {
                    try {
                        const result = await getEventRegistration(orderId, accessToken);
                        if (cancelled) return;
                        setRegistration(result?.registration || null);
                        setParticipants(result?.participants || []);
                        setLoading(false);
                        return;
                    } catch (registrationError) {
                        if (registrationError?.code !== 'functions/not-found') throw registrationError;
                    }
                }

                if (attempts < 15) {
                    timer = window.setTimeout(load, 2000);
                } else {
                    setLoading(false);
                }
            } catch (nextError) {
                if (cancelled) return;
                console.error(nextError);
                setError(nextError?.message || 'The event confirmation could not be loaded.');
                setLoading(false);
            }
        };

        queueMicrotask(load);
        return () => {
            cancelled = true;
            if (timer) window.clearTimeout(timer);
        };
    }, [orderId, accessToken]);

    const paid = order?.paymentStatus === 'paid';
    const freeRegistration = paid && Number(order?.pricing?.totalCents || 0) === 0;
    const coveredCount = participants.filter((participant) => (
        participant.waiverStatus === 'signed'
        || participant.waiverStatus === 'covered'
        || participant.waiverStatus === 'not_required'
    )).length;
    const nextWaiverParticipant = participants.find((participant) => (
        participant.waiverStatus === 'pending' && participant.waiverAccessToken
    ));

    const copyWaiverLink = async (participant) => {
        const url = new URL(waiverPath(participant), window.location.origin).toString();
        await navigator.clipboard.writeText(url);
        setCopiedId(participant.id);
        window.setTimeout(() => setCopiedId(''), 1800);
    };

    return (
        <section className="section section--light signup-success-page event-success-page">
            <div className="container signup-success-shell">
                <header className={`signup-success-hero ${!orderId ? 'is-error' : paid ? 'is-confirmed' : 'is-processing'}`}>
                    <div className="signup-success-hero__icon" aria-hidden="true">
                        {!orderId ? <AlertCircle /> : paid ? <CheckCircle2 /> : <Clock3 />}
                    </div>
                    <div className="signup-success-hero__copy">
                        <p className="eyebrow">Event registration</p>
                        <h1>
                            {!orderId
                                ? 'This confirmation link is incomplete.'
                                : paid ? 'You are registered.' : 'Payment is processing.'}
                        </h1>
                        <p>
                            {!orderId
                                ? 'Open the secure link from your confirmation email, or contact the Studio for help.'
                                : paid
                                ? freeRegistration
                                    ? 'The free registration is complete. Finish any outstanding participant waivers before arriving.'
                                    : 'Payment and registration are complete. Finish any outstanding participant waivers before arriving.'
                                : 'Stripe is still confirming the payment. This page will update automatically.'}
                        </p>
                        {orderId && <span className="signup-success-reference">Reference {orderId}</span>}
                    </div>
                    {registration && (
                        <aside className="signup-success-return-note">
                            <MailCheck aria-hidden="true" />
                            <div>
                                <strong>Secure return link emailed</strong>
                                <span>The purchaser can reopen this page without creating a membership.</span>
                            </div>
                        </aside>
                    )}
                </header>

                {loading && (
                    <p className="signup-success-loading" aria-live="polite">
                        <Clock3 aria-hidden="true" /> Confirming registration…
                    </p>
                )}
                {error && <p className="form-status form-status--error">{error}</p>}

                {registration && (
                    <>
                        <article className="event-confirmation-card signup-success-summary">
                            <div>
                                <span>Event</span>
                                <strong>{registration.eventSnapshot?.title}</strong>
                            </div>
                            <div>
                                <span>Date and time</span>
                                <strong>{formatDateTime(registration.eventSnapshot?.startsAt)}</strong>
                            </div>
                            <div>
                                <span>Location</span>
                                <strong>{registration.eventSnapshot?.location?.name || registration.eventSnapshot?.location?.address || 'To be announced'}</strong>
                            </div>
                            <div>
                                <span>Registration status</span>
                                <strong><CalendarCheck2 size={17} /> Confirmed</strong>
                            </div>
                        </article>

                        <section className="event-next-steps signup-success-steps" aria-label="Registration progress">
                            <div className="is-complete">
                                <span>1</span>
                                <div><strong>Registration</strong><p>Complete</p></div>
                                <CheckCircle2 aria-hidden="true" />
                            </div>
                            <div className={coveredCount >= participants.length ? 'is-complete' : 'is-current'}>
                                <span>2</span>
                                <div><strong>Waiver coverage</strong><p>{coveredCount} of {participants.length} complete</p></div>
                                <ShieldCheck aria-hidden="true" />
                            </div>
                            <div>
                                <span>3</span>
                                <div><strong>Event check-in</strong><p>Completed when each person arrives</p></div>
                                <UserCheck aria-hidden="true" />
                            </div>
                        </section>

                        <section className="signup-success-panel">
                            <div className="signup-success-panel__heading">
                                <div>
                                    <p className="eyebrow">Participant actions</p>
                                    <h2>Make everyone ready for check-in</h2>
                                </div>
                                <span>{coveredCount}/{participants.length} waivers complete</span>
                            </div>
                            <div className="event-confirmed-participants">
                                {participants.map((participant) => {
                                    const canOpen = participant.waiverStatus === 'pending'
                                        && participant.waiverAccessToken;
                                    const waiverComplete = ['signed', 'covered', 'not_required']
                                        .includes(participant.waiverStatus);
                                    return (
                                        <article key={participant.id}>
                                            <div>
                                                <strong>{participant.fullName}</strong>
                                                <span>{participant.email}</span>
                                                {(participant.emergencyContactName
                                                    || participant.emergencyContactPhone) && (
                                                    <span>
                                                        Emergency: {participant.emergencyContactName || 'Not listed'}
                                                        {' · '}
                                                        {participant.emergencyContactPhone || 'Phone missing'}
                                                    </span>
                                                )}
                                            </div>
                                            <div className="event-participant-actions">
                                                <span className={`event-person-status ${waiverComplete ? 'is-confirmed' : 'is-pending'}`}>
                                                    {participant.waiverStatus === 'covered'
                                                        ? 'Covered by membership'
                                                        : `Waiver ${readableStatus(participant.waiverStatus)}`}
                                                </span>
                                                <span className="event-person-status is-neutral">Check-in on arrival</span>
                                                {canOpen && (
                                                    <>
                                                        <Link className="signup-inline-action" to={waiverPath(participant)}>
                                                            Sign waiver <ArrowRight size={15} aria-hidden="true" />
                                                        </Link>
                                                        <button
                                                            className="signup-copy-action"
                                                            type="button"
                                                            onClick={() => copyWaiverLink(participant)}
                                                        >
                                                            <Copy size={15} aria-hidden="true" />
                                                            {copiedId === participant.id ? 'Copied' : 'Copy signing link'}
                                                        </button>
                                                    </>
                                                )}
                                                {participant.waiverStatus === 'setup_required' && (
                                                    <small>The instructor must finish the waiver setup.</small>
                                                )}
                                            </div>
                                        </article>
                                    );
                                })}
                            </div>
                        </section>
                    </>
                )}

                <footer className="signup-success-actions">
                    {nextWaiverParticipant && (
                        <Link className="signup-action signup-action--primary" to={waiverPath(nextWaiverParticipant)}>
                            Sign next waiver <ArrowRight size={17} aria-hidden="true" />
                        </Link>
                    )}
                    {orderId && (
                        <Link className="signup-action signup-action--secondary" to={`/order/${encodeURIComponent(orderId)}`}>
                            View purchase details
                        </Link>
                    )}
                    <Link className="signup-action signup-action--secondary" to="/events">
                        Browse more events
                    </Link>
                    <Link className="signup-action signup-action--quiet" to="/">
                        <Home size={17} aria-hidden="true" /> Studio home
                    </Link>
                </footer>
            </div>
        </section>
    );
}
