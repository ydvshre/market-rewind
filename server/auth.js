const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const db = require("./db");

const secret = () => process.env.JWT_SECRET || "dev-only-secret-change-me";

function sign(user) {
  return jwt.sign({ id: user.id, email: user.email }, secret(), { expiresIn: "7d" });
}

function authRequired(req, res, next) {
  try {
    const header = req.headers.authorization || "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : null;
    if (!token) return res.status(401).json({ error: "Authentication required" });
    req.user = jwt.verify(token, secret());
    next();
  } catch {
    return res.status(401).json({ error: "Invalid or expired session" });
  }
}

function register(email, password) {
  const clean = email.trim().toLowerCase();
  if (!clean || password.length < 6) throw new Error("Use a valid email and a password of at least 6 characters.");
  const hash = bcrypt.hashSync(password, 10);
  const now = new Date().toISOString();
  const info = db.prepare("INSERT INTO users(email,password_hash,created_at) VALUES(?,?,?)").run(clean, hash, now);
  db.prepare("INSERT INTO user_checkpoints(user_id,last_viewed_at) VALUES(?,?)").run(info.lastInsertRowid, now);
  return { id: Number(info.lastInsertRowid), email: clean };
}

function login(email, password) {
  const user = db.prepare("SELECT * FROM users WHERE email=?").get(email.trim().toLowerCase());
  if (!user || !bcrypt.compareSync(password, user.password_hash)) throw new Error("Invalid email or password.");
  return { id: user.id, email: user.email };
}

module.exports = { authRequired, register, login, sign };
