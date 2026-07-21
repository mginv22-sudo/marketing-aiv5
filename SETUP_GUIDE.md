# MarketMind AI — Live Auto-Refresh Backend Setup

This adds a real backend so market numbers and headlines update on their own,
instead of you asking Claude to refresh the file each time. Everything below
is done in a web browser — no command line / CLI needed.

**What stays manual:** the six "story" cards (facts / India-impact / AI
interpretation) are hand-written analysis. Auto-refreshing those well would
need an LLM call from the backend too — not included here since you chose
free RSS + free market data. You'll still ask Claude to refresh those
periodically. What becomes automatic: Nifty/USD-INR/Brent price ticks, US
10Y yield, and a live headlines list.

---

## 1. Get two free API keys (5 minutes)

1. **Twelve Data** (market prices): go to twelvedata.com → Sign up (free) →
   copy your API key from the dashboard.
2. **Alpha Vantage** (US 10Y yield + Brent): go to alphavantage.co/support/#api-key →
   enter your email → you get a key instantly, no signup form.

Keep both keys somewhere safe for step 3.

## 2. Create the Cloudflare Worker (10 minutes)

1. Go to dash.cloudflare.com → sign up free if you don't have an account.
2. Left sidebar → **Workers & Pages** → **Create** → **Create Worker**.
3. Give it a name, e.g. `marketmind-api` → **Deploy** (deploys a placeholder first).
4. Click **Edit code** (opens the online code editor).
5. Delete the placeholder code and paste in the full contents of `worker.js`
   (included in this package) → **Save and Deploy**.
6. Note the URL Cloudflare gives you, like:
   `https://marketmind-api.<your-subdomain>.workers.dev`
   — you'll put this into the frontend in step 4.

## 3. Add the KV namespace and secrets (5 minutes)

1. Still on your Worker page → **Settings** → **Variables and Secrets**.
2. Under **KV Namespace Bindings** → **Add binding**:
   - Variable name: `MM_CACHE`
   - KV namespace: **Create new** → name it `mm_cache` → save.
3. Under **Environment Variables** → add as **Secret** (encrypted) each of:
   - `TWELVEDATA_KEY` = your Twelve Data key
   - `ALPHAVANTAGE_KEY` = your Alpha Vantage key
   - `REFRESH_SECRET` = any password you make up (used only for manual refresh testing)
4. Save and deploy again so the bindings take effect.

## 4. Add the Cron Trigger (2 minutes)

1. Worker page → **Settings** → **Triggers** → **Cron Triggers** → **Add**.
2. Schedule: `*/30 * * * *` (every 30 minutes). Free plan allows a few of these.
3. Save.

This means: every 30 minutes, Cloudflare automatically calls your Worker's
`scheduled()` function, which fetches fresh data and stores it. Alpha
Vantage (rate-limited to 25 calls/day) is internally throttled to refresh
only every ~3 hours regardless of the cron frequency, so you won't blow
through its free quota.

## 5. Test it

Visit `https://marketmind-api.<your-subdomain>.workers.dev/data` in a browser.
- First run: it may say "no data cached yet" — either wait up to 30 min for
  the first cron tick, or manually trigger one by visiting
  `.../refresh?key=YOUR_REFRESH_SECRET` once.
- After that, `/data` should return JSON with `market`, `macro`, and `headlines`.

## 6. Point the frontend at your Worker

Open `config.json` in this package and set:
```json
{
  "apiBase": "https://marketmind-api.<your-subdomain>.workers.dev"
}
```
Re-upload `config.json` (and `index.html`) to your GitHub repo as usual.
The page will then call your Worker on load and every few minutes while
open, showing a "Live" badge on numbers it got from the backend and falling
back to the static snapshot values (labeled "snapshot") for anything that
fails or isn't wired up yet (e.g. Sensex/India VIX, which Twelve Data's free
tier doesn't reliably cover — you may need to verify the exact symbol names
in Twelve Data's symbol search, or leave those two as manual snapshot values).

## Costs & limits, honestly
- Cloudflare Workers free tier: 100,000 requests/day — nowhere close to what
  this needs.
- Twelve Data free tier: ~800 credits/day, 8 requests/minute — fine at a
  30-minute refresh cadence for 3 symbols.
- Alpha Vantage free tier: 25 requests/day — this is why it's throttled to
  once per ~3 hours (8 calls/day) inside the Worker.
- RSS feeds: free, no key, no rate limit from your side (be a reasonable
  citizen — don't lower the cron interval below a few minutes).

If any single source's symbol/URL doesn't resolve exactly as expected
(exchange APIs change field names occasionally), the Worker fails that one
field gracefully and the rest still works — check the raw `/data` JSON to
see which fields came back with an `error` key.
