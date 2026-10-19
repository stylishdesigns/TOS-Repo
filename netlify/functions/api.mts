/**
 * Netlify Function wrapper around the Express app in server.ts.
 *
 * The same Express server keeps running on Cloud Run; this wrapper lets a
 * Netlify deploy serve /api/* itself, so previews are fully functional.
 *
 * Requires these environment variables in Netlify (Site settings > Environment
 * variables):
 * - FIREBASE_SERVICE_ACCOUNT_JSON (or FIREBASE_SERVICE_ACCOUNT_KEY): a Firebase service account private key
 *   (Firebase console > Project settings > Service accounts > Generate new private key).
 * - EXCELLENT_API_KEY: the Vertex AI key used by the AI routes (optional; only
 *   needed if you want AI routes to work on Netlify too).
 * - APP_URL: the public URL of this deployment (optional, used for links).
 */
import serverless from 'serverless-http';

let cachedHandler: ((event: any, context: any) => Promise<any>) | null = null;

async function getHandler() {
  if (cachedHandler) return cachedHandler;
  // Must be set before server.ts is imported so it skips app.listen().
  process.env.NETLIFY = 'true';
  // The Netlify function only serves /api/*; force production mode so the
  // dev-only Vite middleware never intercepts requests.
  process.env.NODE_ENV = 'production';
  const mod = await import('../../server');
  const app = await mod.startServer();
  cachedHandler = serverless(app) as any;
  return cachedHandler;
}

/** Normalize the incoming path to what the Express app expects (/api/...). */
function normalizePath(pathname: string): string {
  if (pathname.startsWith('/.netlify/functions/api')) {
    const rest = pathname.slice('/.netlify/functions/api'.length) || '/';
    return '/api' + (rest.startsWith('/') ? rest : '/' + rest);
  }
  if (pathname.startsWith('/api/')) return pathname;
  if (pathname === '/api') return '/api/';
  return '/api' + (pathname.startsWith('/') ? pathname : '/' + pathname);
}

export default async function handler(req: Request, context: any): Promise<Response> {
  const h = await getHandler();
  const url = new URL(req.url);
  const hasBody = !['GET', 'HEAD'].includes(req.method);
  const event: any = {
    httpMethod: req.method,
    path: normalizePath(url.pathname),
    headers: Object.fromEntries(req.headers.entries()),
    rawQuery: url.search.startsWith('?') ? url.search.slice(1) : '',
    body: hasBody ? await req.text() : null,
    isBase64Encoded: false,
  };
  const res = await h(event, context);
  const headers: Record<string, string> = {};
  const merge = (obj: any) => {
    for (const [k, v] of Object.entries(obj ?? {})) {
      headers[k.toLowerCase()] = Array.isArray(v) ? String(v[v.length - 1]) : String(v);
    }
  };
  merge(res.multiValueHeaders);
  merge(res.headers);
  if (typeof res.body !== 'string' && res.body != null) {
    throw new Error(`Unexpected function body type: ${typeof res.body}`);
  }
  const body: BodyInit = res.isBase64Encoded
    ? new Uint8Array(Buffer.from(res.body as string, 'base64'))
    : (res.body ?? '');
  return new Response(body, { status: res.statusCode, headers });
}

export const config = { path: '/api/*' };
