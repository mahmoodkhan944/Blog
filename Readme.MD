# Blogging Website

A simple Firebase-backed blogging site: browse posts, write with a lightweight
markdown-style editor, and manage your own posts from a dashboard.

## What changed in this restructure

**Fixed bugs**
- `js/firebase.js` had a stray line (`views: firebase.firestore...`) sitting
  outside any function — this was a syntax-adjacent bug that could break the
  whole script. Removed.
- `js/auth.js` and `js/api.js` used ES `export` syntax but were loaded as
  classic `<script>` tags (and weren't even included in any page) — they were
  dead code. Rewritten as plain scripts and wired into every page that needs
  them.
- `js/editor.js` had duplicate function declarations (`addHeading`, `addBold`,
  `addList`, `insertText` defined twice, once inside `DOMContentLoaded` and
  once outside referencing out-of-scope variables). Consolidated into one
  clean implementation.
- `server.js` routed `/login` and `/dashboard` to HTML files that didn't
  exist. Both pages are now built out.
- The editor uploaded images straight to a hardcoded, third-party Cloudinary
  account. Everything now goes through the app's own `/api/upload` endpoint.
- `package.json` had several unrelated/garbage dependencies (`all`, `git`,
  `i`, `package`, `express.js`) left over from a messy `npm install` history.
  Cleaned up to the actual dependencies in use.

**New features**
- Working `/login` page (login + signup toggle, friendly error messages).
- Working `/dashboard` page listing your posts with Edit / Delete / View.
- Editing an existing post now works end-to-end (`/editor?id=...`).
- Shared, auth-aware navbar (`js/nav.js`) used across every page, with a
  mobile hamburger menu.
- **Post ownership**: every new post is stamped with its author's UID.
  The dashboard only shows/lets you edit or delete posts *you* created,
  unless your email is listed in `public/js/config.js` (`ADMIN_EMAILS`),
  in which case you can manage every post. This is enforced in two places:
  - client-side, in `dashboard.js` / `editor.js` (so the UI behaves correctly)
  - server-side, in `firestore.rules` (so the rule can't be bypassed by
    calling the Firebase API directly)

  **You must apply `firestore.rules`** in Firebase Console → Firestore
  Database → Rules for the ownership check to be real security and not
  just a UI nicety. Keep the admin email in that file and in
  `public/js/config.js` in sync.

  **About existing posts**: posts published before this change have no
  `authorId`, so only an admin can manage them (a regular user can still
  view them, just not edit/delete). The email in `config.js` was set to
  the account seen in your screenshots so nothing you already published
  becomes unmanageable — add/replace it with whichever account(s) should
  be admin.

- **Correct chronological ordering.** Posts used to be sorted with
  Firestore's `orderBy("publishedAt", "desc")` — but `publishedAt` is just
  a display string (e.g. `"8/8/2026"`) with no time component, so two
  posts published on the same day could come back in the wrong order.
  Sorting now happens client-side (`sortDocsByRecency()` in
  `js/blog-cards.js`) using a real Firestore server timestamp
  (`createdAt`), with a parsed-string fallback for posts that predate
  this field. Because of this, none of the list pages use `orderBy()`
  anymore — which also means the dashboard's `where()` query no longer
  needs a Firestore composite index.

- **Link share previews (Open Graph tags).** Apps like WhatsApp,
  Facebook, and Twitter/X read link previews by fetching raw HTML — they
  never run JavaScript. Since blog content normally loads client-side
  from Firestore, `server.js` now fetches a post's title/banner/excerpt
  from Firestore's REST API on the server and injects `<meta
  property="og:...">` / `<meta name="twitter:...">` tags before sending
  the page, so sharing a blog link shows that post's actual banner image,
  and sharing the homepage shows the site's header image. See
  `injectMetaTags()` / `fetchBlogDoc()` in `server.js`.
  - `FIREBASE_PROJECT_ID` at the top of `server.js` must match
    `firebaseConfig.projectId` in `public/js/firebase.js`.
  - Platforms cache link previews aggressively. If you're testing and a
    stale preview keeps showing up, use [Facebook's Sharing
    Debugger](https://developers.facebook.com/tools/debug/) to force a
    re-scrape, or share a link with a dummy query string appended.

**Redesign**
- New warm, editorial visual system: `Playfair Display` for headings +
  `Poppins` for body text, a terracotta accent color, soft shadows, and a
  consistent spacing/radius scale defined once in `css/variables.css` and
  reused everywhere.
- All CSS restructured: `variables.css` (design tokens) + `base.css` (reset,
  navbar, buttons, form fields shared by every page) + one page-specific
  stylesheet per page.
- **The editor is now a real WYSIWYG editor** (not markdown-in-a-textarea).
  Clicking Bold/Heading/List/Italic formats the text immediately, exactly
  as it'll look on the published post — no more guessing what `# ` or `**`
  will turn into. Articles are stored as sanitized HTML (`contentFormat:
  "html"`), and images are inserted directly where your cursor is.
  - Content is sanitized with **DOMPurify** both when you publish and again
    when a post is rendered on the blog page, restricted to a small allow-
    list of tags (`h1-h3, p, b, i, ul, ol, li, img, br`). This matters
    because blog content is user-generated and gets rendered as real HTML
    to every visitor — without sanitization, a malicious post could inject
    a `<script>` tag and run in other visitors' browsers.
  - **Posts published before this change keep working** — they're still in
    the old "markdown-lite" text format (`# heading`, `**bold**`,
    `![alt](url)`), and `blog.js` still knows how to render that format
    (`renderArticle()` legacy parser). Editing an old post loads it as
    plain text; saving it again upgrades it to the new HTML format.

- **Image uploads go straight to Cloudinary**, uploaded directly from
  the browser (`uploadFile()` in `public/js/api.js`) using an unsigned
  upload preset — they never pass through our own server. This replaced
  the old `/api/upload` endpoint, which saved files to local disk and
  therefore couldn't work on serverless hosts like Vercel (read-only
  filesystem). **You must set `CLOUDINARY_CLOUD_NAME` and
  `CLOUDINARY_UPLOAD_PRESET`** in `public/js/config.js` with your own
  Cloudinary account's values, or uploads will fail — see the comment
  above those constants for exactly where to find/create them.

