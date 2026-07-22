import { useEffect, useRef, useState } from 'react';

export default function NetworkStatusBanner() {
  const [status, setStatus] = useState(() => (
    typeof navigator === 'undefined' || navigator.onLine ? 'online' : 'offline'
  ));
  const [showRestored, setShowRestored] = useState(false);
  const wasOffline = useRef(status === 'offline');

  useEffect(() => {
    let restoredTimer;

    const handleOffline = () => {
      wasOffline.current = true;
      setShowRestored(false);
      setStatus('offline');
    };

    const handleOnline = () => {
      setStatus('online');
      if (wasOffline.current) {
        wasOffline.current = false;
        setShowRestored(true);
        window.clearTimeout(restoredTimer);
        restoredTimer = window.setTimeout(() => setShowRestored(false), 4500);
      }
    };

    window.addEventListener('offline', handleOffline);
    window.addEventListener('online', handleOnline);

    return () => {
      window.clearTimeout(restoredTimer);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('online', handleOnline);
    };
  }, []);

  if (status === 'online' && !showRestored) return null;

  return (
    <div
      className={`network-status network-status--${status === 'offline' ? 'offline' : 'restored'}`}
      role={status === 'offline' ? 'alert' : 'status'}
      aria-live="polite"
    >
      {status === 'offline'
        ? 'You are offline. Saved pages remain available, but changes cannot be submitted.'
        : 'Connection restored.'}
    </div>
  );
}
