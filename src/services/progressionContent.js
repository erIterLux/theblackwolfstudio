import { httpsCallable } from 'firebase/functions';
import { functions } from './firebaseFunctions';
import { getWorkspaceData, invalidateWorkspaceData } from './workspaceData';

function callable(name) {
  if (!functions) throw new Error('Firebase Functions is not configured.');
  return httpsCallable(functions, name);
}

export async function listProgressionContent(filters = {}, options = {}) {
  return getWorkspaceData('progressionContent', filters, options);
}

export async function getProgressionContent(contentId) {
  return getWorkspaceData('progressionContentItem', { contentId });
}

export async function saveProgressionContent(payload) {
  const response = await callable('saveProgressionContent')(payload);
  invalidateWorkspaceData('progressionContent');
  return response.data;
}

export async function setProgressionContentStatus(contentId, status) {
  const response = await callable('setProgressionContentStatus')({ contentId, status });
  invalidateWorkspaceData('progressionContent');
  return response.data;
}
