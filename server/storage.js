const fs = require('fs/promises');
const path = require('path');

const dataDir = path.join(__dirname, '..', 'data');
const archivePath = path.join(dataDir, 'snapshots.jsonl');
const manualQuotePath = path.join(dataDir, 'interbank-quotes.csv');
const actualResultPath = path.join(dataDir, 'forecast-actuals.csv');

async function ensureDataDir() {
  await fs.mkdir(dataDir, { recursive: true });
}

async function archiveSnapshot(snapshot) {
  await ensureDataDir();
  await fs.appendFile(archivePath, `${JSON.stringify(snapshot)}\n`, 'utf8');
}

async function readLatestArchive() {
  try {
    const content = await fs.readFile(archivePath, 'utf8');
    const lines = content.trim().split('\n').filter(Boolean);
    const latest = lines[lines.length - 1];
    return latest ? JSON.parse(latest) : null;
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

async function readArchiveHistory(limit = 20) {
  try {
    const content = await fs.readFile(archivePath, 'utf8');
    return content
      .trim()
      .split('\n')
      .filter(Boolean)
      .slice(-limit)
      .map((line) => JSON.parse(line));
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
}

async function appendManualQuote({ rate, source = 'Manual desk quote', timestamp = new Date().toISOString() }) {
  await ensureDataDir();
  const exists = await fs
    .access(manualQuotePath)
    .then(() => true)
    .catch(() => false);

  if (!exists) {
    await fs.writeFile(manualQuotePath, 'timestamp,rate,source\n', 'utf8');
  }

  await fs.appendFile(manualQuotePath, `${timestamp},${rate},${source.replace(/,/g, ' ')}\n`, 'utf8');
}

async function readLatestManualQuote() {
  try {
    const content = await fs.readFile(manualQuotePath, 'utf8');
    const lines = content.trim().split('\n').filter(Boolean).slice(1);
    const latest = lines[lines.length - 1];
    if (!latest) return null;
    const [timestamp, rate, source] = latest.split(',');
    return {
      timestamp,
      rate: Number(rate),
      source
    };
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

async function appendForecastActual({ date, direction, rate, source = 'Manual actual' }) {
  await ensureDataDir();
  const exists = await fs
    .access(actualResultPath)
    .then(() => true)
    .catch(() => false);

  if (!exists) {
    await fs.writeFile(actualResultPath, 'date,direction,rate,source\n', 'utf8');
  }

  await fs.appendFile(actualResultPath, `${date},${direction},${rate || ''},${source.replace(/,/g, ' ')}\n`, 'utf8');
}

async function readForecastActuals() {
  try {
    const content = await fs.readFile(actualResultPath, 'utf8');
    return content
      .trim()
      .split('\n')
      .filter(Boolean)
      .slice(1)
      .map((line) => {
        const [date, direction, rate, source] = line.split(',');
        return { date, direction, rate: rate ? Number(rate) : null, source };
      });
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
}

module.exports = {
  archiveSnapshot,
  readLatestArchive,
  readArchiveHistory,
  appendManualQuote,
  readLatestManualQuote,
  appendForecastActual,
  readForecastActuals
};
