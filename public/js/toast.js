// ===== TOAST NOTIFICATIONS & CONFIRM MODAL =====
// Replaces native alert()/confirm() — those are unstyled browser popups
// that clash with the rest of the site's design. These match it instead.

function ensureToastContainer() {
  let container = document.getElementById("toastContainer");
  if (!container) {
    container = document.createElement("div");
    container.id = "toastContainer";
    container.className = "toast-container";
    container.setAttribute("aria-live", "polite");
    document.body.appendChild(container);
  }
  return container;
}

// type: "success" | "error" | "info"
function toast(message, type = "info") {
  const container = ensureToastContainer();

  const el = document.createElement("div");
  el.className = `toast toast-${type}`;
  el.textContent = message;
  container.appendChild(el);

  requestAnimationFrame(() => el.classList.add("show"));

  setTimeout(() => {
    el.classList.remove("show");
    setTimeout(() => el.remove(), 300);
  }, 3500);
}

// Returns a Promise<boolean> — await it where `if (!confirm(...))` used
// to be. Message is developer-authored only (never raw user input), so
// it's safe to insert directly.
function showConfirm(message, options = {}) {
  const { confirmLabel = "Delete", cancelLabel = "Cancel", danger = true } = options;

  return new Promise(resolve => {
    const overlay = document.createElement("div");
    overlay.className = "confirm-overlay";
    overlay.innerHTML = `
      <div class="confirm-modal" role="alertdialog" aria-modal="true">
        <p class="confirm-message">${message}</p>
        <div class="confirm-actions">
          <button class="btn ghost confirm-cancel">${cancelLabel}</button>
          <button class="btn ${danger ? "danger" : "accent"} confirm-ok">${confirmLabel}</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add("show"));

    function close(result) {
      overlay.classList.remove("show");
      setTimeout(() => overlay.remove(), 200);
      document.removeEventListener("keydown", escHandler);
      resolve(result);
    }

    function escHandler(e) {
      if (e.key === "Escape") close(false);
    }

    overlay.querySelector(".confirm-cancel").addEventListener("click", () => close(false));
    overlay.querySelector(".confirm-ok").addEventListener("click", () => close(true));
    overlay.addEventListener("click", e => {
      if (e.target === overlay) close(false);
    });
    document.addEventListener("keydown", escHandler);

    overlay.querySelector(".confirm-ok").focus();
  });
}

window.toast = toast;
window.showConfirm = showConfirm;