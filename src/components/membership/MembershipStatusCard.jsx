import { CreditCard, ShieldCheck } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import useMembership from '../../hooks/useMembership';
import { openBillingPortal } from '../../services/membership';

const PLAN_DISCOUNT_PERCENT = Object.freeze({
    begin: 5,
    train: 10,
    integrate: 15,
});

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

    const planKey = String(membership.planKey || '').toLowerCase();
    const planDiscount = PLAN_DISCOUNT_PERCENT[planKey] || 0;
    const eventDiscount = Number(
        membership.eventDiscountPercent
        ?? membership.discounts?.eventPercent
        ?? planDiscount,
    );
    const privateDiscount = Number(
        membership.privateTrainingDiscountPercent
        ?? membership.discounts?.privateTrainingPercent
        ?? planDiscount,
    );
    const merchandiseDiscount = Number(
        membership.merchandiseDiscountPercent
        ?? membership.discounts?.merchandisePercent
        ?? planDiscount,
    );
    const progressionAccess = Boolean(
        membership.progressionAccess
        ?? membership.benefits?.progressionAccess,
    );
    const curriculumAccess = Boolean(
        membership.curriculumAccess
        ?? membership.benefits?.curriculumAccess,
    );
    const libraryAccessLevel = ['train', 'integrate'].includes(planKey)
        || (planKey !== 'begin' && membership.benefits?.libraryAccessLevel === 'advanced')
        ? 'advanced'
        : 'basic';
    const wolfGuideAccess = Boolean(
        membership.wolfGuideAccess
        ?? membership.benefits?.wolfGuideAccess,
    );
    const wolfGuideMessagesPerWeek = Number(
        membership.benefits?.wolfGuideMessagesPerWeek
        ?? (planKey === 'train' ? 15 : planKey === 'integrate' ? 30 : 0),
    );
    const wolfGuidePreviewMessages = Number(
        membership.benefits?.wolfGuidePreviewMessages
        ?? (planKey === 'begin' ? 3 : 0),
    );
    const privateTrainingCredits = Number(
        membership.benefits?.privateTrainingCreditsPerPeriod
        ?? (planKey === 'integrate' ? 1 : 0),
    );
    const claimedPrivateTrainingCredit = membership.privateTrainingCredit?.claimedPurchaseId || '';
    const sharedDiscount = eventDiscount > 0
        && eventDiscount === privateDiscount
        && eventDiscount === merchandiseDiscount
        ? eventDiscount
        : 0;
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
                    {curriculumAccess && (
                        <span>
                            {libraryAccessLevel === 'advanced'
                                ? 'Basic + advanced training library'
                                : 'Basic training library'}
                        </span>
                    )}
                    {wolfGuideAccess && wolfGuideMessagesPerWeek > 0 && (
                        <span>{wolfGuideMessagesPerWeek} Wolf Guide messages each week</span>
                    )}
                    {!wolfGuideAccess && wolfGuidePreviewMessages > 0 && (
                        <span>{wolfGuidePreviewMessages}-message Wolf Guide preview</span>
                    )}
                    {sharedDiscount > 0 ? (
                        <span>
                            {sharedDiscount}% off eligible events, private training, and merchandise
                        </span>
                    ) : (
                        <>
                            {eventDiscount > 0 && <span>{eventDiscount}% off eligible events</span>}
                            {privateDiscount > 0 && (
                                <span>{privateDiscount}% off eligible private training</span>
                            )}
                            {merchandiseDiscount > 0 && (
                                <span>{merchandiseDiscount}% off eligible merchandise</span>
                            )}
                        </>
                    )}
                    {privateTrainingCredits > 0 && (
                        <span>
                            {claimedPrivateTrainingCredit
                                ? 'Included private lesson credit ready'
                                : '1 private lesson credit for up to 3 participants'}
                        </span>
                    )}
                </div>
            )}

            {isActive && privateTrainingCredits > 0 && (
                <Link
                    className="text-link"
                    to={claimedPrivateTrainingCredit
                        ? '/member/private-training'
                        : '/private-training#included-integrate-lesson'}
                >
                    <ShieldCheck size={17} aria-hidden="true" />
                    {claimedPrivateTrainingCredit
                        ? 'Manage included private lesson'
                        : 'Set up included private lesson'}
                </Link>
            )}

            {isActive && (
                <Link className="text-link" to="/member/waiver">
                    <ShieldCheck size={17} aria-hidden="true" />
                    Review membership waiver
                </Link>
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
