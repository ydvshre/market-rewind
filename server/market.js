const db = require("./db");

const COMPANY_NAMES = {
  AAPL: "Apple",
  MSFT: "Microsoft",
  NVDA: "NVIDIA",
  AMZN: "Amazon",
  GOOGL: "Alphabet",
  META: "Meta Platforms",
  TSLA: "Tesla",
  RELIANCE: "Reliance Industries",
  TCS: "Tata Consultancy Services",
  INFY: "Infosys",
  HDFCBANK: "HDFC Bank",
  ICICIBANK: "ICICI Bank"
};

const DEMO_HEADLINES = {
  AAPL: "Apple supplier and product-cycle updates are drawing investor attention.",
  NVDA: "AI infrastructure demand remains a major focus for chip investors.",
  TSLA: "Investors are watching fresh EV delivery and production signals.",
  MSFT: "Cloud and AI spending remains in focus around Microsoft.",
  AMZN: "Retail and cloud-growth expectations are in focus for Amazon.",
  GOOGL: "Investors are watching new AI and advertising developments at Alphabet.",
  META: "AI investment and digital advertising trends remain in focus at Meta.",
  RELIANCE: "Investors are watching energy, telecom and retail developments at Reliance.",
  TCS: "Enterprise technology spending remains in focus for TCS.",
  INFY: "IT-services demand and client spending are in focus for Infosys.",
  HDFCBANK: "Banking-sector growth and credit trends are in focus for HDFC Bank.",
  ICICIBANK: "Investors are watching credit growth and banking-sector trends at ICICI Bank."
};

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function hashTicker(ticker) {
  return [...ticker].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
}

