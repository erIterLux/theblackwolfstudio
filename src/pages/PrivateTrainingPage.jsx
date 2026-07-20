import {
  ArrowRight,
  CalendarClock,
  Check,
  ShieldCheck,
  Users,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import PrivateTrainingCheckoutForm from '../components/private-training/PrivateTrainingCheckoutForm';
import SectionHeading from '../components/SectionHeading';
import { listPrivateTrainingOffers } from '../services/privateTraining';

function formatMoney(cents, currency = 'usd') {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: String(currency || 'usd').toUpperCase(),
    maximumFractionDigits: 0,
  }).format(Number(cents || 0) / 100);
}

function startingPrice(offer) {
  if (offer.pricingModel === 'per_participant') return offer.unitAmountCents;
  if (offer.pricingModel === 'participant_tiers') {
    return offer.participantAmountsCents?.[1]
      ?? offer.participantAmountsCents?.['1']
      ?? 0;
  }
  return offer.amountCents;
}

export default function PrivateTrainingPage() {
  const [searchParams] = useSearchParams();
  const [offers, setOffers] = useState([]);
  const [selectedOfferId, setSelectedOfferId] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    listPrivateTrainingOffers()
      .then((result) => {
        if (!cancelled) setOffers(result?.offers || []);
      })
      .catch((nextError) => {
        if (!cancelled) {
          console.error(nextError);
          setError(nextError?.message || 'Private training packages could not be loaded.');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const selectedOffer = useMemo(
    () => offers.find((item) => item.id === selectedOfferId) || null,
    [offers, selectedOfferId],
  );

  const canceled = searchParams.get('purchase') === 'canceled';

  return (
    <>
      <section className="page-hero page-hero--compact">
        <div className="container page-hero__inner">
          <p className="eyebrow eyebrow--light">Private training</p>
          <h1>Focused instruction for one to three people.</h1>
          <p>
            Choose a session package, bring up to two training partners, and
            build a focused plan around technique, self-defense, progression,
            movement, or regulation.
          </p>
        </div>
      </section>

      <section className="section section--light private-training-page">
        <div className="container">
          {canceled && (
            <div className="commerce-notice" role="status">
              Checkout was canceled. Nothing was charged, and your package was
              not created.
            </div>
          )}

          {!selectedOffer && (
            <>
              <SectionHeading
                eyebrow="Training packages"
                title="Choose the depth of support you need."
                body="Each session credit covers the same registered group of up to three participants. Active members receive eligible member pricing automatically."
              />

              <div className="private-training-values">
                <div><Users /><strong>One to three participants</strong><span>Train alone or with up to two partners.</span></div>
                <div><CalendarClock /><strong>Flexible package credits</strong><span>Use one credit each time the registered group trains.</span></div>
                <div><ShieldCheck /><strong>Server-verified pricing</strong><span>Membership and promotion discounts are resolved securely.</span></div>
              </div>

              {loading && <p className="page-loader">Loading private training packages…</p>}
              {error && <p className="form-status form-status--error">{error}</p>}

              {!loading && !error && !offers.length && (
                <div className="empty-state-card">
                  <h2>Private training packages are being prepared.</h2>
                  <p>Contact the studio for current availability.</p>
                </div>
              )}

              <div className="private-offer-grid">
                {offers.map((offer) => {
                  const config = offer.privateTraining || {};
                  return (
                    <article className="private-offer-card" key={offer.id}>
                      <div>
                        <p className="eyebrow">
                          {config.sessionCount} session{config.sessionCount === 1 ? '' : 's'}
                        </p>
                        <h2>{offer.name}</h2>
                        <p>{offer.shortDescription}</p>
                      </div>

                      <div className="private-offer-price">
                        <span>Starting at</span>
                        <strong>{formatMoney(startingPrice(offer), offer.currency)}</strong>
                      </div>

                      <ul className="check-list">
                        <li><Check size={17} /> Up to {config.maxParticipants || 3} participants</li>
                        <li><Check size={17} /> {config.sessionDurationMinutes || 60}-minute sessions</li>
                        {config.expirationDays > 0 && (
                          <li><Check size={17} /> Use within {config.expirationDays} days</li>
                        )}
                        {(config.included || []).slice(0, 3).map((item) => (
                          <li key={item}><Check size={17} /> {item}</li>
                        ))}
                      </ul>

                      <button
                        className="button"
                        type="button"
                        onClick={() => {
                          setSelectedOfferId(offer.id);
                          window.scrollTo({ top: 0, behavior: 'smooth' });
                        }}
                      >
                        Choose package <ArrowRight size={17} />
                      </button>
                    </article>
                  );
                })}
              </div>
            </>
          )}

          {selectedOffer && (
            <PrivateTrainingCheckoutForm
              offer={selectedOffer}
              onCancel={() => setSelectedOfferId('')}
            />
          )}
        </div>
      </section>
    </>
  );
}
