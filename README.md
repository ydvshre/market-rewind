# Market Rewind

A full-stack smart watchlist for the Groww hackathon brief.

## What makes it different

Market Rewind does not ask "what is every stock doing?" It asks:

> "What meaningfully changed since I last checked?"

Meaningful is relative to each stock's own historical behavior.

### Core algorithm

1. Build a rolling baseline from the last 20 daily closes.
2. Calculate daily percentage changes.
3. Calculate the standard deviation of those changes.
4. When a new market observation arrives, calculate its percentage move from the previous observation.
5. `z = absolute_move_percent / stock_baseline_stdev_percent`
6. `z >= 1.5` => meaningful event.
7. `z >= 3` => High confidence; otherwise Moderate.

The baseline and event detection live in the `stocks` and `market_events` tables and are shared across users. A user's checkpoint is only used at the final personalization step: events after that checkpoint are shown under "Since you left."

Negative moves are treated as meaningful too, so the implementation uses `abs(z)`.

## Run locally

Requirements: Node.js 22+ (Node 24 also works).

```bash
npm install
cp .env.example .env
npm run dev
```

Open `http://localhost:5173`.

The app works without API keys using deterministic mock prices/history/news, so a demo is always possible.

## Optional live data

Set `ALPHA_VANTAGE_KEY` for Alpha Vantage. Set `NEWS_API_KEY` for NewsAPI.

If either API fails or is unavailable, the app automatically falls back to mock data and labels the source.

## Production-ish deployment

Build the React client and let Express serve it:

```bash
npm run build
npm start
```

For a hosted demo, use a service with a persistent disk for the SQLite database, or replace the small `db.js` layer with Postgres.

## Suggested demo flow

1. Register.
2. Add AAPL, NVDA, TSLA.
3. Show the watchlist and "All caught up."
4. Refresh market data / wait for a new observation.
5. Re-open the page.
6. Show only meaningful events under "Since you left."
7. Move the 2/5/15 minute slider. The copy changes instantly because all three tiers were generated when the event was detected.
8. Expand "Everything else was normal."
