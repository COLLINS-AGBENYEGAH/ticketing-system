// lib/db.js
// Database client setup using libSQL (SQLite-compatible).
//
// LOCAL DEVELOPMENT: uses a plain local SQLite file (./data/tickets.db)
// PRODUCTION (Vercel/Netlify): point DATABASE_URL + DATABASE_AUTH_TOKEN
//   at a Turso database (https://turso.tech) - same SQLite engine,
//   but reachable over the network so it survives serverless cold starts.
//
// Nothing about the SQL you write changes between the two modes.

const { createClient } = require("@libsql/client");
const path = require("path");
const fs = require("fs");

const url = process.env.DATABASE_URL || (() => {
  // Only touch the local filesystem when we're actually using a local
  // SQLite file (i.e. no DATABASE_URL was provided - local dev mode).
  // On Vercel/Netlify the filesystem is read-only, so this must never
  // run in production - it would crash every request with EROFS.
  const dataDir = path.join(__dirname, "..", "data");
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  return `file:${path.join(dataDir, "tickets.db")}`;
})();
const authToken = process.env.DATABASE_AUTH_TOKEN || undefined;

const db = createClient({ url, authToken });

/**
 * Creates all tables if they do not already exist, and seeds a default
 * IT manager account (only if the managers table is empty).
 */
async function initDb() {
  await db.execute(`
    CREATE TABLE IF NOT EXISTS managers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      full_name TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS tickets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ticket_code TEXT UNIQUE NOT NULL,
      student_name TEXT NOT NULL,
      student_id TEXT NOT NULL,
      email TEXT,
      category TEXT NOT NULL,
      priority TEXT NOT NULL DEFAULT 'Medium',
      description TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'Open',
      assigned_to TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS comments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ticket_id INTEGER NOT NULL,
      author TEXT NOT NULL,
      author_role TEXT NOT NULL DEFAULT 'manager',
      message TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE
    );
  `);

  const existing = await db.execute("SELECT COUNT(*) as count FROM managers");
  const count = Number(existing.rows[0].count);

  if (count === 0) {
    const bcrypt = require("bcryptjs");
    const defaultUsername = process.env.DEFAULT_MANAGER_USERNAME || "admin";
    const defaultPassword = process.env.DEFAULT_MANAGER_PASSWORD || "admin123";
    const hash = await bcrypt.hash(defaultPassword, 10);
    await db.execute({
      sql: "INSERT INTO managers (username, password_hash, full_name) VALUES (?, ?, ?)",
      args: [defaultUsername, hash, "Support Staff"],
    });
    console.log(
      `Seeded default IT manager account -> username: "${defaultUsername}", password: "${defaultPassword}". CHANGE THIS in production via env vars.`
    );
  }
}

/** Generates a human-friendly, unique-ish ticket code e.g. TCK-8X4K2P */
function generateTicketCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no ambiguous chars
  let code = "TCK-";
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

module.exports = { db, initDb, generateTicketCode };
