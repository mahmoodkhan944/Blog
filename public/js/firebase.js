// ===== FIREBASE INITIALIZATION =====
// For Firebase JS SDK v8 (compat) — loaded via <script> tags in every page.
const firebaseConfig = {
  apiKey: "AIzaSyDOEYLjPmWMtq6jc0oeZNelMWz4dtqCwMM",
  authDomain: "blogging-website-12a92.firebaseapp.com",
  projectId: "blogging-website-12a92",
  storageBucket: "blogging-website-12a92.firebasestorage.app",
  messagingSenderId: "429894491677",
  appId: "1:429894491677:web:3dcad6d9d90908a51530f4",
  measurementId: "G-FS370KPPMV"
};

firebase.initializeApp(firebaseConfig);

// Exposed globally so every other script (home.js, blog.js, editor.js,
// dashboard.js, auth.js) can use `db` / `auth` directly.
const db = firebase.firestore();
const auth = firebase.auth();