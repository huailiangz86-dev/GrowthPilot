/* No page or browser tab needs to be open for push delivery. */
function receipt(id, remove = false) {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open('growthpilot-push-receipts', 1);
    open.onupgradeneeded = () => open.result.createObjectStore('seen');
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const db = open.result, tx = db.transaction('seen', 'readwrite'), store = tx.objectStore('seen');
      let already = false;
      if (remove) store.delete(id);
      else {
        const get = store.get(id);
        get.onsuccess = () => {already = Boolean(get.result); if (!already) store.put(Date.now(), id);};
        // Bound receipt storage without removing recent duplicate protection.
        const cursor = store.openCursor();
        cursor.onsuccess = () => {const c = cursor.result; if (c) {if (c.value < Date.now() - 7*86400000) c.delete(); c.continue();}};
      }
      tx.oncomplete = () => {db.close(); resolve(already);};
      tx.onerror = () => {db.close(); reject(tx.error);};
    };
  });
}
self.addEventListener('push', event => {
  event.waitUntil((async () => {
    let data;
    try {data = event.data.json();} catch {return;}
    if (!data || !/^[a-f0-9-]{36}$/i.test(data.id)) return;
    if (await receipt(data.id)) return;
    try {
      await self.registration.showNotification('GrowthPilot 到期提醒', {
        body: typeof data.body === 'string' ? data.body.slice(0,240) : '打开 GrowthPilot 查看到期行动。',
        tag: `growthpilot:${data.id}`, renotify: false, data: {url: '/app/execution'},
      });
    } catch (error) {await receipt(data.id, true); throw error;}
  })());
});
self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(clients.openWindow(new URL('/app/execution', self.location.origin).href));
});
