"use client";

import { useEffect, useState } from "react";

type ShareSupport = "unknown" | "checking" | "supported" | "unsupported";

/** Native Web Share API support detection. */
export function useWebShare(): {
  support: ShareSupport;
  share: (data: { title?: string; text?: string; url?: string }) => Promise<boolean>;
} {
  const [support, setSupport] = useState<ShareSupport>("unknown");

  useEffect(() => {
    if (typeof navigator === "undefined") return;
    // Deferred to a microtask to avoid cascading renders.
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      setSupport(
        typeof navigator.share === "function" ? "supported" : "unsupported",
      );
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const share = async (data: {
    title?: string;
    text?: string;
    url?: string;
  }): Promise<boolean> => {
    if (typeof navigator === "undefined" || typeof navigator.share !== "function") {
      return false;
    }
    try {
      await navigator.share(data);
      return true;
    } catch {
      // User cancelled or share failed.
      return false;
    }
  };

  return { support, share };
}
