renderNav("dashboard");
requireAuth();

const PAGE_SIZE = 12;

const container = document.querySelector(".blogs-grid");
const paginationEl = document.querySelector("#pagination");

let unsubscribe = null;
let allDocs = [];
let isAdminView = false;
let currentPage = Math.max(1, parseInt(new URLSearchParams(location.search).get("page"), 10) || 1);

document.addEventListener("DOMContentLoaded", () => {
  auth.onAuthStateChanged(user => {
    if (!user) return; // requireAuth() handles the redirect

    if (unsubscribe) unsubscribe();

    isAdminView = isAdmin(user);

    // No orderBy — see home.js for why. We sort client-side instead so
    // this also doesn't need a Firestore composite index.
    const query = isAdminView
      ? db.collection("blogs")
      : db.collection("blogs").where("authorId", "==", user.uid);

    unsubscribe = query.onSnapshot(
      snapshot => {
        allDocs = sortDocsByRecency(snapshot.docs);
        const totalPages = Math.max(1, Math.ceil(allDocs.length / PAGE_SIZE));
        if (currentPage > totalPages) currentPage = totalPages;
        renderPage();
      },
      err => {
        console.error(err);
        container.innerHTML = `<p class="empty-state">Could not load your blogs right now.</p>`;
      }
    );
  });
});

function renderPage() {
  if (allDocs.length === 0) {
    container.innerHTML = `<p class="empty-state">No blogs yet. <a href="/editor">Write your first one</a>.</p>`;
    paginationEl.innerHTML = "";
    return;
  }

  const totalPages = Math.max(1, Math.ceil(allDocs.length / PAGE_SIZE));
  const start = (currentPage - 1) * PAGE_SIZE;
  const pageDocs = allDocs.slice(start, start + PAGE_SIZE);

  container.innerHTML = "";

  pageDocs.forEach(doc => {
    const data = doc.data();

    container.innerHTML += `
      <div class="dash-card">
        <img src="${data.bannerImage}" class="dash-thumb" alt="${escapeHtml(data.title)}" loading="lazy">
        <div class="dash-body">
          <h2 class="dash-title">${escapeHtml(data.title)}</h2>
          <p class="dash-date">
            ${data.publishedAt || ""} · ${data.views || 0} views
            ${isAdminView && data.authorEmail ? `· ${escapeHtml(data.authorEmail)}` : ""}
          </p>
          <div class="dash-actions">
            <button class="btn small" onclick="editBlog('${doc.id}')">Edit</button>
            <button class="btn small danger" onclick="deleteBlog('${doc.id}')">Delete</button>
            <a class="btn small ghost" href="/${doc.id}" target="_blank" rel="noopener">View</a>
          </div>
        </div>
      </div>
    `;
  });

  renderPagination(totalPages);

  const url = new URL(location.href);
  if (currentPage > 1) url.searchParams.set("page", currentPage);
  else url.searchParams.delete("page");
  history.replaceState(null, "", url);
}

function goToPage(page) {
  currentPage = page;
  renderPage();
  window.scrollTo({ top: 0, behavior: "smooth" });
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

function editBlog(id) {
  location.href = `/editor?id=${encodeURIComponent(id)}`;
}

async function deleteBlog(id) {
  if (!confirm("Delete this blog permanently? This can't be undone.")) return;

  try {
    await db.collection("blogs").doc(id).delete();
  } catch (err) {
    console.error(err);
    alert("Could not delete this blog. Please try again.");
  }
}

function escapeHtml(str) {
  return String(str).replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

window.editBlog = editBlog;
window.deleteBlog = deleteBlog;
window.goToPage = goToPage;