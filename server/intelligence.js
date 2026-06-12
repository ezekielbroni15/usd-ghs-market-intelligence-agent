const fs = require('fs/promises');
const https = require('https');
const path = require('path');
const { config } = require('./config');
const { readArchiveHistory, readForecastActuals, readLatestManualQuote, readPreviousClose } = require('./storage');

const SOURCE_TIMEOUT_MS = 9000;
const BOG_DAILY_INTERBANK_URL = 'https://www.bog.gov.gh/treasury-and-the-markets/daily-interbank-fx-rates/';
const CEDIRATES_USD_GHS_URL = 'https://cedirates.com/exchange-rates/usd-to-ghs/';
const CEDIRATES_PUBLIC_RATES_URL = 'https://cedirates.com/api/v1/rates?baseCurrency=USD&quoteCurrency=GHS&limit=500';

const officialSources = [
  {
    id: 'bog',
    category: 'Bank of Ghana',
    title: 'Bank of Ghana',
    url: 'https://www.bog.gov.gh/',
    cadence: '15 min',
    keywords: ['foreign exchange', 'fx auction', 'monetary policy', 'cash reserve ratio', 'crr'],
    impact: 'Usually supports the cedi when BoG supplies USD or tightens liquidity'
  },
  {
    id: 'bog-interbank',
    category: 'BoG Daily Interbank',
    title: 'Interbank',
    url: BOG_DAILY_INTERBANK_URL,
    cadence: 'Daily',
    keywords: ['usd', 'ghs', 'interbank', 'buying', 'selling', 'mid'],
    impact: 'Official daily reference for USD/GHS market direction'
  },
  {
    id: 'treasury',
    category: 'Treasury',
    title: 'Treasury',
    url: 'https://mofep.gov.gh/',
    cadence: '30 min',
    keywords: ['treasury bill', 'bond', 'auction', 'issuance', 'debt'],
    impact: 'Affects cedi liquidity and short-term USD demand'
  },
  {
    id: 'imf',
    category: 'IMF',
    title: 'IMF',
    url: 'https://www.imf.org/en/Countries/GHA',
    cadence: '30 min',
    keywords: ['ghana', 'review', 'disbursement', 'staff-level agreement', 'program'],
    impact: 'Positive for cedi sentiment when reviews and disbursements progress'
  },
  {
    id: 'fed',
    category: 'Fed / US Data',
    title: 'Fed / US Data',
    url: 'https://www.federalreserve.gov/newsevents/pressreleases.htm',
    cadence: '30 min',
    keywords: ['federal funds', 'inflation', 'employment', 'fomc', 'rate'],
    impact: 'Drives global USD strength and risk appetite'
  },
  {
    id: 'bls',
    category: 'US CPI / NFP',
    title: 'Fed / US Data',
    url: 'https://www.bls.gov/news.release/',
    cadence: '30 min',
    keywords: ['consumer price index', 'employment situation', 'payroll', 'cpi', 'unemployment'],
    impact: 'CPI and NFP shift global USD strength'
  },
  {
    id: 'dxy',
    category: 'DXY',
    title: 'Fed / US Data',
    url: 'https://www.marketwatch.com/investing/index/dxy',
    cadence: '30 min',
    keywords: ['dxy', 'u.s. dollar index', 'dollar index', 'treasury yields', 'fed'],
    impact: 'Global dollar strength can lift USD/GHS even when Ghana local flows are supportive'
  },
  {
    id: 'news-myjoy',
    category: 'Ghana News',
    title: 'News Sentiment',
    url: 'https://www.myjoyonline.com/business/',
    cadence: '10 min',
    keywords: ['budget', 'cedi', 'exchange rate', 'fiscal', 'debt', 'ghana'],
    impact: 'Political and fiscal developments influence market sentiment'
  },
  {
    id: 'news-citinews',
    category: 'Ghana News',
    title: 'News Sentiment',
    url: 'https://citinewsroom.com/category/business/',
    cadence: '10 min',
    keywords: ['cedi', 'forex', 'budget', 'fiscal', 'debt', 'treasury'],
    impact: 'Local market headlines influence sentiment'
  },
  {
    id: 'news-gna',
    category: 'Ghana News Agency',
    title: 'News Sentiment',
    url: 'https://gna.org.gh/category/business/',
    cadence: '20 min',
    keywords: ['cedi', 'treasury', 'gold', 'cocoa', 'trade surplus', 'inflation'],
    impact: 'Official-style local reporting on fiscal, trade, and external flows'
  },
  {
    id: 'news-newsghana',
    category: 'NewsGhana',
    title: 'News Sentiment',
    url: 'https://newsghana.com.gh/business/',
    cadence: '20 min',
    keywords: ['cedi', 'gold exports', 'cocoa', 'imf', 'trade surplus', 'exchange rate'],
    impact: 'Local business headlines can shift cedi sentiment'
  },
  {
    id: 'news-ghanabusiness',
    category: 'Ghana Business News',
    title: 'News Sentiment',
    url: 'https://www.ghanabusinessnews.com/',
    cadence: '30 min',
    keywords: ['cedi', 'gold', 'cocoa', 'treasury bills', 'eurobond', 'debt'],
    impact: 'Business news on trade, debt, and export receipts supports the market read'
  },
  {
    id: 'goldbod',
    category: 'GoldBod',
    title: 'Gold',
    url: 'https://goldbod.gov.gh/',
    cadence: '30 min',
    keywords: ['gold', 'reserves', 'export', 'miners', 'foreign exchange'],
    impact: 'Ghana gold purchase and export news supports reserve expectations'
  }
];

const commoditySources = [
  {
    id: 'gold',
    category: 'Gold',
    title: 'Gold',
    url: 'https://www.lbma.org.uk/prices-and-data/precious-metal-prices',
    cadence: '30 min',
    keywords: ['gold', 'price', 'usd', 'ounce'],
    impact: 'Supports FX reserves and cedi sentiment when prices are firm'
  },
  {
    id: 'cocoa',
    category: 'Cocoa',
    title: 'Cocoa',
    url: 'https://www.icco.org/',
    cadence: '60 min',
    keywords: ['cocoa', 'prices', 'production', 'exports'],
    impact: 'Supports FX supply when receipts and export volumes improve'
  }
];

const baseMarket = {
  pair: 'USD/GHS',
  interbankRate: 11.02,
  previousClose: 11.07,
  weeklyMove: -1.2,
  expectedRange: '10.88 - 11.12',
  demandPressure: 'Normal',
  liquidity: 'Tightening'
};

const signalTemplates = {
  'Bank of Ghana': {
    status: 'Supportive',
    value: 18,
    description: 'FX supply window active; latest notices show liquidity management bias.',
    impact: 'Cedi supportive',
    color: 'green'
  },
  Treasury: {
    status: 'Absorbing',
    value: 7,
    description: 'T-bill settlement expected to pull excess cedi liquidity from banks.',
    impact: 'Cedi supportive',
    color: 'teal'
  },
  IMF: {
    status: 'Constructive',
    value: 9,
    description: 'Program headlines remain positive with review risk currently low.',
    impact: 'Sentiment supportive',
    color: 'blue'
  },
  Gold: {
    status: 'Firm',
    value: 11,
    description: 'Spot gold strength supports reserve and export-flow expectations.',
    impact: 'FX supply supportive',
    color: 'amber'
  },
  Cocoa: {
    status: 'Neutral',
    value: 2,
    description: 'Receipts stable; no major export-flow shock flagged overnight.',
    impact: 'Limited impact',
    color: 'brown'
  },
  'Fed / US Data': {
    status: 'USD bid',
    value: -8,
    description: 'US rate expectations keep some defensive USD demand in place.',
    impact: 'USD supportive',
    color: 'red'
  },
  Interbank: {
    status: 'Softer USD',
    value: 14,
    description: 'Quotes drifted lower with cleaner supply and lighter importer bids.',
    impact: 'Cedi supportive',
    color: 'green'
  },
  'News Sentiment': {
    status: 'Watch',
    value: -3,
    description: 'Fiscal and political headlines are mixed but not yet market-moving.',
    impact: 'Slight USD support',
    color: 'slate'
  }
};

const forecastDrivers = [
  {
    key: 'bogAuctions',
    label: 'BoG FX Auctions',
    weight: 25,
    direction: 'Cedi Positive',
    signalTitle: 'Bank of Ghana'
  },
  {
    key: 'liquidity',
    label: 'Liquidity / T-Bills',
    weight: 15,
    direction: 'Cedi Positive',
    signalTitle: 'Treasury'
  },
  {
    key: 'imf',
    label: 'IMF Developments',
    weight: 10,
    direction: 'Cedi Positive',
    signalTitle: 'IMF'
  },
  {
    key: 'gold',
    label: 'Gold Prices',
    weight: 10,
    direction: 'Cedi Positive',
    signalTitle: 'Gold'
  },
  {
    key: 'cocoa',
    label: 'Cocoa Inflows',
    weight: 10,
    direction: 'Cedi Positive',
    signalTitle: 'Cocoa'
  },
  {
    key: 'fed',
    label: 'Fed & US Data',
    weight: 15,
    direction: 'USD Positive',
    signalTitle: 'Fed / US Data'
  },
  {
    key: 'marketDemand',
    label: 'Market Demand',
    weight: 10,
    direction: 'USD Positive',
    signalTitle: 'Interbank'
  },
  {
    key: 'news',
    label: 'News Sentiment',
    weight: 5,
    direction: 'Either',
    signalTitle: 'News Sentiment'
  }
];

function timeoutSignal(ms) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ms);
  return { controller, timeout };
}

