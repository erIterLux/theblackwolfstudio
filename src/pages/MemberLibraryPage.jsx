import {
  ArrowLeft,
  BookOpen,
  Filter,
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
  const selectedContentId = searchParams.get('content') || '';
  const { items, loading, error } = useProgressionContent();

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return items.filter((item) => {
      const matchesLevel = !levelKey || item.levelKeys?.includes(levelKey);
      const matchesCategory = !categoryKey || item.categoryKeys?.includes(categoryKey);
      const haystack = [
        item.title,
        item.summary,
        ...(item.techniqueTags || []),
      ].join(' ').toLowerCase();
      return matchesLevel && matchesCategory && (!query || haystack.includes(query));
    });
  }, [items, levelKey, categoryKey, search]);

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
          <ProgressionContentDetail item={selectedItem} />
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
            <p>Instructor-published text, images, audio, and video connected directly to progression requirements.</p>
          </div>
          <BookOpen size={46} />
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
            {filtered.map((item) => (
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
                <div className="content-library-card__meta">
                  <span>{progressionLevelMap[item.levelKeys?.[0]]?.label || 'Multiple levels'}</span>
                  <span>{progressionCategoryMap[item.primaryCategory]?.label || 'Training reference'}</span>
                </div>
                <BookOpen size={24} />
                <h2>{item.title}</h2>
                <p>{item.summary}</p>
                <div className="content-tag-row">
                  {(item.techniqueTags || []).slice(0, 4).map((tag) => <span key={tag}>{tag}</span>)}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
