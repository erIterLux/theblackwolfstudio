import { ArrowRight, BookOpen, LockKeyhole } from 'lucide-react';
import { Link } from 'react-router-dom';

export default function RelatedContentList({ items = [], levelKey, categoryKey }) {
  if (!items.length) {
    return (
      <div className="related-content related-content--empty">
        <BookOpen size={20} />
        <p>No published reference has been linked to this category yet.</p>
      </div>
    );
  }

  return (
    <div className="related-content">
      <div className="related-content__heading">
        <h4>Instructor references</h4>
        <Link
          className="text-link"
          to={`/member/library?level=${levelKey}&category=${categoryKey}`}
        >
          View all <ArrowRight size={16} />
        </Link>
      </div>
      <div className="related-content__items">
        {items.slice(0, 3).map((item) => (
          item.locked ? (
            <div className="related-content__locked" key={item.id}>
              <div aria-hidden="true">
                <BookOpen size={18} />
                <span><strong>{item.title}</strong><small>{item.summary}</small></span>
              </div>
              <span className="related-content__locked-message">
                <LockKeyhole size={17} />
                <span><strong>Advanced reference</strong><small>Train or Integrate required</small></span>
              </span>
              <Link className="text-link" to="/membership">View plans</Link>
            </div>
          ) : (
            <Link key={item.id} to={`/member/library?content=${item.id}`}>
              <BookOpen size={18} />
              <span><strong>{item.title}</strong><small>{item.summary}</small></span>
            </Link>
          )
        ))}
      </div>
    </div>
  );
}
