// Navigation and theme helpers shared by the app shell and the pages (no side effects on import).
export function go(hash) {
  if (location.hash === hash) window.dispatchEvent(new HashChangeEvent("hashchange"));
  else location.hash = hash;
}

export function setTheme(mode) {
  const dark = mode === "dark" || (mode === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.dataset.theme = dark ? "dark" : "light";
  try {
    if (mode === "system") localStorage.removeItem("fc-theme");
    else localStorage.setItem("fc-theme", mode);
  } catch {}
  document.dispatchEvent(new CustomEvent("console:theme"));
}

export function themeMode() {
  try {
    return localStorage.getItem("fc-theme") || "system";
  } catch {
    return "system";
  }
}

export const toggleTheme = () => setTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark");
export const signOut = () => document.dispatchEvent(new CustomEvent("console:sign-out"));
export const openPalette = () => document.dispatchEvent(new CustomEvent("console:palette"));
