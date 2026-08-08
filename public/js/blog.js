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

    // ===== INCREASE VIEW COUNT (best effort, non-blocking) =====
    db.collection("blogs").doc(blogId).update({
      views: firebase.firestore.FieldValue.increment(1)
    }).catch(() => {});

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