import { CheckCircle2, Mail, MapPin } from 'lucide-react';
import { useState } from 'react';
import SectionHeading from '../components/SectionHeading';
import { submitInquiry } from '../services/inquiries';

const initialValues = { name: '', email: '', phone: '', interest: 'Intro session', message: '' };

export default function ContactPage() {
  const [values, setValues] = useState(initialValues);
  const [status, setStatus] = useState({ type: 'idle', message: '' });

  const update = (event) => setValues((current) => ({ ...current, [event.target.name]: event.target.value }));

  const handleSubmit = async (event) => {
    event.preventDefault();
    setStatus({ type: 'loading', message: 'Sending…' });
    try {
      const result = await submitInquiry(values);
      setValues(initialValues);
      setStatus({
        type: 'success',
        message: result.stored === 'firestore'
          ? 'Your message was received. We will follow up soon.'
          : 'Starter mode: your inquiry was saved locally. Connect Firebase to send it to Firestore.',
      });
    } catch (error) {
      setStatus({ type: 'error', message: error.message || 'Unable to send your message.' });
    }
  };

  return (
    <>
      <section className="page-hero page-hero--compact">
        <div className="container page-hero__inner">
          <p className="eyebrow eyebrow--light">Get started</p>
          <h1>Tell us what you want to build.</h1>
          <p>Choose a starting point and we can help match the training to your goals, comfort level, and experience.</p>
          <div className="page-hero__actions">
            <a className="button button--light" href="#contact-request">Start your request</a>
          </div>
        </div>
      </section>
      <section className="section section--light" id="contact-request">
        <div className="container contact-grid">
          <div>
            <SectionHeading eyebrow="Book an intro" title="No pressure. No performance required." body="Use this form for individual training, group workshops, private sessions, or somatic practice questions." />
            <div className="contact-details">
              <a href="mailto:contact@theblackwolf.studio"><Mail /> contact@theblackwolf.studio</a>
              <span><MapPin /> Mobile training by appointment</span>
            </div>
          </div>
          <form className="contact-form" id="contact-form" onSubmit={handleSubmit}>
            <label>Full name<input required name="name" value={values.name} onChange={update} autoComplete="name" /></label>
            <div className="form-row">
              <label>Email<input required type="email" name="email" value={values.email} onChange={update} autoComplete="email" /></label>
              <label>
                Phone <span className="optional-label">optional</span>
                <input
                  type="tel"
                  name="phone"
                  value={values.phone}
                  onChange={update}
                  autoComplete="tel"
                />
              </label>
            </div>
            <label>What are you interested in?
              <select name="interest" value={values.interest} onChange={update}>
                <option>Intro session</option>
                <option>Martial arts</option>
                <option>Self-defense</option>
                <option>Somatic healing</option>
                <option>Private training</option>
                <option>Group or corporate workshop</option>
              </select>
            </label>
            <label>Anything we should know?<textarea name="message" rows="5" value={values.message} onChange={update} placeholder="Your goals, prior experience, accessibility needs, or questions." /></label>
            <button className="button" type="submit" disabled={status.type === 'loading'}>{status.type === 'loading' ? 'Sending…' : 'Send request'}</button>
            {status.type !== 'idle' && status.type !== 'loading' && (
              <p
                className={`form-status form-status--${status.type}`}
                role={status.type === 'error' ? 'alert' : 'status'}
              >
                {status.type === 'success' && <CheckCircle2 size={18} />} {status.message}
              </p>
            )}
          </form>
        </div>
      </section>
    </>
  );
}
