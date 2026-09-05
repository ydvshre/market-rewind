import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";

const API = "/api";
const fmtPct = n => `${n >= 0 ? "+" : ""}${Number(n).toFixed(2)}%`;
const minsAgo = iso => {
  if (!iso) return "—";
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  return `${mins} min delayed`;
};

async function request(path, options = {}) {
  const token = localStorage.getItem("mr_token");
  const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(API + path, { ...options, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Something went wrong");
  return data;
}

function Logo() {
  return <div className="logo"><span className="logoMark">↺</span><span>market<span className="logoAccent">rewind</span></span></div>;
}

function Auth({ onAuth }) {
  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const submit = async e => {
    e.preventDefault(); setError("");
    try {
      const data = await request(`/auth/${mode}`, { method: "POST", body: JSON.stringify({ email, password }) });
      localStorage.setItem("mr_token", data.token); onAuth(data.user);
    } catch (err) { setError(err.message); }
  };
  return <main className="authWrap">
    <div className="authCard">
      <Logo />
      <div className="eyebrow">SMART MARKET WATCHLIST</div>
      <h1>{mode === "login" ? "Welcome back." : "Create your market cockpit."}</h1>
      <p className="muted">See what meaningfully changed while you were away — not a wall of prices.</p>
      <form onSubmit={submit}>
        <label>Email<input value={email} onChange={e => setEmail(e.target.value)} type="email" required placeholder="you@example.com" /></label>
        <label>Password<input value={password} onChange={e => setPassword(e.target.value)} type="password" minLength="6" required placeholder="At least 6 characters" /></label>
        {error && <div className="error">{error}</div>}
        <button className="primary full">{mode === "login" ? "Open Market Rewind" : "Create account"}</button>
      </form>
      <button className="textBtn" onClick={() => {setMode(mode === "login" ? "register" : "login"); setError("");}}>
        {mode === "login" ? "New here? Create an account" : "Already have an account? Sign in"}
      </button>
    </div>
  </main>
}

function TierPicker({ tier, setTier }) {
  return <div className="tierPicker">
    {[
      ["1","2 min"],["3","5 min"],["full","15 min"]
    ].map(([value,label]) => <button key={value} className={tier===value?"active":""} onClick={() => setTier(value)}>{label}</button>)}
  </div>
}

function EventCard({ event }) {
  const [tier, setTier] = useState("1");
  const text = tier === "1" ? event.summary_1 : tier === "3" ? event.summary_3 : event.summary_full;
  return <article className="eventCard">
    <div className="eventTop">
      <div>
        <div className="ticker">{event.ticker}</div>
        <div className={`move ${event.move_pct >= 0 ? "up" : "down"}`}>{fmtPct(event.move_pct)}</div>
      </div>
      <div className={`confidence ${event.confidence.toLowerCase().startsWith("high") ? "high" : "moderate"}`}>{event.confidence}</div>
    </div>
    <div className="zline">⚡ {Number(event.z_score).toFixed(1)}× the stock's normal move</div>
    <div className="summary">{text.split("\n").map((x,i)=><p key={i}>{x}</p>)}</div>
    <div className="context">
      <div className="contextLabel">ALSO HAPPENING AROUND THIS TIME</div>
      <div>{event.headline}</div>
      <small>{event.headline_source} · Context only — not proof of causation</small>
    </div>
    <div className="cardBottom">
      <TierPicker tier={tier} setTier={setTier} />
      <span className="time">{new Date(event.detected_at).toLocaleTimeString([], {hour:"2-digit", minute:"2-digit"})}</span>
    </div>
  </article>
}

function StockRow({ stock, onRemove }) {
  return <div className="stockRow">
    <div className="stockIdentity"><div className="stockAvatar">{stock.ticker.slice(0,1)}</div><div><strong>{stock.ticker}</strong><span>{stock.company_name}</span></div></div>
    <div className="priceBlock"><strong>₹{Number(stock.last_price).toLocaleString(undefined,{maximumFractionDigits:2})}</strong><span>as of {new Date(stock.last_observed_at).toLocaleTimeString([], {hour:"2-digit", minute:"2-digit"})}, {minsAgo(stock.last_observed_at)}</span></div>
    <button className="remove" onClick={() => onRemove(stock.ticker)}>×</button>
  </div>
}

function Dashboard({ user, logout }) {
  const [data, setData] = useState(null);
  const [ticker, setTicker] = useState("");
  const [error, setError] = useState("");
  const [suggestions, setSuggestions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [seeded, setSeeded] = useState(false);

  const load = async () => {
    setLoading(true); setError("");
    try { setData(await request("/watchlist")); } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  useEffect(() => {
    const q = ticker.trim();
    if (!q) { setSuggestions([]); return; }
    const timer = setTimeout(() => {
      request(`/symbols?q=${encodeURIComponent(q)}`).then(x => setSuggestions(x.symbols || [])).catch(() => setSuggestions([]));
    }, 120);
    return () => clearTimeout(timer);
  }, [ticker]);

  const add = async e => {
    e.preventDefault(); if (!ticker.trim()) return;
    try { await request("/watchlist",{method:"POST",body:JSON.stringify({ticker})}); setTicker(""); setSuggestions([]); await load(); }
    catch(e){setError(e.message);}
  };
  const seed = async () => { await request("/watchlist/seed",{method:"POST"}); setSeeded(true); await load(); };
  const remove = async t => { await request(`/watchlist/${encodeURIComponent(t)}`,{method:"DELETE"}); await load(); };
  const refresh = async () => {
    setRefreshing(true);
    try { await request("/market/refresh",{method:"POST"}); } finally { setRefreshing(false); }
  };

  if (loading && !data) return <div className="loading"><Logo /><span>Building your market rewind…</span></div>;

  const events = data?.events || [];
  const stocks = data?.stocks || [];

  return <div className="appShell">
    <header className="header">
      <Logo />
      <div className="headerRight"><span className="email">{user.email}</span><button className="textBtn" onClick={logout}>Sign out</button></div>
    </header>

    <main className="dashboard">
      <div className="hero">
        <div>
          <div className="eyebrow">YOUR MARKET CHECKPOINT</div>
          <h1>What changed <em>while you were away?</em></h1>
          <p className="muted">We compare each stock with its own 20-day volatility — so a 2% move can be quiet for one stock and significant for another.</p>
        </div>
        <div className="actions">
          <button className="secondary" onClick={refresh} disabled={refreshing}>{refreshing ? "Refreshing…" : "↻ Refresh market"}</button>
        </div>
      </div>

      {error && <div className="error banner">{error}</div>}

      {!stocks.length && <div className="empty">
        <div className="emptyIcon">✦</div>
        <h2>Your watchlist is empty</h2>
        <p>Add a ticker below, or load three demo stocks for the fastest hackathon demo.</p>
        <button className="primary" onClick={seed}>Load AAPL · NVDA · TSLA</button>
      </div>}

      {!!stocks.length && <section>
        <div className="sectionHead">
          <div><span className="eyebrow">SINCE YOU LEFT</span><h2>{events.length ? `${events.length} meaningful ${events.length===1?"change":"changes"}` : "All caught up"}</h2></div>
          <div className="checkpoint">Checkpoint · {new Date(data.checkpoint).toLocaleString()}</div>
        </div>

        {events.length ? <div className="events">{events.map(e=><EventCard key={e.id} event={e}/>)}</div> :
          <div className="caught"><span>✓</span><div><strong>No meaningful changes.</strong><p>Everything stayed within each stock's normal range since your last check.</p></div></div>
        }

        <details className="normalBox">
          <summary>Everything else was normal <span>{stocks.length - new Set(events.map(e=>e.ticker)).size} stocks</span></summary>
          <div className="stockList">{stocks.map(s=><StockRow key={s.ticker} stock={s} onRemove={remove}/>)}</div>
        </details>
      </section>}

      <section className="watchlistEditor">
        <div><span className="eyebrow">WATCHLIST</span><h2>Manage your stocks</h2></div>
        <form onSubmit={add} className="addForm">
          <div className="searchWrap"><input value={ticker} onChange={e=>setTicker(e.target.value.toUpperCase())} placeholder="Search company or ticker e.g. NVDA" />
            {suggestions.length > 0 && <div className="suggestions">{suggestions.map(s=><button type="button" key={s.ticker} onClick={()=>{setTicker(s.ticker);setSuggestions([])}}><strong>{s.ticker}</strong><span>{s.companyName}</span></button>)}</div>}
          </div><button className="primary">+ Add</button></form>
      </section>

      <footer>
        <span>Market Rewind · Built for the Groww hackathon</span>
        <span>Data mode: {data?.mode}</span>
      </footer>
    </main>
  </div>
}

function App() {
  const [user, setUser] = useState(null);
  const [checking, setChecking] = useState(true);
  useEffect(() => {
    if (!localStorage.getItem("mr_token")) { setChecking(false); return; }
    request("/me").then(x=>setUser(x.user)).catch(()=>localStorage.removeItem("mr_token")).finally(()=>setChecking(false));
  }, []);
  const logout = () => { localStorage.removeItem("mr_token"); setUser(null); };
  if (checking) return <div className="loading"><Logo /></div>;
  return user ? <Dashboard user={user} logout={logout}/> : <Auth onAuth={setUser}/>;
}

createRoot(document.getElementById("root")).render(<App />);
