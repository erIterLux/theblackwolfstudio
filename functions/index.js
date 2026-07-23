const admin = require('firebase-admin');
const { onDocumentCreated, onDocumentWritten } = require('firebase-functions/v2/firestore');
const { onCall, onRequest } = require('firebase-functions/v2/https');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { defineSecret, defineString } = require('firebase-functions/params');

if (!admin.apps.length) admin.initializeApp();

const stripeSecretKey = defineSecret('STRIPE_SECRET_KEY');
const stripeWebhookSecret = defineSecret('STRIPE_WEBHOOK_SECRET');
const gmailEmail = defineSecret('GMAIL_EMAIL');
const gmailAppPassword = defineSecret('GMAIL_APP_PASSWORD');
const geminiApiKey = defineSecret('GEMINI_API_KEY');

const appOrigin = defineString('APP_ORIGIN', { default: 'https://theblackwolf.studio' });
const studioNotificationEmail = defineString('STUDIO_NOTIFICATION_EMAIL', { default: '' });
const stripePriceBegin = defineString('STRIPE_PRICE_BEGIN', { default: '' });
const stripePriceTrain = defineString('STRIPE_PRICE_TRAIN', { default: '' });
const stripePriceIntegrate = defineString('STRIPE_PRICE_INTEGRATE', { default: '' });
const geminiModel = defineString('GEMINI_MODEL', { default: 'gemini-3.5-flash' });
const instructorEmails = defineString('INSTRUCTOR_EMAILS', { default: '' });

function sharedConfig() {
    return {
        appOrigin: appOrigin.value(),
        studioNotificationEmail: studioNotificationEmail.value(),
        beginPriceId: stripePriceBegin.value(),
        trainPriceId: stripePriceTrain.value(),
        integratePriceId: stripePriceIntegrate.value(),
    };
}

exports.notifyOnInquiryCreated = onDocumentCreated({
    document: 'inquiries/{inquiryId}',
    secrets: [gmailEmail, gmailAppPassword],
    retry: true,
}, async (event) => {
    const { handleInquiryCreated } = require('./notifications/inquiryEmails');
    return handleInquiryCreated(event, {
        gmailEmail,
        gmailAppPassword,
        appOrigin: appOrigin.value(),
        studioNotificationEmail: studioNotificationEmail.value(),
    });
});

exports.createMembershipCheckout = onCall({
    invoker: 'public',
    secrets: [stripeSecretKey],
    memory: '256MiB',
    timeoutSeconds: 60,
}, async (request) => {
    const { handleCreateMembershipCheckout } = require('./billing/membershipBilling');
    return handleCreateMembershipCheckout(request, { stripeSecretKey, ...sharedConfig() });
});

exports.createBillingPortal = onCall({
    invoker: 'public',
    secrets: [stripeSecretKey],
    memory: '256MiB',
    timeoutSeconds: 60,
}, async (request) => {
    const { handleCreateBillingPortal } = require('./billing/membershipBilling');
    return handleCreateBillingPortal(request, { stripeSecretKey, ...sharedConfig() });
});

exports.stripeWebhook = onRequest({
    secrets: [stripeSecretKey, stripeWebhookSecret, gmailEmail, gmailAppPassword],
    memory: '512MiB',
    timeoutSeconds: 120,
}, async (req, res) => {
    const { handleStripeWebhook } = require('./billing/membershipBilling');
    return handleStripeWebhook(req, res, {
        stripeSecretKey,
        stripeWebhookSecret,
        gmailEmail,
        gmailAppPassword,
        ...sharedConfig(),
    });
});


// ============================================================
// Authenticated app bootstrap and member dashboard summary
// ============================================================
function loadAppSessionService() {
    return require('./session/appSessionService');
}

function loadMemberDashboardService() {
    return require('./dashboard/memberDashboardService');
}

exports.getAuthenticatedAppBootstrap = onCall({
    invoker: 'public',
    memory: '256MiB',
    timeoutSeconds: 30,
}, async (request) => loadAppSessionService().handleGetAuthenticatedAppBootstrap(request, {
    instructorEmails: instructorEmails.value(),
}));

