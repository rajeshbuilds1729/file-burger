"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";

type Theme = "light" | "dark";

interface ThemeContextValue {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggle: () => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: "dark",
  setTheme: () => undefined,
  toggle: () => undefined,
});

const STORAGE_KEY = "file-burger:theme";

/**
 * Minimal theme provider. Dark-first: with no stored preference the system
 * preference is honored, falling back to dark. The inline script in the root
 * layout applies the theme before hydration (no flash).
 */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>("dark");

  useEffect(() => {
    // Sync the provider state with the theme the inline script applied.
    // Deferred to a microtask to avoid cascading renders.
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      const root = document.documentElement;
      setThemeState(root.classList.contains("dark") ? "dark" : "light");
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const setTheme = useCallback((next: Theme) => {
    setThemeState(next);
    const root = document.documentElement;
    root.classList.toggle("dark", next === "dark");
    root.style.colorScheme = next;
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Storage unavailable — theme resets on reload.
    }
  }, []);

  const toggle = useCallback(() => {
    setTheme(theme === "dark" ? "light" : "dark");
  }, [theme, setTheme]);

  return (
    <ThemeContext.Provider value={{ theme, setTheme, toggle }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext);
}
