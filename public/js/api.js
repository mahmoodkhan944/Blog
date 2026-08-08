// ===== UPLOAD API =====
// Sends an image file to our own server (/api/upload), which stores it
// under public/uploads and returns its URL. Used for banner + inline
// article images so we don't depend on any third-party upload service.

async function uploadFile(file) {
  const fd = new FormData();
  fd.append("image", file);

  const res = await fetch("/api/upload", {
    method: "POST",
    body: fd
  });

  if (!res.ok) throw new Error("Upload failed");

  return res.json();
}