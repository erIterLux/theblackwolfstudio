import { CheckCircle2, Clock3, Home, ShieldCheck, Users } from 'lucide-react';
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
        if (tokenFromUrl) {
            const url = new URL(window.location.href);
            url.searchParams.delete('access_token');
            window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
        }
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

    return (
        <section className="section section--light purchase-success-page">
            <div className="container purchase-success-page__inner">
                <div className="purchase-success-icon" aria-hidden="true">
                    {paid ? <CheckCircle2 /> : <Clock3 />}
                </div>
                <p className="eyebrow">Private training</p>
                <h1>{paid ? 'Your package is confirmed.' : 'Your payment is processing.'}</h1>
                <p>
                    {paid
                        ? 'Your private training credits are ready. Complete any participant waivers below before requesting a session.'
                        : 'Stripe is still confirming the payment. This page will update automatically.'}
                </p>

                {loading && <p className="quote-loading"><Clock3 /> Confirming your package…</p>}
                {error && <p className="form-status form-status--error">{error}</p>}

                {purchase && (
                    <>
                    <article className="purchase-confirmation-card">
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
                    <section className="private-waiver-status-list">
                        <div className="private-waiver-status-list__heading">
                            <ShieldCheck />
                            <div>
                                <h2>Participant waiver coverage</h2>
                                <p>
                                    Current members may already be covered. Every other participant
                                    receives a package-specific signing link by email.
                                </p>
                            </div>
                        </div>
                        {(purchase.participants || []).map((participant) => {
                            const complete = ['signed', 'covered', 'not_required']
                                .includes(participant.waiverStatus);
                            return (
                                <article key={participant.id}>
                                    <div>
                                        <strong>{participant.fullName}</strong>
                                        <span>{participant.email}</span>
                                    </div>
                                    <div>
                                        <span className={`event-person-status ${complete ? 'is-confirmed' : 'is-pending'}`}>
                                            {participant.waiverStatus === 'covered'
                                                ? 'Covered by membership'
                                                : `Waiver ${participant.waiverStatus || 'pending'}`}
                                        </span>
                                        {!complete && participant.waiverAccessToken && (
                                            <Link
                                                className="button button--small"
                                                to={waiverPath(participant)}
                                            >
                                                Sign waiver
                                            </Link>
                                        )}
                                    </div>
                                </article>
                            );
                        })}
                    </section>
                    </>
                )}

                <div className="purchase-success-actions">
                    {orderId && (
                        <Link className="button" to={`/order/${encodeURIComponent(orderId)}`}>
                            View purchase details
                        </Link>
                    )}
                    <Link className="button button--dark-ghost" to="/contact?interest=private-training">
                        Request a session time
                    </Link>
                    <Link className="button button--dark-ghost" to="/">
                        <Home size={17} /> Return home
                    </Link>
                </div>
            </div>
        </section>
    );
}
