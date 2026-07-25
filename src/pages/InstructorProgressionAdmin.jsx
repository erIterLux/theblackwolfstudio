import {
    ArrowLeft,
    BookOpen,
    CalendarClock,
    Check,
    CheckCircle2,
    ClipboardCheck,
    CreditCard,
    FileWarning,
    ListChecks,
    Search,
    RefreshCw,
    ShieldAlert,
    ShieldCheck,
    Users,
    UserRound,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import EvidenceHistory from '../components/progression/EvidenceHistory';
import FeedbackComposer from '../components/progression/FeedbackComposer';
import FeedbackTimeline from '../components/progression/FeedbackTimeline';
import ProgressionEvidenceUploader from '../components/progression/ProgressionEvidenceUploader';
import SignedWaiverDocumentActions from '../components/waivers/SignedWaiverDocumentActions';
import WaiverReminderButton from '../components/waivers/WaiverReminderButton';
import {
    categoryStatusLabels,
    progressionCategories,
    progressionLevelMap,
} from '../data/progressionSystem';
import useStudioRole from '../hooks/useStudioRole';
import {
    approveProgressionLevel,
    getInstructorMemberDetail,
    getProgressionReview,
    listInstructorMembers,
    listProgressionReviews,
    reviewProgressionCategory,
    saveProgressionCategory,
    saveProgressionFeedback,
} from '../services/progression';

function statusClass(status) {
    return `progression-status is-${String(status || 'submitted').replaceAll('_', '-')}`;
}

function readable(value) {
    return String(value || 'not started').replaceAll('_', ' ');
}

function formatDate(value) {
    if (!value) return 'Not available';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'Not available';
    return new Intl.DateTimeFormat('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
    }).format(date);
}

function membershipDisplayState(membership = {}) {
    return membership.cancelAtPeriodEnd && membership.active
        ? 'canceling'
        : membership.status || 'none';
}

function MemberDirectory({
    members,
    total,
    nextOffset,
    selectedMemberUid,
    loading,
    loadingMore,
    filters,
    onFiltersChange,
    onSelect,
    onLoadMore,
}) {
    return (
        <aside className="instructor-member-directory">
            <div className="progression-review-queue__heading">
                <div><h2>Members</h2><small>{total} records</small></div>
                <span>{members.length}</span>
            </div>
            <label className="instructor-member-search">
                <Search size={17} aria-hidden="true" />
                <input
                    type="search"
                    value={filters.search}
                    onChange={(event) => onFiltersChange({ ...filters, search: event.target.value })}
                    placeholder="Search name or email"
                    aria-label="Search members"
                />
            </label>
            <div className="instructor-member-filters">
                <label>
                    <span>Membership</span>
                    <select
                        value={filters.membershipStatus}
                        onChange={(event) => onFiltersChange({
                            ...filters,
                            membershipStatus: event.target.value,
                        })}
                    >
                        <option value="all">All states</option>
                        <option value="active">Active</option>
                        <option value="trialing">Trialing</option>
                        <option value="past_due">Past due</option>
                        <option value="canceling">Canceling</option>
                        <option value="canceled">Canceled</option>
                        <option value="none">No membership</option>
                    </select>
                </label>
                <label>
                    <span>Plan</span>
                    <select
                        value={filters.planKey}
                        onChange={(event) => onFiltersChange({
                            ...filters,
                            planKey: event.target.value,
                        })}
                    >
                        <option value="all">All plans</option>
                        <option value="begin">Begin</option>
                        <option value="train">Train</option>
                        <option value="integrate">Integrate</option>
                    </select>
                </label>
                <label>
                    <span>Level</span>
                    <select
                        value={filters.levelKey}
                        onChange={(event) => onFiltersChange({
                            ...filters,
                            levelKey: event.target.value,
                        })}
                    >
                        <option value="all">All levels</option>
                        {Object.entries(progressionLevelMap).map(([key, level]) => (
                            <option key={key} value={key}>{level.label}</option>
                        ))}
                    </select>
                </label>
            </div>
            <label className="instructor-member-review-filter">
                <input
                    type="checkbox"
                    checked={filters.needsReview}
                    onChange={(event) => onFiltersChange({
                        ...filters,
                        needsReview: event.target.checked,
                    })}
                />
                Needs progression review
            </label>

            <div className="instructor-member-list" aria-live="polite">
                {loading ? (
                    <p className="progression-empty-inline">Loading members…</p>
                ) : members.length === 0 ? (
                    <div className="progression-empty-state">
                        <Users size={28} />
                        <strong>No matching members</strong>
                        <p>Adjust the search or filters to see more records.</p>
                    </div>
                ) : members.map((member) => (
                    <button
                        key={member.uid}
                        type="button"
                        className={selectedMemberUid === member.uid ? 'is-selected' : ''}
                        onClick={() => onSelect(member.uid)}
                    >
                        <span className="instructor-member-list__identity">
                            <strong>{member.displayName}</strong>
                            <small>{member.email || 'No email on file'}</small>
                        </span>
                        <span className="instructor-member-list__summary">
                            <em className={`membership-state is-${membershipDisplayState(member.membership)}`}>
                                {member.membership.planName
                                    ? `${member.membership.planName} · ${readable(membershipDisplayState(member.membership))}`
                                    : readable(member.membership.status)}
                            </em>
                            <small>
                                {member.progression.initialized
                                    ? member.progression.currentLevelLabel
                                    : 'Progression not started'}
                            </small>
                            {member.pendingReviewCount > 0 && (
                                <b>{member.pendingReviewCount} to review</b>
                            )}
                        </span>
                    </button>
                ))}
            </div>
            {nextOffset != null && (
                <button
                    className="button button--small button--dark-ghost instructor-member-load-more"
                    type="button"
                    onClick={onLoadMore}
                    disabled={loadingMore}
                >
                    {loadingMore ? 'Loading…' : 'Load more members'}
                </button>
            )}
        </aside>
    );
}

