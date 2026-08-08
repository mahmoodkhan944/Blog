const express = require("express");
const path = require("path");
const fs = require("fs");
const https = require("https");

const app = express();

// Must match firebaseConfig.projectId in public/js/firebase.js.
const FIREBASE_PROJECT_ID = "blogging-website-12a92";

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));


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


if (require.main === module) {
  app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
}

module.exports = app;