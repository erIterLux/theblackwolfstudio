import {
  ArrowLeft,
  CalendarClock,
  Clock3,
  History,
  Users,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import usePrivateTrainingPurchases from '../hooks/usePrivateTrainingPurchases';

function formatDate(value) {
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.valueOf())
    ? date.toLocaleDateString('en-US', {
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      })
    : 'No expiration';
}

function statusLabel(status) {
  if (status === 'active') return 'Active';
  if (status === 'used') return 'Completed';
  if (status === 'expired') return 'Expired';
  return String(status || 'Pending').replaceAll('_', ' ');
}

export default function MemberPrivateTrainingPage() {
  const {
    purchases,
    activePurchases,
    remainingSessions,
    loading,
    error,
    refresh,
  } = usePrivateTrainingPurchases();

  return (
    <section className="member-page private-member-page">
      <div className="container">
        <div className="member-header member-header--refined">
          <div>
            <Link className="text-link" to="/member">
              <ArrowLeft size={17} /> Member home
            </Link>
            <p className="eyebrow">Private training</p>
            <h1>Your session packages</h1>
            <p>
              See registered participants, remaining credits, expiration dates,
              and recorded session use.
            </p>
          </div>
          <Link className="button button--ghost-light" to="/private-training">
            Buy another package
          </Link>
        </div>

        <div className="private-member-summary">
          <div><strong>{activePurchases.length}</strong><span>active packages</span></div>
          <div><strong>{remainingSessions}</strong><span>sessions remaining</span></div>
          <div><strong>{purchases.length}</strong><span>total purchases</span></div>
        </div>

        {loading && <p className="page-loader">Loading private training…</p>}
        {error && (
          <div className="form-status form-status--error">
            <p>{error}</p>
            <button type="button" className="text-link" onClick={refresh}>Try again</button>
          </div>
        )}

        {!loading && !error && !purchases.length && (
          <article className="empty-state-card">
            <h2>No private training packages yet.</h2>
            <p>
              Choose a single-session or multi-session package for one to three
              participants.
            </p>
            <Link className="button" to="/private-training">Explore private training</Link>
          </article>
        )}

        <div className="private-purchase-list">
          {purchases.map((purchase) => (
            <article className="private-purchase-card" key={purchase.id}>
              <div className="private-purchase-card__top">
                <div>
                  <p className="eyebrow">{statusLabel(purchase.status)}</p>
                  <h2>{purchase.offerName}</h2>
                </div>
                <span className={`private-package-status is-${purchase.status || 'pending'}`}>
                  {statusLabel(purchase.status)}
                </span>
              </div>

              <div className="private-credit-display">
                <strong>{purchase.remainingSessions}</strong>
                <span>of {purchase.totalSessions} session credits remaining</span>
              </div>

              <div className="private-purchase-meta">
                <span><Clock3 size={17} /> {purchase.sessionDurationMinutes} minutes per session</span>
                <span><CalendarClock size={17} /> Use by {formatDate(purchase.expiresAt)}</span>
                <span><Users size={17} /> {purchase.participantCount} registered participant{purchase.participantCount === 1 ? '' : 's'}</span>
                <span><History size={17} /> {purchase.usedSessions || 0} sessions recorded</span>
              </div>

              <div className="private-participant-list">
                <p className="footer-heading">Registered group</p>
                <div>
                  {(purchase.participants || []).map((participant) => (
                    <span key={participant.id}>{participant.fullName}</span>
                  ))}
                </div>
              </div>

              {purchase.status === 'active' && purchase.remainingSessions > 0 && (
                <Link className="button" to="/contact?interest=private-training">
                  Request your next session
                </Link>
              )}
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