## Project structure

```
public/
  css/
    variables.css   design tokens (colors, spacing, radius, shadows)
    base.css        reset + navbar + buttons + form fields (shared)
    home.css        homepage
    blog.css        single blog post page
    editor.css      editor page
    auth.css        login/signup page
    dashboard.css   dashboard page
  js/
    firebase.js     Firebase init, exposes `db` and `auth`
    auth.js         signup/login/logout/requireAuth helpers
    config.js       admin emails + Cloudinary credentials
    api.js          uploadFile() -> uploads directly to Cloudinary
    nav.js          shared, auth-aware navbar component
    blog-cards.js   shared card/featured-card rendering + recency sort
    home.js / blog.js / blogs.js / editor.js / login.js / dashboard.js
  home.html / blog.html / blogs.html / editor.html / login.html / dashboard.html
  img/, uploads/    legacy local uploads from before the Cloudinary
                    switch — new uploads go to Cloudinary, not this folder
server.js
package.json
firestore.rules    Firestore security rules (posts)
vercel.json         Vercel deployment config
```

## Running locally

```bash
npm install
npm run dev      # nodemon, auto-restarts
# or
npm start
```

The server runs on `http://localhost:3000`.

## Deploying to Vercel

`vercel.json` routes every request through `server.js` (as a serverless
function, via `includeFiles` so the `public/` folder is bundled with it)
instead of letting Vercel serve `public/` as plain static files — this is
required for the Open Graph share-preview injection above to actually
run. After adding `vercel.json`, just push to your connected Git repo and
Vercel will redeploy automatically.

Since image uploads go straight from the browser to Cloudinary (see
above) rather than through the server, they work the same way on Vercel
as they do locally — no serverless filesystem limitations to worry about.

## Note on Firebase config

`js/firebase.js` still contains the original project's Firebase web config
(API key, project ID, etc.). Firebase web config values are meant to be
public/client-side, but write access should still be locked down with
**`firestore.rules`** (who can create/edit/delete blog posts). That file
must be applied in Firebase Console → Firestore Database → Rules for the
protection to actually take effect — having it in this repo alone does
nothing until you paste it in and hit Publish.