import { ArrowRight, Check } from 'lucide-react';
import { Link } from 'react-router-dom';
import SectionHeading from '../components/SectionHeading';
import { memberships } from '../data/siteContent';

export default function MembershipPage() {
  return (
    <>
      <section className="page-hero page-hero--compact">
        <div className="container page-hero__inner">
          <p className="eyebrow eyebrow--light">Membership</p>
          <h1>Practice that fits real life.</h1>
          <p>Clear options, no artificial complexity, and a path for both group training and deeper support.</p>
        </div>
      </section>
      <section className="section section--light">
        <div className="container">
          <SectionHeading eyebrow="Starter pricing model" title="Choose your level of support." body="Pricing and benefits are placeholders until your operating model is finalized." />
          <div className="membership-grid">
            {memberships.map((plan) => (
              <article className={`membership-card membership-card--full ${plan.featured ? 'is-featured' : ''}`} key={plan.name}>
                {plan.featured && <span className="membership-card__badge">Most flexible</span>}
                <h3>{plan.name}</h3>
                <p>{plan.description}</p>
                <div className="price"><strong>{plan.price}</strong><span>{plan.cadence}</span></div>
                <ul className="check-list">
                  {plan.features.map((feature) => <li key={feature}><Check size={17} /> {feature}</li>)}
                </ul>
                <Link to="/contact" className={plan.featured ? 'button' : 'button button--dark-ghost'}>Start a conversation <ArrowRight size={18} /></Link>
              </article>
            ))}
          </div>
          <div className="membership-callout">
            <div><p className="eyebrow eyebrow--light">Not ready for membership?</p><h2>Begin with one intro session.</h2></div>
            <Link to="/contact" className="button button--light">Book an Intro</Link>
          </div>
        </div>
      </section>
    </>
  );
}
