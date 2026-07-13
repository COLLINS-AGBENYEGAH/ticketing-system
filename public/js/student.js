// public/js/student.js

// ---- Tab switching ----
const tabBtns = document.querySelectorAll(".tab-btn");
const submitPanel = document.getElementById("submit-panel");
const trackPanel = document.getElementById("track-panel");

tabBtns.forEach((btn) => {
  btn.addEventListener("click", () => {
    tabBtns.forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    if (btn.dataset.tab === "submit") {
      submitPanel.classList.remove("hidden");
      trackPanel.classList.add("hidden");
    } else {
      trackPanel.classList.remove("hidden");
      submitPanel.classList.add("hidden");
    }
  });
});

// ---- Submit ticket ----
const form = document.getElementById("ticket-form");
const submitMsg = document.getElementById("submit-msg");

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  submitMsg.innerHTML = "";

  const payload = {
    student_name: document.getElementById("student_name").value.trim(),
    student_id: document.getElementById("student_id").value.trim(),
    email: document.getElementById("email").value.trim(),
    category: document.getElementById("category").value,
    priority: document.getElementById("priority").value,
    description: document.getElementById("description").value.trim(),
  };

  const submitBtn = form.querySelector("button[type=submit]");
  submitBtn.disabled = true;
  submitBtn.textContent = "Submitting...";

  try {
    const res = await fetch("/api/tickets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error || "Something went wrong.");
    }

    submitMsg.innerHTML = `
      <div class="msg msg-success">
        Ticket submitted! Your ticket code is <strong>${data.ticket_code}</strong>.
        Save this code to track your ticket's status later.
      </div>`;
    form.reset();
  } catch (err) {
    submitMsg.innerHTML = `<div class="msg msg-error">${err.message}</div>`;
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = "Submit Ticket";
  }
});

// ---- Track ticket ----
const trackBtn = document.getElementById("track-btn");
const trackCodeInput = document.getElementById("track-code");
const trackResult = document.getElementById("track-result");

trackBtn.addEventListener("click", async () => {
  const code = trackCodeInput.value.trim().toUpperCase();
  trackResult.innerHTML = "";
  if (!code) return;

  trackBtn.disabled = true;
  trackBtn.textContent = "Checking...";

  try {
    const res = await fetch(`/api/tickets/track/${encodeURIComponent(code)}`);
    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error || "Ticket not found.");
    }

    const t = data.ticket;
    const statusClass = `badge-${t.status.replace(/\s/g, "")}`;
    const priorityClass = `badge-${t.priority}`;

    let commentsHtml = "";
    if (data.comments.length > 0) {
      commentsHtml = `<div style="margin-top:16px;"><label>Updates from IT Support</label>`;
      data.comments.forEach((c) => {
        commentsHtml += `
          <div class="comment">
            <div class="meta">${c.author} &middot; ${new Date(c.created_at).toLocaleString()}</div>
            ${escapeHtml(c.message)}
          </div>`;
      });
      commentsHtml += `</div>`;
    }

    trackResult.innerHTML = `
      <div class="card" style="box-shadow:none; border:1px solid var(--border);">
        <div style="display:flex; justify-content:space-between; flex-wrap:wrap; gap:8px;">
          <div>
            <strong>${t.ticket_code}</strong> &mdash; ${t.category}
            <div style="color:var(--text-muted); font-size:0.85rem; margin-top:4px;">
              Submitted ${new Date(t.created_at).toLocaleString()}
            </div>
          </div>
          <div>
            <span class="badge ${statusClass}">${t.status}</span>
            <span class="badge ${priorityClass}">${t.priority}</span>
          </div>
        </div>
        <p style="margin-top:14px;">${escapeHtml(t.description)}</p>
        ${commentsHtml}
      </div>`;
  } catch (err) {
    trackResult.innerHTML = `<div class="msg msg-error">${err.message}</div>`;
  } finally {
    trackBtn.disabled = false;
    trackBtn.textContent = "Check Status";
  }
});

trackCodeInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") trackBtn.click();
});

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}
