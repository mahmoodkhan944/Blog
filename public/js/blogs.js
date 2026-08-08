renderNav("blogs", { onDark: false });

const blogSection = document.querySelector(".blogs-section");

// See home.js for why we don't use Firestore's orderBy() here — sorting
// happens client-side in sortDocsByRecency() (blog-cards.js) instead.
db.collection("blogs")
  .get()
  .then(res => {
    if (res.empty) {
      blogSection.innerHTML = `<p class="empty-state">No blogs published yet. <a href="/editor">Write the first one</a>.</p>`;
      return;
    }

    const sorted = sortDocsByRecency(res.docs);
    blogSection.innerHTML = sorted.map(doc => blogCardHTML(doc.id, doc.data())).join("");
    observeReveals();
  })
  .catch(err => {
    console.error(err);
    blogSection.innerHTML = `<p class="empty-state">Could not load blogs right now. Please refresh.</p>`;
  });