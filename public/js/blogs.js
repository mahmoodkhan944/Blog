renderNav("blogs", { onDark: false });

const PAGE_SIZE = 12;

const blogSection = document.querySelector(".blogs-section");
const paginationEl = document.querySelector("#pagination");

let allDocs = [];
let currentPage = Math.max(1, parseInt(new URLSearchParams(location.search).get("page"), 10) || 1);

// See home.js for why we don't use Firestore's orderBy() here — sorting
// happens client-side in sortDocsByRecency() (blog-cards.js) instead.
db.collection("blogs")
  .get()
  .then(res => {
    if (res.empty) {
      blogSection.innerHTML = `<p class="empty-state">No blogs published yet. <a href="/editor">Write the first one</a>.</p>`;
      return;
    }

    allDocs = sortDocsByRecency(res.docs);

    const totalPages = Math.ceil(allDocs.length / PAGE_SIZE);
    if (currentPage > totalPages) currentPage = totalPages;

    renderPage();
  })
  .catch(err => {
    console.error(err);
    blogSection.innerHTML = `<p class="empty-state">Could not load blogs right now. Please refresh.</p>`;
  });

function renderPage() {
  const totalPages = Math.max(1, Math.ceil(allDocs.length / PAGE_SIZE));
  const start = (currentPage - 1) * PAGE_SIZE;
  const pageDocs = allDocs.slice(start, start + PAGE_SIZE);

  blogSection.innerHTML = pageDocs.map(doc => blogCardHTML(doc.id, doc.data())).join("");
  observeReveals();
  renderPagination(totalPages);

  // Reflect the page in the URL (shareable/bookmarkable) without reloading.
  const url = new URL(location.href);
  if (currentPage > 1) url.searchParams.set("page", currentPage);
  else url.searchParams.delete("page");
  history.replaceState(null, "", url);

  window.scrollTo({ top: 0, behavior: "smooth" });
}

function goToPage(page) {
  currentPage = page;
  renderPage();
}

function renderPagination(totalPages) {
  if (totalPages <= 1) {
    paginationEl.innerHTML = "";
    return;
  }

  const pages = pageNumbersToShow(currentPage, totalPages);

  const items = pages.map(p =>
    p === "..."
      ? `<span class="page-ellipsis">…</span>`
      : `<button class="page-btn ${p === currentPage ? "active" : ""}" onclick="goToPage(${p})">${p}</button>`
  ).join("");

  paginationEl.innerHTML = `
    <button class="page-arrow" ${currentPage === 1 ? "disabled" : ""} onclick="goToPage(${currentPage - 1})" aria-label="Previous page">‹</button>
    ${items}
    <button class="page-arrow" ${currentPage === totalPages ? "disabled" : ""} onclick="goToPage(${currentPage + 1})" aria-label="Next page">›</button>
  `;
}

// Returns page numbers to display, e.g. [1, "...", 4, 5, 6, "...", 12]
// — always shows first, last, current, and current's immediate neighbors.
function pageNumbersToShow(current, total) {
  if (total <= 7) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }

  const pages = new Set([1, total, current, current - 1, current + 1]);
  const sorted = [...pages].filter(p => p >= 1 && p <= total).sort((a, b) => a - b);

  const result = [];
  sorted.forEach((p, i) => {
    if (i > 0 && p - sorted[i - 1] > 1) result.push("...");
    result.push(p);
  });

  return result;
}

window.goToPage = goToPage;