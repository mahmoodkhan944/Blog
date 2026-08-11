// ===== DARK MODE =====
// The saved theme is applied instantly via a tiny inline script at the
// top of every page's <head> (before any CSS loads), to avoid a flash of
// the wrong theme. This file just handles the toggle button + persisting
// the choice for next time.

function applyTheme(theme) {
  if (theme === "dark") {
    document.documentElement.setAttribute("data-theme", "dark");
  } else {
    document.documentElement.removeAttribute("data-theme");
  }
  localStorage.setItem("theme", theme);
  updateThemeToggleIcon();
}

function toggleTheme() {
  const isDark = document.documentElement.getAttribute("data-theme") === "dark";
  applyTheme(isDark ? "light" : "dark");
}

function updateThemeToggleIcon() {
  const btn = document.getElementById("themeToggle");
  if (!btn) return;

  const isDark = document.documentElement.getAttribute("data-theme") === "dark";
  btn.textContent = isDark ? "☀" : "🌙";
  btn.setAttribute("aria-label", isDark ? "Switch to light mode" : "Switch to dark mode");
}

window.toggleTheme = toggleTheme;