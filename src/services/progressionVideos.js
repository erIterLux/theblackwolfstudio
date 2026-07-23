import {
  deleteObject,
  getDownloadURL,
  ref,
  uploadBytesResumable,
} from 'firebase/storage';
import { storage } from './firebaseStorage';

const MAX_VIDEO_BYTES = 250 * 1024 * 1024;

function cleanFileName(name = 'progression-video') {
  return String(name)
    .normalize('NFKD')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 120) || 'progression-video';
}

export function validateProgressionVideo(file) {
  if (!file) throw new Error('Choose a video first.');
  if (!String(file.type || '').startsWith('video/')) {
    throw new Error('Choose a supported video file.');
  }
  if (file.size > MAX_VIDEO_BYTES) {
    throw new Error('Video files must be 250 MB or smaller.');
  }
}

export function uploadProgressionVideo({
  memberUid,
  levelKey,
  categoryKey,
  file,
  onProgress,
}) {
  if (!storage) return Promise.reject(new Error('Firebase Storage is not configured.'));
  validateProgressionVideo(file);

  const fileName = cleanFileName(file.name);
  const storagePath = [
    'progression-videos',
    memberUid,
    levelKey,
    categoryKey,
    `${Date.now()}-${fileName}`,
  ].join('/');
  const storageRef = ref(storage, storagePath);
  const uploadTask = uploadBytesResumable(storageRef, file, {
    contentType: file.type,
    customMetadata: {
      memberUid,
      levelKey,
      categoryKey,
    },
  });

  return new Promise((resolve, reject) => {
    uploadTask.on(
      'state_changed',
      (snapshot) => {
        const percent = snapshot.totalBytes
          ? Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100)
          : 0;
        onProgress?.(percent);
      },
      reject,
      () => {
        resolve({
          storagePath,
          fileName: file.name,
          contentType: file.type,
          size: file.size,
        });
      },
    );
  });
}

export async function getProgressionVideoUrl(storagePath) {
  if (!storage || !storagePath) return '';
  return getDownloadURL(ref(storage, storagePath));
}

export async function deleteProgressionVideo(storagePath) {
  if (!storage || !storagePath) return;
  try {
    await deleteObject(ref(storage, storagePath));
  } catch (error) {
    if (error?.code !== 'storage/object-not-found') throw error;
  }
}
