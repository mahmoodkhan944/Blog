const express = require("express");
const path = require("path");
const fs = require("fs");
const https = require("https");
const admin = require("firebase-admin");

const app = express();

// Must match firebaseConfig.projectId in public/js/firebase.js.
const FIREBASE_PROJECT_ID = "blogging-website-12a92";

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

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

// ===== STRUCTURED DATA (JSON-LD) =====
// Helps search engines understand the page (author, publish date,
// image) well enough to show richer results — separate from, and in
// addition to, the Open Graph tags above.
function injectJsonLd(html, data) {
  const script = `<script type="application/ld+json">${JSON.stringify(data)}</script>`;
  return html.replace("</head>", `${script}\n</head>`);
}

function toIsoDate(displayDate) {
  if (!displayDate) return undefined;
  const parsed = new Date(displayDate);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString();
}

// ===== SITEMAP / ROBOTS =====
// Lists every published blog's id via Firestore's REST API (same
// no-credentials-needed approach as fetchBlogDoc above), for search
// engines. Capped at 300 posts — fine for now; if the blog grows past
// that, this would need to page through results with a pageToken.
function fetchAllBlogIds() {
  return new Promise(resolve => {
    const url = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/blogs?pageSize=300&mask.fieldPaths=title`;

    https
      .get(url, res => {
        let body = "";
        res.on("data", chunk => (body += chunk));
        res.on("end", () => {
          try {
            const json = JSON.parse(body);
            const docs = json.documents || [];
            resolve(docs.map(d => d.name.split("/").pop()));
          } catch {
            resolve([]);
          }
        });
      })
      .on("error", () => resolve([]));
  });
}

// ===== EMAIL NOTIFICATIONS =====
// Two automatic emails:
//   1. New post published -> every newsletter subscriber
//   2. New comment posted -> that post's author
//
// Needs two things set as environment variables (Vercel → Project →
// Settings → Environment Variables) to actually send anything — until
// both are set, these endpoints just no-op quietly instead of failing:
//
//   RESEND_API_KEY             — from resend.com (free tier, no card)
//   FIREBASE_SERVICE_ACCOUNT_KEY — the full JSON from Firebase Console →
//                                  Project Settings → Service Accounts →
//                                  Generate new private key, pasted in
//                                  as a single-line string.
//
// The service account is needed ONLY to read the "subscribers" list —
// that collection is deliberately unreadable by normal client requests
// (see firestore.rules) to keep people's emails private, so sending the
// newsletter has to go through a privileged server credential instead.

let adminApp = null;
function getAdminApp() {
  if (admin.apps.length > 0) return admin.apps[0];
  if (!process.env.FIREBASE_SERVICE_ACCOUNT_KEY) return null;

  try {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
    adminApp = admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
    return adminApp;
  } catch (err) {
    console.error("Failed to initialize firebase-admin:", err);
    return null;
  }
}

function sendEmail({ to, bcc, subject, html }) {
  return new Promise(resolve => {
    if (!process.env.RESEND_API_KEY) {
      console.warn("RESEND_API_KEY not set — skipping email send.");
      return resolve(false);
    }

    const payload = JSON.stringify({
      from: "Blog <onboarding@resend.dev>",
      to,
      bcc,
      subject,
      html
    });

    const req = https.request(
      "https://api.resend.com/emails",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(payload)
        }
      },
      res => {
        let body = "";
        res.on("data", chunk => (body += chunk));
        res.on("end", () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(true);
          } else {
            console.error("Resend error:", res.statusCode, body);
            resolve(false);
          }
        });
      }
    );

    req.on("error", err => {
      console.error("Email send failed:", err);
      resolve(false);
    });

    req.write(payload);
    req.end();
  });
}

// Called right after a post goes live (see public/js/editor.js).
// Re-fetches the post itself server-side rather than trusting whatever
// the client sends, so the email content can't be spoofed through this
// endpoint.
app.post("/api/notify-subscribers", async (req, res) => {
  try {
    const { postId } = req.body || {};
    if (!postId) return res.status(400).json({ error: "postId required" });

    const data = await fetchBlogDoc(postId);
    if (!data || data.status === "draft") {
      return res.status(404).json({ error: "Post not found or not published" });
    }

    const adminInstance = getAdminApp();
    if (!adminInstance) {
      return res.json({ sent: false, reason: "Email notifications aren't configured yet." });
    }

    const subscribersSnap = await adminInstance.firestore().collection("subscribers").get();
    const emails = subscribersSnap.docs.map(d => d.data().email).filter(Boolean);

    if (emails.length === 0) {
      return res.json({ sent: false, reason: "No subscribers yet." });
    }

    const baseUrl = `${req.protocol}://${req.get("host")}`;
    const postUrl = `${baseUrl}/${postId}`;
    const bannerUrl = absoluteUrl(req, data.bannerImage);
    const excerpt = stripHtmlTags(data.article).slice(0, 200);

    const html = `
      <div style="font-family:sans-serif;max-width:520px;margin:auto;">
        <img src="${bannerUrl}" style="width:100%;border-radius:12px;margin-bottom:16px;" alt="">
        <h2 style="margin:0 0 8px;">${escapeAttr(data.title)}</h2>
        <p style="color:#555;line-height:1.6;">${escapeAttr(excerpt)}...</p>
        <a href="${postUrl}" style="display:inline-block;margin-top:16px;padding:10px 20px;background:#D96C4A;color:#fff;text-decoration:none;border-radius:24px;">Read the full post</a>
      </div>
    `;

    // BCC everyone in one send so subscribers never see each other's
    // email addresses.
    const ok = await sendEmail({
      to: "Blog <onboarding@resend.dev>",
      bcc: emails,
      subject: `New post: ${data.title}`,
      html
    });

    res.json({ sent: ok });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not send notifications" });
  }
});

