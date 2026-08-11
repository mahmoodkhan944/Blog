renderNav("settings");
requireAuth();

auth.onAuthStateChanged(user => {
  if (!user) return;
  document.querySelector("#displayName").value = user.displayName || "";
  document.querySelector("#emailField").value = user.email || "";
});

document.querySelector("#settingsForm").addEventListener("submit", async e => {
  e.preventDefault();

  const nameInput = document.querySelector("#displayName");
  const submitBtn = document.querySelector("#settingsSubmit");
  const errorBox = document.querySelector("#settingsError");
  const name = nameInput.value.trim();

  if (name.length < 2) {
    errorBox.textContent = "Name is too short.";
    errorBox.classList.add("show");
    return;
  }

  submitBtn.disabled = true;
  errorBox.classList.remove("show");

  try {
    await auth.currentUser.updateProfile({ displayName: name });
    toast("Settings saved ✅", "success");
  } catch (err) {
    console.error(err);
    errorBox.textContent = "Could not save changes. Please try again.";
    errorBox.classList.add("show");
  } finally {
    submitBtn.disabled = false;
  }
});