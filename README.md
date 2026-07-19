# MarketMind AI v5

## New in v5
- Version bump from v4 → v5 (same feature set, refreshed labelling throughout the app)
- Results Calendar: Q1 FY27 earnings dates (reported + upcoming), with your holdings flagged ★
- My Portfolio: add holdings (ticker, qty, avg cost, current price) — saved in this browser's local storage, nothing sent anywhere
- Portfolio-Level News Impact: each story now shows what % of your portfolio (by value) is exposed, which holdings drive it, and a net positive/negative/neutral read — not just the stock-price angle

## Carried over from v3/v4
- Clickable market cards and stories
- Detail panel with latest metrics, facts, India impact, affected stocks, AI interpretation, watch points and source links
- Live USD/INR reference-rate attempt through Frankfurter
- Connector-ready configuration for commodity, price and news APIs

## Update existing GitHub Pages site
1. Unzip the package.
2. Open your existing `marketmind-ai` repository.
3. Upload all files and the icons folder, replacing the previous version's files.
4. Commit to `main`.
5. Wait 1–3 minutes; GitHub Pages republishes automatically.
6. Open the existing URL in Safari and refresh (reinstall the Home Screen app if it doesn't pick up changes).

## Important
- Commodity prices and news use demo fallbacks until licensed APIs are connected. Do not expose paid API keys in a public GitHub repository; use a backend or serverless function.
- Portfolio holdings are stored in this browser's local storage only — they are device/browser-specific and are not backed up or synced elsewhere.