function mockHistory(ticker, days = 20) {
  // Deterministic pseudo-history: realistic enough for a demo but reproducible.
  let seed = hashTicker(ticker);
  const rand = () => {
    seed = (1664525 * seed + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  let price = 80 + (hashTicker(ticker) % 420);
  const closes = [];
  for (let i = 0; i < days + 1; i++) {
    const shock = (rand() - 0.5) * 0.035;
    price *= 1 + shock;
    closes.push(Number(price.toFixed(2)));
  }
  return closes;
}

function mockCurrent(ticker) {
  let seed = hashTicker(ticker);
  const nowBucket = Math.floor(Date.now() / 120000); // changes every 2 min
  seed = (seed + nowBucket * 2654435761) >>> 0;
  const r = ((seed % 10000) / 10000) - 0.5;
  const base = 80 + (hashTicker(ticker) % 420);
  const price = base * (1 + r * 0.035);
  return Number(price.toFixed(2));
}

async function alphaQuote(ticker) {
  if (!process.env.ALPHA_VANTAGE_KEY) return null;
  const url = `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${encodeURIComponent(ticker)}&apikey=${process.env.ALPHA_VANTAGE_KEY}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("Alpha Vantage quote request failed");
  const data = await res.json();
  const q = data["Global Quote"];
  if (!q || !q["05. price"]) return null;
  return { price: Number(q["05. price"]), source: "Alpha Vantage" };
}

async function alphaHistory(ticker) {
  if (!process.env.ALPHA_VANTAGE_KEY) return null;
  const url = `https://www.alphavantage.co/query?function=TIME_SERIES_DAILY&symbol=${encodeURIComponent(ticker)}&outputsize=compact&apikey=${process.env.ALPHA_VANTAGE_KEY}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("Alpha Vantage history request failed");
  const data = await res.json();
  const series = data["Time Series (Daily)"];
  if (!series) return null;
  return Object.keys(series).sort().slice(-21).map(d => Number(series[d]["4. close"]));
}

function stdev(values) {
  if (values.length < 2) return 0.02;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

function calculateBaseline(closes) {
  // CORE LOGIC:
  // We measure normal behavior with the stock's own last 20 daily returns.
  // This avoids a single fixed threshold such as "2% is meaningful" for every stock.
  const returns = [];
  for (let i = 1; i < closes.length; i++) {
    if (closes[i - 1] !== 0) returns.push((closes[i] - closes[i - 1]) / closes[i - 1]);
  }
  return Math.max(stdev(returns), 0.001); // avoid division by ~0
}

async function getMarketData(ticker) {
  let quote = null;
  let closes = null;
  try {
    [quote, closes] = await Promise.all([alphaQuote(ticker), alphaHistory(ticker)]);
  } catch (_) {
    quote = null;
    closes = null;
  }

  if (quote && closes && closes.length >= 20) {
    return {
      price: quote.price,
      baseline: calculateBaseline(closes),
      source: "Alpha Vantage",
      freshnessNote: "Live quote; timing depends on your Alpha Vantage plan"
    };
  }

  const history = mockHistory(ticker, 20);
  return {
    price: mockCurrent(ticker),
    baseline: calculateBaseline(history),
    source: "Demo mode",
    freshnessNote: "Demo data • refreshes automatically"
  };
}

async function getNews(ticker) {
  if (process.env.NEWS_API_KEY) {
    try {
      const url = `https://newsapi.org/v2/everything?q=${encodeURIComponent(ticker)}&pageSize=2&sortBy=publishedAt&language=en&apiKey=${process.env.NEWS_API_KEY}`;
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        const articles = (data.articles || []).slice(0, 2);
        if (articles.length) {
          return {
            headline: articles[0].title,
            source: "NewsAPI",
            articles: articles.map(a => ({ title: a.title, source: a.source?.name || "News" }))
          };
        }
      }
    } catch (_) {}
  }
  return {
    headline: DEMO_HEADLINES[ticker] || `Recent market and company updates are in focus for ${ticker}.`,
    source: "Demo headline",
    articles: [{ title: DEMO_HEADLINES[ticker] || `Recent market and company updates are in focus for ${ticker}.`, source: "Demo context" }]
  };
}

function buildTiers(ticker, movePct, z, headline) {
  const direction = movePct >= 0 ? "up" : "down";
  const absMove = Math.abs(movePct).toFixed(2);
  const confidence = z >= 3 ? "High confidence" : "Moderate confidence";
  const line = `${ticker} moved ${absMove}% ${direction} — more than usual for this stock.`;
  const three = `${line}\n\nIts move is about ${z.toFixed(1)}× its normal volatility.\nAlso happening around this time: ${headline}`;
  const full = `${ticker} moved ${absMove}% ${direction}, which is outside the stock's normal recent range. ` +
    `Its move is about ${z.toFixed(1)}× the stock's 20-day volatility baseline (${(z > 0 ? (Math.abs(movePct) / z) : 0).toFixed(2)}% typical move scale). ` +
    `This is ${confidence.toLowerCase()} based on the size of the deviation. ` +
    `Also happening around this time: ${headline} ` +
    `The headline is context, not a claim that it caused the price move.`;
  return { line, three, full, confidence };
}

async function ensureStock(ticker) {
  ticker = ticker.toUpperCase();
  const existing = db.prepare("SELECT * FROM stocks WHERE ticker=?").get(ticker);
  const data = await getMarketData(ticker);
  const company = COMPANY_NAMES[ticker] || ticker;

  if (!existing) {
    db.prepare(`
      INSERT INTO stocks
      (ticker, company_name, baseline_stdev, baseline_updated_at, data_source, freshness_note)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(ticker, company, data.baseline, new Date().toISOString(), data.source, data.freshnessNote);
  } else {
    db.prepare(`
      UPDATE stocks SET baseline_stdev=?, baseline_updated_at=?, data_source=?, freshness_note=?
      WHERE ticker=?
    `).run(data.baseline, new Date().toISOString(), data.source, data.freshnessNote, ticker);
  }

  return { ...data, ticker, companyName: company };
}

async function refreshTicker(ticker) {
  const stock = await ensureStock(ticker);
  const now = new Date().toISOString();
  const row = db.prepare("SELECT * FROM stocks WHERE ticker=?").get(ticker);
  const previous = row.last_price;

  db.prepare(`
    INSERT INTO market_snapshots (ticker, price, observed_at, data_source)
    VALUES (?, ?, ?, ?)
  `).run(ticker, stock.price, now, stock.source);

  if (previous != null) {
    const movePct = ((stock.price - previous) / previous) * 100;
    const baselinePct = row.baseline_stdev * 100;
    const z = baselinePct > 0 ? Math.abs(movePct) / baselinePct : 0;

    // CORE LOGIC:
    // Event detection is shared per stock, NOT repeated for every user.
    // One market observation creates at most one shared event for this ticker.
    if (z >= 1.5) {
      const news = await getNews(ticker);
      const tiers = buildTiers(ticker, movePct, z, news.headline);
      db.prepare(`
        INSERT INTO market_events
        (ticker, detected_at, previous_price, current_price, move_pct, baseline_stdev,
         z_score, confidence, headline, headline_source, summary_1, summary_3, summary_full)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        ticker, now, previous, stock.price, movePct, row.baseline_stdev, z,
        tiers.confidence, news.headline, news.source, tiers.line, tiers.three, tiers.full
      );
    }
  }

  db.prepare(`
    UPDATE stocks SET previous_price=?, last_price=?, last_observed_at=?, data_source=?, freshness_note=?
    WHERE ticker=?
  `).run(previous, stock.price, now, stock.source, stock.freshnessNote, ticker);

  return db.prepare("SELECT * FROM stocks WHERE ticker=?").get(ticker);
}

async function refreshTickers(tickers) {
  const unique = [...new Set(tickers.map(t => t.toUpperCase()))];
  const results = [];
  for (const ticker of unique) {
    results.push(await refreshTicker(ticker));
    await sleep(80);
  }
  return results;
}

module.exports = {
  COMPANY_NAMES,
  ensureStock,
  refreshTickers,
  getNews
};
