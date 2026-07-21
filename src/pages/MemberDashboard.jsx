import {
    ArrowRight,
    BarChart3,
    BookOpen,
    CalendarClock,
    CalendarDays,
    HeartPulse,
    Megaphone,
    TicketPercent,
    ReceiptText,
    LogOut,
    Settings2,
    UserCog,
} from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import MembershipStatusCard from '../components/membership/MembershipStatusCard';
import ProgressionSummaryCard from '../components/progression/ProgressionSummaryCard';
import PrivateTrainingSummaryCard from '../components/private-training/PrivateTrainingSummaryCard';
import EventSummaryCard from '../components/events/EventSummaryCard';
import PurchaseSummaryCard from '../components/purchases/PurchaseSummaryCard';
import NotificationSummaryCard from '../components/notifications/NotificationSummaryCard';
import WolfGuidePanel from '../components/wolf-guide/WolfGuidePanel';
import { useAuth } from '../context/AuthContext';
import useStudioRole from '../hooks/useStudioRole';
import '../styles/dashboard-refinement.css';

const checkIns = ['Activated', 'Steady', 'Tired', 'Disconnected'];

export default function MemberDashboard() {
    const { user, signOutUser } = useAuth();
    const { isInstructor } = useStudioRole();
    const [checkIn, setCheckIn] = useState('Steady');

    return (
        <section className="member-page">
            <div className="container">
                <div className="member-header member-header--refined">
                    <div>
                        <p className="eyebrow">Member home</p>
                        <h1>
                            Welcome
                            {user?.displayName ? `, ${user.displayName.split(' ')[0]}` : ''}.
                        </h1>
                        <p>See where you are, what needs attention, and what to do next.</p>
                    </div>
                    <button
                        className="button button--ghost-light"
                        type="button"
                        onClick={signOutUser}
                    >
                        <LogOut size={17} aria-hidden="true" /> Sign out
                    </button>
                </div>

                <div className="member-grid member-grid--refined">
                    <ProgressionSummaryCard />

                    <MembershipStatusCard />

                    <PrivateTrainingSummaryCard />

                    <EventSummaryCard />

                    <PurchaseSummaryCard />

                    <NotificationSummaryCard />

                    <article className="dashboard-card dashboard-card--library">
                        <div className="dashboard-card__heading">
                            <BookOpen aria-hidden="true" />
                            <div>
                                <p className="eyebrow">Training library</p>
                                <h2>Technique references</h2>
                            </div>
                        </div>
                        <p>
                            Open instructor-published text, images, audio, and video connected
                            to your current level and skill categories.
                        </p>
                        <Link to="/member/library" className="text-link">
                            Open training library <ArrowRight size={17} aria-hidden="true" />
                        </Link>
                    </article>

                    <article className="dashboard-card dashboard-card--checkin">
                        <div className="dashboard-card__heading">
                            <HeartPulse aria-hidden="true" />
                            <div>
                                <p className="eyebrow">Quick check-in</p>
                                <h2>How is your system right now?</h2>
                            </div>
                        </div>
                        <div className="checkin-options" aria-label="Current state">
                            {checkIns.map((option) => (
                                <button
                                    className={checkIn === option ? 'is-active' : ''}
                                    type="button"
                                    key={option}
                                    onClick={() => setCheckIn(option)}
                                    aria-pressed={checkIn === option}
                                >
                                    {option}
                                </button>
                            ))}
                        </div>
                        <p className="dashboard-hint">
                            This gives Wolf Guide optional context during this visit. It is
                            separate from attendance check-in for an event.
                        </p>
                    </article>

                    <WolfGuidePanel memberState={checkIn} />

                    {isInstructor && (
                        <section className="instructor-tools-section">
                            <div className="instructor-tools-section__heading">
                                <Settings2 aria-hidden="true" />
                                <div>
                                    <p className="eyebrow">Instructor tools</p>
                                    <h2>Manage progression and curriculum</h2>
                                </div>
                            </div>

                            <div className="instructor-tools-grid">
                                <article className="dashboard-card dashboard-card--instructor">
                                    <div className="dashboard-card__heading">
                                        <UserCog aria-hidden="true" />
                                        <div>
                                            <p className="eyebrow">Progression</p>
                                            <h3>Review queue</h3>
                                        </div>
                                    </div>
                                    <p>
                                        Review evidence, record category feedback, and approve
                                        completed levels.
                                    </p>
                                    <Link to="/instructor/progression" className="text-link">
                                        Open progression reviews
                                        <ArrowRight size={17} aria-hidden="true" />
                                    </Link>
                                </article>

                                <article className="dashboard-card dashboard-card--instructor">
                                    <div className="dashboard-card__heading">
                                        <BookOpen aria-hidden="true" />
                                        <div>
                                            <p className="eyebrow">Curriculum</p>
                                            <h3>Training references</h3>
                                        </div>
                                    </div>
                                    <p>Create structured content for members and Wolf Guide.</p>
                                    <Link to="/instructor/content" className="text-link">
                                        Manage references <ArrowRight size={17} aria-hidden="true" />
                                    </Link>
                                </article>

                                <article className="dashboard-card dashboard-card--instructor">
                                    <div className="dashboard-card__heading">
                                        <CalendarClock aria-hidden="true" />
                                        <div>
                                            <p className="eyebrow">Private training</p>
                                            <h3>Booking calendar</h3>
                                        </div>
                                    </div>
                                    <p>Confirm sessions, reschedule bookings, and record completion or no-shows.</p>
                                    <Link to="/instructor/private-training/calendar" className="text-link">
                                        Open booking calendar <ArrowRight size={17} aria-hidden="true" />
                                    </Link>
                                </article>

                                <article className="dashboard-card dashboard-card--instructor">
                                    <div className="dashboard-card__heading">
                                        <CalendarDays aria-hidden="true" />
                                        <div>
                                            <p className="eyebrow">Private training</p>
                                            <h3>Availability</h3>
                                        </div>
                                    </div>
                                    <p>Set recurring hours, booking notice, cancellation rules, and blocked dates.</p>
                                    <Link to="/instructor/availability" className="text-link">
                                        Manage availability <ArrowRight size={17} aria-hidden="true" />
                                    </Link>
                                </article>

                                <article className="dashboard-card dashboard-card--instructor">
                                    <div className="dashboard-card__heading">
                                        <CalendarClock aria-hidden="true" />
                                        <div>
                                            <p className="eyebrow">Private training</p>
                                            <h3>Packages and credits</h3>
                                        </div>
                                    </div>
                                    <p>Create packages, review balances, and make documented credit adjustments.</p>
                                    <Link to="/instructor/private-training" className="text-link">
                                        Manage packages <ArrowRight size={17} aria-hidden="true" />
                                    </Link>
                                </article>


                                <article className="dashboard-card dashboard-card--instructor">
                                    <div className="dashboard-card__heading">
                                        <TicketPercent aria-hidden="true" />
                                        <div>
                                            <p className="eyebrow">Commerce</p>
                                            <h3>Discounts and promotion codes</h3>
                                        </div>
                                    </div>
                                    <p>
                                        Create event and private-training codes, set eligibility,
                                        and review redemption limits.
                                    </p>
                                    <Link to="/instructor/discounts" className="text-link">
                                        Manage discounts <ArrowRight size={17} aria-hidden="true" />
                                    </Link>
                                </article>

                                <article className="dashboard-card dashboard-card--instructor">
                                    <div className="dashboard-card__heading">
                                        <ReceiptText aria-hidden="true" />
                                        <div>
                                            <p className="eyebrow">Commerce</p>
                                            <h3>Orders and payments</h3>
                                        </div>
                                    </div>
                                    <p>Review membership invoices, one-time purchases, discounts, and receipt availability.</p>
                                    <Link to="/instructor/commerce/orders" className="text-link">
                                        View orders <ArrowRight size={17} aria-hidden="true" />
                                    </Link>
                                </article>

                                <article className="dashboard-card dashboard-card--instructor">
                                    <div className="dashboard-card__heading">
                                        <BarChart3 aria-hidden="true" />
                                        <div>
                                            <p className="eyebrow">Operations</p>
                                            <h3>Studio reports</h3>
                                        </div>
                                    </div>
                                    <p>Review revenue, attendance, memberships, outstanding credits, member follow-up, and system health.</p>
                                    <Link to="/instructor/reports" className="text-link">
                                        Open reports <ArrowRight size={17} aria-hidden="true" />
                                    </Link>
                                </article>

                                <article className="dashboard-card dashboard-card--instructor">
                                    <div className="dashboard-card__heading">
                                        <Megaphone aria-hidden="true" />
                                        <div>
                                            <p className="eyebrow">Communications</p>
                                            <h3>Studio announcements</h3>
                                        </div>
                                    </div>
                                    <p>Publish important updates directly to member and instructor notification centers.</p>
                                    <Link to="/instructor/announcements" className="text-link">
                                        Manage announcements <ArrowRight size={17} aria-hidden="true" />
                                    </Link>
                                </article>

                                <article className="dashboard-card dashboard-card--instructor">
                                    <div className="dashboard-card__heading">
                                        <CalendarClock aria-hidden="true" />
                                        <div>
                                            <p className="eyebrow">Events</p>
                                            <h3>Dates and registrations</h3>
                                        </div>
                                    </div>
                                    <p>Create paid or free events and track every participant as an individual registration.</p>
                                    <Link to="/instructor/events" className="text-link">
                                        Manage events <ArrowRight size={17} aria-hidden="true" />
                                    </Link>
                                </article>
                            </div>
                        </section>
                    )}
                </div>
            </div>
        </section>
    );
}