function stripHtml(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#8217;/g, "'")
    .replace(/&#8211;/g, '-')
    .replace(/&#038;/g, '&')
    .replace(/&#\d+;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function decodeHtml(text = '') {
  return text
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&#8217;/g, "'")
    .replace(/&#8211;/g, '-')
    .replace(/&#8212;/g, '-')
    .replace(/&#038;/g, '&')
    .replace(/&#(\d+);/g, (_, code) => {
      const value = Number(code);
      return Number.isFinite(value) ? String.fromCharCode(value) : ' ';
    });
}

function findHeadlineSnippets(text, keywords) {
  const lower = text.toLowerCase();
  return keywords
    .map((keyword) => {
      const index = lower.indexOf(keyword.toLowerCase());
      if (index === -1) return null;
      const start = Math.max(0, index - 80);
      const end = Math.min(text.length, index + 170);
      return text.slice(start, end).trim();
    })
    .filter(Boolean)
    .slice(0, 4);
}

function absoluteUrl(href, baseUrl) {
  if (!href || href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:')) return null;
  try {
    return new URL(href, baseUrl).toString();
  } catch (error) {
    return null;
  }
}

function extractTitleFromHtml(html, fallback = '') {
  const ogTitle = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i)?.[1];
  const title = ogTitle || html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || fallback;
  return stripHtml(decodeHtml(title)).slice(0, 180);
}

function extractPageLinks(html, baseUrl) {
  const links = [];
  const seen = new Set();
  const anchorPattern = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  for (const match of html.matchAll(anchorPattern)) {
    const url = absoluteUrl(match[1], baseUrl);
    const title = stripHtml(decodeHtml(match[2]));
    if (!url || !title || title.length < 18 || seen.has(url)) continue;
    if (/\.(jpg|jpeg|png|gif|webp|svg|pdf|zip|mp4|mp3)$/i.test(url)) continue;
    seen.add(url);
    links.push({ title: title.slice(0, 180), url });
  }
  return links;
}

function scoreTextAgainstKeywords(text, keywords = []) {
  const lower = text.toLowerCase();
  return keywords.reduce((score, keyword) => {
    const normalized = keyword.toLowerCase();
    if (!normalized) return score;
    return score + (lower.includes(normalized) ? Math.max(1, normalized.split(/\s+/).length) : 0);
  }, 0);
}

async function fetchArticleEvidence(link, source) {
  try {
    const html = await fetchTextUrl(link.url, { timeoutMs: 6500 });
    const text = stripHtml(html);
    const snippets = findHeadlineSnippets(text, source.keywords);
    const title = extractTitleFromHtml(html, link.title);
    return {
      source: source.category,
      title: title || link.title,
      snippet: snippets[0] || text.slice(0, 360),
      url: link.url,
      status: 'Article scan',
      lastSeen: new Date().toISOString(),
      impact: source.impact,
      score: scoreTextAgainstKeywords(`${title} ${text.slice(0, 1200)}`, source.keywords)
    };
  } catch (error) {
    return {
      source: source.category,
      title: link.title,
      snippet: 'Article link discovered, but the article body could not be fetched during this scan.',
      url: link.url,
      status: 'Link discovered',
      lastSeen: new Date().toISOString(),
      impact: source.impact,
      score: scoreTextAgainstKeywords(link.title, source.keywords)
    };
  }
}

async function buildSourceScanResult(source, html, startedAt, status = 'Online') {
  const text = stripHtml(html);
  const snippets = findHeadlineSnippets(text, source.keywords);
  const articleLinks = extractPageLinks(html, source.url)
    .map((link) => ({
      ...link,
      score: scoreTextAgainstKeywords(`${link.title} ${link.url}`, source.keywords)
    }))
    .filter((link) => link.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 4);
  const articles = (await Promise.all(articleLinks.map((link) => fetchArticleEvidence(link, source))))
    .filter((article) => article.score > 0 || article.status === 'Article scan')
    .sort((a, b) => (b.score || 0) - (a.score || 0))
    .slice(0, 4);
  const articleHeadlines = articles.map((article) =>
    article.snippet ? `${article.title}: ${article.snippet}` : article.title
  );

  return {
    ...source,
    online: true,
    status,
    lastSeen: new Date().toISOString(),
    latencyMs: Date.now() - startedAt,
    score: Math.max(70, 100 - Math.round((Date.now() - startedAt) / 250)),
    headlines: articleHeadlines.length
      ? articleHeadlines
      : snippets.length
        ? snippets
        : [`Connected to ${source.category}; no priority keyword found in first page scan.`],
    articles
  };
}

async function fetchJsonUrl(url, parser) {
  if (!url) return null;
  const { controller, timeout } = timeoutSignal(SOURCE_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        accept: 'application/json',
        'user-agent': 'USD-GHS-Market-Intelligence-Agent/0.3'
      }
    });
    if (!response.ok) return null;
    const json = await response.json();
    return parser(json);
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchTextUrl(url, options = {}) {
  const { controller, timeout } = timeoutSignal(options.timeoutMs || SOURCE_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      method: options.method || 'GET',
      signal: controller.signal,
      headers: {
        accept: options.accept || 'text/html,application/json',
        'content-type': options.contentType || 'application/x-www-form-urlencoded',
        'user-agent': 'USD-GHS-Market-Intelligence-Agent/0.3',
        ...(options.headers || {})
      },
      body: options.body
    });
    if (!response.ok) return null;
    return await response.text();
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function fetchHttpsTextInsecure(url, options = {}) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      clearTimeout(hardTimeout);
      resolve(value);
    };
    const hardTimeout = setTimeout(() => {
      request.destroy();
      finish(null);
    }, options.timeoutMs || SOURCE_TIMEOUT_MS);
    const request = https.request(
      url,
      {
        method: options.method || 'GET',
        timeout: options.timeoutMs || SOURCE_TIMEOUT_MS,
        rejectUnauthorized: false,
        headers: {
          accept: options.accept || 'text/html,application/json',
          'content-type': options.contentType || 'application/x-www-form-urlencoded',
          'user-agent': 'USD-GHS-Market-Intelligence-Agent/0.3',
          ...(options.headers || {})
        }
      },
      (response) => {
        let body = '';
        response.setEncoding('utf8');
        response.on('data', (chunk) => {
          body += chunk;
        });
        response.on('end', () => {
          finish(response.statusCode >= 200 && response.statusCode < 300 ? body : null);
        });
      }
    );
    request.on('timeout', () => {
      request.destroy();
      finish(null);
    });
    request.on('error', () => finish(null));
    if (options.body) request.write(options.body);
    request.end();
  });
}

function numberOrNull(value) {
  const number = Number(String(value ?? '').replace(/,/g, '').trim());
  return Number.isFinite(number) && number > 0 ? number : null;
}

function plausibleUsdGhsRate(value) {
  const number = numberOrNull(value);
  return number && number >= 5 && number <= 30 ? number : null;
}

function average(numbers) {
  const valid = numbers.map(plausibleUsdGhsRate).filter(Boolean);
  if (!valid.length) return null;
  return Number((valid.reduce((total, value) => total + value, 0) / valid.length).toFixed(4));
}

function utcDateDaysAgo(days) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
}

function latestTimestamp(value) {
  const time = new Date(value || 0).getTime();
  return Number.isFinite(time) ? time : 0;
}

function findContributor(contributors = [], matcher) {
  return contributors.find((row) => matcher(`${row.name || ''} ${row.type || ''} ${row.source || ''}`.toLowerCase()));
}

function latestProviderRows(rows) {
  const latest = new Map();
  for (const row of rows) {
    const name = row.company?.companyName || row.companyName || row.name || row.source || 'Unnamed provider';
    const type = row.company?.subCategory?.name || row.type || 'Provider';
    const key = `${name}::${type}::${row.baseCurrency || ''}::${row.quoteCurrency || ''}`;
    const existing = latest.get(key);
    const rowTime = latestTimestamp(row.lastUpdatedAt || row.updatedAt || row.date);
    const existingTime = latestTimestamp(existing?.lastUpdatedAt || existing?.updatedAt || existing?.date);
    if (!existing || rowTime >= existingTime) latest.set(key, row);
  }
  return [...latest.values()];
}

function jsonRowsFromAny(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  if (typeof value !== 'object') return [];
  for (const key of ['data', 'rates', 'items', 'results', 'records', 'rows']) {
    if (Array.isArray(value[key])) return value[key];
  }
  return [];
}

function summarizeCediRatesRows(rows, source) {
  const usdRows = rows.filter((row) => {
    const base = String(row.baseCurrency || row.base || row.from || row.currency || '').toUpperCase();
    const quote = String(row.quoteCurrency || row.quote || row.to || '').toUpperCase();
    const pair = String(row.pair || row.currencyPair || row.cd_currency_pair || '').toUpperCase();
    return (base === 'USD' && quote === 'GHS') || pair === 'USDGHS' || pair === 'USD/GHS';
  });

  const rowsToUse = latestProviderRows(usdRows.length ? usdRows : rows);
  const latestUpdate = rowsToUse
    .map((row) => row.lastUpdatedAt || row.updatedAt || row.date)
    .filter(Boolean)
    .sort()
    .at(-1);
  const contributors = rowsToUse
    .map((row) => {
      const buying = plausibleUsdGhsRate(row.buying || row.buy || row.bid);
      const selling = plausibleUsdGhsRate(row.selling || row.sell || row.ask);
      const suppliedMid = plausibleUsdGhsRate(row.mid || row.average || row.rate || row.value || row.price);
      const computedMid = buying && selling ? Number(((buying + selling) / 2).toFixed(4)) : null;
      const type = row.company?.subCategory?.name || row.type || 'Provider';
      return {
        name: row.company?.companyName || row.companyName || row.name || row.source || 'Unnamed provider',
        type,
        slug: row.company?.subCategory?.slug || '',
        buying,
        selling,
        midRate: suppliedMid || computedMid || (/remittance/i.test(type) ? buying : null),
        lastUpdatedAt: row.lastUpdatedAt || row.updatedAt || row.date || null,
        source: 'CediRates',
        sourceUrl: CEDIRATES_USD_GHS_URL
      };
    })
    .filter((row) => row.buying || row.selling || row.midRate)
    .sort((a, b) => (a.name || '').localeCompare(b.name || ''))
    .slice(0, 500);
  const rate = average(contributors.map((row) => row.midRate));
  if (!rate) return null;
  const buying = average(contributors.map((row) => row.buying));
  const selling = average(contributors.map((row) => row.selling));

  return {
    rate,
    previousClose: rate,
    source,
    status: source.includes('API') ? 'CediRates API' : 'CediRates Public',
    buying,
    selling,
    providerRows: rowsToUse.length,
    providerLastUpdated: latestUpdate,
    contributors
  };
}

function extractQuoteFromGenericJson(json, source = 'Interbank API') {
  const directRate = plausibleUsdGhsRate(json?.rate || json?.mid || json?.usdghs || json?.price);
  if (directRate) {
    return {
      rate: directRate,
      previousClose: plausibleUsdGhsRate(json.previousClose || json.previous_close || json.prev) || directRate,
      source: json.source || source
    };
  }

  const cediRows = summarizeCediRatesRows(jsonRowsFromAny(json), source);
  if (cediRows) return cediRows;
  return null;
}

