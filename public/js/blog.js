renderNav("blog", { onDark: true });

// ===== GET BLOG ID =====
const blogId = decodeURI(location.pathname.split("/").pop());

// ===== ELEMENTS =====
const banner = document.querySelector(".banner");
const titleEl = document.querySelector(".title");
const publishEl = document.querySelector(".published");
const articleEl = document.querySelector(".article");

// ===== FETCH BLOG =====
db.collection("blogs").doc(blogId).get()
  .then(doc => {
    if (!doc.exists) {
      location.href = "/";
      return;
    }

    const data = doc.data();

    // ===== SET TITLE =====
    titleEl.innerText = data.title;
    document.title = `Blog : ${data.title}`;

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
        ALLOWED_TAGS: ["h1", "h2", "h3", "p", "b", "strong", "i", "em", "ul", "ol", "li", "img", "br"],
        ALLOWED_ATTR: ["src", "alt", "class"]
      });
    } else {
      // Older post written in the previous markdown-lite format.
      renderArticle(data.article);
    }

    // ===== GROUP CONSECUTIVE IMAGES INTO A GRID =====
    // (4-across on desktop, 2-across on mobile — see .article-image-grid)
    groupArticleImages(articleEl);

    // ===== INCREASE VIEW COUNT (best effort, non-blocking) =====
    db.collection("blogs").doc(blogId).update({
      views: firebase.firestore.FieldValue.increment(1)
    }).catch(() => {});

    // ===== LIKES =====
    initLikeButton(data.likes || 0);

    // ===== COMMENTS =====
    initComments();

    // ===== WHATSAPP SHARE =====
    const wa = document.getElementById("waShare");
    if (wa) {
      wa.href = `https://wa.me/?text=${encodeURIComponent(data.title + " - " + location.href)}`;
    }
  })
  .catch(err => {
    console.error(err);
    alert("Error loading blog");
  });

// ===== PUBLISHED LINE (author · date · time) =====
function buildPublishedLine(data) {
  const parts = [];

  if (data.authorName) {
    parts.push(`<span>${escapeHtml(data.authorName)}</span>`);
  }

  let when = data.publishedAt || "";
  if (data.publishedTime) when += ` at ${data.publishedTime}`;
  if (when) parts.push(when);

  return parts.length ? parts.join(" &nbsp;·&nbsp; ") : "";
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
    alert("Link copied to clipboard!");
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
    alert("Could not update like. Please try again.");
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
    await db.collection("blogs").doc(blogId).collection("comments").add({
      text,
      authorId: auth.currentUser.uid,
      authorName: auth.currentUser.displayName || auth.currentUser.email.split("@")[0],
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    textEl.value = "";
  } catch (err) {
    console.error(err);
    alert("Could not post comment. Please try again.");
  } finally {
    submitBtn.disabled = false;
  }
}

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

  list.innerHTML = snapshot.docs.map(doc => {
    const c = doc.data();
    const canDelete = currentUid && (c.authorId === currentUid || admin);
    const when = c.createdAt?.toDate ? formatCommentDate(c.createdAt.toDate()) : "just now";

    return `
      <div class="comment-item">
        <div class="comment-head">
          <span class="comment-author">${escapeHtml(c.authorName || "Anonymous")}</span>
          <span class="comment-date">${when}</span>
        </div>
        <p class="comment-text">${escapeHtml(c.text)}</p>
        ${canDelete ? `<button class="comment-delete" onclick="deleteComment('${doc.id}')">Delete</button>` : ""}
      </div>
    `;
  }).join("");
}

async function deleteComment(commentId) {
  if (!confirm("Delete this comment?")) return;

  try {
    await db.collection("blogs").doc(blogId).collection("comments").doc(commentId).delete();
  } catch (err) {
    console.error(err);
    alert("Could not delete this comment. Please try again.");
  }
}

window.deleteComment = deleteComment;

function formatCommentDate(date) {
  return `${date.toLocaleDateString()} at ${date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
}