import { ArrowRight, CalendarDays, Clock } from 'lucide-react';
import { Link } from 'react-router-dom';
import SectionHeading from '../components/SectionHeading';
import { schedule } from '../data/siteContent';

export default function SchedulePage() {
  return (
    <>
      <section className="page-hero page-hero--compact">
        <div className="container page-hero__inner">
          <p className="eyebrow eyebrow--light">Weekly rhythm</p>
          <h1>Class Schedule</h1>
          <p>A starter schedule ready to connect to Firestore or your booking platform later.</p>
        </div>
      </section>
      <section className="section section--light">
        <div className="container">
          <SectionHeading eyebrow="Sample schedule" title="Build consistency without burning out." body="All classes can be edited from a future admin dashboard instead of living in code." />
          <div className="schedule-list">
            {schedule.map((item) => (
              <article className="schedule-row" key={`${item.day}-${item.time}`}>
                <div className="schedule-row__day"><CalendarDays /><strong>{item.day}</strong></div>
                <div className="schedule-row__time"><Clock size={18} /> {item.time}</div>
                <div><strong>{item.className}</strong><span>{item.level}</span></div>
                <Link to="/contact" className="button button--small button--dark-ghost">Reserve interest <ArrowRight size={16} /></Link>
              </article>
            ))}
          </div>
          <div className="notice-card">
            <strong>Starter note</strong>
            <p>This page is intentionally ready for a Firestore-backed schedule and future class reservations, attendance, waitlists, and instructor assignments.</p>
          </div>
        </div>
      </section>
    </>
  );
}
