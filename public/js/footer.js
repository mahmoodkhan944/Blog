// ===== SHARED FOOTER =====
// Renders into <div id="footer-root"></div> — same pattern as nav.js.

function renderFooter() {
  const root = document.getElementById("footer-root");
  if (!root) return;

  const year = new Date().getFullYear();

  root.innerHTML = `
    <footer class="site-footer">
      <div class="footer-inner">
        <div class="footer-brand">
          <span class="footer-logo">B<span class="footer-logo-accent">log</span></span>
          <p>Real stories and ideas, written by people — not algorithms.</p>
        </div>

        <div class="footer-links">
          <a href="/">Home</a>
          <a href="/editor">Write</a>
          <a href="/blogs">All blogs</a>
          <a href="/about">About</a>
          <a href="/contact">Contact</a>
          <a href="/feed.xml">RSS</a>
        </div>
      </div>

      <p class="footer-copy">&copy; ${year} Blog. All rights reserved.</p>
    </footer>
  `;
}

document.addEventListener("DOMContentLoaded", renderFooter);