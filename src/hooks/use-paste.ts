"use client";

import { useEffect } from "react";

/**
 * Listen for files pasted from the clipboard (Ctrl/Cmd+V) where the browser
 * permits it. Attaches at the document level so paste works anywhere on the
 * page.
 */
export function usePaste(onFiles: (files: File[]) => void, enabled = true): void {
  useEffect(() => {
    if (!enabled) return;
    const handler = (event: ClipboardEvent) => {
      const items = event.clipboardData?.items;
      if (!items) return;
      const files: File[] = [];
      for (const item of Array.from(items)) {
        if (item.kind === "file") {
          const file = item.getAsFile();
          if (file) files.push(file);
        }
      }
      if (files.length > 0) {
        event.preventDefault();
        onFiles(files);
      }
    };
    document.addEventListener("paste", handler);
    return () => document.removeEventListener("paste", handler);
  }, [onFiles, enabled]);
}
