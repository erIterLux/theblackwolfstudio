import { httpsCallable } from 'firebase/functions';
import { functions } from './firebaseFunctions';

function callable(name) {
  if (!functions) throw new Error('Firebase Functions is not configured.');
  return httpsCallable(functions, name);
}

export async function listMyPurchaseHistory() {
  const response = await callable('listMyPurchaseHistory')({});
  return response.data;
}

export async function getPurchaseReceipt(orderId, accessToken = '') {
  const response = await callable('getPurchaseReceipt')({ orderId, accessToken });
  return response.data;
}

export async function listCommerceOrdersAdmin() {
  const response = await callable('listCommerceOrdersAdmin')({});
  return response.data;
}
