# USD/GHS Market Intelligence Agent

A local analyst workstation for monitoring USD/GHS drivers, generating market notes, and preparing a live data pipeline for Ghana FX intelligence.

## Run It

Install dependencies:

```bash
npm install
```

Start the intelligence API:

```bash
npm run server
```

Start the dashboard:

```bash
npm run dev -- --port 5174
```

Open:

```text
http://127.0.0.1:5174
```

## API

Health check:

```text
GET http://127.0.0.1:8787/api/health
```

Current intelligence:

```text
GET http://127.0.0.1:8787/api/market-intelligence
```

Force refresh and archive a snapshot:

```text
POST http://127.0.0.1:8787/api/refresh
```

Latest archived snapshot:

```text
GET http://127.0.0.1:8787/api/archive/latest
```

Recent archived snapshots:

```text
GET http://127.0.0.1:8787/api/archive/history?limit=20
```

CSV exports:

```text
GET http://127.0.0.1:8787/api/export/latest.csv
GET http://127.0.0.1:8787/api/export/history.csv
GET http://127.0.0.1:8787/api/export/forecasts.csv
GET http://127.0.0.1:8787/api/export/signals.csv
GET http://127.0.0.1:8787/api/export/accuracy.csv
```

Import a manual interbank quote:

```text
POST http://127.0.0.1:8787/api/interbank-quote
Content-Type: application/json

{
  "rate": 11.02,
  "source": "Dealer desk"
}
```

Export a note as plain text:

```text
GET http://127.0.0.1:8787/api/note/morning/text
```

Deliver a note through configured channels:

```text
POST http://127.0.0.1:8787/api/deliver
Content-Type: application/json

{
  "noteType": "morning",
  "channels": ["email", "telegram", "whatsapp"]
}
```

Record an actual result for forecast accuracy:

```text
POST http://127.0.0.1:8787/api/forecast-actual
Content-Type: application/json

{
  "date": "2026-06-10",
  "direction": "Down",
  "rate": 10.95,
  "source": "Close of market"
}
```

## Current Capabilities

- Monitors official/public source pages for BoG, Treasury, IMF, Fed, Ghana business news, gold, and cocoa.
- Produces source health scores and headline snippets.
- Generates morning, afternoon, and executive USD/GHS notes.
- Produces a probability-based outlook for USD/GHS direction.
- Produces a weighted next-day USD/GHS forecast with confidence, range, drivers, and risk factors.
- Detects market regime: cedi supportive, USD demand stress, or global USD strength.
- Produces a dealer signal for treasury/dealing teams.
- Tracks forecast accuracy from archived forecasts and manually recorded actual outcomes.
- Exports latest snapshot, history, forecasts, signals, and accuracy as CSV.
- Flags demand-condition risks and support factors.
- Archives refreshed intelligence snapshots to `data/snapshots.jsonl`.
- Pulls USD/GHS rate data in this order: custom interbank feed, CediRates API, BoG Daily Interbank FX Rates, CediRates public bank average, manual quote, then seeded fallback.
- Imports manual interbank USD/GHS quotes from the API as an override when live feeds are unavailable.
- Supports optional live interbank, gold, cocoa, Reuters, and Bloomberg feed URLs through `.env`.
- Supports optional OpenAI-powered note generation when `OPENAI_API_KEY` is configured.
- Supports alternative AI note providers: DeepSeek, OpenRouter, and Groq.
- Supports optional email, Telegram, and Twilio WhatsApp note delivery.
- Supports optional UTC scheduler for morning and afternoon note runs.

## Data Notes

USD/GHS quote priority is now: `INTERBANK_API_URL`, `CEDIRATES_API_KEY`, BoG Daily Interbank FX Rates, CediRates public USD/GHS bank average, manual quote import, then a clearly marked seeded fallback. The CediRates public fallback uses bank buying/selling/mid rows from `https://cedirates.com/exchange-rates/usd-to-ghs/`; BoG uses `https://www.bog.gov.gh/treasury-and-the-markets/daily-interbank-fx-rates/`.

Reuters and Bloomberg should be connected through licensed APIs, terminal exports, approved email ingestion, or permitted RSS/feed products. The app intentionally avoids scraping paywalled Reuters or Bloomberg pages.

Copy `.env.example` to `.env` and fill in the feed credentials or URLs you have. Without those credentials, the agent uses public-source scans and clearly marks missing production feeds as unconfigured or fallback.

## AI Provider Options

OpenAI:

```env
AI_PROVIDER=openai
OPENAI_API_KEY=your_key
OPENAI_MODEL=gpt-4.1-mini
```

DeepSeek:

```env
AI_PROVIDER=deepseek
DEEPSEEK_API_KEY=your_key
DEEPSEEK_MODEL=deepseek-chat
```

OpenRouter free models:

```env
AI_PROVIDER=openrouter
OPENROUTER_API_KEY=your_key
OPENROUTER_MODEL=openrouter/free
```

Groq:

```env
AI_PROVIDER=groq
GROQ_API_KEY=your_key
GROQ_MODEL=llama-3.1-8b-instant
```

OpenRouter is the most direct free-model option, but free usage is rate-limited. DeepSeek and Groq are usually very low cost and may offer trial/free access, depending on current account policy.
