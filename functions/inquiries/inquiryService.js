const admin = require('firebase-admin');
const { HttpsError } = require('firebase-functions/v2/https');

const db = admin.firestore();
const INSTRUCTOR_ROLES = new Set(['instructor', 'admin']);
const INQUIRY_STATUSES = new Set(['new', 'contacted', 'closed']);

function clean(value, max = 1000) {
  return String(value || '').trim().slice(0, max);
}

function serialize(value) {
  if (value == null) return value;
  if (value instanceof admin.firestore.Timestamp) return value.toDate().toISOString();
  if (Array.isArray(value)) return value.map(serialize);
  if (typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, serialize(item)]));
  }
  return value;
}

function requireInstructor(request) {
  const uid = request.auth?.uid;
  const token = request.auth?.token || {};
  const role = token.admin === true ? 'admin' : clean(token.role, 40).toLowerCase();
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in to view inquiries.');
  if (!INSTRUCTOR_ROLES.has(role)) {
    throw new HttpsError('permission-denied', 'Instructor access is required.');
  }
  return uid;
}

function inquiryForClient(doc) {
  const item = doc.data() || {};
  return serialize({
    id: doc.id,
    name: clean(item.name, 200),
    email: clean(item.email, 320),
    phone: clean(item.phone, 80),
    interest: clean(item.interest, 240) || 'General inquiry',
    message: clean(item.message, 5000),
    status: INQUIRY_STATUSES.has(item.status) ? item.status : 'new',
    source: clean(item.source, 80) || 'website',
    createdAt: item.createdAt || null,
    statusUpdatedAt: item.statusUpdatedAt || null,
  });
}

async function handleListInquiries(request) {
  requireInstructor(request);
  const snapshot = await db.collection('inquiries')
    .orderBy('createdAt', 'desc')
    .limit(250)
    .get();

  return { inquiries: snapshot.docs.map(inquiryForClient) };
}

async function handleUpdateInquiryStatus(request) {
  const uid = requireInstructor(request);
  const inquiryId = clean(request.data?.inquiryId, 180);
  const status = clean(request.data?.status, 40).toLowerCase();
  if (!inquiryId) throw new HttpsError('invalid-argument', 'An inquiry ID is required.');
  if (!INQUIRY_STATUSES.has(status)) {
    throw new HttpsError('invalid-argument', 'Inquiry status must be new, contacted, or closed.');
  }

  const reference = db.collection('inquiries').doc(inquiryId);
  const snapshot = await reference.get();
  if (!snapshot.exists) throw new HttpsError('not-found', 'Inquiry not found.');

  await reference.set({
    status,
    statusUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
    statusUpdatedBy: uid,
  }, { merge: true });

  const updated = await reference.get();
  return { inquiry: inquiryForClient(updated) };
}

module.exports = {
  handleListInquiries,
  handleUpdateInquiryStatus,
};
