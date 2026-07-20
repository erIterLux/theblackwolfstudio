import { ArrowRight, Clock3, Users } from 'lucide-react';
import { Link } from 'react-router-dom';
import usePrivateTrainingPurchases from '../../hooks/usePrivateTrainingPurchases';

function nearestExpiration(purchases) {
  return purchases
    .map((item) => item.expiresAt ? new Date(item.expiresAt) : null)
    .filter((value) => value && !Number.isNaN(value.valueOf()))
    .sort((left, right) => left - right)[0] || null;
}

export default function PrivateTrainingSummaryCard() {
  const {
    activePurchases,
    remainingSessions,
    loading,
    error,
  } = usePrivateTrainingPurchases();

  if (loading) {
    return (
      <article className="dashboard-card private-training-summary-card">
        <p>Loading private training…</p>
      </article>
    );
  }

  if (error) {
    return (
      <article className="dashboard-card private-training-summary-card">
        <p className="form-error">{error}</p>
      </article>
    );
  }

  const expiration = nearestExpiration(activePurchases);

  return (
    <article className="dashboard-card private-training-summary-card">
      <div className="dashboard-card__heading">
        <Users aria-hidden="true" />
        <div>
          <p className="eyebrow">Private training</p>
          <h2>{remainingSessions > 0 ? 'Session credits ready' : 'Train one to one—or together'}</h2>
        </div>
      </div>

      {remainingSessions > 0 ? (
        <>
          <div className="private-training-summary-card__balance">
            <strong>{remainingSessions}</strong>
            <span>session{remainingSessions === 1 ? '' : 's'} remaining across {activePurchases.length} active package{activePurchases.length === 1 ? '' : 's'}</span>
          </div>
          {expiration && (
            <p className="dashboard-hint">
              <Clock3 size={16} /> Nearest expiration: {expiration.toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
                year: 'numeric',
              })}
            </p>
          )}
          <Link className="text-link" to="/member/private-training">
            View packages <ArrowRight size={17} />
          </Link>
        </>
      ) : (
        <>
          <p>
            Purchase a private package for yourself or a registered group of up
            to three people. Members receive eligible pricing automatically.
          </p>
          <Link className="text-link" to="/private-training">
            Explore private training <ArrowRight size={17} />
          </Link>
        </>
      )}
    </article>
  );
}