exports.getMemberDashboardSummary = onCall({
    invoker: 'public',
    memory: '512MiB',
    timeoutSeconds: 60,
}, async (request) => loadMemberDashboardService().handleGetMemberDashboardSummary(request));

function loadWorkspaceDataService() {
    return require('./workspace/workspaceDataService');
}

exports.getWorkspaceData = onCall({
    invoker: 'public',
    secrets: [stripeSecretKey],
    memory: '512MiB',
    timeoutSeconds: 90,
}, async (request) => loadWorkspaceDataService().handleWorkspaceData(request, {
    instructorEmails: instructorEmails.value(),
    stripeSecretKey,
}));

exports.getWorkspaceReportData = onCall({
    invoker: 'public',
    memory: '1GiB',
    timeoutSeconds: 120,
}, async (request) => loadWorkspaceDataService().handleWorkspaceReportData(request));


// ============================================================
// Hybrid commerce foundation
// ============================================================
function loadCommerceFoundation() {
    return require('./commerce/commerceFoundation');
}

exports.quoteStudioCheckout = onCall({
    invoker: 'public',
    memory: '256MiB',
    timeoutSeconds: 30,
}, async (request) => loadCommerceFoundation().handleQuoteStudioCheckout(request));

exports.createStudioCheckout = onCall({
    invoker: 'public',
    secrets: [stripeSecretKey],
    memory: '512MiB',
    timeoutSeconds: 90,
}, async (request) => loadCommerceFoundation().handleCreateStudioCheckout(request, {
    stripeSecretKey,
    appOrigin: appOrigin.value(),
}));

exports.getStudioOrder = onCall({
    invoker: 'public',
    memory: '256MiB',
    timeoutSeconds: 30,
}, async (request) => loadCommerceFoundation().handleGetStudioOrder(request));

exports.listMyStudioOrders = onCall({
    invoker: 'public',
    memory: '256MiB',
    timeoutSeconds: 30,
}, async (request) => loadCommerceFoundation().handleListMyStudioOrders(request));

exports.saveStudioOffer = onCall({
    invoker: 'public',
    memory: '256MiB',
    timeoutSeconds: 30,
}, async (request) => loadCommerceFoundation().handleSaveStudioOffer(request));

exports.saveStudioDiscount = onCall({
    invoker: 'public',
    memory: '256MiB',
    timeoutSeconds: 30,
}, async (request) => loadCommerceFoundation().handleSaveStudioDiscount(request));

exports.listCommerceFoundationAdmin = onCall({
    invoker: 'public',
    memory: '512MiB',
    timeoutSeconds: 60,
}, async (request) => loadCommerceFoundation().handleListCommerceFoundationAdmin(request));


// ============================================================
// Purchase history, receipts, and commerce reporting
// ============================================================
function loadPurchaseHistoryService() {
    return require('./purchases/purchaseHistoryService');
}

exports.listMyPurchaseHistory = onCall({
    invoker: 'public',
    secrets: [stripeSecretKey],
    memory: '512MiB',
    timeoutSeconds: 90,
}, async (request) => loadPurchaseHistoryService().handleListMyPurchaseHistory(request, {
    stripeSecretKey,
}));

exports.getPurchaseReceipt = onCall({
    invoker: 'public',
    secrets: [stripeSecretKey],
    memory: '256MiB',
    timeoutSeconds: 60,
}, async (request) => loadPurchaseHistoryService().handleGetPurchaseReceipt(request, {
    stripeSecretKey,
}));

exports.listCommerceOrdersAdmin = onCall({
    invoker: 'public',
    memory: '512MiB',
    timeoutSeconds: 60,
}, async (request) => loadPurchaseHistoryService().handleListCommerceOrdersAdmin(request));


// ============================================================
// Private training packages and session credits
// ============================================================
function loadPrivateTrainingService() {
    return require('./privateTraining/privateTrainingService');
}

