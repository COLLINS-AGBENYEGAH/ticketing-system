// public/js/dashboard.js

const token = localStorage.getItem("manager_token");
if (!token) {
  window.location.href = "login.html";
}

document.getElementById("welcome-name").textContent =
  "Hi, " + (localStorage.getItem("manager_name") || "Staff");

document.getElementById("logout-link").addEventListener("click", (e) => {
  e.preventDefault();
  localStorage.removeItem("manager_token");
  localStorage.removeItem("manager_name");
  window.location.href = "login.html";
});

function authHeaders(extra = {}) {
  return { Authorization: `Bearer ${token}`, ...extra };
}

async function apiFetch(url, options = {}) {
  const res = await fetch(url, {
    ...options,
    headers: authHeaders(options.headers || {}),
  });
  if (res.status === 401) {
    localStorage.removeItem("manager_token");
    window.location.href = "login.html";
    throw new Error("Session expired.");
  }
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Request failed.");
  return data;
}

// ---- Stats ----
async function loadStats() {
  try {
    const data = await apiFetch("/api/stats");
    document.getElementById("stat-open").textContent = data.counts["Open"] || 0;
    document.getElementById("stat-progress").textContent = data.counts["In Progress"] || 0;
    document.getElementById("stat-resolved").textContent = data.counts["Resolved"] || 0;
    document.getElementById("stat-closed").textContent = data.counts["Closed"] || 0;
  } catch (err) {
    console.error(err);
  }
}

// ---- Tickets list ----
const tbody = document.getElementById("tickets-tbody");
const emptyState = document.getElementById("empty-state");

function buildQuery() {
  const params = new URLSearchParams();
  const q = document.getElementById("filter-q").value.trim();
  const status = document.getElementById("filter-status").value;
  const category = document.getElementById("filter-category").value;
  const priority = document.getElementById("filter-priority").value;
  if (q) params.set("q", q);
  if (status) params.set("status", status);
  if (category) params.set("category", category);
  if (priority) params.set("priority", priority);
  return params.toString();
}

async function loadTickets() {
  tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; color:var(--text-muted);">Loading...</td></tr>`;
  try {
    const query = buildQuery();
    const data = await apiFetch(`/api/tickets${query ? "?" + query : ""}`);
    renderTickets(data.tickets);
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; color:var(--danger);">${err.message}</td></tr>`;
  }
}

function renderTickets(tickets) {
  tbody.innerHTML = "";
  if (tickets.length === 0) {
    emptyState.classList.remove("hidden");
    return;
  }
  emptyState.classList.add("hidden");

  tickets.forEach((t) => {
    const tr = document.createElement("tr");
    const statusClass = `badge-${t.status.replace(/\s/g, "")}`;
    const priorityClass = `badge-${t.priority}`;
    tr.innerHTML = `
      <td><strong>${t.ticket_code}</strong></td>
      <td>${escapeHtml(t.student_name)}<br><span style="color:var(--text-muted); font-size:0.78rem;">${escapeHtml(t.student_id)}</span></td>
      <td>${t.category}</td>
      <td><span class="badge ${priorityClass}">${t.priority}</span></td>
      <td><span class="badge ${statusClass}">${t.status}</span></td>
      <td>${new Date(t.created_at).toLocaleDateString()}</td>
    `;
    tr.addEventListener("click", () => openTicketModal(t.id));
    tbody.appendChild(tr);
  });
}

// ---- Filters ----
document.getElementById("refresh-btn").addEventListener("click", () => {
  loadTickets();
  loadStats();
});
["filter-status", "filter-category", "filter-priority"].forEach((id) => {
  document.getElementById(id).addEventListener("change", loadTickets);
});
let searchDebounce;
document.getElementById("filter-q").addEventListener("input", () => {
  clearTimeout(searchDebounce);
  searchDebounce = setTimeout(loadTickets, 350);
});

// ---- New Ticket (manager creates on behalf of a student, e.g. walk-in/phone) ----
document.getElementById("new-ticket-btn").addEventListener("click", openNewTicketModal);

