function performanceEnabled() {
  if (import.meta.env.DEV) return true;
  try {
    return window.localStorage.getItem('blackWolfPerformanceDebug') === '1';
  } catch {
    return false;
  }
}

export function startPerformanceMeasure(name, details = {}) {
  if (!performanceEnabled() || typeof performance === 'undefined') {
    return () => {};
  }

  const startedAt = performance.now();
  return (resultDetails = {}) => {
    const durationMs = Math.round((performance.now() - startedAt) * 10) / 10;
    console.debug(`[performance] ${name}`, {
      durationMs,
      ...details,
      ...resultDetails,
    });
  };
}
