renderNav("dashboard");
requireAuth();

const PAGE_SIZE = 12;

const container = document.querySelector(".blogs-grid");
const paginationEl = document.querySelector("#pagination");

let unsubscribe = null;
let allDocs = [];
let isAdminView = false;
let currentPage = Math.max(1, parseInt(new URLSearchParams(location.search).get("page"), 10) || 1);
let selectedIds = new Set();

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
        renderStats();
        renderPage();
      },
      err => {
        console.error(err);
        container.innerHTML = `<p class="empty-state">Could not load your blogs right now.</p>`;
      }
    );
  });
});

function renderStats() {
  const panel = document.querySelector("#statsPanel");
  if (!panel) return;

  if (allDocs.length === 0) {
    panel.innerHTML = "";
    return;
  }

  const published = allDocs.filter(doc => doc.data().status !== "draft");
  const totalViews = published.reduce((sum, doc) => sum + (doc.data().views || 0), 0);
  const totalLikes = published.reduce((sum, doc) => sum + (doc.data().likes || 0), 0);

  const topPosts = [...published]
    .sort((a, b) => (b.data().views || 0) - (a.data().views || 0))
    .slice(0, 5);
  const maxViews = Math.max(1, ...topPosts.map(doc => doc.data().views || 0));

  panel.innerHTML = `
    <div class="stats-cards">
      <div class="stat-card">
        <span class="stat-icon" aria-hidden="true">📝</span>
        <span class="stat-text">
          <span class="stat-value">${published.length}</span>
          <span class="stat-label">Published posts</span>
        </span>
      </div>
      <div class="stat-card">
        <span class="stat-icon" aria-hidden="true">👁️</span>
        <span class="stat-text">
          <span class="stat-value">${totalViews}</span>
          <span class="stat-label">Total views</span>
        </span>
      </div>
      <div class="stat-card">
        <span class="stat-icon" aria-hidden="true">❤️</span>
        <span class="stat-text">
          <span class="stat-value">${totalLikes}</span>
          <span class="stat-label">Total likes</span>
        </span>
      </div>
    </div>
    ${topPosts.length ? `
      <div class="stats-chart">
        <h3>Top posts by views</h3>
        ${topPosts.map(doc => {
          const d = doc.data();
          const views = d.views || 0;
          const pct = Math.max(4, Math.round((views / maxViews) * 100));
          return `
            <div class="stats-bar-row">
              <span class="stats-bar-label" title="${escapeHtml(d.title)}">${escapeHtml(d.title)}</span>
              <div class="stats-bar-track">
                <div class="stats-bar-fill" style="width:${pct}%"></div>
              </div>
              <span class="stats-bar-value">${views}</span>
            </div>
          `;
        }).join("")}
      </div>
    ` : ""}
  `;
}

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
        <label class="dash-select">
          <input type="checkbox" class="dash-checkbox" data-id="${doc.id}" ${selectedIds.has(doc.id) ? "checked" : ""} aria-label="Select this post">
        </label>
        <img src="${data.bannerImage}" class="dash-thumb" alt="${escapeHtml(data.title)}" loading="lazy">
        <div class="dash-body">
          <h2 class="dash-title">${escapeHtml(data.title)}</h2>
          <p class="dash-date">
            ${data.status === "draft" ? '<span class="draft-badge">Draft</span> · ' : ""}
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

  document.querySelectorAll(".dash-checkbox").forEach(cb => {
    cb.addEventListener("change", () => {
      if (cb.checked) selectedIds.add(cb.dataset.id);
      else selectedIds.delete(cb.dataset.id);
      renderBulkBar();
    });
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
  if (!(await showConfirm("Delete this blog permanently? This can't be undone."))) return;

  try {
    await db.collection("blogs").doc(id).delete();
    selectedIds.delete(id);
  } catch (err) {
    console.error(err);
    toast("Could not delete this blog. Please try again.", "error");
  }
}

// ===== BULK SELECT / DELETE =====
function renderBulkBar() {
  const bar = document.querySelector("#bulkBar");
  const countEl = document.querySelector("#bulkCount");
  if (!bar || !countEl) return;

  if (selectedIds.size === 0) {
    bar.style.display = "none";
    return;
  }

  bar.style.display = "flex";
  countEl.textContent = `${selectedIds.size} selected`;
}

document.addEventListener("DOMContentLoaded", () => {
  document.querySelector("#bulkClear")?.addEventListener("click", () => {
    selectedIds.clear();
    renderBulkBar();
    document.querySelectorAll(".dash-checkbox").forEach(cb => (cb.checked = false));
  });

  document.querySelector("#bulkDelete")?.addEventListener("click", async () => {
    const count = selectedIds.size;
    if (count === 0) return;
    if (!(await showConfirm(`Delete ${count} selected blog${count === 1 ? "" : "s"} permanently? This can't be undone.`))) return;

    const bulkDeleteBtn = document.querySelector("#bulkDelete");
    bulkDeleteBtn.disabled = true;
    bulkDeleteBtn.textContent = "Deleting...";

    try {
      const batch = db.batch();
      selectedIds.forEach(id => batch.delete(db.collection("blogs").doc(id)));
      await batch.commit();
      selectedIds.clear();
      renderBulkBar();
    } catch (err) {
      console.error(err);
      toast("Could not delete the selected blogs. Please try again.", "error");
    } finally {
      bulkDeleteBtn.disabled = false;
      bulkDeleteBtn.textContent = "Delete selected";
    }
  });
});

function escapeHtml(str) {
  return String(str).replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

window.editBlog = editBlog;
window.deleteBlog = deleteBlog;
window.goToPage = goToPage;

// ===== BROKEN IMAGE CHECKER =====
// Checks every post's banner + inline article images actually load.
// Uses the Image() load/error trick — no CORS issues since we're only
// checking whether it loads, not reading its pixels.
function checkImageUrl(url) {
  return new Promise(resolve => {
    if (!url) return resolve(false);

    const img = new Image();
    const timeout = setTimeout(() => resolve(false), 8000);

    img.onload = () => {
      clearTimeout(timeout);
      resolve(true);
    };
    img.onerror = () => {
      clearTimeout(timeout);
      resolve(false);
    };
    img.src = url;
  });
}

function collectImageUrls(data) {
  const urls = new Set();
  if (data.bannerImage) urls.add(data.bannerImage);

  if (data.article && data.contentFormat === "html") {
    try {
      const parsed = new DOMParser().parseFromString(data.article, "text/html");
      parsed.querySelectorAll("img").forEach(img => {
        const src = img.getAttribute("src");
        if (src) urls.add(src);
      });
    } catch {}
  }

  return [...urls];
}

async function checkBrokenImages() {
  const btn = document.querySelector("#checkImagesBtn");
  const resultsEl = document.querySelector("#imageCheckResults");
  if (!btn || !resultsEl) return;

  if (allDocs.length === 0) {
    resultsEl.innerHTML = `<p class="empty-state">No posts to check yet.</p>`;
    return;
  }

  btn.disabled = true;
  btn.textContent = "Checking...";
  resultsEl.innerHTML = "";

  const checks = [];
  allDocs.forEach(doc => {
    const data = doc.data();
    collectImageUrls(data).forEach(url => {
      checks.push({ postId: doc.id, title: data.title, url });
    });
  });

  const results = await Promise.all(
    checks.map(c => checkImageUrl(c.url).then(ok => ({ ...c, ok })))
  );

  const brokenByPost = {};
  results.filter(r => !r.ok).forEach(r => {
    if (!brokenByPost[r.postId]) brokenByPost[r.postId] = { title: r.title, count: 0 };
    brokenByPost[r.postId].count++;
  });

  btn.disabled = false;
  btn.textContent = "🔍 Check for broken images";

  const brokenPosts = Object.entries(brokenByPost);

  if (brokenPosts.length === 0) {
    resultsEl.innerHTML = `<p class="image-check-ok">✅ No broken images found — everything looks good.</p>`;
    return;
  }

  resultsEl.innerHTML = `
    <p class="image-check-summary">${brokenPosts.length} post${brokenPosts.length === 1 ? " has" : "s have"} broken images:</p>
    ${brokenPosts.map(([postId, info]) => `
      <div class="image-check-row">
        <span>${escapeHtml(info.title)} — ${info.count} broken image${info.count === 1 ? "" : "s"}</span>
        <a href="/editor?id=${encodeURIComponent(postId)}" class="btn small ghost">Fix</a>
      </div>
    `).join("")}
  `;
}

window.checkBrokenImages = checkBrokenImages;