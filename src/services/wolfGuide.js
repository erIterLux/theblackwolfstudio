import { httpsCallable } from 'firebase/functions';
import { functions } from './firebaseFunctions';

export async function sendWolfGuideMessage({ message, conversationId, memberState }) {
  if (!functions) throw new Error('Firebase Functions is not configured.');
  const wolfGuideChat = httpsCallable(functions, 'wolfGuideChat');
  const response = await wolfGuideChat({ message, conversationId, memberState });
  return response.data;
}
