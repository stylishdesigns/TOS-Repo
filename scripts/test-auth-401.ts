/**
 * Prompt A step 1 test: forged, expired and missing tokens must all get 401
 * on /api routes. Runs the Express app in-process with a stubbed token
 * verifier, so no Firebase credentials are needed.
 *
 * Run: npx tsx scripts/test-auth-401.ts
 */
import assert from 'node:assert/strict';
import { adminAuth } from '../src/server/firebaseAdmin';

process.env.NODE_ENV = 'production';
process.env.NETLIFY = 'true';
delete process.env.TOS_BOOTSTRAP_EMAILS;
delete process.env.SUPER_ADMIN_EMAILS;

// Stub the verifier: only a token literally named "valid" verifies, anything
// else behaves like a forged/expired/unsigned token would in production.
(adminAuth as any).verifyIdToken = async (token: string) => {
  if (token === 'valid') {
    return { uid: 'test-uid', email: 'test@example.com', email_verified: true };
  }
  const e: any = new Error('ID token verification failed');
  e.code = 'auth/argument-error';
  throw e;
};

const { startServer } = await import('../server');
const app = await startServer();
const server = app.listen(0);
const port = (server.address() as any).port;
const base = `http://127.0.0.1:${port}`;

async function call(path: string, token?: string, method = 'GET') {
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (method === 'POST') headers['Content-Type'] = 'application/json';
  const res = await fetch(`${base}${path}`, {
    method,
    headers,
    ...(method === 'POST' ? { body: '{}' } : {}),
  });
  return res.status;
}

try {
  assert.equal(await call('/api/health'), 200, 'health stays public');
  assert.equal(await call('/api/auth/my-centres'), 401, 'missing token -> 401');
  assert.equal(await call('/api/auth/my-centres', 'forged.token.value'), 401, 'forged token -> 401');
  assert.equal(await call('/api/auth/my-centres', 'expired.token.value'), 401, 'expired token -> 401');
  assert.equal(await call('/api/centre/entitlements?centreId=x', 'forged.token.value'), 401, 'forged token on centre endpoints -> 401');
  assert.equal(await call('/api/centre/seats-summary?centreId=x'), 401, 'missing token on seats summary -> 401');
  // A valid token gets past the auth middleware: enter-centre with no body then
  // fails later with 400 (bad request), never with 401. This route touches no
  // Firestore data, so the test needs no credentials.
  assert.equal(await call('/api/auth/enter-centre', 'valid', 'POST'), 400, 'valid token passes the auth middleware');
  console.log('PASS: all token cases behaved correctly (missing, forged, expired -> 401; health stays public).');
} finally {
  server.close();
}
