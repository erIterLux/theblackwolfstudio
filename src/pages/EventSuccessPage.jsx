import {
    CalendarCheck2,
    CheckCircle2,
    Clock3,
    Copy,
    Home,
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

    const copyWaiverLink = async (participant) => {
        const url = new URL(waiverPath(participant), window.location.origin).toString();
        await navigator.clipboard.writeText(url);
        setCopiedId(participant.id);
        window.setTimeout(() => setCopiedId(''), 1800);
    };

    return (
        <section className="section section--light event-success-page">
            <div className="container event-success-page__inner">
                <div className="purchase-success-icon" aria-hidden="true">
                    {paid ? <CheckCircle2 /> : <Clock3 />}
                </div>
                <p className="eyebrow">Event registration</p>
                <h1>{paid ? 'Registration is confirmed.' : 'Payment is processing.'}</h1>
                <p>
                    {paid
                        ? freeRegistration
                            ? 'Each participant now has an individual event record. The free registration is complete, but waiver coverage and event check-in are separate steps.'
                            : 'Each participant now has an individual event record. Registration is complete, but waiver coverage and event check-in are separate steps.'
                        : 'Stripe is still confirming the payment. This page will update automatically.'}
                </p>

                {loading && <p className="quote-loading"><Clock3 /> Confirming registration…</p>}
                {error && <p className="form-status form-status--error">{error}</p>}

                {registration && (
                    <>
                        <article className="event-confirmation-card">
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

                        <section className="event-next-steps">
                            <div>
                                <span>1</span>
                                <div><strong>Registration</strong><p>Complete</p></div>
                                <CheckCircle2 aria-hidden="true" />
                            </div>
                            <div>
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

                        <div className="event-confirmed-participants">
                            <p className="footer-heading">Registered participants</p>
                            {participants.map((participant) => {
                                const canOpen = participant.waiverStatus === 'pending' && participant.waiverAccessToken;
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
                                            <span className="event-person-status is-confirmed">Registered</span>
                                            <span className={`event-person-status${['signed', 'covered', 'not_required'].includes(participant.waiverStatus) ? ' is-confirmed' : ' is-pending'}`}>
                                                {participant.waiverStatus === 'covered'
                                                    ? 'Covered by membership'
                                                    : `Waiver ${readableStatus(participant.waiverStatus)}`}
                                            </span>
                                            <span className="event-person-status is-neutral">Not checked in</span>
                                            {canOpen && (
                                                <>
                                                    <Link className="button button--small" to={waiverPath(participant)}>
                                                        Sign waiver
                                                    </Link>
                                                    <button
                                                        className="text-link"
                                                        type="button"
                                                        onClick={() => copyWaiverLink(participant)}
                                                    >
                                                        <Copy size={15} /> {copiedId === participant.id ? 'Copied' : 'Copy signing link'}
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
                    </>
                )}

                <div className="purchase-success-actions">
                    {orderId && (
                        <Link className="button" to={`/order/${encodeURIComponent(orderId)}`}>
                            View purchase details
                        </Link>
                    )}
                    <Link className="button button--dark-ghost" to="/events">
                        View more events
                    </Link>
                    <Link className="button button--dark-ghost" to="/">
                        <Home size={17} /> Return home
                    </Link>
                </div>
            </div>
        </section>
    );
}
