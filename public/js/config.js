// ===== ADMIN CONFIG =====
// Emails listed here can edit/delete ANY blog post, not just their own.
// Everyone else can only edit/delete blogs they personally created.
//
// IMPORTANT: This list is also used as-is inside firestore.rules — if you
// add/remove an admin here, update firestore.rules too, otherwise the real
// permission check (enforced by Firebase, not just this UI) won't match.

const ADMIN_EMAILS = [
  "mahmoodkhan944@gmail.com"
];

function isAdmin(user) {
  return !!user && !!user.email && ADMIN_EMAILS.includes(user.email);
}

// ===== IMAGE UPLOAD CONFIG (Cloudinary) =====
// Used by uploadFile() in api.js for banner/article image uploads.
// Both values come from your own Cloudinary account:
//
//   1. CLOUD_NAME  — shown at the top of your Cloudinary dashboard
//      (console.cloudinary.com), labeled "Cloud name".
//
//   2. UPLOAD_PRESET — Settings (gear icon) → Upload → scroll to
//      "Upload presets" → Add upload preset → set "Signing Mode" to
//      "Unsigned" → Save. Copy the preset's name here.
//      (Unsigned presets are the standard way to let a browser upload
//      directly to Cloudinary without exposing your API secret.)

const CLOUDINARY_CLOUD_NAME = "dmnch701b";
const CLOUDINARY_UPLOAD_PRESET = "ml_default";