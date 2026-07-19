import { CreditCard, ShieldCheck } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import useMembership from '../../hooks/useMembership';
import { openBillingPortal } from '../../services/membership';

function formatDate(value) {
    const date = value?.toDate?.() || (value ? new Date(value) : null);
    return date && !Number.isNaN(date.valueOf())
        ? date.toLocaleDateString('en-US', {
            month: 'long',
            day: 'numeric',
            year: 'numeric',
        })
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

    if (loading) {
        return (
            <article className="dashboard-card membership-status-card" aria-live="polite">
                <p>Loading membership…</p>
            </article>
        );
    }

    if (error) {
        return (
            <article className="dashboard-card membership-status-card">
                <p className="form-error">{error}</p>
            </article>
        );
    }

    if (!membership) {
        return (
            <article className="dashboard-card membership-status-card">
                <div className="dashboard-card__heading">
                    <ShieldCheck aria-hidden="true" />
                    <div>
                        <p className="eyebrow">Membership</p>
                        <h2>No active membership</h2>
                    </div>
                </div>
                <p>
                    Membership provides ongoing progression support, training resources,
                    and eligible member pricing. Events and private training can still be
                    purchased separately.
                </p>
                <Link className="button" to="/membership">Explore membership</Link>
            </article>
        );
    }

    const eventDiscount = Number(
        membership.eventDiscountPercent
        ?? membership.discounts?.eventPercent
        ?? 0,
    );
    const privateDiscount = Number(
        membership.privateTrainingDiscountPercent
        ?? membership.discounts?.privateTrainingPercent
        ?? 0,
    );
    const progressionAccess = Boolean(
        membership.progressionAccess
        ?? membership.benefits?.progressionAccess,
    );
    const curriculumAccess = Boolean(
        membership.curriculumAccess
        ?? membership.benefits?.curriculumAccess,
    );
    const wolfGuideAccess = Boolean(
        membership.wolfGuideAccess
        ?? membership.benefits?.wolfGuideAccess,
    );
    const periodEnd = formatDate(
        membership.currentPeriodEnd
        || membership.subscriptionEndDate,
    );

    return (
        <article className="dashboard-card membership-status-card">
            <div className="membership-status-card__top">
                <div className="dashboard-card__heading">
                    <ShieldCheck aria-hidden="true" />
                    <div>
                        <p className="eyebrow">Membership</p>
                        <h2>{membership.planName || membership.planKey || 'Studio membership'}</h2>
                    </div>
                </div>
                <span className={`membership-state ${isActive ? 'is-active' : 'is-inactive'}`}>
                    {isActive
                        ? 'Active'
                        : String(membership.status || 'Inactive').replaceAll('_', ' ')}
                </span>
            </div>

            {periodEnd && (
                <p className="membership-renewal-copy">
                    {membership.cancelAtPeriodEnd
                        ? `Scheduled to end on ${periodEnd}.`
                        : `Current period through ${periodEnd}.`}
                </p>
            )}

            {isActive && (
                <div className="membership-benefit-summary" aria-label="Membership benefits">
                    {progressionAccess && <span>Progression access</span>}
                    {curriculumAccess && <span>Training library</span>}
                    {wolfGuideAccess && <span>Wolf Guide</span>}
                    {eventDiscount > 0 && <span>{eventDiscount}% off eligible events</span>}
                    {privateDiscount > 0 && (
                        <span>{privateDiscount}% off eligible private training</span>
                    )}
                </div>
            )}

            {membership.stripeCustomerId && (
                <button
                    type="button"
                    className="text-link membership-manage-button"
                    onClick={manageBilling}
                    disabled={portalLoading}
                >
                    <CreditCard size={17} aria-hidden="true" />
                    {portalLoading ? 'Opening billing…' : 'Manage billing'}
                </button>
            )}

            {portalError && <p className="form-error">{portalError}</p>}
        </article>
    );
}
