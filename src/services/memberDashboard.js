import { httpsCallable } from 'firebase/functions';
import { functions } from './firebaseFunctions';

export async function getMemberDashboardSummary() {
  if (!functions) throw new Error('Firebase Functions is not configured.');
  const response = await httpsCallable(functions, 'getMemberDashboardSummary')({});
  return response.data;
}
