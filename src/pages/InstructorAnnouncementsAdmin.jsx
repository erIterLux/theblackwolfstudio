import {
    ArrowLeft,
    CheckCircle2,
    Megaphone,
    Pencil,
    RefreshCw,
    Send,
    Users,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import useStudioRole from '../hooks/useStudioRole';
import {
    listStudioAnnouncementsAdmin,
    saveStudioAnnouncement,
} from '../services/notifications';

const blankForm = {
    announcementId: '',
    title: '',
    message: '',
    audience: 'all',
    priority: 'normal',
    actionLabel: 'Open member home',
    actionPath: '/member',
    status: 'draft',
};

function formatDate(value) {
    if (!value) return 'Not published';
    const date = new Date(value);
    if (Number.isNaN(date.valueOf())) return 'Not published';
    return new Intl.DateTimeFormat('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
    }).format(date);
}

export default function InstructorAnnouncementsAdmin() {
    const { isInstructor, loading: roleLoading } = useStudioRole();
    const [announcements, setAnnouncements] = useState([]);
    const [form, setForm] = useState(blankForm);
    const [state, setState] = useState({ loading: true, saving: false, error: '', message: '' });

    const load = async () => {
        setState((current) => ({ ...current, loading: true, error: '', message: '' }));
        try {
            const result = await listStudioAnnouncementsAdmin();
            setAnnouncements(result?.announcements || []);
            setState((current) => ({ ...current, loading: false }));
        } catch (error) {
            console.error('Announcements could not be loaded:', error);
            setState({ loading: false, saving: false, error: error?.message || 'Announcements could not be loaded.', message: '' });
        }
    };

    useEffect(() => {
        if (!roleLoading && isInstructor) queueMicrotask(() => load());
    }, [isInstructor, roleLoading]);

    const publishedCount = useMemo(
        () => announcements.filter((item) => item.status === 'published').length,
        [announcements],
    );

    const update = (key, value) => setForm((current) => ({ ...current, [key]: value }));

    const edit = (announcement) => {
        setForm({
            announcementId: announcement.id,
            title: announcement.title || '',
            message: announcement.message || '',
            audience: announcement.audience || 'all',
            priority: announcement.priority || 'normal',
            actionLabel: announcement.actionLabel || 'Open member home',
            actionPath: announcement.actionPath || '/member',
            status: announcement.status || 'draft',
        });
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const submit = async (status) => {
        setState((current) => ({ ...current, saving: true, error: '', message: '' }));
        try {
            const result = await saveStudioAnnouncement({ ...form, status });
            const delivery = result?.delivery;
            setState({
                loading: false,
                saving: false,
                error: '',
                message: status === 'published'
                    ? `Announcement published to ${delivery?.delivered ?? 0} account${delivery?.delivered === 1 ? '' : 's'}.`
                    : status === 'archived' ? 'Announcement archived.' : 'Draft saved.',
            });
            setForm(blankForm);
            await load();
        } catch (error) {
            console.error('Announcement could not be saved:', error);
            setState((current) => ({
                ...current,
                saving: false,
                error: error?.message || 'Announcement could not be saved.',
            }));
        }
    };

    if (roleLoading) {
        return <section className="member-page"><div className="container"><p>Checking instructor access…</p></div></section>;
    }
    if (!isInstructor) {
        return (
            <section className="member-page">
                <div className="container"><div className="notification-message notification-message--error">Instructor access is required.</div></div>
            </section>
        );
    }

    return (
        <section className="member-page announcement-admin-page">
            <div className="container">
                <Link to="/instructor" className="text-link announcement-admin-page__back">
                    <ArrowLeft size={17} aria-hidden="true" /> Instructor overview
                </Link>

                <header className="announcement-admin-page__header">
                    <div>
                        <p className="eyebrow">Instructor communications</p>
                        <h1>Studio announcements</h1>
                        <p>
                            Send one clear update to member notification centers. Urgent announcements
                            are delivered even when optional studio announcements are turned off.
                        </p>
                    </div>
                    <div className="announcement-admin-page__summary">
                        <Megaphone aria-hidden="true" />
                        <strong>{publishedCount}</strong>
                        <span>published</span>
                    </div>
                </header>

                <div className="announcement-admin-layout">
                    <form className="announcement-editor" onSubmit={(event) => event.preventDefault()}>
                        <div className="announcement-editor__heading">
                            <Pencil aria-hidden="true" />
                            <div>
                                <p className="eyebrow">Compose</p>
                                <h2>{form.announcementId ? 'Edit announcement' : 'New announcement'}</h2>
                            </div>
                        </div>

                        <label>
                            Title
                            <input value={form.title} onChange={(event) => update('title', event.target.value)} maxLength={180} />
                        </label>
                        <label>
                            Message
                            <textarea value={form.message} onChange={(event) => update('message', event.target.value)} rows={6} maxLength={1600} />
                        </label>

                        <div className="announcement-editor__row">
                            <label>
                                Audience
                                <select value={form.audience} onChange={(event) => update('audience', event.target.value)}>
                                    <option value="all">Everyone</option>
                                    <option value="members">Members only</option>
                                    <option value="instructors">Instructors only</option>
                                </select>
                            </label>
                            <label>
                                Priority
                                <select value={form.priority} onChange={(event) => update('priority', event.target.value)}>
                                    <option value="normal">Normal</option>
                                    <option value="important">Important</option>
                                    <option value="urgent">Urgent</option>
                                </select>
                            </label>
                        </div>

                        <div className="announcement-editor__row">
                            <label>
                                Button label
                                <input value={form.actionLabel} onChange={(event) => update('actionLabel', event.target.value)} maxLength={80} />
                            </label>
                            <label>
                                App route
                                <input value={form.actionPath} onChange={(event) => update('actionPath', event.target.value)} maxLength={500} placeholder="/member/events" />
                            </label>
                        </div>

                        <div className="announcement-preview">
                            <p className="eyebrow">Member preview</p>
                            <span className={`announcement-priority is-${form.priority}`}>{form.priority}</span>
                            <h3>{form.title || 'Announcement title'}</h3>
                            <p>{form.message || 'The announcement message will appear here.'}</p>
                            <strong>{form.actionLabel || 'View details'} →</strong>
                        </div>

                        {state.error && <div className="notification-message notification-message--error">{state.error}</div>}
                        {state.message && <div className="notification-message notification-message--success">{state.message}</div>}

                        <div className="announcement-editor__actions">
                            <button className="button button--ghost" type="button" onClick={() => submit('draft')} disabled={state.saving}>
                                Save draft
                            </button>
                            <button className="button" type="button" onClick={() => submit('published')} disabled={state.saving || !form.title.trim() || !form.message.trim()}>
                                <Send size={17} aria-hidden="true" /> {state.saving ? 'Saving…' : 'Publish announcement'}
                            </button>
                            {form.announcementId && (
                                <button className="button button--danger" type="button" onClick={() => submit('archived')} disabled={state.saving}>
                                    Archive
                                </button>
                            )}
                        </div>
                    </form>

                    <aside className="announcement-history">
                        <div className="announcement-history__heading">
                            <Users aria-hidden="true" />
                            <div>
                                <p className="eyebrow">History</p>
                                <h2>Announcements</h2>
                            </div>
                            <button type="button" className="icon-button" onClick={load} aria-label="Refresh announcements">
                                <RefreshCw size={18} aria-hidden="true" />
                            </button>
                        </div>

                        {state.loading && <p>Loading announcements…</p>}
                        {!state.loading && announcements.length === 0 && <p>No announcements have been created.</p>}
                        <div className="announcement-history__list">
                            {announcements.map((item) => (
                                <article key={item.id}>
                                    <div>
                                        <span className={`announcement-status is-${item.status}`}>{item.status}</span>
                                        <span className={`announcement-priority is-${item.priority}`}>{item.priority}</span>
                                    </div>
                                    <h3>{item.title}</h3>
                                    <p>{item.message}</p>
                                    <dl>
                                        <div><dt>Audience</dt><dd>{item.audience}</dd></div>
                                        <div><dt>Updated</dt><dd>{formatDate(item.updatedAt)}</dd></div>
                                        {item.delivery && <div><dt>Delivered</dt><dd>{item.delivery.delivered || 0}</dd></div>}
                                    </dl>
                                    <button className="text-link" type="button" onClick={() => edit(item)}>
                                        Edit announcement <Pencil size={15} aria-hidden="true" />
                                    </button>
                                    {item.status === 'published' && (
                                        <span className="announcement-history__published"><CheckCircle2 size={15} aria-hidden="true" /> Published</span>
                                    )}
                                </article>
                            ))}
                        </div>
                    </aside>
                </div>
            </div>
        </section>
    );
}
