import { httpsCallable } from 'firebase/functions';
import { functions } from './firebaseFunctions';

function callable(name) {
  if (!functions) throw new Error('Firebase Functions is not configured.');
  return httpsCallable(functions, name);
}

export async function startMembershipCheckout(planKey) {
  const response = await callable('createMembershipCheckout')({ planKey });
  const url = response.data?.url;
  if (!url) throw new Error('Stripe Checkout did not return a URL.');
  window.location.assign(url);
}

export async function openBillingPortal() {
  const response = await callable('createBillingPortal')({});
  const url = response.data?.url;
  if (!url) throw new Error('The billing portal did not return a URL.');
  window.location.assign(url);
}
