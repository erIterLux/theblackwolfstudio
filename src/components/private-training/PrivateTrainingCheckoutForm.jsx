import {
  BadgePercent,
  Check,
  CreditCard,
  LoaderCircle,
  Users,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import {
  quotePrivateTrainingCheckout,
  startPrivateTrainingCheckout,
} from '../../services/privateTraining';

function formatMoney(cents, currency = 'usd') {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: String(currency || 'usd').toUpperCase(),
  }).format(Number(cents || 0) / 100);
}

function blankParticipant(index) {
  return {
    id: `participant-${index + 1}`,
    fullName: '',
    email: '',
    phone: '',
    isPurchaser: false,
  };
}

function participantPriceLabel(offer, count) {
  if (offer.pricingModel === 'per_participant') {
    return `${formatMoney(offer.unitAmountCents, offer.currency)} per person`;
  }
  if (offer.pricingModel === 'participant_tiers') {
    const amount = offer.participantAmountsCents?.[count]
      ?? offer.participantAmountsCents?.[String(count)];
    return `${formatMoney(amount, offer.currency)} for ${count}`;
  }
  return formatMoney(offer.amountCents, offer.currency);
}

export default function PrivateTrainingCheckoutForm({ offer, onCancel }) {
  const { user } = useAuth();
  const maxParticipants = Number(offer.privateTraining?.maxParticipants || 3);
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
      setParticipants((current) => current.map((item, index) => (
        index === 0
          ? {
              ...item,
              fullName: purchaser.name,
              email: purchaser.email,
              phone: purchaser.phone,
              isPurchaser: true,
            }
          : item
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

    quotePrivateTrainingCheckout({
      offerId: offer.id,
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
  }, [offer.id, participantCount, appliedCode]);

  const visibleParticipants = useMemo(
    () => participants.slice(0, participantCount),
    [participants, participantCount],
  );

  const updateParticipant = (index, patch) => {
    setParticipants((current) => current.map((item, itemIndex) => (
      itemIndex === index ? { ...item, ...patch } : item
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

  const applyDiscount = () => {
    setAppliedCode(discountCode.trim());
  };

  const beginCheckout = async (event) => {
    event.preventDefault();
    setError('');

    if (visibleParticipants.some((item) => !item.fullName.trim())) {
      setError('Enter a full name for every participant.');
      return;
    }

    setBusy(true);
    try {
      await startPrivateTrainingCheckout({
        offerId: offer.id,
        participantCount,
        discountCode: appliedCode,
        purchaser,
        participants: visibleParticipants.map((item, index) => ({
          ...item,
          id: item.id || `participant-${index + 1}`,
          isPurchaser: purchaserAttending && index === 0,
        })),
      });
    } catch (nextError) {
      console.error(nextError);
      setError(nextError?.message || 'Checkout could not be started.');
      setBusy(false);
    }
  };

  return (
    <form className="private-checkout" onSubmit={beginCheckout}>
      <div className="private-checkout__heading">
        <div>
          <p className="eyebrow">Private training checkout</p>
          <h2>{offer.name}</h2>
        </div>
        <button className="text-link" type="button" onClick={onCancel}>
          Choose another package
        </button>
      </div>

      <section className="private-checkout__section">
        <div className="private-checkout__section-heading">
          <Users aria-hidden="true" />
          <div>
            <h3>Who will train?</h3>
            <p>Private sessions can include up to {maxParticipants} people.</p>
          </div>
        </div>

        <div className="participant-count" role="group" aria-label="Number of participants">
          {Array.from({ length: maxParticipants }, (_, index) => index + 1).map((count) => (
            <button
              key={count}
              type="button"
              className={participantCount === count ? 'is-active' : ''}
              aria-pressed={participantCount === count}
              onClick={() => setParticipantCount(count)}
            >
              {count} {count === 1 ? 'person' : 'people'}
              <span>{participantPriceLabel(offer, count)}</span>
            </button>
          ))}
        </div>

        <label className="checkbox-row">
          <input
            type="checkbox"
            checked={purchaserAttending}
            onChange={(event) => togglePurchaserAttending(event.target.checked)}
          />
          I am one of the participants
        </label>

        <div className="participant-forms">
          {visibleParticipants.map((participant, index) => (
            <fieldset key={participant.id} className="participant-form">
              <legend>Participant {index + 1}</legend>
              <label>
                Full name
                <input
                  required
                  value={participant.fullName}
                  readOnly={purchaserAttending && index === 0}
                  onChange={(event) => updateParticipant(index, {
                    fullName: event.target.value,
                    isPurchaser: false,
                  })}
                />
              </label>
              <div className="form-row">
                <label>
                  Email <span className="optional-label">optional</span>
                  <input
                    type="email"
                    value={participant.email || ''}
                    readOnly={purchaserAttending && index === 0}
                    onChange={(event) => updateParticipant(index, {
                      email: event.target.value,
                    })}
                  />
                </label>
                <label>
                  Phone <span className="optional-label">optional</span>
                  <input
                    type="tel"
                    value={participant.phone || ''}
                    readOnly={purchaserAttending && index === 0}
                    onChange={(event) => updateParticipant(index, {
                      phone: event.target.value,
                    })}
                  />
                </label>
              </div>
            </fieldset>
          ))}
        </div>
      </section>

      <section className="private-checkout__section">
        <div className="private-checkout__section-heading">
          <CreditCard aria-hidden="true" />
          <div>
            <h3>Purchaser</h3>
            <p>The receipt and package confirmation will use this information.</p>
          </div>
        </div>
        <div className="form-row">
          <label>
            Full name
            <input
              required
              value={purchaser.name}
              onChange={(event) => setPurchaser((current) => ({
                ...current,
                name: event.target.value,
              }))}
            />
          </label>
          <label>
            Email
            <input
              required
              type="email"
              value={purchaser.email}
              onChange={(event) => setPurchaser((current) => ({
                ...current,
                email: event.target.value,
              }))}
            />
          </label>
        </div>
        <label>
          Phone <span className="optional-label">optional</span>
          <input
            type="tel"
            value={purchaser.phone}
            onChange={(event) => setPurchaser((current) => ({
              ...current,
              phone: event.target.value,
            }))}
          />
        </label>
      </section>

      <section className="private-checkout__section private-checkout__pricing">
        <div className="private-checkout__section-heading">
          <BadgePercent aria-hidden="true" />
          <div>
            <h3>Pricing and discounts</h3>
            <p>Active member pricing is applied automatically when you are signed in.</p>
          </div>
        </div>
        <div className="discount-code-row">
          <label>
            Promotion code <span className="optional-label">optional</span>
            <input
              value={discountCode}
              onChange={(event) => setDiscountCode(event.target.value.toUpperCase())}
              placeholder="ENTER CODE"
            />
          </label>
          <button className="button button--dark-ghost" type="button" onClick={applyDiscount}>
            Apply code
          </button>
        </div>

        {quoteLoading ? (
          <p className="quote-loading"><LoaderCircle className="spin" /> Calculating price…</p>
        ) : quote && (
          <div className="checkout-summary" aria-live="polite">
            <div><span>Package subtotal</span><strong>{formatMoney(quote.subtotalCents, quote.currency)}</strong></div>
            {quote.discountAmountCents > 0 && (
              <div className="checkout-summary__discount">
                <span>{quote.discount?.label || 'Discount'}</span>
                <strong>−{formatMoney(quote.discountAmountCents, quote.currency)}</strong>
              </div>
            )}
            <div className="checkout-summary__total">
              <span>Total</span>
              <strong>{formatMoney(quote.totalCents, quote.currency)}</strong>
            </div>
          </div>
        )}
      </section>

      {error && <p className="form-status form-status--error">{error}</p>}

      <div className="private-checkout__actions">
        <p>
          <Check size={16} aria-hidden="true" />
          One package credit covers the selected group for each private session.
        </p>
        <button className="button" type="submit" disabled={busy || quoteLoading || !quote}>
          {busy ? 'Opening secure checkout…' : 'Continue to secure checkout'}
        </button>
      </div>
    </form>
  );
}
