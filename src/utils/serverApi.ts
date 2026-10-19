import { auth } from '../firebase';

/**
 * Shared authentication for server API calls (Prompt A step 10).
 *
 * installServerApiFetch() wraps window.fetch once at app start, so every
 * same-origin /api request carries the signed-in user's Firebase ID token
 * unless the caller already set an Authorization header. Tokens are never
 * attached to cross-origin requests.
 */
let installed = false;

export function installServerApiFetch(): void {
  if (installed || typeof window === 'undefined') return;
  installed = true;
  const originalFetch = window.fetch.bind(window);
  window.fetch = async (input: any, init?: any) => {
    try {
      const url: string = typeof input === 'string' ? input : input?.url ?? '';
      const sameOrigin =
        url.startsWith('/') || url.startsWith(window.location.origin + '/');
      const isApi = sameOrigin && url.includes('/api/');
      if (isApi) {
        const headers = new Headers(init?.headers || input?.headers || undefined);
        if (!headers.has('Authorization') && auth.currentUser) {
          const token = await auth.currentUser.getIdToken();
          headers.set('Authorization', `Bearer ${token}`);
          init = { ...(init || {}), headers };
        }
      }
    } catch {
      // Never break a request because token attachment failed.
    }
    return originalFetch(input, init);
  };
}
