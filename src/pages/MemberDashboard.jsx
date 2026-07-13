import { ArrowRight, BookOpen, CalendarDays, HeartPulse, LogOut, MessageCircle, ShieldCheck, Sparkles } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { schedule, wolfGuidePrompts } from '../data/siteContent';

const checkIns = ['Activated', 'Steady', 'Tired', 'Disconnected'];

export default function MemberDashboard() {
  const { user, signOutUser } = useAuth();
  const [checkIn, setCheckIn] = useState('Steady');

  return (
    <section className="member-page">
      <div className="container">
        <div className="member-header">
          <div><p className="eyebrow">Member home</p><h1>Welcome{user?.displayName ? `, ${user.displayName.split(' ')[0]}` : ''}.</h1><p>Build capacity one practice at a time.</p></div>
          <button className="button button--ghost-light" type="button" onClick={signOutUser}><LogOut size={17} /> Sign out</button>
        </div>

        <div className="member-grid">
          <article className="dashboard-card dashboard-card--checkin">
            <div className="dashboard-card__heading"><HeartPulse /><div><p className="eyebrow">Quick check-in</p><h2>How is your system right now?</h2></div></div>
            <div className="checkin-options">
              {checkIns.map((option) => <button className={checkIn === option ? 'is-active' : ''} type="button" key={option} onClick={() => setCheckIn(option)}>{option}</button>)}
            </div>
            <p className="dashboard-hint">This starter stores the selection only in component state. It can later save private check-ins under each member account.</p>
          </article>

          <article className="dashboard-card">
            <div className="dashboard-card__heading"><CalendarDays /><div><p className="eyebrow">Next class</p><h2>{schedule[0].className}</h2></div></div>
            <p>{schedule[0].day} · {schedule[0].time}</p>
            <Link to="/schedule" className="text-link">View full schedule <ArrowRight size={17} /></Link>
          </article>

          <article className="dashboard-card">
            <div className="dashboard-card__heading"><ShieldCheck /><div><p className="eyebrow">Current focus</p><h2>Foundational stance</h2></div></div>
            <p>Balance, visual awareness, protected posture, and the ability to move in any direction.</p>
            <button className="text-link" type="button">Open practice note <BookOpen size={17} /></button>
          </article>

          <article className="dashboard-card dashboard-card--guide">
            <div className="dashboard-card__heading"><Sparkles /><div><p className="eyebrow eyebrow--light">Coming later</p><h2>Wolf Guide</h2></div></div>
            <p>An educational companion for technique review, nervous system practices, and preparation—not medical care or emergency support.</p>
            <div className="guide-prompts">
              {wolfGuidePrompts.map(({ label, icon: Icon }) => <button type="button" key={label} disabled><Icon size={16} /> {label}</button>)}
            </div>
            <span className="guide-status"><MessageCircle size={16} /> AI connection intentionally not included in this starter.</span>
          </article>
        </div>
      </div>
    </section>
  );
}
