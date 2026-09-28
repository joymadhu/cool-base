import { $, root } from "../lib/dom.js";

export function initTheme() {
  const sysDark = matchMedia("(prefers-color-scheme: dark)");
  const isDark = () => (root.dataset.theme ? root.dataset.theme === "dark" : sysDark.matches);
  const syncTheme = () => root.classList.toggle("is-dark", isDark());
  try {
    const saved = localStorage.getItem("bc-theme");
    if (saved) root.dataset.theme = saved;
  } catch (_) {}
  syncTheme();
  sysDark.addEventListener?.("change", syncTheme);
  $("themeToggle").addEventListener("click", () => {
    root.dataset.theme = isDark() ? "light" : "dark";
    syncTheme();
    try { localStorage.setItem("bc-theme", root.dataset.theme); } catch (_) {}
  });
}
