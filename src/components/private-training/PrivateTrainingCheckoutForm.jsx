import {
  BadgePercent,
  Check,
  CreditCard,
  LoaderCircle,
  ShieldCheck,
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
    emergencyContactName: '',
    emergencyContactPhone: '',
    isPurchaser: false,
    isMinor: false,
    guardianName: '',
    guardianEmail: '',
  };
}

function validEmergencyPhone(value) {
  return String(value || '').replace(/\D/g, '').length >= 7;
}

function purchaserFromParticipant(participant = {}) {
  const useGuardian = participant.isMinor
    && (participant.guardianName || participant.guardianEmail);
  return {
    name: (useGuardian ? participant.guardianName : participant.fullName) || '',
    email: (useGuardian ? participant.guardianEmail : participant.email) || '',
    phone: participant.phone || '',
  };
}

function participantOptionLabel(participant = {}, index = 0) {
  const name = String(participant.fullName || '').trim();
  return `Participant ${index + 1}${name ? ` - ${name}` : ''}`;
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
  const [purchaserSource, setPurchaserSource] = useState('participant-0');
  const [alternatePurchaser, setAlternatePurchaser] = useState({
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
      setAlternatePurchaser((current) => ({
        ...current,
        name: current.name || user.displayName || '',
        email: current.email || user.email || '',
      }));
      setParticipants((current) => current.map((item, index) => (
        index === 0
          ? {
              ...item,
              fullName: item.fullName || user.displayName || '',
              email: item.email || user.email || '',
            }
          : item
      )));
    });
  }, [user]);

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
  const selectedPurchaserIndex = purchaserSource.startsWith('participant-')
    ? Number(purchaserSource.replace('participant-', ''))
    : -1;
  const purchaser = purchaserSource === 'other'
    ? alternatePurchaser
    : purchaserFromParticipant(visibleParticipants[selectedPurchaserIndex]);

  useEffect(() => {
    if (selectedPurchaserIndex < participantCount) return;
    queueMicrotask(() => setPurchaserSource('participant-0'));
  }, [participantCount, selectedPurchaserIndex]);

  const updateParticipant = (index, patch) => {
    setParticipants((current) => current.map((item, itemIndex) => (
      itemIndex === index ? { ...item, ...patch } : item
    )));
  };

  const choosePurchaserSource = (nextSource) => {
    if (nextSource === 'other' && purchaserSource !== 'other') {
      setAlternatePurchaser(purchaser);
    }
    setPurchaserSource(nextSource);
  };

  const updatePurchaser = (field, value) => {
    setAlternatePurchaser((current) => ({
      ...(purchaserSource === 'other' ? current : purchaser),
      [field]: value,
    }));
    if (purchaserSource !== 'other') setPurchaserSource('other');
  };

  const applyDiscount = () => {
    setAppliedCode(discountCode.trim());
  };

  const beginCheckout = async (event) => {
    event.preventDefault();
    setError('');

    const invalidParticipantIndex = visibleParticipants.findIndex((item) => (
      !item.fullName.trim()
      || !item.email.trim()
      || !item.emergencyContactName.trim()
      || !validEmergencyPhone(item.emergencyContactPhone)
      || (item.isMinor && (!item.guardianName.trim() || !item.guardianEmail.trim()))
    ));
    if (invalidParticipantIndex >= 0) {
      setError(
        `Complete the required participant, emergency contact, and guardian information for Participant ${invalidParticipantIndex + 1}.`,
      );
      return;
    }
    if (!purchaser.name.trim() || !purchaser.email.trim()) {
      setError('Choose a receipt contact or enter different purchaser information.');
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
          isPurchaser: purchaserSource === `participant-${index}`,
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
            <p>
              Private sessions can include up to {maxParticipants} people. Emergency contact
              name and phone are required for each participant.
            </p>
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

        <div className="participant-forms">
          {visibleParticipants.map((participant, index) => (
            <fieldset key={participant.id} className="participant-form">
              <legend>Participant {index + 1}</legend>
              <label>
                Full legal name
                <input
                  required
                  value={participant.fullName}
                  autoComplete={`section-training-participant-${index + 1} name`}
                  onChange={(event) => updateParticipant(index, {
                    fullName: event.target.value,
                    isPurchaser: false,
                  })}
                />
              </label>
              <div className="form-row">
                <label>
                  Email for waiver and training communication
                  <input
                    required
                    type="email"
                    value={participant.email || ''}
                    autoComplete={`section-training-participant-${index + 1} email`}
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
                    autoComplete={`section-training-participant-${index + 1} tel`}
                    onChange={(event) => updateParticipant(index, {
                      phone: event.target.value,
                    })}
                  />
                </label>
              </div>
              <div className="form-row">
                <label>
                  Emergency contact full name
                  <input
                    required
                    value={participant.emergencyContactName}
                    autoComplete={`section-training-emergency-${index + 1} name`}
                    onChange={(event) => updateParticipant(index, {
                      emergencyContactName: event.target.value,
                    })}
                  />
                </label>
                <label>
                  Emergency contact phone
                  <input
                    required
                    type="tel"
                    value={participant.emergencyContactPhone}
                    autoComplete={`section-training-emergency-${index + 1} tel`}
                    placeholder="Example: (555) 123-4567"
                    onChange={(event) => updateParticipant(index, {
                      emergencyContactPhone: event.target.value,
                    })}
                  />
                </label>
              </div>

              <label className="checkbox-row">
                <input
                  type="checkbox"
                  checked={participant.isMinor}
                  onChange={(event) => updateParticipant(index, {
                    isMinor: event.target.checked,
                    guardianName: event.target.checked ? participant.guardianName : '',
                    guardianEmail: event.target.checked ? participant.guardianEmail : '',
                  })}
                />
                This participant is under 18
              </label>

              {participant.isMinor && (
                <div className="form-row">
                  <label>
                    Parent or guardian full name
                    <input
                      required
                      value={participant.guardianName}
                      autoComplete={`section-training-guardian-${index + 1} name`}
                      onChange={(event) => updateParticipant(index, {
                        guardianName: event.target.value,
                      })}
                    />
                  </label>
                  <label>
                    Parent or guardian email
                    <input
                      required
                      type="email"
                      value={participant.guardianEmail}
                      autoComplete={`section-training-guardian-${index + 1} email`}
                      onChange={(event) => updateParticipant(index, {
                        guardianEmail: event.target.value,
                      })}
                    />
                  </label>
                </div>
              )}
            </fieldset>
          ))}
        </div>
      </section>

      <section className="private-checkout__section private-waiver-disclosure">
        <div className="private-checkout__section-heading">
          <ShieldCheck aria-hidden="true" />
          <div>
            <h3>Participant waivers</h3>
            <p>Payment and waiver completion are separate steps.</p>
          </div>
        </div>
        <p>
          A current member’s signed membership waiver can cover eligible private training.
          Every other participant will receive a secure waiver for this package by email.
          A parent or legal guardian signs for a minor.
        </p>
        <p>
          All attending participants must be covered before a session can be booked or
          recorded. Each signer receives an emailed copy after completion.
        </p>
      </section>

      <section className="private-checkout__section">
        <div className="private-checkout__section-heading">
          <CreditCard aria-hidden="true" />
          <div>
            <h3>Purchaser</h3>
            <p>
              Choose a participant to copy their information automatically, or choose
              someone else. The receipt and package confirmation use this information.
            </p>
          </div>
        </div>
        <label className="purchaser-source">
          Purchaser and receipt contact
          <select
            value={purchaserSource}
            onChange={(event) => choosePurchaserSource(event.target.value)}
          >
            {visibleParticipants.map((participant, index) => (
              <option key={participant.id} value={`participant-${index}`}>
                {participantOptionLabel(participant, index)}
              </option>
            ))}
            <option value="other">Someone else</option>
          </select>
          <span>
            {purchaserSource === 'other'
              ? 'Enter the purchaser information below.'
              : `Copied from ${participantOptionLabel(
                visibleParticipants[selectedPurchaserIndex],
                selectedPurchaserIndex,
              )}. Editing a field switches the contact to someone else.`}
          </span>
        </label>
        <div className="form-row">
          <label>
            Full name
            <input
              required
              value={purchaser.name}
              autoComplete="section-purchaser name"
              onChange={(event) => updatePurchaser('name', event.target.value)}
            />
          </label>
          <label>
            Email
            <input
              required
              type="email"
              value={purchaser.email}
              autoComplete="section-purchaser email"
              onChange={(event) => updatePurchaser('email', event.target.value)}
            />
          </label>
        </div>
        <label>
          Phone <span className="optional-label">optional</span>
          <input
            type="tel"
            value={purchaser.phone}
            autoComplete="section-purchaser tel"
            onChange={(event) => updatePurchaser('phone', event.target.value)}
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
              autoCapitalize="characters"
              autoCorrect="off"
              spellCheck="false"
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
