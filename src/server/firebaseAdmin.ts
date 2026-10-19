import { getApps, initializeApp, getApp, App } from 'firebase-admin/app';
import { getFirestore, Firestore } from 'firebase-admin/firestore';
import { getAuth, Auth } from 'firebase-admin/auth';
import fs from 'fs';
import path from 'path';

// Config comes from environment variables. A local (git-ignored)
// firebase-applet-config.json is honoured as a developer-machine fallback so
// the maintenance scripts keep working without extra setup. No values are
// committed to the repository.
let localConfig: {
  projectId?: string;
  firestoreDatabaseId?: string;
} = {};
try {
  const configPath = path.resolve(process.cwd(), 'firebase-applet-config.json');
  if (fs.existsSync(configPath)) {
    localConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  }
} catch (e) {
  console.warn('Could not read local firebase-applet-config.json:', e);
}

const projectId =
  process.env.FIREBASE_PROJECT_ID ||
  process.env.VITE_FIREBASE_PROJECT_ID ||
  localConfig.projectId ||
  '';
const databaseId =
  process.env.FIRESTORE_DATABASE_ID ||
  process.env.VITE_FIRESTORE_DATABASE_ID ||
  localConfig.firestoreDatabaseId ||
  '';

if (!projectId || !databaseId) {
  throw new Error(
    'Firebase admin config is missing. Set FIREBASE_PROJECT_ID and FIRESTORE_DATABASE_ID ' +
      'in the host environment (or provide firebase-applet-config.json locally for development).',
  );
}

const apps = getApps();
// Explicit credentials when provided (e.g. Netlify Functions, where Application
// Default Credentials are not available). On Cloud Run this stays undefined and
// the platform's default credentials are used, exactly as before.
let explicitCredential: any;
try {
  const svcJson =
    process.env.FIREBASE_SERVICE_ACCOUNT_JSON || process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  if (svcJson) {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { credential } = require('firebase-admin/app');
    explicitCredential = credential.cert(JSON.parse(svcJson));
  }
} catch (e) {
  console.error('Could not build the service-account credential:', e);
}

export const adminApp: App = apps.length > 0
  ? apps[0]!
  : initializeApp({
      projectId,
      ...(explicitCredential ? { credential: explicitCredential } : {}),
    });

export const adminAuth: Auth = getAuth(adminApp);
export const adminDb: Firestore = getFirestore(adminApp, databaseId);
