require("dotenv").config();
const express = require("express");
const cors = require("cors");
const path = require("path");
const db = require("./db");
const { authRequired, register, login, sign } = require("./auth");
const { ensureStock, refreshTickers, COMPANY_NAMES } = require("./market");

const app = express();
const PORT = Number(process.env.PORT || 3000);

app.use(cors());
app.use(express.json());

app.get("/api/health", (_, res) => res.json({ ok: true, mode: process.env.ALPHA_VANTAGE_KEY ? "live-or-fallback" : "demo" }));

app.post("/api/auth/register", async (req, res) => {
  try {
    const user = register(req.body.email || "", req.body.password || "");
    res.status(201).json({ user, token: sign(user) });
  } catch (e) {
    const message = String(e.message).includes("UNIQUE") ? "An account with that email already exists." : e.message;
    res.status(400).json({ error: message });
  }
});

app.post("/api/auth/login", (req, res) => {
  try {
    const user = login(req.body.email || "", req.body.password || "");
    res.json({ user, token: sign(user) });
  } catch (e) {
    res.status(401).json({ error: e.message });
  }
});

app.get("/api/symbols", authRequired, (req, res) => {
  const q = String(req.query.q || "").trim().toUpperCase();
  if (!q) return res.json({ symbols: [] });
  const symbols = Object.entries(COMPANY_NAMES)
    .filter(([ticker, name]) => ticker.includes(q) || name.toUpperCase().includes(q))
    .slice(0, 8)
    .map(([ticker, name]) => ({ ticker, companyName: name }));
  res.json({ symbols });
});

app.get("/api/me", authRequired, (req, res) => {
  const user = db.prepare("SELECT id,email,created_at FROM users WHERE id=?").get(req.user.id);
  res.json({ user });
});

app.get("/api/watchlist", authRequired, async (req, res) => {
  try {
    const oldCheckpoint = db.prepare("SELECT last_viewed_at FROM user_checkpoints WHERE user_id=?").get(req.user.id);
    const checkpoint = oldCheckpoint?.last_viewed_at || new Date(0).toISOString();
    const items = db.prepare("SELECT ticker FROM watchlist_items WHERE user_id=? ORDER BY added_at DESC").all(req.user.id);
    const tickers = items.map(x => x.ticker);

    // Shared market computation. It does not use req.user.id.
    await refreshTickers(tickers);

    const now = new Date().toISOString();
    db.prepare(`
      INSERT INTO user_checkpoints(user_id,last_viewed_at) VALUES(?,?)
      ON CONFLICT(user_id) DO UPDATE SET last_viewed_at=excluded.last_viewed_at
    `).run(req.user.id, now);

    const stocks = db.prepare(`
      SELECT s.*, 
        (SELECT COUNT(*) FROM market_events e WHERE e.ticker=s.ticker AND e.detected_at > ?) AS event_count
      FROM stocks s
      JOIN watchlist_items w ON w.ticker=s.ticker
      WHERE w.user_id=?
      ORDER BY w.added_at DESC
    `).all(checkpoint, req.user.id);

    const events = db.prepare(`
      SELECT e.*
      FROM market_events e
      JOIN watchlist_items w ON w.ticker=e.ticker
      WHERE w.user_id=? AND e.detected_at > ?
      ORDER BY e.detected_at DESC
    `).all(req.user.id, checkpoint);

    res.json({
      checkpoint,
      openedAt: now,
      stocks,
      events,
      mode: process.env.ALPHA_VANTAGE_KEY ? "Live when API succeeds; otherwise demo fallback" : "Demo mode"
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Could not load watchlist." });
  }
});

app.post("/api/watchlist", authRequired, async (req, res) => {
  try {
    const ticker = String(req.body.ticker || "").trim().toUpperCase();
    if (!/^[A-Z0-9.-]{1,12}$/.test(ticker)) return res.status(400).json({ error: "Enter a valid ticker symbol." });
    const now = new Date().toISOString();
    await ensureStock(ticker);
    db.prepare("INSERT OR IGNORE INTO watchlist_items(user_id,ticker,added_at) VALUES(?,?,?)")
      .run(req.user.id, ticker, now);
    res.json({ ticker, companyName: COMPANY_NAMES[ticker] || ticker });
  } catch (e) {
    res.status(400).json({ error: "Could not add that ticker." });
  }
});

app.delete("/api/watchlist/:ticker", authRequired, (req, res) => {
  db.prepare("DELETE FROM watchlist_items WHERE user_id=? AND ticker=?")
    .run(req.user.id, req.params.ticker.toUpperCase());
  res.json({ ok: true });
});

app.post("/api/watchlist/seed", authRequired, async (req, res) => {
  const tickers = ["AAPL", "NVDA", "TSLA"];
  for (const ticker of tickers) {
    await ensureStock(ticker);
    db.prepare("INSERT OR IGNORE INTO watchlist_items(user_id,ticker,added_at) VALUES(?,?,?)")
      .run(req.user.id, ticker, new Date().toISOString());
  }
  res.json({ ok: true, tickers });
});

// Useful for the demo: creates another shared market observation without changing a user's checkpoint.
app.post("/api/market/refresh", authRequired, async (req, res) => {
  try {
    const items = db.prepare("SELECT ticker FROM watchlist_items WHERE user_id=?").all(req.user.id);
    const stocks = await refreshTickers(items.map(x => x.ticker));
    res.json({ stocks });
  } catch {
    res.status(500).json({ error: "Market refresh failed." });
  }
});

const clientDist = path.join(__dirname, "..", "client", "dist");
app.use(express.static(clientDist));
app.get("*splat", (_, res) => res.sendFile(path.join(clientDist, "index.html")));

const PORT = process.env.PORT || 3000;

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Market Rewind running on port ${PORT}`);
});
