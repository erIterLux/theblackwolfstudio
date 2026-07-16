import { CreditCard, ShieldCheck } from 'lucide-react';
import { useState } from 'react';
import useMembership from '../../hooks/useMembership';
import { openBillingPortal } from '../../services/membership';

function formatDate(value) {
  const date = value?.toDate?.() || (value ? new Date(value) : null);
  return date && !Number.isNaN(date.valueOf())
    ? date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
    : '';
}

export default function MembershipStatusCard() {
  const { membership, loading, error, isActive } = useMembership();
  const [portalLoading, setPortalLoading] = useState(false);
  const [portalError, setPortalError] = useState('');

  const manageBilling = async () => {
    setPortalLoading(true);
    setPortalError('');
    try {
      await openBillingPortal();
    } catch (nextError) {
      console.error(nextError);
      setPortalError(nextError?.message || 'Billing could not be opened.');
      setPortalLoading(false);
    }
  };

  if (loading) return <article className="dashboard-card"><p>Loading membership…</p></article>;
  if (error) return <article className="dashboard-card"><p className="form-error">{error}</p></article>;

  if (!membership) {
    return (
      <article className="dashboard-card membership-status-card">
        <div className="dashboard-card__heading"><ShieldCheck /><div><p className="eyebrow">Membership</p><h2>No active plan</h2></div></div>
        <p>Choose a membership to unlock the studio member experience.</p>
        <a className="button" href="/membership">View memberships</a>
      </article>
    );
  }

  return (
    <article className="dashboard-card membership-status-card">
      <div className="dashboard-card__heading"><ShieldCheck /><div><p className="eyebrow">Membership</p><h2>{membership.planName || 'Studio membership'}</h2></div></div>
      <p className={`membership-state ${isActive ? 'is-active' : 'is-inactive'}`}>
        {isActive ? 'Active' : String(membership.status || 'Inactive').replaceAll('_', ' ')}
      </p>
      {membership.cancelAtPeriodEnd && (
        <p>Your membership is scheduled to end{formatDate(membership.currentPeriodEnd) ? ` on ${formatDate(membership.currentPeriodEnd)}` : ' after the current billing period'}.</p>
      )}
      {membership.stripeCustomerId && (
        <button type="button" className="text-link" onClick={manageBilling} disabled={portalLoading}>
          <CreditCard size={17} /> {portalLoading ? 'Opening billing…' : 'Manage billing'}
        </button>
      )}
      {portalError && <p className="form-error">{portalError}</p>}
    </article>
  );
}