function openNewTicketModal() {
  modalOverlay.classList.remove("hidden");
  modalContent.innerHTML = `
    <h3 style="margin-top:0; color:var(--navy);">New Ticket</h3>
    <p style="color:var(--text-muted); font-size:0.85rem; margin-top:-8px;">
      Use this to log a ticket on behalf of a student (e.g. phone or walk-in request).
    </p>
    <div class="form-grid">
      <div>
        <label for="new-student-name">Student Name</label>
        <input type="text" id="new-student-name" placeholder="e.g. Ama Owusu" />
      </div>
      <div>
        <label for="new-student-id">Student ID</label>
        <input type="text" id="new-student-id" placeholder="e.g. AIT/2023/0789" />
      </div>
      <div>
        <label for="new-email">Email (optional)</label>
        <input type="email" id="new-email" placeholder="student@example.com" />
      </div>
      <div>
        <label for="new-category">Category</label>
        <select id="new-category">
          <option value="Academic/Registrar">Academic/Registrar</option>
          <option value="IT/Computer Lab">IT/Computer Lab</option>
          <option value="Facilities/Maintenance">Facilities/Maintenance</option>
          <option value="Hostel/Accommodation">Hostel/Accommodation</option>
          <option value="Finance/Fees">Finance/Fees</option>
          <option value="Administration">Administration</option>
          <option value="Other">Other</option>
        </select>
      </div>
      <div class="full">
        <label for="new-priority">Priority</label>
        <select id="new-priority">
          <option value="Low">Low</option>
          <option value="Medium" selected>Medium</option>
          <option value="High">High</option>
          <option value="Urgent">Urgent</option>
        </select>
      </div>
      <div class="full">
        <label for="new-description">Description</label>
        <textarea id="new-description" placeholder="Describe the issue"></textarea>
      </div>
    </div>
    <div style="margin-top:16px;">
      <button id="create-ticket-btn" class="btn btn-primary btn-sm">Create Ticket</button>
      <span id="create-msg" style="margin-left:10px; font-size:0.85rem;"></span>
    </div>
  `;
  document.getElementById("create-ticket-btn").addEventListener("click", createTicket);
}

async function createTicket() {
  const payload = {
    student_name: document.getElementById("new-student-name").value.trim(),
    student_id: document.getElementById("new-student-id").value.trim(),
    email: document.getElementById("new-email").value.trim(),
    category: document.getElementById("new-category").value,
    priority: document.getElementById("new-priority").value,
    description: document.getElementById("new-description").value.trim(),
  };
  const msg = document.getElementById("create-msg");
  const btn = document.getElementById("create-ticket-btn");

  if (!payload.student_name || !payload.student_id || !payload.description) {
    msg.textContent = "Name, student ID, and description are required.";
    msg.style.color = "var(--danger)";
    return;
  }

  btn.disabled = true;
  msg.textContent = "Creating...";
  msg.style.color = "var(--text-muted)";

  try {
    const res = await fetch("/api/tickets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed to create ticket.");

    msg.textContent = `Created: ${data.ticket_code}`;
    msg.style.color = "var(--success)";
    loadTickets();
    loadStats();
    setTimeout(closeModal, 900);
  } catch (err) {
    msg.textContent = err.message;
    msg.style.color = "var(--danger)";
  } finally {
    btn.disabled = false;
  }
}

// ---- Modal: ticket detail ----
const modalOverlay = document.getElementById("modal-overlay");
const modalContent = document.getElementById("modal-content");
document.getElementById("modal-close").addEventListener("click", closeModal);
modalOverlay.addEventListener("click", (e) => {
  if (e.target === modalOverlay) closeModal();
});

function closeModal() {
  modalOverlay.classList.add("hidden");
  modalContent.innerHTML = "";
}

async function openTicketModal(id) {
  modalOverlay.classList.remove("hidden");
  modalContent.innerHTML = `<p style="color:var(--text-muted);">Loading ticket...</p>`;
  try {
    const data = await apiFetch(`/api/tickets/${id}`);
    renderModal(data.ticket, data.comments);
  } catch (err) {
    modalContent.innerHTML = `<div class="msg msg-error">${err.message}</div>`;
  }
}