async function fetchCediRatesApiQuote() {
  if (!config.cediRatesApiKey) return null;

  const headers = {
    authorization: `Bearer ${config.cediRatesApiKey}`,
    'x-api-key': config.cediRatesApiKey,
    apikey: config.cediRatesApiKey
  };
  const urls = [
    'https://public-api.cedirates.com/api/v1/rates?baseCurrency=USD&quoteCurrency=GHS&limit=500',
    'https://public-api.cedirates.com/v1/rates?baseCurrency=USD&quoteCurrency=GHS&limit=500',
    'https://public-api.cedirates.com/rates?baseCurrency=USD&quoteCurrency=GHS&limit=500'
  ];

  for (const url of urls) {
    const text = await fetchTextUrl(url, {
      accept: 'application/json',
      contentType: 'application/json',
      headers
    });
    if (!text) continue;
    try {
      const quote = summarizeCediRatesRows(jsonRowsFromAny(JSON.parse(text)), 'CediRates API');
      if (quote) {
        const previousQuote = await fetchCediRatesPublicQuoteForDate(utcDateDaysAgo(1));
        return {
          ...quote,
          previousClose: previousQuote?.rate || quote.previousClose,
          previousQuote,
          previousQuoteDate: utcDateDaysAgo(1)
        };
      }
    } catch {
      continue;
    }
  }

  return null;
}

async function fetchCediRatesPublicQuoteForDate(date) {
  const separator = CEDIRATES_PUBLIC_RATES_URL.includes('?') ? '&' : '?';
  const jsonText = await fetchTextUrl(`${CEDIRATES_PUBLIC_RATES_URL}${separator}date=${date}`, {
    accept: 'application/json',
    contentType: 'application/json'
  });
  if (!jsonText) return null;

  try {
    const quote = summarizeCediRatesRows(jsonRowsFromAny(JSON.parse(jsonText)), `CediRates ${date}`);
    return quote ? { ...quote, date } : null;
  } catch {
    return null;
  }
}

async function fetchCediRatesPublicQuote() {
  const jsonText = await fetchTextUrl(CEDIRATES_PUBLIC_RATES_URL, {
    accept: 'application/json',
    contentType: 'application/json'
  });
  if (jsonText) {
    try {
      const quote = summarizeCediRatesRows(jsonRowsFromAny(JSON.parse(jsonText)), 'CediRates bank average');
      if (quote) {
        const previousQuote = await fetchCediRatesPublicQuoteForDate(utcDateDaysAgo(1));
        return {
          ...quote,
          previousClose: previousQuote?.rate || quote.previousClose,
          previousQuote,
          previousQuoteDate: utcDateDaysAgo(1)
        };
      }
    } catch {
      // Continue to page text fallback.
    }
  }

  const html = await fetchTextUrl(CEDIRATES_USD_GHS_URL);
  if (!html) return null;
  const text = stripHtml(html);
  const usdWindow = findHeadlineSnippets(text, ['Dollar to Cedi', 'US Dollars', 'USD', 'GHS']).join(' ');
  const numbers = [...usdWindow.matchAll(/\b\d{1,2}(?:\.\d{1,4})\b/g)].map((match) => match[0]);
  const rate = average(numbers);
  return rate
    ? {
        rate,
        previousClose: rate,
        source: 'CediRates public page',
        status: 'CediRates Public'
      }
    : null;
}

function summarizeBogRows(rows) {
  for (const row of rows) {
    const values = Array.isArray(row) ? row : Object.values(row || {});
    const text = values.join(' ').replace(/<[^>]+>/g, ' ');
    if (!/(USDGHS|US Dollar|USD\/GHS)/i.test(text)) continue;
    const numbers = values.flatMap((value) => String(value).match(/\b\d{1,2}(?:\.\d{1,4})\b/g) || []);
    const rate = average(numbers);
    if (rate) {
      return {
        rate,
        previousClose: rate,
        source: 'Bank of Ghana Daily Interbank FX Rates',
        status: 'BoG Daily Rate',
        trusted: true,
        contributors: [
          {
            name: 'Bank of Ghana',
            type: 'Official',
            slug: 'official',
            buying: null,
            selling: null,
            midRate: rate,
            lastUpdatedAt: new Date().toISOString(),
            source: 'Bank of Ghana',
            sourceUrl: BOG_DAILY_INTERBANK_URL
          }
        ],
        providerRows: 1
      };
    }
  }
  return null;
}

async function fetchBogInterbankQuote() {
  const html =
    (await fetchTextUrl(BOG_DAILY_INTERBANK_URL, { timeoutMs: 12000 })) ||
    (await fetchHttpsTextInsecure(BOG_DAILY_INTERBANK_URL, { timeoutMs: 12000 }));
  if (!html) return null;

  const nonceMatch = html.match(/name="wdtNonceFrontendServerSide_31" value="([^"]+)"/i);
  const nonce = nonceMatch?.[1];
  if (nonce) {
    const body = new URLSearchParams({
      draw: '1',
      start: '0',
      length: '25',
      'search[value]': '',
      'search[regex]': 'false',
      'order[0][column]': '0',
      'order[0][dir]': 'desc',
      wdtNonceFrontendServerSide_31: nonce
    }).toString();
    const ajaxOptions = {
      method: 'POST',
      accept: 'application/json',
      body,
      headers: {
        referer: BOG_DAILY_INTERBANK_URL,
        'x-requested-with': 'XMLHttpRequest'
      },
      timeoutMs: 12000
    };
    const jsonText =
      (await fetchTextUrl('https://www.bog.gov.gh/wp-admin/admin-ajax.php?action=get_wdtable&table_id=31', ajaxOptions)) ||
      (await fetchHttpsTextInsecure('https://www.bog.gov.gh/wp-admin/admin-ajax.php?action=get_wdtable&table_id=31', ajaxOptions));
    if (jsonText) {
      try {
        const quote = summarizeBogRows(jsonRowsFromAny(JSON.parse(jsonText)));
        if (quote) return quote;
      } catch {
        // Continue to HTML fallback.
      }
    }
  }

  const text = stripHtml(html);
  const snippets = findHeadlineSnippets(text, ['US Dollar', 'USDGHS', 'USD/GHS']);
  const numbers = snippets.flatMap((snippet) => snippet.match(/\b\d{1,2}(?:\.\d{1,4})\b/g) || []);
  const rate = average(numbers);
  return rate
    ? {
        rate,
        previousClose: rate,
        source: 'Bank of Ghana Daily Interbank FX Rates',
        status: 'BoG Page Scan',
        trusted: false,
        contributors: [
          {
            name: 'Bank of Ghana',
            type: 'Official',
            slug: 'official',
            buying: null,
            selling: null,
            midRate: rate,
            lastUpdatedAt: new Date().toISOString(),
            source: 'Bank of Ghana',
            sourceUrl: BOG_DAILY_INTERBANK_URL
          }
        ],
        providerRows: 1
      }
    : null;
}

function combineQuoteSources(primary, official) {
  if (!primary?.rate) return official;
  if (!official?.rate) return primary;
  const officialContributors = official.contributors || [
    {
      name: 'Bank of Ghana',
      type: 'Official',
      slug: 'official',
      buying: null,
      selling: null,
      midRate: official.rate,
      lastUpdatedAt: new Date().toISOString(),
      source: 'Bank of Ghana',
      sourceUrl: BOG_DAILY_INTERBANK_URL
    }
  ];
  const difference = Math.abs(official.rate - primary.rate) / primary.rate;
  if (!official.trusted || difference > 0.08) {
    return {
      ...primary,
      source: `${primary.source} (BoG scan available, not blended)`,
      contributors: primary.contributors || [],
      providerRows: primary.providerRows || (primary.contributors || []).length,
      bogReference: {
        rate: official.rate,
        status: official.status,
        source: official.source,
        url: BOG_DAILY_INTERBANK_URL,
        reason: !official.trusted ? 'BoG fallback parse was not structured table data' : 'BoG value was outside validation band'
      }
    };
  }

  const contributors = [...(primary.contributors || []), ...officialContributors];
  const allMidRates = contributors.map((row) => row.midRate).filter(Boolean);
  const combinedMid = average(allMidRates) || primary.rate;

  return {
    ...primary,
    rate: combinedMid,
    previousClose: combinedMid,
    source: `${primary.source} + BoG Daily Interbank`,
    status: 'Blended Live Sources',
    providerRows: contributors.length,
    contributors
  };
}

