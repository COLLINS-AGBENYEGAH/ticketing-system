// api/index.js
// All backend routes live in one Express app. This runs locally via
// server.js, and can also be deployed as a single serverless function
// on Vercel/Netlify (see vercel.json / netlify.toml + README).

const express = require("express");
const bcrypt = require("bcryptjs");
const { db, initDb, generateTicketCode } = require("../lib/db");
const { signToken, requireAuth } = require("../lib/auth");
const sendEmail = require("../services/emailService");

const app = express();
app.use(express.json());

let dbReady = null;
function ensureDb() {
  if (!dbReady) dbReady = initDb();
  return dbReady;
}
app.use(async (req, res, next) => {
  try {
    await ensureDb();
    next();
  } catch (err) {
    console.error("DB init error:", err);
    res.status(500).json({ error: "Database initialization failed." });
  }
});

const CATEGORIES = [
  "Academic/Registrar",
  "IT/Computer Lab",
  "Facilities/Maintenance",
  "Hostel/Accommodation",
  "Finance/Fees",
  "Administration",
  "Other",
];
const PRIORITIES = ["Low", "Medium", "High", "Urgent"];
const STATUSES = ["Open", "In Progress", "Resolved", "Closed"];

// ---------- AUTH ----------

// POST /api/auth/login  { username, password }
app.post("/api/auth/login", async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ error: "Username and password are required." });
  }

  const result = await db.execute({
    sql: "SELECT * FROM managers WHERE username = ?",
    args: [username],
  });

  const manager = result.rows[0];
  if (!manager) {
    return res.status(401).json({ error: "Invalid username or password." });
  }

  const valid = await bcrypt.compare(password, manager.password_hash);
  if (!valid) {
    return res.status(401).json({ error: "Invalid username or password." });
  }

  const token = signToken(manager);
  res.json({ token, manager: { username: manager.username, full_name: manager.full_name } });
});

// ---------- STUDENT-FACING ----------

// POST /api/tickets  - submit a new ticket (public, no auth)
app.post("/api/tickets", async (req, res) => {
  const { student_name, student_id, email, category, priority, description } = req.body || {};

  if (!student_name || !student_id || !category || !description) {
    return res.status(400).json({
      error: "student_name, student_id, category, and description are required.",
    });
  }
  //});
  if (!CATEGORIES.includes(category)) {
    return res.status(400).json({ error: `category must be one of: ${CATEGORIES.join(", ")}` });
  }
  const finalPriority = PRIORITIES.includes(priority) ? priority : "Medium";

  let ticketCode = generateTicketCode();
  // extremely unlikely to collide, but guard anyway
  for (let attempt = 0; attempt < 5; attempt++) {
    const existing = await db.execute({
      sql: "SELECT id FROM tickets WHERE ticket_code = ?",
      args: [ticketCode],
    });
    if (existing.rows.length === 0) break;
    ticketCode = generateTicketCode();
  }

  const result = await db.execute({
    sql: `INSERT INTO tickets (ticket_code, student_name, student_id, email, category, priority, description, status)
          VALUES (?, ?, ?, ?, ?, ?, ?, 'Open')`,
    args: [ticketCode, student_name, student_id, email || null, category, finalPriority, description],
  });

    res.status(201).json({
    message: "Ticket submitted successfully.",
    ticket_code: ticketCode,
    id: Number(result.lastInsertRowid),
  });

  if (email) {
    const baseUrl = process.env.BASE_URL || `http://localhost:${process.env.PORT || 3000}`;
    const trackUrl = `${baseUrl}/api/tickets/track/${ticketCode}`;

    const text = `Hello ${student_name},

We have received your ticket ${ticketCode}.

Category: ${category}

Our support team will review it and update you shortly.

Track your ticket:
https://ticketing-system-three-omega.vercel.app/index.html

Thank you,
Support Team`;

    const html = `
      <p>Hello ${student_name},</p>

      <p>We have received your ticket <strong>${ticketCode}</strong>.</p>

      <p><strong>Category:</strong> ${category}</p>

      <p>Our support team will review it and update you shortly.</p>

      <p>
        <a href="https://ticketing-system-three-omega.vercel.app/index.html">
          Track Ticket
        </a>
      </p>

      <p>Thank you,<br>Support Team</p>
    `;

    sendEmail(
      email,
      `Ticket Received: ${ticketCode}`,
      text,
      html
    ).catch((err) => {
      console.error("Failed to send ticket receipt email:", err.message);
    });
  }
});
// GET /api/tickets/track/:code - student checks status of their own ticket (public)
app.get("/api/tickets/track/:code", async (req, res) => {
  const { code } = req.params;
  const result = await db.execute({
    sql: "SELECT * FROM tickets WHERE ticket_code = ?",
    args: [code.toUpperCase()],
  });

  const ticket = result.rows[0];
  if (!ticket) {
    return res.status(404).json({ error: "No ticket found with that code." });
  }

  const comments = await db.execute({
    sql: "SELECT author, author_role, message, created_at FROM comments WHERE ticket_id = ? ORDER BY created_at ASC",
    args: [ticket.id],
  });

  res.json({ ticket, comments: comments.rows });
});

