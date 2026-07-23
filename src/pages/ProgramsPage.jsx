import { ArrowRight, Check, HeartPulse, Shield, Swords } from 'lucide-react';
import { Link } from 'react-router-dom';
import SectionHeading from '../components/SectionHeading';
import { programs } from '../data/siteContent';

const longCopy = {
  'martial-arts': {
    icon: Swords,
    intro: 'A progressive training path for students who want better movement, technical skill, conditioning, and composure.',
    suitable: ['Adults beginning from zero', 'Returning martial artists', 'People seeking structured physical practice'],
  },
  'self-defense': {
    icon: Shield,
    intro: 'A practical framework focused on awareness, prevention, boundaries, escape, and simple responses under stress.',
    suitable: ['Everyday safety preparation', 'Private groups and organizations', 'Students who prefer scenario-based learning'],
  },
  'somatic-healing': {
    icon: HeartPulse,
    intro: 'A slower practice that supports nervous system literacy, interoception, grounding, and recovery through movement.',
    suitable: ['People wanting a gentler entry point', 'Students balancing high-intensity training', 'Anyone building regulation capacity'],
  },
};

export default function ProgramsPage() {
  return (
    <>
      <section className="page-hero">
        <div className="container page-hero__inner">
          <p className="eyebrow eyebrow--light">Programs</p>
          <h1>Train the whole response.</h1>
          <p>Technique matters. So do awareness, boundaries, breath, recovery, and the ability to choose what happens next.</p>
          <div className="page-hero__actions">
            <a className="button button--light" href="#training-programs">Explore the programs</a>
          </div>
        </div>
      </section>
      <section className="section section--light" id="training-programs">
        <div className="container">
          <SectionHeading eyebrow="Integrated training" title="Start with the path that meets you now." body="Programs can stand alone or work together as a complete training system." />
          <div className="program-detail-list">
            {programs.map((program, index) => {
              const details = longCopy[program.slug];
              const Icon = details.icon;
              return (
                <article id={program.slug} className="program-detail" key={program.slug}>
                  <div className="program-detail__visual">
                    <span>0{index + 1}</span>
                    <Icon />
                  </div>
                  <div>
                    <p className="eyebrow">{program.eyebrow}</p>
                    <h2>{program.title}</h2>
                    <p className="program-detail__intro">{details.intro}</p>
                    <div className="program-detail__columns">
                      <div>
                        <h3>What you will practice</h3>
                        <ul className="check-list">
                          {program.outcomes.map((item) => <li key={item}><Check size={17} /> {item}</li>)}
                        </ul>
                      </div>
                      <div>
                        <h3>Good fit for</h3>
                        <ul className="check-list">
                          {details.suitable.map((item) => <li key={item}><Check size={17} /> {item}</li>)}
                        </ul>
                      </div>
                    </div>
                    <Link className="button" to="/contact">Ask about this program <ArrowRight size={18} /></Link>
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      </section>
    </>
  );
}
