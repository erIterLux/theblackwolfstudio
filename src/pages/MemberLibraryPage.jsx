import {
  ArrowLeft,
  BookOpen,
  Filter,
  LockKeyhole,
  Search,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import ProgressionContentDetail from '../components/content/ProgressionContentDetail';
import {
  progressionCategories,
  progressionCategoryMap,
  progressionLevels,
  progressionLevelMap,
} from '../data/progressionSystem';
import useProgressionContent from '../hooks/useProgressionContent';

export default function MemberLibraryPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [search, setSearch] = useState('');
  const levelKey = searchParams.get('level') || '';
  const categoryKey = searchParams.get('category') || '';
  const accessKey = searchParams.get('access') || '';
  const selectedContentId = searchParams.get('content') || '';
  const {
    items,
    libraryAccessLevel,
    loading,
    error,
  } = useProgressionContent();

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return items.filter((item) => {
      const matchesLevel = !levelKey || item.levelKeys?.includes(levelKey);
      const matchesCategory = !categoryKey || item.categoryKeys?.includes(categoryKey);
      const matchesAccess = !accessKey || (item.accessLevel || 'basic') === accessKey;
      const haystack = [
        item.title,
        item.summary,
        ...(item.techniqueTags || []),
      ].join(' ').toLowerCase();
      return matchesLevel && matchesCategory && matchesAccess && (!query || haystack.includes(query));
    });
  }, [items, levelKey, categoryKey, accessKey, search]);

  const selectedItem = items.find((item) => item.id === selectedContentId) || null;

  const setFilter = (name, value) => {
    const next = new URLSearchParams(searchParams);
    if (value) next.set(name, value);
    else next.delete(name);
    next.delete('content');
    setSearchParams(next);
  };

  if (selectedItem) {
    return (
      <section className="content-library-page">
        <div className="container content-library-shell">
          <button
            className="text-link"
            type="button"
            onClick={() => {
              const next = new URLSearchParams(searchParams);
              next.delete('content');
              setSearchParams(next);
            }}
          >
            <ArrowLeft size={17} /> Back to training references
          </button>
          {selectedItem.locked ? (
            <article className="content-library-locked-detail">
              <div className="content-library-locked-detail__preview" aria-hidden="true">
                <p className="eyebrow">Advanced training reference</p>
                <h1>{selectedItem.title}</h1>
                <p>{selectedItem.summary}</p>
              </div>
              <div className="content-library-locked-detail__message">
                <span><LockKeyhole size={24} /></span>
                <div>
                  <p className="eyebrow">Advanced library</p>
                  <h2>Unlock this training reference.</h2>
                  <p>Advanced references are available with Train and Integrate memberships. Upgrade to open the full lesson and its connected media.</p>
                  <Link className="button button--small" to="/membership">Compare memberships</Link>
                </div>
              </div>
            </article>
          ) : (
            <ProgressionContentDetail item={selectedItem} />
          )}
        </div>
      </section>
    );
  }

  return (
    <section className="content-library-page">
      <div className="container content-library-shell">
        <div className="progression-page__topline">
          <Link className="text-link" to="/member"><ArrowLeft size={17} /> Member home</Link>
          <Link className="text-link" to="/member/progression">Open progression</Link>
        </div>

        <header className="content-library-header">
          <div>
            <p className="eyebrow">Member learning library</p>
            <h1>Train with a clear reference.</h1>
            <p>Begin includes Basic references. Train and Integrate unlock both Basic and Advanced references, including connected text, images, audio, and video.</p>
            <span className={`content-library-access is-${libraryAccessLevel}`}>
              Your access: {libraryAccessLevel === 'advanced' ? 'Basic + Advanced' : 'Basic'}
            </span>
          </div>
          <BookOpen size={34} />
        </header>

        <div className="content-library-filters">
          <label className="content-search">
            <Search size={18} />
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search techniques, concepts, or tags"
            />
          </label>

          <label>
            <Filter size={16} /> Level
            <select value={levelKey} onChange={(event) => setFilter('level', event.target.value)}>
              <option value="">All levels</option>
              {progressionLevels.map((level) => <option key={level.key} value={level.key}>{level.label}</option>)}
            </select>
          </label>

          <label>
            <Filter size={16} /> Category
            <select value={categoryKey} onChange={(event) => setFilter('category', event.target.value)}>
              <option value="">All categories</option>
              {progressionCategories.map((category) => <option key={category.key} value={category.key}>{category.label}</option>)}
            </select>
          </label>

          <label>
            <Filter size={16} /> Content access
            <select value={accessKey} onChange={(event) => setFilter('access', event.target.value)}>
              <option value="">Basic and Advanced</option>
              <option value="basic">Basic</option>
              <option value="advanced">Advanced</option>
            </select>
          </label>
        </div>

        {error && <p className="form-status form-status--error">{error}</p>}

        {loading ? (
          <div className="page-loader">Loading training references…</div>
        ) : filtered.length === 0 ? (
          <div className="content-library-empty">
            <BookOpen size={30} />
            <h2>No references match these filters.</h2>
            <p>Published instructor content will appear here as it is added.</p>
          </div>
        ) : (
          <div className="content-library-grid">
            {filtered.map((item) => {
              const cardContents = (
                <>
                  <div className="content-library-card__meta">
                    <span className={`content-access-badge is-${item.accessLevel || 'basic'}`}>
                      {item.accessLevel === 'advanced' ? 'Advanced' : 'Basic'}
                    </span>
                    <span>{progressionLevelMap[item.levelKeys?.[0]]?.label || 'Multiple levels'}</span>
                    <span>{progressionCategoryMap[item.primaryCategory]?.label || 'Training reference'}</span>
                  </div>
                  <BookOpen size={24} />
                  <h2>{item.title}</h2>
                  <p>{item.summary}</p>
                  <div className="content-tag-row">
                    {(item.techniqueTags || []).slice(0, 4).map((tag) => <span key={tag}>{tag}</span>)}
                  </div>
                </>
              );

              if (item.locked) {
                return (
                  <article className="content-library-card is-locked" key={item.id}>
                    <div className="content-library-card__blur" aria-hidden="true">{cardContents}</div>
                    <div className="content-library-card__lock">
                      <span><LockKeyhole size={21} /></span>
                      <div>
                        <strong>Advanced reference</strong>
                        <small>Upgrade to Train or Integrate to unlock.</small>
                      </div>
                      <Link className="text-link" to="/membership">View plans</Link>
                    </div>
                  </article>
                );
              }

              return (
                <button
                  className="content-library-card"
                  type="button"
                  key={item.id}
                  onClick={() => {
                    const next = new URLSearchParams(searchParams);
                    next.set('content', item.id);
                    setSearchParams(next);
                  }}
                >
                  {cardContents}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
