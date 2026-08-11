renderNav("blog", { onDark: true });

// ===== GET BLOG ID =====
const blogId = decodeURI(location.pathname.split("/").pop());
let postAuthorId = null;

// ===== ELEMENTS =====
const banner = document.querySelector(".banner");
const titleEl = document.querySelector(".title");
const publishEl = document.querySelector(".published");
const articleEl = document.querySelector(".article");

// ===== FETCH BLOG =====
db.collection("blogs").doc(blogId).get()
  .then(async doc => {
    if (!doc.exists) {
      location.href = "/";
      return;
    }

    const data = doc.data();
    postAuthorId = data.authorId || null;

    // Drafts and not-yet-live scheduled posts are only visible to their
    // author or an admin — everyone else is redirected away, same as a
    // post that doesn't exist.
    if (data.status === "draft" || data.status === "scheduled") {
      const user = await new Promise(resolve => {
        const unsub = auth.onAuthStateChanged(u => { unsub(); resolve(u); });
      });
      const allowed = user && (data.authorId === user.uid || (typeof isAdmin === "function" && isAdmin(user)));
      if (!allowed) {
        location.href = "/";
        return;
      }
    }

    // ===== SET TITLE =====
    titleEl.innerText = data.title;
    document.title = `Blog : ${data.title}`;

    // ===== BREADCRUMBS =====
    const breadcrumbsEl = document.getElementById("breadcrumbs");
    if (breadcrumbsEl) {
      const parts = [`<a href="/">Home</a>`];
      if (data.category) {
        parts.push(`<a href="/blogs?category=${encodeURIComponent(data.category)}">${escapeHtml(data.category)}</a>`);
      }
      parts.push(`<span aria-current="page">${escapeHtml(data.title.length > 40 ? data.title.slice(0, 40) + "…" : data.title)}</span>`);
      breadcrumbsEl.innerHTML = parts.join(`<span class="crumb-sep">/</span>`);
    }

    // ===== TEXT DIRECTION (RTL support for Urdu/Arabic/etc.) =====
    const dir = data.direction || detectTextDirection(data.title + " " + getArticlePlainText(data));
    document.querySelector(".blog").setAttribute("dir", dir);

    // ===== CATEGORY BADGE =====
    if (data.category) {
      const badge = document.createElement("span");
      badge.className = "article-category";
      badge.textContent = data.category;
      titleEl.parentNode.insertBefore(badge, titleEl);
    }
    if (data.status === "draft") {
      const draftBadge = document.createElement("span");
      draftBadge.className = "article-category draft";
      draftBadge.textContent = "Draft — only visible to you";
      titleEl.parentNode.insertBefore(draftBadge, titleEl);
    }

    // ===== SET DATE / AUTHOR =====
    publishEl.innerHTML = buildPublishedLine(data);

    // ===== BANNER =====
    const bannerURL = optimizeImage(data.bannerImage);
    banner.querySelector(".banner-bg").style.backgroundImage = `url('${bannerURL}')`;
    banner.querySelector(".banner-fg").style.backgroundImage = `url('${bannerURL}')`;

    // ===== META DESCRIPTION =====
    const meta = document.createElement("meta");
    meta.name = "description";
    meta.content = data.article.substring(0, 150);
    document.head.appendChild(meta);

    // ===== RENDER ARTICLE =====
    if (data.contentFormat === "html") {
      articleEl.innerHTML = DOMPurify.sanitize(data.article || "", {
        ALLOWED_TAGS: ["h1", "h2", "h3", "p", "b", "strong", "i", "em", "ul", "ol", "li", "img", "br", "a", "blockquote", "table", "thead", "tbody", "tr", "th", "td"],
        ALLOWED_ATTR: ["src", "alt", "class", "href", "target", "rel"]
      });
    } else {
      // Older post written in the previous markdown-lite format.
      renderArticle(data.article);
    }

    // ===== GROUP CONSECUTIVE IMAGES INTO A GRID =====
    // (4-across on desktop, 2-across on mobile — see .article-image-grid)
    groupArticleImages(articleEl);

    // ===== TABLE OF CONTENTS =====
    // Only worth showing for longer posts with a few headings — skip it
    // entirely for short articles where it wouldn't add anything.
    buildTableOfContents();

    // ===== INCREASE VIEW COUNT (best effort, non-blocking) =====
    db.collection("blogs").doc(blogId).update({
      views: firebase.firestore.FieldValue.increment(1)
    }).catch(() => {});

    // ===== LIKES =====
    initLikeButton(data.likes || 0);

    // ===== COMMENTS =====
    initComments();

    // ===== RELATED BLOGS =====
    loadRelatedBlogs();

    // ===== WHATSAPP SHARE =====
    const wa = document.getElementById("waShare");
    if (wa) {
      wa.href = `https://wa.me/?text=${encodeURIComponent(data.title + " - " + location.href)}`;
    }
  })
  .catch(err => {
    console.error(err);
    toast("Error loading blog", "error");
  });

