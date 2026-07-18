import { Clock3, Film } from 'lucide-react';
import ProgressionMediaPlayer from './ProgressionMediaPlayer';

function formatDate(value) {
  if (!value) return 'Date unavailable';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Date unavailable' : date.toLocaleString();
}

export default function EvidenceHistory({ evidence = [], currentEvidenceId = '' }) {
  if (!evidence.length) {
    return (
      <div className="progression-empty-inline">
        <Film size={20} /> No evidence submitted yet.
      </div>
    );
  }

  return (
    <div className="evidence-history">
      {evidence.map((item, index) => (
        <article className={item.id === currentEvidenceId ? 'is-current' : ''} key={item.id}>
          <header>
            <div>
              <strong>Submission {item.submissionNumber || evidence.length - index}</strong>
              {item.id === currentEvidenceId && <span>Current</span>}
            </div>
            <small><Clock3 size={14} /> {formatDate(item.createdAt)}</small>
          </header>
          <ProgressionMediaPlayer media={item.media || item.video} className="progression-video__player" />
          {item.notes && <p>{item.notes}</p>}
        </article>
      ))}
    </div>
  );
}