exports.listPrivateTrainingOffers = onCall({
    invoker: 'public',
    memory: '256MiB',
    timeoutSeconds: 30,
}, async () => loadPrivateTrainingService().handleListPrivateTrainingOffers());

exports.savePrivateTrainingOffer = onCall({
    invoker: 'public',
    memory: '256MiB',
    timeoutSeconds: 30,
}, async (request) => loadPrivateTrainingService().handleSavePrivateTrainingOffer(request));

exports.getPrivateTrainingPurchase = onCall({
    invoker: 'public',
    memory: '256MiB',
    timeoutSeconds: 30,
}, async (request) => loadPrivateTrainingService().handleGetPrivateTrainingPurchase(request));

exports.listMyPrivateTrainingPurchases = onCall({
    invoker: 'public',
    memory: '256MiB',
    timeoutSeconds: 30,
}, async (request) => loadPrivateTrainingService().handleListMyPrivateTrainingPurchases(request));

exports.listPrivateTrainingAdmin = onCall({
    invoker: 'public',
    memory: '512MiB',
    timeoutSeconds: 60,
}, async (request) => loadPrivateTrainingService().handleListPrivateTrainingAdmin(request));

exports.recordPrivateTrainingSession = onCall({
    invoker: 'public',
    memory: '256MiB',
    timeoutSeconds: 30,
}, async (request) => loadPrivateTrainingService().handleRecordPrivateTrainingSession(request));

exports.adjustPrivateTrainingCredits = onCall({
    invoker: 'public',
    memory: '256MiB',
    timeoutSeconds: 30,
}, async (request) => loadPrivateTrainingService().handleAdjustPrivateTrainingCredits(request));


// ============================================================
// Private training booking, availability, and reminders
// ============================================================
function loadPrivateTrainingBookingService() {
    return require('./privateTraining/bookingService');
}

exports.getMyInstructorAvailability = onCall({
    invoker: 'public',
    memory: '256MiB',
    timeoutSeconds: 30,
}, async (request) => loadPrivateTrainingBookingService().handleGetMyInstructorAvailability(request));

exports.saveMyInstructorAvailability = onCall({
    invoker: 'public',
    memory: '256MiB',
    timeoutSeconds: 30,
}, async (request) => loadPrivateTrainingBookingService().handleSaveMyInstructorAvailability(request));

exports.saveInstructorAvailabilityOverride = onCall({
    invoker: 'public',
    memory: '256MiB',
    timeoutSeconds: 30,
}, async (request) => loadPrivateTrainingBookingService().handleSaveInstructorAvailabilityOverride(request));

exports.deleteInstructorAvailabilityOverride = onCall({
    invoker: 'public',
    memory: '256MiB',
    timeoutSeconds: 30,
}, async (request) => loadPrivateTrainingBookingService().handleDeleteInstructorAvailabilityOverride(request));

exports.listPrivateTrainingAvailability = onCall({
    invoker: 'public',
    memory: '512MiB',
    timeoutSeconds: 60,
}, async (request) => loadPrivateTrainingBookingService().handleListPrivateTrainingAvailability(request));

exports.createPrivateTrainingBooking = onCall({
    invoker: 'public',
    memory: '512MiB',
    timeoutSeconds: 60,
}, async (request) => loadPrivateTrainingBookingService().handleCreatePrivateTrainingBooking(request));

exports.listMyPrivateTrainingBookings = onCall({
    invoker: 'public',
    memory: '256MiB',
    timeoutSeconds: 30,
}, async (request) => loadPrivateTrainingBookingService().handleListMyPrivateTrainingBookings(request));

exports.listPrivateTrainingBookingsAdmin = onCall({
    invoker: 'public',
    memory: '512MiB',
    timeoutSeconds: 60,
}, async (request) => loadPrivateTrainingBookingService().handleListPrivateTrainingBookingsAdmin(request));

exports.updatePrivateTrainingBooking = onCall({
    invoker: 'public',
    memory: '512MiB',
    timeoutSeconds: 60,
}, async (request) => loadPrivateTrainingBookingService().handleUpdatePrivateTrainingBooking(request));

