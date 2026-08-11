// ===== SHARED NAVBAR =====
// Renders the navbar into <div id="navbar-root"></div> and keeps it in
// sync with the current auth state (Login vs Dashboard/Logout).
//
// Usage: renderNav("home" | "editor" | "dashboard" | "login" | "blog");

function renderNav(activePage, options = {}) {
  const root = document.getElementById("navbar-root");
  if (!root) return;

  const onDark = !!options.onDark;

  root.innerHTML = `
    <nav class="navbar ${onDark ? "on-dark" : ""}">
      <a href="/" class="logo-link">
        <img src="/img/logo.png" class="logo" alt="Blog logo">
      </a>

      <div class="nav-right">
        <button class="theme-toggle" id="themeToggle" aria-label="Switch theme" onclick="toggleTheme()"></button>

        <button class="nav-toggle" id="navToggle" aria-label="Toggle menu" aria-expanded="false">
          <span></span><span></span><span></span>
        </button>

        <ul class="links-container" id="navLinks">
          <li class="link-item">
            <a href="/" class="link ${activePage === "home" ? "active" : ""}">Home</a>
          </li>
          <li class="link-item">
            <a href="/editor" class="link ${activePage === "editor" ? "active" : ""}">Write</a>
          </li>
          <li class="link-item auth-only" style="display:none">
            <a href="/dashboard" class="link ${activePage === "dashboard" ? "active" : ""}">Dashboard</a>
          </li>
          <li class="link-item auth-only" style="display:none">
            <a href="#" class="link" id="logoutBtn">Logout</a>
          </li>
          <li class="link-item guest-only">
            <a href="/login" class="link ${activePage === "login" ? "active" : ""}">Login</a>
          </li>
        </ul>
      </div>
    </nav>
  `;

  updateThemeToggleIcon();

  const toggle = document.getElementById("navToggle");
  const links = document.getElementById("navLinks");

  toggle.addEventListener("click", () => {
    const isOpen = links.classList.toggle("open");
    toggle.setAttribute("aria-expanded", isOpen);
  });

  const logoutBtn = document.getElementById("logoutBtn");
  logoutBtn.addEventListener("click", e => {
    e.preventDefault();
    logout().then(() => (location.href = "/"));
  });

  if (typeof auth !== "undefined") {
    auth.onAuthStateChanged(user => {
      document.querySelectorAll(".auth-only").forEach(el => (el.style.display = user ? "" : "none"));
      document.querySelectorAll(".guest-only").forEach(el => (el.style.display = user ? "none" : ""));
    });
  }
}