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