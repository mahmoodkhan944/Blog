// ===== SHARED BLOG CARD RENDERING =====
// Used by home.js (featured + latest 8) and blogs.js (all posts) so every
// page renders identical cards without duplicating markup/logic.

function blogCardHTML(id, data) {
  return `
    <article class="blog-card reveal">
      <a href="/${id}" class="blog-image-wrap">
        <img src="${data.bannerImage}" class="blog-image" alt="${escapeHtmlShared(data.title)}" loading="lazy">
      </a>
      <h2 class="blog-title"><a href="/${id}">${escapeHtmlShared(data.title)}</a></h2>
      <p class="blog-meta">${buildCardMeta(data)}</p>
      <p class="blog-overview">${escapeHtmlShared(htmlToTextShared(data.article).substring(0, 80))}...</p>
      <a href="/${id}" class="btn dark small">Read</a>
    </article>
  `;
}

function featuredCardHTML(id, data) {
  return `
    <article class="featured-card reveal">
      <a href="/${id}" class="featured-image-wrap">
        <img src="${data.bannerImage}" class="featured-image" alt="${escapeHtmlShared(data.title)}" loading="lazy">
      </a>
      <div class="featured-body">
        <span class="eyebrow">Latest story</span>
        <h2 class="featured-title"><a href="/${id}">${escapeHtmlShared(data.title)}</a></h2>
        <p class="featured-meta">${buildCardMeta(data)}</p>
        <p class="featured-overview">${escapeHtmlShared(htmlToTextShared(data.article).substring(0, 220))}...</p>
        <a href="/${id}" class="btn accent">Read story</a>
      </div>
    </article>
  `;
}

function buildCardMeta(data) {
  const parts = [];

  if (data.authorName) parts.push(escapeHtmlShared(data.authorName));

  let when = data.publishedAt || "";
  if (data.publishedTime) when += ` at ${data.publishedTime}`;
  if (when) parts.push(when);

  return parts.join(" &nbsp;·&nbsp; ");
}

function escapeHtmlShared(str) {
  return String(str).replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// Strips HTML tags for card previews (safe: DOMParser output is never
// re-inserted into the live page, only its plain text is read).
function htmlToTextShared(html) {
  const doc = new DOMParser().parseFromString(html || "", "text/html");
  return doc.body.textContent || "";
}

// ===== RECENCY SORTING =====
// Firestore's orderBy("publishedAt", "desc") only sorted by DATE, not
// time — so two posts published on the same day could come back in the
// wrong order. `createdAt` (a real Firestore server timestamp, set once
// when a post is first published) is the correct source of truth.
//
// Older posts written before `createdAt` existed fall back to parsing
// their display date/time strings as a best-effort approximation.
function getSortTime(data) {
  if (data.createdAt && typeof data.createdAt.toMillis === "function") {
    return data.createdAt.toMillis();
  }

  if (data.publishedAt) {
    const stamp = data.publishedTime ? `${data.publishedAt} ${data.publishedTime}` : data.publishedAt;
    const parsed = Date.parse(stamp);
    if (!Number.isNaN(parsed)) return parsed;
  }

  return 0;
}

// Sorts an array of Firestore QueryDocumentSnapshots newest-first.
function sortDocsByRecency(docs) {
  return docs.slice().sort((a, b) => getSortTime(b.data()) - getSortTime(a.data()));
}

// Fades/slides in elements with class="reveal" as they scroll into view.
function observeReveals() {
  const items = document.querySelectorAll(".reveal:not(.in-view)");

  if (!("IntersectionObserver" in window)) {
    items.forEach(el => el.classList.add("in-view"));
    return;
  }

  const io = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add("in-view");
        io.unobserve(entry.target);
      }
    });
  }, { threshold: 0.15 });

  items.forEach(el => io.observe(el));
}