import {
  ArrowLeft,
  CheckCircle2,
  CircleDashed,
  LockKeyhole,
  Send,
  ShieldCheck,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import ProgressionVideoUploader from '../components/progression/ProgressionVideoUploader';
import {
  categoryStatusLabels,
  levelStatusLabels,
  progressionCategories,
  progressionLevelMap,
  progressionLevels,
} from '../data/progressionSystem';
import useProgression from '../hooks/useProgression';
import useStudioRole from '../hooks/useStudioRole';
import {
  saveProgressionCategory,
  submitProgressionLevel,
} from '../services/progression';
import { deleteProgressionVideo } from '../services/progressionVideos';

function statusClass(status) {
  return `progression-status is-${String(status || 'not_started').replaceAll('_', '-')}`;
}

function LevelIcon({ status }) {
  if (status === 'approved') return <CheckCircle2 size={19} />;
  if (status === 'locked') return <LockKeyhole size={18} />;
  return <CircleDashed size={18} />;
}

export default function ProgressionPage() {
  const { data, loading, error, refresh } = useProgression();
  const { isInstructor } = useStudioRole();
  const [selectedLevelKey, setSelectedLevelKey] = useState('');
  const [noteEdits, setNoteEdits] = useState({});
  const [busyKey, setBusyKey] = useState('');
  const [pageMessage, setPageMessage] = useState('');

  const levelRecords = useMemo(
    () => Object.fromEntries((data?.levels || []).map((level) => [level.levelKey, level])),
    [data?.levels],
  );
  const activeLevelKey = selectedLevelKey || data?.profile?.currentLevel || 'white';
  const selectedDefinition = progressionLevelMap[activeLevelKey] || progressionLevels[0];
  const selectedRecord = levelRecords[activeLevelKey] || { categories: {}, status: 'locked' };
  const categoryRecords = selectedRecord.categories || {};

  const canEdit = ['active', 'draft', 'needs_work'].includes(selectedRecord.status);
  const allVideosPresent = progressionCategories.every(
    (category) => categoryRecords[category.key]?.video?.storagePath,
  );

  const saveCategory = async (categoryKey, video = undefined) => {
    const key = `${activeLevelKey}:${categoryKey}`;
    setBusyKey(key);
    setPageMessage('');
    try {
      const result = await saveProgressionCategory({
        levelKey: activeLevelKey,
        categoryKey,
        memberNotes: noteEdits[`${activeLevelKey}:${categoryKey}`] ?? categoryRecords[categoryKey]?.memberNotes ?? '',
        ...(video ? { video } : {}),
      });
      if (video && result?.previousStoragePath && result.previousStoragePath !== video.storagePath) {
        await deleteProgressionVideo(result.previousStoragePath).catch((deleteError) => {
          console.warn('Old progression video was not removed:', deleteError);
        });
      }
      setNoteEdits((current) => {
        const next = { ...current };
        delete next[`${activeLevelKey}:${categoryKey}`];
        return next;
      });
      await refresh();
      setPageMessage(video ? 'Video saved.' : 'Practice notes saved.');
      return result;
    } catch (nextError) {
      console.error(nextError);
      setPageMessage(nextError?.message || 'The category could not be saved.');
      throw nextError;
    } finally {
      setBusyKey('');
    }
  };

  const submitLevel = async () => {
    setBusyKey('submit');
    setPageMessage('');
    try {
      await submitProgressionLevel({ levelKey: activeLevelKey });
      await refresh();
      setPageMessage(`${selectedDefinition.label} was sent to your instructor for review.`);
    } catch (nextError) {
      console.error(nextError);
      setPageMessage(nextError?.message || 'The level could not be submitted.');
    } finally {
      setBusyKey('');
    }
  };

  if (loading) return <div className="page-loader">Loading progression…</div>;

  if (!data) {
    return (
      <section className="progression-page">
        <div className="container progression-access-denied">
          <LockKeyhole size={38} />
          <h1>Progression is a membership feature</h1>
          <p>{error || 'An active studio membership is required before progression tracking can be initialized.'}</p>
          <Link className="button" to="/membership">View membership options</Link>
          <Link className="text-link" to="/member">Return to member home</Link>
        </div>
      </section>
    );
  }

  return (
    <section className="progression-page">
      <div className="container progression-shell">
        <div className="progression-page__topline">
          <Link className="text-link" to="/member"><ArrowLeft size={17} /> Member home</Link>
          {isInstructor && <Link className="text-link" to="/instructor/progression">Instructor review queue</Link>}
        </div>

        <header className="progression-hero">
          <div>
            <p className="eyebrow">Studio progression</p>
            <h1>Train the whole system.</h1>
            <p>
              Progression is earned through consistent practice, current video evidence, and instructor validation across all seven categories.
            </p>
          </div>
          <div className="progression-current">
            <span>Working level</span>
            <strong>{progressionLevelMap[data?.profile?.currentLevel]?.label || 'White Wolf'}</strong>
            <small>
              Highest approved: {data?.profile?.earnedLevel
                ? progressionLevelMap[data.profile.earnedLevel]?.label
                : 'None yet'}
            </small>
          </div>
        </header>

        {error && <p className="form-status form-status--error">{error}</p>}

        <nav className="progression-levels" aria-label="Progression levels">
          {progressionLevels.map((level) => {
            const record = levelRecords[level.key] || { status: 'locked' };
            return (
              <button
                key={level.key}
                type="button"
                className={activeLevelKey === level.key ? 'is-selected' : ''}
                onClick={() => setSelectedLevelKey(level.key)}
              >
                <LevelIcon status={record.status} />
                <span><strong>{level.label}</strong><small>{level.theme}</small></span>
                <em className={statusClass(record.status)}>{levelStatusLabels[record.status] || record.status}</em>
              </button>
            );
          })}
        </nav>

        <section className="progression-level-detail">
          <div className="progression-level-detail__heading">
            <div>
              <p className="eyebrow">Level {selectedDefinition.order + 1} of 4 · {selectedDefinition.theme}</p>
              <h2>{selectedDefinition.label}</h2>
              <p>{selectedDefinition.description}</p>
            </div>
            <span className={statusClass(selectedRecord.status)}>
              {levelStatusLabels[selectedRecord.status] || selectedRecord.status}
            </span>
          </div>

          <div className="progression-category-list">
            {progressionCategories.map((category) => {
              const requirement = selectedDefinition.categories[category.key];
              const record = categoryRecords[category.key] || { status: 'locked' };
              const isBusy = busyKey === `${activeLevelKey}:${category.key}`;
              const categoryEditable = canEdit && record.status !== 'validated';

              return (
                <article className="progression-category" key={category.key}>
                  <div className="progression-category__heading">
                    <div>
                      <p className="eyebrow">{category.label}</p>
                      <h3>{requirement.summary}</h3>
                      <p>{category.description}</p>
                    </div>
                    <span className={statusClass(record.status)}>
                      {categoryStatusLabels[record.status] || record.status}
                    </span>
                  </div>

                  <div className="progression-category__grid">
                    <div>
                      <h4>Skill requirements</h4>
                      <ul className="progression-requirements">
                        {requirement.items.map((item) => <li key={item}>{item}</li>)}
                      </ul>
                    </div>

                    <div className="progression-evidence">
                      <h4>Current evidence</h4>
                      <ProgressionVideoUploader
                        memberUid={data.profile.memberUid}
                        levelKey={activeLevelKey}
                        categoryKey={category.key}
                        video={record.video}
                        disabled={!categoryEditable || isBusy}
                        onUpload={(video) => saveCategory(category.key, video)}
                      />
                    </div>
                  </div>

                  <label className="progression-notes">
                    Practice notes
                    <textarea
                      value={noteEdits[`${activeLevelKey}:${category.key}`] ?? record.memberNotes ?? ''}
                      onChange={(event) => setNoteEdits((current) => ({
                        ...current,
                        [`${activeLevelKey}:${category.key}`]: event.target.value,
                      }))}
                      disabled={!categoryEditable || isBusy}
                      placeholder="What are you practicing, what feels reliable, and where do you need instructor feedback?"
                    />
                  </label>

                  {record.instructorNotes && (
                    <div className="progression-feedback">
                      <ShieldCheck size={19} />
                      <div><strong>Instructor feedback</strong><p>{record.instructorNotes}</p></div>
                    </div>
                  )}

                  {categoryEditable && (
                    <button
                      className="button button--small button--dark-ghost"
                      type="button"
                      onClick={() => saveCategory(category.key)}
                      disabled={isBusy}
                    >
                      {isBusy ? 'Saving…' : 'Save practice notes'}
                    </button>
                  )}
                </article>
              );
            })}
          </div>

          <footer className="progression-submit">
            <div>
              <strong>Ready for instructor review?</strong>
              <p>Every category needs a current video. Your instructor validates each category before approving the level.</p>
            </div>
            <button
              className="button"
              type="button"
              onClick={submitLevel}
              disabled={!canEdit || !allVideosPresent || busyKey === 'submit'}
            >
              <Send size={17} />
              {busyKey === 'submit' ? 'Submitting…' : 'Submit this level'}
            </button>
          </footer>

          {pageMessage && <p className="progression-page-message" role="status">{pageMessage}</p>}
        </section>
      </div>
    </section>
  );
}
