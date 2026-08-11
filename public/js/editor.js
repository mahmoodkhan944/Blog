renderNav("editor");
requireAuth();

// Tags/attributes allowed in saved article HTML — kept tight since this
// content is rendered to every visitor of the blog.
const ARTICLE_ALLOWED_TAGS = ["h1", "h2", "h3", "p", "b", "strong", "i", "em", "ul", "ol", "li", "img", "br", "a", "blockquote"];
const ARTICLE_ALLOWED_ATTR = ["src", "alt", "class", "href", "target", "rel"];

let bannerPath = "";
let editId = null;
let currentUser = null;
let initialized = false;
let existingData = null;
let savedImageRange = null; // only used to survive the file-picker dialog

document.addEventListener("DOMContentLoaded", () => {
  document.execCommand("defaultParagraphSeparator", false, "p");
  populateCategorySelect();

  auth.onAuthStateChanged(user => {
    if (!user || initialized) return; // requireAuth() handles the redirect
    initialized = true;
    currentUser = user;
    init();
  });
});

function populateCategorySelect() {
  const select = document.querySelector("#categorySelect");
  if (!select) return;
  select.innerHTML = BLOG_CATEGORIES.map(c => `<option value="${c}">${c}</option>`).join("");
}

async function init() {
  const params = new URLSearchParams(location.search);
  editId = params.get("id");

  if (editId) {
    const canEdit = await loadForEdit(editId);
    if (!canEdit) return; // already redirected away
  }

  checkForAutosave();

  document.querySelector(".title").addEventListener("input", scheduleAutosave);
  document.querySelector(".article").addEventListener("input", scheduleAutosave);

  document.querySelector(".publish-btn").addEventListener("click", () => save("published"));
  document.querySelector(".draft-btn").addEventListener("click", () => save("draft"));

  const bannerUpload = document.querySelector("#banner-upload");
  if (bannerUpload) bannerUpload.addEventListener("change", handleBannerUpload);

  const imageUpload = document.querySelector("#image-upload");
  if (imageUpload) imageUpload.addEventListener("change", handleArticleImageUpload);
}

// ===== AUTO-SAVE (local browser only — recovers from a closed tab or
// crash, does NOT save anything to the server/Firestore) =====
function autosaveKey() {
  return `editor_autosave_${editId || "new"}`;
}

let autosaveTimer = null;

function scheduleAutosave() {
  clearTimeout(autosaveTimer);
  autosaveTimer = setTimeout(saveToLocal, 1500);
}