function MemberDetail({ detail, loading, onOpenReview }) {
    if (loading) {
        return (
            <main className="instructor-member-detail">
                <div className="progression-empty-state">
                    <UserRound size={32} />
                    <strong>Opening member record…</strong>
                </div>
            </main>
        );
    }
    if (!detail) {
        return (
            <main className="instructor-member-detail">
                <div className="progression-empty-state">
                    <Users size={32} />
                    <strong>Select a member</strong>
                    <p>Membership, waiver, and progression details will appear here.</p>
                </div>
            </main>
        );
    }

    const membership = detail.membership || {};
    const progression = detail.progression || {};
    const waiverSigned = detail.waiver?.status === 'signed';
    const currentCategories = Object.values(progression.categories || {});
    const completedCategories = currentCategories.filter(
        (category) => category.status === 'validated',
    ).length;
    const activeReview = detail.reviews?.find((review) => (
        ['submitted', 'in_review', 'needs_work', 'ready_for_approval'].includes(review.status)
    ));

    return (
        <main className="instructor-member-detail">
            <header className="instructor-member-detail__heading">
                <div>
                    <p className="eyebrow">Member record</p>
                    <h2>{detail.member.displayName}</h2>
                    {detail.member.email
                        ? <a href={`mailto:${detail.member.email}`}>{detail.member.email}</a>
                        : <span className="instructor-member-detail__missing-email">No email on file</span>}
                </div>
                <div className="instructor-member-detail__badges">
                    <span className={`membership-state is-${membershipDisplayState(membership)}`}>
                        {membership.planName || 'No membership'} · {readable(membershipDisplayState(membership))}
                    </span>
                    <span className={statusClass(progression.state)}>{readable(progression.state)}</span>
                </div>
            </header>

            <div className="instructor-member-summary-grid">
                <article>
                    <CreditCard size={20} />
                    <div>
                        <span>Membership</span>
                        <strong>{membership.planName || 'No active plan'}</strong>
                        <small>
                            {membership.cancelAtPeriodEnd
                                ? `Cancels ${formatDate(membership.currentPeriodEnd)}`
                                : membership.currentPeriodEnd
                                    ? `Current period through ${formatDate(membership.currentPeriodEnd)}`
                                    : readable(membership.status)}
                        </small>
                    </div>
                </article>
                <article>
                    <ListChecks size={20} />
                    <div>
                        <span>Progression</span>
                        <strong>{progression.currentLevelLabel}</strong>
                        <small>
                            {progression.earnedLevelLabel
                                ? `Highest approved: ${progression.earnedLevelLabel}`
                                : 'No level approved yet'}
                        </small>
                    </div>
                </article>
                <article>
                    {waiverSigned ? <ShieldCheck size={20} /> : <FileWarning size={20} />}
                    <div>
                        <span>Membership waiver</span>
                        <strong>{waiverSigned ? 'Signed' : 'Action needed'}</strong>
                        <small>{waiverSigned ? `Signed ${formatDate(detail.waiver.signedAt)}` : 'No current signed waiver'}</small>
                    </div>
                </article>
                <article>
                    <CalendarClock size={20} />
                    <div>
                        <span>Last progression activity</span>
                        <strong>{formatDate(progression.updatedAt)}</strong>
                        <small>{detail.reviews?.length || 0} review records</small>
                    </div>
                </article>
            </div>

            {membership.active && (
                <section className="instructor-member-benefits">
                    <div>
                        <p className="eyebrow">Current access</p>
                        <h3>{membership.planName} benefits</h3>
                    </div>
                    <div className="instructor-member-benefit-pills">
                        {membership.benefits?.progressionAccess && <span>Progression</span>}
                        {membership.benefits?.curriculumAccess && <span>Training library</span>}
                        {membership.benefits?.wolfGuideAccess && <span>Wolf Guide</span>}
                        {membership.discounts?.eventPercent > 0 && (
                            <span>{membership.discounts.eventPercent}% event discount</span>
                        )}
                        {membership.discounts?.privateTrainingPercent > 0 && (
                            <span>{membership.discounts.privateTrainingPercent}% lesson discount</span>
                        )}
                        {membership.benefits?.privateTrainingCreditsPerPeriod > 0 && (
                            <span>{membership.benefits.privateTrainingCreditsPerPeriod} lesson credit</span>
                        )}
                    </div>
                </section>
            )}

            <section className="instructor-member-section">
                <div className="instructor-member-section__heading">
                    <div>
                        <p className="eyebrow">Current level</p>
                        <h3>{progression.currentLevelLabel}</h3>
                        <p>{completedCategories} of {currentCategories.length || progressionCategories.length} categories validated</p>
                    </div>
                    {activeReview && (
                        <button className="button button--small" type="button" onClick={() => onOpenReview(activeReview.id)}>
                            <ClipboardCheck size={16} /> Open pending review
                        </button>
                    )}
                </div>
                {!progression.initialized ? (
                    <div className="progression-empty-inline">Progression has not been initialized for this member.</div>
                ) : (
                    <div className="instructor-member-category-grid">
                        {progressionCategories.map((definition) => {
                            const category = progression.categories?.[definition.key] || {};
                            return (
                                <article key={definition.key}>
                                    <span className={statusClass(category.status)}>
                                        {categoryStatusLabels[category.status] || readable(category.status)}
                                    </span>
                                    <strong>{definition.label}</strong>
                                    <small>
                                        {Number(category.evidenceCount || 0)} evidence · {Number(category.feedbackCount || 0)} feedback
                                    </small>
                                </article>
                            );
                        })}
                    </div>
                )}
            </section>

            <section className="instructor-member-section">
                <div className="instructor-member-section__heading">
                    <div>
                        <p className="eyebrow">Compliance</p>
                        <h3>Membership waiver</h3>
                        <p>{waiverSigned ? 'The current signed record is available.' : 'This member still needs to sign the current waiver.'}</p>
                    </div>
                    <div className="instructor-member-waiver-actions">
                        {waiverSigned ? (
                            <SignedWaiverDocumentActions
                                scope="membership"
                                waiverId={detail.waiver.waiverId}
                                participantName={detail.member.displayName}
                            />
                        ) : membership.active ? (
                            <WaiverReminderButton
                                scope="membership"
                                waiverId={detail.waiver.waiverId}
                                participantName={detail.member.displayName}
                            />
                        ) : (
                            <span className="membership-state is-none">Reminder unavailable without an active membership</span>
                        )}
                    </div>
                </div>
            </section>

            <section className="instructor-member-section">
                <div className="instructor-member-section__heading">
                    <div>
                        <p className="eyebrow">History</p>
                        <h3>Progression reviews</h3>
                    </div>
                </div>
                {detail.reviews?.length ? (
                    <div className="instructor-member-review-history">
                        {detail.reviews.map((review) => (
                            <article key={review.id}>
                                <div>
                                    <strong>{review.levelLabel}</strong>
                                    <small>{formatDate(review.submittedAt || review.updatedAt)}</small>
                                </div>
                                <span className={statusClass(review.status)}>{readable(review.status)}</span>
                                {['submitted', 'in_review', 'needs_work', 'ready_for_approval'].includes(review.status) && (
                                    <button type="button" className="text-link" onClick={() => onOpenReview(review.id)}>
                                        Open review
                                    </button>
                                )}
                            </article>
                        ))}
                    </div>
                ) : (
                    <div className="progression-empty-inline">No progression reviews have been submitted.</div>
                )}
            </section>
        </main>
    );
}

