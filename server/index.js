const express = require('express');
const cors = require('cors');
const path = require('path');
const { buildIntelligence } = require('./intelligence');
const { config } = require('./config');
const {
  archiveSnapshot,
  appendForecastActual,
  readLatestArchive,
  readArchiveHistory,
  appendManualQuote,
  writePreviousClose,
  readPreviousClose
} = require('./storage');
const { deliverNote, noteToText } = require('./delivery');

const app = express();

let cache = null;
let cacheTime = 0;
let schedulerState = {
  enabled: config.scheduler.enabled,
  lastMorningRun: null,
  lastAfternoonRun: null,
  lastError: null
};

const cacheTtlMs = 5 * 60 * 1000;

app.use(cors());
app.use(express.json({ limit: '1mb' }));

const distPath = path.join(__dirname, '..', 'dist');
app.use(express.static(distPath));

async function getIntelligence({ force = false, archive = false } = {}) {
  const isFresh = cache && Date.now() - cacheTime < cacheTtlMs;
  if (!force && isFresh) return cache;

  cache = await buildIntelligence();
  cacheTime = Date.now();

  if (archive) {
    await archiveSnapshot(cache);
  }

  return cache;
}

function configStatus() {
  return {
    interbankApi: Boolean(config.interbankApiUrl),
    cediRatesApi: Boolean(config.cediRatesApiKey),
    previousCloseEnv: Boolean(config.previousCloseRate),
    goldApi: Boolean(config.goldApiUrl),
    cocoaApi: Boolean(config.cocoaApiUrl),
    aiProvider: config.aiProvider,
    openai: Boolean(config.openaiApiKey),
    deepseek: Boolean(config.deepseekApiKey),
    openrouter: Boolean(config.openrouterApiKey),
    groq: Boolean(config.groqApiKey),
    reuters: Boolean(config.reutersFeedUrl),
    bloomberg: Boolean(config.bloombergFeedUrl),
    smtp: Boolean(config.smtp.host && config.smtp.to),
    telegram: Boolean(config.telegram.botToken && config.telegram.chatId),
    whatsapp: Boolean(config.twilio.accountSid && config.twilio.authToken && config.twilio.from && config.twilio.to),
    scheduler: config.scheduler
  };
}

