import {
    AlertCircle,
    ArrowRight,
    CheckCircle2,
    Circle,
    Clock3,
    PlayCircle,
    TrendingUp,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import {
    progressionCategories,
    progressionLevelMap,
    progressionLevels,
} from '../../data/progressionSystem';
import useProgression from '../../hooks/useProgression';

const MEMBER_LEVEL_STATES = {
    active: 'In practice',
    draft: 'In practice',
    submitted: 'Awaiting instructor review',
    in_review: 'Instructor reviewing',
    needs_work: 'Updates requested',
    ready_for_approval: 'Final approval pending',
    approved: 'Level completed',
    locked: 'Not yet available',
};

function hasEvidence(record = {}) {
    return Boolean(
        record.currentEvidence?.storagePath
        || record.latestEvidence?.storagePath
        || record.video?.storagePath
        || record.evidenceCount > 0,
    );
}

function getCategoryState(record = {}, levelStatus = '') {
    if (record.status === 'validated') {
        return {
            key: 'validated',
            label: 'Validated',
            Icon: CheckCircle2,
        };
    }

    if (record.status === 'needs_work') {
        return {
            key: 'needs-work',
            label: 'Updates requested',
            Icon: AlertCircle,
        };
    }

    if (['submitted', 'in_review', 'ready_for_approval'].includes(record.status)) {
        return {
            key: 'review',
            label: 'Under review',
            Icon: Clock3,
        };
    }

    if (hasEvidence(record)) {
        return {
            key: ['submitted', 'in_review', 'ready_for_approval'].includes(levelStatus)
                ? 'review'
                : 'evidence',
            label: ['submitted', 'in_review', 'ready_for_approval'].includes(levelStatus)
                ? 'Under review'
                : 'Evidence ready',
            Icon: ['submitted', 'in_review', 'ready_for_approval'].includes(levelStatus)
                ? Clock3
                : PlayCircle,
        };
    }

    return {
        key: 'not-started',
        label: 'Not started',
        Icon: Circle,
    };
}

function getNextAction(level, categories) {
    if (!level) {
        return {
            title: 'Open your progression',
            detail: 'Begin with the White Wolf foundation and review each category.',
            buttonLabel: 'Open progression',
        };
    }

    const categoryNeedingWork = progressionCategories.find(
        (category) => categories[category.key]?.status === 'needs_work',
    );

    if (categoryNeedingWork) {
        return {
            title: `Review ${categoryNeedingWork.label} feedback`,
            detail: 'Your instructor requested an update before this category can be validated.',
            buttonLabel: 'Review feedback',
            tone: 'attention',
        };
    }

    if (['submitted', 'in_review', 'ready_for_approval'].includes(level.status)) {
        return {
            title: 'Your level is with your instructor',
            detail: 'No new upload is needed unless your instructor requests an update.',
            buttonLabel: 'View submission',
            tone: 'waiting',
        };
    }

    const categoryMissingEvidence = progressionCategories.find(
        (category) => !hasEvidence(categories[category.key]),
    );

    if (categoryMissingEvidence) {
        return {
            title: `Add ${categoryMissingEvidence.label} evidence`,
            detail: 'Upload or record a current demonstration for this category.',
            buttonLabel: 'Continue progression',
        };
    }

    const categoryNotValidated = progressionCategories.find(
        (category) => categories[category.key]?.status !== 'validated',
    );

    if (categoryNotValidated && level.status !== 'approved') {
        return {
            title: 'Send this level for instructor review',
            detail: 'All seven categories have evidence and are ready to be reviewed together.',
            buttonLabel: 'Review and submit',
        };
    }

    if (level.status === 'approved') {
        return {
            title: 'Your level is complete',
            detail: 'Review your achievement and see which Wolf level is available next.',
            buttonLabel: 'View progression',
            tone: 'complete',
        };
    }

    return {
        title: 'Continue your progression',
        detail: 'Keep your evidence and practice notes current as you train.',
        buttonLabel: 'Continue progression',
    };
}

function findCurrentLevel(data) {
    const levelKey = data?.profile?.currentLevelKey
        || data?.profile?.currentLevel
        || data?.currentLevelKey
        || data?.currentLevel
        || 'white';

    const levels = Array.isArray(data?.levels) ? data.levels : [];
    const level = levels.find(
        (item) => item.levelKey === levelKey || item.key === levelKey,
    );

    return { levelKey, level, levels };
}

export default function ProgressionSummaryCard({ dashboardState }) {
    const hasDashboardState = dashboardState !== undefined;
    const remote = useProgression({ enabled: !hasDashboardState });
    const data = hasDashboardState ? dashboardState?.data || null : remote.data;
    const loading = hasDashboardState ? dashboardState?.loading === true : remote.loading;
    const error = hasDashboardState ? dashboardState?.error || '' : remote.error;
    const accessAvailable = hasDashboardState
        ? dashboardState?.accessAvailable === true
        : Boolean(data);

    if (loading) {
        return (
            <article
                className="dashboard-card progression-summary-card progression-summary-card--loading"
                aria-live="polite"
            >
                <p>Loading your progression…</p>
            </article>
        );
    }

    if (!data) {
        return (
            <article className="dashboard-card progression-summary-card progression-summary-card--locked">
                <div className="dashboard-card__heading">
                    <TrendingUp aria-hidden="true" />
                    <div>
                        <p className="eyebrow">Your progression</p>
                        <h2>White Wolf to Black Wolf</h2>
                    </div>
                </div>
                <p>
                    {error
                        || (accessAvailable
                            ? 'Your progression is ready to begin. Open it to review the White Wolf foundation.'
                            : 'A qualifying membership or instructor grant unlocks progression, training references, and instructor validation.')}
                </p>
                <Link to={accessAvailable ? '/member/progression' : '/membership'} className="button">
                    {accessAvailable ? 'Open progression' : 'Explore membership'}
                </Link>
            </article>
        );
    }

    const { levelKey: currentLevelKey, level: currentLevel, levels } = findCurrentLevel(data);
    const categories = currentLevel?.categories || {};
    const totalCategories = progressionCategories.length;
    const evidenceCount = progressionCategories.filter(
        (category) => hasEvidence(categories[category.key]),
    ).length;
    const validatedCount = progressionCategories.filter(
        (category) => categories[category.key]?.status === 'validated',
    ).length;
    const attentionCount = progressionCategories.filter(
        (category) => categories[category.key]?.status === 'needs_work',
    ).length;
    const evidencePercent = Math.round((evidenceCount / totalCategories) * 100);
    const validatedPercent = Math.round((validatedCount / totalCategories) * 100);
    const levelDefinition = progressionLevelMap[currentLevelKey] || progressionLevels[0];
    const levelStatus = currentLevel?.status || 'active';
    const nextAction = getNextAction(currentLevel, categories);

    return (
        <article className="dashboard-card progression-summary-card">
            <div className="progression-summary-card__top">
                <div className="dashboard-card__heading">
                    <TrendingUp aria-hidden="true" />
                    <div>
                        <p className="eyebrow">Your progression</p>
                        <h2>{levelDefinition.label}</h2>
                        <p>{levelDefinition.theme}</p>
                    </div>
                </div>

                <span className={`progression-summary-state is-${String(levelStatus).replaceAll('_', '-')}`}>
                    {MEMBER_LEVEL_STATES[levelStatus] || 'In practice'}
                </span>
            </div>

            <div className="progression-summary-metrics" aria-label="Progression summary">
                <div>
                    <PlayCircle aria-hidden="true" />
                    <strong>{evidenceCount} of {totalCategories}</strong>
                    <span>Evidence added</span>
                </div>
                <div>
                    <CheckCircle2 aria-hidden="true" />
                    <strong>{validatedCount} of {totalCategories}</strong>
                    <span>Instructor validated</span>
                </div>
                <div className={attentionCount > 0 ? 'has-attention' : ''}>
                    <AlertCircle aria-hidden="true" />
                    <strong>{attentionCount}</strong>
                    <span>Updates requested</span>
                </div>
            </div>

            <div className="progression-summary-bars">
                <div className="progression-summary-progress">
                    <div>
                        <span>Evidence readiness</span>
                        <strong>{evidencePercent}%</strong>
                    </div>
                    <progress
                        value={evidenceCount}
                        max={totalCategories}
                        aria-label={`${evidenceCount} of ${totalCategories} categories have evidence`}
                    />
                </div>

                <div className="progression-summary-progress progression-summary-progress--validated">
                    <div>
                        <span>Instructor validation</span>
                        <strong>{validatedPercent}%</strong>
                    </div>
                    <progress
                        value={validatedCount}
                        max={totalCategories}
                        aria-label={`${validatedCount} of ${totalCategories} categories are validated`}
                    />
                </div>
            </div>

            <section className="progression-category-overview" aria-labelledby="category-progress-heading">
                <div className="progression-category-overview__heading">
                    <div>
                        <p className="eyebrow">Category status</p>
                        <h3 id="category-progress-heading">What is complete and what needs attention</h3>
                    </div>
                    <Link to="/member/progression" className="text-link">
                        View details <ArrowRight size={17} aria-hidden="true" />
                    </Link>
                </div>

                <div className="progression-category-status-grid">
                    {progressionCategories.map((category) => {
                        const state = getCategoryState(categories[category.key], levelStatus);
                        const Icon = state.Icon;
                        return (
                            <div className={`progression-category-status is-${state.key}`} key={category.key}>
                                <Icon aria-hidden="true" />
                                <div>
                                    <strong>{category.label}</strong>
                                    <span>{state.label}</span>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </section>

            <div className={`progression-summary-action is-${nextAction.tone || 'default'}`}>
                <div>
                    <p className="eyebrow">Next step</p>
                    <h3>{nextAction.title}</h3>
                    <p>{nextAction.detail}</p>
                </div>
                <Link to="/member/progression" className="button">
                    {nextAction.buttonLabel} <ArrowRight size={17} aria-hidden="true" />
                </Link>
            </div>

            <div className="progression-level-rail" aria-label="Wolf progression levels">
                {progressionLevels.map((level) => {
                    const record = levels.find(
                        (item) => item.levelKey === level.key || item.key === level.key,
                    );
                    const state = level.key === currentLevelKey
                        ? 'current'
                        : record?.status === 'approved'
                            ? 'complete'
                            : record?.status === 'locked'
                                ? 'locked'
                                : 'available';

                    const stateLabel = state === 'current'
                        ? 'Current level'
                        : state === 'complete'
                            ? 'Completed'
                            : state === 'locked'
                                ? 'Locked'
                                : 'Available';

                    return (
                        <div
                            className={`progression-level-rail__item is-${state}`}
                            data-progression-level={level.key}
                            key={level.key}
                        >
                            <span aria-hidden="true" />
                            <strong>{level.label}</strong>
                            <small>{stateLabel}</small>
                        </div>
                    );
                })}
            </div>
        </article>
    );
}
