renderNav("home", { onDark: true });

const HOME_LIMIT = 8;

const featuredWrap = document.querySelector("#featuredWrap");
const moreHeading = document.querySelector("#moreHeading");
const blogSection = document.querySelector(".blogs-section");
const viewAllWrap = document.querySelector("#viewAllWrap");

// No orderBy here on purpose — publishedAt/publishedTime are just display
// strings and can't be reliably sorted by Firestore. We fetch everything
// and sort by real recency (createdAt, with a parsed-string fallback for
// older posts) in sortDocsByRecency() — see blog-cards.js.
db.collection("blogs")
  .get()
  .then(res => {
    if (res.empty) {
      featuredWrap.innerHTML = `<p class="empty-state">No blogs published yet. <a href="/editor">Write the first one</a>.</p>`;
      moreHeading.style.display = "none";
      return;
    }

    const sorted = sortDocsByRecency(res.docs);
    const docs = sorted.slice(0, HOME_LIMIT);
    const [featuredDoc, ...restDocs] = docs;

    featuredWrap.innerHTML = featuredCardHTML(featuredDoc.id, featuredDoc.data());

    if (restDocs.length === 0) {
      moreHeading.style.display = "none";
      blogSection.style.display = "none";
    } else {
      blogSection.innerHTML = restDocs.map(doc => blogCardHTML(doc.id, doc.data())).join("");
    }

    if (sorted.length > HOME_LIMIT && viewAllWrap) {
      viewAllWrap.style.display = "flex";
    }

    observeReveals();
  })
  .catch(err => {
    console.error(err);
    featuredWrap.innerHTML = `<p class="empty-state">Could not load blogs right now. Please refresh.</p>`;
    moreHeading.style.display = "none";
  });