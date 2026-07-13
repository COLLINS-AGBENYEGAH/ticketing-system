// public/js/login.js

// If already logged in, skip straight to the dashboard
if (localStorage.getItem("manager_token")) {
  window.location.href = "dashboard.html";
}

const form = document.getElementById("login-form");
const msg = document.getElementById("login-msg");

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  msg.innerHTML = "";

  const username = document.getElementById("username").value.trim();
  const password = document.getElementById("password").value;

  const btn = form.querySelector("button[type=submit]");
  btn.disabled = true;
  btn.textContent = "Signing in...";

  try {
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });
    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error || "Login failed.");
    }

    localStorage.setItem("manager_token", data.token);
    localStorage.setItem("manager_name", data.manager.full_name || data.manager.username);
    window.location.href = "dashboard.html";
  } catch (err) {
    msg.innerHTML = `<div class="msg msg-error">${err.message}</div>`;
  } finally {
    btn.disabled = false;
    btn.textContent = "Log In";
  }
});
