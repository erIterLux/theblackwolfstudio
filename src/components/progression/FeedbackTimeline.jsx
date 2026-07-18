import { MessageSquareText, Mic, Video } from 'lucide-react';
import ProgressionMediaPlayer from './ProgressionMediaPlayer';

function formatDate(value) {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleString();
}

function FeedbackIcon({ type }) {
  if (type === 'audio') return <Mic size={18} />;
  if (type === 'video') return <Video size={18} />;
  return <MessageSquareText size={18} />;
}

export default function FeedbackTimeline({ feedback = [] }) {
  if (!feedback.length) {
    return <p className="progression-empty-inline">No instructor feedback has been added yet.</p>;
  }

  return (
    <div className="feedback-timeline">
      {feedback.map((item) => (
        <article key={item.id}>
          <header>
            <FeedbackIcon type={item.feedbackType} />
            <div>
              <strong>Instructor feedback</strong>
              <small>{formatDate(item.createdAt)}</small>
            </div>
            {item.decision && <span>{String(item.decision).replaceAll('_', ' ')}</span>}
          </header>

          {item.text && <p className="feedback-timeline__text">{item.text}</p>}
          {!!item.strengths?.length && (
            <div><strong>What is working</strong><ul>{item.strengths.map((value) => <li key={value}>{value}</li>)}</ul></div>
          )}
          {!!item.focusAreas?.length && (
            <div><strong>Next focus</strong><ul>{item.focusAreas.map((value) => <li key={value}>{value}</li>)}</ul></div>
          )}
          {item.media?.storagePath && (
            <ProgressionMediaPlayer media={item.media} className="feedback-timeline__media" />
          )}
        </article>
      ))}
    </div>
  );
}
