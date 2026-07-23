import { httpsCallable } from 'firebase/functions';
import { functions } from './firebaseFunctions';
import { getWorkspaceData } from './workspaceData';

function callable(name) {
  if (!functions) throw new Error('Firebase Functions is not configured.');
  return httpsCallable(functions, name);
}

export async function listMyPurchaseHistory(options = {}) {
  return getWorkspaceData('purchaseHistory', {}, options);
}

export async function getPurchaseReceipt(orderId, accessToken = '') {
  const response = await callable('getPurchaseReceipt')({ orderId, accessToken });
  return response.data;
}

export async function listCommerceOrdersAdmin(options = {}) {
  return getWorkspaceData('commerceOrders', {}, options);
}
