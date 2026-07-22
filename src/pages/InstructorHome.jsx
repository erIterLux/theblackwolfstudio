import { ArrowRight } from 'lucide-react';
import { PrefetchLink } from '../components/PrefetchLink';
import { useAuth } from '../context/AuthContext';
import {
    instructorNavigation,
    instructorQuickActions,
} from '../components/portalNavigation';

export default function InstructorHome() {
    const { user } = useAuth();
    const firstName = user?.displayName?.split(' ')[0] || '';

    return (
        <section className="member-page instructor-home">
            <div className="container">
                <header className="member-header instructor-home__header">
                    <div>
                        <p className="eyebrow">Instructor overview</p>
                        <h1>{firstName ? `Welcome, ${firstName}.` : 'Instructor workspace'}</h1>
                        <p>Start with today’s work, then move into the area that needs attention.</p>
                    </div>
                </header>

                <section className="instructor-home__section" aria-labelledby="instructor-priority-heading">
                    <div className="instructor-home__section-heading">
                        <div>
                            <p className="eyebrow">Priority actions</p>
                            <h2 id="instructor-priority-heading">Run the studio</h2>
                        </div>
                    </div>

                    <div className="instructor-home__quick-grid">
                        {instructorQuickActions.map((item) => {
                            const Icon = item.icon;
                            return (
                                <PrefetchLink className="instructor-home-card" key={item.to} to={item.to}>
                                    <Icon size={24} aria-hidden="true" />
                                    <div>
                                        <h3>{item.label}</h3>
                                        <p>{item.description}</p>
                                    </div>
                                    <ArrowRight size={18} aria-hidden="true" />
                                </PrefetchLink>
                            );
                        })}
                    </div>
                </section>

                <section className="instructor-home__section" aria-labelledby="instructor-all-tools-heading">
                    <div className="instructor-home__section-heading">
                        <div>
                            <p className="eyebrow">All tools</p>
                            <h2 id="instructor-all-tools-heading">Workspace directory</h2>
                        </div>
                    </div>

                    <div className="instructor-home__directory">
                        {instructorNavigation.map((group) => (
                            <article className="instructor-directory-group" key={group.label}>
                                <h3>{group.label}</h3>
                                <div>
                                    {group.items
                                        .filter((item) => item.to !== '/instructor')
                                        .map((item) => {
                                            const Icon = item.icon;
                                            return (
                                                <PrefetchLink key={item.to} to={item.to}>
                                                    <Icon size={18} aria-hidden="true" />
                                                    <span>{item.label}</span>
                                                    <ArrowRight size={16} aria-hidden="true" />
                                                </PrefetchLink>
                                            );
                                        })}
                                </div>
                            </article>
                        ))}
                    </div>
                </section>
            </div>
        </section>
    );
}
