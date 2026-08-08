const express = require("express");
const path = require("path");
const fileUpload = require("express-fileupload");

const app = express();

app.use(express.json());
app.use(express.static("public"));
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

// ===== PAGES (explicit routes first, catch-all last) =====
app.get("/", (req, res) => res.sendFile(path.join(__dirname, "public/home.html")));
app.get("/login", (req, res) => res.sendFile(path.join(__dirname, "public/login.html")));
app.get("/dashboard", (req, res) => res.sendFile(path.join(__dirname, "public/dashboard.html")));
app.get("/editor", (req, res) => res.sendFile(path.join(__dirname, "public/editor.html")));
app.get("/blogs", (req, res) => res.sendFile(path.join(__dirname, "public/blogs.html")));

// Any other path is treated as a blog post slug.
app.get("/:id", (req, res) => res.sendFile(path.join(__dirname, "public/blog.html")));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));