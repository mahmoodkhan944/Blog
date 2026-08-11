renderNav(null, { onDark: false });

const authorUid = decodeURIComponent(location.pathname.split("/").pop());

const nameEl = document.querySelector("#authorName");
const countEl = document.querySelector("#authorCount");
const postsEl = document.querySelector("#authorPosts");

db.collection("blogs")
  .where("authorId", "==", authorUid)
  .get()
  .then(res => {
    const published = sortDocsByRecency(res.docs.filter(doc => isPublished(doc.data())));

    if (published.length === 0) {
      nameEl.textContent = "No posts found";
      postsEl.innerHTML = `<p class="empty-state">This author hasn't published anything yet.</p>`;
      return;
    }

    const first = published[0].data();
    nameEl.textContent = first.authorName || "Author";
    document.title = `Blog : ${nameEl.textContent}`;
    countEl.textContent = `${published.length} post${published.length === 1 ? "" : "s"} published`;

    postsEl.innerHTML = published.map(doc => blogCardHTML(doc.id, doc.data())).join("");
    observeReveals();
  })
  .catch(err => {
    console.error(err);
    nameEl.textContent = "Could not load this author";
    postsEl.innerHTML = `<p class="empty-state">Please try again later.</p>`;
  });