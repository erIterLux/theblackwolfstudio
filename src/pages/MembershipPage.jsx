import { Check } from 'lucide-react';
import SectionHeading from '../components/SectionHeading';
import MembershipCheckoutButton from '../components/membership/MembershipCheckoutButton';
import MembershipStatusCard from '../components/membership/MembershipStatusCard';
import { memberships } from '../data/siteContent';
import { useAuth } from '../context/AuthContext';

const PLAN_KEYS = { Begin: 'begin', Train: 'train', Integrate: 'integrate' };

export default function MembershipPage() {
    const { user } = useAuth();

    return (
        <>
            <section className="page-hero page-hero--compact">
                <div className="container page-hero__inner">
                    <p className="eyebrow eyebrow--light">Membership</p>
                    <h1>Practice that fits real life.</h1>
                    <p>Choose a sustainable training rhythm. Checkout and billing are securely handled through Stripe.</p>
                    <div className="page-hero__actions">
                        <a className="button button--light" href="#membership-options">Compare memberships</a>
                    </div>
                </div>
            </section>

            <section className="section section--light" id="membership-options">
                <div className="container">
                    {user && <div className="membership-current"><MembershipStatusCard /></div>}
                    <SectionHeading eyebrow="Membership options" title="Choose your level of support." body="Begin builds consistency. Train opens the full group schedule and Wolf Guide. Integrate adds individual guidance." />
                    <div className="membership-grid">
                        {memberships.map((plan) => (
                            <article className={`membership-card membership-card--full ${plan.featured ? 'is-featured' : ''}`} key={plan.name}>
                                {plan.featured && <span className="membership-card__badge">Most flexible</span>}
                                <h3>{plan.name}</h3>
                                <p>{plan.description}</p>
                                <div className="price"><strong>{plan.price}</strong><span>{plan.cadence}</span></div>
                                <p className="membership-card__billing">Billed annually. Renews until canceled.</p>
                                <ul className="check-list">
                                    {plan.features.map((feature) => <li key={feature}><Check size={17} /> {feature}</li>)}
                                </ul>
                                <MembershipCheckoutButton
                                    planKey={PLAN_KEYS[plan.name]}
                                    planName={plan.name}
                                    featured={plan.featured}
                                />
                            </article>
                        ))}
                    </div>
                    <div className="membership-progression-callout">
                        <div><p className="eyebrow">Included progression</p><h2>White Wolf to Black Wolf</h2></div>
                        <p>Active members receive structured progression across striking, movement, situational awareness, breath control, grappling, ground, and weapons. Each level is validated by an instructor.</p>
                    </div>
                    <p className="membership-fine-print">Membership access is granted only after Stripe confirms the subscription through the secure webhook. Plans renew automatically until canceled through the billing portal.</p>
                </div>
            </section>
        </>
    );
}