function csvEscape(value) {
  if (value === null || value === undefined) return '';
  const text = String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function toCsv(rows, headers) {
  return [
    headers.join(','),
    ...rows.map((row) => headers.map((header) => csvEscape(row[header])).join(','))
  ].join('\n');
}

function sendCsv(response, filename, rows, headers) {
  response.setHeader('content-type', 'text/csv; charset=utf-8');
  response.setHeader('content-disposition', `attachment; filename="${filename}"`);
  response.send(toCsv(rows, headers));
}

function snapshotSummaryRows(history) {
  return history.map((snapshot) => ({
    generatedAt: snapshot.generatedAt,
    pair: snapshot.marketState?.pair,
    rate: snapshot.marketState?.interbankRate,
    previousClose: snapshot.marketState?.previousClose,
    dailyMove: snapshot.marketState?.dailyMove,
    outlook: snapshot.marketState?.outlook,
    cediView: snapshot.marketState?.cediView,
    confidence: snapshot.marketState?.confidence,
    range: snapshot.marketState?.expectedRange,
    quoteStatus: snapshot.marketState?.quoteStatus,
    forecastDate: snapshot.forecast?.forecastDate,
    forecastScore: snapshot.forecast?.totalScore,
    forecastDirection: snapshot.forecast?.direction,
    probabilityHigher: snapshot.forecast?.probabilityHigher,
    probabilityLower: snapshot.forecast?.probabilityLower,
    forecastConfidence: snapshot.forecast?.confidence,
    forecastRange: snapshot.forecast?.expectedRange,
    regime: snapshot.regime?.name,
    dealerBias: snapshot.dealerSignal?.shortTermBias
  }));
}

function forecastRows(history) {
  return history
    .filter((snapshot) => snapshot.forecast)
    .map((snapshot) => ({
      generatedAt: snapshot.generatedAt,
      forecastDate: snapshot.forecast.forecastDate,
      totalScore: snapshot.forecast.totalScore,
      outlook: snapshot.forecast.outlook,
      direction: snapshot.forecast.direction,
      probabilityHigher: snapshot.forecast.probabilityHigher,
      probabilityLower: snapshot.forecast.probabilityLower,
      confidence: snapshot.forecast.confidence,
      expectedRange: snapshot.forecast.expectedRange,
      keyDrivers: snapshot.forecast.keyDrivers?.join('; '),
      riskFactors: snapshot.forecast.riskFactors?.join('; '),
      conclusion: snapshot.forecast.conclusion
    }));
}

function signalRows(snapshot) {
  return (snapshot.signals || []).map((signal) => ({
    generatedAt: snapshot.generatedAt,
    title: signal.title,
    status: signal.status,
    value: signal.value,
    impact: signal.impact,
    description: signal.description
  }));
}

function accuracyRows(snapshot) {
  return (snapshot.accuracyTracker?.samples || []).map((sample) => ({
    date: sample.date,
    forecast: sample.forecast,
    actualResult: sample.actualResult,
    correct: sample.correct ? 'Yes' : 'No'
  }));
}

app.get('/api/health', (_request, response) => {
  response.json({
    ok: true,
    service: 'usd-ghs-market-intelligence-agent',
    cacheAgeSeconds: cache ? Math.round((Date.now() - cacheTime) / 1000) : null,
    config: configStatus()
  });
});

app.get('/api/config/status', (_request, response) => {
  response.json(configStatus());
});

app.get('/api/market-intelligence', async (_request, response) => {
  try {
    response.json(await getIntelligence());
  } catch (error) {
    response.status(500).json({
      ok: false,
      error: error.message
    });
  }
});

app.post('/api/refresh', async (_request, response) => {
  try {
    response.json(await getIntelligence({ force: true, archive: true }));
  } catch (error) {
    response.status(500).json({
      ok: false,
      error: error.message
    });
  }
});

app.post('/api/interbank-quote', async (request, response) => {
  const rate = Number(request.body?.rate);
  if (!rate || rate <= 0) {
    response.status(400).json({ ok: false, error: 'A positive numeric rate is required.' });
    return;
  }

  try {
    await appendManualQuote({
      rate,
      source: request.body?.source || 'Manual desk quote',
      timestamp: request.body?.timestamp || new Date().toISOString()
    });
    response.json(await getIntelligence({ force: true, archive: true }));
  } catch (error) {
    response.status(500).json({ ok: false, error: error.message });
  }
});

app.get('/api/previous-close', async (_request, response) => {
  try {
    response.json({
      manual: await readPreviousClose(),
      env: config.previousCloseRate
        ? {
            rate: config.previousCloseRate,
            date: config.previousCloseDate,
            source: config.previousCloseSource
          }
        : null
    });
  } catch (error) {
    response.status(500).json({ ok: false, error: error.message });
  }
});

app.post('/api/previous-close', async (request, response) => {
  const rate = Number(request.body?.rate);
  if (!rate || rate <= 0) {
    response.status(400).json({ ok: false, error: 'A positive numeric previous close rate is required.' });
    return;
  }

  try {
    await writePreviousClose({
      rate,
      date: request.body?.date || new Date().toISOString().slice(0, 10),
      source: request.body?.source || 'Manual previous close'
    });
    response.json(await getIntelligence({ force: true, archive: true }));
  } catch (error) {
    response.status(500).json({ ok: false, error: error.message });
  }
});

app.post('/api/forecast-actual', async (request, response) => {
  const date = request.body?.date;
  const direction = request.body?.direction;
  if (!date || !['Up', 'Down', 'Flat'].includes(direction)) {
    response.status(400).json({
      ok: false,
      error: 'date and direction are required. direction must be Up, Down, or Flat.'
    });
    return;
  }

  try {
    await appendForecastActual({
      date,
      direction,
      rate: request.body?.rate,
      source: request.body?.source || 'Manual actual'
    });
    response.json(await getIntelligence({ force: true, archive: true }));
  } catch (error) {
    response.status(500).json({ ok: false, error: error.message });
  }
});

app.post('/api/deliver', async (request, response) => {
  try {
    const snapshot = await getIntelligence();
    const noteType = request.body?.noteType || 'morning';
    const channels = Array.isArray(request.body?.channels) ? request.body.channels : ['email'];
    response.json(await deliverNote(snapshot, noteType, channels));
  } catch (error) {
    response.status(500).json({
      ok: false,
      error: error.message
    });
  }
});

app.get('/api/note/:type/text', async (request, response) => {
  try {
    const snapshot = await getIntelligence();
    const note = snapshot.notes[request.params.type] || snapshot.notes.morning;
    response.type('text/plain').send(noteToText(note, snapshot));
  } catch (error) {
    response.status(500).json({
      ok: false,
      error: error.message
    });
  }
});

app.get('/api/archive/latest', async (_request, response) => {
  try {
    response.json(await readLatestArchive());
  } catch (error) {
    response.status(500).json({
      ok: false,
      error: error.message
    });
  }
});

app.get('/api/archive/history', async (request, response) => {
  try {
    const limit = Math.min(100, Math.max(1, Number(request.query.limit || 20)));
    response.json(await readArchiveHistory(limit));
  } catch (error) {
    response.status(500).json({
      ok: false,
      error: error.message
    });
  }
});

app.get('/api/export/latest.csv', async (_request, response) => {
  try {
    const snapshot = (await readLatestArchive()) || (await getIntelligence());
    const rows = snapshotSummaryRows([snapshot]);
    sendCsv(response, 'usd-ghs-latest.csv', rows, Object.keys(rows[0]));
  } catch (error) {
    response.status(500).json({ ok: false, error: error.message });
  }
});

app.get('/api/export/history.csv', async (request, response) => {
  try {
    const limit = Math.min(500, Math.max(1, Number(request.query.limit || 100)));
    const history = await readArchiveHistory(limit);
    const rows = snapshotSummaryRows(history);
    const headers = rows[0] ? Object.keys(rows[0]) : ['generatedAt'];
    sendCsv(response, 'usd-ghs-history.csv', rows, headers);
  } catch (error) {
    response.status(500).json({ ok: false, error: error.message });
  }
});

app.get('/api/export/forecasts.csv', async (request, response) => {
  try {
    const limit = Math.min(500, Math.max(1, Number(request.query.limit || 100)));
    const rows = forecastRows(await readArchiveHistory(limit));
    const headers = rows[0]
      ? Object.keys(rows[0])
      : ['generatedAt', 'forecastDate', 'totalScore', 'outlook', 'direction'];
    sendCsv(response, 'usd-ghs-forecasts.csv', rows, headers);
  } catch (error) {
    response.status(500).json({ ok: false, error: error.message });
  }
});

app.get('/api/export/signals.csv', async (_request, response) => {
  try {
    const snapshot = (await readLatestArchive()) || (await getIntelligence());
    const rows = signalRows(snapshot);
    const headers = rows[0] ? Object.keys(rows[0]) : ['generatedAt', 'title', 'status', 'value'];
    sendCsv(response, 'usd-ghs-signals.csv', rows, headers);
  } catch (error) {
    response.status(500).json({ ok: false, error: error.message });
  }
});

app.get('/api/export/accuracy.csv', async (_request, response) => {
  try {
    const snapshot = (await readLatestArchive()) || (await getIntelligence());
    const rows = accuracyRows(snapshot);
    const headers = rows[0] ? Object.keys(rows[0]) : ['date', 'forecast', 'actualResult', 'correct'];
    sendCsv(response, 'usd-ghs-accuracy.csv', rows, headers);
  } catch (error) {
    response.status(500).json({ ok: false, error: error.message });
  }
});

app.get('/api/scheduler', (_request, response) => {
  response.json(schedulerState);
});

app.use((request, response, next) => {
  if (request.path.startsWith('/api/')) {
    next();
    return;
  }

  response.sendFile(path.join(distPath, 'index.html'));
});

function startScheduler() {
  if (!config.scheduler.enabled) return;

  setInterval(async () => {
    const now = new Date();
    const hhmm = now.toISOString().slice(11, 16);
    const dateKey = now.toISOString().slice(0, 10);

    try {
      if (hhmm === config.scheduler.morningTime && schedulerState.lastMorningRun !== dateKey) {
        const snapshot = await getIntelligence({ force: true, archive: true });
        await deliverNote(snapshot, 'morning', ['email', 'telegram']);
        schedulerState.lastMorningRun = dateKey;
      }

      if (hhmm === config.scheduler.afternoonTime && schedulerState.lastAfternoonRun !== dateKey) {
        const snapshot = await getIntelligence({ force: true, archive: true });
        await deliverNote(snapshot, 'afternoon', ['email', 'telegram']);
        schedulerState.lastAfternoonRun = dateKey;
      }
    } catch (error) {
      schedulerState.lastError = error.message;
    }
  }, 60 * 1000);
}

app.listen(config.port, () => {
  console.log(`USD/GHS intelligence API listening on http://127.0.0.1:${config.port}`);
  startScheduler();
});