exports.notifyOnPrivateTrainingBookingWritten = onDocumentWritten({
    document: 'privateTrainingBookings/{bookingId}',
    secrets: [gmailEmail, gmailAppPassword],
    retry: true,
}, async (event) => {
    const { handlePrivateTrainingBookingWritten } = require('./notifications/privateTrainingBookingEmails');
    return handlePrivateTrainingBookingWritten(event, {
        gmailEmail,
        gmailAppPassword,
        appOrigin: appOrigin.value(),
        studioNotificationEmail: studioNotificationEmail.value(),
    });
});

exports.sendPrivateTrainingReminders = onSchedule({
    schedule: 'every 60 minutes',
    timeZone: 'America/New_York',
    secrets: [gmailEmail, gmailAppPassword],
    memory: '256MiB',
    timeoutSeconds: 120,
}, async () => {
    const { handlePrivateTrainingReminders } = require('./notifications/privateTrainingBookingEmails');
    return handlePrivateTrainingReminders({
        gmailEmail,
        gmailAppPassword,
        appOrigin: appOrigin.value(),
        studioNotificationEmail: studioNotificationEmail.value(),
    });
});


// ============================================================
// Studio reporting, analytics, exports, and health checks
// ============================================================
function loadReportService() {
    return require('./reports/reportService');
}

exports.getStudioReportSummary = onCall({
    invoker: 'public',
    memory: '1GiB',
    timeoutSeconds: 120,
}, async (request) => loadReportService().handleGetStudioReportSummary(request));

exports.getRevenueReport = onCall({
    invoker: 'public',
    memory: '1GiB',
    timeoutSeconds: 120,
}, async (request) => loadReportService().handleGetRevenueReport(request));

exports.getMembershipReport = onCall({
    invoker: 'public',
    memory: '1GiB',
    timeoutSeconds: 120,
}, async (request) => loadReportService().handleGetMembershipReport(request));

exports.getEventReport = onCall({
    invoker: 'public',
    memory: '1GiB',
    timeoutSeconds: 120,
}, async (request) => loadReportService().handleGetEventReport(request));

exports.getPrivateTrainingReport = onCall({
    invoker: 'public',
    memory: '1GiB',
    timeoutSeconds: 120,
}, async (request) => loadReportService().handleGetPrivateTrainingReport(request));

exports.getAttendanceReport = onCall({
    invoker: 'public',
    memory: '1GiB',
    timeoutSeconds: 120,
}, async (request) => loadReportService().handleGetAttendanceReport(request));

exports.getMemberEngagementReport = onCall({
    invoker: 'public',
    memory: '1GiB',
    timeoutSeconds: 120,
}, async (request) => loadReportService().handleGetMemberEngagementReport(request));

exports.getSystemHealthReport = onCall({
    invoker: 'public',
    memory: '1GiB',
    timeoutSeconds: 120,
}, async (request) => loadReportService().handleGetSystemHealthReport(request));

exports.exportStudioReport = onCall({
    invoker: 'public',
    memory: '1GiB',
    timeoutSeconds: 120,
}, async (request) => loadReportService().handleExportStudioReport(request));

exports.repairStudioReportCounters = onCall({
    invoker: 'public',
    memory: '1GiB',
    timeoutSeconds: 120,
}, async (request) => loadReportService().handleRepairStudioReportCounters(request));


// ============================================================
// Unified in-app notifications and studio announcements
// ============================================================
function loadNotificationService() {
    return require('./notifications/notificationService');
}

exports.getMyNotificationUnreadCount = onCall({
    invoker: 'public',
    memory: '256MiB',
    timeoutSeconds: 30,
}, async (request) => loadNotificationService().handleGetMyNotificationUnreadCount(request));

exports.listMyNotifications = onCall({
    invoker: 'public',
    memory: '256MiB',
    timeoutSeconds: 30,
}, async (request) => loadNotificationService().handleListMyNotifications(request));

