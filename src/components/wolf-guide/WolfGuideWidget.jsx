import {
    Brain,
    HeartPulse,
    LockKeyhole,
    Maximize2,
    Minimize2,
    RotateCcw,
    Send,
    Shield,
    Sparkles,
    Trash2,
    X,
} from 'lucide-react';
import {
    useCallback,
    useEffect,
    useId,
    useMemo,
    useRef,
    useState,
} from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useWolfGuideState } from '../../context/WolfGuideContext';
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
const FOCUSABLE_SELECTOR = [
    'a[href]',
    'button:not([disabled])',
    'textarea:not([disabled])',
    '[tabindex]:not([tabindex="-1"])',
].join(',');

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

function initialConversation(storageKey) {
    const stored = storageKey ? readStoredConversation(storageKey) : null;
    if (stored?.messages?.length) return stored;
    return { conversationId: '', messages: [INTRO_MESSAGE] };
}

function WolfGuideConversation({ memberState, storageKey }) {
    const inputId = useId();
    const [storedConversation] = useState(() => initialConversation(storageKey));
    const [conversationId, setConversationId] = useState(storedConversation.conversationId);
    const [messages, setMessages] = useState(storedConversation.messages);
    const [input, setInput] = useState('');
    const [sending, setSending] = useState(false);
    const [error, setError] = useState('');
    const messagesRef = useRef(null);
    const requestRef = useRef(0);

    const disabled = useMemo(() => sending || !input.trim(), [sending, input]);

    useEffect(() => {
        if (!storageKey) return;
        try {
            window.localStorage.setItem(storageKey, JSON.stringify({
                conversationId,
                messages: messages.slice(-MAX_STORED_MESSAGES),
                updatedAt: Date.now(),
            }));
        } catch {
            // Conversation persistence is optional and must not block chat.
        }
    }, [conversationId, messages, storageKey]);

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
        const memberMessage = retryId ? null : createMessage('member', message);

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
            const result = await sendWolfGuideMessage({
                message,
                conversationId,
                memberState,
            });
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

    return (
        <div className="wolf-guide-conversation">
            <div className="wolf-guide-heading-row">
                <p className="wolf-guide-boundary">
                    Educational support only. Do not use this chat for emergencies,
                    diagnosis, treatment, or high-risk technique instruction.
                </p>
                <button
                    type="button"
                    className="wolf-guide-reset"
                    onClick={newConversation}
                    disabled={sending || messages.length <= 1}
                >
                    <Trash2 size={16} aria-hidden="true" />
                    New conversation
                </button>
            </div>

            <div className="wolf-guide-prompts" aria-label="Suggested Wolf Guide prompts">
                {prompts.map(({ icon: Icon, label }) => (
                    <button
                        type="button"
                        key={label}
                        onClick={() => send(label)}
                        disabled={sending}
                    >
                        <Icon size={16} aria-hidden="true" />
                        {label}
                    </button>
                ))}
            </div>

            <div className="wolf-guide-messages" aria-live="polite" ref={messagesRef}>
                {messages.map((message) => (
                    <div
                        className={`wolf-guide-message is-${message.role}${message.failed ? ' is-failed' : ''}`}
                        key={message.id}
                    >
                        <span>{message.content}</span>
                        {!!message.sources?.length && (
                            <small className="wolf-guide-sources">
                                Studio references: {message.sources.map((source) => source.title).join(', ')}
                            </small>
                        )}
                        {message.failed && (
                            <button
                                type="button"
                                className="wolf-guide-retry"
                                onClick={() => send(message.content, { retryId: message.id })}
                                disabled={sending}
                            >
                                <RotateCcw size={15} aria-hidden="true" />
                                Retry this message
                            </button>
                        )}
                    </div>
                ))}
                {sending && (
                    <div className="wolf-guide-message is-assistant is-pending" role="status">
                        Considering…
                    </div>
                )}
            </div>

            <form
                className="wolf-guide-form"
                onSubmit={(event) => {
                    event.preventDefault();
                    send();
                }}
            >
                <label className="sr-only" htmlFor={inputId}>Ask Wolf Guide</label>
                <div className="wolf-guide-composer">
                    <textarea
                        id={inputId}
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
                <button className="button" type="submit" disabled={disabled}>
                    <Send size={17} aria-hidden="true" />
                    Send
                </button>
            </form>
            {error && <p className="form-error wolf-guide-error" role="alert">{error}</p>}
            <p className="wolf-guide-persistence-note">
                Saved on this device for seven days so you can return to it.
            </p>
        </div>
    );
}

function WolfGuideUpgrade() {
    return (
        <div className="wolf-guide-upgrade">
            <span className="wolf-guide-upgrade__icon" aria-hidden="true">
                <LockKeyhole size={22} />
            </span>
            <div>
                <p className="eyebrow eyebrow--light">Membership feature</p>
                <h3>Unlock your practice companion.</h3>
            </div>
            <p>
                Wolf Guide is included with active Train and Integrate memberships.
                It can help you prepare for class, review studio principles, and choose
                short regulation practices between sessions.
            </p>
            <ul>
                <li>Training-principle review</li>
                <li>Preparation and reflection prompts</li>
                <li>Published studio-reference context</li>
            </ul>
            <Link className="button button--light" to="/membership">
                Compare Train and Integrate
            </Link>
            <small>Your current member access and records remain unchanged.</small>
        </div>
    );
}

