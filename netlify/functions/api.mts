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
// NOTE: bundled fresh on every deploy; bump this comment when server-side files change (v29: mocks M5b+M5c, board view, username register, settings screen, correct-a-question, void)
// so the function bundler cache cannot serve a stale bundle.
// (the Firestore proxy routes in server.ts + src/server/foDbProxy.ts ride the same bundle).


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

/**
 * Split a raw query string into name/value pairs WITHOUT decoding, so
 * serverless-http (which URL-decodes queryStringParameters itself) decodes
 * each value exactly once.
 */
function decodeQueryPart(raw: string): string {
  // Form-urlencoded rules: '+' means a space in a query string, and literal
  // '+' arrives as %2B (the client encodes with URLSearchParams), so decoding
  // once here turns both spellings into the real value.
  let text = raw.replace(/\+/g, ' ');
  try { text = decodeURIComponent(text); } catch { /* keep raw on bad input */ }
  return text;
}

function parseRawQuery(search: string): Record<string, string> {
  let q = search.startsWith('?') ? search.slice(1) : search;
  const out: Record<string, string> = {};
  if (!q) return out;
  for (const pair of q.split('&')) {
    if (!pair) continue;
    const eq = pair.indexOf('=');
    out[decodeQueryPart(eq === -1 ? pair : pair.slice(0, eq))] = eq === -1 ? '' : decodeQueryPart(pair.slice(eq + 1));
  }
  return out;
}

export default async function handler(req: Request, context: any): Promise<Response> {
  const h = await getHandler();
  const url = new URL(req.url);
  const hasBody = !['GET', 'HEAD'].includes(req.method);
  // serverless-http builds the request URL from `rawQueryString` (payload v2)
  // or from `queryStringParameters` (payload v1); the old `rawQuery` key is
  // read by neither, so query strings were silently dropped and every
  // GET-with-parameters route (centre-code lookup, audit filters, lead
  // verification links) saw empty params on Netlify. Pass the query in all
  // three shapes so any bundler version picks it up.
  const rawQuery = url.search.startsWith('?') ? url.search.slice(1) : '';
  const event: any = {
    httpMethod: req.method,
    path: normalizePath(url.pathname),
    headers: Object.fromEntries(req.headers.entries()),
    rawQuery,
    rawQueryString: rawQuery,
    queryStringParameters: parseRawQuery(url.search),
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