function saveToLocal() {
  const title = document.querySelector(".title").value;
  const articleHTML = document.querySelector(".article").innerHTML;
  const category = document.querySelector("#categorySelect")?.value;

  // Nothing worth saving yet.
  if (!title.trim() && !document.querySelector(".article").innerText.trim()) return;

  try {
    localStorage.setItem(autosaveKey(), JSON.stringify({ title, articleHTML, category, savedAt: Date.now() }));
    const status = document.querySelector("#autosaveStatus");
    if (status) status.textContent = `Saved locally at ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
  } catch {
    // localStorage full/unavailable — silently skip, not critical.
  }
}

function clearAutosave() {
  try {
    localStorage.removeItem(autosaveKey());
  } catch {}
}

function checkForAutosave() {
  let saved;
  try {
    saved = JSON.parse(localStorage.getItem(autosaveKey()));
  } catch {
    saved = null;
  }
  if (!saved) return;

  const banner = document.querySelector("#autosaveBanner");
  if (!banner) return;

  const when = new Date(saved.savedAt).toLocaleString();
  banner.style.display = "flex";
  banner.innerHTML = `
    <span>We found unsaved changes from ${when}.</span>
    <span class="autosave-banner-actions">
      <button class="btn small accent" id="autosaveRestore">Restore</button>
      <button class="btn small ghost" id="autosaveDiscard">Discard</button>
    </span>
  `;

  document.querySelector("#autosaveRestore").addEventListener("click", () => {
    document.querySelector(".title").value = saved.title || "";
    document.querySelector(".article").innerHTML = DOMPurify.sanitize(saved.articleHTML || "", {
      ALLOWED_TAGS: ARTICLE_ALLOWED_TAGS,
      ALLOWED_ATTR: ARTICLE_ALLOWED_ATTR
    });
    const categorySelect = document.querySelector("#categorySelect");
    if (categorySelect && saved.category) categorySelect.value = saved.category;
    banner.style.display = "none";
  });

  document.querySelector("#autosaveDiscard").addEventListener("click", () => {
    clearAutosave();
    banner.style.display = "none";
  });
}

// Returns true if the current user is allowed to edit this post
// (the original author, or an admin) and the form was populated.
async function loadForEdit(id) {
  try {
    const doc = await db.collection("blogs").doc(id).get();

    if (!doc.exists) {
      alert("This blog doesn't exist.");
      location.href = "/dashboard";
      return false;
    }

    const data = doc.data();
    const isOwner = data.authorId === currentUser.uid;

    if (!isOwner && !isAdmin(currentUser)) {
      alert("You don't have permission to edit this blog.");
      location.href = "/dashboard";
      return false;
    }

    existingData = data;

    document.querySelector(".title").value = data.title || "";

    const categorySelect = document.querySelector("#categorySelect");
    if (categorySelect && data.category) categorySelect.value = data.category;

    const articleField = document.querySelector(".article");
    if (data.contentFormat === "html") {
      // Already in the new WYSIWYG format — load it in directly.
      articleField.innerHTML = DOMPurify.sanitize(data.article || "", {
        ALLOWED_TAGS: ARTICLE_ALLOWED_TAGS,
        ALLOWED_ATTR: ARTICLE_ALLOWED_ATTR
      });
    } else {
      // Older post written in the previous markdown-lite format — load
      // it as plain text so nothing is lost. Saving again will upgrade
      // it to the new format.
      articleField.innerText = data.article || "";
    }

    bannerPath = data.bannerImage || "";
    if (bannerPath) {
      setBannerImage(document.querySelector(".banner"), bannerPath);
    }

    document.querySelector(".publish-btn").textContent = data.status === "draft" ? "Publish" : "Update";
    document.title = "Blog : Editing " + data.title;
    return true;
  } catch (err) {
    console.error(err);
    alert("Could not load this blog for editing.");
    location.href = "/dashboard";
    return false;
  }
}

// ===== SELECTION HANDLING =====
// Toolbar buttons use onmousedown="event.preventDefault()" (see
// editor.html), which stops them from ever stealing focus/selection away
// from the article — so bold/italic/heading/list/clear just act on
// whatever is currently selected, no manual save/restore needed.
//
// The ONE place selection genuinely needs to survive a focus change is
// opening the native file-picker dialog for inline images — so we
// capture it fresh right before that, and restore it right before
// inserting the image.
function captureImageInsertPoint() {
  const articleField = document.querySelector(".article");
  const sel = window.getSelection();

  if (sel.rangeCount > 0 && articleField.contains(sel.anchorNode)) {
    savedImageRange = sel.getRangeAt(0).cloneRange();
  } else {
    savedImageRange = null;
  }
}

function triggerImageUpload() {
  captureImageInsertPoint();
  document.getElementById("image-upload").click();
}

window.triggerImageUpload = triggerImageUpload;

// ===== BANNER UPLOAD =====
function setBannerImage(banner, url) {
  banner.querySelector(".banner-bg").style.backgroundImage = `url('${url}')`;
  banner.querySelector(".banner-fg").style.backgroundImage = `url('${url}')`;
  banner.querySelector("span")?.remove();
}

function previewBanner(file) {
  const reader = new FileReader();
  reader.onload = () => {
    setBannerImage(document.querySelector(".banner"), reader.result);
  };
  reader.readAsDataURL(file);
}

async function handleBannerUpload() {
  const input = document.querySelector("#banner-upload");
  const file = input.files[0];
  if (!file) return;

  if (!file.type.startsWith("image")) {
    alert("Only image files are allowed");
    return;
  }

  previewBanner(file);

  try {
    const { url } = await uploadFile(file);
    bannerPath = url;
  } catch (err) {
    console.error(err);
    alert(err.message || "Banner upload failed. Please try again.");
  }
}

// ===== ARTICLE IMAGE UPLOAD =====
async function handleArticleImageUpload() {
  const input = document.querySelector("#image-upload");
  const file = input.files[0];
  if (!file) return;

  if (!file.type.startsWith("image")) {
    alert("Only image files are allowed");
    return;
  }

  try {
    const { url } = await uploadFile(file);
    insertImage(url, file.name);
  } catch (err) {
    console.error(err);
    alert(err.message || "Image upload failed. Please try again.");
  }
}

function insertImage(url, alt) {
  const articleField = document.querySelector(".article");
  articleField.focus();

  if (savedImageRange) {
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(savedImageRange);
  }

  const safeAlt = String(alt).replace(/"/g, "&quot;");
  document.execCommand("insertHTML", false, `<img src="${url}" alt="${safeAlt}" class="article-image">`);
}

// ===== TOOLBAR (WYSIWYG) =====
// These act on whatever is currently selected in the article — the
// buttons' onmousedown="event.preventDefault()" (see editor.html) is
// what keeps that selection intact when a button is clicked.
function openBannerUpload() {
  document.getElementById("banner-upload").click();
}

function undoEdit() {
  document.execCommand("undo");
}

function redoEdit() {
  document.execCommand("redo");
}

function addHeading() {
  // Toggle: if the current block is already a heading, switch it back
  // to a plain paragraph instead of just re-applying <h2> every time.
  const current = (document.queryCommandValue("formatBlock") || "").toLowerCase().replace(/[<>]/g, "");
  const isHeading = /^h[1-6]$/.test(current);
  document.execCommand("formatBlock", false, isHeading ? "<p>" : "<h2>");
}

function addBold() {
  document.execCommand("bold");
}

function addItalic() {
  document.execCommand("italic");
}

function addList() {
  document.execCommand("insertUnorderedList");
}

function addBlockquote() {
  // Toggle: if the current block is already a quote, switch it back to
  // a plain paragraph instead of re-applying it every time.
  const current = (document.queryCommandValue("formatBlock") || "").toLowerCase().replace(/[<>]/g, "");
  document.execCommand("formatBlock", false, current === "blockquote" ? "<p>" : "<blockquote>");
}

function addLink() {
  const url = prompt("Link URL (e.g. https://example.com):");
  if (!url) return;

  // Only allow safe URL schemes — blocks javascript:/data: links that
  // could otherwise run code when clicked.
  const safe = /^(https?:\/\/|mailto:)/i.test(url.trim());
  if (!safe) {
    alert("Please enter a full URL starting with https:// (or mailto:).");
    return;
  }

  document.execCommand("createLink", false, url.trim());

  // execCommand doesn't let us set target/rel directly — find the link
  // that was just created and add them so it opens in a new tab safely.
  const sel = window.getSelection();
  const anchor = sel.anchorNode && (sel.anchorNode.nodeType === 1 ? sel.anchorNode : sel.anchorNode.parentElement)?.closest("a");
  if (anchor) {
    anchor.setAttribute("target", "_blank");
    anchor.setAttribute("rel", "noopener noreferrer");
  }
}

function clearFormat() {
  document.execCommand("removeFormat");
  document.execCommand("formatBlock", false, "<p>");
}

window.openBannerUpload = openBannerUpload;
window.undoEdit = undoEdit;
window.redoEdit = redoEdit;
window.addHeading = addHeading;
window.addBold = addBold;
window.addItalic = addItalic;
window.addList = addList;
window.addBlockquote = addBlockquote;
window.addLink = addLink;
window.clearFormat = clearFormat;

// ===== SAVE (Publish or Save Draft) =====
async function save(status) {
  const title = document.querySelector(".title").value.trim();
  const articleField = document.querySelector(".article");
  const articleText = articleField.innerText.trim();
  const category = document.querySelector("#categorySelect")?.value || "Other";
  const publishBtn = document.querySelector(".publish-btn");
  const draftBtn = document.querySelector(".draft-btn");

  // Drafts can be saved with less complete content — full validation
  // only applies when actually publishing.
  if (status === "published") {
    if (!title || title.length < 5) return alert("Title too short");
    if (!articleText || articleText.length < 20) return alert("Write proper content");
    if (!bannerPath) return alert("Upload a banner image");
  } else if (!title) {
    return alert("Give your draft at least a title so you can find it again.");
  }

  const articleHTML = DOMPurify.sanitize(articleField.innerHTML, {
    ALLOWED_TAGS: ARTICLE_ALLOWED_TAGS,
    ALLOWED_ATTR: ARTICLE_ALLOWED_ATTR
  });

  const id = editId || title.toLowerCase().replace(/[^a-z0-9]+/g, "-") + "-" + Date.now();

  const payload = {
    title,
    article: articleHTML,
    contentFormat: "html",
    bannerImage: bannerPath,
    category,
    status
  };

  // Only stamp author + publish date/time when a post is first created —
  // never on update, so editing a post doesn't change its original
  // publish date or reassign ownership.
  if (!editId) {
    const now = new Date();
    payload.authorId = currentUser.uid;
    payload.authorEmail = currentUser.email;
    payload.authorName = currentUser.displayName || currentUser.email.split("@")[0];
    payload.publishedAt = now.toLocaleDateString();
    payload.publishedTime = now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    // The real source of truth for "how recent is this post" — a proper
    // server timestamp, unlike publishedAt/publishedTime which are just
    // display strings and can't be reliably sorted by.
    payload.createdAt = firebase.firestore.FieldValue.serverTimestamp();
  } else {
    // Backfill metadata missing on older posts (written before these
    // fields existed) — but only ever fill in what's currently missing,
    // never overwrite a real value that's already there. This is safe
    // because getting this far already required the current user to be
    // the post's owner or an admin.
    const now = new Date();
    if (!existingData?.authorName) payload.authorName = currentUser.displayName || currentUser.email.split("@")[0];
    if (!existingData?.authorEmail) payload.authorEmail = currentUser.email;
    if (!existingData?.authorId) payload.authorId = currentUser.uid;
    if (!existingData?.publishedAt) payload.publishedAt = now.toLocaleDateString();
    if (!existingData?.publishedTime) payload.publishedTime = now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    if (!existingData?.createdAt) payload.createdAt = firebase.firestore.FieldValue.serverTimestamp();
  }

  publishBtn.disabled = true;
  draftBtn.disabled = true;
  const clickedBtn = status === "draft" ? draftBtn : publishBtn;
  const originalLabel = clickedBtn.textContent;
  clickedBtn.textContent = status === "draft" ? "Saving..." : (editId ? "Updating..." : "Publishing...");

  try {
    await db.collection("blogs").doc(id).set(payload, { merge: true });
    clearAutosave();

    // Best-effort — email subscribers only the first time a post goes
    // live (skips re-notifying on every later edit/typo-fix).
    if (status === "published" && existingData?.status !== "published") {
      fetch("/api/notify-subscribers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ postId: id })
      }).catch(() => {});
    }

    if (status === "draft") {
      alert("Saved as draft 📝");
      location.href = "/dashboard";
    } else {
      alert(editId ? "Updated ✅" : "Published ✅");
      location.href = "/" + id;
    }
  } catch (err) {
    console.error(err);
    alert("Something went wrong. Please try again.");
    publishBtn.disabled = false;
    draftBtn.disabled = false;
    clickedBtn.textContent = originalLabel;
  }
}