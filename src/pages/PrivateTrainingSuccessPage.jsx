import {
    AlertCircle,
    ArrowRight,
    CalendarPlus,
    CheckCircle2,
    Clock3,
    Home,
    MailCheck,
    ShieldCheck,
    Users,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { getPrivateTrainingPurchase } from '../services/privateTraining';
import { getStudioOrder } from '../services/studioCommerce';

function formatDate(value) {
    const date = value ? new Date(value) : null;
    return date && !Number.isNaN(date.valueOf())
        ? date.toLocaleDateString('en-US', {
            month: 'long',
            day: 'numeric',
            year: 'numeric',
        })
        : '';
}

function formatMoney(cents, currency = 'usd') {
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: String(currency || 'usd').toUpperCase(),
    }).format(Number(cents || 0) / 100);
}

function waiverPath(participant) {
    const token = participant?.waiverAccessToken || '';
    return `/private-training/waiver/${encodeURIComponent(participant.waiverId)}${token ? `?token=${encodeURIComponent(token)}` : ''}`;
}

export default function PrivateTrainingSuccessPage() {
    const [searchParams] = useSearchParams();
    const orderId = searchParams.get('order_id') || '';
    const tokenFromUrl = searchParams.get('access_token') || '';
    const storageKey = orderId ? `black-wolf-private-order:${orderId}` : '';
    const accessToken = useMemo(() => {
        if (tokenFromUrl && storageKey) {
            sessionStorage.setItem(storageKey, tokenFromUrl);
            return tokenFromUrl;
        }
        return storageKey ? sessionStorage.getItem(storageKey) || '' : '';
    }, [storageKey, tokenFromUrl]);

    const [order, setOrder] = useState(null);
    const [purchase, setPurchase] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

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
                setError('The purchase confirmation is missing its order number.');
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
                        const purchaseResult = await getPrivateTrainingPurchase(orderId, accessToken);
                        if (cancelled) return;
                        setPurchase(purchaseResult?.purchase || null);
                        setLoading(false);
                        return;
                    } catch (purchaseError) {
                        if (purchaseError?.code !== 'functions/not-found') throw purchaseError;
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
                setError(nextError?.message || 'The purchase confirmation could not be loaded.');
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
    const participants = purchase?.participants || [];
    const waiverCompleteCount = participants.filter((participant) => (
        ['signed', 'covered', 'not_required'].includes(participant.waiverStatus)
    )).length;
    const nextWaiverParticipant = participants.find((participant) => (
        !['signed', 'covered', 'not_required'].includes(participant.waiverStatus)
        && participant.waiverAccessToken
    ));

    return (
        <section className="section section--light signup-success-page purchase-success-page">
            <div className="container signup-success-shell">
                <header className={`signup-success-hero ${!orderId ? 'is-error' : paid ? 'is-confirmed' : 'is-processing'}`}>
                    <div className="signup-success-hero__icon" aria-hidden="true">
                        {!orderId ? <AlertCircle /> : paid ? <CheckCircle2 /> : <Clock3 />}
                    </div>
                    <div className="signup-success-hero__copy">
                        <p className="eyebrow">Private training</p>
                        <h1>
                            {!orderId
                                ? 'This confirmation link is incomplete.'
                                : paid ? 'Your package is ready.' : 'Payment is processing.'}
                        </h1>
                        <p>
                            {!orderId
                                ? 'Open the secure link from your confirmation email, or contact the Studio for help.'
                                : paid
                                ? 'Your credits are available. Complete every participant waiver before requesting the first session.'
                                : 'Stripe is still confirming the payment. This page will update automatically.'}
                        </p>
                        {orderId && <span className="signup-success-reference">Reference {orderId}</span>}
                    </div>
                    {purchase && (
                        <aside className="signup-success-return-note">
                            <MailCheck aria-hidden="true" />
                            <div>
                                <strong>Secure return link emailed</strong>
                                <span>The purchaser can manage this package without creating a membership.</span>
                            </div>
                        </aside>
                    )}
                </header>

                {loading && (
                    <p className="signup-success-loading" aria-live="polite">
                        <Clock3 aria-hidden="true" /> Confirming your package…
                    </p>
                )}
                {error && <p className="form-status form-status--error">{error}</p>}

                {purchase && (
                    <>
                        <article className="purchase-confirmation-card signup-success-summary">
                            <div>
                                <span>Package</span>
                                <strong>{purchase.offerName}</strong>
                            </div>
                            <div>
                                <span>Session credits</span>
                                <strong>{purchase.remainingSessions} of {purchase.totalSessions}</strong>
                            </div>
                            <div>
                                <span>Session length</span>
                                <strong>{purchase.sessionDurationMinutes} minutes</strong>
                            </div>
                            <div>
                                <span>Participants</span>
                                <strong><Users size={16} /> {purchase.participantCount}</strong>
                            </div>
                            {purchase.expiresAt && (
                                <div>
                                    <span>Use by</span>
                                    <strong>{formatDate(purchase.expiresAt)}</strong>
                                </div>
                            )}
                            <div>
                                <span>Amount paid</span>
                                <strong>{formatMoney(
                                    purchase.pricing?.totalCents,
                                    purchase.pricing?.currency || order?.currency,
                                )}</strong>
                            </div>
                        </article>

                        <section className="event-next-steps signup-success-steps" aria-label="Package setup progress">
                            <div className="is-complete">
                                <span>1</span>
                                <div><strong>Package purchase</strong><p>Complete</p></div>
                                <CheckCircle2 aria-hidden="true" />
                            </div>
                            <div className={waiverCompleteCount >= participants.length ? 'is-complete' : 'is-current'}>
                                <span>2</span>
                                <div><strong>Participant waivers</strong><p>{waiverCompleteCount} of {participants.length} complete</p></div>
                                <ShieldCheck aria-hidden="true" />
                            </div>
                            <div>
                                <span>3</span>
                                <div><strong>Session request</strong><p>Choose a time after waivers are ready</p></div>
                                <CalendarPlus aria-hidden="true" />
                            </div>
                        </section>

                        <section className="signup-success-panel private-waiver-status-list">
                            <div className="signup-success-panel__heading">
                                <div>
                                    <p className="eyebrow">Participant actions</p>
                                    <h2>Complete waiver coverage</h2>
                                    <p>
                                        Current members may already be covered. Everyone else receives
                                        a package-specific signing link by email.
                                    </p>
                                </div>
                                <span>{waiverCompleteCount}/{participants.length} waivers complete</span>
                            </div>
                            {participants.map((participant) => {
                                const complete = ['signed', 'covered', 'not_required']
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
                                        <div>
                                            <span className={`event-person-status ${complete ? 'is-confirmed' : 'is-pending'}`}>
                                                {participant.waiverStatus === 'covered'
                                                    ? 'Covered by membership'
                                                    : `Waiver ${participant.waiverStatus || 'pending'}`}
                                            </span>
                                            {!complete && participant.waiverAccessToken && (
                                                <Link
                                                    className="signup-inline-action"
                                                    to={waiverPath(participant)}
                                                >
                                                    Sign waiver <ArrowRight size={15} aria-hidden="true" />
                                                </Link>
                                            )}
                                        </div>
                                    </article>
                                );
                            })}
                        </section>
                    </>
                )}

                <footer className="signup-success-actions">
                    {nextWaiverParticipant ? (
                        <Link className="signup-action signup-action--primary" to={waiverPath(nextWaiverParticipant)}>
                            Sign next waiver <ArrowRight size={17} aria-hidden="true" />
                        </Link>
                    ) : (
                        <Link className="signup-action signup-action--primary" to="/contact?interest=private-training">
                            Request a session time <ArrowRight size={17} aria-hidden="true" />
                        </Link>
                    )}
                    {orderId && (
                        <Link className="signup-action signup-action--secondary" to={`/order/${encodeURIComponent(orderId)}`}>
                            View purchase details
                        </Link>
                    )}
                    <Link className="signup-action signup-action--quiet" to="/">
                        <Home size={17} aria-hidden="true" /> Studio home
                    </Link>
                </footer>
            </div>
        </section>
    );
}
