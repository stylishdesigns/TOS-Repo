import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

// Firebase web config is supplied at build time through environment variables
// (see .env.example). No config values are committed to the repository.
const env = import.meta.env as unknown as Record<string, string | undefined>;

const firebaseConfig = {
  apiKey: env.FIREBASE_API_KEY ?? '',
  appId: env.FIREBASE_APP_ID ?? '',
  projectId: env.FIREBASE_PROJECT_ID ?? '',
  authDomain: env.FIREBASE_AUTH_DOMAIN ?? '',
  storageBucket: env.FIREBASE_STORAGE_BUCKET ?? '',
  messagingSenderId: env.FIREBASE_MESSAGING_SENDER_ID ?? '',
  measurementId: '',
  oAuthClientId: env.FIREBASE_OAUTH_CLIENT_ID ?? '',
  recaptchaSiteKey: '',
  firestoreDatabaseId: env.FIRESTORE_DATABASE_ID ?? '',
};

// authDomain, storageBucket and messagingSenderId follow the standard Firebase
// patterns, so a host only has to set them when it deviates from the defaults.
if (!firebaseConfig.authDomain && firebaseConfig.projectId) {
  firebaseConfig.authDomain = `${firebaseConfig.projectId}.firebaseapp.com`;
}
if (!firebaseConfig.storageBucket && firebaseConfig.projectId) {
  firebaseConfig.storageBucket = `${firebaseConfig.projectId}.firebasestorage.app`;
}
if (!firebaseConfig.messagingSenderId && firebaseConfig.appId) {
  firebaseConfig.messagingSenderId = firebaseConfig.appId.split(':')[1] ?? '';
}

const missing = [
  [!firebaseConfig.apiKey, 'FIREBASE_API_KEY'],
  [!firebaseConfig.appId, 'FIREBASE_APP_ID'],
  [!firebaseConfig.projectId, 'FIREBASE_PROJECT_ID'],
  [!firebaseConfig.firestoreDatabaseId, 'FIRESTORE_DATABASE_ID'],
]
  .filter(([missingVar]) => missingVar)
  .map(([, name]) => name as string);

if (missing.length > 0) {
  throw new Error(
    `Missing Firebase config environment variables: ${missing.join(', ')}. ` +
      'Set them in your host build settings (or a local .env file, see .env.example) and rebuild.',
  );
}

export const firebaseConfigValues = firebaseConfig;
const app = initializeApp(firebaseConfig);

// Use the specific database ID when provided, otherwise the (default) database.
export const db = firebaseConfig.firestoreDatabaseId
  ? getFirestore(app, firebaseConfig.firestoreDatabaseId)
  : getFirestore(app);

export const auth = getAuth(app);

export default app;
