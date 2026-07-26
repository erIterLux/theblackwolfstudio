import {
    ArrowLeft,
    ArrowRight,
    CalendarClock,
    Check,
    Clock3,
    ShieldCheck,
    Users,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { listPrivateTrainingOffers } from '../services/privateTraining';

function money(cents, currency = 'usd') {
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: String(currency || 'usd').toUpperCase(),
        maximumFractionDigits: 0,
    }).format(Number(cents || 0) / 100);
}

function pricingRows(offer) {
    const maxParticipants = Number(offer.privateTraining?.maxParticipants || 3);
    if (offer.pricingModel === 'participant_tiers') {
        return Array.from({ length: maxParticipants }, (_, index) => index + 1)
            .map((count) => ({
                label: `${count} participant${count === 1 ? '' : 's'}`,
                value: money(
                    offer.participantAmountsCents?.[count]
                        ?? offer.participantAmountsCents?.[String(count)]
                        ?? 0,
                    offer.currency,
                ),
            }));
    }
    if (offer.pricingModel === 'per_participant') {
        return [{ label: 'Per participant', value: money(offer.unitAmountCents, offer.currency) }];
    }
    return [{ label: 'Package price', value: money(offer.amountCents, offer.currency) }];
}

export default function PrivateTrainingDetailPage() {
    const { offerId } = useParams();
    const [offer, setOffer] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        let cancelled = false;
        listPrivateTrainingOffers()
            .then((result) => {
                if (cancelled) return;
                const match = (result?.offers || []).find((item) => item.id === offerId);
                if (match) setOffer(match);
                else setError('This private lesson package is no longer available.');
            })
            .catch((nextError) => {
                if (cancelled) return;
                console.error(nextError);
                setError(nextError?.message || 'The package details could not be loaded.');
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, [offerId]);

    if (loading) {
        return <section className="section--light offering-detail-page"><div className="container"><p className="page-loader">Loading private lesson details…</p></div></section>;
    }

    if (error || !offer) {
        return (
            <section className="section--light offering-detail-page">
                <div className="container">
                    <article className="empty-state-card offering-detail-state">
                        <CalendarClock size={38} />
                        <h1>Package unavailable</h1>
                        <p>{error || 'This private lesson package is no longer available.'}</p>
                        <Link className="button" to="/private-training">View private lessons</Link>
                    </article>
                </div>
            </section>
        );
    }

    const config = offer.privateTraining || {};
    const included = Array.isArray(config.included) ? config.included : [];
    const focusAreas = Array.isArray(config.focusAreas) ? config.focusAreas : [];

    return (
        <section className="section--light offering-detail-page">
            <div className="container offering-detail-container">
                <Link className="text-link offering-detail-back" to="/private-training">
                    <ArrowLeft size={17} /> All private lesson packages
                </Link>

                <article className="offering-detail-card">
                    <header className="offering-detail-hero">
                        <div>
                            <p className="eyebrow">Private lesson package</p>
                            <h1>{offer.name}</h1>
                            <p className="offering-detail-lead">
                                {offer.longDescription || offer.shortDescription}
                            </p>
                        </div>
                        <aside className="offering-detail-price">
                            <span>Package options</span>
                            {pricingRows(offer).map((row) => (
                                <div key={row.label}><small>{row.label}</small><strong>{row.value}</strong></div>
                            ))}
                        </aside>
                    </header>

                    <div className="offering-detail-facts">
                        <div><CalendarClock /><span><small>Package</small><strong>{config.sessionCount || 1} session{config.sessionCount === 1 ? '' : 's'}</strong></span></div>
                        <div><Clock3 /><span><small>Lesson length</small><strong>{config.sessionDurationMinutes || 60} minutes</strong></span></div>
                        <div><Users /><span><small>Group size</small><strong>Up to {config.maxParticipants || 3} participants</strong></span></div>
                        <div><ShieldCheck /><span><small>Member savings</small><strong>{offer.memberDiscountEligible ? 'Eligible discounts apply' : 'Standard package pricing'}</strong></span></div>
                        <div><CalendarClock /><span><small>Use period</small><strong>{config.expirationDays > 0 ? `${config.expirationDays} days` : 'No fixed expiration'}</strong></span></div>
                    </div>

                    {(included.length > 0 || focusAreas.length > 0) && (
                        <section className="offering-detail-lists">
                            {included.length > 0 && (
                                <div>
                                    <p className="eyebrow">Included</p>
                                    <h2>What the package covers</h2>
                                    <ul>
                                        {included.map((item) => <li key={item}><Check size={17} /> {item}</li>)}
                                    </ul>
                                </div>
                            )}
                            {focusAreas.length > 0 && (
                                <div>
                                    <p className="eyebrow">Training options</p>
                                    <h2>Available focus areas</h2>
                                    <ul>
                                        {focusAreas.map((item) => <li key={item}><Check size={17} /> {item}</li>)}
                                    </ul>
                                </div>
                            )}
                        </section>
                    )}

                    <footer className="offering-detail-actions">
                        <Link
                            className="button"
                            to={`/private-training?offer_id=${encodeURIComponent(offer.id)}#training-packages`}
                        >
                            Choose this package <ArrowRight size={17} />
                        </Link>
                        <Link className="button button--dark-ghost" to="/private-training">Compare packages</Link>
                    </footer>
                </article>
            </div>
        </section>
    );
}
