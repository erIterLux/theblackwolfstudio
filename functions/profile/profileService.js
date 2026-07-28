const admin = require('firebase-admin');
const { HttpsError } = require('firebase-functions/v2/https');

const db = admin.firestore();

function requireAuthenticated(request) {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in to manage your profile.');
  return uid;
}

function clean(value, maxLength) {
  return String(value || '').trim().replace(/\s+/g, ' ').slice(0, maxLength);
}

function cleanMultiline(value, maxLength) {
  return String(value || '').trim().replace(/\r\n/g, '\n').slice(0, maxLength);
}

function profileImage(data, uid, currentUser) {
  const photoURL = clean(data?.photoURL, 2000);
  const profileImagePath = clean(data?.profileImagePath, 500);

  if (!photoURL && !profileImagePath) {
    return {
      photoURL: currentUser.photoURL || null,
      profileImagePath: null,
    };
  }
  if (!profileImagePath && photoURL === currentUser.photoURL) {
    return { photoURL, profileImagePath: null };
  }
  if (!photoURL.startsWith('https://')) {
    throw new HttpsError('invalid-argument', 'The profile image URL is invalid.');
  }
  if (profileImagePath !== `profile-images/${uid}/avatar`) {
    throw new HttpsError('invalid-argument', 'The profile image path is invalid.');
  }
  return { photoURL, profileImagePath };
}

async function handleGetMyProfile(request) {
  const uid = requireAuthenticated(request);
  const [currentUser, userSnapshot] = await Promise.all([
    admin.auth().getUser(uid),
    db.collection('users').doc(uid).get(),
  ]);
  const profile = userSnapshot.data() || {};

  return {
    uid,
    email: currentUser.email || request.auth?.token?.email || '',
    displayName: profile.displayName || currentUser.displayName || '',
    phone: profile.phone || '',
    pronouns: profile.pronouns || '',
    bio: profile.bio || '',
    photoURL: profile.photoURL || currentUser.photoURL || '',
    profileImagePath: profile.profileImagePath || '',
  };
}

async function handleUpdateMyProfile(request) {
  const uid = requireAuthenticated(request);
  const currentUser = await admin.auth().getUser(uid);
  const displayName = clean(request.data?.displayName, 160);
  const phone = clean(request.data?.phone, 40);
  const pronouns = clean(request.data?.pronouns, 60);
  const bio = cleanMultiline(request.data?.bio, 600);
  const image = profileImage(request.data, uid, currentUser);

  if (displayName.length < 2) {
    throw new HttpsError('invalid-argument', 'Enter your full name.');
  }

  const authUpdate = { displayName };
  if (image.photoURL) authUpdate.photoURL = image.photoURL;
  await admin.auth().updateUser(uid, authUpdate);

  const updatedAt = admin.firestore.FieldValue.serverTimestamp();
  const batch = db.batch();
  batch.set(db.collection('users').doc(uid), {
    uid,
    email: currentUser.email || request.auth?.token?.email || '',
    displayName,
    phone: phone || null,
    pronouns: pronouns || null,
    bio: bio || null,
    photoURL: image.photoURL || null,
    profileImagePath: image.profileImagePath || null,
    updatedAt,
  }, { merge: true });

  const [membershipSnapshot, progressionSnapshot, availabilitySnapshot] = await Promise.all([
    db.collection('memberships').doc(uid).get(),
    db.collection('progressionProfiles').doc(uid).get(),
    db.collection('instructorAvailability').doc(uid).get(),
  ]);

  if (membershipSnapshot.exists) {
    batch.set(membershipSnapshot.ref, { displayName, updatedAt }, { merge: true });
  }
  if (progressionSnapshot.exists) {
    batch.set(progressionSnapshot.ref, {
      memberDisplayName: displayName,
      updatedAt,
    }, { merge: true });
  }
  if (availabilitySnapshot.exists) {
    batch.set(availabilitySnapshot.ref, { displayName, updatedAt }, { merge: true });
  }
  await batch.commit();

  return {
    success: true,
    displayName,
    phone,
    pronouns,
    bio,
    photoURL: image.photoURL || '',
    profileImagePath: image.profileImagePath || '',
  };
}

module.exports = {
  handleGetMyProfile,
  handleUpdateMyProfile,
};
