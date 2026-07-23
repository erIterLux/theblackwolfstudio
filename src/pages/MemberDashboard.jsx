import {
    ArrowRight,
    BookOpen,
    CalendarClock,
    CalendarDays,
    CheckCircle2,
    HeartPulse,
    ShieldAlert,
    Target,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { PrefetchLink } from '../components/PrefetchLink';
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

const attentionCopy = {
    'membership-past-due': 'Update billing so membership access and benefits stay active.',
    'membership-ending': 'Review your membership before the current period ends.',
    'booking-requested': 'Your instructor still needs to confirm the requested time.',
    'event-waiver-pending': 'Complete the waiver before your upcoming event.',
};

function dateValue(value) {
    const parsed = value ? new Date(value) : null;
    return parsed && !Number.isNaN(parsed.valueOf()) ? parsed : null;
}

function formatDateTime(value, timeZone = 'America/New_York') {
    const date = dateValue(value);
    if (!date) return 'Upcoming';
    return new Intl.DateTimeFormat('en-US', {
        timeZone,
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
    }).format(date);
}

function buildNextStep(data, loading) {
    if (loading) {
        return {
            eyebrow: 'Start here',
            title: 'Checking what needs your attention...',
            body: 'Your next action will appear here as soon as the dashboard is ready.',
            actionLabel: '',
            to: '',
            tone: 'loading',
            icon: CheckCircle2,
        };
    }

    const attention = data.attentionItems?.[0];
    if (attention) {
        return {
            eyebrow: 'Needs attention',
            title: attention.title,
            body: attentionCopy[attention.key] || 'Review this item before your next training activity.',
            actionLabel: 'Review now',
            to: attention.actionPath,
            tone: attention.priority === 'important' ? 'attention' : 'notice',
            icon: ShieldAlert,
        };
    }

    const privateBooking = data.privateTraining?.nextBooking;
    const eventRegistration = data.events?.nextRegistration;
    const privateStart = dateValue(privateBooking?.startsAt)?.valueOf() || Number.POSITIVE_INFINITY;
    const eventStart = dateValue(eventRegistration?.eventSnapshot?.startsAt)?.valueOf()
        || Number.POSITIVE_INFINITY;

    if (privateBooking && privateStart <= eventStart) {
        return {
            eyebrow: 'Next on your calendar',
            title: 'Private training session',
            body: `${formatDateTime(privateBooking.startsAt, privateBooking.timezone)} - ${privateBooking.participantCount || 1} participant${Number(privateBooking.participantCount || 1) === 1 ? '' : 's'}`,
            actionLabel: 'View booking',
            to: '/member/private-training',
            tone: 'upcoming',
            icon: CalendarClock,
        };
    }

    if (eventRegistration) {
        return {
            eyebrow: 'Next on your calendar',
            title: eventRegistration.eventSnapshot?.title || 'Upcoming event',
            body: `${formatDateTime(eventRegistration.eventSnapshot?.startsAt)} - ${eventRegistration.participantCount || 1} participant${Number(eventRegistration.participantCount || 1) === 1 ? '' : 's'}`,
            actionLabel: 'View registration',
            to: '/member/events',
            tone: 'upcoming',
            icon: CalendarDays,
        };
    }

    if (Number(data.privateTraining?.availableSessions || 0) > 0) {
        return {
            eyebrow: 'Ready when you are',
            title: 'Book your next private session',
            body: `${data.privateTraining.availableSessions} session credit${Number(data.privateTraining.availableSessions) === 1 ? '' : 's'} available.`,
            actionLabel: 'Choose a time',
            to: '/member/private-training/book',
            tone: 'ready',
            icon: CalendarClock,
        };
    }

    return {
        eyebrow: 'Continue your practice',
        title: 'Review your progression',
        body: 'See your current level, category progress, instructor feedback, and next evidence step.',
        actionLabel: 'Open progression',
        to: '/member/progression',
        tone: 'ready',
        icon: Target,
    };
}

export default function MemberDashboard() {
    const { user } = useAuth();
    const {
        data: dashboardData,
        loading: dashboardLoading,
        error: dashboardError,
    } = useMemberDashboardSummary();
    const [checkIn, setCheckIn] = useState('Steady');
    const nextStep = useMemo(
        () => buildNextStep(dashboardData, dashboardLoading),
        [dashboardData, dashboardLoading],
    );
    const NextStepIcon = nextStep.icon;

    return (
        <section className="member-page member-dashboard-page">
            <div className="container">
                <div className="member-header member-header--refined">
                    <div>
                        <p className="eyebrow">Member home</p>
                        <h1>
                            Welcome
                            {user?.displayName ? `, ${user.displayName.split(' ')[0]}` : ''}.
                        </h1>
                        <p>Start with what matters now, then move deeper into your practice.</p>
                    </div>
                </div>

                {dashboardError && (
                    <div className="form-status form-status--error dashboard-summary-error" role="alert">
                        {dashboardError}
                    </div>
                )}

                <article className={`member-next-step member-next-step--${nextStep.tone}`} aria-live="polite">
                    <span className="member-next-step__icon" aria-hidden="true">
                        <NextStepIcon />
                    </span>
                    <div className="member-next-step__copy">
                        <p className="eyebrow">{nextStep.eyebrow}</p>
                        <h2>{nextStep.title}</h2>
                        <p>{nextStep.body}</p>
                    </div>
                    {nextStep.to && (
                        <PrefetchLink className="button member-next-step__action" to={nextStep.to}>
                            {nextStep.actionLabel} <ArrowRight size={18} aria-hidden="true" />
                        </PrefetchLink>
                    )}
                </article>

                <section className="member-dashboard-section" aria-labelledby="member-practice-heading">
                    <div className="member-dashboard-section__heading">
                        <div>
                            <p className="eyebrow">Your practice</p>
                            <h2 id="member-practice-heading">Progress, access, and what is coming next</h2>
                        </div>
                    </div>

                    <div className="member-grid member-grid--practice">
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
                    </div>
                </section>

                <section className="member-dashboard-section" aria-labelledby="member-support-heading">
                    <div className="member-dashboard-section__heading">
                        <div>
                            <p className="eyebrow">Support and records</p>
                            <h2 id="member-support-heading">Keep the practical details close</h2>
                        </div>
                    </div>

                    <div className="member-grid member-grid--secondary">
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
                            <PrefetchLink to="/member/library" className="text-link">
                                Open training library <ArrowRight size={17} aria-hidden="true" />
                            </PrefetchLink>
                        </article>
                    </div>
                </section>

                <section className="member-dashboard-section member-dashboard-section--reflection" aria-labelledby="member-reflection-heading">
                    <div className="member-dashboard-section__heading">
                        <div>
                            <p className="eyebrow">Regulate and reflect</p>
                            <h2 id="member-reflection-heading">Bring your current state into the practice</h2>
                        </div>
                    </div>

                    <div className="member-reflection-grid">
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
                </section>
            </div>
        </section>
    );
}
