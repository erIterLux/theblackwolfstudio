import { httpsCallable } from 'firebase/functions';
import { functions } from './firebaseFunctions';

function callable(name) {
  if (!functions) throw new Error('Firebase Functions is not configured.');
  return httpsCallable(functions, name);
}

export async function listProgressionContent(filters = {}) {
  const response = await callable('listProgressionContent')(filters);
  return response.data;
}

export async function getProgressionContent(contentId) {
  const response = await callable('getProgressionContent')({ contentId });
  return response.data;
}

export async function saveProgressionContent(payload) {
  const response = await callable('saveProgressionContent')(payload);
  return response.data;
}

export async function setProgressionContentStatus(contentId, status) {
  const response = await callable('setProgressionContentStatus')({ contentId, status });
  return response.data;
}
