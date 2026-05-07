self.addEventListener('push', (event) => {
  const data = event.data ? event.data.json() : {
    title: 'VisaExpert Guatemala',
    body: 'Nueva actualización en su trámite.'
  };

  const options = {
    body: data.body,
    icon: data.icon || '/globe.png',
    badge: '/globe.png',
    vibrate: [100, 50, 100],
    data: {
      dateOfArrival: Date.now(),
      primaryKey: '2'
    },
    actions: [
      {
        action: 'explore',
        title: 'Ver detalles',
        icon: '/globe.png'
      },
      {
        action: 'close',
        title: 'Cerrar',
        icon: '/globe.png'
      },
    ]
  };

  event.waitUntil(
    self.registration.showNotification(data.title, options)
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  if (event.action === 'explore') {
    event.waitUntil(
      clients.openWindow('/')
    );
  }
});
