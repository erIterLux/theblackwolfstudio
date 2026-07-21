import {
  ArrowLeft,
  CalendarCheck2,
  CreditCard,
  Dumbbell,
  ExternalLink,
  ReceiptText,
  Search,
  Users,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import useStudioRole from '../hooks/useStudioRole';
import { listCommerceOrdersAdmin } from '../services/purchases';

function formatMoney(cents, currency = 'usd') {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: String(currency || 'usd').toUpperCase(),
  }).format(Number(cents || 0) / 100);
}

function formatDate(value) {
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.valueOf())
    ? date.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })
    : '—';
}

function readable(value) {
  return String(value || 'pending').replaceAll('_', ' ');
}

export default function InstructorOrdersAdmin() {
  const { isInstructor, loading: roleLoading } = useStudioRole();
  const [data, setData] = useState({ orders: [], membershipPayments: [], memberships: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [type, setType] = useState('all');
  const [status, setStatus] = useState('all');
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (roleLoading) return;
    if (!isInstructor) return;
    let cancelled = false;
    const load = async () => {
      try {
        const result = await listCommerceOrdersAdmin();
        if (!cancelled) setData(result || { orders: [], membershipPayments: [], memberships: [] });
      } catch (nextError) {
        if (!cancelled) setError(nextError?.message || 'Orders could not be loaded.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    queueMicrotask(load);
    return () => { cancelled = true; };
  }, [isInstructor, roleLoading]);

  const records = useMemo(() => {
    const oneTime = (data.orders || []).map((order) => ({ ...order, recordType: order.purchaseType }));
    const memberships = (data.membershipPayments || []).map((payment) => ({ ...payment, recordType: 'membership' }));
    return [...oneTime, ...memberships]
      .filter((record) => type === 'all' || record.recordType === type)
      .filter((record) => status === 'all' || (record.paymentStatus || record.status) === status)
      .filter((record) => {
        const haystack = [
          record.id,
          record.offerName,
          record.planName,
          record.purchaser?.name,
          record.purchaser?.email,
          record.uid,
        ].join(' ').toLowerCase();
        return haystack.includes(query.trim().toLowerCase());
      })
      .sort((left, right) => String(right.createdAt || right.attemptedAt || '').localeCompare(String(left.createdAt || left.attemptedAt || '')));
  }, [data, type, status, query]);

  if (!roleLoading && !isInstructor) {
    return <section className="section section--light"><div className="container"><h1>Instructor access required</h1></div></section>;
  }

  return (
    <section className="member-page commerce-orders-page">
      <div className="container">
        <div className="member-header member-header--refined">
          <div>
            <Link className="text-link" to="/member"><ArrowLeft size={17} /> Member home</Link>
            <p className="eyebrow">Instructor commerce</p>
            <h1>Orders and payments</h1>
            <p>Review membership invoices, event registrations, private-training purchases, discounts, and receipt availability.</p>
          </div>
        </div>

        <div className="commerce-order-summary">
          <div><CreditCard /><strong>{data.membershipPayments.length}</strong><span>membership payments</span></div>
          <div><CalendarCheck2 /><strong>{data.orders.filter((order) => order.purchaseType === 'event').length}</strong><span>event orders</span></div>
          <div><Dumbbell /><strong>{data.orders.filter((order) => order.purchaseType === 'private_training').length}</strong><span>private packages</span></div>
          <div><Users /><strong>{data.memberships.filter((membership) => ['active', 'trialing'].includes(membership.status)).length}</strong><span>active memberships</span></div>
        </div>

        <div className="commerce-order-filters">
          <label><span>Search</span><div><Search size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Name, email, order, member" /></div></label>
          <label><span>Type</span><select value={type} onChange={(event) => setType(event.target.value)}><option value="all">All</option><option value="membership">Membership</option><option value="event">Events</option><option value="private_training">Private training</option></select></label>
          <label><span>Status</span><select value={status} onChange={(event) => setStatus(event.target.value)}><option value="all">All</option><option value="paid">Paid</option><option value="pending">Pending</option><option value="processing">Processing</option><option value="failed">Failed</option><option value="expired">Expired</option><option value="open">Open invoice</option><option value="void">Void</option></select></label>
        </div>

        {loading && <p className="page-loader">Loading commerce records…</p>}
        {error && <p className="form-status form-status--error">{error}</p>}

        {!loading && !error && (
          <div className="commerce-order-table-wrap">
            <table className="commerce-order-table">
              <thead><tr><th>Date</th><th>Type</th><th>Purchaser / member</th><th>Offering</th><th>Status</th><th>Amount</th><th>Discount</th><th>Receipt</th></tr></thead>
              <tbody>
                {records.map((record) => {
                  const membership = record.recordType === 'membership';
                  const receiptUrl = membership ? record.hostedInvoiceUrl : record.receiptUrl;
                  return (
                    <tr key={`${record.recordType}-${record.id}`}>
                      <td>{formatDate(record.createdAt || record.attemptedAt || record.paidAt)}</td>
                      <td>{membership ? 'Membership' : record.recordType === 'event' ? 'Event' : 'Private training'}</td>
                      <td><strong>{record.purchaser?.name || record.planName || record.uid || '—'}</strong><span>{record.purchaser?.email || record.uid || ''}</span></td>
                      <td>{record.offerName || record.planName || 'Membership payment'}</td>
                      <td><span className={`purchase-status is-${record.paymentStatus || record.status}`}>{readable(record.paymentStatus || record.status)}</span></td>
                      <td>{formatMoney(membership ? record.amountPaidCents || record.amountDueCents : record.pricing?.totalCents, record.currency)}</td>
                      <td>{membership ? '—' : formatMoney(record.pricing?.discountAmountCents, record.currency)}</td>
                      <td>{receiptUrl ? <a className="text-link" href={receiptUrl} target="_blank" rel="noreferrer"><ReceiptText size={15} /> Open <ExternalLink size={13} /></a> : 'Not stored'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {!records.length && <p className="empty-table-message">No commerce records match these filters.</p>}
          </div>
        )}
      </div>
    </section>
  );
}
