import { getFunctions } from 'firebase/functions';
import app from './firebase';

const region = import.meta.env.VITE_FIREBASE_FUNCTIONS_REGION || 'us-central1';
export const functions = app ? getFunctions(app, region) : null;
