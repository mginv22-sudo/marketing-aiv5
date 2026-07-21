/**
 * MarketMind AI — backend Worker
 * Fetches live-ish market data (Twelve Data), macro data (Alpha Vantage) and
 * news headlines (free RSS feeds) on a schedule, caches the result in KV,
 * and serves it to the static frontend on GitHub Pages via GET /data.
 *
 * SETUP: see SETUP_GUIDE.md for step-by-step dashboard instructions.
 *
 * Required bindings (set in Cloudflare dashboard → Worker → Settings):
 *   KV namespace binding:  MM_CACHE
 *   Secrets (env vars):    TWELVEDATA_KEY, ALPHAVANTAGE_KEY, REFRESH_SECRET
 */

const RSS_FEEDS = [
  { name: 'Economic Times Markets', url: 'https://economictimes.indiatimes.com/markets/rssfeeds/1977021501.cms' },
  { name: 'Business Standard Markets', url: 'https://www.business-standard.com/rss/markets-106.rss' },
  { name: 'Economic Times Business', url: 'https://economictimes.indiatimes.com/rssfeedsdefault.cms' }
];

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type'
};

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: CORS_HEADERS });
    }

    if (url.pathname === '/data') {
      const cached = await env.MM_CACHE.get('snapshot', 'json');
      return new Response(JSON.stringify(cached || { error: 'no data cached yet — wait for first scheduled run or hit /refresh' }), {
        headers: { 'Content-Type': 'application/json', ...CORS_HEADERS }
      });
    }

    if (url.pathname === '/refresh') {
      const key = url.searchParams.get('key');
      if (key !== env.REFRESH_SECRET) {
        return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json', ...CORS_HEADERS } });
      }
      const result = await refreshData(env);
      return new Response(JSON.stringify(result), { headers: { 'Content-Type': 'application/json', ...CORS_HEADERS } });
    }

    return new Response('MarketMind AI backend. Endpoints: GET /data, GET /refresh?key=SECRET', { headers: CORS_HEADERS });
  },

  async scheduled(event, env, ctx) {
    ctx.waitUntil(refreshData(env));
  }
};

async function refreshData(env) {
  const existing = (await env.MM_CACHE.get('snapshot', 'json')) || {};
  const now = Date.now();

  const market = await fetchTwelveData(env).catch(e => ({ error: String(e) }));

  // Alpha Vantage free tier is heavily rate-limited (25 req/day) — only refresh every ~3 hours.
  const lastAv = existing.macro && existing.macro.fetchedAt ? existing.macro.fetchedAt : 0;
  let macro = existing.macro || {};
  if (now - lastAv > 3 * 60 * 60 * 1000) {
    macro = await fetchAlphaVantage(env).catch(e => ({ error: String(e), fetchedAt: now }));
  }

  const headlines = await fetchHeadlines().catch(e => ({ error: String(e) }));

  const snapshot = {
    updatedAt: new Date(now).toISOString(),
    market,
    macro,
    headlines
  };

  await env.MM_CACHE.put('snapshot', JSON.stringify(snapshot));
  return snapshot;
}

async function fetchTwelveData(env) {
  const key = env.TWELVEDATA_KEY;
  const out = { fetchedAt: Date.now() };
  const symbols = [
    { field: 'nifty', symbol: 'NIFTY 50', params: '&country=India' },
    { field: 'usdinr', symbol: 'USD/INR', params: '' },
    { field: 'brent', symbol: 'XBR/USD', params: '' }
  ];
  for (const s of symbols) {
    try {
      const r = await fetch(`https://api.twelvedata.com/quote?symbol=${encodeURIComponent(s.symbol)}${s.params}&apikey=${key}`);
      const j = await r.json();
      if (j && !j.code) {
        out[s.field] = { price: parseFloat(j.close ?? j.price), change: parseFloat(j.percent_change), name: j.name || s.symbol };
      } else {
        out[s.field] = { error: j.message || 'lookup failed — verify exact symbol in Twelve Data dashboard' };
      }
    } catch (e) {
      out[s.field] = { error: String(e) };
    }
  }
  return out;
}

async function fetchAlphaVantage(env) {
  const key = env.ALPHAVANTAGE_KEY;
  const out = { fetchedAt: Date.now() };
  try {
    const r = await fetch(`https://www.alphavantage.co/query?function=TREASURY_YIELD&interval=daily&maturity=10year&apikey=${key}`);
    const j = await r.json();
    const d = j.data && j.data[0];
    out.us10y = d ? { value: parseFloat(d.value), date: d.date } : { error: 'no data / rate-limited' };
  } catch (e) { out.us10y = { error: String(e) }; }
  try {
    const r = await fetch(`https://www.alphavantage.co/query?function=BRENT&interval=daily&apikey=${key}`);
    const j = await r.json();
    const d = j.data && j.data[0];
    out.brentAV = d ? { value: parseFloat(d.value), date: d.date } : { error: 'no data / rate-limited' };
  } catch (e) { out.brentAV = { error: String(e) }; }
  return out;
}

async function fetchHeadlines() {
  const items = [];
  for (const feed of RSS_FEEDS) {
    try {
      const r = await fetch(feed.url, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; MarketMindAI/1.0)' } });
      const xml = await r.text();
      const parsed = parseRss(xml).slice(0, 6).map(i => ({ ...i, source: feed.name }));
      items.push(...parsed);
    } catch (e) {
      items.push({ title: `(${feed.name} feed unavailable)`, link: '', source: feed.name, error: String(e) });
    }
  }
  return items.slice(0, 20);
}

// Minimal regex-based RSS <item> parser — no DOM/XML library available in Workers by default.
function parseRss(xml) {
  const items = [];
  const itemBlocks = xml.split('<item>').slice(1);
  for (const block of itemBlocks) {
    const title = extractTag(block, 'title');
    const link = extractTag(block, 'link');
    const pubDate = extractTag(block, 'pubDate');
    if (title) items.push({ title: cleanText(title), link: cleanText(link), pubDate: cleanText(pubDate) });
  }
  return items;
}
function extractTag(block, tag) {
  const m = block.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`));
  return m ? m[1] : '';
}
function cleanText(s) {
  return s.replace('<![CDATA[', '').replace(']]>', '').trim();
}
