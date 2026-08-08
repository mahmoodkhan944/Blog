// ===== IMAGE UPLOAD (Cloudinary) =====
// Uploads directly from the browser to Cloudinary using an unsigned
// upload preset — see CLOUDINARY_CLOUD_NAME / CLOUDINARY_UPLOAD_PRESET
// in config.js. This means image uploads never touch our own server,
// so they work identically on any host, including serverless platforms
// like Vercel where the server's filesystem is read-only.
//
// Returns { url } to match the shape editor.js already expects.
async function uploadFile(file) {
  if (CLOUDINARY_CLOUD_NAME === "YOUR_CLOUD_NAME" || CLOUDINARY_UPLOAD_PRESET === "YOUR_UPLOAD_PRESET") {
    throw new Error("Cloudinary isn't configured yet — set CLOUDINARY_CLOUD_NAME and CLOUDINARY_UPLOAD_PRESET in js/config.js.");
  }

  const formData = new FormData();
  formData.append("file", file);
  formData.append("upload_preset", CLOUDINARY_UPLOAD_PRESET);

  const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`, {
    method: "POST",
    body: formData
  });

  const data = await res.json();

  if (!res.ok || !data.secure_url) {
    console.error("Cloudinary upload error:", data);
    throw new Error(data?.error?.message || "Upload failed");
  }

  // Let Cloudinary auto-pick the best format/quality for whoever views it.
  const url = data.secure_url.replace("/upload/", "/upload/f_auto,q_auto/");

  return { url };
}