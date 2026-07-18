import {
    ArrowRight,
    BookOpen,
    CalendarDays,
    HeartPulse,
    LogOut,
    ShieldCheck,
    TrendingUp,
    UserCog,
} from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import MembershipStatusCard from '../components/membership/MembershipStatusCard';
import WolfGuidePanel from '../components/wolf-guide/WolfGuidePanel';
import { useAuth } from '../context/AuthContext';
import { schedule } from '../data/siteContent';
import useStudioRole from '../hooks/useStudioRole';

const checkIns = ['Activated', 'Steady', 'Tired', 'Disconnected'];

export default function MemberDashboard() {
    const { user, signOutUser } = useAuth();
    const { isInstructor } = useStudioRole();
    const [checkIn, setCheckIn] = useState('Steady');

    return (
        <section className="member-page">
            <div className="container">
                <div className="member-header">
                    <div><p className="eyebrow">Member home</p><h1>Welcome{user?.displayName ? `, ${user.displayName.split(' ')[0]}` : ''}.</h1><p>Build capacity one practice at a time.</p></div>
                    <button className="button button--ghost-light" type="button" onClick={signOutUser}><LogOut size={17} /> Sign out</button>
                </div>

                <div className="member-grid">
                    <MembershipStatusCard />

                    <article className="dashboard-card dashboard-card--checkin">
                        <div className="dashboard-card__heading"><HeartPulse /><div><p className="eyebrow">Quick check-in</p><h2>How is your system right now?</h2></div></div>
                        <div className="checkin-options">
                            {checkIns.map((option) => <button className={checkIn === option ? 'is-active' : ''} type="button" key={option} onClick={() => setCheckIn(option)}>{option}</button>)}
                        </div>
                        <p className="dashboard-hint">This check-in is used only to give Wolf Guide optional context during this visit.</p>
                    </article>

                    <article className="dashboard-card dashboard-card--progression">
                        <div className="dashboard-card__heading"><TrendingUp /><div><p className="eyebrow">Progression</p><h2>White Wolf to Black Wolf</h2></div></div>
                        <p>Track seven skill categories, upload current evidence, and submit each level for instructor validation.</p>
                        <Link to="/member/progression" className="text-link">Open progression <ArrowRight size={17} /></Link>
                    </article>

                    <article className="dashboard-card dashboard-card--library">
                        <div className="dashboard-card__heading"><BookOpen /><div><p className="eyebrow">Training library</p><h2>Technique references</h2></div></div>
                        <p>Browse instructor-published text, images, audio, and video connected to your progression.</p>
                        <Link to="/member/library" className="text-link">Open training library <ArrowRight size={17} /></Link>
                    </article>

                    {isInstructor && (
                        <>
                            <article className="dashboard-card dashboard-card--instructor">
                                <div className="dashboard-card__heading"><UserCog /><div><p className="eyebrow">Instructor</p><h2>Progression review queue</h2></div></div>
                                <p>Review member videos, record category feedback, and approve completed levels.</p>
                                <Link to="/instructor/progression" className="text-link">Open progression reviews <ArrowRight size={17} /></Link>
                            </article>
                            <article className="dashboard-card dashboard-card--instructor">
                                <div className="dashboard-card__heading"><BookOpen /><div><p className="eyebrow">Instructor</p><h2>Training reference library</h2></div></div>
                                <p>Create structured curriculum content and publish it to members and Wolf Guide.</p>
                                <Link to="/instructor/content" className="text-link">Manage training references <ArrowRight size={17} /></Link>
                            </article>
                        </>
                    )}

                    <article className="dashboard-card">
                        <div className="dashboard-card__heading"><CalendarDays /><div><p className="eyebrow">Next class</p><h2>{schedule[0].className}</h2></div></div>
                        <p>{schedule[0].day} · {schedule[0].time}</p>
                        <Link to="/schedule" className="text-link">View full schedule <ArrowRight size={17} /></Link>
                    </article>

                    <article className="dashboard-card">
                        <div className="dashboard-card__heading"><ShieldCheck /><div><p className="eyebrow">Current focus</p><h2>Foundational stance</h2></div></div>
                        <p>Balance, visual awareness, protected posture, and the ability to move in any direction.</p>
                        <Link className="text-link" to="/member/progression">Connect this to progression <ArrowRight size={17} /></Link>
                    </article>

                    <WolfGuidePanel memberState={checkIn} />
                </div>
            </div>
        </section>
    );
}
