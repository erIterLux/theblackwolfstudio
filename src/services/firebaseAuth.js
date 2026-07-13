import { getAuth } from 'firebase/auth';
import app from './firebase';

export const auth = app ? getAuth(app) : null;
