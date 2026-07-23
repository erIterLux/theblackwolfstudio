import {
    Archive,
    ArrowLeft,
    BookOpen,
    FileAudio,
    FileImage,
    FileText,
    FileVideo,
    Plus,
    RefreshCw,
    Save,
    Send,
    ShieldAlert,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import ContentBlockEditor from '../components/content/ContentBlockEditor';
import ProgressionContentDetail from '../components/content/ProgressionContentDetail';
import {
    getRequirementOptions,
    progressionCategories,
    progressionLevels,
} from '../data/progressionSystem';
import useStudioRole from '../hooks/useStudioRole';
import {
    listProgressionContent,
    saveProgressionContent,
    setProgressionContentStatus,
} from '../services/progressionContent';
import { makeClientId } from '../services/progressionMedia';

const EMPTY_CONTENT = {
    id: '',
    title: '',
    summary: '',
    primaryCategory: 'movement',
    categoryKeys: ['movement'],
    levelKeys: ['white'],
    requirementRefs: [],
    techniqueTags: [],
    learningObjectives: [],
    keyPoints: [],
    commonMistakes: [],
    safetyNotes: [],
    blocks: [],
    visibility: 'members',
    aiEligible: true,
    status: 'draft',
};

function toLines(values) {
    return (values || []).join('\n');
}

function fromLines(value) {
    return String(value || '')
        .split('\n')
        .map((item) => item.trim())
        .filter(Boolean);
}

function toTags(value) {
    return String(value || '')
        .split(',')
        .map((item) => item.trim().toLowerCase())
        .filter(Boolean);
}

function makeDraft(item = {}) {
    return {
        ...EMPTY_CONTENT,
        ...item,
        id: item.id || makeClientId('content'),
        categoryKeys: item.categoryKeys?.length ? item.categoryKeys : ['movement'],
        levelKeys: item.levelKeys?.length ? item.levelKeys : ['white'],
        requirementRefs: item.requirementRefs || [],
        techniqueTagsText: (item.techniqueTags || []).join(', '),
        learningObjectivesText: toLines(item.learningObjectives),
        keyPointsText: toLines(item.keyPoints),
        commonMistakesText: toLines(item.commonMistakes),
        safetyNotesText: toLines(item.safetyNotes),
        blocks: item.blocks || [],
    };
}

function statusClass(status) {
    return `content-status is-${status || 'draft'}`;
}

export default function InstructorContentAdmin() {
    const { isInstructor, loading: roleLoading, error: roleError, refresh: refreshRole } = useStudioRole();
    const [items, setItems] = useState([]);
    const [draft, setDraft] = useState(() => makeDraft());
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState(false);
    const [message, setMessage] = useState('');
    const [preview, setPreview] = useState(false);
    const [search, setSearch] = useState('');

    const loadItems = useCallback(async () => {
        setLoading(true);
        setMessage('');
        try {
            const result = await listProgressionContent({ includeDrafts: true });
            setItems(result?.items || []);
        } catch (error) {
            console.error(error);
            setMessage(error?.message || 'The content library could not be loaded.');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        if (isInstructor) queueMicrotask(() => loadItems());
    }, [isInstructor, loadItems]);

    const requirementOptions = useMemo(
        () => getRequirementOptions(draft.levelKeys, draft.categoryKeys),
        [draft.levelKeys, draft.categoryKeys],
    );

    const filteredItems = useMemo(() => {
        const query = search.trim().toLowerCase();
        if (!query) return items;
        return items.filter((item) => [
            item.title,
            item.summary,
            item.status,
            ...(item.techniqueTags || []),
        ].join(' ').toLowerCase().includes(query));
    }, [items, search]);

    const updateDraft = (patch) => setDraft((current) => ({ ...current, ...patch }));

    const toggleArrayValue = (field, value) => {
        setDraft((current) => {
            const values = new Set(current[field] || []);
            if (values.has(value)) values.delete(value);
            else values.add(value);
            const next = [...values];
            if (!next.length && (field === 'levelKeys' || field === 'categoryKeys')) return current;
            const patch = { [field]: next };
            if (field === 'categoryKeys' && !next.includes(current.primaryCategory)) {
                patch.primaryCategory = next[0];
            }
            return { ...current, ...patch };
        });
    };

    const addBlock = (type) => {
        updateDraft({
            blocks: [
                ...draft.blocks,
                {
                    id: makeClientId('block'),
                    type,
                    heading: '',
                    body: '',
                    caption: '',
                    asset: null,
                },
            ],
        });
    };

    const updateBlock = (index, block) => {
        updateDraft({
            blocks: draft.blocks.map((item, itemIndex) => (itemIndex === index ? block : item)),
        });
    };

    const removeBlock = (index) => {
        updateDraft({ blocks: draft.blocks.filter((_, itemIndex) => itemIndex !== index) });
    };

    const payload = () => ({
        contentId: draft.id,
        title: draft.title,
        summary: draft.summary,
        primaryCategory: draft.primaryCategory,
        categoryKeys: draft.categoryKeys,
        levelKeys: draft.levelKeys,
        requirementRefs: draft.requirementRefs,
        techniqueTags: toTags(draft.techniqueTagsText),
        learningObjectives: fromLines(draft.learningObjectivesText),
        keyPoints: fromLines(draft.keyPointsText),
        commonMistakes: fromLines(draft.commonMistakesText),
        safetyNotes: fromLines(draft.safetyNotesText),
        blocks: draft.blocks,
        visibility: draft.visibility,
        aiEligible: draft.aiEligible,
    });

    const save = async (publish = false) => {
        setBusy(true);
        setMessage('');
        try {
            const result = await saveProgressionContent(payload());
            if (publish) await setProgressionContentStatus(result.contentId, 'published');
            await loadItems();
            const nextResult = await listProgressionContent({ includeDrafts: true });
            const saved = nextResult?.items?.find((item) => item.id === result.contentId);
            if (saved) setDraft(makeDraft(saved));
            setMessage(publish ? 'Reference published to members and Wolf Guide.' : 'Draft saved.');
        } catch (error) {
            console.error(error);
            setMessage(error?.message || 'The training reference could not be saved.');
        } finally {
            setBusy(false);
        }
    };

    const archive = async () => {
        setBusy(true);
        setMessage('');
        try {
            await setProgressionContentStatus(draft.id, 'archived');
            await loadItems();
            setDraft(makeDraft());
            setMessage('Reference archived and removed from member and AI retrieval.');
        } catch (error) {
            console.error(error);
            setMessage(error?.message || 'The reference could not be archived.');
        } finally {
            setBusy(false);
        }
    };

    if (roleLoading) return <div className="page-loader">Verifying instructor access…</div>;

    if (!isInstructor) {
        return (
            <section className="content-admin-page">
                <div className="container progression-access-denied">
                    <ShieldAlert size={38} />
                    <h1>Instructor access required</h1>
                    <p>{roleError || 'Only instructors and administrators can manage the training library.'}</p>
                    <button className="button" type="button" onClick={refreshRole}>Check access again</button>
                </div>
            </section>
        );
    }

    const existingItem = items.some((item) => item.id === draft.id);

    const previewItem = {
        ...payload(),
        id: draft.id,
        status: draft.status,
    };

    return (
        <section className="content-admin-page">
            <div className="container content-admin-shell">
                <div className="progression-page__topline">
                    <Link className="text-link" to="/instructor"><ArrowLeft size={17} /> Instructor overview</Link>
                    <Link className="text-link" to="/instructor/progression">Progression reviews</Link>
                </div>

                <header className="content-admin-header">
                    <div>
                        <p className="eyebrow">Instructor workspace</p>
                        <h1>Training reference library</h1>
                        <p>Create structured content that appears in progression and becomes current Wolf Guide context when published.</p>
                    </div>
                    <BookOpen size={46} />
                </header>

                {message && <p className="progression-page-message" role="status">{message}</p>}

                <div className="content-admin-grid">
                    <aside className="content-admin-list">
                        <div className="content-admin-list__heading">
                            <h2>References</h2>
                            <button className="button button--small" type="button" onClick={() => setDraft(makeDraft())}>
                                <Plus size={16} /> New
                            </button>
                        </div>
                        <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search content" />
                        <button className="text-link" type="button" onClick={loadItems} disabled={loading}>
                            <RefreshCw className={loading ? 'is-spinning' : ''} size={15} /> Refresh
                        </button>

                        {filteredItems.map((item) => (
                            <button
                                key={item.id}
                                type="button"
                                className={draft.id === item.id ? 'is-selected' : ''}
                                onClick={() => {
                                    setDraft(makeDraft(item));
                                    setPreview(false);
                                }}
                            >
                                <span><strong>{item.title}</strong><small>{item.summary}</small></span>
                                <em className={statusClass(item.status)}>{item.status}</em>
                            </button>
                        ))}
                    </aside>

                    <main className="content-admin-editor">
                        <div className="content-admin-editor__toolbar">
                            <div>
                                <span className={statusClass(draft.status)}>{draft.status}</span>
                                <small>Version {draft.version || 1}</small>
                            </div>
                            <button className="text-link" type="button" onClick={() => setPreview((current) => !current)}>
                                {preview ? 'Return to editor' : 'Preview as member'}
                            </button>
                        </div>

                        {preview ? (
                            <ProgressionContentDetail item={previewItem} />
                        ) : (
                            <div className="content-editor-form">
                                <label>
                                    Title
                                    <input value={draft.title} onChange={(event) => updateDraft({ title: event.target.value })} placeholder="Example: Maintaining a Stable Fighting Base" />
                                </label>
                                <label>
                                    Summary
                                    <textarea value={draft.summary} onChange={(event) => updateDraft({ summary: event.target.value })} placeholder="A concise explanation of what this reference teaches." />
                                </label>

                                <fieldset>
                                    <legend>Progression levels</legend>
                                    <div className="content-checkbox-grid">
                                        {progressionLevels.map((level) => (
                                            <label key={level.key}>
                                                <input type="checkbox" checked={draft.levelKeys.includes(level.key)} onChange={() => toggleArrayValue('levelKeys', level.key)} />
                                                {level.label}
                                            </label>
                                        ))}
                                    </div>
                                </fieldset>

                                <fieldset>
                                    <legend>Skill categories</legend>
                                    <div className="content-checkbox-grid">
                                        {progressionCategories.map((category) => (
                                            <label key={category.key}>
                                                <input type="checkbox" checked={draft.categoryKeys.includes(category.key)} onChange={() => toggleArrayValue('categoryKeys', category.key)} />
                                                {category.label}
                                            </label>
                                        ))}
                                    </div>
                                </fieldset>

                                <label>
                                    Primary category
                                    <select value={draft.primaryCategory} onChange={(event) => updateDraft({ primaryCategory: event.target.value })}>
                                        {draft.categoryKeys.map((categoryKey) => {
                                            const category = progressionCategories.find((item) => item.key === categoryKey);
                                            return <option key={categoryKey} value={categoryKey}>{category?.label || categoryKey}</option>;
                                        })}
                                    </select>
                                </label>

                                <fieldset>
                                    <legend>Connected skill requirements</legend>
                                    <p className="field-help">Choose the exact requirements this reference supports.</p>
                                    <div className="requirement-picker">
                                        {requirementOptions.map((option) => (
                                            <label key={option.reference}>
                                                <input
                                                    type="checkbox"
                                                    checked={draft.requirementRefs.includes(option.reference)}
                                                    onChange={() => toggleArrayValue('requirementRefs', option.reference)}
                                                />
                                                <span><strong>{option.levelLabel} · {option.categoryLabel}</strong>{option.text}</span>
                                            </label>
                                        ))}
                                    </div>
                                </fieldset>

                                <label>
                                    Technique tags
                                    <input value={draft.techniqueTagsText} onChange={(event) => updateDraft({ techniqueTagsText: event.target.value })} placeholder="stance, balance, footwork" />
                                </label>

                                <div className="content-editor-lists">
                                    <label>Learning objectives<textarea value={draft.learningObjectivesText} onChange={(event) => updateDraft({ learningObjectivesText: event.target.value })} placeholder="One item per line" /></label>
                                    <label>Key points<textarea value={draft.keyPointsText} onChange={(event) => updateDraft({ keyPointsText: event.target.value })} placeholder="One item per line" /></label>
                                    <label>Common mistakes<textarea value={draft.commonMistakesText} onChange={(event) => updateDraft({ commonMistakesText: event.target.value })} placeholder="One item per line" /></label>
                                    <label>Safety notes<textarea value={draft.safetyNotesText} onChange={(event) => updateDraft({ safetyNotesText: event.target.value })} placeholder="One item per line" /></label>
                                </div>

                                <div className="content-blocks-heading">
                                    <div><h2>Content sections</h2><p>Mix text, images, audio, and video. Media captions are provided to Wolf Guide.</p></div>
                                    <div>
                                        <button type="button" onClick={() => addBlock('text')}><FileText size={16} /> Text</button>
                                        <button type="button" onClick={() => addBlock('image')}><FileImage size={16} /> Image</button>
                                        <button type="button" onClick={() => addBlock('audio')}><FileAudio size={16} /> Audio</button>
                                        <button type="button" onClick={() => addBlock('video')}><FileVideo size={16} /> Video</button>
                                    </div>
                                </div>

                                {draft.blocks.map((block, index) => (
                                    <ContentBlockEditor
                                        key={block.id}
                                        contentId={draft.id}
                                        block={block}
                                        disabled={busy}
                                        onChange={(nextBlock) => updateBlock(index, nextBlock)}
                                        onRemove={() => removeBlock(index)}
                                    />
                                ))}

                                {!draft.blocks.length && <p className="content-editor-empty">Add at least one section to build the reference.</p>}

                                <div className="content-publishing-options">
                                    <label>
                                        Visibility
                                        <select value={draft.visibility} onChange={(event) => updateDraft({ visibility: event.target.value })}>
                                            <option value="members">Members</option>
                                            <option value="instructors">Instructors only</option>
                                        </select>
                                    </label>
                                    <label className="content-ai-toggle">
                                        <input type="checkbox" checked={draft.aiEligible} onChange={(event) => updateDraft({ aiEligible: event.target.checked })} />
                                        Include published content in Wolf Guide retrieval
                                    </label>
                                </div>
                            </div>
                        )}

                        <footer className="content-admin-actions">
                            {existingItem && draft.status !== 'archived' && draft.title && (
                                <button className="button button--small button--dark-ghost" type="button" onClick={archive} disabled={busy}>
                                    <Archive size={16} /> Archive
                                </button>
                            )}
                            <button className="button button--small button--dark-ghost" type="button" onClick={() => save(false)} disabled={busy || !draft.title.trim() || !draft.summary.trim()}>
                                <Save size={16} /> {busy ? 'Saving…' : 'Save draft'}
                            </button>
                            <button className="button button--small" type="button" onClick={() => save(true)} disabled={busy || !draft.title.trim() || !draft.summary.trim() || !draft.blocks.length}>
                                <Send size={16} /> {busy ? 'Publishing…' : 'Publish'}
                            </button>
                        </footer>
                    </main>
                </div>
            </div>
        </section>
    );
}
