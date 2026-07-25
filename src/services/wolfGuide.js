import { httpsCallable } from 'firebase/functions';
import { functions } from './firebaseFunctions';

function callable(name) {
  if (!functions) throw new Error('Firebase Functions is not configured.');
  return httpsCallable(functions, name);
}

export async function sendWolfGuideMessage({ message, conversationId, memberState }) {
  const response = await callable('wolfGuideChat')({ message, conversationId, memberState });
  return response.data;
}

export async function getWolfGuideUsageStatus() {
  const response = await callable('getWolfGuideUsageStatus')({});
  return response.data;
}

export async function getWolfGuideRoutingSettings() {
  const response = await callable('getWolfGuideRoutingSettings')({});
  return response.data;
}

export async function saveWolfGuideRoutingSettings(payload) {
  const response = await callable('saveWolfGuideRoutingSettings')(payload);
  return response.data;
}
