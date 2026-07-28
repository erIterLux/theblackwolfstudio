import {
  getDownloadURL,
  ref,
  uploadBytesResumable,
} from 'firebase/storage';
import { httpsCallable } from 'firebase/functions';
import { functions } from './firebaseFunctions';
import { storage } from './firebaseStorage';

const MAX_PROFILE_IMAGE_BYTES = 5 * 1024 * 1024;
const ALLOWED_PROFILE_IMAGE_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
]);

function callable(name) {
  if (!functions) throw new Error('Firebase Functions is not configured.');
  return httpsCallable(functions, name);
}

export async function getMyProfile() {
  const response = await callable('getMyProfile')({});
  return response.data;
}

export async function updateMyProfile(profile) {
  const response = await callable('updateMyProfile')(profile);
  return response.data;
}

export function validateProfileImage(file) {
  if (!file) throw new Error('Choose an image first.');
  if (!ALLOWED_PROFILE_IMAGE_TYPES.has(file.type)) {
    throw new Error('Choose a JPG, PNG, or WebP image.');
  }
  if (file.size > MAX_PROFILE_IMAGE_BYTES) {
    throw new Error('Profile images must be 5 MB or smaller.');
  }
}

export function uploadProfileImage({ uid, file, onProgress }) {
  if (!storage) return Promise.reject(new Error('Firebase Storage is not configured.'));
  validateProfileImage(file);

  const storagePath = `profile-images/${uid}/avatar`;
  const uploadTask = uploadBytesResumable(ref(storage, storagePath), file, {
    contentType: file.type,
    customMetadata: { ownerUid: uid, purpose: 'profile-image' },
  });

  return new Promise((resolve, reject) => {
    uploadTask.on(
      'state_changed',
      (snapshot) => {
        const progress = snapshot.totalBytes
          ? Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100)
          : 0;
        onProgress?.(progress);
      },
      reject,
      async () => {
        try {
          const photoURL = await getDownloadURL(uploadTask.snapshot.ref);
          resolve({ photoURL, profileImagePath: storagePath });
        } catch (error) {
          reject(error);
        }
      },
    );
  });
}
