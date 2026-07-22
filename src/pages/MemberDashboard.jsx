import {
    ArrowRight,
    BookOpen,
    HeartPulse,
} from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import EventSummaryCard from '../components/events/EventSummaryCard';
import MembershipStatusCard from '../components/membership/MembershipStatusCard';
import NotificationSummaryCard from '../components/notifications/NotificationSummaryCard';
import PrivateTrainingSummaryCard from '../components/private-training/PrivateTrainingSummaryCard';
import ProgressionSummaryCard from '../components/progression/ProgressionSummaryCard';
import PurchaseSummaryCard from '../components/purchases/PurchaseSummaryCard';
import WolfGuidePanel from '../components/wolf-guide/WolfGuidePanel';
import { useAuth } from '../context/AuthContext';
import useMemberDashboardSummary from '../hooks/useMemberDashboardSummary';

const checkIns = ['Activated', 'Steady', 'Tired', 'Disconnected'];

export default function MemberDashboard() {
    const { user } = useAuth();
    const {
        data: dashboardData,
        loading: dashboardLoading,
        error: dashboardError,
    } = useMemberDashboardSummary();
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
                </div>

                {dashboardError && (
                    <div className="form-status form-status--error dashboard-summary-error" role="alert">
                        {dashboardError}
                    </div>
                )}

                <div className="member-grid member-grid--refined">
                    <ProgressionSummaryCard
                        dashboardState={{
                            ...(dashboardData.progression || {}),
                            loading: dashboardLoading,
                            error: dashboardData.progression?.error || dashboardError,
                        }}
                    />

                    <MembershipStatusCard />

                    <PrivateTrainingSummaryCard
                        dashboardState={{
                            data: dashboardData.privateTraining,
                            loading: dashboardLoading,
                            error: dashboardError,
                        }}
                    />

                    <EventSummaryCard
                        dashboardState={{
                            data: dashboardData.events,
                            loading: dashboardLoading,
                            error: dashboardError,
                        }}
                    />

                    <PurchaseSummaryCard
                        dashboardState={{
                            data: dashboardData.purchases,
                            loading: dashboardLoading,
                            error: dashboardError,
                        }}
                    />

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
                </div>
            </div>
        </section>
    );
}
