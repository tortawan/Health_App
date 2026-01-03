\"use client\";

import { useEffect } from \"react\";

export function ServiceWorkerRegister() {
  useEffect(() => {
    if (!(\"serviceWorker\" in navigator)) return;

    const register = async () => {
      try {
        const registration = await navigator.serviceWorker.register(\"/sw.js\");
        if (navigator.onLine) {
          registration.active?.postMessage(\"retryQueuedLogs\");
        }
      } catch (error) {
        console.warn(\"Service worker registration failed\", error);
      }
    };

    const onOnline = () => {
      navigator.serviceWorker.ready
        .then((registration) => registration.active?.postMessage(\"retryQueuedLogs\"))
        .catch(() => {});
    };

    void register();
    window.addEventListener(\"online\", onOnline);
    return () => {
      window.removeEventListener(\"online\", onOnline);
    };
  }, []);

  return null;
}
