/* Web push handlers for Tutorial OS (Nov 19).
 * Loaded into the app's service worker via workbox importScripts, so pushes
 * that arrive while the app is closed still surface as notifications.
 * The payload is JSON: { title, body, url?, tag?, icon?, badge? }; icon is
 * the facility's own logo so every push wears the right mark. */
self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    data = { title: 'Tutorial OS', body: event.data ? event.data.text() : '' };
  }
  const title = String(data.title || 'Tutorial OS').slice(0, 120);
  const options = {
    body: String(data.body || '').slice(0, 300),
    icon: data.icon || '/pwa-192x192.png',
    badge: data.badge || data.icon || '/pwa-192x192.png',
    tag: data.tag || 'tos-push',
    renotify: Boolean(data.renotify),
    data: { url: data.url || '/' },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if ('focus' in client) return client.focus();
      }
      return self.clients.openWindow(url);
    })
  );
});
