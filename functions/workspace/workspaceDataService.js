const { HttpsError } = require('firebase-functions/v2/https');

function delegatedRequest(request) {
  return {
    app: request.app,
    auth: request.auth,
    data: request.data?.payload || {},
    instanceIdToken: request.instanceIdToken,
    rawRequest: request.rawRequest,
  };
}

async function handleWorkspaceData(request, dependencies = {}) {
  const action = String(request.data?.action || '').trim();
  const delegated = delegatedRequest(request);

  switch (action) {
    case 'bootstrap':
      return require('../session/appSessionService')
        .handleGetAuthenticatedAppBootstrap(delegated, {
          instructorEmails: dependencies.instructorEmails || '',
        });
    case 'memberDashboard':
      return require('../dashboard/memberDashboardService')
        .handleGetMemberDashboardSummary(delegated);
    case 'memberProgression':
      return require('../progression/progressionService')
        .handleGetMyProgression(delegated);
    case 'progressionReviews':
      return require('../progression/progressionService')
        .handleListProgressionReviews(delegated);
    case 'progressionReview':
      return require('../progression/progressionService')
        .handleGetProgressionReview(delegated);
    case 'progressionContent':
      return require('../content/curriculumService')
        .handleListProgressionContent(delegated);
    case 'progressionContentItem':
      return require('../content/curriculumService')
        .handleGetProgressionContent(delegated);
    case 'memberEventRegistrations':
      return require('../events/eventService')
        .handleListMyEventRegistrations(delegated);
    case 'instructorEvents':
      return require('../events/eventService')
        .handleListEventsAdmin(delegated);
    case 'eventCheckIn':
      return require('../events/eventService')
        .handleGetEventCheckIn(delegated);
    case 'memberPrivateTrainingPurchases':
      return require('../privateTraining/privateTrainingService')
        .handleListMyPrivateTrainingPurchases(delegated);
    case 'privateTrainingPurchase':
      return require('../privateTraining/privateTrainingService')
        .handleGetPrivateTrainingPurchase(delegated);
    case 'instructorPrivateTraining':
      return require('../privateTraining/privateTrainingService')
        .handleListPrivateTrainingAdmin(delegated);
    case 'instructorAvailability':
      return require('../privateTraining/bookingService')
        .handleGetMyInstructorAvailability(delegated);
    case 'privateTrainingAvailability':
      return require('../privateTraining/bookingService')
        .handleListPrivateTrainingAvailability(delegated);
    case 'memberPrivateTrainingBookings':
      return require('../privateTraining/bookingService')
        .handleListMyPrivateTrainingBookings(delegated);
    case 'instructorPrivateTrainingBookings':
      return require('../privateTraining/bookingService')
        .handleListPrivateTrainingBookingsAdmin(delegated);
    case 'memberNotifications':
      return require('../notifications/notificationService')
        .handleListMyNotifications(delegated);
    case 'notificationUnreadCount':
      return require('../notifications/notificationService')
        .handleGetMyNotificationUnreadCount(delegated);
    case 'notificationPreferences':
      return require('../notifications/notificationService')
        .handleGetMyNotificationPreferences(delegated);
    case 'instructorAnnouncements':
      return require('../notifications/notificationService')
        .handleListStudioAnnouncementsAdmin(delegated);
    case 'memberStudioOrders':
      return require('../commerce/commerceFoundation')
        .handleListMyStudioOrders(delegated);
    case 'commerceFoundation':
      return require('../commerce/commerceFoundation')
        .handleListCommerceFoundationAdmin(delegated);
    case 'purchaseHistory':
      return require('../purchases/purchaseHistoryService')
        .handleListMyPurchaseHistory(delegated, {
          stripeSecretKey: dependencies.stripeSecretKey,
        });
    case 'commerceOrders':
      return require('../purchases/purchaseHistoryService')
        .handleListCommerceOrdersAdmin(delegated);
    default:
      throw new HttpsError('invalid-argument', 'Unknown workspace data action.');
  }
}

async function handleWorkspaceReportData(request) {
  const action = String(request.data?.action || '').trim();
  const delegated = delegatedRequest(request);
  const reports = require('../reports/reportService');

  const handlers = {
    overview: reports.handleGetStudioReportSummary,
    revenue: reports.handleGetRevenueReport,
    memberships: reports.handleGetMembershipReport,
    events: reports.handleGetEventReport,
    privateTraining: reports.handleGetPrivateTrainingReport,
    attendance: reports.handleGetAttendanceReport,
    engagement: reports.handleGetMemberEngagementReport,
    systemHealth: reports.handleGetSystemHealthReport,
  };
  const handler = handlers[action];
  if (!handler) {
    throw new HttpsError('invalid-argument', 'Unknown workspace report action.');
  }
  return handler(delegated);
}

module.exports = {
  handleWorkspaceData,
  handleWorkspaceReportData,
};