async function fetchSource(source) {
  const { controller, timeout } = timeoutSignal(SOURCE_TIMEOUT_MS);
  const startedAt = Date.now();

  try {
    const response = await fetch(source.url, {
      signal: controller.signal,
      headers: {
        'user-agent': 'USD-GHS-Market-Intelligence-Agent/0.2'
      }
    });
    const html = await response.text();
    return buildSourceScanResult(source, html, startedAt, response.ok ? 'Online' : `HTTP ${response.status}`);
  } catch (error) {
    if (/bog\.gov\.gh/i.test(source.url)) {
      const html = await fetchHttpsTextInsecure(source.url, { timeoutMs: SOURCE_TIMEOUT_MS });
      if (html) {
        return buildSourceScanResult(source, html, startedAt, 'Online');
      }
    }

    return {
      ...source,
      online: false,
      status: 'Fallback',
      lastSeen: new Date().toISOString(),
      latencyMs: Date.now() - startedAt,
      score: 52,
      headlines: [`Live fetch unavailable for ${source.category}; using cached analyst assumptions.`],
      articles: [],
      error: error.name === 'AbortError' ? 'Timed out' : error.message
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchInterbankQuote() {
  const apiQuote = await fetchJsonUrl(config.interbankApiUrl, (json) => extractQuoteFromGenericJson(json, 'Interbank API'));

  if (apiQuote?.rate) {
    return { ...apiQuote, status: 'Live API' };
  }

  const [cediRatesApiQuote, bogQuote] = await Promise.all([
    fetchCediRatesApiQuote(),
    fetchBogInterbankQuote()
  ]);
  if (cediRatesApiQuote?.rate) {
    return combineQuoteSources(cediRatesApiQuote, bogQuote);
  }

  const cediRatesPublicQuote = await fetchCediRatesPublicQuote();
  if (cediRatesPublicQuote?.rate) {
    return combineQuoteSources(cediRatesPublicQuote, bogQuote);
  }

  if (bogQuote?.rate && bogQuote.trusted) return bogQuote;

  const manualQuote = await readLatestManualQuote();
  if (manualQuote?.rate) {
    return {
      rate: manualQuote.rate,
      previousClose: baseMarket.previousClose,
      source: manualQuote.source || 'Manual interbank quote',
      status: 'Manual'
    };
  }

  return {
    rate: baseMarket.interbankRate,
    previousClose: baseMarket.previousClose,
    source: 'Seeded fallback - not live market data',
    status: 'Fallback'
  };
}

async function fetchLicensedNews() {
  const feedSources = [
    { id: 'reuters', category: 'Reuters', url: config.reutersFeedUrl },
    { id: 'bloomberg', category: 'Bloomberg', url: config.bloombergFeedUrl }
  ].filter((source) => source.url);

  const remoteFeeds = await Promise.all(
    feedSources.map((source) =>
      fetchSource({
        ...source,
        title: 'News Sentiment',
        cadence: 'Live',
        keywords: ['ghana', 'cedi', 'eurobond', 'cocoa', 'gold', 'imf', 'fiscal'],
        impact: 'Licensed market news affects trader sentiment'
      })
    )
  );

  let localFeeds = [];
  try {
    const files = await fs.readdir(config.licensedNewsDir);
    const textFiles = files.filter((file) => file.endsWith('.txt') || file.endsWith('.md'));
    localFeeds = await Promise.all(
      textFiles.slice(0, 10).map(async (file) => {
        const content = await fs.readFile(path.join(config.licensedNewsDir, file), 'utf8');
        return {
          id: `licensed-${file}`,
          category: file.includes('bloomberg') ? 'Bloomberg' : file.includes('reuters') ? 'Reuters' : 'Licensed News',
          title: 'News Sentiment',
          cadence: 'File import',
          online: true,
          status: 'Imported',
          score: 88,
          lastSeen: new Date().toISOString(),
          headlines: findHeadlineSnippets(content, ['ghana', 'cedi', 'imf', 'cocoa', 'gold']).slice(0, 3),
          articles: findHeadlineSnippets(content, ['ghana', 'cedi', 'imf', 'cocoa', 'gold']).slice(0, 3).map((snippet, index) => ({
            source: file.includes('bloomberg') ? 'Bloomberg' : file.includes('reuters') ? 'Reuters' : 'Licensed News',
            title: `${file} evidence ${index + 1}`,
            snippet,
            url: `file://${file}`,
            status: 'Imported',
            lastSeen: new Date().toISOString(),
            impact: 'Licensed news import affects sentiment'
          })),
          impact: 'Licensed news import affects sentiment'
        };
      })
    );
  } catch (error) {
    localFeeds = [];
  }

  return [...remoteFeeds, ...localFeeds];
}

function sourceMentions(source, terms) {
  const text = [
    ...(source.headlines || []),
    ...((source.articles || []).flatMap((article) => [article.title, article.snippet]))
  ]
    .join(' ')
    .toLowerCase();
  return terms.some((term) => text.includes(term));
}

function evidenceRowsForSource(source, fallbackLimit = 3) {
  const articleRows = (source.articles || []).slice(0, fallbackLimit).map((article) => ({
    source: article.source || source.category,
    title: article.title,
    snippet: article.snippet,
    url: article.url || source.url,
    status: article.status || source.status,
    lastSeen: article.lastSeen || source.lastSeen,
    impact: article.impact || source.impact
  }));
  if (articleRows.length) return articleRows;

  return (source.headlines || [`${source.category} scan completed; no direct headline match yet.`])
    .slice(0, fallbackLimit)
    .map((headline) => ({
      source: source.category,
      title: headline,
      snippet: headline,
      url: source.url,
      status: source.status,
      lastSeen: source.lastSeen,
      impact: source.impact
    }));
}

function evidenceForTitle(sources, title) {
  const exact = sources
    .filter((source) => (source.title || source.category) === title || source.category === title)
    .flatMap((source) => evidenceRowsForSource(source, 3))
    .slice(0, 8);
  if (exact.length) return exact;

  return sources
    .filter((source) => source.title === title || source.category.includes(title.split(' ')[0]))
    .flatMap((source) => evidenceRowsForSource(source, 2))
    .slice(0, 4);
}

function evidenceByKeywords(sources, keywords) {
  const matched = sources
    .filter((source) => sourceMentions(source, keywords))
    .flatMap((source) => evidenceRowsForSource(source, 3))
    .slice(0, 8);
  if (matched.length) return matched;

  return sources.slice(0, 4).flatMap((source) => evidenceRowsForSource(source, 1));
}

function exactEvidenceByKeywords(sources, keywords) {
  return sources
    .filter((source) => sourceMentions(source, keywords))
    .flatMap((source) => evidenceRowsForSource(source, 3))
    .filter((row) => scoreTextAgainstKeywords(`${row.title || ''} ${row.snippet || ''}`, keywords) > 0)
    .slice(0, 8);
}

function buildSignals({ sources, quote }) {
  const grouped = new Map();
  for (const source of sources) {
    const title = source.title || source.category;
    if (!grouped.has(title)) grouped.set(title, []);
    grouped.get(title).push(source);
  }

  const signals = Object.keys(signalTemplates).map((title) => {
    const template = signalTemplates[title];
    const related = grouped.get(title) || [];
    let value = template.value;
    let status = template.status;
    let description = template.description;

    if (title === 'Bank of Ghana' && related.some((source) => sourceMentions(source, ['auction', 'crr', 'foreign exchange']))) {
      value += 3;
      status = 'Active';
      description = 'BoG source scan found FX, CRR, or policy language relevant to USD/GHS.';
    }

    if (title === 'Treasury' && related.some((source) => sourceMentions(source, ['treasury bill', 'bond', 'auction']))) {
      value += 2;
      status = 'Liquidity focus';
    }

    if (title === 'IMF' && related.some((source) => sourceMentions(source, ['review', 'disbursement', 'staff-level']))) {
      value += 2;
      status = 'Program watch';
    }

    if (title === 'Fed / US Data' && related.some((source) => sourceMentions(source, ['inflation', 'payroll', 'fomc', 'consumer price']))) {
      value -= 2;
      status = 'US data watch';
    }

    if (title === 'Interbank' && quote.status === 'Live API') {
      status = 'Live quote';
      description = `Using connected interbank feed from ${quote.source}.`;
    } else if (title === 'Interbank' && quote.status === 'CediRates API') {
      status = 'CediRates API';
      description = `Using CediRates USD/GHS bank-rate average from ${quote.providerRows || 'available'} contributors.`;
    } else if (title === 'Interbank' && quote.status === 'BoG Daily Rate') {
      status = 'BoG daily rate';
      description = 'Using the Bank of Ghana Daily Interbank FX Rates page.';
    } else if (title === 'Interbank' && quote.status === 'CediRates Public') {
      status = 'CediRates public';
      description = `Using CediRates public USD/GHS bank-rate average from ${quote.providerRows || 'available'} contributors.`;
    } else if (title === 'Interbank' && quote.status === 'Manual') {
      status = 'Manual quote';
      description = `Using latest manually imported quote from ${quote.source}.`;
    }

    return {
      title,
      status,
      value: value > 0 ? `+${value}` : `${value}`,
      description,
      impact: template.impact,
      color: template.color,
      evidence:
        title === 'Interbank'
          ? [
              {
                source: quote.source,
                title: `${quote.status}: ${quote.rate}`,
                url: quote.status === 'BoG Daily Rate' ? BOG_DAILY_INTERBANK_URL : CEDIRATES_USD_GHS_URL,
                status: quote.status,
                impact: 'Immediate market direction'
              }
            ]
          : evidenceForTitle(sources, title)
    };
  });

  return signals;
}

function resolvePreviousClose(quote, history, manualPreviousClose = null) {
  const today = new Date().toISOString().slice(0, 10);
  const previousDaySnapshot = [...history]
    .reverse()
    .find((snapshot) => {
      const previousRate = plausibleUsdGhsRate(snapshot.marketState?.interbankRate);
      const snapshotDate = String(snapshot.generatedAt || '').slice(0, 10);
      return previousRate && snapshot.marketState?.quoteStatus !== 'Fallback' && snapshotDate && snapshotDate < today;
    });

  if (previousDaySnapshot?.marketState?.interbankRate) {
    return {
      previousClose: previousDaySnapshot.marketState.interbankRate,
      moveBasis: `Previous archived close from ${previousDaySnapshot.generatedAt?.slice(0, 10) || 'history'}`
    };
  }

  const previousSnapshot = [...history]
    .reverse()
    .find((snapshot) => {
      const previousRate = plausibleUsdGhsRate(snapshot.marketState?.interbankRate);
      return previousRate && snapshot.marketState?.quoteStatus !== 'Fallback';
    });

  if (previousSnapshot?.marketState?.interbankRate) {
    return {
      previousClose: previousSnapshot.marketState.interbankRate,
      moveBasis: `Latest archived ${previousSnapshot.marketState.quoteSource || 'market'} rate`
    };
  }

  if (plausibleUsdGhsRate(manualPreviousClose?.rate)) {
    return {
      previousClose: manualPreviousClose.rate,
      moveBasis: `${manualPreviousClose.source || 'Manual previous close'}${manualPreviousClose.date ? ` (${manualPreviousClose.date})` : ''}`
    };
  }

  if (plausibleUsdGhsRate(config.previousCloseRate)) {
    return {
      previousClose: config.previousCloseRate,
      moveBasis: `${config.previousCloseSource}${config.previousCloseDate ? ` (${config.previousCloseDate})` : ''}`
    };
  }

  return {
    previousClose: quote.previousClose,
    moveBasis: quote.previousClose === quote.rate ? 'No prior live archive yet' : 'Source-provided previous close'
  };
}

function resolvePreviousBogRate(history) {
  const previousSnapshot = [...history]
    .reverse()
    .find((snapshot) => plausibleUsdGhsRate(snapshot.marketState?.bogAnalysis?.rate));
  return previousSnapshot?.marketState?.bogAnalysis?.rate || null;
}

function buildBogAnalysis(quote, history = []) {
  const cediRatesBog = findContributor(
    quote.contributors || [],
    (text) => text.includes('bank of ghana') && text.includes('cedirates')
  );
  const previousCediRatesBog = findContributor(
    quote.previousQuote?.contributors || [],
    (text) => text.includes('bank of ghana') && text.includes('cedirates')
  );
  const blendedBog = (quote.contributors || []).find((row) => row.source === 'Bank of Ghana');
  const referenceRate = plausibleUsdGhsRate(quote.bogReference?.rate);
  const blendedRate = plausibleUsdGhsRate(blendedBog?.midRate);
  const providerMid = plausibleUsdGhsRate(cediRatesBog?.midRate);
  const rate = providerMid || referenceRate || blendedRate || null;
  const previousRate = plausibleUsdGhsRate(previousCediRatesBog?.midRate) || resolvePreviousBogRate(history);
  const move = rate && previousRate ? Number((((rate - previousRate) / previousRate) * 100).toFixed(2)) : null;

  if (!rate) {
    return {
      available: false,
      rate: null,
      buying: null,
      selling: null,
      previousRate: null,
      previousBuying: null,
      previousSelling: null,
      move: null,
      status: 'Unavailable',
      source: 'Bank of Ghana Daily Interbank FX Rates',
      url: BOG_DAILY_INTERBANK_URL,
      interpretation: 'BoG daily interbank reference was not available in this refresh.'
    };
  }

  const isReferenceOnly = Boolean(quote.bogReference);
  return {
    available: true,
    rate,
    buying: plausibleUsdGhsRate(cediRatesBog?.buying) || null,
    selling: plausibleUsdGhsRate(cediRatesBog?.selling) || null,
    midRate: rate,
    previousRate,
    previousBuying: plausibleUsdGhsRate(previousCediRatesBog?.buying) || null,
    previousSelling: plausibleUsdGhsRate(previousCediRatesBog?.selling) || null,
    previousMidRate: previousRate,
    previousDate: quote.previousQuoteDate || null,
    move,
    status: cediRatesBog ? 'CediRates Bank of Ghana provider row' : quote.bogReference?.status || 'Blended Live Sources',
    source: cediRatesBog ? 'CediRates - Bank of Ghana' : quote.bogReference?.source || 'Bank of Ghana Daily Interbank FX Rates',
    url: cediRatesBog?.sourceUrl || quote.bogReference?.url || BOG_DAILY_INTERBANK_URL,
    reason: quote.bogReference?.reason || 'BoG structured table value passed validation and was blended.',
    officialReference: quote.bogReference || null,
    includedInMarketAverage: Boolean(cediRatesBog) || !isReferenceOnly,
    interpretation: cediRatesBog
      ? 'BoG analysis uses the CediRates Bank of Ghana provider row for buying, selling, and mid-rate, with yesterday pulled from CediRates date history when available.'
      : isReferenceOnly
        ? 'BoG rate is shown as a separate official reference because it was not blended into the CediRates provider average.'
        : 'BoG rate passed validation and is included in the blended market average.'
  };
}

function buildMarketState(quote, signals, history = [], manualPreviousClose = null) {
  const { previousClose, moveBasis } = resolvePreviousClose(quote, history, manualPreviousClose);
  const dailyMove = Number((((quote.rate - previousClose) / previousClose) * 100).toFixed(2));
  const net = signals.reduce((total, signal) => total + Number(signal.value || 0), 0);
  const confidence = Math.min(88, Math.max(45, 58 + Math.round(Math.abs(net) / 2)));
  const outlook =
    net > 18 ? 'Mildly Bearish USD' : net < -10 ? 'Bullish USD' : 'Neutral USD/GHS';
  const cediView = net > 18 ? 'Bullish Cedi' : net < -10 ? 'Bearish Cedi' : 'Mixed Cedi';
  const lower = Math.max(0, quote.rate - 0.14).toFixed(2);
  const upper = (quote.rate + 0.1).toFixed(2);

  return {
    ...baseMarket,
    interbankRate: quote.rate,
    previousClose,
    dailyMove,
    moveBasis,
    expectedRange: `${lower} - ${upper}`,
    outlook,
    cediView,
    confidence,
    quoteSource: quote.source,
    quoteStatus: quote.status,
    quoteBuying: quote.buying || null,
    quoteSelling: quote.selling || null,
    quoteProviderRows: quote.providerRows || null,
    quoteProviderLastUpdated: quote.providerLastUpdated || null,
    quoteContributors: quote.contributors || [],
    bogReference: quote.bogReference || null,
    bogAnalysis: buildBogAnalysis(quote, history),
    lastUpdated:
      new Date().toLocaleTimeString('en-GB', {
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'UTC'
      }) + ' GMT'
  };
}

function buildProbabilities(signals) {
  const net = signals.reduce((total, signal) => total + Number(signal.value || 0), 0);
  const lower = Math.min(65, Math.max(22, 36 + Math.round(net / 3)));
  const higher = Math.min(48, Math.max(12, 32 - Math.round(net / 4)));
  const range = Math.max(10, 100 - lower - higher);

  return [
    { label: 'USD/GHS lower', value: lower, color: 'cedi' },
    { label: 'Range-bound', value: range, color: 'range' },
    { label: 'USD/GHS higher', value: higher, color: 'usd' }
  ];
}

const directionDriverRules = [
  {
    key: 'bog',
    label: 'BoG FX auction / support',
    weight: 3,
    positive: ['fx auction', 'foreign exchange', 'spot intervention', 'mops up', 'liquidity', 'support'],
    negative: ['oversubscribed', 'pressure', 'shortage', 'volatility'],
    fallback: 1
  },
  {
    key: 'gold',
    label: 'Gold prices / exports',
    weight: 2,
    positive: ['gold exports', 'gold price', 'goldbod', 'reserves', 'trade surplus'],
    negative: ['gold falls', 'lower gold', 'smuggling', 'hoarding'],
    fallback: 1
  },
  {
    key: 'cocoa',
    label: 'Cocoa receipts',
    weight: 2,
    positive: ['cocoa receipts', 'cocoa exports', 'cocoa earnings', 'cocobod', 'export receipts'],
    negative: ['cocoa financing', 'lower cocoa', 'payment pressure'],
    fallback: 0
  },
  {
    key: 'corporateDemand',
    label: 'Corporate USD demand',
    weight: 3,
    positive: ['no major importer demand', 'moderate demand', 'exporter supply'],
    negative: ['import demand', 'energy payments', 'omc', 'corporate demand', 'offshore demand', 'dividend repatriation'],
    fallback: 1,
    inverse: true
  },
  {
    key: 'imf',
    label: 'IMF program',
    weight: 1,
    positive: ['imf', 'review', 'disbursement', 'staff-level agreement', 'program'],
    negative: ['delay', 'missed target', 'program risk'],
    fallback: 0
  },
  {
    key: 'eurobond',
    label: 'Eurobond / debt tone',
    weight: 1,
    positive: ['eurobond', 'debt exchange', 'debt service', 'market access'],
    negative: ['debt pressure', 'default', 'arrears'],
    fallback: 0
  },
  {
    key: 'treasury',
    label: 'Treasury bills / liquidity',
    weight: 1,
    positive: ['treasury bill', 't-bill', 'oversubscribed', 'mops up', 'absorbs', 'liquidity'],
    negative: ['misses target', 'undersubscribed', 'liquidity stress'],
    fallback: 0
  },
  {
    key: 'inflation',
    label: 'Inflation releases',
    weight: 1,
    positive: ['inflation falls', 'disinflation', 'lower inflation'],
    negative: ['inflation rises', 'higher inflation', 'inflation pressure'],
    fallback: 0
  },
  {
    key: 'dxy',
    label: 'Global dollar / DXY',
    weight: 1,
    positive: ['dxy falls', 'dollar weakens', 'fed cut'],
    negative: ['dxy strong', 'dollar strengthens', 'hawkish fed', 'higher treasury yields', 'fomc'],
    fallback: 0,
    inverse: true
  }
];

function scoreDirectionRule(rule, sources) {
  const positiveEvidence = exactEvidenceByKeywords(sources, rule.positive);
  const negativeEvidence = exactEvidenceByKeywords(sources, rule.negative);
  const positiveHit = positiveEvidence.length > 0;
  const negativeHit = negativeEvidence.length > 0;

  let score = rule.fallback || 0;
  let evidence = evidenceByKeywords(sources, [...rule.positive, ...rule.negative]).slice(0, 2);
  let reason = 'No strong fresh article signal; using neutral/default desk assumption.';

  if (positiveHit && !negativeHit) {
    score = rule.weight;
    evidence = positiveEvidence;
    reason = rule.inverse ? 'Detected softer USD-demand pressure.' : 'Detected cedi-supportive signal.';
  } else if (negativeHit && !positiveHit) {
    score = -rule.weight;
    evidence = negativeEvidence;
    reason = rule.inverse ? 'Detected USD-positive demand/global dollar pressure.' : 'Detected cedi-negative risk.';
  } else if (positiveHit && negativeHit) {
    score = 0;
    evidence = [...positiveEvidence.slice(0, 2), ...negativeEvidence.slice(0, 2)];
    reason = 'Mixed evidence detected, so the score is neutralized.';
  }

  return {
    key: rule.key,
    label: rule.label,
    maxScore: rule.weight,
    score,
    reason,
    evidence: evidence.slice(0, 4)
  };
}

function cediScoreView(score) {
  if (score >= 5) return 'Strong Cedi';
  if (score >= 2) return 'Mild Cedi';
  if (score >= -1) return 'Neutral';
  if (score >= -4) return 'Mild USD';
  return 'Strong USD';
}

function buildDirectionEngine({ marketState, sources }) {
  const drivers = directionDriverRules.map((rule) => scoreDirectionRule(rule, sources));
  const totalScore = clamp(drivers.reduce((total, driver) => total + driver.score, 0), -10, 10);
  const bias = cediScoreView(totalScore);
  const cediPositive = totalScore > 1;
  const usdPositive = totalScore < -1;
  const currentRate = marketState.interbankRate;
  const rangeCenter = currentRate + (cediPositive ? -0.035 : usdPositive ? 0.04 : 0);
  const rangeWidth = totalScore === 0 ? 0.035 : 0.045;
  const expectedRange = `${Math.max(0, rangeCenter - rangeWidth).toFixed(2)} - ${(rangeCenter + rangeWidth).toFixed(2)}`;
  const lowerProbability = clamp(50 + totalScore * 5, 15, 85);
  const higherProbability = 100 - lowerProbability;
  const probability1225 = clamp(totalScore >= 2 ? 40 + totalScore * 5 : 22 + totalScore * 3, 8, 78);
  const probability1235 = clamp(totalScore <= -2 ? 40 + Math.abs(totalScore) * 5 : 22 - totalScore * 2, 8, 78);
  const probability1230 = clamp(100 - probability1225 - probability1235, 12, 62);
  const confidence = clamp(58 + Math.abs(totalScore) * 4 + drivers.filter((driver) => driver.evidence?.length).length * 2, 55, 88);
  const topDrivers = [...drivers]
    .filter((driver) => driver.score !== 0)
    .sort((a, b) => Math.abs(b.score) - Math.abs(a.score))
    .slice(0, 5);

  return {
    score: totalScore,
    bias,
    direction: cediPositive ? 'USD/GHS likely lower today' : usdPositive ? 'USD/GHS likely higher today' : 'USD/GHS likely range-bound today',
    confidence,
    expectedRange,
    probabilityLower: lowerProbability,
    probabilityHigher: higherProbability,
    tepScenarios: [
      { label: '12.25', description: 'Softer USD / stronger cedi outcome', probability: probability1225 },
      { label: '12.30', description: 'Range-bound TEP reference', probability: probability1230 },
      { label: '12.35', description: 'Higher USD demand outcome', probability: probability1235 }
    ],
    topDrivers: topDrivers.length ? topDrivers : drivers.slice(0, 5),
    dealerGuidance: cediPositive
      ? [
          'Be cautious chasing higher USD prices.',
          'Lock in buyers early if quotes soften.',
          'Expect softer PET/TEP quotes later if demand remains weak.'
        ]
      : usdPositive
        ? [
            'Secure TEP buyers quickly.',
            'Avoid waiting too long to cover Flex requests.',
            'Higher USD rates are more likely if demand remains concentrated.'
          ]
        : [
            'Treat 12.30-style quotes as fair until a fresh driver breaks the range.',
            'Stagger execution and watch importer demand after midday.',
            'Refresh the evidence board before covering large tickets.'
          ],
    explanation: topDrivers
      .map((driver) => `${driver.label}: ${driver.score > 0 ? '+' : ''}${driver.score}`)
      .join('; ')
  };
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function tomorrowIsoDate() {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

function scoreToOutlook(score) {
  if (score >= 70) return 'Strong Cedi Tomorrow';
  if (score >= 30) return 'Moderate Cedi Strength';
  if (score > -30) return 'Neutral';
  if (score > -70) return 'Moderate USD Strength';
  return 'Strong USD Strength';
}

function scoreToDirection(score) {
  if (score >= 15) return 'USD/GHS Expected to Decline Slightly';
  if (score <= -15) return 'USD/GHS Expected to Rise Slightly';
  return 'USD/GHS Expected to Trade Range-Bound';
}

const forecastEvidenceKeywords = {
  bogAuctions: ['fx auction', 'foreign exchange', 'spot intervention', 'bog', 'mops up', 'liquidity'],
  liquidity: ['treasury bill', 't-bill', 'auction', 'bond', 'liquidity', 'mops up', 'absorbs'],
  imf: ['imf', 'review', 'disbursement', 'staff-level agreement', 'program'],
  gold: ['gold', 'gold exports', 'gold price', 'goldbod', 'reserves', 'trade surplus'],
  cocoa: ['cocoa', 'cocoa exports', 'cocoa receipts', 'cocobod', 'export earnings'],
  fed: ['fed', 'fomc', 'cpi', 'nfp', 'payroll', 'inflation', 'dxy', 'dollar index'],
  marketDemand: ['demand', 'importer', 'corporate demand', 'energy payments', 'omc', 'offshore demand'],
  news: ['cedi', 'fiscal', 'budget', 'debt', 'eurobond', 'political', 'exchange rate']
};

const forecastSourceCategories = {
  bogAuctions: ['Bank of Ghana', 'BoG Daily Interbank'],
  liquidity: ['Treasury', 'Ghana News', 'Ghana News Agency', 'NewsGhana', 'Ghana Business News'],
  imf: ['IMF', 'Ghana News', 'Ghana News Agency', 'NewsGhana', 'Ghana Business News'],
  gold: ['Gold', 'GoldBod', 'Ghana News', 'Ghana News Agency', 'NewsGhana', 'Ghana Business News'],
  cocoa: ['Cocoa', 'Ghana News', 'Ghana News Agency', 'NewsGhana', 'Ghana Business News'],
  fed: ['Fed / US Data', 'US CPI / NFP', 'DXY'],
  marketDemand: ['Ghana News', 'Ghana News Agency', 'NewsGhana', 'Ghana Business News', 'Reuters', 'Bloomberg'],
  news: ['Ghana News', 'Ghana News Agency', 'NewsGhana', 'Ghana Business News', 'Reuters', 'Bloomberg']
};

function sourceMatchesForecastDriver(source, driver) {
  const allowed = forecastSourceCategories[driver.key];
  if (!allowed) return true;
  const label = `${source.category || ''} ${source.title || ''}`;
  return allowed.some((category) => label.includes(category));
}

function forecastEvidenceForDriver(driver, sources, signals) {
  const keywords = forecastEvidenceKeywords[driver.key] || [driver.label];
  const relevantSources = sources.filter((source) => sourceMatchesForecastDriver(source, driver));
  const exactRows = exactEvidenceByKeywords(relevantSources, keywords);
  if (exactRows.length) return exactRows.slice(0, 4);

  const signalEvidence = signals.find((signal) => signal.title === driver.signalTitle)?.evidence || [];
  if (signalEvidence.length) return signalEvidence.slice(0, 4);

  return evidenceForTitle(relevantSources.length ? relevantSources : sources, driver.signalTitle).slice(0, 3);
}

function isActionableEvidence(row) {
  const text = `${row.title || ''} ${row.snippet || ''}`.toLowerCase();
  return Boolean(row.url) && !/live fetch unavailable|no direct keyword match|no priority keyword/.test(text);
}

function buildForecast({ marketState, signals, sources = [] }) {
  const signalMap = new Map(signals.map((signal) => [signal.title, Number(signal.value || 0)]));
  const factors = forecastDrivers.map((driver) => {
    const rawSignal = signalMap.get(driver.signalTitle) || 0;
    const signedSignal = driver.direction === 'USD Positive' ? -Math.abs(rawSignal) : rawSignal;
    const score = clamp(Math.round((signedSignal / 25) * driver.weight), -driver.weight, driver.weight);
    const evidence = forecastEvidenceForDriver(driver, sources, signals);
    return {
      ...driver,
      rawSignal,
      score,
      evidence,
      reason:
        score > 0
          ? `${driver.label} is adding cedi-supportive weight for tomorrow.`
          : score < 0
            ? `${driver.label} is adding USD-supportive risk for tomorrow.`
            : `${driver.label} is not creating a strong directional signal yet.`
    };
  });

  const totalScore = clamp(
    factors.reduce((total, factor) => total + factor.score, 0),
    -100,
    100
  );
  const probabilityLower = clamp(50 + Math.round(totalScore * 0.35), 18, 82);
  const probabilityHigher = 100 - probabilityLower;
  const confidence = clamp(52 + Math.round(Math.abs(totalScore) * 0.65), 50, 88);
  const center = marketState.interbankRate + (totalScore >= 15 ? -0.03 : totalScore <= -15 ? 0.04 : 0);
  const lower = Math.max(0, center - 0.07).toFixed(2);
  const upper = (center + 0.07).toFixed(2);
  const predictedMidRate = Number(center.toFixed(4));
  const positiveDrivers = factors
    .filter((factor) => factor.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .map((factor) => `${factor.label}: +${factor.score}`);
  const riskFactors = factors
    .filter((factor) => factor.score < 0)
    .sort((a, b) => a.score - b.score)
    .slice(0, 4)
    .map((factor) => `${factor.label}: ${factor.score}`);
  const marketMovingNews = factors
    .filter((factor) => factor.evidence?.some(isActionableEvidence))
    .sort((a, b) => Math.abs(b.score) - Math.abs(a.score))
    .slice(0, 6)
    .map((factor) => ({
      label: factor.label,
      score: factor.score,
      reason: factor.reason,
      evidence: factor.evidence.filter(isActionableEvidence)
    }));
  const tomorrowScenarios = [
    {
      label: (predictedMidRate - 0.05).toFixed(2),
      description: 'Cedi-supportive continuation',
      probability: probabilityLower
    },
    {
      label: predictedMidRate.toFixed(2),
      description: 'Base-case midpoint',
      probability: clamp(100 - Math.abs(probabilityLower - probabilityHigher), 18, 55)
    },
    {
      label: (predictedMidRate + 0.05).toFixed(2),
      description: 'USD demand upside risk',
      probability: probabilityHigher
    }
  ];

  return {
    forecastDate: tomorrowIsoDate(),
    totalScore,
    outlook: scoreToOutlook(totalScore),
    direction: scoreToDirection(totalScore),
    probabilityHigher,
    probabilityLower,
    confidence,
    predictedMidRate,
    expectedRange: `${lower} - ${upper}`,
    tomorrowScenarios,
    factors,
    marketMovingNews,
    keyDrivers: positiveDrivers.length
      ? positiveDrivers
      : ['No single cedi-positive driver is dominant today.'],
    riskFactors: riskFactors.length
      ? riskFactors
      : ['Unexpected offshore demand', 'Stronger-than-expected US data'],
    conclusion:
      totalScore >= 15
        ? 'Current information favors modest cedi appreciation over the next trading session.'
        : totalScore <= -15
          ? 'Current information favors modest USD/GHS upside risk over the next trading session.'
          : 'Current information favors a range-bound USD/GHS session.'
  };
}

function buildRegime({ signals, forecast }) {
  const signalMap = new Map(signals.map((signal) => [signal.title, Number(signal.value || 0)]));
  const cediSupport =
    (signalMap.get('Bank of Ghana') || 0) + (signalMap.get('Treasury') || 0) + (signalMap.get('IMF') || 0) + (signalMap.get('Gold') || 0);
  const demandStress = Math.max(0, -(signalMap.get('Interbank') || 0)) + Math.max(0, -(signalMap.get('News Sentiment') || 0));
  const globalUsd = Math.max(0, -(signalMap.get('Fed / US Data') || 0));

  if (globalUsd >= 12 && globalUsd >= cediSupport / 3) {
    return {
      name: 'GLOBAL USD STRENGTH',
      expectedDirection: 'Upward',
      description: 'Strong US data or hawkish Fed conditions are supporting the dollar.',
      score: globalUsd
    };
  }

  if (demandStress >= 15 || forecast.totalScore <= -30) {
    return {
      name: 'USD DEMAND STRESS',
      expectedDirection: 'Upward',
      description: 'Local USD demand pressure is outweighing available supply.',
      score: demandStress
    };
  }

  return {
    name: 'CEDI SUPPORTIVE',
    expectedDirection: 'Downward',
    description: 'BoG, liquidity, IMF, and commodity factors are supportive for the cedi.',
    score: cediSupport
  };
}

function buildDealerSignal({ forecast, marketState }) {
  const bias =
    forecast.totalScore >= 30
      ? 'Bullish Cedi'
      : forecast.totalScore <= -30
        ? 'Bullish USD'
        : forecast.totalScore >= 10
          ? 'Slightly Bullish Cedi'
          : forecast.totalScore <= -10
            ? 'Slightly Bullish USD'
            : 'Neutral';
  const conviction = (clamp(5 + Math.abs(forecast.totalScore) / 20, 4.5, 9.2)).toFixed(1);
  return {
    shortTermBias: bias,
    conviction: Number(conviction),
    positioningView:
      forecast.totalScore >= 10
        ? 'Expect exporters to sell USD and local demand to remain moderate.'
        : forecast.totalScore <= -10
          ? 'Expect importers to bid more actively and exporters to hold back supply.'
          : 'Expect two-way interest with limited directional conviction.',
    risk: marketState.quoteStatus === 'Fallback' ? 'Medium: interbank feed is fallback' : forecast.confidence > 75 ? 'Low' : 'Medium'
  };
}

function buildAccuracyTracker(history, manualActuals = []) {
  const rows = [];
  const actualMap = new Map(manualActuals.map((actual) => [actual.date, actual]));

  const forecastSnapshots = new Map();
  for (const snapshot of history) {
    if (snapshot.forecast?.forecastDate) {
      forecastSnapshots.set(snapshot.forecast.forecastDate, snapshot);
    }
  }

  for (const forecastSnapshot of forecastSnapshots.values()) {
    const forecast = forecastSnapshot.forecast;
    if (!forecast) continue;

    const forecastDirection =
      forecast.probabilityLower > forecast.probabilityHigher ? 'USD/GHS Down' : 'USD/GHS Up';
    const manualActual = actualMap.get(forecast.forecastDate);
    const actualSnapshot = history.find((snapshot) => {
      const snapshotDate = (snapshot.generatedAt || '').slice(0, 10);
      return snapshotDate >= forecast.forecastDate && snapshot.marketState?.interbankRate;
    });
    if (!manualActual && !actualSnapshot) continue;

    const actualDirection = manualActual
      ? manualActual.direction
      : actualSnapshot.marketState.interbankRate < forecastSnapshot.marketState.interbankRate
        ? 'Down'
        : actualSnapshot.marketState.interbankRate > forecastSnapshot.marketState.interbankRate
          ? 'Up'
          : 'Flat';
    const correct =
      (forecastDirection === 'USD/GHS Down' && actualDirection === 'Down') ||
      (forecastDirection === 'USD/GHS Up' && actualDirection === 'Up');

    rows.push({
      date: forecast.forecastDate,
      forecast: forecastDirection,
      actualResult: actualDirection,
      correct
    });
  }

  for (const manualActual of manualActuals) {
    const alreadyIncluded = rows.some((row) => row.date === manualActual.date);
    const matchingSnapshot = history.find((snapshot) => snapshot.forecast?.forecastDate === manualActual.date);
    if (alreadyIncluded || !matchingSnapshot?.forecast) continue;

    const forecastDirection =
      matchingSnapshot.forecast.probabilityLower > matchingSnapshot.forecast.probabilityHigher
        ? 'USD/GHS Down'
        : 'USD/GHS Up';
    rows.push({
      date: manualActual.date,
      forecast: forecastDirection,
      actualResult: manualActual.direction,
      correct:
        (forecastDirection === 'USD/GHS Down' && manualActual.direction === 'Down') ||
        (forecastDirection === 'USD/GHS Up' && manualActual.direction === 'Up')
    });
  }

  function accuracy(limit) {
    const slice = rows.slice(-limit);
    if (!slice.length) return null;
    const correct = slice.filter((row) => row.correct).length;
    return Math.round((correct / slice.length) * 100);
  }

  return {
    currentAccuracy: accuracy(30),
    sevenDayAccuracy: accuracy(7),
    thirtyDayAccuracy: accuracy(30),
    ninetyDayAccuracy: accuracy(90),
    samples: rows.slice(-10)
  };
}

function buildDeliverables() {
  return [
    { time: '07:00', name: 'Morning Brief', purpose: 'What happened overnight?' },
    { time: '12:00', name: 'Midday Update', purpose: "What's happening now?" },
    { time: '17:00', name: 'Close of Market Report', purpose: 'What happened today?' },
    { time: '17:05', name: 'Next-Day Forecast', purpose: 'Will USD/GHS rise or fall tomorrow?' },
    { time: 'Real-time', name: 'Alerts', purpose: 'BoG, IMF, Fed, gold, cocoa, liquidity, and unusual demand events.' },
    { time: 'Continuous', name: 'Forecast Accuracy Dashboard', purpose: 'Evaluate and improve predictions.' }
  ];
}

function buildAiPrompt({ marketState, signals, probability, sources, forecast, regime, dealerSignal }) {
  return JSON.stringify({
    instruction:
      'Return JSON only with keys morning, midday, close, afternoon, executive. Each note must include title, time, outlook, summary, bullets. The afternoon note must include the next-day USD/GHS forecast.',
    marketState,
    signals,
    probability,
    forecast,
    regime,
    dealerSignal,
    sourceHeadlines: sources.slice(0, 12).map((source) => ({
      category: source.category,
      headlines: source.headlines
    }))
  });
}

function normalizeNotesJson(text) {
  if (!text) return null;
  const trimmed = text.trim();
  const jsonText = trimmed.startsWith('{')
    ? trimmed
    : trimmed.slice(trimmed.indexOf('{'), trimmed.lastIndexOf('}') + 1);
  const parsed = JSON.parse(jsonText);
  return parsed?.morning && parsed?.afternoon && parsed?.executive ? parsed : null;
}

async function callOpenAiResponses(prompt) {
  if (!config.openaiApiKey) return null;
  const { controller, timeout } = timeoutSignal(30000);
  const payload = {
    model: config.openaiModel,
    input: [
      {
        role: 'system',
        content:
          'You are a Ghana FX market analyst. Produce concise USD/GHS morning, afternoon, and executive market notes as JSON only.'
      },
      { role: 'user', content: prompt }
    ],
    text: { format: { type: 'json_object' } }
  };

  try {
    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      signal: controller.signal,
      headers: {
        authorization: `Bearer ${config.openaiApiKey}`,
        'content-type': 'application/json'
      },
      body: JSON.stringify(payload)
    });
    if (!response.ok) return null;
    const json = await response.json();
    return normalizeNotesJson(json.output_text || json.output?.[0]?.content?.[0]?.text);
  } finally {
    clearTimeout(timeout);
  }
}

async function callOpenAiCompatible({ apiKey, baseUrl, model, prompt, provider }) {
  if (!apiKey) return null;
  const { controller, timeout } = timeoutSignal(30000);
  try {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        authorization: `Bearer ${apiKey}`,
        'content-type': 'application/json',
        'http-referer': config.publicBaseUrl,
        'x-title': 'USD/GHS Market Intelligence Agent'
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: 'system',
            content:
              'You are a Ghana FX market analyst. Return valid JSON only. No markdown.'
          },
          { role: 'user', content: prompt }
        ],
        response_format: provider === 'groq' ? undefined : { type: 'json_object' },
        temperature: 0.2
      })
    });
    if (!response.ok) return null;
    const json = await response.json();
    return normalizeNotesJson(json.choices?.[0]?.message?.content);
  } finally {
    clearTimeout(timeout);
  }
}

