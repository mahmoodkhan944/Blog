renderNav("dashboard");
requireAuth();

const container = document.querySelector(".blogs-grid");
let unsubscribe = null;

document.addEventListener("DOMContentLoaded", () => {
  auth.onAuthStateChanged(user => {
    if (!user) return; // requireAuth() handles the redirect

    if (unsubscribe) unsubscribe();

    const admin = isAdmin(user);

    // No orderBy — see home.js for why. We sort client-side instead so
    // this also doesn't need a Firestore composite index.
    const query = admin
      ? db.collection("blogs")
      : db.collection("blogs").where("authorId", "==", user.uid);

    unsubscribe = query.onSnapshot(
      snapshot => renderBlogs(snapshot, admin),
      err => {
        console.error(err);
        container.innerHTML = `<p class="empty-state">Could not load your blogs right now.</p>`;
      }
    );
  });
});

function renderBlogs(snapshot, admin) {
  if (snapshot.empty) {
    container.innerHTML = `<p class="empty-state">No blogs yet. <a href="/editor">Write your first one</a>.</p>`;
    return;
  }

  const sorted = sortDocsByRecency(snapshot.docs);
  container.innerHTML = "";

  sorted.forEach(doc => {
    const data = doc.data();

    container.innerHTML += `
      <div class="dash-card">
        <img src="${data.bannerImage}" class="dash-thumb" alt="${escapeHtml(data.title)}" loading="lazy">
        <div class="dash-body">
          <h2 class="dash-title">${escapeHtml(data.title)}</h2>
          <p class="dash-date">
            ${data.publishedAt || ""} · ${data.views || 0} views
            ${admin && data.authorEmail ? `· ${escapeHtml(data.authorEmail)}` : ""}
          </p>
          <div class="dash-actions">
            <button class="btn small" onclick="editBlog('${doc.id}')">Edit</button>
            <button class="btn small danger" onclick="deleteBlog('${doc.id}')">Delete</button>
            <a class="btn small ghost" href="/${doc.id}" target="_blank" rel="noopener">View</a>
          </div>
        </div>
      </div>
    `;
  });
}

function editBlog(id) {
  location.href = `/editor?id=${encodeURIComponent(id)}`;
}

async function deleteBlog(id) {
  if (!confirm("Delete this blog permanently? This can't be undone.")) return;

  try {
    await db.collection("blogs").doc(id).delete();
  } catch (err) {
    console.error(err);
    alert("Could not delete this blog. Please try again.");
  }
}

function escapeHtml(str) {
  return String(str).replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

window.editBlog = editBlog;
window.deleteBlog = deleteBlog;