// Pulled into the app's service worker (see vite.config.ts): shows a notification when the server sends a push, and opens the right page when it is tapped.
self.addEventListener('push', (event) => {
  let d = {}
  try { d = event.data ? event.data.json() : {} } catch (e) { d = { title: 'G|Wired', body: event.data ? event.data.text() : '' } }
  event.waitUntil(self.registration.showNotification(d.title || 'G|Wired', {
    body: d.body || '',
    icon: '/icon-192.png',
    badge: '/favicon-64.png',
    tag: d.tag || undefined,
    data: { url: d.url || '/' },
  }))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = (event.notification.data && event.notification.data.url) || '/'
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
    for (const c of list) {
      if ('focus' in c) { if ('navigate' in c) { try { c.navigate(url) } catch (e) { /* ignore */ } } return c.focus() }
    }
    return self.clients.openWindow(url)
  }))
})
