"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/** Copy text to the clipboard with a transient "copied" state for feedback. */
export function useCopy(timeoutMs = 2000): {
  copied: boolean;
  copy: (text: string) => Promise<boolean>;
} {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  const copy = useCallback(
    async (text: string): Promise<boolean> => {
      let success = false;
      try {
        if (typeof navigator !== "undefined" && navigator.clipboard) {
          await navigator.clipboard.writeText(text);
          success = true;
        } else {
          // Fallback for non-secure contexts.
          const textarea = document.createElement("textarea");
          textarea.value = text;
          textarea.style.position = "fixed";
          textarea.style.opacity = "0";
          document.body.appendChild(textarea);
          textarea.select();
          success = document.execCommand("copy");
          textarea.remove();
        }
      } catch {
        success = false;
      }
      if (success) {
        setCopied(true);
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => setCopied(false), timeoutMs);
      }
      return success;
    },
    [timeoutMs],
  );

  return { copied, copy };
}
