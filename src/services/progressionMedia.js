import {
  getDownloadURL,
  ref,
  uploadBytesResumable,
} from 'firebase/storage';
import { storage } from './firebaseStorage';

const MAX_MEDIA_BYTES = 250 * 1024 * 1024;
const ALLOWED_MEDIA_PREFIXES = ['video/', 'audio/', 'image/'];

function cleanFileName(name = 'media') {
  return String(name)
    .normalize('NFKD')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 120) || 'media';
}

function validateFile(file, allowedPrefixes = ALLOWED_MEDIA_PREFIXES) {
  if (!file) throw new Error('Choose a file first.');
  if (!allowedPrefixes.some((prefix) => String(file.type || '').startsWith(prefix))) {
    throw new Error('Choose a supported image, audio, or video file.');
  }
  if (file.size > MAX_MEDIA_BYTES) {
    throw new Error('Media files must be 250 MB or smaller.');
  }
}

function uploadMedia({
  storagePath,
  file,
  metadata = {},
  allowedPrefixes,
  onProgress,
}) {
  if (!storage) return Promise.reject(new Error('Firebase Storage is not configured.'));
  validateFile(file, allowedPrefixes);

  const storageRef = ref(storage, storagePath);
  const uploadTask = uploadBytesResumable(storageRef, file, {
    contentType: file.type,
    customMetadata: Object.fromEntries(
      Object.entries(metadata).map(([key, value]) => [key, String(value ?? '')]),
    ),
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
      () => resolve({
        storagePath,
        fileName: file.name,
        contentType: file.type,
        size: file.size,
      }),
    );
  });
}

export function makeClientId(prefix = 'item') {
  const value = globalThis.crypto?.randomUUID?.()
    || `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  return `${prefix}-${value}`;
}

export function uploadProgressionEvidence({
  memberUid,
  levelKey,
  categoryKey,
  evidenceId,
  file,
  source = 'upload',
  onProgress,
}) {
  const safeName = cleanFileName(file?.name || 'evidence-video.webm');
  const storagePath = [
    'progression-evidence',
    memberUid,
    levelKey,
    categoryKey,
    evidenceId,
    `${Date.now()}-${safeName}`,
  ].join('/');

  return uploadMedia({
    storagePath,
    file,
    allowedPrefixes: ['video/'],
    onProgress,
    metadata: {
      memberUid,
      levelKey,
      categoryKey,
      evidenceId,
      source,
    },
  });
}

export function uploadProgressionFeedbackMedia({
  memberUid,
  feedbackId,
  levelKey,
  categoryKey,
  file,
  source = 'upload',
  onProgress,
}) {
  const safeName = cleanFileName(file?.name || 'feedback-media.webm');
  const storagePath = [
    'progression-feedback',
    memberUid,
    feedbackId,
    `${Date.now()}-${safeName}`,
  ].join('/');

  return uploadMedia({
    storagePath,
    file,
    allowedPrefixes: ['audio/', 'video/'],
    onProgress,
    metadata: {
      memberUid,
      levelKey,
      categoryKey,
      feedbackId,
      source,
    },
  });
}

export function uploadProgressionContentAsset({
  contentId,
  blockId,
  file,
  source = 'upload',
  onProgress,
}) {
  const safeName = cleanFileName(file?.name || 'curriculum-media');
  const storagePath = [
    'progression-content',
    contentId,
    blockId,
    `${Date.now()}-${safeName}`,
  ].join('/');

  return uploadMedia({
    storagePath,
    file,
    allowedPrefixes: ALLOWED_MEDIA_PREFIXES,
    onProgress,
    metadata: {
      contentId,
      blockId,
      source,
    },
  });
}

export async function getProgressionMediaUrl(storagePath) {
  if (!storage || !storagePath) return '';
  return getDownloadURL(ref(storage, storagePath));
}