async function buildAiNotes({ marketState, signals, probability, sources, forecast, regime, dealerSignal }) {
  const prompt = buildAiPrompt({ marketState, signals, probability, sources, forecast, regime, dealerSignal });

  try {
    if (config.aiProvider === 'deepseek') {
      return await callOpenAiCompatible({
        apiKey: config.deepseekApiKey,
        baseUrl: 'https://api.deepseek.com',
        model: config.deepseekModel,
        prompt,
        provider: 'deepseek'
      });
    }

    if (config.aiProvider === 'openrouter') {
      return await callOpenAiCompatible({
        apiKey: config.openrouterApiKey,
        baseUrl: 'https://openrouter.ai/api/v1',
        model: config.openrouterModel,
        prompt,
        provider: 'openrouter'
      });
    }

    if (config.aiProvider === 'groq') {
      return await callOpenAiCompatible({
        apiKey: config.groqApiKey,
        baseUrl: 'https://api.groq.com/openai/v1',
        model: config.groqModel,
        prompt,
        provider: 'groq'
      });
    }

    return await callOpenAiResponses(prompt);
  } catch {
    return null;
  }
}

function buildFallbackNotes({ marketState, signals, probability, forecast, regime, dealerSignal }) {
  const topDrivers = signals
    .filter((signal) => Number(signal.value) > 0)
    .sort((a, b) => Number(b.value) - Number(a.value))
    .slice(0, 4)
    .map((signal) => `${signal.title}: ${signal.impact.toLowerCase()}`);
  const commonSources = signals.flatMap((signal) => signal.evidence || []).slice(0, 10);

  return {
    morning: {
      title: 'USD/GHS Morning Brief',
      availableAtHour: 7,
      time: `Generated ${marketState.lastUpdated}`,
      outlook: `${marketState.outlook} / ${marketState.cediView}`,
      summary: 'Supply is slightly ahead of demand after softer interbank quotes and supportive official-sector conditions.',
      bullets: [
        `Current interbank rate: ${marketState.interbankRate.toFixed(2)}.`,
        `Yesterday's move: ${marketState.dailyMove}% against the USD.`,
        `Expected range: ${marketState.expectedRange}.`,
        `Highest probability: ${probability[0].label} at ${probability[0].value}%.`,
        ...topDrivers
      ],
      sources: commonSources
    },
    midday: {
      title: 'USD/GHS Midday Update',
      availableAtHour: 12,
      time: 'Generated 12:00 GMT',
      outlook: `${marketState.outlook} / ${marketState.cediView}`,
      summary: 'Midday conditions remain anchored by source health, interbank direction, and demand/supply balance.',
      bullets: [
        `Current interbank rate: ${marketState.interbankRate.toFixed(2)}.`,
        `Regime: ${regime.name}.`,
        `Dealer signal: ${dealerSignal.shortTermBias} with ${dealerSignal.conviction}/10 conviction.`,
        `Probability USD/GHS lower tomorrow: ${forecast.probabilityLower}%.`
      ],
      sources: commonSources
    },
    close: {
      title: 'USD/GHS Close of Market Report',
      availableAtHour: 17,
      time: 'Generated 17:00 GMT',
      outlook: `${marketState.outlook} / ${marketState.cediView}`,
      summary: 'Close report summarizes today’s drivers and prepares the next-day forecast.',
      bullets: [
        `Daily score: ${forecast.totalScore}.`,
        `Tomorrow's bias: ${forecast.outlook}.`,
        `Expected range tomorrow: ${forecast.expectedRange}.`,
        `Main risks: ${forecast.riskFactors.join('; ')}.`
      ],
      sources: commonSources
    },
    afternoon: {
      title: 'USD/GHS Afternoon Watch',
      availableAtHour: 14,
      time: 'Scheduled 14:30 GMT',
      outlook: forecast.direction,
      summary: `NEXT-DAY USD/GHS FORECAST: ${forecast.conclusion}`,
      bullets: [
        `Forecast date: ${forecast.forecastDate}.`,
        `USD/GHS higher tomorrow: ${forecast.probabilityHigher}%.`,
        `USD/GHS lower tomorrow: ${forecast.probabilityLower}%.`,
        `Confidence level: ${forecast.confidence}%.`,
        `Expected trading range: ${forecast.expectedRange}.`,
        `Key drivers: ${forecast.keyDrivers.join('; ')}.`,
        `Risk factors: ${forecast.riskFactors.join('; ')}.`
      ],
      sources: commonSources
    },
    executive: {
      title: 'Executive Snapshot',
      availableAtHour: 7,
      time: 'One-page version',
      outlook: 'Cedi-positive bias with global USD risk',
      summary: 'Designed for executives who need the call, the range, and the main risks in under a minute.',
      bullets: [
        `Base case: USD/GHS trades inside ${marketState.expectedRange}.`,
        'Upside risk comes from Fed repricing or concentrated importer demand.',
        'Downside risk comes from BoG supply, stronger gold, and cleaner market liquidity.',
        'Recommended action: stagger near-term USD purchases while quotes remain offered.'
      ],
      sources: commonSources
    }
  };
}

