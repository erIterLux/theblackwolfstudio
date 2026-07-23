import { httpsCallable } from 'firebase/functions';
import { functions } from './firebaseFunctions';
import { invalidateWorkspaceData } from './workspaceData';

function callable(name) {
  if (!functions) throw new Error('Firebase Functions is not configured.');
  return httpsCallable(functions, name);
}

export async function getMyMembershipWaiver() {
  const response = await callable('getMyMembershipWaiver')({});
  return response.data;
}

export async function signMembershipWaiver(payload) {
  const response = await callable('signMembershipWaiver')(payload);
  invalidateWorkspaceData(
    'memberDashboard',
    'memberEventRegistrations',
    'memberPrivateTrainingPurchases',
  );
  return response.data;
}

export async function getPrivateTrainingWaiver(waiverId, accessToken = '') {
  const response = await callable('getPrivateTrainingWaiver')({
    waiverId,
    accessToken,
  });
  return response.data;
}

export async function signPrivateTrainingWaiver(payload) {
  const response = await callable('signPrivateTrainingWaiver')(payload);
  invalidateWorkspaceData(
    'memberPrivateTrainingPurchases',
    'instructorPrivateTraining',
  );
  return response.data;
}
