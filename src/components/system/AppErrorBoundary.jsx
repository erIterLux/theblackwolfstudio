import { Component } from 'react';

export default class AppErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('Black Wolf Studio application error', {
      error,
      componentStack: errorInfo?.componentStack,
    });
  }

  handleReload = () => {
    window.location.reload();
  };

  handleReturnHome = () => {
    window.location.assign('/');
  };

  render() {
    const { error } = this.state;
    const { children } = this.props;

    if (!error) return children;

    return (
      <main className="system-state-page" id="main-content">
        <section className="system-state-card" role="alert" aria-labelledby="application-error-title">
          <p className="eyebrow">Something went wrong</p>
          <h1 id="application-error-title">The page could not finish loading.</h1>
          <p>
            Your information has not been changed. Reload the page and try the action again.
            If the problem continues, return to the studio website and sign in again.
          </p>
          <div className="system-state-actions">
            <button className="button" type="button" onClick={this.handleReload}>
              Reload page
            </button>
            <button className="button button--ghost" type="button" onClick={this.handleReturnHome}>
              Studio website
            </button>
          </div>
          {import.meta.env.DEV && (
            <details className="system-error-details">
              <summary>Development details</summary>
              <pre>{error?.stack || error?.message || String(error)}</pre>
            </details>
          )}
        </section>
      </main>
    );
  }
}
