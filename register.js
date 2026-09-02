// Service Worker Registration & Push Notification Setup

(function() {
  // ─── Service Worker Registration ───
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js', {
        scope: './'
      }).then(registration => {
        console.log('ServiceWorker registered:', registration);
        
        // Try to subscribe for push notifications
        if ('PushManager' in window && registration.pushManager) {
          subscribeToPushNotifications(registration);
        }
      }).catch(err => {
        console.error('ServiceWorker registration failed:', err);
      });
    });
  }

  // ─── Push Notification Subscription ───
  function subscribeToPushNotifications(registration) {
    // Check if already subscribed
    registration.pushManager.getSubscription().then(subscription => {
      if (subscription) {
        console.log('Already subscribed to push notifications');
        sendSubscriptionToServer(subscription);
        return;
      }

      // Subscribe if not already subscribed
      const vapidPublicKey = 'BDQ8XlX1wbta3RwiuYkzXSnVs474RzEVomOsI9Q0j4Rc9s6ow9T2bMWr2ShMsMtIs6i4zyrOe9j78VTWh9JMsXU';
      
      if (!vapidPublicKey) {
        console.warn('VAPID public key not configured');
        return;
      }

      registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidPublicKey)
      }).then(subscription => {
        console.log('Subscribed to push notifications:', subscription);
        sendSubscriptionToServer(subscription);
      }).catch(err => {
        if (Notification.permission === 'denied') {
          console.log('Notification permission denied');
        } else {
          console.error('Failed to subscribe to push notifications:', err);
        }
      });
    });
  }

  // ─── Send Subscription to Server ───
  function sendSubscriptionToServer(subscription) {
    try {
      // Store subscription in localStorage for reference
      localStorage.setItem('gc_push_subscription', JSON.stringify({
        endpoint: subscription.endpoint,
        p256dh: btoa(String.fromCharCode(...new Uint8Array(subscription.getKey('p256dh')))),
        auth: btoa(String.fromCharCode(...new Uint8Array(subscription.getKey('auth'))))
      }));

      // In production, send to your push server
      // fetch('/api/subscribe', {
      //   method: 'POST',
      //   headers: { 'Content-Type': 'application/json' },
      //   body: JSON.stringify(subscription)
      // }).catch(err => console.warn('Could not send subscription to server:', err));
    } catch (err) {
      console.warn('Could not save subscription:', err);
    }
  }

  // ─── Utility: Convert VAPID Key ───
  function urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding)
      .replace(/\-/g, '+')
      .replace(/_/g, '/');

    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);

    for (let i = 0; i < rawData.length; ++i) {
      outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
  }

  // ─── Handle Notification Permission ───
  if ('Notification' in window && Notification.permission === 'default') {
    // Optionally request permission (don't auto-request, let user decide)
    // Notification.requestPermission();
  }

  // ─── Listen for Service Worker Messages ───
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('message', event => {
      const { type, data } = event.data;
      
      if (type === 'NOTIFICATION_CLICKED') {
        console.log('Notification clicked in service worker:', data);
        // Handle notification click if needed
      } else if (type === 'SYNC_COMPLETE') {
        console.log('Background sync completed:', data);
        // Handle sync completion if needed
      }
    });
  }

  // ─── Periodic Background Sync (if available) ───
  if ('periodicSync' in ServiceWorkerRegistration.prototype) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.ready.then(registration => {
        // Sync every 24 hours (minimum interval)
        registration.periodicSync.register('sync-messages', {
          minInterval: 24 * 60 * 60 * 1000
        }).catch(err => {
          console.warn('Periodic sync registration failed:', err);
        });
      });
    });
  }
})();