function normalizeTimedNotes(notes, fallbackSources) {
  const schedule = {
    morning: { availableAtHour: 7, title: 'USD/GHS Morning Brief' },
    midday: { availableAtHour: 12, title: 'USD/GHS Midday Update' },
    afternoon: { availableAtHour: 14, title: 'USD/GHS Afternoon Watch' },
    close: { availableAtHour: 17, title: 'USD/GHS Close of Market Report' },
    executive: { availableAtHour: 7, title: 'Executive Snapshot' }
  };

  return Object.fromEntries(
    Object.entries(notes).map(([key, note]) => [
      key,
      {
        ...note,
        title: note.title || schedule[key]?.title || key,
        availableAtHour: note.availableAtHour ?? schedule[key]?.availableAtHour ?? 7,
        sources: note.sources || fallbackSources
      }
    ])
  );
}

function buildFlowReadings(signals, sources = [], marketState = {}) {
  const net = signals.reduce((total, signal) => total + Number(signal.value || 0), 0);
  return [
    {
      label: 'Corporate USD bids',
      value: net > 20 ? 38 : 55,
      tone: net > 20 ? 'good' : 'watch',
      evidence: evidenceByKeywords(sources, ['demand', 'importer', 'forex', 'exchange rate']).concat([
        { source: marketState.quoteSource, title: `USD/GHS quote status: ${marketState.quoteStatus}`, url: CEDIRATES_USD_GHS_URL }
      ])
    },
    {
      label: 'Exporter supply',
      value: net > 20 ? 72 : 58,
      tone: 'good',
      evidence: evidenceByKeywords(sources, ['gold', 'cocoa', 'export', 'receipts'])
    },
    {
      label: 'Bank liquidity stress',
      value: net > 20 ? 34 : 48,
      tone: net > 20 ? 'good' : 'watch',
      evidence: evidenceByKeywords(sources, ['treasury bill', 'bond', 'auction', 'liquidity'])
    },
    {
      label: 'Headline risk',
      value: 44,
      tone: 'watch',
      evidence: evidenceByKeywords(sources, ['budget', 'fiscal', 'debt', 'political', 'cedi'])
    }
  ];
}