// Called right after a comment/reply is posted (see public/js/blog.js).
app.post("/api/notify-comment", async (req, res) => {
  try {
    const { blogId, commenterName, commentText } = req.body || {};
    if (!blogId || !commentText) return res.status(400).json({ error: "Missing fields" });

    const data = await fetchBlogDoc(blogId);
    if (!data || !data.authorEmail) {
      return res.json({ sent: false, reason: "No author email on file." });
    }

    // Don't email an author about their own comment on their own post.
    if (data.authorName && commenterName && data.authorName === commenterName) {
      return res.json({ sent: false, reason: "Author commented on their own post." });
    }

    const baseUrl = `${req.protocol}://${req.get("host")}`;
    const postUrl = `${baseUrl}/${blogId}`;

    const html = `
      <div style="font-family:sans-serif;max-width:520px;margin:auto;">
        <h2 style="margin:0 0 8px;">New comment on "${escapeAttr(data.title)}"</h2>
        <p style="color:#555;"><strong>${escapeAttr(commenterName || "Someone")}</strong> wrote:</p>
        <p style="background:#f4f1ec;padding:12px 16px;border-radius:8px;color:#333;">${escapeAttr(commentText)}</p>
        <a href="${postUrl}" style="display:inline-block;margin-top:16px;padding:10px 20px;background:#D96C4A;color:#fff;text-decoration:none;border-radius:24px;">View the comment</a>
      </div>
    `;

    const ok = await sendEmail({
      to: data.authorEmail,
      subject: `New comment on your post "${data.title}"`,
      html
    });

    res.json({ sent: ok });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not send notification" });
  }
});

// ===== PAGES (explicit routes first, catch-all last) =====

// Homepage — static content, but the preview image/title still need to
// be absolute URLs based on whatever domain is actually serving the site.
app.get("/", (req, res) => {
  try {
    const html = fs.readFileSync(path.join(__dirname, "public/home.html"), "utf-8");
    const baseUrl = `${req.protocol}://${req.get("host")}`;

    let injected = injectMetaTags(html, {
      title: "Blog — Real stories, written by people",
      description: "Real stories and ideas, written by people — not algorithms.",
      image: `${baseUrl}/img/header.png`,
      url: baseUrl
    });

    injected = injectJsonLd(injected, {
      "@context": "https://schema.org",
      "@type": "WebSite",
      name: "Blog",
      url: baseUrl,
      description: "Real stories and ideas, written by people — not algorithms."
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
app.get("/author/:uid", (req, res) => res.sendFile(path.join(__dirname, "public/author.html")));

app.get("/robots.txt", (req, res) => {
  const baseUrl = `${req.protocol}://${req.get("host")}`;
  res.type("text/plain").send(`User-agent: *\nAllow: /\n\nSitemap: ${baseUrl}/sitemap.xml\n`);
});

app.get("/sitemap.xml", async (req, res) => {
  const baseUrl = `${req.protocol}://${req.get("host")}`;

  try {
    const ids = await fetchAllBlogIds();

    const urls = [
      { loc: `${baseUrl}/`, priority: "1.0" },
      { loc: `${baseUrl}/blogs`, priority: "0.8" },
      ...ids.map(id => ({ loc: `${baseUrl}/${id}`, priority: "0.7" }))
    ];

    const xml =
      `<?xml version="1.0" encoding="UTF-8"?>\n` +
      `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
      urls.map(u => `  <url>\n    <loc>${u.loc}</loc>\n    <priority>${u.priority}</priority>\n  </url>`).join("\n") +
      `\n</urlset>`;

    res.type("application/xml").send(xml);
  } catch (err) {
    console.error(err);
    res.status(500).send("Could not generate sitemap");
  }
});

// Any other path is treated as a blog post slug — fetch that post's
// title/banner/excerpt from Firestore and inject them as share preview
// meta tags before sending the page. If it doesn't exist, serve a real
// 404 page with a 404 status (not just a redirect), which is also what
// search engines expect for a missing page.
app.get("/:id", async (req, res) => {
  try {
    const data = await fetchBlogDoc(req.params.id);

    if (!data) {
      return res.status(404).sendFile(path.join(__dirname, "public/404.html"));
    }

    const html = fs.readFileSync(path.join(__dirname, "public/blog.html"), "utf-8");
    const pageUrl = `${req.protocol}://${req.get("host")}${req.originalUrl}`;
    const bannerUrl = absoluteUrl(req, data.bannerImage);
    const description = stripHtmlTags(data.article).slice(0, 160);

    let injected = injectMetaTags(html, {
      title: data.title ? `Blog : ${data.title}` : "Blog",
      description,
      image: bannerUrl,
      url: pageUrl
    });

    // Only expose non-draft posts to search engines — a draft's JSON-LD
    // shouldn't get indexed even if the page itself is reachable.
    if (data.status !== "draft") {
      injected = injectJsonLd(injected, {
        "@context": "https://schema.org",
        "@type": "BlogPosting",
        headline: data.title,
        image: [bannerUrl],
        description,
        datePublished: toIsoDate(data.publishedAt),
        author: data.authorName ? { "@type": "Person", name: data.authorName } : undefined,
        mainEntityOfPage: { "@type": "WebPage", "@id": pageUrl }
      });
    }

    res.send(injected);
  } catch (err) {
    console.error(err);
    res.sendFile(path.join(__dirname, "public/blog.html"));
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