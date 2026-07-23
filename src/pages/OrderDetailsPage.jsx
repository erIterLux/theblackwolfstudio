import {
  ArrowLeft,
  CalendarCheck2,
  CheckCircle2,
  Clock3,
  CreditCard,
  Dumbbell,
  ExternalLink,
  MapPin,
  ReceiptText,
  ShieldCheck,
  UserCheck,
  Users,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { getPurchaseReceipt } from '../services/purchases';
import { getStudioOrder } from '../services/studioCommerce';

function formatMoney(cents, currency = 'usd') {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: String(currency || 'usd').toUpperCase(),
  }).format(Number(cents || 0) / 100);
}

function formatDate(value, includeTime = true) {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.valueOf())) return 'Not available';
  return date.toLocaleString('en-US', includeTime
    ? { month: 'long', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }
    : { month: 'long', day: 'numeric', year: 'numeric' });
}

function readableStatus(value) {
  return String(value || 'pending').replaceAll('_', ' ');
}

export default function OrderDetailsPage() {
  const { orderId = '' } = useParams();
  const [searchParams] = useSearchParams();
  const tokenFromUrl = searchParams.get('access_token') || '';
  const storageKey = orderId ? `black-wolf-order:${orderId}` : '';
  const accessToken = useMemo(() => {
    if (tokenFromUrl && storageKey) {
      sessionStorage.setItem(storageKey, tokenFromUrl);
      return tokenFromUrl;
    }
    if (!storageKey) return '';
    return sessionStorage.getItem(storageKey)
      || sessionStorage.getItem(`black-wolf-event-order:${orderId}`)
      || sessionStorage.getItem(`black-wolf-private-order:${orderId}`)
      || '';
  }, [storageKey, tokenFromUrl, orderId]);

  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [receiptBusy, setReceiptBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!tokenFromUrl) return;
    const url = new URL(window.location.href);
    url.searchParams.delete('access_token');
    window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
  }, [tokenFromUrl]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const result = await getStudioOrder(orderId, accessToken);
        if (!cancelled) setOrder(result?.order || null);
      } catch (nextError) {
        if (!cancelled) setError(nextError?.message || 'Purchase details could not be loaded.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    queueMicrotask(load);
    return () => { cancelled = true; };
  }, [orderId, accessToken]);

  const loadReceipt = async () => {
    setReceiptBusy(true);
    setError('');
    try {
      const result = await getPurchaseReceipt(orderId, accessToken);
      const url = result?.receipt?.url;
      if (!url) throw new Error(result?.freePurchase ? 'This was a free registration, so there is no payment receipt.' : 'Receipt is not available yet.');
      setOrder((current) => ({ ...current, receiptUrl: url }));
    } catch (nextError) {
      setError(nextError?.message || 'Receipt could not be loaded.');
    } finally {
      setReceiptBusy(false);
    }
  };

  if (loading) return <p className="page-loader"><Clock3 size={18} /> Loading purchase…</p>;

  const isEvent = order?.purchaseType === 'event';
  const isFree = Number(order?.pricing?.totalCents || 0) === 0;

  return (
    <section className="section section--light order-details-page">
      <div className="container order-details-page__inner">
        <Link className="text-link" to="/member/purchases"><ArrowLeft size={17} /> Purchases</Link>
        {error && <p className="form-status form-status--error">{error}</p>}

        {order && (
          <>
            <div className="order-details-heading">
              <div className="purchase-icon">{isEvent ? <CalendarCheck2 /> : <Dumbbell />}</div>
              <div>
                <p className="eyebrow">Purchase {order.id}</p>
                <h1>{order.offerName}</h1>
                <p>Purchased {formatDate(order.paidAt || order.createdAt)}</p>
              </div>
              <span className={`purchase-status is-${order.paymentStatus || 'pending'}`}>{readableStatus(order.paymentStatus)}</span>
            </div>

            <div className="order-detail-grid">
              <article>
                <p className="footer-heading">Payment</p>
                <div><span>Subtotal</span><strong>{formatMoney(order.pricing?.subtotalCents, order.currency)}</strong></div>
                <div><span>Discount</span><strong>−{formatMoney(order.pricing?.discountAmountCents, order.currency)}</strong></div>
                <div><span>Total</span><strong>{formatMoney(order.pricing?.totalCents, order.currency)}</strong></div>
                {order.pricing?.discount?.label && <div><span>Discount source</span><strong>{order.pricing.discount.label}</strong></div>}
                {order.paymentCardLast4 && <div><span>Paid with</span><strong>{order.paymentCardBrand} •••• {order.paymentCardLast4}</strong></div>}
              </article>

              <article>
                <p className="footer-heading">Purchaser</p>
                <div><span>Name</span><strong>{order.purchaser?.name}</strong></div>
                <div><span>Email</span><strong>{order.purchaser?.email}</strong></div>
                {order.purchaser?.phone && <div><span>Phone</span><strong>{order.purchaser.phone}</strong></div>}
              </article>

              {isEvent && (
                <article>
                  <p className="footer-heading">Event</p>
                  <div><span>Date</span><strong>{formatDate(order.event?.startsAt)}</strong></div>
                  <div><span>Location</span><strong><MapPin size={15} /> {order.event?.location?.name || order.event?.location?.address || 'To be announced'}</strong></div>
                  <div><span>Waiver required</span><strong>{order.event?.waiverRequired ? 'Yes' : 'No'}</strong></div>
                </article>
              )}

              {!isEvent && (
                <article>
                  <p className="footer-heading">Package</p>
                  <div><span>Sessions</span><strong>{order.privateTraining?.sessionCount || '—'}</strong></div>
                  <div><span>Session length</span><strong>{order.privateTraining?.sessionDurationMinutes || '—'} minutes</strong></div>
                  <div><span>Participants</span><strong>{order.participantCount || 1}</strong></div>
                </article>
              )}
            </div>

            <section className="order-participant-section">
              <p className="footer-heading"><Users size={17} /> Participants</p>
              {(order.participants || []).map((participant) => (
                <article key={participant.id}>
                  <div><strong>{participant.fullName}</strong><span>{participant.email || 'No email provided'}</span></div>
                  {isEvent && (
                    <div>
                      <span><ShieldCheck size={15} /> Waiver {readableStatus(participant.waiverStatus || 'pending')}</span>
                      <span><UserCheck size={15} /> {readableStatus(participant.checkInStatus || 'not_checked_in')}</span>
                    </div>
                  )}
                </article>
              ))}
            </section>

            <div className="order-receipt-panel">
              <div>
                {order.paymentStatus === 'paid' ? <CheckCircle2 /> : <CreditCard />}
                <div><strong>{isFree ? 'Free registration' : 'Payment receipt'}</strong><span>{isFree ? 'No card payment was collected.' : 'Stripe hosts the official payment receipt.'}</span></div>
              </div>
              {!isFree && order.receiptUrl && (
                <a className="button" href={order.receiptUrl} target="_blank" rel="noreferrer"><ReceiptText size={17} /> Open receipt <ExternalLink size={15} /></a>
              )}
              {!isFree && !order.receiptUrl && order.paymentStatus === 'paid' && (
                <button className="button" type="button" onClick={loadReceipt} disabled={receiptBusy}><ReceiptText size={17} /> {receiptBusy ? 'Finding receipt…' : 'Find receipt'}</button>
              )}
            </div>
          </>
        )}
      </div>
    </section>
  );
}