function buildAlerts({ marketState, signals, sources }) {
  const fedSignal = signals.find((signal) => signal.title === 'Fed / US Data');
  const interbankSignal = signals.find((signal) => signal.title === 'Interbank');
  return [
    {
      title: 'Importer bid concentration',
      severity: marketState.demandPressure === 'High' ? 'Risk' : 'Watch',
      detail: 'Energy, manufacturing, and corporate demand should be compared against afternoon quote depth.',
      evidence: evidenceByKeywords(sources, ['demand', 'importer', 'forex', 'exchange rate'])
    },
    {
      title: 'Global USD repricing',
      severity: Number(fedSignal?.value || 0) < -8 ? 'Risk' : 'Watch',
      detail: 'Hot US CPI, NFP, or Fed repricing would weaken the cedi-positive setup.',
      evidence: evidenceForTitle(sources, 'Fed / US Data')
    },
    {
      title: 'Interbank feed status',
      severity: marketState.quoteStatus === 'Fallback' ? 'Risk' : 'Support',
      detail: `${interbankSignal?.status || 'Interbank'}: ${marketState.quoteSource}.`,
      evidence: interbankSignal?.evidence || []
    }
  ];
}

function buildSourceHealth(sources, quote) {
  const health = sources.map((source) => ({
    name: source.category,
    cadence: source.cadence,
    lastSeen: new Date(source.lastSeen).toLocaleTimeString('en-GB', {
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'UTC'
    }),
    status: source.status,
    score: source.score,
    headlines: source.headlines,
    articles: source.articles || [],
    url: source.url,
    impact: source.impact
  }));

  health.unshift({
    name: 'Interbank USD/GHS',
    cadence: '5 min',
    lastSeen: new Date().toLocaleTimeString('en-GB', {
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'UTC'
    }),
    status: quote.status,
    score: quote.status === 'Fallback' ? 55 : 96,
    headlines: [
      `${quote.source}: ${quote.rate}`,
      quote.buying && quote.selling ? `Average buying/selling: ${quote.buying} / ${quote.selling}` : null,
      quote.providerRows ? `${quote.providerRows} CediRates contributors included` : null
    ].filter(Boolean),
    url:
      config.interbankApiUrl ||
      (quote.status === 'BoG Daily Rate' ? BOG_DAILY_INTERBANK_URL : quote.status?.startsWith('CediRates') ? CEDIRATES_USD_GHS_URL : 'data/interbank-quotes.csv'),
    impact: 'Immediate market direction'
  });

  return health;
}

