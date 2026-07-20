import {
  ArrowLeft,
  CalendarClock,
  Copy,
  Edit3,
  PauseCircle,
  Percent,
  PlayCircle,
  Plus,
  RefreshCw,
  Save,
  Tag,
  TicketPercent,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import useStudioRole from '../hooks/useStudioRole';
import {
  listCommerceFoundationAdmin,
  saveStudioDiscount,
} from '../services/studioCommerce';

const PURCHASE_TYPES = [
  { key: 'event', label: 'Events' },
  { key: 'private_training', label: 'Private training' },
];

const EMPTY_DRAFT = {
  id: '',
  name: '',
  code: '',
  type: 'percent',
  value: '',
  active: true,
  memberOnly: false,
  appliesTo: ['event', 'private_training'],
  offerIds: [],
  startsAt: '',
  endsAt: '',
  maxRedemptions: '',
};

function functionMessage(error, fallback) {
  return String(error?.message || fallback)
    .replace(/^Firebase:\s*/i, '')
    .replace(/^FirebaseError:\s*/i, '')
    .trim();
}

function localDateTime(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return '';
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function dollars(cents) {
  const amount = Number(cents || 0) / 100;
  return Number.isFinite(amount) ? String(amount.toFixed(2)).replace(/\.00$/, '') : '';
}

function toDraft(discount = {}) {
  const type = discount.type === 'amount' ? 'amount' : 'percent';
  const appliesTo = Array.isArray(discount.appliesTo) && discount.appliesTo.length
    ? discount.appliesTo
    : ['event', 'private_training'];

  return {
    ...EMPTY_DRAFT,
    id: discount.id || '',
    name: discount.name || '',
    code: discount.codeDisplay || discount.codeNormalized || '',
    type,
    value: type === 'amount' ? dollars(discount.value) : String(discount.value ?? ''),
    active: discount.active !== false,
    memberOnly: discount.memberOnly === true,
    appliesTo,
    offerIds: Array.isArray(discount.offerIds) ? discount.offerIds : [],
    startsAt: localDateTime(discount.startsAt),
    endsAt: localDateTime(discount.endsAt),
    maxRedemptions: Number(discount.maxRedemptions || 0) > 0
      ? String(discount.maxRedemptions)
      : '',
  };
}

function statusFor(discount) {
  if (discount.active === false) return { key: 'inactive', label: 'Inactive' };

  const now = Date.now();
  const startsAt = discount.startsAt ? new Date(discount.startsAt).getTime() : 0;
  const endsAt = discount.endsAt ? new Date(discount.endsAt).getTime() : 0;
  const maximum = Number(discount.maxRedemptions || 0);
  const used = Number(discount.redemptions || 0);

  if (maximum > 0 && used >= maximum) return { key: 'exhausted', label: 'Limit reached' };
  if (startsAt && startsAt > now) return { key: 'scheduled', label: 'Scheduled' };
  if (endsAt && endsAt < now) return { key: 'expired', label: 'Expired' };
  return { key: 'active', label: 'Active' };
}

function formatDateTime(value) {
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.valueOf())
    ? date.toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      })
    : '';
}

function discountValueLabel(discount) {
  return discount.type === 'amount'
    ? `$${(Number(discount.value || 0) / 100).toFixed(2)}`
    : `${Number(discount.value || 0)}%`;
}

function payloadFromDraft(draft, activeOverride) {
  const rawValue = Number(draft.value);
  const value = draft.type === 'amount'
    ? Math.round(rawValue * 100)
    : rawValue;

  return {
    discountId: draft.id || undefined,
    name: draft.name.trim(),
    code: draft.code.trim(),
    type: draft.type,
    value,
    active: activeOverride ?? draft.active,
    memberOnly: draft.memberOnly,
    appliesTo: draft.appliesTo,
    offerIds: draft.offerIds,
    startsAt: draft.startsAt || null,
    endsAt: draft.endsAt || null,
    maxRedemptions: draft.maxRedemptions === ''
      ? 0
      : Number(draft.maxRedemptions),
  };
}