export default function InstructorProgressionAdmin() {
    const { isInstructor, loading: roleLoading, error: roleError, refresh: refreshRole } = useStudioRole();
    const [activeView, setActiveView] = useState('members');
    const [members, setMembers] = useState([]);
    const [memberTotal, setMemberTotal] = useState(0);
    const [nextMemberOffset, setNextMemberOffset] = useState(null);
    const [selectedMemberUid, setSelectedMemberUid] = useState('');
    const [memberDetail, setMemberDetail] = useState(null);
    const [memberLoading, setMemberLoading] = useState(false);
    const [directoryLoading, setDirectoryLoading] = useState(true);
    const [directoryLoadingMore, setDirectoryLoadingMore] = useState(false);
    const [memberFilters, setMemberFilters] = useState({
        search: '',
        membershipStatus: 'all',
        planKey: 'all',
        levelKey: 'all',
        needsReview: false,
    });
    const [reviews, setReviews] = useState([]);
    const [selectedId, setSelectedId] = useState('');
    const [detail, setDetail] = useState(null);
    const [notes, setNotes] = useState({});
    const [loading, setLoading] = useState(true);
    const [busyKey, setBusyKey] = useState('');
    const [message, setMessage] = useState('');

    const loadMembers = useCallback(async ({
        reset = true,
        force = false,
        filters,
        offset = 0,
    } = {}) => {
        if (reset) setDirectoryLoading(true);
        else setDirectoryLoadingMore(true);
        setMessage('');
        try {
            const result = await listInstructorMembers({
                ...filters,
                offset: reset ? 0 : offset,
                pageSize: 50,
            }, { force });
            const nextMembers = result?.members || [];
            setMembers((current) => reset ? nextMembers : [...current, ...nextMembers]);
            setMemberTotal(Number(result?.total || 0));
            setNextMemberOffset(result?.nextOffset ?? null);
            if (reset) {
                setSelectedMemberUid((current) => (
                    nextMembers.some((member) => member.uid === current)
                        ? current
                        : nextMembers[0]?.uid || ''
                ));
            }
        } catch (error) {
            console.error(error);
            setMessage(error?.message || 'The member directory could not be loaded.');
        } finally {
            setDirectoryLoading(false);
            setDirectoryLoadingMore(false);
        }
    }, []);

    const loadMemberDetail = useCallback(async (memberUid, { force = false } = {}) => {
        if (!memberUid) {
            setMemberDetail(null);
            return;
        }
        setMemberLoading(true);
        setMessage('');
        try {
            const result = await getInstructorMemberDetail(memberUid, { force });
            setMemberDetail(result);
        } catch (error) {
            console.error(error);
            setMemberDetail(null);
            setMessage(error?.message || 'The selected member record could not be opened.');
        } finally {
            setMemberLoading(false);
        }
    }, []);

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
        if (isInstructor) {
            queueMicrotask(() => loadQueue());
        }
    }, [isInstructor, loadQueue]);

    useEffect(() => {
        if (isInstructor && activeView === 'reviews' && selectedId) {
            queueMicrotask(() => loadDetail(selectedId));
        }
    }, [selectedId, isInstructor, activeView, loadDetail]);

    useEffect(() => {
        if (isInstructor && activeView === 'members' && selectedMemberUid) {
            queueMicrotask(() => loadMemberDetail(selectedMemberUid));
        }
    }, [selectedMemberUid, isInstructor, activeView, loadMemberDetail]);

    useEffect(() => {
        if (!isInstructor) return undefined;
        const timer = window.setTimeout(() => {
            loadMembers({ filters: memberFilters });
        }, 250);
        return () => window.clearTimeout(timer);
    }, [isInstructor, memberFilters, loadMembers]);

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

    const openReview = (reviewId) => {
        setSelectedId(reviewId);
        setActiveView('reviews');
    };

    const refreshActiveView = async () => {
        if (activeView === 'members') {
            await Promise.all([
                loadMembers({ force: true, filters: memberFilters }),
                selectedMemberUid
                    ? loadMemberDetail(selectedMemberUid, { force: true })
                    : Promise.resolve(),
            ]);
        } else {
            await Promise.all([
                loadQueue({ force: true }),
                selectedId ? loadDetail(selectedId) : Promise.resolve(),
            ]);
        }
    };

    if (roleLoading) return <div className="page-loader">Verifying instructor access…</div>;

    if (!isInstructor) {
        return (
            <section className="progression-page">
                <div className="container progression-access-denied">
                    <ShieldAlert size={32} />
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
                        <button className="text-link" type="button" onClick={refreshActiveView} disabled={loading || directoryLoading}>
                            <RefreshCw className={loading || directoryLoading ? 'is-spinning' : ''} size={16} /> Refresh
                        </button>
                    </div>
                </div>

                <header className="progression-admin-header">
                    <div><p className="eyebrow">Instructor workspace</p><h1>Members &amp; progression</h1><p>See membership standing, waiver readiness, and progression activity, then move into reviews that need attention.</p></div>
                    <Users size={34} />
                </header>

                {message && <p className="progression-page-message" role="status">{message}</p>}

                <nav className="progression-admin-tabs" aria-label="Members and progression views">
                    <button
                        type="button"
                        className={activeView === 'members' ? 'is-active' : ''}
                        onClick={() => setActiveView('members')}
                    >
                        <Users size={18} />
                        Members
                        <span>{memberTotal}</span>
                    </button>
                    <button
                        type="button"
                        className={activeView === 'reviews' ? 'is-active' : ''}
                        onClick={() => setActiveView('reviews')}
                    >
                        <ClipboardCheck size={18} />
                        Review queue
                        <span>{reviews.length}</span>
                    </button>
                </nav>

                {activeView === 'members' ? (
                    <div className="instructor-members-grid">
                        <MemberDirectory
                            members={members}
                            total={memberTotal}
                            nextOffset={nextMemberOffset}
                            selectedMemberUid={selectedMemberUid}
                            loading={directoryLoading}
                            loadingMore={directoryLoadingMore}
                            filters={memberFilters}
                            onFiltersChange={setMemberFilters}
                            onSelect={setSelectedMemberUid}
                            onLoadMore={() => loadMembers({
                                reset: false,
                                filters: memberFilters,
                                offset: nextMemberOffset,
                            })}
                        />
                        <MemberDetail
                            detail={memberDetail}
                            loading={memberLoading}
                            onOpenReview={openReview}
                        />
                    </div>
                ) : (
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
                )}
            </div>
        </section>
    );
}