// ===== PUBLISHED LINE (author · date · time) =====
function buildPublishedLine(data) {
  const parts = [];

  if (data.authorName) {
    const name = escapeHtml(data.authorName);
    parts.push(data.authorId ? `<a href="/author/${data.authorId}" class="author-link">${name}</a>` : `<span>${name}</span>`);
  }

  let when = data.publishedAt || "";
  if (data.publishedTime) when += ` at ${data.publishedTime}`;
  if (when) parts.push(when);

  const readingTime = estimateReadingTime(data.article);
  if (readingTime) parts.push(readingTime);

  return parts.length ? parts.join(" &nbsp;·&nbsp; ") : "";
}

// Rough estimate at ~200 words/minute, based on the plain text content
// (strips HTML tags for HTML-format posts; legacy posts are plain text
// already).
function estimateReadingTime(article) {
  if (!article) return "";

  const text = article.includes("<") ? htmlToTextShared(article) : article;
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  if (words === 0) return "";

  const minutes = Math.max(1, Math.round(words / 200));
  return `${minutes} min read`;
}

function escapeHtml(str) {
  return String(str).replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// ===== IMAGE OPTIMIZER =====
function optimizeImage(url) {
  if (!url || !url.includes("/upload/")) return url;
  return url.replace("/upload/", "/upload/w_1200,h_600,c_fill,g_auto,f_auto,q_auto/");
}

// ===== GROUP CONSECUTIVE IMAGES INTO A GRID =====
// Walks the top-level children of the article, finds runs of blocks that
// contain *only* an image (either a bare <img>, or a <p> wrapping just
// one), and wraps each run of 2+ into a `.article-image-grid` div so
// they lay out side by side instead of one-per-line.
function groupArticleImages(container) {
  const children = Array.from(container.children);
  let i = 0;

  while (i < children.length) {
    if (!isImageOnlyBlock(children[i])) {
      i++;
      continue;
    }

    const run = [children[i]];
    let j = i + 1;
    while (j < children.length && isImageOnlyBlock(children[j])) {
      run.push(children[j]);
      j++;
    }

    if (run.length > 1) {
      const grid = document.createElement("div");
      grid.className = "article-image-grid";
      run[0].parentNode.insertBefore(grid, run[0]);

      run.forEach(block => {
        const img = block.matches("img") ? block : block.querySelector("img");
        if (img) grid.appendChild(img);
        block.remove();
      });
    }

    i = j;
  }
}

function isImageOnlyBlock(el) {
  if (el.matches("img.article-image")) return true;
  if (el.children.length !== 1) return false;
  if (!el.children[0].matches("img.article-image")) return false;
  return el.textContent.trim() === "";
}

// ===== TEXT FORMATTER (used only for legacy markdown-lite posts) =====
function formatText(text) {
  // escape HTML (basic safety)
  text = text.replace(/</g, "&lt;").replace(/>/g, "&gt;");

  // bold
  text = text.replace(/\*\*(.*?)\*\*/g, "<b>$1</b>");

  // italic
  text = text.replace(/\*(.*?)\*/g, "<i>$1</i>");

  return text;
}

// ===== ARTICLE RENDER (legacy markdown-lite format only) =====
function renderArticle(text) {
  const lines = text.split("\n").filter(line => line.trim());

  articleEl.innerHTML = "";

  lines.forEach(line => {
    // ===== HEADINGS =====
    if (line.startsWith("#")) {
      const level = Math.min(line.match(/^#+/)[0].length, 3);
      const content = line.replace(/^#+/, "").trim();

      articleEl.innerHTML += `<h${level}>${formatText(content)}</h${level}>`;
    }
    // ===== IMAGE =====
    else if (line.startsWith("![")) {
      const match = line.match(/!\[(.*?)\]\((.*?)\)/);

      if (match) {
        const imgURL = optimizeImage(match[2]);
        articleEl.innerHTML += `<img src="${imgURL}" class="article-image" alt="${match[1]}" loading="lazy">`;
      }
    }
    // ===== PARAGRAPH =====
    else {
      articleEl.innerHTML += `<p>${formatText(line)}</p>`;
    }
  });
}

// ===== SHARE BUTTON =====
function shareBlog() {
  if (navigator.share) {
    navigator.share({ title: document.title, url: location.href }).catch(() => {});
  } else {
    navigator.clipboard?.writeText(location.href);
    toast("Link copied to clipboard!", "success");
  }
}

window.shareBlog = shareBlog;

// ===== LIKES =====
// Anyone can like/unlike (no login needed) — tracked per-browser via
// localStorage so the same visitor can't rack up unlimited likes.
function initLikeButton(likeCount) {
  const likeBtn = document.getElementById("likeBtn");
  const likeCountEl = document.getElementById("likeCount");
  if (!likeBtn || !likeCountEl) return;

  likeCountEl.textContent = likeCount;

  if (localStorage.getItem(likeKey()) === "1") {
    likeBtn.classList.add("liked");
  }
}

function likeKey() {
  return `liked_${blogId}`;
}

async function toggleLike() {
  const likeBtn = document.getElementById("likeBtn");
  const likeCountEl = document.getElementById("likeCount");
  if (!likeBtn || !likeCountEl) return;

  const alreadyLiked = localStorage.getItem(likeKey()) === "1";
  const delta = alreadyLiked ? -1 : 1;

  likeBtn.disabled = true;

  try {
    await db.collection("blogs").doc(blogId).update({
      likes: firebase.firestore.FieldValue.increment(delta)
    });

    if (alreadyLiked) {
      localStorage.removeItem(likeKey());
      likeBtn.classList.remove("liked");
    } else {
      localStorage.setItem(likeKey(), "1");
      likeBtn.classList.add("liked");
    }

    likeCountEl.textContent = Math.max(0, Number(likeCountEl.textContent) + delta);
  } catch (err) {
    console.error(err);
    toast("Could not update like. Please try again.", "error");
  } finally {
    likeBtn.disabled = false;
  }
}

window.toggleLike = toggleLike;

// ===== COMMENTS =====
// Reading comments is public; posting one requires being signed in
// (reduces spam and lets people delete their own comments later).
let lastCommentsSnapshot = null;

function initComments() {
  renderCommentForm(auth.currentUser);

  auth.onAuthStateChanged(user => {
    renderCommentForm(user);
    if (lastCommentsSnapshot) renderComments(lastCommentsSnapshot);
  });

  db.collection("blogs").doc(blogId).collection("comments")
    .orderBy("createdAt", "desc")
    .onSnapshot(
      snapshot => {
        lastCommentsSnapshot = snapshot;
        renderComments(snapshot);
      },
      err => {
        console.error(err);
        const list = document.getElementById("commentsList");
        if (list) list.innerHTML = `<p class="empty-state">Could not load comments.</p>`;
      }
    );
}

function renderCommentForm(user) {
  const wrap = document.getElementById("commentFormWrap");
  if (!wrap) return;

  if (!user) {
    wrap.innerHTML = `<p class="comment-login-prompt">Please <a href="/login">log in</a> to leave a comment.</p>`;
    return;
  }

  wrap.innerHTML = `
    <form id="commentForm" class="comment-form">
      <textarea id="commentText" placeholder="Share your thoughts..." maxlength="2000" required></textarea>
      <button type="submit" class="btn accent" id="commentSubmit">Post comment</button>
    </form>
  `;

  const textEl = document.getElementById("commentText");
  textEl.addEventListener("input", () => textEl.setAttribute("dir", detectTextDirection(textEl.value)));

  document.getElementById("commentForm").addEventListener("submit", submitComment);
}

async function submitComment(e) {
  e.preventDefault();

  const textEl = document.getElementById("commentText");
  const submitBtn = document.getElementById("commentSubmit");
  const text = textEl.value.trim();

  if (!text) return;

  submitBtn.disabled = true;

  try {
    await postComment(text, null);
    textEl.value = "";
  } catch (err) {
    console.error(err);
    toast("Could not post comment. Please try again.", "error");
  } finally {
    submitBtn.disabled = false;
  }
}

function postComment(text, parentId) {
  const payload = {
    text,
    authorId: auth.currentUser.uid,
    authorName: auth.currentUser.displayName || auth.currentUser.email.split("@")[0],
    createdAt: firebase.firestore.FieldValue.serverTimestamp()
  };
  if (parentId) payload.parentId = parentId;

  return db.collection("blogs").doc(blogId).collection("comments").add(payload).then(ref => {
    // Best-effort — let the post's author know, without blocking on it.
    fetch("/api/notify-comment", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ blogId, commenterName: payload.authorName, commentText: text })
    }).catch(() => {});

    return ref;
  });
}

// ===== REPLIES =====
// One level of nesting only (a reply can't itself be replied to) —
// keeps the thread readable instead of turning into an indent staircase.
function showReplyForm(commentId) {
  const wrap = document.getElementById(`replyForm-${commentId}`);
  if (!wrap) return;

  if (!auth.currentUser) {
    wrap.innerHTML = `<p class="comment-login-prompt">Please <a href="/login">log in</a> to reply.</p>`;
    wrap.style.display = "block";
    return;
  }

  wrap.style.display = wrap.style.display === "block" ? "none" : "block";
  if (wrap.style.display !== "block") return;

  wrap.innerHTML = `
    <form class="comment-form reply-form" onsubmit="submitReply(event, '${commentId}')">
      <textarea placeholder="Write a reply..." maxlength="2000" required></textarea>
      <button type="submit" class="btn accent small">Reply</button>
    </form>
  `;
  const replyTextarea = wrap.querySelector("textarea");
  replyTextarea.addEventListener("input", () => replyTextarea.setAttribute("dir", detectTextDirection(replyTextarea.value)));
  replyTextarea.focus();
}

async function submitReply(e, parentId) {
  e.preventDefault();

  const form = e.target;
  const textarea = form.querySelector("textarea");
  const btn = form.querySelector("button");
  const text = textarea.value.trim();
  if (!text) return;

  btn.disabled = true;

  try {
    await postComment(text, parentId);
    document.getElementById(`replyForm-${parentId}`).style.display = "none";
  } catch (err) {
    console.error(err);
    toast("Could not post reply. Please try again.", "error");
  } finally {
    btn.disabled = false;
  }
}

window.showReplyForm = showReplyForm;
window.submitReply = submitReply;

function renderComments(snapshot) {
  const countEl = document.getElementById("commentCount");
  const list = document.getElementById("commentsList");
  if (!list) return;

  if (countEl) countEl.textContent = snapshot.size;

  if (snapshot.empty) {
    list.innerHTML = `<p class="empty-state">No comments yet. Be the first to say something.</p>`;
    return;
  }

  const currentUid = auth.currentUser?.uid;
  const admin = typeof isAdmin === "function" && isAdmin(auth.currentUser);
  const canModerate = !!currentUid && (currentUid === postAuthorId || admin);

  const all = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
  const topLevel = all.filter(c => !c.parentId);
  const repliesByParent = {};
  all.filter(c => c.parentId).forEach(c => {
    (repliesByParent[c.parentId] = repliesByParent[c.parentId] || []).push(c);
  });
  // Replies read most naturally oldest-first within a thread.
  Object.values(repliesByParent).forEach(list => list.sort((a, b) => getSortTime(a) - getSortTime(b)));

  function commentHTML(c, isReply) {
    const canDelete = currentUid && (c.authorId === currentUid || canModerate);
    const canReport = currentUid && c.authorId !== currentUid && !canModerate;
    const when = c.createdAt?.toDate ? formatCommentDate(c.createdAt.toDate()) : "just now";
    const alreadyReported = localStorage.getItem(`reported_${c.id}`) === "1";

    return `
      <div class="comment-item ${isReply ? "comment-reply" : ""}">
        <div class="comment-head">
          <span class="comment-author">${escapeHtml(c.authorName || "Anonymous")}</span>
          <span class="comment-date">${when}</span>
          ${canModerate && c.reportCount > 0 ? `<span class="comment-reported-badge">⚠️ Reported (${c.reportCount})</span>` : ""}
        </div>
        <p class="comment-text" dir="${detectTextDirection(c.text)}">${escapeHtml(c.text)}</p>
        <div class="comment-actions">
          ${!isReply ? `<button class="comment-reply-btn" onclick="showReplyForm('${c.id}')">Reply</button>` : ""}
          ${canReport ? `<button class="comment-report-btn" onclick="reportComment('${c.id}')" ${alreadyReported ? "disabled" : ""}>${alreadyReported ? "Reported" : "Report"}</button>` : ""}
          ${canDelete ? `<button class="comment-delete" onclick="deleteComment('${c.id}')">Delete</button>` : ""}
        </div>
        ${!isReply ? `<div class="reply-form-wrap" id="replyForm-${c.id}" style="display:none"></div>` : ""}
      </div>
    `;
  }

  list.innerHTML = topLevel.map(c => {
    const replies = (repliesByParent[c.id] || []).map(r => commentHTML(r, true)).join("");
    return commentHTML(c, false) + (replies ? `<div class="comment-replies">${replies}</div>` : "");
  }).join("");
}

// getSortTime lives in blog-cards.js — reused here for reply ordering.

async function deleteComment(commentId) {
  if (!(await showConfirm("Delete this comment?"))) return;

  try {
    await db.collection("blogs").doc(blogId).collection("comments").doc(commentId).delete();
  } catch (err) {
    console.error(err);
    toast("Could not delete this comment. Please try again.", "error");
  }
}

window.deleteComment = deleteComment;

// Anyone signed in (other than the comment's own author) can flag a
// comment — tracked per-browser so the same person can't spam-report.
// The post's author/admin then sees a "Reported" badge right on the
// comment and can delete it from there.
async function reportComment(commentId) {
  if (localStorage.getItem(`reported_${commentId}`) === "1") return;

  try {
    await db.collection("blogs").doc(blogId).collection("comments").doc(commentId).update({
      reportCount: firebase.firestore.FieldValue.increment(1)
    });
    localStorage.setItem(`reported_${commentId}`, "1");
  } catch (err) {
    console.error(err);
    toast("Could not report this comment. Please try again.", "error");
  }
}

window.reportComment = reportComment;

function formatCommentDate(date) {
  return `${date.toLocaleDateString()} at ${date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
}

// ===== RELATED BLOGS ("You may also like") =====
function loadRelatedBlogs() {
  const wrap = document.getElementById("relatedSection");
  if (!wrap) return;

  db.collection("blogs").get()
    .then(res => {
      const picks = sortDocsByRecency(res.docs)
        .filter(doc => doc.id !== blogId && isPublished(doc.data()))
        .slice(0, 8);

      if (picks.length === 0) return; // nothing else published yet

      wrap.innerHTML = `
        <div class="related-heading">
          <div>
            <span class="eyebrow">Keep reading</span>
            <h3>You may also like</h3>
          </div>
          <div class="related-nav">
            <button class="related-arrow" id="relatedPrev" aria-label="Previous">
              <i class="fa-solid fa-chevron-left"></i>
            </button>
            <button class="related-arrow" id="relatedNext" aria-label="Next">
              <i class="fa-solid fa-chevron-right"></i>
            </button>
          </div>
        </div>
        <div class="related-track" id="relatedTrack">
          ${picks.map(doc => blogCardHTML(doc.id, doc.data())).join("")}
        </div>
      `;

      document.getElementById("relatedPrev").addEventListener("click", () => scrollRelated(-1));
      document.getElementById("relatedNext").addEventListener("click", () => scrollRelated(1));

      observeReveals();
    })
    .catch(err => console.error(err));
}

function scrollRelated(direction) {
  const track = document.getElementById("relatedTrack");
  if (!track) return;

  const card = track.querySelector(".blog-card");
  const gap = 20; // matches .related-track gap
  const amount = card ? card.getBoundingClientRect().width + gap : 300;

  track.scrollBy({ left: amount * direction, behavior: "smooth" });
}

// ===== TABLE OF CONTENTS =====
function buildTableOfContents() {
  const toc = document.getElementById("toc");
  const tocList = document.getElementById("tocList");
  if (!toc || !tocList) return;

  const headings = articleEl.querySelectorAll("h1, h2, h3");
  if (headings.length < 3) return; // not worth it for short posts

  const items = [];

  headings.forEach((h, i) => {
    const id = `heading-${i}`;
    h.id = id;
    items.push(`
      <li class="${h.tagName === "H3" ? "toc-h3" : ""}">
        <a href="#${id}">${escapeHtml(h.textContent)}</a>
      </li>
    `);
  });

  tocList.innerHTML = items.join("");
  toc.style.display = "block";

  document.getElementById("tocToggle").addEventListener("click", () => {
    toc.classList.toggle("collapsed");
  });
}