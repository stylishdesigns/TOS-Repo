import { getApps, initializeApp, getApp, cert, App } from 'firebase-admin/app';
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
//
// `cert` is the real export from firebase-admin/app (there is no `credential`
// export, and `require` does not exist in the bundled ESM/CJS function), so the
// credential is built with a normal import. When a service account IS provided
// but cannot be used, this throws at startup instead of silently falling back
// to default credentials that do not exist in that environment.
function buildServiceAccountCredential(): any {
  const svcJson =
    process.env.FIREBASE_SERVICE_ACCOUNT_JSON ||
    process.env.FIREBASE_SERVICE_ACCOUNT_KEY ||
    '';
  if (!svcJson) return undefined;

  let parsed: any;
  try {
    // Accept the key as raw JSON or as base64-encoded JSON.
    const isRawJson = /^\s*[[{]/.test(svcJson);
    const text = isRawJson ? svcJson : Buffer.from(svcJson, 'base64').toString('utf8');
    parsed = JSON.parse(text);
  } catch (e: any) {
    throw new Error(
      'FIREBASE_SERVICE_ACCOUNT_JSON is set but could not be parsed. ' +
        'The value must be the service-account key as raw JSON or base64-encoded JSON. ' +
        'Parse error: ' + (e?.message || String(e)),
    );
  }

  if (!parsed || typeof parsed !== 'object' || !parsed.private_key || !parsed.client_email) {
    throw new Error(
      'FIREBASE_SERVICE_ACCOUNT_JSON is set but does not look like a service-account key ' +
        '(expected an object with at least private_key and client_email fields).',
    );
  }

  // Keys stored through some pipelines keep literal backslash-n sequences inside
  // the private key. Restore the real newlines before handing it to the SDK.
  if (typeof parsed.private_key === 'string' && parsed.private_key.includes('\\n')) {
    parsed.private_key = parsed.private_key.replace(/\\n/g, '\n');
  }

  return cert(parsed);
}

const explicitCredential = buildServiceAccountCredential();

export const adminCredentialSource: 'service-account' | 'default' = explicitCredential
  ? 'service-account'
  : 'default';

export const adminApp: App = apps.length > 0
  ? apps[0]!
  : initializeApp({
      projectId,
      ...(explicitCredential ? { credential: explicitCredential } : {}),
    });

export { projectId, databaseId };

export const adminAuth: Auth = getAuth(adminApp);
export const adminDb: Firestore = getFirestore(adminApp, databaseId);
