import {
    Brain,
    HeartPulse,
    RotateCcw,
    Send,
    Shield,
    Sparkles,
    Trash2,
} from 'lucide-react';
import {
    useEffect,
    useMemo,
    useRef,
    useState,
} from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import useMembership from '../../hooks/useMembership';
import { sendWolfGuideMessage } from '../../services/wolfGuide';

const prompts = [
    { icon: HeartPulse, label: 'Help me settle before class' },
    { icon: Brain, label: 'Explain a nervous-system response' },
    { icon: Shield, label: 'Review a self-defense principle' },
];

const INTRO_MESSAGE = {
    id: 'wolf-guide-intro',
    role: 'assistant',
    content: 'I can help you prepare, review a principle, or choose a short regulation practice. I do not replace your instructor, therapist, doctor, or emergency services.',
};

const MAX_STORED_MESSAGES = 30;
const MAX_STORAGE_AGE_MS = 7 * 24 * 60 * 60 * 1000;

function createMessage(role, content, extra = {}) {
    return {
        id: `${role}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        role,
        content,
        ...extra,
    };
}

function readStoredConversation(key) {
    if (!key) return null;
    try {
        const parsed = JSON.parse(window.localStorage.getItem(key) || 'null');
        if (!parsed || !Array.isArray(parsed.messages)) return null;
        if ((Date.now() - Number(parsed.updatedAt || 0)) > MAX_STORAGE_AGE_MS) {
            window.localStorage.removeItem(key);
            return null;
        }
        return {
            conversationId: String(parsed.conversationId || ''),
            messages: parsed.messages
                .filter((message) => message?.role && message?.content)
                .slice(-MAX_STORED_MESSAGES),
        };
    } catch {
        return null;
    }
}

export default function WolfGuidePanel({ memberState = '' }) {
    const { user } = useAuth();
    const { canUseWolfGuide, loading } = useMembership();
    const storageKey = user?.uid ? `black-wolf:wolf-guide:${user.uid}` : '';
    const [conversationId, setConversationId] = useState('');
    const [messages, setMessages] = useState([INTRO_MESSAGE]);
    const [input, setInput] = useState('');
    const [sending, setSending] = useState(false);
    const [error, setError] = useState('');
    const [hydratedKey, setHydratedKey] = useState('');
    const messagesRef = useRef(null);
    const requestRef = useRef(0);

    const disabled = useMemo(() => sending || !input.trim(), [sending, input]);

    useEffect(() => {
        if (!storageKey) return;
        const stored = readStoredConversation(storageKey);
        if (stored?.messages?.length) {
            setConversationId(stored.conversationId);
            setMessages(stored.messages);
        } else {
            setConversationId('');
            setMessages([INTRO_MESSAGE]);
        }
        setHydratedKey(storageKey);
    }, [storageKey]);

    useEffect(() => {
        if (!storageKey || hydratedKey !== storageKey) return;
        try {
            window.localStorage.setItem(storageKey, JSON.stringify({
                conversationId,
                messages: messages.slice(-MAX_STORED_MESSAGES),
                updatedAt: Date.now(),
            }));
        } catch {
            // Conversation persistence is optional and must not block chat.
        }
    }, [conversationId, hydratedKey, messages, storageKey]);

    useEffect(() => {
        const container = messagesRef.current;
        if (!container) return;
        const distanceFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
        if (distanceFromBottom < 140 || sending) {
            container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' });
        }
    }, [messages, sending]);

    const newConversation = () => {
        requestRef.current += 1;
        setConversationId('');
        setMessages([INTRO_MESSAGE]);
        setInput('');
        setError('');
        setSending(false);
        if (storageKey) window.localStorage.removeItem(storageKey);
    };

    const send = async (override, options = {}) => {
        const message = String(override || input).trim();
        if (!message || sending) return;

        const requestId = requestRef.current + 1;
        requestRef.current = requestId;
        const retryId = options.retryId || '';
        const memberMessage = retryId
            ? null
            : createMessage('member', message);

        if (retryId) {
            setMessages((current) => current.map((item) => (
                item.id === retryId ? { ...item, failed: false } : item
            )));
        } else {
            setMessages((current) => [...current, memberMessage]);
        }

        setInput('');
        setSending(true);
        setError('');

        try {
            const result = await sendWolfGuideMessage({ message, conversationId, memberState });
            if (requestRef.current !== requestId) return;
            if (result.conversationId) setConversationId(result.conversationId);
            setMessages((current) => [...current, createMessage('assistant', result.answer, {
                sources: result.sources || [],
            })]);
        } catch (nextError) {
            console.error(nextError);
            if (requestRef.current !== requestId) return;
            const failedId = retryId || memberMessage?.id;
            setMessages((current) => current.map((item) => (
                item.id === failedId ? { ...item, failed: true } : item
            )));
            setInput(message);
            setError(nextError?.message || 'Wolf Guide is unavailable right now. Your message has been restored so you can try again.');
        } finally {
            if (requestRef.current === requestId) setSending(false);
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
            <div className="wolf-guide-heading-row">
                <div className="dashboard-card__heading"><Sparkles /><div><p className="eyebrow eyebrow--light">Member companion</p><h2>Wolf Guide</h2></div></div>
                <button type="button" className="wolf-guide-reset" onClick={newConversation} disabled={sending || messages.length <= 1}>
                    <Trash2 size={16} /> New conversation
                </button>
            </div>
            <p className="wolf-guide-boundary">Educational support only. Do not use this chat for emergencies, diagnosis, treatment, or high-risk technique instruction.</p>

            <div className="wolf-guide-prompts">
                {prompts.map(({ icon: Icon, label }) => (
                    <button type="button" key={label} onClick={() => send(label)} disabled={sending}>
                        <Icon size={16} /> {label}
                    </button>
                ))}
            </div>

            <div className="wolf-guide-messages" aria-live="polite" ref={messagesRef}>
                {messages.map((message) => (
                    <div className={`wolf-guide-message is-${message.role}${message.failed ? ' is-failed' : ''}`} key={message.id}>
                        <span>{message.content}</span>
                        {!!message.sources?.length && (
                            <small className="wolf-guide-sources">
                                Studio references: {message.sources.map((source) => source.title).join(', ')}
                            </small>
                        )}
                        {message.failed && (
                            <button type="button" className="wolf-guide-retry" onClick={() => send(message.content, { retryId: message.id })} disabled={sending}>
                                <RotateCcw size={15} /> Retry this message
                            </button>
                        )}
                    </div>
                ))}
                {sending && <div className="wolf-guide-message is-assistant is-pending" role="status">Considering…</div>}
            </div>

            <form className="wolf-guide-form" onSubmit={(event) => { event.preventDefault(); send(); }}>
                <label className="sr-only" htmlFor="wolf-guide-input">Ask Wolf Guide</label>
                <div className="wolf-guide-composer">
                    <textarea
                        id="wolf-guide-input"
                        rows="3"
                        value={input}
                        onChange={(event) => setInput(event.target.value)}
                        onKeyDown={(event) => {
                            if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
                                event.preventDefault();
                                send();
                            }
                        }}
                        placeholder="Ask about preparation, regulation, or a training principle…"
                        maxLength={1800}
                        disabled={sending}
                    />
                    <small>{input.length}/1800 · Ctrl/⌘ + Enter to send</small>
                </div>
                <button className="button" type="submit" disabled={disabled}><Send size={17} /> Send</button>
            </form>
            {error && <p className="form-error wolf-guide-error" role="alert">{error}</p>}
            <p className="wolf-guide-persistence-note">This conversation is saved on this device for seven days so you can return to it.</p>
        </article>
    );
}
