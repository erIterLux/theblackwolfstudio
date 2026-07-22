import { useEffect } from 'react';

const DEBUG_KEY = 'black-wolf:performance-debug';

function shouldMeasure() {
  if (import.meta.env.DEV) return true;
  try {
    return window.localStorage.getItem(DEBUG_KEY) === '1';
  } catch {
    return false;
  }
}

export default function PerformanceMonitor() {
  useEffect(() => {
    if (!shouldMeasure() || typeof PerformanceObserver === 'undefined') return undefined;

    const metrics = {
      cls: 0,
      inp: 0,
      lcp: 0,
      longTasks: 0,
      longestTask: 0,
    };
    const observers = [];

    const observe = (type, handler, options = {}) => {
      try {
        const observer = new PerformanceObserver((list) => handler(list.getEntries()));
        observer.observe({ type, buffered: true, ...options });
        observers.push(observer);
      } catch {
        // Unsupported performance-entry types are ignored.
      }
    };

    observe('largest-contentful-paint', (entries) => {
      const entry = entries.at(-1);
      if (entry) metrics.lcp = Math.round(entry.startTime);
    });

    observe('layout-shift', (entries) => {
      entries.forEach((entry) => {
        if (!entry.hadRecentInput) metrics.cls += entry.value;
      });
    });

    observe('event', (entries) => {
      entries.forEach((entry) => {
        if (entry.duration > metrics.inp) metrics.inp = Math.round(entry.duration);
      });
    }, { durationThreshold: 40 });

    observe('longtask', (entries) => {
      entries.forEach((entry) => {
        metrics.longTasks += 1;
        metrics.longestTask = Math.max(metrics.longestTask, Math.round(entry.duration));
      });
    });

    const report = () => {
      const snapshot = {
        ...metrics,
        cls: Number(metrics.cls.toFixed(3)),
        route: window.location.pathname,
      };
      const needsAttention = snapshot.lcp > 2500
        || snapshot.cls > 0.1
        || snapshot.inp > 200
        || snapshot.longestTask > 200;

      console[needsAttention ? 'warn' : 'info']('[Black Wolf performance]', snapshot);
    };

    const reportTimer = window.setTimeout(report, 8000);
    const handleVisibility = () => {
      if (document.visibilityState === 'hidden') report();
    };
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      window.clearTimeout(reportTimer);
      document.removeEventListener('visibilitychange', handleVisibility);
      observers.forEach((observer) => observer.disconnect());
    };
  }, []);

  return null;
}
