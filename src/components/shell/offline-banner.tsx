"use client";

import { useEffect, useState } from "react";
import { Icon } from "@/components/ui/icon";

/** Shows a clear, non-blocking banner when the browser loses its connection, and explains what still works. */
export function OfflineBanner() {
  const [offline, setOffline] = useState(false);
  useEffect(() => {
    const update = () => setOffline(!navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);
  if (!offline) return null;
  return (
    <div role="status" className="fixed inset-x-0 top-0 z-[150] flex items-center justify-center gap-2 bg-fg px-4 py-2 text-center text-sm font-medium text-bg">
      <Icon name="warning" size={16} />
      You're offline. Changes won't save until your connection is back — drafts stay in your browser in the meantime.
    </div>
  );
}
