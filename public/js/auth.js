// ===== AUTH HELPERS =====
// Plain global functions (classic script — matches the rest of the app,
// no bundler/module system involved).

function signup(email, password) {
  return auth.createUserWithEmailAndPassword(email, password);
}

function login(email, password) {
  return auth.signInWithEmailAndPassword(email, password);
}

function logout() {
  return auth.signOut();
}

// Redirects to /login if nobody is signed in.
// Call this at the top of any page that should be protected.
function requireAuth() {
  auth.onAuthStateChanged(user => {
    if (!user) location.href = "/login";
  });
}

function friendlyAuthError(err) {
  const map = {
    "auth/invalid-email": "That email address doesn't look right.",
    "auth/user-not-found": "No account found with that email.",
    "auth/wrong-password": "Incorrect password.",
    "auth/email-already-in-use": "An account with this email already exists.",
    "auth/weak-password": "Password should be at least 6 characters.",
    "auth/invalid-credential": "Incorrect email or password.",
    "auth/operation-not-allowed": "Email/password sign-in isn't enabled for this project yet. Enable it in Firebase Console → Authentication → Sign-in method.",
    "auth/too-many-requests": "Too many attempts. Please wait a bit and try again.",
    "auth/network-request-failed": "Network error — check your internet connection and try again.",
    "auth/user-disabled": "This account has been disabled.",
    "auth/api-key-not-valid.-please-pass-a-valid-api-key.": "Firebase API key looks invalid. Check firebaseConfig in js/firebase.js."
  };

  // Log the raw error so it's always visible in DevTools, even if we
  // don't have a friendly message mapped for this specific code yet.
  console.error("Auth error:", err.code, err.message);

  return map[err.code] || err.message || "Something went wrong. Please try again.";
}