exports.markNotificationRead = onCall({
    invoker: 'public',
    memory: '256MiB',
    timeoutSeconds: 30,
}, async (request) => loadNotificationService().handleMarkNotificationRead(request));

exports.markAllNotificationsRead = onCall({
    invoker: 'public',
    memory: '256MiB',
    timeoutSeconds: 30,
}, async (request) => loadNotificationService().handleMarkAllNotificationsRead(request));

exports.getMyNotificationPreferences = onCall({
    invoker: 'public',
    memory: '256MiB',
    timeoutSeconds: 30,
}, async (request) => loadNotificationService().handleGetMyNotificationPreferences(request));

exports.saveMyNotificationPreferences = onCall({
    invoker: 'public',
    memory: '256MiB',
    timeoutSeconds: 30,
}, async (request) => loadNotificationService().handleSaveMyNotificationPreferences(request));

exports.listStudioAnnouncementsAdmin = onCall({
    invoker: 'public',
    memory: '256MiB',
    timeoutSeconds: 30,
}, async (request) => loadNotificationService().handleListStudioAnnouncementsAdmin(request));

exports.saveStudioAnnouncement = onCall({
    invoker: 'public',
    memory: '512MiB',
    timeoutSeconds: 120,
}, async (request) => loadNotificationService().handleSaveStudioAnnouncement(request));

exports.notifyInAppOnPrivateTrainingBookingWritten = onDocumentWritten({
    document: 'privateTrainingBookings/{bookingId}',
    retry: true,
}, async (event) => loadNotificationService().handlePrivateTrainingBookingWritten(event));

exports.notifyInAppOnMembershipWritten = onDocumentWritten({
    document: 'memberships/{userId}',
    retry: true,
}, async (event) => loadNotificationService().handleMembershipWritten(event));

exports.notifyInAppOnStudioOrderWritten = onDocumentWritten({
    document: 'studioOrders/{orderId}',
    retry: true,
}, async (event) => loadNotificationService().handleStudioOrderWritten(event));

exports.notifyInAppOnProgressionReviewWritten = onDocumentWritten({
    document: 'progressionReviews/{reviewId}',
    retry: true,
}, async (event) => loadNotificationService().handleProgressionReviewWritten(event));

exports.notifyInAppOnProgressionFeedbackCreated = onDocumentCreated({
    document: 'progressionProfiles/{memberUid}/levels/{levelId}/categories/{categoryId}/feedback/{feedbackId}',
    retry: true,
}, async (event) => loadNotificationService().handleProgressionFeedbackCreated(event));

exports.notifyInAppOnEventRegistrationWritten = onDocumentWritten({
    document: 'eventRegistrations/{registrationId}',
    retry: true,
}, async (event) => loadNotificationService().handleEventRegistrationWritten(event));

exports.emailOnEventRegistrationCreated = onDocumentCreated({
    document: 'eventRegistrations/{registrationId}',
    secrets: [gmailEmail, gmailAppPassword],
    retry: true,
}, async (event) => {
    const { handleEventRegistrationCreated } = require('./notifications/eventRegistrationEmails');
    return handleEventRegistrationCreated(event, waiverEmailDependencies());
});

exports.createScheduledStudioNotifications = onSchedule({
    schedule: 'every 60 minutes',
    timeZone: 'America/New_York',
    memory: '512MiB',
    timeoutSeconds: 180,
}, async () => loadNotificationService().handleCreateScheduledStudioNotifications());


// ============================================================
// Events and individual participant registration
// ============================================================
function loadEventService() {
    return require('./events/eventService');
}

exports.listPublishedEvents = onCall({
    invoker: 'public',
    memory: '256MiB',
    timeoutSeconds: 30,
}, async () => loadEventService().handleListPublishedEvents());

exports.saveEvent = onCall({
    invoker: 'public',
    memory: '256MiB',
    timeoutSeconds: 30,
}, async (request) => loadEventService().handleSaveEvent(request));

