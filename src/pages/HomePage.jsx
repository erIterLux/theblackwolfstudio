import {
    ArrowRight,
    ChevronDown,
    CirclePlay,
    HeartPulse,
    ShieldCheck,
    Sparkles,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import ProgramCard from '../components/ProgramCard';
import SectionHeading from '../components/SectionHeading';
import { memberships, principles, programs, wolfGuidePrompts } from '../data/siteContent';

export default function HomePage() {
    return (
        <>
            <section className="hero">
                <div className="hero__texture" aria-hidden="true" />
                <div className="hero__image" aria-hidden="true" />
                <div className="container hero__grid">
                    <div className="hero__copy">
                        <p className="eyebrow">Martial arts · self-defense · somatic healing</p>
                        <h1>Power without panic.</h1>
                        <p className="hero__lead">
                            Train practical skills, build embodied confidence, and develop a steadier relationship with your nervous system.
                        </p>
                        <div className="button-row">
                            <Link to="/contact" className="button">Book an Intro <ArrowRight size={18} /></Link>
                            <Link to="/programs" className="button button--ghost">Explore Training</Link>
                        </div>
                        <div className="hero__notes">
                            <span><ShieldCheck size={18} /> Beginner-friendly</span>
                            <span><HeartPulse size={18} /> Trauma-aware approach</span>
                        </div>

                        <div className="hero__signature">
                            <blockquote className="hero__quote">
                                <span>“Be a black wolf, not a black sheep.”</span>
                                <cite>— Unknown</cite>
                            </blockquote>
                            <a href="#training" className="hero__scroll">
                                See the approach <ChevronDown size={18} />
                            </a>
                        </div>
                    </div>

                    <div className="hero__brand-card" aria-hidden="true">
                        <span className="hero__dojo-lintel" />
                        <span className="hero__dojo-crossbar" />
                        <span className="hero__dojo-post hero__dojo-post--left" />
                        <span className="hero__dojo-post hero__dojo-post--right" />
                        <span className="hero__dojo-mark">
                            <img src="/images/black-wolf-mark.png" alt="" />
                        </span>
                    </div>

                    <div className="hero__visual" aria-hidden="true" />
                </div>
            </section>

            <section className="trust-strip">
                <div className="container trust-strip__inner">
                    <span>Train for real life</span>
                    <span>Move at your pace</span>
                    <span>Practice with purpose</span>
                    <span>Build durable confidence</span>
                </div>
            </section>

            <section id="training" className="section section--light">
                <div className="container">
                    <SectionHeading
                        eyebrow="Three paths. One integrated practice."
                        title="Strength is more than force."
                        body="The Black Wolf Studio brings together physical training, practical self-defense, and nervous-system-aware practices so skill does not disappear when stress rises."
                    />
                    <div className="program-grid">
                        {programs.map((program) => <ProgramCard key={program.slug} program={program} />)}
                    </div>
                </div>
            </section>

            <section className="section philosophy-section">
                <div className="container philosophy-grid">
                    <div className="philosophy-copy">
                        <p className="eyebrow">Our training philosophy</p>
                        <h2>Prepare the body. Educate the nervous system. Keep your humanity.</h2>
                        <p>
                            Effective training should increase options, not create fear. We use progressive practice, clear consent, and adaptable intensity to help students become capable without disconnecting from themselves.
                        </p>
                        <Link to="/programs" className="button button--ghost-light">Read the Approach <ArrowRight size={18} /></Link>
                    </div>
                    <div className="principle-grid">
                        {principles.map(({ title, body, icon: Icon }, index) => (
                            <article className="principle-card" key={title}>
                                <span className="principle-card__number">0{index + 1}</span>
                                <Icon />
                                <h3>{title}</h3>
                                <p>{body}</p>
                            </article>
                        ))}
                    </div>
                </div>
            </section>

            <section className="section section--blue">
                <div className="container journey-grid">
                    <div>
                        <p className="eyebrow eyebrow--light">The practice cycle</p>
                        <h2>Orient. Practice. Integrate.</h2>
                    </div>
                    <div className="journey-steps">
                        <article><span>01</span><h3>Orient</h3><p>Notice the room, your breath, and what your system needs to participate.</p></article>
                        <article><span>02</span><h3>Practice</h3><p>Build technique through clear progressions, useful repetition, and responsible pressure.</p></article>
                        <article><span>03</span><h3>Integrate</h3><p>Downshift, reflect, and connect the lesson to daily life rather than leaving it on the mat.</p></article>
                    </div>
                </div>
            </section>

            <section className="section section--light">
                <div className="container">
                    <SectionHeading
                        eyebrow="Membership"
                        title="Choose a rhythm you can sustain."
                        body="These are starter membership concepts and can be adjusted once your class model, pricing, and studio schedule are finalized."
                    />
                    <div className="membership-grid membership-grid--preview">
                        {memberships.map((plan) => (
                            <article className={`membership-card ${plan.featured ? 'is-featured' : ''}`} key={plan.name}>
                                {plan.featured && <span className="membership-card__badge">Best for consistent training</span>}
                                <h3>{plan.name}</h3>
                                <p>{plan.description}</p>
                                <div className="price"><strong>{plan.price}</strong><span>{plan.cadence}</span></div>
                                <Link to="/membership" className={plan.featured ? 'button' : 'button button--dark-ghost'}>View Memberships</Link>
                            </article>
                        ))}
                    </div>
                </div>
            </section>

            <section className="section wolf-guide-section">
                <div className="container wolf-guide-grid">
                    <div className="wolf-guide-visual">
                        <div className="guide-orb"><Sparkles /><span>Wolf Guide</span></div>
                        <div className="guide-chat">
                            <p>What would support you right now?</p>
                            {wolfGuidePrompts.map(({ label, icon: Icon }) => (
                                <span key={label}><Icon size={17} /> {label}</span>
                            ))}
                        </div>
                    </div>
                    <div>
                        <p className="eyebrow">Member experience · planned feature</p>
                        <h2>A grounded AI companion, built around practice—not diagnosis.</h2>
                        <p>
                            The future Wolf Guide can help members review techniques, choose a short regulation practice, prepare for class, and reflect after training. It should stay clearly within educational and wellness support boundaries and route urgent or clinical concerns to qualified human help.
                        </p>
                        <div className="feature-pills">
                            <span>Technique review</span><span>Regulation prompts</span><span>Practice planning</span><span>Member context</span>
                        </div>
                        <Link to="/login" className="button">Preview Member Space <CirclePlay size={18} /></Link>
                    </div>
                </div>
            </section>

            <section className="section final-cta">
                <div className="container final-cta__inner">
                    <div>
                        <p className="eyebrow eyebrow--light">Your first step</p>
                        <h2>Come as you are. Leave with more options.</h2>
                    </div>
                    <Link to="/contact" className="button button--light">Book an Intro <ArrowRight size={18} /></Link>
                </div>
            </section>
        </>
    );
}
