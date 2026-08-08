renderNav("login");

let mode = "login"; // "login" | "signup"

const form = document.querySelector("#authForm");
const nameField = document.querySelector("#nameField");
const nameInput = document.querySelector("#name");
const emailField = document.querySelector("#email");
const passwordField = document.querySelector("#password");
const submitBtn = document.querySelector("#authSubmit");
const errorBox = document.querySelector("#authError");
const titleEl = document.querySelector("#authTitle");
const subtitleEl = document.querySelector("#authSubtitle");
const switchBtn = document.querySelector("#authSwitch");

// If already logged in, skip straight to the dashboard.
auth.onAuthStateChanged(user => {
  if (user) location.href = "/dashboard";
});

switchBtn.addEventListener("click", () => {
  mode = mode === "login" ? "signup" : "login";
  updateUI();
});

function updateUI() {
  errorBox.classList.remove("show");

  if (mode === "login") {
    titleEl.textContent = "Welcome back";
    subtitleEl.textContent = "Log in to write and manage your blogs.";
    submitBtn.textContent = "Log in";
    switchBtn.innerHTML = `Don't have an account? <strong>Sign up</strong>`;
    nameField.style.display = "none";
  } else {
    titleEl.textContent = "Create an account";
    subtitleEl.textContent = "Sign up to start writing blogs.";
    submitBtn.textContent = "Sign up";
    switchBtn.innerHTML = `Already have an account? <strong>Log in</strong>`;
    nameField.style.display = "";
  }
}

form.addEventListener("submit", async e => {
  e.preventDefault();

  const name = nameInput.value.trim();
  const email = emailField.value.trim();
  const password = passwordField.value;

  if (mode === "signup" && name.length < 2) {
    errorBox.textContent = "Please enter your name.";
    errorBox.classList.add("show");
    return;
  }

  submitBtn.disabled = true;
  errorBox.classList.remove("show");

  try {
    if (mode === "login") {
      await login(email, password);
    } else {
      const cred = await signup(email, password);
      await cred.user.updateProfile({ displayName: name });
    }
    location.href = "/dashboard";
  } catch (err) {
    errorBox.textContent = friendlyAuthError(err);
    errorBox.classList.add("show");
    submitBtn.disabled = false;
  }
});

updateUI();