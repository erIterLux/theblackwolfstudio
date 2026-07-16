import { Brain, HeartPulse, Send, Shield, Sparkles } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import useMembership from '../../hooks/useMembership';
import { sendWolfGuideMessage } from '../../services/wolfGuide';

const prompts = [
  { icon: HeartPulse, label: 'Help me settle before class' },
  { icon: Brain, label: 'Explain a nervous-system response' },
  { icon: Shield, label: 'Review a self-defense principle' },
];

export default function WolfGuidePanel({ memberState = '' }) {
  const { canUseWolfGuide, loading } = useMembership();
  const [conversationId, setConversationId] = useState('');
  const [messages, setMessages] = useState([
    { role: 'assistant', content: 'I can help you prepare, review a principle, or choose a short regulation practice. I do not replace your instructor, therapist, doctor, or emergency services.' },
  ]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');

  const disabled = useMemo(() => sending || !input.trim(), [sending, input]);

  const send = async (override) => {
    const message = String(override || input).trim();
    if (!message || sending) return;
    setInput('');
    setSending(true);
    setError('');
    setMessages((current) => [...current, { role: 'member', content: message }]);

    try {
      const result = await sendWolfGuideMessage({ message, conversationId, memberState });
      if (result.conversationId) setConversationId(result.conversationId);
      setMessages((current) => [...current, { role: 'assistant', content: result.answer }]);
    } catch (nextError) {
      console.error(nextError);
      setError(nextError?.message || 'Wolf Guide is unavailable right now.');
    } finally {
      setSending(false);
    }
  };

  if (loading) return <article className="dashboard-card dashboard-card--guide"><p>Loading Wolf Guide…</p></article>;

  if (!canUseWolfGuide) {
    return (
      <article className="dashboard-card dashboard-card--guide wolf-guide-locked">
        <div className="dashboard-card__heading"><Sparkles /><div><p className="eyebrow eyebrow--light">Member companion</p><h2>Wolf Guide</h2></div></div>
        <p>Wolf Guide is included with active Train and Integrate memberships.</p>
        <Link className="button button--light" to="/membership">Compare memberships</Link>
      </article>
    );
  }

  return (
    <article className="dashboard-card dashboard-card--guide wolf-guide-panel">
      <div className="dashboard-card__heading"><Sparkles /><div><p className="eyebrow eyebrow--light">Member companion</p><h2>Wolf Guide</h2></div></div>
      <p className="wolf-guide-boundary">Educational support only. Do not use this chat for emergencies, diagnosis, treatment, or high-risk technique instruction.</p>

      <div className="wolf-guide-prompts">
        {prompts.map(({ icon: Icon, label }) => (
          <button type="button" key={label} onClick={() => send(label)} disabled={sending}>
            <Icon size={16} /> {label}
          </button>
        ))}
      </div>

      <div className="wolf-guide-messages" aria-live="polite">
        {messages.map((message, index) => (
          <div className={`wolf-guide-message is-${message.role}`} key={`${message.role}-${index}`}>
            {message.content}
          </div>
        ))}
        {sending && <div className="wolf-guide-message is-assistant">Considering…</div>}
      </div>

      <form className="wolf-guide-form" onSubmit={(event) => { event.preventDefault(); send(); }}>
        <label className="sr-only" htmlFor="wolf-guide-input">Ask Wolf Guide</label>
        <textarea
          id="wolf-guide-input"
          rows="3"
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder="Ask about preparation, regulation, or a training principle…"
          maxLength={1800}
          disabled={sending}
        />
        <button className="button" type="submit" disabled={disabled}><Send size={17} /> Send</button>
      </form>
      {error && <p className="form-error" role="alert">{error}</p>}
    </article>
  );
}
