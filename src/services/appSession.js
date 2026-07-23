import { httpsCallable } from 'firebase/functions';
import { functions } from './firebaseFunctions';

function callable(name) {
  if (!functions) throw new Error('Firebase Functions is not configured.');
  return httpsCallable(functions, name);
}

export async function getAuthenticatedAppBootstrap() {
  const response = await callable('getAuthenticatedAppBootstrap')({});
  return response.data;
}
