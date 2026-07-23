import { httpsCallable } from 'firebase/functions';
import { auth } from './firebaseAuth';
import { functions } from './firebaseFunctions';

const requests = new Map();
const responses = new Map();
const CACHE_TTL_MS = 60_000;
const CACHEABLE_ACTIONS = new Set([
  'memberProgression',
  'progressionReviews',
  'progressionContent',
  'memberEventRegistrations',
  'instructorEvents',
  'memberPrivateTrainingPurchases',
  'instructorPrivateTraining',
  'instructorAvailability',
  'memberPrivateTrainingBookings',
  'instructorPrivateTrainingBookings',
  'memberNotifications',
  'notificationPreferences',
  'instructorAnnouncements',
  'commerceFoundation',
  'purchaseHistory',
  'commerceOrders',
]);
const LEGACY_WORKSPACE_FUNCTIONS = {
  bootstrap: 'getAuthenticatedAppBootstrap',
  memberDashboard: 'getMemberDashboardSummary',
  memberProgression: 'getMyProgression',
  progressionReviews: 'listProgressionReviews',
  progressionReview: 'getProgressionReview',
  progressionContent: 'listProgressionContent',
  progressionContentItem: 'getProgressionContent',
  memberEventRegistrations: 'listMyEventRegistrations',
  instructorEvents: 'listEventsAdmin',
  eventCheckIn: 'getEventCheckIn',
  memberPrivateTrainingPurchases: 'listMyPrivateTrainingPurchases',
  privateTrainingPurchase: 'getPrivateTrainingPurchase',
  instructorPrivateTraining: 'listPrivateTrainingAdmin',
  instructorAvailability: 'getMyInstructorAvailability',
  privateTrainingAvailability: 'listPrivateTrainingAvailability',
  memberPrivateTrainingBookings: 'listMyPrivateTrainingBookings',
  instructorPrivateTrainingBookings: 'listPrivateTrainingBookingsAdmin',
  memberNotifications: 'listMyNotifications',
  notificationUnreadCount: 'getMyNotificationUnreadCount',
  notificationPreferences: 'getMyNotificationPreferences',
  instructorAnnouncements: 'listStudioAnnouncementsAdmin',
  memberStudioOrders: 'listMyStudioOrders',
  commerceFoundation: 'listCommerceFoundationAdmin',
  purchaseHistory: 'listMyPurchaseHistory',
  commerceOrders: 'listCommerceOrdersAdmin',
};
const LEGACY_REPORT_FUNCTIONS = {
  overview: 'getStudioReportSummary',
  revenue: 'getRevenueReport',
  memberships: 'getMembershipReport',
  events: 'getEventReport',
  privateTraining: 'getPrivateTrainingReport',
  attendance: 'getAttendanceReport',
  engagement: 'getMemberEngagementReport',
  systemHealth: 'getSystemHealthReport',
};

function callable(name) {
  if (!functions) throw new Error('Firebase Functions is not configured.');
  return httpsCallable(functions, name);
}

function requestKey(functionName, action, payload) {
  const uid = auth?.currentUser?.uid || 'signed-out';
  return `${uid}:${functionName}:${action}:${JSON.stringify(payload || {})}`;
}

function gatewayUnavailable(error) {
  return ['functions/not-found', 'functions/unimplemented'].includes(error?.code);
}

async function request(
  functionName,
  action,
  payload = {},
  legacyFunctionName = '',
  { force = false } = {},
) {
  const key = requestKey(functionName, action, payload);
  const cached = responses.get(key);
  if (!force && cached && Date.now() - cached.cachedAt < CACHE_TTL_MS) {
    return cached.data;
  }
  if (requests.has(key)) return requests.get(key);

  const pending = callable(functionName)({ action, payload })
    .then((response) => response.data)
    .catch(async (error) => {
      if (!legacyFunctionName || !gatewayUnavailable(error)) throw error;
      const response = await callable(legacyFunctionName)(payload);
      return response.data;
    })
    .then((data) => {
      if (CACHEABLE_ACTIONS.has(action)) {
        responses.set(key, { action, cachedAt: Date.now(), data });
      }
      return data;
    })
    .finally(() => requests.delete(key));
  requests.set(key, pending);
  return pending;
}

export function getWorkspaceData(action, payload = {}, options = {}) {
  return request(
    'getWorkspaceData',
    action,
    payload,
    LEGACY_WORKSPACE_FUNCTIONS[action],
    options,
  );
}

export function getWorkspaceReportData(action, payload = {}, options = {}) {
  return request(
    'getWorkspaceReportData',
    action,
    payload,
    LEGACY_REPORT_FUNCTIONS[action],
    options,
  );
}

export function invalidateWorkspaceData(...actions) {
  const targets = new Set(actions.flat());
  for (const [key, cached] of responses) {
    if (targets.has(cached.action)) responses.delete(key);
  }
}