exports.getEventRegistration = onCall({
    invoker: 'public',
    memory: '256MiB',
    timeoutSeconds: 30,
}, async (request) => loadEventService().handleGetEventRegistration(request));

exports.listMyEventRegistrations = onCall({
    invoker: 'public',
    memory: '256MiB',
    timeoutSeconds: 30,
}, async (request) => loadEventService().handleListMyEventRegistrations(request));

exports.listEventsAdmin = onCall({
    invoker: 'public',
    memory: '512MiB',
    timeoutSeconds: 60,
}, async (request) => loadEventService().handleListEventsAdmin(request));

exports.getEventCheckIn = onCall({
    invoker: 'public',
    memory: '512MiB',
    timeoutSeconds: 60,
}, async (request) => loadEventService().handleGetEventCheckIn(request));

exports.setEventParticipantCheckIn = onCall({
    invoker: 'public',
    memory: '256MiB',
    timeoutSeconds: 30,
}, async (request) => loadEventService().handleSetEventParticipantCheckIn(request));

function loadWaiverService() {
    return require('./events/waiverService');
}

function loadStudioWaiverService() {
    return require('./waivers/studioWaiverService');
}

exports.getEventWaiver = onCall({
    invoker: 'public',
    memory: '256MiB',
    timeoutSeconds: 30,
}, async (request) => loadWaiverService().handleGetEventWaiver(request));

exports.signEventWaiver = onCall({
    invoker: 'public',
    memory: '512MiB',
    timeoutSeconds: 60,
}, async (request) => loadWaiverService().handleSignEventWaiver(request));

exports.getMyMembershipWaiver = onCall({
    invoker: 'public',
    memory: '256MiB',
    timeoutSeconds: 30,
}, async (request) => loadStudioWaiverService().handleGetMyMembershipWaiver(request));

exports.signMembershipWaiver = onCall({
    invoker: 'public',
    memory: '512MiB',
    timeoutSeconds: 60,
}, async (request) => loadStudioWaiverService().handleSignMembershipWaiver(request));

exports.getPrivateTrainingWaiver = onCall({
    invoker: 'public',
    memory: '256MiB',
    timeoutSeconds: 30,
}, async (request) => loadStudioWaiverService().handleGetPrivateTrainingWaiver(request));

exports.signPrivateTrainingWaiver = onCall({
    invoker: 'public',
    memory: '512MiB',
    timeoutSeconds: 60,
}, async (request) => loadStudioWaiverService().handleSignPrivateTrainingWaiver(request));

function waiverEmailDependencies() {
    return {
        gmailEmail,
        gmailAppPassword,
        appOrigin: appOrigin.value(),
        studioNotificationEmail: studioNotificationEmail.value(),
    };
}

exports.emailOnEventWaiverWritten = onDocumentWritten({
    document: 'eventWaivers/{waiverId}',
    secrets: [gmailEmail, gmailAppPassword],
    retry: true,
}, async (event) => {
    const { handleEventWaiverWritten } = require('./notifications/waiverEmails');
    return handleEventWaiverWritten(event, waiverEmailDependencies());
});

exports.emailOnPrivateTrainingWaiverWritten = onDocumentWritten({
    document: 'privateTrainingWaivers/{waiverId}',
    secrets: [gmailEmail, gmailAppPassword],
    retry: true,
}, async (event) => {
    const { handlePrivateTrainingWaiverWritten } = require('./notifications/waiverEmails');
    return handlePrivateTrainingWaiverWritten(event, waiverEmailDependencies());
});

exports.emailOnStudioWaiverWritten = onDocumentWritten({
    document: 'studioWaivers/{userId}',
    secrets: [gmailEmail, gmailAppPassword],
    retry: true,
}, async (event) => {
    const { handleStudioWaiverWritten } = require('./notifications/waiverEmails');
    return handleStudioWaiverWritten(event, waiverEmailDependencies());
});

