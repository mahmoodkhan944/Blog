const express = require("express");
const path = require("path");
const fs = require("fs");
const https = require("https");
const fileUpload = require("express-fileupload");

const app = express();

// Must match firebaseConfig.projectId in public/js/firebase.js.
const FIREBASE_PROJECT_ID = "blogging-website-12a92";

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));
app.use(
  fileUpload({
    limits: { fileSize: 8 * 1024 * 1024 }, // 8MB max per image
    abortOnLimit: true
  })
);

// ===== UPLOAD API =====
app.post("/api/upload", async (req, res) => {
  try {
    if (!req.files?.image) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    const file = req.files.image;

    if (!file.mimetype.startsWith("image/")) {
      return res.status(400).json({ error: "Only image files are allowed" });
    }

    const safeName = file.name.replace(/[^a-zA-Z0-9.\-_]/g, "_");
    const name = `${Date.now()}-${safeName}`;
    const uploadPath = path.join(__dirname, "public/uploads", name);

    await file.mv(uploadPath);

    res.json({ url: `/uploads/${name}` });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Upload failed" });
  }
});

// ===== SHARE PREVIEWS (Open Graph / Twitter Card meta tags) =====
// Apps like WhatsApp, Facebook, and Twitter/X read link previews by
// fetching the raw HTML — they do NOT run JavaScript. Since blog content
// normally loads client-side from Firestore, we fetch it here on the
// server and inject the right <meta> tags before sending the page, so
// share previews show the actual blog banner/title instead of nothing.

// Reads a public Firestore document over its REST API (no credentials
// needed since our security rules already allow public reads on /blogs).
function fetchBlogDoc(id) {
  return new Promise(resolve => {
    const url = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/blogs/${encodeURIComponent(id)}`;

    https
      .get(url, res => {
        let body = "";
        res.on("data", chunk => (body += chunk));
        res.on("end", () => {
          try {
            const json = JSON.parse(body);
            resolve(json.fields ? parseFirestoreFields(json.fields) : null);
          } catch {
            resolve(null);
          }
        });
      })
      .on("error", () => resolve(null));
  });
}

// Firestore's REST API wraps every field like { stringValue: "..." } —
// unwrap the ones we actually need for meta tags.
function parseFirestoreFields(fields) {
  const data = {};
  for (const key in fields) {
    const val = fields[key];
    if (val.stringValue !== undefined) data[key] = val.stringValue;
    else if (val.integerValue !== undefined) data[key] = Number(val.integerValue);
    else if (val.booleanValue !== undefined) data[key] = val.booleanValue;
  }
  return data;
}

function stripHtmlTags(html) {
  return String(html || "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

function escapeAttr(str) {
  return String(str || "").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

// Inserts Open Graph / Twitter Card tags into an HTML string's <head>,
// and overwrites <title> if a title is given.
function injectMetaTags(html, { title, description, image, url }) {
  const tags = `
    <meta name="description" content="${escapeAttr(description)}">
    <meta property="og:type" content="website">
    <meta property="og:title" content="${escapeAttr(title)}">
    <meta property="og:description" content="${escapeAttr(description)}">
    <meta property="og:image" content="${escapeAttr(image)}">
    <meta property="og:url" content="${escapeAttr(url)}">
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:title" content="${escapeAttr(title)}">
    <meta name="twitter:description" content="${escapeAttr(description)}">
    <meta name="twitter:image" content="${escapeAttr(image)}">
  `;

  let output = html.replace("</head>", `${tags}\n</head>`);

  if (title) {
    output = output.replace(/<title>.*?<\/title>/, `<title>${escapeAttr(title)}</title>`);
  }

  return output;
}

function absoluteUrl(req, maybeRelativePath) {
  const base = `${req.protocol}://${req.get("host")}`;
  if (!maybeRelativePath) return `${base}/img/header.png`;
  return maybeRelativePath.startsWith("/") ? `${base}${maybeRelativePath}` : maybeRelativePath;
}

// ===== PAGES (explicit routes first, catch-all last) =====

// Homepage — static content, but the preview image/title still need to
// be absolute URLs based on whatever domain is actually serving the site.
app.get("/", (req, res) => {
  try {
    const html = fs.readFileSync(path.join(__dirname, "public/home.html"), "utf-8");
    const baseUrl = `${req.protocol}://${req.get("host")}`;

    const injected = injectMetaTags(html, {
      title: "Blog — Real stories, written by people",
      description: "Real stories and ideas, written by people — not algorithms.",
      image: `${baseUrl}/img/header.png`,
      url: baseUrl
    });

    res.send(injected);
  } catch (err) {
    console.error(err);
    res.sendFile(path.join(__dirname, "public/home.html"));
  }
});

app.get("/login", (req, res) => res.sendFile(path.join(__dirname, "public/login.html")));
app.get("/dashboard", (req, res) => res.sendFile(path.join(__dirname, "public/dashboard.html")));
app.get("/editor", (req, res) => res.sendFile(path.join(__dirname, "public/editor.html")));
app.get("/blogs", (req, res) => res.sendFile(path.join(__dirname, "public/blogs.html")));

// Any other path is treated as a blog post slug — fetch that post's
// title/banner/excerpt from Firestore and inject them as share preview
// meta tags before sending the page.
app.get("/:id", async (req, res) => {
  const html = fs.readFileSync(path.join(__dirname, "public/blog.html"), "utf-8");

  try {
    const data = await fetchBlogDoc(req.params.id);

    if (!data) {
      return res.send(html); // unknown id — client-side JS will redirect home
    }

    const injected = injectMetaTags(html, {
      title: data.title ? `Blog : ${data.title}` : "Blog",
      description: stripHtmlTags(data.article).slice(0, 160),
      image: absoluteUrl(req, data.bannerImage),
      url: `${req.protocol}://${req.get("host")}${req.originalUrl}`
    });

    res.send(injected);
  } catch (err) {
    console.error(err);
    res.send(html);
  }
});

const PORT = process.env.PORT || 3000;

// Only bind to a port when run directly (`node server.js`, local dev).
// On Vercel, this file is imported as a serverless function instead —
// module.exports below is what actually gets used there.
if (require.main === module) {
  app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
}

module.exports = app;