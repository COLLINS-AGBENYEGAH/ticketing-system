// lib/auth.js
// Small JWT helper so the IT Manager dashboard is protected.
// Students never need a login - only the manager routes check this.

const jwt = require("jsonwebtoken");

const JWT_SECRET = process.env.JWT_SECRET || "dev-only-secret-change-me";

function signToken(manager) {
  return jwt.sign(
    { id: manager.id, username: manager.username, full_name: manager.full_name },
    JWT_SECRET,
    { expiresIn: "8h" }
  );
}

function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (err) {
    return null;
  }
}

/** Express middleware: requires a valid "Authorization: Bearer <token>" header */
function requireAuth(req, res, next) {
  const header = req.headers["authorization"] || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: "Missing authorization token." });
  }

  const payload = verifyToken(token);
  if (!payload) {
    return res.status(401).json({ error: "Invalid or expired session. Please log in again." });
  }

  req.manager = payload;
  next();
}

module.exports = { signToken, verifyToken, requireAuth };
