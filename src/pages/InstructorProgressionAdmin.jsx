import {
    ArrowLeft,
    BookOpen,
    Check,
    CheckCircle2,
    ClipboardCheck,
    RefreshCw,
    ShieldAlert,
    UserRound,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import EvidenceHistory from '../components/progression/EvidenceHistory';
import FeedbackComposer from '../components/progression/FeedbackComposer';
import FeedbackTimeline from '../components/progression/FeedbackTimeline';
import ProgressionEvidenceUploader from '../components/progression/ProgressionEvidenceUploader';
import {
    categoryStatusLabels,
    progressionCategories,
    progressionLevelMap,
} from '../data/progressionSystem';
import useStudioRole from '../hooks/useStudioRole';
import {
    approveProgressionLevel,
    getProgressionReview,
    listProgressionReviews,
    reviewProgressionCategory,
    saveProgressionCategory,
    saveProgressionFeedback,
} from '../services/progression';

function statusClass(status) {
    return `progression-status is-${String(status || 'submitted').replaceAll('_', '-')}`;
}

export default function InstructorProgressionAdmin() {
    const { isInstructor, loading: roleLoading, error: roleError, refresh: refreshRole } = useStudioRole();
    const [reviews, setReviews] = useState([]);
    const [selectedId, setSelectedId] = useState('');
    const [detail, setDetail] = useState(null);
    const [notes, setNotes] = useState({});
    const [loading, setLoading] = useState(true);
    const [busyKey, setBusyKey] = useState('');
    const [message, setMessage] = useState('');

    const loadQueue = useCallback(async ({ force = false } = {}) => {
        setLoading(true);
        setMessage('');
        try {
            const result = await listProgressionReviews({ force });
            const nextReviews = result?.reviews || [];
            setReviews(nextReviews);
            setSelectedId((current) => current || nextReviews[0]?.id || '');
        } catch (error) {
            console.error(error);
            setMessage(error?.message || 'The progression queue could not be loaded.');
        } finally {
            setLoading(false);
        }
    }, []);

    const loadDetail = useCallback(async (reviewId) => {
        if (!reviewId) {
            setDetail(null);
            return;
        }
        setBusyKey('detail');
        try {
            const result = await getProgressionReview(reviewId);
            setDetail(result);
            setNotes(Object.fromEntries(
                progressionCategories.map((category) => [
                    category.key,
                    result?.categories?.[category.key]?.instructorNotes || '',
                ]),
            ));
        } catch (error) {
            console.error(error);
            setMessage(error?.message || 'The selected review could not be opened.');
        } finally {
            setBusyKey('');
        }
    }, []);

    useEffect(() => {
        if (isInstructor) queueMicrotask(() => loadQueue());
    }, [isInstructor, loadQueue]);

    useEffect(() => {
        if (isInstructor && selectedId) queueMicrotask(() => loadDetail(selectedId));
    }, [selectedId, isInstructor, loadDetail]);

    const allValidated = useMemo(
        () => progressionCategories.every(
            (category) => detail?.categories?.[category.key]?.status === 'validated',
        ),
        [detail],
    );

    const decideCategory = async (categoryKey, status) => {
        setBusyKey(`decision:${categoryKey}`);
        setMessage('');
        try {
            await reviewProgressionCategory({
                reviewId: detail.review.id,
                categoryKey,
                status,
                instructorNotes: notes[categoryKey] || '',
            });
            await Promise.all([loadDetail(detail.review.id), loadQueue()]);
            setMessage(status === 'validated' ? 'Category validated.' : 'Member update requested.');
        } catch (error) {
            console.error(error);
            setMessage(error?.message || 'The review decision could not be saved.');
        } finally {
            setBusyKey('');
        }
    };

    const uploadForMember = async (categoryKey, video) => {
        setBusyKey(`upload:${categoryKey}`);
        try {
            await saveProgressionCategory({
                memberUid: detail.review.memberUid,
                levelKey: detail.review.levelKey,
                categoryKey,
                memberNotes: detail.categories?.[categoryKey]?.memberNotes || '',
                video,
            });
            await loadDetail(detail.review.id);
            setMessage('New evidence saved. Earlier member submissions remain available.');
        } catch (error) {
            console.error(error);
            setMessage(error?.message || 'The evidence video could not be updated.');
            throw error;
        } finally {
            setBusyKey('');
        }
    };

    const saveFeedback = async (categoryKey, feedback) => {
        setBusyKey(`feedback:${categoryKey}`);
        setMessage('');
        try {
            await saveProgressionFeedback({
                reviewId: detail.review.id,
                categoryKey,
                ...feedback,
            });
            await loadDetail(detail.review.id);
            setMessage('Feedback saved and shared with the member.');
        } catch (error) {
            console.error(error);
            setMessage(error?.message || 'The feedback could not be saved.');
            throw error;
        } finally {
            setBusyKey('');
        }
    };

    const approveLevel = async () => {
        setBusyKey('approve');
        setMessage('');
        try {
            await approveProgressionLevel(detail.review.id);
            setDetail(null);
            setSelectedId('');
            await loadQueue();
            setMessage('Progression level approved and the member record was advanced.');
        } catch (error) {
            console.error(error);
            setMessage(error?.message || 'The level could not be approved.');
        } finally {
            setBusyKey('');
        }
    };

    if (roleLoading) return <div className="page-loader">Verifying instructor access…</div>;

    if (!isInstructor) {
        return (
            <section className="progression-page">
                <div className="container progression-access-denied">
                    <ShieldAlert size={38} />
                    <h1>Instructor access required</h1>
                    <p>{roleError || 'This page is available only to configured instructors and administrators.'}</p>
                    <button className="button" type="button" onClick={refreshRole}>Check access again</button>
                    <Link className="text-link" to="/instructor">Return to instructor overview</Link>
                </div>
            </section>
        );
    }

    return (
        <section className="progression-admin-page">
            <div className="container progression-admin-shell">
                <div className="progression-page__topline">
                    <Link className="text-link" to="/instructor"><ArrowLeft size={17} /> Instructor overview</Link>
                    <div className="progression-page__links">
                        <Link className="text-link" to="/instructor/content"><BookOpen size={17} /> Manage training references</Link>
                        <button className="text-link" type="button" onClick={() => loadQueue({ force: true })} disabled={loading}>
                            <RefreshCw className={loading ? 'is-spinning' : ''} size={16} /> Refresh queue
                        </button>
                    </div>
                </div>

                <header className="progression-admin-header">
                    <div><p className="eyebrow">Instructor workspace</p><h1>Progression review</h1><p>Review each evidence submission, leave media or written feedback, and validate one category at a time.</p></div>
                    <ClipboardCheck size={46} />
                </header>

                {message && <p className="progression-page-message" role="status">{message}</p>}

                <div className="progression-admin-grid">
                    <aside className="progression-review-queue">
                        <div className="progression-review-queue__heading">
                            <h2>Review queue</h2>
                            <span>{reviews.length}</span>
                        </div>
                        {loading ? (
                            <p>Loading submissions…</p>
                        ) : reviews.length === 0 ? (
                            <div className="progression-empty-state"><CheckCircle2 size={28} /><strong>Queue is clear</strong><p>No member progression is waiting for review.</p></div>
                        ) : (
                            reviews.map((review) => (
                                <button
                                    key={review.id}
                                    type="button"
                                    className={selectedId === review.id ? 'is-selected' : ''}
                                    onClick={() => setSelectedId(review.id)}
                                >
                                    <UserRound size={19} />
                                    <span><strong>{review.memberDisplayName || review.memberEmail}</strong><small>{review.levelLabel}</small></span>
                                    <em className={statusClass(review.status)}>{String(review.status).replaceAll('_', ' ')}</em>
                                </button>
                            ))
                        )}
                    </aside>

                    <main className="progression-review-detail">
                        {!detail || busyKey === 'detail' ? (
                            <div className="progression-empty-state"><ClipboardCheck size={32} /><strong>{busyKey === 'detail' ? 'Opening review…' : 'Select a member submission'}</strong></div>
                        ) : (
                            <>
                                <header className="progression-review-detail__heading">
                                    <div>
                                        <p className="eyebrow">{detail.review.memberDisplayName || detail.review.memberEmail}</p>
                                        <h2>{detail.review.levelLabel}</h2>
                                        <p>{progressionLevelMap[detail.review.levelKey]?.description}</p>
                                    </div>
                                    <span className={statusClass(detail.review.status)}>{String(detail.review.status).replaceAll('_', ' ')}</span>
                                </header>

                                <div className="progression-admin-categories">
                                    {progressionCategories.map((category) => {
                                        const record = detail.categories?.[category.key] || {};
                                        const requirement = progressionLevelMap[detail.review.levelKey]?.categories?.[category.key];
                                        const categoryBusy = busyKey.endsWith(`:${category.key}`);

                                        return (
                                            <article className="progression-admin-category" key={category.key}>
                                                <div className="progression-category__heading">
                                                    <div><p className="eyebrow">{category.label}</p><h3>{requirement?.summary}</h3></div>
                                                    <span className={statusClass(record.status)}>{categoryStatusLabels[record.status] || record.status}</span>
                                                </div>

                                                <ul className="progression-requirements">
                                                    {requirement?.items?.map((item) => <li key={item}>{item}</li>)}
                                                </ul>

                                                <section className="progression-admin-evidence">
                                                    <h4>Evidence history</h4>
                                                    <EvidenceHistory evidence={record.evidence || []} currentEvidenceId={record.currentEvidenceId} />
                                                    <details>
                                                        <summary>Add evidence for this member</summary>
                                                        <ProgressionEvidenceUploader
                                                            memberUid={detail.review.memberUid}
                                                            levelKey={detail.review.levelKey}
                                                            categoryKey={category.key}
                                                            disabled={categoryBusy || detail.review.status === 'approved'}
                                                            onUpload={(video) => uploadForMember(category.key, video)}
                                                        />
                                                    </details>
                                                </section>

                                                {record.memberNotes && <div className="progression-member-note"><strong>Member notes</strong><p>{record.memberNotes}</p></div>}

                                                <section className="progression-admin-feedback">
                                                    <h4>Feedback history</h4>
                                                    <FeedbackTimeline feedback={record.feedback || []} />
                                                    <FeedbackComposer
                                                        memberUid={detail.review.memberUid}
                                                        levelKey={detail.review.levelKey}
                                                        categoryKey={category.key}
                                                        evidenceId={record.currentEvidenceId}
                                                        disabled={categoryBusy || detail.review.status === 'approved'}
                                                        onSave={(feedback) => saveFeedback(category.key, feedback)}
                                                    />
                                                </section>

                                                <label className="progression-notes">
                                                    Decision note
                                                    <textarea
                                                        value={notes[category.key] || ''}
                                                        onChange={(event) => setNotes((current) => ({ ...current, [category.key]: event.target.value }))}
                                                        placeholder="Summarize the decision. Detailed feedback can be recorded above."
                                                        disabled={categoryBusy}
                                                    />
                                                </label>

                                                <div className="progression-review-actions">
                                                    <button
                                                        className="button button--small button--dark-ghost"
                                                        type="button"
                                                        onClick={() => decideCategory(category.key, 'needs_work')}
                                                        disabled={categoryBusy}
                                                    >
                                                        <ShieldAlert size={16} /> Needs work
                                                    </button>
                                                    <button
                                                        className="button button--small"
                                                        type="button"
                                                        onClick={() => decideCategory(category.key, 'validated')}
                                                        disabled={categoryBusy}
                                                    >
                                                        <Check size={16} /> Validate category
                                                    </button>
                                                </div>
                                            </article>
                                        );
                                    })}
                                </div>

                                <footer className="progression-approval-bar">
                                    <div><strong>Level decision</strong><p>{allValidated ? 'All seven categories are validated.' : 'Validate every category before approving the level.'}</p></div>
                                    <button className="button" type="button" onClick={approveLevel} disabled={!allValidated || busyKey === 'approve'}>
                                        <CheckCircle2 size={18} /> {busyKey === 'approve' ? 'Approving…' : `Approve ${detail.review.levelLabel}`}
                                    </button>
                                </footer>
                            </>
                        )}
                    </main>
                </div>
            </div>
        </section>
    );
}
