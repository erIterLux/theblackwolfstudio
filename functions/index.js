const admin = require('firebase-admin');
const { onDocumentCreated } = require('firebase-functions/v2/firestore');
const { onCall, onRequest } = require('firebase-functions/v2/https');
const { defineSecret, defineString } = require('firebase-functions/params');

if (!admin.apps.length) admin.initializeApp();

const stripeSecretKey = defineSecret('STRIPE_SECRET_KEY');
const stripeWebhookSecret = defineSecret('STRIPE_WEBHOOK_SECRET');
const gmailEmail = defineSecret('GMAIL_EMAIL');
const gmailAppPassword = defineSecret('GMAIL_APP_PASSWORD');
const geminiApiKey = defineSecret('GEMINI_API_KEY');

const appOrigin = defineString('APP_ORIGIN', { default: 'http://localhost:5173' });
const studioNotificationEmail = defineString('STUDIO_NOTIFICATION_EMAIL', { default: '' });
const stripePriceBegin = defineString('STRIPE_PRICE_BEGIN', { default: '' });
const stripePriceTrain = defineString('STRIPE_PRICE_TRAIN', { default: '' });
const stripePriceIntegrate = defineString('STRIPE_PRICE_INTEGRATE', { default: '' });
const geminiModel = defineString('GEMINI_MODEL', { default: 'gemini-3.5-flash' });

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

exports.wolfGuideChat = onCall({
  invoker: 'public',
  secrets: [geminiApiKey],
  memory: '512MiB',
  timeoutSeconds: 60,
}, async (request) => {
  const { handleWolfGuideChat } = require('./ai/wolfGuide');
  return handleWolfGuideChat(request, {
    geminiApiKey,
    geminiModel: geminiModel.value(),
  });
});