// ---------- MANAGER-FACING (protected) ----------

// GET /api/tickets?status=&category=&priority=&q=
app.get("/api/tickets", requireAuth, async (req, res) => {
  const { status, category, priority, q } = req.query;
  let sql = "SELECT * FROM tickets WHERE 1=1";
  const args = [];

  if (status) {
    sql += " AND status = ?";
    args.push(status);
  }
  if (category) {
    sql += " AND category = ?";
    args.push(category);
  }
  if (priority) {
    sql += " AND priority = ?";
    args.push(priority);
  }
  if (q) {
    sql += " AND (student_name LIKE ? OR student_id LIKE ? OR ticket_code LIKE ? OR description LIKE ?)";
    const like = `%${q}%`;
    args.push(like, like, like, like);
  }
  sql += " ORDER BY created_at DESC";

  const result = await db.execute({ sql, args });
  res.json({ tickets: result.rows });
});

// GET /api/tickets/:id - single ticket + its comments
app.get("/api/tickets/:id", requireAuth, async (req, res) => {
  const { id } = req.params;
  const result = await db.execute({ sql: "SELECT * FROM tickets WHERE id = ?", args: [id] });
  const ticket = result.rows[0];
  if (!ticket) return res.status(404).json({ error: "Ticket not found." });

  const comments = await db.execute({
    sql: "SELECT * FROM comments WHERE ticket_id = ? ORDER BY created_at ASC",
    args: [id],
  });

  res.json({ ticket, comments: comments.rows });
});

// PATCH /api/tickets/:id - update status / priority / assigned_to
app.patch("/api/tickets/:id", requireAuth, async (req, res) => {
  const { id } = req.params;
  const { status, priority, assigned_to } = req.body || {};

  const existingResult = await db.execute({ sql: "SELECT * FROM tickets WHERE id = ?", args: [id] });
  const existing = existingResult.rows[0];
  if (!existing) return res.status(404).json({ error: "Ticket not found." });

  if (status && !STATUSES.includes(status)) {
    return res.status(400).json({ error: `status must be one of: ${STATUSES.join(", ")}` });
  }
  if (priority && !PRIORITIES.includes(priority)) {
    return res.status(400).json({ error: `priority must be one of: ${PRIORITIES.join(", ")}` });
  }

  const fields = [];
  const args = [];
  if (status) {
    fields.push("status = ?");
    args.push(status);
  }
  if (priority) {
    fields.push("priority = ?");
    args.push(priority);
  }
  if (assigned_to !== undefined) {
    fields.push("assigned_to = ?");
    args.push(assigned_to);
  }
  fields.push("updated_at = datetime('now')");
  args.push(id);

  await db.execute({
    sql: `UPDATE tickets SET ${fields.join(", ")} WHERE id = ?`,
    args,
  });

  const updatedResult = await db.execute({ sql: "SELECT * FROM tickets WHERE id = ?", args: [id] });
  const updatedTicket = updatedResult.rows[0];

  if (status && existing.email) {
    const statusMessage =
      status === "Resolved"
        ? `Your ticket ${existing.ticket_code} has been resolved. Please review the details in the portal.`
        : `Your ticket ${existing.ticket_code} status has changed from ${existing.status} to ${status}.`;

    const baseUrl = process.env.BASE_URL || `http://localhost:${process.env.PORT || 3000}`;
    const trackUrl = `${baseUrl}/api/tickets/track/${existing.ticket_code}`;
    const text = `Hello ${existing.student_name},\n\n${statusMessage}\n\nYou can track your ticket in the portal using code: ${existing.ticket_code}.\n\nhttps://ticketing-system-three-omega.vercel.app/index.html\n\nThank you,\nSupport Team`;
    const html = `<p>Hello ${existing.student_name},</p>
<p>${statusMessage}</p>
<p><a href="${trackUrl}">View and track your ticket</a></p>
<p>Thank you,<br>Support Team</p>`;

    sendEmail(existing.email, `Ticket update: ${existing.ticket_code}`, text, html).catch((err) => {
      console.error("Failed to send status update email:", err.message);
    });
  }

  res.json({ message: "Ticket updated.", ticket: updatedTicket });
});

