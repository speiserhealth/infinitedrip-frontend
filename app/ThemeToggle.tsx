"use client";

import * as React from "react";
import { Moon, Sun } from "lucide-react";

const THEME_KEY = "infinitedrip_theme";

type ThemeMode = "light" | "dark";

function applyTheme(mode: ThemeMode) {
  if (typeof document === "undefined") return;
  document.documentElement.classList.toggle("dark", mode === "dark");
  document.documentElement.setAttribute("data-theme", mode);
}

export default function ThemeToggle() {
  const [mode, setMode] = React.useState<ThemeMode>("light");
  const [ready, setReady] = React.useState(false);

  React.useEffect(() => {
    try {
      const stored = localStorage.getItem(THEME_KEY);
      const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
      const next: ThemeMode = stored === "dark" || stored === "light" ? stored : prefersDark ? "dark" : "light";
      setMode(next);
      applyTheme(next);
    } finally {
      setReady(true);
    }
  }, []);

  const toggle = React.useCallback(() => {
    const next: ThemeMode = mode === "dark" ? "light" : "dark";
    setMode(next);
    applyTheme(next);
    try {
      localStorage.setItem(THEME_KEY, next);
    } catch {}
  }, [mode]);

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={!ready}
      className="inline-flex items-center gap-2 rounded border border-border bg-card px-3 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-60"
      aria-label={mode === "dark" ? "Switch to light mode" : "Switch to dark mode"}
      title={mode === "dark" ? "Switch to light mode" : "Switch to dark mode"}
    >
      {mode === "dark" ? <Sun size={14} /> : <Moon size={14} />}
      {mode === "dark" ? "Light" : "Dark"}
    </button>
  );
}
