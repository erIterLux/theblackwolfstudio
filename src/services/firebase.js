import { getApps, initializeApp } from 'firebase/app';
import { firebaseConfig, isFirebaseConfigured } from './firebaseConfig';

export { isFirebaseConfigured } from './firebaseConfig';

const app = isFirebaseConfigured
  ? getApps()[0] ?? initializeApp(firebaseConfig)
  : null;

export default app;