exports.wolfGuideChat = onCall({
    invoker: 'public',
    secrets: [geminiApiKey],
    memory: '512MiB',
    timeoutSeconds: 120,
}, async (request) => {
    const { handleWolfGuideChat } = require('./ai/wolfGuide');
    return handleWolfGuideChat(request, {
        geminiApiKey,
        geminiModel: geminiModel.value(),
    });
});


// ============================================================
// Studio roles and progression
// ============================================================
function loadProgressionService() {
    return require('./progression/progressionService');
}

exports.syncMyStudioRole = onCall({
    invoker: 'public',
    memory: '256MiB',
    timeoutSeconds: 30,
}, async (request) => {
    return loadProgressionService().handleSyncMyStudioRole(request, {
        instructorEmails: instructorEmails.value(),
    });
});

exports.getMyProgression = onCall({
    invoker: 'public',
    memory: '512MiB',
    timeoutSeconds: 60,
}, async (request) => {
    return loadProgressionService().handleGetMyProgression(request);
});

exports.saveProgressionCategory = onCall({
    invoker: 'public',
    memory: '512MiB',
    timeoutSeconds: 60,
}, async (request) => {
    return loadProgressionService().handleSaveProgressionCategory(request);
});

exports.submitProgressionLevel = onCall({
    invoker: 'public',
    memory: '512MiB',
    timeoutSeconds: 60,
}, async (request) => {
    return loadProgressionService().handleSubmitProgressionLevel(request);
});

exports.listProgressionReviews = onCall({
    invoker: 'public',
    memory: '512MiB',
    timeoutSeconds: 60,
}, async (request) => {
    return loadProgressionService().handleListProgressionReviews(request);
});

exports.getProgressionReview = onCall({
    invoker: 'public',
    memory: '512MiB',
    timeoutSeconds: 60,
}, async (request) => {
    return loadProgressionService().handleGetProgressionReview(request);
});

exports.saveProgressionFeedback = onCall({
    invoker: 'public',
    memory: '512MiB',
    timeoutSeconds: 60,
}, async (request) => {
    return loadProgressionService().handleSaveProgressionFeedback(request);
});

exports.reviewProgressionCategory = onCall({
    invoker: 'public',
    memory: '512MiB',
    timeoutSeconds: 60,
}, async (request) => {
    return loadProgressionService().handleReviewProgressionCategory(request);
});

exports.approveProgressionLevel = onCall({
    invoker: 'public',
    memory: '512MiB',
    timeoutSeconds: 60,
}, async (request) => {
    return loadProgressionService().handleApproveProgressionLevel(request);
});

exports.notifyOnProgressionReviewWritten = onDocumentWritten({
    document: 'progressionReviews/{reviewId}',
    secrets: [gmailEmail, gmailAppPassword],
    retry: true,
}, async (event) => {
    const { handleProgressionReviewWritten } = require('./notifications/progressionEmails');
    return handleProgressionReviewWritten(event, {
        gmailEmail,
        gmailAppPassword,
        appOrigin: appOrigin.value(),
        studioNotificationEmail: studioNotificationEmail.value(),
    });
});


// ============================================================
// Instructor curriculum and member reference library
// ============================================================
function loadCurriculumService() {
    return require('./content/curriculumService');
}

exports.listProgressionContent = onCall({
    invoker: 'public',
    memory: '512MiB',
    timeoutSeconds: 60,
}, async (request) => {
    return loadCurriculumService().handleListProgressionContent(request);
});

exports.getProgressionContent = onCall({
    invoker: 'public',
    memory: '512MiB',
    timeoutSeconds: 60,
}, async (request) => {
    return loadCurriculumService().handleGetProgressionContent(request);
});

exports.saveProgressionContent = onCall({
    invoker: 'public',
    memory: '512MiB',
    timeoutSeconds: 60,
}, async (request) => {
    return loadCurriculumService().handleSaveProgressionContent(request);
});

exports.setProgressionContentStatus = onCall({
    invoker: 'public',
    memory: '512MiB',
    timeoutSeconds: 60,
}, async (request) => {
    return loadCurriculumService().handleSetProgressionContentStatus(request);
});
