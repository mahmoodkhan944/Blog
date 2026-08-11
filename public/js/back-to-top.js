// ===== BACK TO TOP =====
// Shows a floating button once the page is scrolled down a bit; clicking
// smooth-scrolls back to the top. Self-initializes on any page that has
// the button markup.

(function () {
  const btn = document.getElementById("backToTop");
  if (!btn) return;

  let visible = false;

  window.addEventListener("scroll", () => {
    const shouldShow = window.scrollY > 500;
    if (shouldShow !== visible) {
      visible = shouldShow;
      btn.style.display = visible ? "flex" : "none";
    }
  });

  btn.addEventListener("click", () => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  });
})();