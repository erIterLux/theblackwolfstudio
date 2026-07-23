const admin = require('firebase-admin');
const { HttpsError } = require('firebase-functions/v2/https');

const db = admin.firestore();

function requireAuthenticated(request) {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in to continue.');
  return uid;
}

function serialize(value) {
  if (value === null || value === undefined) return value;
  if (value?.toDate) return value.toDate().toISOString();
  if (Array.isArray(value)) return value.map(serialize);
  if (typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, serialize(item)]),
    );
  }
  return value;
}

async function unreadCountFor(uid) {
  const snapshot = await db.collection('users').doc(uid).collection('notifications')
    .where('status', '==', 'unread')
    .count()
    .get();
  return Number(snapshot.data().count || 0);
}

async function handleGetAuthenticatedAppBootstrap(request, dependencies = {}) {
  const uid = requireAuthenticated(request);
  const { handleSyncMyStudioRole } = require('../progression/progressionService');

  const [roleResult, membershipSnapshot, unreadCount] = await Promise.all([
    handleSyncMyStudioRole(request, {
      instructorEmails: dependencies.instructorEmails || '',
    }),
    db.collection('memberships').doc(uid).get(),
    unreadCountFor(uid),
  ]);

  return {
    role: roleResult?.role || 'member',
    refreshToken: roleResult?.refreshToken === true,
    membership: membershipSnapshot.exists
      ? serialize({ id: membershipSnapshot.id, ...membershipSnapshot.data() })
      : null,
    unreadCount,
    loadedAt: new Date().toISOString(),
  };
}

module.exports = {
  handleGetAuthenticatedAppBootstrap,
};