function buildEvents() {
  return [
    { time: '07:00', title: 'Morning market note', tag: 'Delivery', tone: 'good' },
    { time: '09:30', title: 'BoG notice scan', tag: 'Automated', tone: 'good' },
    { time: '11:00', title: 'Treasury auction result check', tag: 'Liquidity', tone: 'watch' },
    { time: '12:30', title: 'Gold and cocoa flow refresh', tag: 'Commodities', tone: 'good' },
    { time: '13:30', title: 'US CPI / Fed calendar monitor', tag: 'Global USD', tone: 'risk' },
    { time: '12:00', title: 'Midday market update', tag: 'Delivery', tone: 'good' },
    { time: '17:00', title: 'Close of market report', tag: 'Delivery', tone: 'good' },
    { time: '17:05', title: 'Next-day forecast', tag: 'Forecast', tone: 'good' }
  ];
}

function buildDeliveryChannels() {
  return [
    {
      label: 'Email brief',
      status: config.smtp.host && config.smtp.to ? 'Configured' : 'Needs SMTP config'
    },
    {
      label: 'WhatsApp / Telegram',
      status:
        config.twilio.accountSid || config.telegram.botToken
          ? 'Alert channel configured'
          : 'Needs Twilio or Telegram config'
    },
    { label: 'Data archive', status: 'Every refresh' },
    { label: 'Dealer note export', status: 'Manual send' }
  ];
}

async function buildIntelligence() {
  const [official, commodities, licensedNews, quote] = await Promise.all([
    Promise.all(officialSources.map(fetchSource)),
    Promise.all(commoditySources.map(fetchSource)),
    fetchLicensedNews(),
    fetchInterbankQuote()
  ]);
  const allSources = [...official, ...commodities, ...licensedNews];
  const signals = buildSignals({ sources: allSources, quote });
  const history = await readArchiveHistory(120);
  const manualPreviousClose = await readPreviousClose();
  const marketState = buildMarketState(quote, signals, history, manualPreviousClose);
  const probability = buildProbabilities(signals);
  const forecast = buildForecast({ marketState, signals, sources: allSources });
  const directionEngine = buildDirectionEngine({ marketState, sources: allSources });
  const regime = buildRegime({ signals, forecast });
  const dealerSignal = buildDealerSignal({ forecast, marketState });
  const manualActuals = await readForecastActuals();
  const accuracyTracker = buildAccuracyTracker(history, manualActuals);
  const aiNotes = await buildAiNotes({ marketState, signals, probability, sources: allSources, forecast, regime, dealerSignal });
  const fallbackSources = signals.flatMap((signal) => signal.evidence || []).slice(0, 10);
  const notes = normalizeTimedNotes(
    aiNotes || buildFallbackNotes({ marketState, signals, probability, forecast, regime, dealerSignal }),
    fallbackSources
  );

  return {
    generatedAt: new Date().toISOString(),
    marketState,
    signals,
    probability,
    directionEngine,
    forecast,
    regime,
    dealerSignal,
    accuracyTracker,
    notes,
    events: buildEvents(),
    deliverables: buildDeliverables(),
    alerts: buildAlerts({ marketState, signals, sources: allSources }),
    sourceHealth: buildSourceHealth(allSources, quote),
    flowReadings: buildFlowReadings(signals, allSources, marketState),
    deliveryChannels: buildDeliveryChannels(),
    sourcePolicy: {
      reutersBloomberg:
        'Connect licensed Reuters/Bloomberg feeds through REUTERS_FEED_URL, BLOOMBERG_FEED_URL, or LICENSED_NEWS_DIR imports.',
      liveData:
        'Public official-source connectors are enabled. USD/GHS rate priority is custom interbank feed, CediRates API, BoG Daily Interbank FX Rates, CediRates public bank average, manual quote, then clearly marked fallback. Reuters, Bloomberg, OpenAI, SMTP, and messaging channels require credentials or feed URLs.'
    }
  };
}

module.exports = {
  buildIntelligence
};
