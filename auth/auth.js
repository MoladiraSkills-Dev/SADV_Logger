/**
 * ============================================================================
 * SADV LOGGER - AUTHENTICATION CONTROLLER (auth/auth.js)
 * Handles Sign In, Registration & Role Redirection
 * ============================================================================
 */

document.addEventListener("DOMContentLoaded", () => {
  // Check if session already exists, redirect accordingly
  const session = getSession();
  if (session && session.user && session.accountType) {
    if (session.accountType === "Admin") {
      window.location.href = "admin/index.html";
    } else {
      window.location.href = "employee/index.html";
    }
  }
});

function toggleAuthMode(toLogin) {
  const alertBox = document.getElementById("authAlert");
  if (alertBox) alertBox.classList.add("hidden");

  const authTitle = document.getElementById("authTitle");
  const authSubtitle = document.getElementById("authSubtitle");
  const loginForm = document.getElementById("loginForm");
  const registerForm = document.getElementById("registerForm");

  if (toLogin) {
    if (authTitle) authTitle.innerHTML = `Welcome to <span class="txt-blue">SADV</span> <span class="txt-pink">Logger</span>`;
    if (authSubtitle) authSubtitle.innerText = "Authenticate your workspace credentials to access telemetry attendance.";
    if (loginForm) loginForm.classList.remove("hidden");
    if (registerForm) registerForm.classList.add("hidden");
  } else {
    if (authTitle) authTitle.innerHTML = `Create <span class="txt-pink">SADV</span> Account`;
    if (authSubtitle) authSubtitle.innerText = "Register your staff profile to start logging attendance and leaves.";
    if (loginForm) loginForm.classList.add("hidden");
    if (registerForm) registerForm.classList.remove("hidden");
  }
}

async function handleLoginSubmit(e) {
  e.preventDefault();
  const emailInput = document.getElementById("loginEmail");
  const passwordInput = document.getElementById("loginPassword");

  const email = emailInput ? emailInput.value.trim() : "";
  const password = passwordInput ? passwordInput.value : "";

  if (!email || !password) {
    showAlert("authAlert", "Please enter both work email and password.", "danger");
    return;
  }

  showLoader(true, "Verifying SADV credentials...");

  try {
    const res = await callApi("loginUser", { email, password });
    showLoader(false);

    if (res.status === "success") {
      saveSession(res.user, res.accountType);
      showAlert("authAlert", `Welcome back, ${res.user.firstName}! Redirecting...`, "success");

      setTimeout(() => {
        if (res.accountType === "Admin") {
          window.location.href = "admin/index.html";
        } else {
          window.location.href = "employee/index.html";
        }
      }, 700);
    } else {
      showAlert("authAlert", res.message || "Invalid login credentials.", "danger");
    }
  } catch (err) {
    showLoader(false);
    showAlert("authAlert", "Unable to connect to SADV Logger server. Please check your network or Web App URL.", "danger");
  }
}

async function handleRegisterSubmit(e) {
  e.preventDefault();
  const firstInput = document.getElementById("regFirst");
  const lastInput = document.getElementById("regLast");
  const emailInput = document.getElementById("regEmail");
  const passInput = document.getElementById("regPassword");

  const firstName = firstInput ? firstInput.value.trim() : "";
  const lastName = lastInput ? lastInput.value.trim() : "";
  const email = emailInput ? emailInput.value.trim() : "";
  const password = passInput ? passInput.value : "";

  if (!firstName || !lastName || !email || !password) {
    showAlert("authAlert", "All fields are required for staff registration.", "danger");
    return;
  }

  if (password.length < 6) {
    showAlert("authAlert", "Password must be at least 6 characters long.", "danger");
    return;
  }

  showLoader(true, "Registering profile records on SADV Database...");

  try {
    const res = await callApi("registerUser", { email, firstName, lastName, password });
    showLoader(false);

    if (res.status === "success") {
      document.getElementById("registerForm").reset();
      toggleAuthMode(true);
      showAlert("authAlert", "Account created successfully! You can now log in.", "success");
    } else {
      showAlert("authAlert", res.message || "Registration failed.", "danger");
    }
  } catch (err) {
    showLoader(false);
    showAlert("authAlert", "Unable to reach SADV server. " + err.message, "danger");
  }
}
