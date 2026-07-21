import {
  ArrowRight,
  CalendarCheck2,
  CreditCard,
  Dumbbell,
  ReceiptText,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import usePurchaseHistory from '../../hooks/usePurchaseHistory';

export default function PurchaseSummaryCard() {
  const { summary, membership, loading, error } = usePurchaseHistory();

  return (
    <article className="dashboard-card dashboard-card--purchases">
      <div className="dashboard-card__heading">
        <ReceiptText aria-hidden="true" />
        <div>
          <p className="eyebrow">Purchases and receipts</p>
          <h2>Your training activity</h2>
        </div>
      </div>

      {loading && <p className="dashboard-hint">Loading purchase summary…</p>}
      {error && <p className="form-status form-status--error">{error}</p>}

      {!loading && !error && (
        <div className="purchase-summary-metrics">
          <div>
            <CreditCard size={18} aria-hidden="true" />
            <strong>{summary.activeMembership ? membership?.planName || 'Active' : 'None'}</strong>
            <span>membership</span>
          </div>
          <div>
            <Dumbbell size={18} aria-hidden="true" />
            <strong>{summary.remainingPrivateSessions}</strong>
            <span>private sessions</span>
          </div>
          <div>
            <CalendarCheck2 size={18} aria-hidden="true" />
            <strong>{summary.upcomingEvents}</strong>
            <span>upcoming events</span>
          </div>
        </div>
      )}

      <Link to="/member/purchases" className="text-link">
        View purchases and receipts <ArrowRight size={17} aria-hidden="true" />
      </Link>
    </article>
  );
}