export default function WolfGuideWidget() {
    const { user } = useAuth();
    const { memberState } = useWolfGuideState();
    const { canUseWolfGuide, loading } = useMembership();
    const [open, setOpen] = useState(false);
    const [expanded, setExpanded] = useState(false);
    const dialogRef = useRef(null);
    const launcherRef = useRef(null);
    const storageKey = user?.uid ? `black-wolf:wolf-guide:${user.uid}` : '';
    const dialogId = useId();
    const titleId = useId();

    const close = useCallback(() => {
        setOpen(false);
        setExpanded(false);
    }, []);

    useEffect(() => {
        if (!open) return undefined;

        const dialog = dialogRef.current;
        const launcher = launcherRef.current;
        const previousOverflow = document.body.style.overflow;
        const focusFrame = window.requestAnimationFrame(() => {
            dialog?.querySelector(FOCUSABLE_SELECTOR)?.focus();
        });

        const handleKeyDown = (event) => {
            if (event.key === 'Escape') {
                event.preventDefault();
                close();
                return;
            }
            if (!expanded || event.key !== 'Tab' || !dialog) return;
            const focusable = [...dialog.querySelectorAll(FOCUSABLE_SELECTOR)]
                .filter((element) => !element.hasAttribute('disabled'));
            if (!focusable.length) return;
            const first = focusable[0];
            const last = focusable.at(-1);
            if (event.shiftKey && document.activeElement === first) {
                event.preventDefault();
                last.focus();
            } else if (!event.shiftKey && document.activeElement === last) {
                event.preventDefault();
                first.focus();
            }
        };

        if (expanded) document.body.style.overflow = 'hidden';
        window.addEventListener('keydown', handleKeyDown);
        return () => {
            window.cancelAnimationFrame(focusFrame);
            window.removeEventListener('keydown', handleKeyDown);
            document.body.style.overflow = previousOverflow;
            launcher?.focus();
        };
    }, [close, expanded, open]);

    return (
        <div className={`wolf-guide-widget${expanded ? ' is-expanded' : ''}`}>
            {open && expanded && (
                <button
                    className="wolf-guide-widget__backdrop"
                    type="button"
                    aria-label="Close Wolf Guide"
                    onClick={close}
                />
            )}

            <section
                id={dialogId}
                ref={dialogRef}
                className="wolf-guide-dialog"
                role="dialog"
                aria-labelledby={titleId}
                aria-modal={expanded ? 'true' : undefined}
                hidden={!open}
            >
                <header className="wolf-guide-dialog__header">
                    <div>
                        <span className="wolf-guide-dialog__mark" aria-hidden="true">
                            <Sparkles size={19} />
                        </span>
                        <div>
                            <p>Member companion</p>
                            <h2 id={titleId}>Wolf Guide</h2>
                        </div>
                    </div>
                    <div className="wolf-guide-dialog__actions">
                        {!loading && canUseWolfGuide && (
                            <button
                                type="button"
                                onClick={() => setExpanded((current) => !current)}
                                aria-label={expanded ? 'Return Wolf Guide to widget size' : 'Open Wolf Guide in a full modal'}
                                title={expanded ? 'Return to widget size' : 'Open full modal'}
                            >
                                {expanded
                                    ? <Minimize2 size={18} aria-hidden="true" />
                                    : <Maximize2 size={18} aria-hidden="true" />}
                            </button>
                        )}
                        <button
                            type="button"
                            onClick={close}
                            aria-label="Close Wolf Guide"
                            title="Close Wolf Guide"
                        >
                            <X size={19} aria-hidden="true" />
                        </button>
                    </div>
                </header>

                <div className="wolf-guide-dialog__body" aria-busy={loading}>
                    {loading && (
                        <div className="wolf-guide-loading" role="status">
                            <span className="route-loading__spinner" aria-hidden="true" />
                            Checking Wolf Guide access…
                        </div>
                    )}
                    {!loading && !canUseWolfGuide && <WolfGuideUpgrade />}
                    {!loading && canUseWolfGuide && (
                        <WolfGuideConversation
                            key={storageKey || 'guest'}
                            memberState={memberState}
                            storageKey={storageKey}
                        />
                    )}
                </div>
            </section>

            <button
                ref={launcherRef}
                type="button"
                className={`wolf-guide-launcher${canUseWolfGuide ? ' has-access' : ' is-locked'}`}
                aria-expanded={open}
                aria-controls={dialogId}
                onClick={() => setOpen((current) => !current)}
            >
                <span className="wolf-guide-launcher__icon" aria-hidden="true">
                    {canUseWolfGuide ? <Sparkles size={21} /> : <LockKeyhole size={20} />}
                </span>
                <span>
                    <strong>Wolf Guide</strong>
                    <small>
                        {loading
                            ? 'Checking access…'
                            : canUseWolfGuide
                                ? 'Open practice companion'
                                : 'Available with Train or Integrate'}
                    </small>
                </span>
            </button>
        </div>
    );
}
