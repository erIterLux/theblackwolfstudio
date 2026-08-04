import { httpsCallable } from 'firebase/functions';
import { functions } from './firebaseFunctions';

function callable(name) {
  if (!functions) throw new Error('Firebase Functions is not configured.');
  return httpsCallable(functions, name);
}

export async function listInquiries() {
  const response = await callable('listInquiries')({});
  return response.data;
}

export async function updateInquiryStatus(inquiryId, status) {
  const response = await callable('updateInquiryStatus')({ inquiryId, status });
  return response.data;
}