function renderModal(t, comments) {
  const statusOptions = ["Open", "In Progress", "Resolved", "Closed"]
    .map((s) => `<option value="${s}" ${s === t.status ? "selected" : ""}>${s}</option>`)
    .join("");
  const priorityOptions = ["Low", "Medium", "High", "Urgent"]
    .map((p) => `<option value="${p}" ${p === t.priority ? "selected" : ""}>${p}</option>`)
    .join("");

  let commentsHtml = comments
    .map(
      (c) => `
      <div class="comment">
        <div class="meta">${escapeHtml(c.author)} (${c.author_role}) &middot; ${new Date(c.created_at).toLocaleString()}</div>
        ${escapeHtml(c.message)}
      </div>`
    )
    .join("");
  if (!commentsHtml) commentsHtml = `<p style="color:var(--text-muted); font-size:0.88rem;">No notes yet.</p>`;

  modalContent.innerHTML = `
    <h3 style="margin-top:0; color:var(--navy);">${t.ticket_code}</h3>
    <p style="color:var(--text-muted); font-size:0.85rem; margin-top:-8px;">
      ${escapeHtml(t.student_name)} (${escapeHtml(t.student_id)}) ${t.email ? "&middot; " + escapeHtml(t.email) : ""}
    </p>

    <div class="form-grid">
      <div>
        <label>Category</label>
        <input type="text" value="${t.category}" disabled />
      </div>
      <div>
        <label>Submitted</label>
        <input type="text" value="${new Date(t.created_at).toLocaleString()}" disabled />
      </div>
      <div>
        <label for="modal-status">Status</label>
        <select id="modal-status">${statusOptions}</select>
      </div>
      <div>
        <label for="modal-priority">Priority</label>
        <select id="modal-priority">${priorityOptions}</select>
      </div>
      <div class="full">
        <label for="modal-assigned">Assigned To</label>
        <input type="text" id="modal-assigned" value="${t.assigned_to ? escapeHtml(t.assigned_to) : ""}" placeholder="e.g. Kingsley (IT Support)" />
      </div>
      <div class="full">
        <label>Description</label>
        <textarea disabled>${escapeHtml(t.description)}</textarea>
      </div>
    </div>

    <div style="margin-top:16px; display:flex; align-items:center; justify-content:space-between;">
      <div>
        <button id="save-ticket-btn" class="btn btn-primary btn-sm">Save Changes</button>
        <span id="save-msg" style="margin-left:10px; font-size:0.85rem;"></span>
      </div>
      <button id="delete-ticket-btn" class="btn btn-danger btn-sm">Delete Ticket</button>
    </div>

    <hr style="margin:24px 0; border:none; border-top:1px solid var(--border);" />

    <label>Notes / Replies</label>
    <div id="comments-list" style="max-height:200px; overflow-y:auto; margin-bottom:12px;">
      ${commentsHtml}
    </div>
    <textarea id="new-comment" placeholder="Add a note or reply for the student..."></textarea>
    <div style="margin-top:10px;">
      <button id="add-comment-btn" class="btn btn-gold btn-sm">Add Note</button>
    </div>
  `;

  document.getElementById("save-ticket-btn").addEventListener("click", () => saveTicket(t.id));
  document.getElementById("add-comment-btn").addEventListener("click", () => addComment(t.id));
  document.getElementById("delete-ticket-btn").addEventListener("click", () => deleteTicket(t.id));
}

async function deleteTicket(id) {
  const confirmed = confirm("Delete this ticket permanently? This cannot be undone.");
  if (!confirmed) return;

  try {
    await apiFetch(`/api/tickets/${id}`, { method: "DELETE" });
    closeModal();
    loadTickets();
    loadStats();
  } catch (err) {
    alert(err.message);
  }
}

async function saveTicket(id) {
  const status = document.getElementById("modal-status").value;
  const priority = document.getElementById("modal-priority").value;
  const assigned_to = document.getElementById("modal-assigned").value.trim();
  const saveMsg = document.getElementById("save-msg");
  const btn = document.getElementById("save-ticket-btn");

  btn.disabled = true;
  saveMsg.textContent = "Saving...";
  saveMsg.style.color = "var(--text-muted)";

  try {
    await apiFetch(`/api/tickets/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status, priority, assigned_to }),
    });
    saveMsg.textContent = "Saved.";
    saveMsg.style.color = "var(--success)";
    loadTickets();
    loadStats();
  } catch (err) {
    saveMsg.textContent = err.message;
    saveMsg.style.color = "var(--danger)";
  } finally {
    btn.disabled = false;
  }
}

async function addComment(id) {
  const textarea = document.getElementById("new-comment");
  const message = textarea.value.trim();
  if (!message) return;

  const btn = document.getElementById("add-comment-btn");
  btn.disabled = true;
  btn.textContent = "Adding...";

  try {
    const data = await apiFetch(`/api/tickets/${id}/comments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message }),
    });
    textarea.value = "";
    const commentsList = document.getElementById("comments-list");
    commentsList.innerHTML = data.comments
      .map(
        (c) => `
        <div class="comment">
          <div class="meta">${escapeHtml(c.author)} (${c.author_role}) &middot; ${new Date(c.created_at).toLocaleString()}</div>
          ${escapeHtml(c.message)}
        </div>`
      )
      .join("");
  } catch (err) {
    alert(err.message);
  } finally {
    btn.disabled = false;
    btn.textContent = "Add Note";
  }
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str == null ? "" : str;
  return div.innerHTML;
}

// ---- Init ----
loadStats();
loadTickets();