// POST /api/tickets/:id/comments - manager adds a reply/note
app.post("/api/tickets/:id/comments", requireAuth, async (req, res) => {
  const { id } = req.params;
  const { message } = req.body || {};
  if (!message) return res.status(400).json({ error: "message is required." });

  const ticketResult = await db.execute({ sql: "SELECT * FROM tickets WHERE id = ?", args: [id] });
  const ticket = ticketResult.rows[0];
  if (!ticket) return res.status(404).json({ error: "Ticket not found." });

  const managerName = req.manager.full_name || req.manager.username;
  await db.execute({
    sql: "INSERT INTO comments (ticket_id, author, author_role, message) VALUES (?, ?, 'manager', ?)",
    args: [id, managerName, message],
  });

  await db.execute({
    sql: "UPDATE tickets SET updated_at = datetime('now') WHERE id = ?",
    args: [id],
  });

  const comments = await db.execute({
    sql: "SELECT * FROM comments WHERE ticket_id = ? ORDER BY created_at ASC",
    args: [id],
  });

  if (ticket.email) {
    const baseUrl = process.env.BASE_URL || `http://localhost:${process.env.PORT || 3000}`;
    const trackUrl = `${baseUrl}/api/tickets/track/${ticket.ticket_code}`;
    const text = `Hello ${ticket.student_name},\n\nYour ticket ${ticket.ticket_code} has a new response from ${managerName}:\n\n${message}\n\nYou can view the ticket here: ${trackUrl}\n\nThank you,\nSupport Team`;
    const html = `<p>Hello ${ticket.student_name},</p>
<p>Your ticket <strong>${ticket.ticket_code}</strong> has a new response from <strong>${managerName}</strong>:</p>
<p>${message.replace(/\n/g, '<br>')}</p>
<p><a href="${trackUrl}">View the ticket and replies</a></p>
<p>Thank you,<br>Support Team</p>`;

    sendEmail(ticket.email, `IT response received: ${ticket.ticket_code}`, text, html).catch((err) => {
      console.error("Failed to send manager reply email:", err.message);
    });
  }

  res.status(201).json({ message: "Comment added.", comments: comments.rows });
});

// DELETE /api/tickets/:id - manager deletes a ticket (and its comments)
app.delete("/api/tickets/:id", requireAuth, async (req, res) => {
  const { id } = req.params;
  const existing = await db.execute({ sql: "SELECT id FROM tickets WHERE id = ?", args: [id] });
  if (existing.rows.length === 0) return res.status(404).json({ error: "Ticket not found." });

  await db.execute({ sql: "DELETE FROM comments WHERE ticket_id = ?", args: [id] });
  await db.execute({ sql: "DELETE FROM tickets WHERE id = ?", args: [id] });

  res.json({ message: "Ticket deleted." });
});

// GET /api/stats - quick counts for dashboard cards
app.get("/api/stats", requireAuth, async (req, res) => {
  const result = await db.execute(
    "SELECT status, COUNT(*) as count FROM tickets GROUP BY status"
  );
  const counts = { Open: 0, "In Progress": 0, Resolved: 0, Closed: 0 };
  for (const row of result.rows) {
    counts[row.status] = Number(row.count);
  }
  res.json({ counts });
});

module.exports = app;