export default function InstructorDiscountsAdmin() {
  const {
    isInstructor,
    loading: roleLoading,
    error: roleError,
    refresh: refreshRole,
  } = useStudioRole();

  const [discounts, setDiscounts] = useState([]);
  const [offers, setOffers] = useState([]);
  const [draft, setDraft] = useState(EMPTY_DRAFT);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setMessage('');
    try {
      const result = await listCommerceFoundationAdmin();
      setDiscounts(result?.discounts || []);
      setOffers(result?.offers || []);
    } catch (error) {
      console.error(error);
      setMessage(functionMessage(error, 'Discount administration could not be loaded.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isInstructor) queueMicrotask(load);
  }, [isInstructor, load]);

  const availableOffers = useMemo(() => {
    const selectedTypes = new Set(draft.appliesTo);
    return offers
      .filter((offer) => selectedTypes.has(offer.purchaseType))
      .sort((left, right) => String(left.name || '').localeCompare(String(right.name || '')));
  }, [draft.appliesTo, offers]);

  const sortedDiscounts = useMemo(() => (
    [...discounts].sort((left, right) => {
      const priority = {
        active: 0,
        scheduled: 1,
        inactive: 2,
        exhausted: 3,
        expired: 4,
      };
      const leftStatus = statusFor(left).key;
      const rightStatus = statusFor(right).key;
      return (priority[leftStatus] ?? 9) - (priority[rightStatus] ?? 9)
        || String(left.codeDisplay || '').localeCompare(String(right.codeDisplay || ''));
    })
  ), [discounts]);

  const updateDraft = (patch) => setDraft((current) => ({ ...current, ...patch }));

  const togglePurchaseType = (key) => {
    setDraft((current) => {
      const next = new Set(current.appliesTo);
      if (next.has(key)) next.delete(key);
      else next.add(key);

      const appliesTo = [...next];
      const allowedTypes = new Set(appliesTo);
      const allowedOfferIds = new Set(
        offers
          .filter((offer) => allowedTypes.has(offer.purchaseType))
          .map((offer) => offer.id),
      );

      return {
        ...current,
        appliesTo,
        offerIds: current.offerIds.filter((offerId) => allowedOfferIds.has(offerId)),
      };
    });
  };

  const toggleOffer = (offerId) => {
    setDraft((current) => {
      const next = new Set(current.offerIds);
      if (next.has(offerId)) next.delete(offerId);
      else next.add(offerId);
      return { ...current, offerIds: [...next] };
    });
  };

  const validateDraft = () => {
    if (!draft.name.trim()) return 'Enter an internal discount name.';
    if (!draft.code.trim()) return 'Enter a customer-facing discount code.';
    if (!draft.appliesTo.length) return 'Choose events, private training, or both.';

    const value = Number(draft.value);
    if (!Number.isFinite(value) || value <= 0) {
      return draft.type === 'amount'
        ? 'Enter a fixed discount greater than $0.'
        : 'Enter a percentage greater than 0.';
    }
    if (draft.type === 'percent' && value > 100) {
      return 'Percentage discounts cannot exceed 100%.';
    }

    const maximum = draft.maxRedemptions === '' ? 0 : Number(draft.maxRedemptions);
    if (!Number.isInteger(maximum) || maximum < 0) {
      return 'Maximum redemptions must be a whole number or left blank.';
    }

    if (draft.startsAt && draft.endsAt) {
      const start = new Date(draft.startsAt).getTime();
      const end = new Date(draft.endsAt).getTime();
      if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
        return 'The discount end time must be after its start time.';
      }
    }

    return '';
  };

  const handleSave = async (event) => {
    event.preventDefault();
    const validation = validateDraft();
    if (validation) {
      setMessage(validation);
      return;
    }

    setBusy('save');
    setMessage('');
    try {
      const result = await saveStudioDiscount(payloadFromDraft(draft));
      await load();
      const refreshed = await listCommerceFoundationAdmin();
      const saved = refreshed?.discounts?.find((item) => item.id === result.discountId);
      setDraft(saved ? toDraft(saved) : EMPTY_DRAFT);
      setMessage('Discount code saved.');
    } catch (error) {
      console.error(error);
      setMessage(functionMessage(error, 'The discount code could not be saved.'));
    } finally {
      setBusy('');
    }
  };

  const setActive = async (discount, active) => {
    setBusy(`active:${discount.id}`);
    setMessage('');
    try {
      await saveStudioDiscount(payloadFromDraft(toDraft(discount), active));
      await load();
      if (draft.id === discount.id) updateDraft({ active });
      setMessage(active ? 'Discount code activated.' : 'Discount code paused.');
    } catch (error) {
      console.error(error);
      setMessage(functionMessage(error, 'The discount status could not be changed.'));
    } finally {
      setBusy('');
    }
  };

  const duplicate = (discount) => {
    const copy = toDraft(discount);
    setDraft({
      ...copy,
      id: '',
      name: `Copy of ${copy.name}`,
      code: `${copy.code}-COPY`,
      active: false,
      startsAt: '',
      endsAt: '',
      maxRedemptions: '',
      offerIds: [...copy.offerIds],
    });
    setMessage('Copy created as an inactive draft. Change the code before saving.');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  if (roleLoading) {
    return <section className="page-section"><div className="container">Checking instructor access…</div></section>;
  }

  if (!isInstructor) {
    return (
      <section className="page-section">
        <div className="container commerce-admin-access">
          <TicketPercent aria-hidden="true" />
          <h1>Instructor access required</h1>
          <p>{roleError || 'This page is only available to instructors and administrators.'}</p>
          <button className="button" type="button" onClick={refreshRole}>Check access again</button>
        </div>
      </section>
    );
  }

  return (
    <section className="page-section commerce-admin-page">
      <div className="container">
        <div className="admin-page-heading commerce-admin-heading">
          <div>
            <Link to="/member" className="text-link">
              <ArrowLeft size={17} aria-hidden="true" /> Member home
            </Link>
            <p className="eyebrow">Instructor commerce</p>
            <h1>Discounts and promotion codes</h1>
            <p>
              Create one code for events, private training, or selected offers.
              Membership pricing and promotion codes do not stack; checkout applies
              the single greatest valid discount.
            </p>
          </div>
          <button className="button button--ghost" type="button" onClick={load} disabled={loading}>
            <RefreshCw size={17} aria-hidden="true" /> Refresh
          </button>
        </div>

        {message && <div className="commerce-admin-message" role="status">{message}</div>}

        <div className="commerce-admin-layout">
          <form className="commerce-admin-editor" onSubmit={handleSave}>
            <div className="commerce-admin-panel-heading">
              <div>
                <p className="eyebrow">{draft.id ? 'Edit code' : 'New code'}</p>
                <h2>{draft.id ? draft.code || 'Discount' : 'Create a discount'}</h2>
              </div>
              {draft.id && (
                <button
                  className="button button--small button--ghost"
                  type="button"
                  onClick={() => setDraft(EMPTY_DRAFT)}
                >
                  <Plus size={16} aria-hidden="true" /> New
                </button>
              )}
            </div>

            <div className="commerce-admin-form-grid">
              <label>
                Internal name
                <input
                  required
                  value={draft.name}
                  onChange={(event) => updateDraft({ name: event.target.value })}
                  placeholder="Fall event promotion"
                />
                <span className="field-hint">Shown in administration and checkout summaries.</span>
              </label>

              <label>
                Customer code
                <input
                  required
                  value={draft.code}
                  onChange={(event) => updateDraft({ code: event.target.value.toUpperCase() })}
                  placeholder="FALLTRAINING"
                  autoCapitalize="characters"
                />
                <span className="field-hint">Letters, numbers, and hyphens are supported.</span>
              </label>

              <label>
                Discount type
                <select
                  value={draft.type}
                  onChange={(event) => updateDraft({ type: event.target.value, value: '' })}
                >
                  <option value="percent">Percentage</option>
                  <option value="amount">Fixed dollar amount</option>
                </select>
              </label>

              <label>
                {draft.type === 'amount' ? 'Discount amount' : 'Discount percentage'}
                <div className="commerce-admin-value-input">
                  <span>{draft.type === 'amount' ? '$' : '%'}</span>
                  <input
                    required
                    min="0"
                    max={draft.type === 'percent' ? '100' : undefined}
                    step={draft.type === 'amount' ? '0.01' : '1'}
                    type="number"
                    value={draft.value}
                    onChange={(event) => updateDraft({ value: event.target.value })}
                  />
                </div>
              </label>
            </div>

            <fieldset className="commerce-admin-fieldset">
              <legend>Eligible purchases</legend>
              <p>Choose where the code can be entered.</p>
              <div className="commerce-admin-choice-row">
                {PURCHASE_TYPES.map((item) => (
                  <label className="commerce-admin-check" key={item.key}>
                    <input
                      type="checkbox"
                      checked={draft.appliesTo.includes(item.key)}
                      onChange={() => togglePurchaseType(item.key)}
                    />
                    <span>{item.label}</span>
                  </label>
                ))}
              </div>
            </fieldset>

            <fieldset className="commerce-admin-fieldset">
              <legend>Offer targeting</legend>
              <p>
                Leave every offer unchecked to apply the code to all selected purchase
                types. Select offers to restrict the code to those items only.
              </p>
              {availableOffers.length ? (
                <div className="commerce-admin-offer-list">
                  {availableOffers.map((offer) => (
                    <label className="commerce-admin-check" key={offer.id}>
                      <input
                        type="checkbox"
                        checked={draft.offerIds.includes(offer.id)}
                        onChange={() => toggleOffer(offer.id)}
                      />
                      <span>
                        <strong>{offer.name}</strong>
                        <small>{offer.purchaseType === 'event' ? 'Event' : 'Private training'}</small>
                      </span>
                    </label>
                  ))}
                </div>
              ) : (
                <p className="commerce-admin-empty-note">No matching offers are available yet.</p>
              )}
            </fieldset>

            <div className="commerce-admin-form-grid">
              <label>
                Starts at <span className="optional-label">Optional</span>
                <input
                  type="datetime-local"
                  value={draft.startsAt}
                  onChange={(event) => updateDraft({ startsAt: event.target.value })}
                />
              </label>

              <label>
                Ends at <span className="optional-label">Optional</span>
                <input
                  type="datetime-local"
                  value={draft.endsAt}
                  onChange={(event) => updateDraft({ endsAt: event.target.value })}
                />
              </label>

              <label>
                Maximum redemptions <span className="optional-label">Optional</span>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={draft.maxRedemptions}
                  onChange={(event) => updateDraft({ maxRedemptions: event.target.value })}
                  placeholder="Unlimited"
                />
              </label>
            </div>

            <div className="commerce-admin-switches">
              <label className="commerce-admin-switch">
                <input
                  type="checkbox"
                  checked={draft.memberOnly}
                  onChange={(event) => updateDraft({ memberOnly: event.target.checked })}
                />
                <span>
                  <strong>Members only</strong>
                  <small>Require an active membership before this code can be used.</small>
                </span>
              </label>

              <label className="commerce-admin-switch">
                <input
                  type="checkbox"
                  checked={draft.active}
                  onChange={(event) => updateDraft({ active: event.target.checked })}
                />
                <span>
                  <strong>Active</strong>
                  <small>Inactive codes remain saved but cannot be applied at checkout.</small>
                </span>
              </label>
            </div>

            <div className="commerce-admin-preview">
              <Tag aria-hidden="true" />
              <div>
                <strong>{draft.code || 'YOURCODE'}</strong>
                <span>
                  {draft.value
                    ? `${draft.type === 'amount' ? `$${draft.value}` : `${draft.value}%`} off`
                    : 'Enter a discount value'}
                  {draft.memberOnly ? ' · Members only' : ''}
                </span>
              </div>
            </div>

            <button className="button" type="submit" disabled={busy === 'save'}>
              <Save size={17} aria-hidden="true" />
              {busy === 'save' ? 'Saving…' : 'Save discount'}
            </button>
          </form>

          <section className="commerce-admin-list" aria-labelledby="discount-list-heading">
            <div className="commerce-admin-panel-heading">
              <div>
                <p className="eyebrow">Current codes</p>
                <h2 id="discount-list-heading">{discounts.length} saved</h2>
              </div>
              <TicketPercent aria-hidden="true" />
            </div>

            {loading ? (
              <p>Loading discounts…</p>
            ) : sortedDiscounts.length === 0 ? (
              <div className="commerce-admin-empty-note">
                <Percent aria-hidden="true" />
                <p>No promotion codes have been created.</p>
              </div>
            ) : (
              <div className="commerce-admin-code-list">
                {sortedDiscounts.map((discount) => {
                  const status = statusFor(discount);
                  const types = Array.isArray(discount.appliesTo) && discount.appliesTo.length
                    ? discount.appliesTo
                    : ['event', 'private_training'];
                  const used = Number(discount.redemptions || 0);
                  const maximum = Number(discount.maxRedemptions || 0);
                  const isBusy = busy === `active:${discount.id}`;

                  return (
                    <article className="commerce-admin-code-card" key={discount.id}>
                      <div className="commerce-admin-code-card__top">
                        <div>
                          <span className={`commerce-admin-status is-${status.key}`}>{status.label}</span>
                          <h3>{discount.codeDisplay || discount.codeNormalized}</h3>
                          <p>{discount.name}</p>
                        </div>
                        <strong>{discountValueLabel(discount)} off</strong>
                      </div>

                      <dl className="commerce-admin-code-details">
                        <div>
                          <dt>Applies to</dt>
                          <dd>{types.map((type) => type === 'event' ? 'Events' : 'Private training').join(' + ')}</dd>
                        </div>
                        <div>
                          <dt>Redemptions</dt>
                          <dd>{used}{maximum > 0 ? ` of ${maximum}` : ' · Unlimited'}</dd>
                        </div>
                        {discount.startsAt && (
                          <div>
                            <dt>Starts</dt>
                            <dd>{formatDateTime(discount.startsAt)}</dd>
                          </div>
                        )}
                        {discount.endsAt && (
                          <div>
                            <dt>Ends</dt>
                            <dd>{formatDateTime(discount.endsAt)}</dd>
                          </div>
                        )}
                        {discount.memberOnly && (
                          <div>
                            <dt>Access</dt>
                            <dd>Active members only</dd>
                          </div>
                        )}
                        {Array.isArray(discount.offerIds) && discount.offerIds.length > 0 && (
                          <div>
                            <dt>Offer restrictions</dt>
                            <dd>{discount.offerIds.length} selected</dd>
                          </div>
                        )}
                      </dl>

                      <div className="commerce-admin-code-actions">
                        <button
                          className="button button--small button--ghost"
                          type="button"
                          onClick={() => {
                            setDraft(toDraft(discount));
                            setMessage('');
                            window.scrollTo({ top: 0, behavior: 'smooth' });
                          }}
                        >
                          <Edit3 size={16} aria-hidden="true" /> Edit
                        </button>
                        <button
                          className="button button--small button--ghost"
                          type="button"
                          onClick={() => duplicate(discount)}
                        >
                          <Copy size={16} aria-hidden="true" /> Duplicate
                        </button>
                        <button
                          className="button button--small button--ghost"
                          type="button"
                          disabled={isBusy}
                          onClick={() => setActive(discount, discount.active === false)}
                        >
                          {discount.active === false
                            ? <PlayCircle size={16} aria-hidden="true" />
                            : <PauseCircle size={16} aria-hidden="true" />}
                          {isBusy ? 'Saving…' : discount.active === false ? 'Activate' : 'Pause'}
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </section>
        </div>

        <aside className="commerce-admin-note">
          <CalendarClock aria-hidden="true" />
          <div>
            <strong>How discount selection works</strong>
            <p>
              Checkout verifies every code on the server. When a member discount and
              promotion code are both valid, the customer receives whichever one saves
              more. The two discounts are not combined.
            </p>
          </div>
        </aside>
      </div>
    </section>
  );
}
