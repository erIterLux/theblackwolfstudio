import { getWorkspaceData } from './workspaceData';

const CACHE_TTL_MS = 30_000;
const dashboardRequests = new Map();
const dashboardCache = new Map();

export function invalidateMemberDashboardSummaryCache(uid = '') {
  if (uid) {
    dashboardCache.delete(uid);
    return;
  }
  dashboardCache.clear();
}

export function getMemberDashboardSummary(uid, { force = false } = {}) {
  const cached = dashboardCache.get(uid);
  if (!force && cached && Date.now() - cached.cachedAt < CACHE_TTL_MS) {
    return Promise.resolve(cached.data);
  }
  if (!force && dashboardRequests.has(uid)) return dashboardRequests.get(uid);

  const request = getWorkspaceData('memberDashboard')
    .then((data) => {
      dashboardCache.set(uid, { data, cachedAt: Date.now() });
      return data;
    })
    .finally(() => dashboardRequests.delete(uid));
  dashboardRequests.set(uid, request);
  return request;
}
