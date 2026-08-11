renderNav("editor");
requireAuth();

// Tags/attributes allowed in saved article HTML — kept tight since this
// content is rendered to every visitor of the blog.
const ARTICLE_ALLOWED_TAGS = ["h1", "h2", "h3", "p", "b", "strong", "i", "em", "ul", "ol", "li", "img", "br"];
const ARTICLE_ALLOWED_ATTR = ["src", "alt", "class"];

let bannerPath = "";
let editId = null;
let currentUser = null;
let initialized = false;
let existingData = null;
let savedImageRange = null; // only used to survive the file-picker dialog

document.addEventListener("DOMContentLoaded", () => {
  document.execCommand("defaultParagraphSeparator", false, "p");

  auth.onAuthStateChanged(user => {
    if (!user || initialized) return; // requireAuth() handles the redirect
    initialized = true;
    currentUser = user;
    init();
  });
});

async function init() {
  const params = new URLSearchParams(location.search);
  editId = params.get("id");

  if (editId) {
    const canEdit = await loadForEdit(editId);
    if (!canEdit) return; // already redirected away
  }

  const articleField = document.querySelector(".article");

  document.querySelector(".publish-btn").addEventListener("click", publish);

  const bannerUpload = document.querySelector("#banner-upload");
  if (bannerUpload) bannerUpload.addEventListener("change", handleBannerUpload);

  const imageUpload = document.querySelector("#image-upload");
  if (imageUpload) imageUpload.addEventListener("change", handleArticleImageUpload);
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

    document.querySelector(".publish-btn").textContent = "Update";
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
window.clearFormat = clearFormat;

// ===== PUBLISH / UPDATE =====
async function publish() {
  const title = document.querySelector(".title").value.trim();
  const articleField = document.querySelector(".article");
  const articleText = articleField.innerText.trim();
  const publishBtn = document.querySelector(".publish-btn");

  if (!title || title.length < 5) return alert("Title too short");
  if (!articleText || articleText.length < 20) return alert("Write proper content");
  if (!bannerPath) return alert("Upload a banner image");

  const articleHTML = DOMPurify.sanitize(articleField.innerHTML, {
    ALLOWED_TAGS: ARTICLE_ALLOWED_TAGS,
    ALLOWED_ATTR: ARTICLE_ALLOWED_ATTR
  });

  const id = editId || title.toLowerCase().replace(/[^a-z0-9]+/g, "-") + "-" + Date.now();

  const payload = {
    title,
    article: articleHTML,
    contentFormat: "html",
    bannerImage: bannerPath
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
  publishBtn.textContent = editId ? "Updating..." : "Publishing...";

  try {
    await db.collection("blogs").doc(id).set(payload, { merge: true });
    alert(editId ? "Updated ✅" : "Published ✅");
    location.href = "/" + id;
  } catch (err) {
    console.error(err);
    alert("Something went wrong. Please try again.");
    publishBtn.disabled = false;
    publishBtn.textContent = editId ? "Update" : "Publish";
  }
}