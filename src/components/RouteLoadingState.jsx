export default function RouteLoadingState({ workspace = false }) {
  return (
    <div
      className={`route-loading${workspace ? ' route-loading--workspace' : ''}`}
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <div className="route-loading__inner">
        <span className="route-loading__spinner" aria-hidden="true" />
        <span>Loading the next view...</span>
      </div>
      <div className="route-loading__skeleton" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>
    </div>
  );
}
