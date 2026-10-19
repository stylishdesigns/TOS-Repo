import { getApps, initializeApp, getApp, App } from 'firebase-admin/app';
import { getFirestore, Firestore } from 'firebase-admin/firestore';
import { getAuth, Auth } from 'firebase-admin/auth';
import fs from 'fs';
import path from 'path';

let firebaseConfig: {
  projectId?: string;
  firestoreDatabaseId?: string;
  [key: string]: any;
} = {
  projectId: 'excellence-tutorial-b20f7',
  firestoreDatabaseId: 'ai-studio-excellencetutori-8f17639e-56a5-4f6b-8031-016b3f70cf68'
};

try {
  const configPath = path.resolve(process.cwd(), 'firebase-applet-config.json');
  if (fs.existsSync(configPath)) {
    firebaseConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  }
} catch (e) {
  console.warn('Could not load firebase-applet-config.json:', e);
}

const projectId = process.env.VITE_FIREBASE_PROJECT_ID || firebaseConfig.projectId;
const databaseId = process.env.VITE_FIRESTORE_DATABASE_ID || firebaseConfig.firestoreDatabaseId || '(default)';

const apps = getApps();
export const adminApp: App = apps.length > 0
  ? apps[0]!
  : initializeApp({
      projectId,
    });

export const adminAuth: Auth = getAuth(adminApp);
export const adminDb: Firestore = getFirestore(adminApp, databaseId);

