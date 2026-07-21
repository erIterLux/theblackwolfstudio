import {
  ArrowLeft,
  CalendarCheck2,
  CheckCircle2,
  Clock3,
  CreditCard,
  Dumbbell,
  ExternalLink,
  FileText,
  ReceiptText,
  RefreshCw,
  Users,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import usePurchaseHistory from '../hooks/usePurchaseHistory';
import { getPurchaseReceipt } from '../services/purchases';

const FILTERS = [
  ['all', 'All'],
  ['membership', 'Membership'],
  ['event', 'Events'],
  ['private_training', 'Private training'],
];

function formatMoney(cents, currency = 'usd') {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: String(currency || 'usd').toUpperCase(),
  }).format(Number(cents || 0) / 100);
}

function formatDate(value, includeTime = false) {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.valueOf())) return 'Not available';
  return date.toLocaleString('en-US', includeTime
    ? {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      }
    : { month: 'short', day: 'numeric', year: 'numeric' });
}

function readableStatus(value) {
  return String(value || 'pending').replaceAll('_', ' ');
}

function ReceiptAction({ order, onReceiptLoaded }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const receiptUrl = order.receiptUrl;
  const isFree = Number(order.pricing?.totalCents || 0) === 0;

  if (isFree) return <span className="purchase-receipt-note">No payment receipt needed</span>;
  if (receiptUrl) {
    return (
      <a className="button button--small" href={receiptUrl} target="_blank" rel="noreferrer">
        <ReceiptText size={16} /> View receipt
      </a>
    );
  }

  const loadReceipt = async () => {
    setBusy(true);
    setError('');
    try {
      const result = await getPurchaseReceipt(order.id);
      const url = result?.receipt?.url;
      if (!url) throw new Error('A receipt is not available yet.');
      onReceiptLoaded(order.id, url);
    } catch (nextError) {
      setError(nextError?.message || 'Receipt could not be loaded.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="purchase-receipt-action">
      <button className="button button--small" type="button" onClick={loadReceipt} disabled={busy}>
        <ReceiptText size={16} /> {busy ? 'Finding receipt…' : 'Find receipt'}
      </button>
      {error && <small>{error}</small>}
    </div>
  );
}

function MembershipPanel({ membership, payments }) {
  if (!membership && !payments.length) {
    return (
      <article className="purchase-empty-section">
        <CreditCard size={30} />
        <div>
          <h2>No membership billing yet</h2>
          <p>Membership invoices will appear here after a subscription payment.</p>
        </div>
        <Link className="button" to="/membership">Explore membership</Link>
      </article>
    );
  }

  return (
    <section className="purchase-section">
      <div className="purchase-section__heading">
        <div>
          <p className="eyebrow">Membership</p>
          <h2>{membership?.planName || 'Membership billing'}</h2>
        </div>
        <span className={`purchase-status is-${membership?.status || 'inactive'}`}>
          {readableStatus(membership?.status || 'inactive')}
        </span>
      </div>

      {membership && (
        <div className="membership-purchase-summary">
          <div><span>Current plan</span><strong>{membership.planName || 'Membership'}</strong></div>
          <div><span>Renewal or end date</span><strong>{formatDate(membership.currentPeriodEnd)}</strong></div>
          <div><span>Billing state</span><strong>{membership.cancelAtPeriodEnd ? 'Ends after current period' : readableStatus(membership.status)}</strong></div>
        </div>
      )}

      <div className="membership-payment-list">
        {payments.map((payment) => (
          <article key={payment.id}>
            <div className="purchase-icon"><FileText aria-hidden="true" /></div>
            <div>
              <strong>{payment.planName || membership?.planName || 'Membership payment'}</strong>
              <span>{formatDate(payment.paidAt || payment.attemptedAt, true)}</span>
              <span className={`purchase-status is-${payment.status}`}>{readableStatus(payment.status)}</span>
            </div>
            <div className="membership-payment-list__amount">
              <strong>{formatMoney(payment.amountPaidCents || payment.amountDueCents, payment.currency)}</strong>
              <div>
                {payment.hostedInvoiceUrl && (
                  <a className="text-link" href={payment.hostedInvoiceUrl} target="_blank" rel="noreferrer">
                    View invoice <ExternalLink size={14} />
                  </a>
                )}
                {payment.invoicePdfUrl && (
                  <a className="text-link" href={payment.invoicePdfUrl} target="_blank" rel="noreferrer">
                    PDF <ExternalLink size={14} />
                  </a>
                )}
              </div>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function OrderCard({ order, onReceiptLoaded }) {
  const isEvent = order.purchaseType === 'event';
  const total = order.pricing?.totalCents || 0;
  const discount = order.pricing?.discountAmountCents || 0;
  const detailsLink = `/order/${encodeURIComponent(order.id)}`;

  return (
    <article className="purchase-order-card">
      <div className="purchase-order-card__heading">
        <div className="purchase-icon">
          {isEvent ? <CalendarCheck2 aria-hidden="true" /> : <Dumbbell aria-hidden="true" />}
        </div>
        <div>
          <p className="eyebrow">{isEvent ? 'Event' : 'Private training'}</p>
          <h3>{order.offerName}</h3>
          <span>Purchased {formatDate(order.paidAt || order.createdAt, true)}</span>
        </div>
        <span className={`purchase-status is-${order.paymentStatus || 'pending'}`}>
          {readableStatus(order.paymentStatus)}
        </span>
      </div>

      <div className="purchase-order-card__meta">
        <span><Users size={16} /> {order.participantCount || order.quantity || 1} participant{Number(order.participantCount || order.quantity || 1) === 1 ? '' : 's'}</span>
        <span><CreditCard size={16} /> {formatMoney(total, order.currency)}</span>
        {discount > 0 && <span>Saved {formatMoney(discount, order.currency)}</span>}
        {order.receiptNumber && <span>Receipt {order.receiptNumber}</span>}
      </div>

      <div className="purchase-order-card__actions">
        <Link className="button button--dark-ghost button--small" to={detailsLink}>View details</Link>
        {order.paymentStatus === 'paid' && (
          <ReceiptAction order={order} onReceiptLoaded={onReceiptLoaded} />
        )}
        {isEvent && <Link className="text-link" to="/member/events">Manage registration</Link>}
        {!isEvent && <Link className="text-link" to="/member/private-training">View package</Link>}
      </div>
    </article>
  );
}

export default function MemberPurchasesPage() {
  const {
    membership,
    membershipPayments,
    orders: initialOrders,
    summary,
    loading,
    error,
    refresh,
  } = usePurchaseHistory();
  const [filter, setFilter] = useState('all');
  const [receiptOverrides, setReceiptOverrides] = useState({});

  const orders = useMemo(() => initialOrders.map((order) => ({
    ...order,
    receiptUrl: receiptOverrides[order.id] || order.receiptUrl,
  })), [initialOrders, receiptOverrides]);

  const filteredOrders = filter === 'all' || filter === 'membership'
    ? orders
    : orders.filter((order) => order.purchaseType === filter);

  const showMembership = filter === 'all' || filter === 'membership';
  const showOrders = filter !== 'membership';

  return (
    <section className="member-page purchases-page">
      <div className="container">
        <div className="member-header member-header--refined">
          <div>
            <Link className="text-link" to="/member"><ArrowLeft size={17} /> Member home</Link>
            <p className="eyebrow">Purchases and receipts</p>
            <h1>Your payment history</h1>
            <p>Membership invoices, event registrations, and private-training purchases in one place.</p>
          </div>
          <button className="button button--ghost-light" type="button" onClick={refresh} disabled={loading}>
            <RefreshCw size={17} /> Refresh
          </button>
        </div>

        <div className="purchase-summary-strip">
          <div><CreditCard /><strong>{summary.activeMembership ? 'Active' : 'None'}</strong><span>membership</span></div>
          <div><Dumbbell /><strong>{summary.remainingPrivateSessions}</strong><span>sessions remaining</span></div>
          <div><CalendarCheck2 /><strong>{summary.upcomingEvents}</strong><span>upcoming events</span></div>
          <div><ReceiptText /><strong>{summary.paidOneTimePurchaseCount}</strong><span>paid purchases</span></div>
        </div>

        <div className="purchase-filters" role="tablist" aria-label="Purchase type">
          {FILTERS.map(([value, label]) => (
            <button
              key={value}
              type="button"
              className={filter === value ? 'is-active' : ''}
              onClick={() => setFilter(value)}
              aria-pressed={filter === value}
            >
              {label}
            </button>
          ))}
        </div>

        {loading && <p className="page-loader"><Clock3 size={18} /> Loading purchases…</p>}
        {error && (
          <div className="form-status form-status--error">
            <p>{error}</p>
            <button className="text-link" type="button" onClick={refresh}>Try again</button>
          </div>
        )}

        {!loading && !error && (
          <>
            {showMembership && <MembershipPanel membership={membership} payments={membershipPayments} />}

            {showOrders && (
              <section className="purchase-section">
                <div className="purchase-section__heading">
                  <div>
                    <p className="eyebrow">One-time purchases</p>
                    <h2>{filter === 'event' ? 'Events' : filter === 'private_training' ? 'Private training' : 'Events and private training'}</h2>
                  </div>
                  <span>{filteredOrders.length} record{filteredOrders.length === 1 ? '' : 's'}</span>
                </div>

                {!filteredOrders.length ? (
                  <article className="purchase-empty-section">
                    <CheckCircle2 size={30} />
                    <div><h3>No purchases in this section.</h3><p>Completed purchases will appear here.</p></div>
                  </article>
                ) : (
                  <div className="purchase-order-list">
                    {filteredOrders.map((order) => (
                      <OrderCard
                        key={order.id}
                        order={order}
                        onReceiptLoaded={(id, url) => setReceiptOverrides((current) => ({ ...current, [id]: url }))}
                      />
                    ))}
                  </div>
                )}
              </section>
            )}
          </>
        )}
      </div>
    </section>
  );
}
