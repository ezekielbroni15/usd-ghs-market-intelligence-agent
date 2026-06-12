import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  Activity,
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  Bell,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  CircleDollarSign,
  Clock3,
  Cpu,
  Database,
  ExternalLink,
  Factory,
  FileText,
  Gauge,
  Gem,
  Globe2,
  Landmark,
  LineChart,
  Mail,
  MessageSquareText,
  Newspaper,
  Radio,
  RefreshCw,
  Search,
  Send,
  ShieldCheck,
  Sprout,
  Target,
  TrendingDown,
  TrendingUp,
  WalletCards,
  X,
  Zap
} from 'lucide-react';
import './styles.css';

const marketState = {
  pair: 'USD/GHS',
  interbankRate: 11.02,
  previousClose: 11.07,
  dailyMove: -0.45,
  weeklyMove: -1.2,
  expectedRange: '10.88 - 11.12',
  outlook: 'Mildly Bearish USD',
  cediView: 'Bullish Cedi',
  confidence: 72,
  demandPressure: 'Normal',
  liquidity: 'Tightening',
  lastUpdated: '08:15 GMT',
  quoteSource: 'Fallback sample',
  quoteStatus: 'Fallback',
  quoteBuying: null,
  quoteSelling: null,
  quoteProviderRows: null,
  quoteContributors: [],
  quoteRemittanceRows: [],
  bogAnalysis: {
    available: false,
    rate: null,
    buying: null,
    selling: null,
    midRate: null,
    previousRate: null,
    previousBuying: null,
    previousSelling: null,
    previousMidRate: null,
    previousDate: null,
    move: null,
    status: 'Unavailable',
    source: 'Bank of Ghana Daily Interbank FX Rates',
    url: 'https://www.bog.gov.gh/treasury-and-the-markets/daily-interbank-fx-rates/',
    interpretation: 'BoG daily interbank reference was not available in this refresh.'
  },
  moveBasis: 'Fallback sample'
};

const API_BASE_URL =
  import.meta.env.VITE_API_URL ||
  (typeof window !== 'undefined' ? window.location.origin : 'http://127.0.0.1:8787');
const API_URL = `${API_BASE_URL}/api/market-intelligence`;
const REFRESH_URL = `${API_BASE_URL}/api/refresh`;

const signalIcons = {
  'Bank of Ghana': Landmark,
  Treasury: WalletCards,
  IMF: ShieldCheck,
  Gold: Gem,
  Cocoa: Sprout,
  'Fed / US Data': Factory,
  Interbank: LineChart,
  'News Sentiment': Newspaper
};

const deliveryIcons = {
  'Email brief': Mail,
  'WhatsApp / Telegram': MessageSquareText,
  'Data archive': Database,
  'Dealer note export': Send
};

const watchlist = [
  {
    title: 'Bank of Ghana',
    icon: Landmark,
    status: 'Supportive',
    value: '+18',
    description: 'FX supply window active; latest notices show liquidity management bias.',
    impact: 'Cedi supportive',
    color: 'green'
  },
  {
    title: 'Treasury',
    icon: WalletCards,
    status: 'Absorbing',
    value: '+7',
    description: 'T-bill settlement expected to pull excess cedi liquidity from banks.',
    impact: 'Cedi supportive',
    color: 'teal'
  },
  {
    title: 'IMF',
    icon: ShieldCheck,
    status: 'Constructive',
    value: '+9',
    description: 'Program headlines remain positive with review risk currently low.',
    impact: 'Sentiment supportive',
    color: 'blue'
  },
  {
    title: 'Gold',
    icon: Gem,
    status: 'Firm',
    value: '+11',
    description: 'Spot gold strength supports reserve and export-flow expectations.',
    impact: 'FX supply supportive',
    color: 'amber'
  },
  {
    title: 'Cocoa',
    icon: Sprout,
    status: 'Neutral',
    value: '+2',
    description: 'Receipts stable; no major export-flow shock flagged overnight.',
    impact: 'Limited impact',
    color: 'brown'
  },
  {
    title: 'Fed / US Data',
    icon: Factory,
    status: 'USD bid',
    value: '-8',
    description: 'US rate expectations keep some defensive USD demand in place.',
    impact: 'USD supportive',
    color: 'red'
  },
  {
    title: 'Interbank',
    icon: LineChart,
    status: 'Softer USD',
    value: '+14',
    description: 'Quotes drifted lower with cleaner supply and lighter importer bids.',
    impact: 'Cedi supportive',
    color: 'green'
  },
  {
    title: 'News Sentiment',
    icon: Newspaper,
    status: 'Watch',
    value: '-3',
    description: 'Fiscal and political headlines are mixed but not yet market-moving.',
    impact: 'Slight USD support',
    color: 'slate'
  }
];

const probability = [
  { label: 'USD/GHS lower', value: 48, color: 'cedi' },
  { label: 'Range-bound', value: 31, color: 'range' },
  { label: 'USD/GHS higher', value: 21, color: 'usd' }
];

const forecast = {
  forecastDate: 'Tomorrow',
  totalScore: 21,
  outlook: 'Neutral',
  direction: 'USD/GHS Expected to Decline Slightly',
  probabilityHigher: 42,
  probabilityLower: 58,
  confidence: 74,
  predictedMidRate: 11.01,
  expectedRange: '10.88 - 11.12',
  tomorrowScenarios: [
    { label: '10.96', description: 'Cedi-supportive continuation', probability: 58 },
    { label: '11.01', description: 'Base-case midpoint', probability: 42 },
    { label: '11.06', description: 'USD demand upside risk', probability: 42 }
  ],
  factors: [
    { label: 'BoG FX Auctions', weight: 25, direction: 'Cedi Positive', score: 20, evidence: [] },
    { label: 'Liquidity / T-Bills', weight: 15, direction: 'Cedi Positive', score: 15, evidence: [] },
    { label: 'Gold Prices', weight: 10, direction: 'Cedi Positive', score: 8, evidence: [] },
    { label: 'Fed & US Data', weight: 15, direction: 'USD Positive', score: -10, evidence: [] },
    { label: 'Market Demand', weight: 10, direction: 'USD Positive', score: -12, evidence: [] }
  ],
  marketMovingNews: [],
  keyDrivers: ['BoG supplied FX through auction', 'Treasury absorbed excess liquidity', 'Gold prices remain supportive'],
  riskFactors: ['Unexpected offshore demand', 'Stronger-than-expected US data'],
  conclusion: 'Current information favors modest cedi appreciation over the next trading session.'
};

const directionEngine = {
  score: 3,
  bias: 'Mild Cedi',
  direction: 'USD/GHS likely lower today',
  confidence: 78,
  expectedRange: '12.24 - 12.29',
  probabilityLower: 65,
  probabilityHigher: 35,
  tepScenarios: [
    { label: '12.25', description: 'Softer USD / stronger cedi outcome', probability: 54 },
    { label: '12.30', description: 'Range-bound TEP reference', probability: 31 },
    { label: '12.35', description: 'Higher USD demand outcome', probability: 15 }
  ],
  topDrivers: [
    { label: 'BoG FX auction / support', score: 3, reason: 'Detected cedi-supportive signal.', evidence: [] },
    { label: 'Gold prices / exports', score: 2, reason: 'Detected cedi-supportive signal.', evidence: [] },
    { label: 'Corporate USD demand', score: -3, reason: 'Watch importer and energy demand.', evidence: [] }
  ],
  dealerGuidance: [
    'Be cautious chasing higher USD prices.',
    'Lock in buyers early if quotes soften.',
    'Expect softer PET/TEP quotes later if demand remains weak.'
  ]
};

const regime = {
  name: 'CEDI SUPPORTIVE',
  expectedDirection: 'Downward',
  description: 'BoG, liquidity, IMF, and commodity factors are supportive for the cedi.'
};

const dealerSignal = {
  shortTermBias: 'Bullish Cedi',
  conviction: 7.5,
  positioningView: 'Expect exporters to sell USD and local demand to remain moderate.',
  risk: 'Low'
};

const accuracyTracker = {
  currentAccuracy: null,
  sevenDayAccuracy: null,
  thirtyDayAccuracy: null,
  ninetyDayAccuracy: null,
  samples: []
};

const deliverables = [
  { time: '07:00', name: 'Morning Brief', purpose: 'What happened overnight?' },
  { time: '12:00', name: 'Midday Update', purpose: "What's happening now?" },
  { time: '17:00', name: 'Close of Market Report', purpose: 'What happened today?' },
  { time: '17:05', name: 'Next-Day Forecast', purpose: 'Will USD/GHS rise or fall tomorrow?' },
  { time: 'Real-time', name: 'Alerts', purpose: 'Market-moving events and unusual demand.' },
  { time: 'Continuous', name: 'Forecast Accuracy Dashboard', purpose: 'Evaluate predictions.' }
];

const notes = {
  morning: {
    title: 'USD/GHS Morning Brief',
    time: 'Generated 08:05 GMT',
    outlook: 'Mildly Bearish USD / Bullish Cedi',
    summary:
      'Supply is slightly ahead of demand after softer interbank quotes and supportive BoG/liquidity conditions.',
    bullets: [
      'Interbank opened around 11.02 after a softer previous close.',
      'BoG activity and liquidity sterilization remain the main cedi-positive drivers.',
      'Gold is supportive for reserve sentiment while cocoa flow reads neutral.',
      'Global USD tone is mildly firm, limiting the downside in USD/GHS.',
      'Importer demand appears normal with no unusual concentration flagged.'
    ]
  },
  afternoon: {
    title: 'USD/GHS Afternoon Watch',
    time: 'Scheduled 14:30 GMT',
    outlook: 'Pending intraday quote confirmation',
    summary:
      'The afternoon run will refresh interbank quotes, importer demand, US data, and any new official notices.',
    bullets: [
      'Refresh interbank indications and compare bid depth with morning levels.',
      'Check for BoG auction notices, settlement updates, and large corporate demand.',
      'Re-score Fed-sensitive USD strength after US calendar releases.',
      'Publish revised range and probability table if quotes move beyond 0.7%.'
    ]
  },
  executive: {
    title: 'Executive Snapshot',
    time: 'One-page version',
    outlook: 'Cedi-positive bias with global USD risk',
    summary:
      'Designed for treasury heads and executives who need the call, the range, and the main risks in under a minute.',
    bullets: [
      'Base case: USD/GHS trades inside 10.88 - 11.12.',
      'Upside risk comes from Fed repricing or concentrated importer demand.',
      'Downside risk comes from BoG supply, stronger gold, and cleaner market liquidity.',
      'Recommended action: stagger near-term USD purchases while quotes remain offered.'
    ]
  }
};

const events = [
  { time: '09:30', title: 'BoG notice scan', tag: 'Automated', tone: 'good' },
  { time: '11:00', title: 'Treasury auction result check', tag: 'Liquidity', tone: 'watch' },
  { time: '12:30', title: 'Gold and cocoa flow refresh', tag: 'Commodities', tone: 'good' },
  { time: '13:30', title: 'US CPI / Fed calendar monitor', tag: 'Global USD', tone: 'risk' },
  { time: '14:30', title: 'Afternoon market note', tag: 'Delivery', tone: 'good' }
];

const sources = [
  'Bank of Ghana',
  'Ministry of Finance / Treasury',
  'IMF Ghana program pages',
  'Federal Reserve, BLS, BEA',
  'Gold and cocoa market feeds',
  'Licensed Reuters/Bloomberg feeds',
  'Ghana business and fiscal news',
  'Interbank quote feed'
];

const sourceHealth = [
  { name: 'BoG announcements', cadence: '15 min', lastSeen: '08:09', status: 'Online', score: 98 },
  { name: 'Interbank quote feed', cadence: '5 min', lastSeen: '08:15', status: 'Online', score: 96 },
  { name: 'Reuters/Bloomberg feed', cadence: 'Live', lastSeen: '08:12', status: 'Licensed', score: 91 },
  { name: 'IMF Ghana monitor', cadence: '30 min', lastSeen: '07:58', status: 'Online', score: 94 },
  { name: 'Local Ghana news', cadence: '10 min', lastSeen: '08:05', status: 'Review', score: 76 }
];

const alerts = [
  {
    title: 'Importer bid concentration',
    severity: 'Watch',
    detail: 'Energy and manufacturing demand is normal, but two large corporate tickets should be watched after noon.'
  },
  {
    title: 'Global USD repricing',
    severity: 'Risk',
    detail: 'A hotter US data print would weaken the cedi-positive setup and lift USD/GHS upside probability.'
  },
  {
    title: 'BoG supply confirmation',
    severity: 'Support',
    detail: 'A confirmed auction or direct supply note would raise confidence in the lower end of today’s range.'
  }
];

const flowReadings = [
  { label: 'Corporate USD bids', value: 42, tone: 'watch' },
  { label: 'Exporter supply', value: 68, tone: 'good' },
  { label: 'Bank liquidity stress', value: 36, tone: 'good' },
  { label: 'Headline risk', value: 44, tone: 'watch' }
];

const deliveryChannels = [
  { icon: Mail, label: 'Email brief', status: '08:00 and 14:30' },
  { icon: MessageSquareText, label: 'WhatsApp / Telegram', status: 'Alerts only' },
  { icon: Database, label: 'Data archive', status: 'Every refresh' },
  { icon: Send, label: 'Dealer note export', status: 'Manual send' }
];

const fallbackIntelligence = {
  marketState,
  signals: watchlist,
  probability,
  notes,
  events,
  alerts,
  sourceHealth,
  flowReadings,
  deliveryChannels,
  forecast,
  directionEngine,
  regime,
  dealerSignal,
  accuracyTracker,
  deliverables,
  generatedAt: null,
  sourcePolicy: null
};

function MetricCard({ label, value, meta, trend }) {
  const TrendIcon = trend === 'up' ? ArrowUpRight : trend === 'down' ? ArrowDownRight : Activity;
  return (
    <article className="metric-card">
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
      </div>
      <div className={`metric-icon ${trend}`}>
        <TrendIcon size={18} />
      </div>
      <p>{meta}</p>
    </article>
  );
}

function BogAnalysisCard({ analysis, onInspect }) {
  const hasRate = analysis?.available && Number.isFinite(Number(analysis.rate));
  const move = Number(analysis?.move);
  const trend = Number.isFinite(move) ? (move <= 0 ? 'down' : 'up') : 'flat';
  const TrendIcon = trend === 'up' ? ArrowUpRight : trend === 'down' ? ArrowDownRight : Activity;
  const evidence = [
    {
      source: analysis?.source || 'Bank of Ghana',
      title: analysis?.status || 'BoG reference',
      snippet: analysis?.interpretation || analysis?.reason || 'Separate BoG official reference.',
      url: analysis?.url,
      status: analysis?.includedInMarketAverage ? 'Included in blended average' : 'Reference only',
      impact: analysis?.reason
    },
    analysis?.officialReference
      ? {
          source: 'Bank of Ghana official page',
          title: analysis.officialReference.status || 'BoG official reference',
          snippet: analysis.officialReference.reason,
          url: analysis.officialReference.url,
          status: 'Official reference',
          impact: 'Shown separately when not blended into provider average'
        }
      : null
  ].filter(Boolean);

  return (
    <article className="bog-analysis-card">
      <div className="bog-card-top">
        <div>
          <span>Official reference</span>
          <h2>BoG USD/GHS</h2>
        </div>
        <div className={`metric-icon ${trend}`}>
          <TrendIcon size={18} />
        </div>
      </div>
      <div className="bog-rate-row">
        <div>
          <span>Buying</span>
          <strong>{formatRate(analysis?.buying)}</strong>
        </div>
        <div>
          <span>Selling</span>
          <strong>{formatRate(analysis?.selling)}</strong>
        </div>
        <div>
          <span>Mid-rate</span>
          <strong>{hasRate ? Number(analysis.midRate || analysis.rate).toFixed(4) : 'N/A'}</strong>
        </div>
        <div>
          <span>Prev buying</span>
          <strong>{formatRate(analysis?.previousBuying)}</strong>
        </div>
        <div>
          <span>Prev selling</span>
          <strong>{formatRate(analysis?.previousSelling)}</strong>
        </div>
        <div>
          <span>Prev mid {analysis?.previousDate ? `(${analysis.previousDate})` : ''}</span>
          <strong>{formatRate(analysis?.previousMidRate || analysis?.previousRate)}</strong>
        </div>
        <div>
          <span>Mid move</span>
          <strong>{Number.isFinite(move) ? `${move}%` : 'N/A'}</strong>
        </div>
      </div>
      <p>{analysis?.interpretation}</p>
      <button className="source-button" type="button" onClick={() => onInspect('BoG USD/GHS Analysis', evidence)}>
        View BoG source
      </button>
    </article>
  );
}

function averageValues(rows, key) {
  const values = rows.map((row) => Number(row[key])).filter((value) => Number.isFinite(value) && value > 0);
  if (!values.length) return null;
  return values.reduce((total, value) => total + value, 0) / values.length;
}

function formatRate(value) {
  return Number.isFinite(Number(value)) ? Number(value).toFixed(4) : 'N/A';
}

function MultiSelectGroup({ label, options, selected, onChange }) {
  const selectedLabel = selected.includes('All') ? 'All' : selected.join(', ');

  function toggle(option) {
    if (option === 'All') {
      onChange(['All']);
      return;
    }
    const withoutAll = selected.filter((item) => item !== 'All');
    const next = withoutAll.includes(option)
      ? withoutAll.filter((item) => item !== option)
      : [...withoutAll, option];
    onChange(next.length ? next : ['All']);
  }

  return (
    <div className="multi-select">
      <span>{label}</span>
      <details>
        <summary>
          <strong>{selectedLabel}</strong>
          <ChevronRight size={15} />
        </summary>
        <div className="multi-select-menu">
          {options.map((option) => (
            <label key={option}>
              <input
                type="checkbox"
                checked={selected.includes(option)}
                onChange={() => toggle(option)}
              />
              {option}
            </label>
          ))}
        </div>
      </details>
    </div>
  );
}

function QuoteTable({ market, onFilteredRateChange }) {
  const [mode, setMode] = useState('market');
  const [typeFilter, setTypeFilter] = useState(['All']);
  const [sourceFilter, setSourceFilter] = useState(['All']);
  const [searchTerm, setSearchTerm] = useState('');
  const [page, setPage] = useState(1);
  const rows = mode === 'remittance'
    ? (market.quoteContributors || []).filter((row) => /remittance|money transfer/i.test(`${row.type} ${row.slug}`))
    : market.quoteContributors || [];
  const providerTypes = ['All', ...Array.from(new Set(rows.map((row) => row.type).filter(Boolean))).sort()];
  const sources = ['All', ...Array.from(new Set(rows.map((row) => row.source).filter(Boolean))).sort()];
  const filteredRows = rows.filter((row) => {
    const typeOk = typeFilter.includes('All') || typeFilter.includes(row.type);
    const sourceOk = sourceFilter.includes('All') || sourceFilter.includes(row.source);
    const searchOk =
      !searchTerm.trim() ||
      `${row.name || ''} ${row.type || ''} ${row.source || ''}`.toLowerCase().includes(searchTerm.trim().toLowerCase());
    return typeOk && sourceOk && searchOk;
  });
  const pageSize = 10;
  const totalPages = Math.max(1, Math.ceil(filteredRows.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const visibleRows = filteredRows.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const calcBuying = averageValues(filteredRows, 'buying');
  const calcSelling = averageValues(filteredRows, 'selling');
  const calcMid = averageValues(filteredRows, 'midRate');

  useEffect(() => {
    onFilteredRateChange?.({
      mode,
      midRate: calcMid,
      buying: calcBuying,
      selling: calcSelling,
      rowCount: filteredRows.length,
      types: typeFilter,
      sources: sourceFilter
    });
  }, [mode, calcMid, calcBuying, calcSelling, filteredRows.length, typeFilter.join('|'), sourceFilter.join('|'), searchTerm]);

  function updateMode(nextMode) {
    setMode(nextMode);
    setTypeFilter(['All']);
    setSourceFilter(['All']);
    setSearchTerm('');
    setPage(1);
  }

  function csvEscape(value) {
    if (value === null || value === undefined) return '';
    const text = String(value);
    return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  }

  function exportFilteredRows() {
    const headers = ['Name', 'Type', 'Source', 'Buying', 'Selling', 'MidRate', 'Last Updated', 'Source URL'];
    const summaryRows = [
      ['Filtered MidRate', '', '', '', '', formatRate(calcMid), '', ''],
      ['Filtered Buying', '', '', formatRate(calcBuying), '', '', '', ''],
      ['Filtered Selling', '', '', '', formatRate(calcSelling), '', '', ''],
      ['Rows Used', filteredRows.length, '', '', '', '', '', ''],
      []
    ];
    const dataRows = filteredRows.map((row) => [
      row.name,
      row.type,
      row.source,
      formatRate(row.buying),
      formatRate(row.selling),
      formatRate(row.midRate),
      row.lastUpdatedAt || '',
      row.sourceUrl || ''
    ]);
    const csv = [...summaryRows, headers, ...dataRows]
      .map((row) => row.map(csvEscape).join(','))
      .join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const selectedTypes = typeFilter.includes('All') ? 'all' : typeFilter.join('-').replace(/\s+/g, '-').toLowerCase();
    const selectedMode = mode === 'remittance' ? 'remittance' : 'market';
    const link = document.createElement('a');
    link.href = url;
    link.download = `usd-ghs-${selectedMode}-${selectedTypes}-rates.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <section className="quote-table-panel">
      <div className="section-heading compact">
        <div>
          <span>{market.quoteStatus || 'Quote source'}</span>
          <h2>USD/GHS Rate Providers</h2>
        </div>
        <LineChart size={20} />
      </div>
      <div className="quote-controls">
        <div className="quote-mode-group">
          <span>Rate view</span>
          <div className="segmented-control" aria-label="Rate mode">
            <button className={mode === 'market' ? 'active' : ''} type="button" onClick={() => updateMode('market')}>
              Market
            </button>
            <button className={mode === 'remittance' ? 'active' : ''} type="button" onClick={() => updateMode('remittance')}>
              Remittance
            </button>
          </div>
        </div>
        <MultiSelectGroup label="Provider type" options={providerTypes} selected={typeFilter} onChange={(next) => { setTypeFilter(next); setPage(1); }} />
        <MultiSelectGroup label="Source" options={sources} selected={sourceFilter} onChange={(next) => { setSourceFilter(next); setPage(1); }} />
        <label>
          Provider search
          <input
            type="search"
            value={searchTerm}
            onChange={(event) => {
              setSearchTerm(event.target.value);
              setPage(1);
            }}
            placeholder="Bank of Ghana"
          />
        </label>
        <div className="quote-filter-count">
          <span>Rows</span>
          <strong>{filteredRows.length}</strong>
        </div>
        <button className="table-export-button" type="button" onClick={exportFilteredRows} disabled={!filteredRows.length}>
          Export CSV
        </button>
      </div>
      <div className="quote-summary-row">
        <div>
          <span>Filtered MidRate</span>
          <strong>{formatRate(calcMid)}</strong>
        </div>
        <div>
          <span>Filtered buying</span>
          <strong>{formatRate(calcBuying)}</strong>
        </div>
        <div>
          <span>Filtered selling</span>
          <strong>{formatRate(calcSelling)}</strong>
        </div>
        <div>
          <span>Rows used</span>
          <strong>{filteredRows.length}</strong>
        </div>
      </div>
      <div className="quote-table-wrap">
        <table className="quote-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Buying</th>
              <th>Selling</th>
              <th>MidRate</th>
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((row) => (
              <tr key={`${row.source}-${row.name}-${row.buying}-${row.selling}`}>
                <td>
                  <strong>{row.name}</strong>
                  <span>{row.type} · {row.source}</span>
                </td>
                <td>{formatRate(row.buying)}</td>
                <td>{formatRate(row.selling)}</td>
                <td>{formatRate(row.midRate)}</td>
              </tr>
            ))}
            {!visibleRows.length && (
              <tr>
                <td colSpan="4">
                  {mode === 'remittance'
                    ? 'No remittance rows are available from the connected sources yet.'
                    : 'Provider rows will appear when CediRates, BoG, or another structured quote source responds.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="pagination-row">
        <button type="button" onClick={() => setPage(Math.max(1, currentPage - 1))} disabled={currentPage === 1}>
          Previous
        </button>
        <span>Page {currentPage} of {totalPages}</span>
        <button type="button" onClick={() => setPage(Math.min(totalPages, currentPage + 1))} disabled={currentPage === totalPages}>
          Next
        </button>
      </div>
    </section>
  );
}

function SignalCard({ item, onInspect }) {
  const Icon = item.icon || signalIcons[item.title] || Activity;
  return (
    <article className={`signal-card ${item.color}`} onClick={() => onInspect(item.title, item.evidence || [])}>
      <div className="signal-top">
        <div className="source-icon">
          <Icon size={19} />
        </div>
        <span>{item.value}</span>
      </div>
      <h3>{item.title}</h3>
      <div className="status-row">
        <strong>{item.status}</strong>
        <small>{item.impact}</small>
      </div>
      <p>{item.description}</p>
    </article>
  );
}

function ProbabilityBar({ item }) {
  return (
    <div className="probability-row">
      <div className="probability-label">
        <span>{item.label}</span>
        <strong>{item.value}%</strong>
      </div>
      <div className="bar-track">
        <div className={`bar-fill ${item.color}`} style={{ width: `${item.value}%` }} />
      </div>
    </div>
  );
}

function NotePanel({ note, onInspect }) {
  const currentHour = new Date().getUTCHours();
  const isAvailable = currentHour >= (note.availableAtHour ?? 0);
  if (!isAvailable) {
    return (
      <section className="note-panel">
        <div className="section-heading compact">
          <div>
            <span>Available at {String(note.availableAtHour).padStart(2, '0')}:00 UTC</span>
            <h2>{note.title}</h2>
          </div>
          <FileText size={20} />
        </div>
        <p className="note-summary">This note will populate when the scheduled market window is reached.</p>
      </section>
    );
  }

  return (
    <section className="note-panel">
      <div className="section-heading compact">
        <div>
          <span>{note.time}</span>
          <h2>{note.title}</h2>
        </div>
        <FileText size={20} />
      </div>
      <div className="outlook-strip">
        <Target size={18} />
        <strong>{note.outlook}</strong>
      </div>
      <p className="note-summary">{note.summary}</p>
      <ul className="note-list">
        {note.bullets.map((bullet) => (
          <li key={bullet}>
            <CheckCircle2 size={16} />
            <span>{bullet}</span>
          </li>
        ))}
      </ul>
      <button className="source-button" type="button" onClick={() => onInspect(`${note.title} Sources`, note.sources || [])}>
        View sources
      </button>
    </section>
  );
}

function SourceHealthTable({ sourceHealth, onInspect }) {
  return (
    <section className="health-panel">
      <div className="section-heading compact">
        <div>
          <span>Connector readiness</span>
          <h2>Source Health</h2>
        </div>
        <Database size={20} />
      </div>
      <div className="health-list">
        {sourceHealth.map((source) => (
          <div
            className="health-row"
            key={source.name}
            onClick={() =>
              onInspect(
                source.name,
                (source.articles?.length
                  ? source.articles
                  : (source.headlines || []).map((headline) => ({
                      source: source.name,
                      title: headline,
                      snippet: headline,
                      url: source.url,
                      status: source.status,
                      impact: source.impact
                    }))
                )
              )
            }
          >
            <div>
              <strong>{source.name}</strong>
              <span>{source.cadence} cadence</span>
            </div>
            <div className="health-meter">
              <div style={{ width: `${source.score}%` }} />
            </div>
            <small>{source.lastSeen}</small>
            <em>{source.status}</em>
          </div>
        ))}
      </div>
    </section>
  );
}

function AlertsPanel({ alerts, onInspect }) {
  return (
    <section className="alerts-panel">
      <div className="section-heading compact">
        <div>
          <span>Anomaly monitor</span>
          <h2>Demand Conditions</h2>
        </div>
        <AlertTriangle size={20} />
      </div>
      <div className="alert-list">
        {alerts.map((alert) => (
          <article className={`alert-item ${alert.severity.toLowerCase()}`} key={alert.title} onClick={() => onInspect(alert.title, alert.evidence || [])}>
            <strong>{alert.title}</strong>
            <span>{alert.severity}</span>
            <p>{alert.detail}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

function FlowPanel({ flowReadings, onInspect }) {
  return (
    <section className="flow-panel">
      <div className="section-heading compact">
        <div>
          <span>FX desk read</span>
          <h2>Demand / Supply Gauge</h2>
        </div>
        <Gauge size={20} />
      </div>
      <div className="flow-grid">
        {flowReadings.map((item) => (
          <div className={`flow-tile ${item.tone}`} key={item.label} onClick={() => onInspect(item.label, item.evidence || [])}>
            <div className="dial" style={{ '--value': `${item.value * 3.6}deg` }}>
              <strong>{item.value}</strong>
            </div>
            <span>{item.label}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function DeliveryPanel({ deliveryChannels }) {
  return (
    <section className="delivery-panel">
      <div className="section-heading compact">
        <div>
          <span>Automation layer</span>
          <h2>Delivery Schedule</h2>
        </div>
        <Send size={20} />
      </div>
      <div className="delivery-list">
        {deliveryChannels.map((channel) => {
          const Icon = channel.icon || deliveryIcons[channel.label] || Send;
          return (
            <div className="delivery-row" key={channel.label}>
              <Icon size={18} />
              <div>
                <strong>{channel.label}</strong>
                <span>{channel.status}</span>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function ConfigPanel({ intelligence }) {
  const policy = intelligence.sourcePolicy;
  if (!policy) return null;

  return (
    <section className="config-panel">
      <div className="section-heading compact">
        <div>
          <span>Production readiness</span>
          <h2>Feed Policy</h2>
        </div>
        <Database size={20} />
      </div>
      <p>{policy.liveData}</p>
      <p>{policy.reutersBloomberg}</p>
    </section>
  );
}

function ForecastPanel({ forecast, onInspect }) {
  return (
    <section className="forecast-panel">
      <div className="section-heading compact">
        <div>
          <span>Forecast date: {forecast.forecastDate}</span>
          <h2>Tomorrow's Forecast</h2>
        </div>
        <Target size={20} />
      </div>
      <div className="forecast-direction">
        <strong>{forecast.direction}</strong>
        <span>Score {forecast.totalScore}</span>
      </div>
      <div className="forecast-probs">
        <div>
          <span>USD/GHS Higher</span>
          <strong>{forecast.probabilityHigher}%</strong>
        </div>
        <div>
          <span>USD/GHS Lower</span>
          <strong>{forecast.probabilityLower}%</strong>
        </div>
        <div>
          <span>Confidence</span>
          <strong>{forecast.confidence}%</strong>
        </div>
      </div>
      <div className="forecast-range">
        <span>Predicted mid-rate</span>
        <strong>{Number(forecast.predictedMidRate || 0).toFixed(4)}</strong>
      </div>
      <div className="forecast-range">
        <span>Expected trading range</span>
        <strong>{forecast.expectedRange}</strong>
      </div>
      <div className="forecast-scenario-grid">
        {(forecast.tomorrowScenarios || []).map((scenario) => (
          <div key={`${scenario.label}-${scenario.description}`}>
            <span>{scenario.description}</span>
            <strong>{scenario.label}</strong>
            <small>{scenario.probability}% probability</small>
          </div>
        ))}
      </div>
      <div className="forecast-news-list">
        <h3>News that can affect tomorrow</h3>
        {(forecast.marketMovingNews || []).slice(0, 5).map((item) => (
          <button type="button" key={item.label} onClick={() => onInspect(item.label, item.evidence || [])}>
            <span>{item.label}</span>
            <strong className={item.score >= 0 ? 'positive-score' : 'negative-score'}>
              {item.score >= 0 ? `+${item.score}` : item.score}
            </strong>
            <small>{item.reason}</small>
          </button>
        ))}
        {(!forecast.marketMovingNews || forecast.marketMovingNews.length === 0) && (
          <p>No article-backed forecast drivers were returned in this refresh.</p>
        )}
      </div>
      <div className="factor-list">
        {forecast.factors.map((factor) => (
          <button className="factor-row" type="button" key={factor.label} onClick={() => onInspect(factor.label, factor.evidence || [])}>
            <span>{factor.label}</span>
            <small>{factor.weight}%</small>
            <strong className={factor.score >= 0 ? 'positive-score' : 'negative-score'}>
              {factor.score >= 0 ? `+${factor.score}` : factor.score}
            </strong>
          </button>
        ))}
      </div>
    </section>
  );
}

function DirectionEnginePanel({ engine, onInspect }) {
  const scoreClass = engine.score > 1 ? 'cedi' : engine.score < -1 ? 'usd' : 'neutral';
  return (
    <section className={`direction-panel ${scoreClass}`}>
      <div className="section-heading compact">
        <div>
          <span>Same-day direction engine</span>
          <h2>TEP Decision Board</h2>
        </div>
        <Target size={20} />
      </div>
      <div className="direction-hero">
        <div>
          <span>Cedi Score</span>
          <strong>{engine.score > 0 ? `+${engine.score}` : engine.score}</strong>
          <em>{engine.bias}</em>
        </div>
        <div>
          <span>Market Bias</span>
          <strong>{engine.direction}</strong>
          <em>{engine.confidence}% confidence</em>
        </div>
        <div>
          <span>Expected Daily Range</span>
          <strong>{engine.expectedRange}</strong>
          <em>{engine.probabilityLower}% lower / {engine.probabilityHigher}% higher</em>
        </div>
      </div>
      <div className="tep-scenario-grid">
        {(engine.tepScenarios || []).map((scenario) => (
          <div key={scenario.label}>
            <span>TEP {scenario.label}</span>
            <strong>{scenario.probability}%</strong>
            <small>{scenario.description}</small>
          </div>
        ))}
      </div>
      <div className="direction-columns">
        <div>
          <h3>Top Market Drivers</h3>
          <div className="driver-stack">
            {(engine.topDrivers || []).map((driver) => (
              <button
                type="button"
                key={driver.label}
                onClick={() => onInspect(driver.label, driver.evidence || [])}
              >
                <span>{driver.label}</span>
                <strong className={driver.score >= 0 ? 'positive-score' : 'negative-score'}>
                  {driver.score >= 0 ? `+${driver.score}` : driver.score}
                </strong>
                <small>{driver.reason}</small>
              </button>
            ))}
          </div>
        </div>
        <div>
          <h3>Dealer Guidance</h3>
          <ul className="guidance-list">
            {(engine.dealerGuidance || []).map((item) => (
              <li key={item}>
                <CheckCircle2 size={16} />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

function RegimePanel({ regime, dealerSignal }) {
  return (
    <section className="regime-panel">
      <div className="section-heading compact">
        <div>
          <span>Market regime</span>
          <h2>{regime.name}</h2>
        </div>
        <Gauge size={20} />
      </div>
      <div className="regime-direction">
        <span>Expected USD/GHS direction</span>
        <strong>{regime.expectedDirection}</strong>
      </div>
      <p>{regime.description}</p>
      <div className="dealer-signal">
        <span>Dealer Signal</span>
        <strong>{dealerSignal.shortTermBias}</strong>
        <small>Conviction {dealerSignal.conviction}/10</small>
        <p>{dealerSignal.positioningView}</p>
        <em>Risk: {dealerSignal.risk}</em>
      </div>
    </section>
  );
}

function AccuracyPanel({ accuracyTracker }) {
  const value = accuracyTracker.currentAccuracy ?? 'N/A';
  return (
    <section className="accuracy-panel">
      <div className="section-heading compact">
        <div>
          <span>Learning loop</span>
          <h2>Forecast Accuracy</h2>
        </div>
        <LineChart size={20} />
      </div>
      <div className="accuracy-grid">
        <div><span>Current</span><strong>{value}{value === 'N/A' ? '' : '%'}</strong></div>
        <div><span>7-Day</span><strong>{accuracyTracker.sevenDayAccuracy ?? 'N/A'}</strong></div>
        <div><span>30-Day</span><strong>{accuracyTracker.thirtyDayAccuracy ?? 'N/A'}</strong></div>
        <div><span>90-Day</span><strong>{accuracyTracker.ninetyDayAccuracy ?? 'N/A'}</strong></div>
      </div>
      <div className="accuracy-samples">
        {(accuracyTracker.samples || []).slice(-4).map((sample) => (
          <div key={`${sample.date}-${sample.forecast}`}>
            <span>{sample.date}</span>
            <strong>{sample.forecast}</strong>
            <em>{sample.correct ? 'Correct' : 'Miss'}</em>
          </div>
        ))}
        {(!accuracyTracker.samples || accuracyTracker.samples.length === 0) && (
          <p>Accuracy will populate after archived forecasts have next-session actuals.</p>
        )}
      </div>
    </section>
  );
}

function DeliverablesPanel({ deliverables }) {
  return (
    <section className="deliverables-panel">
      <div className="section-heading compact">
        <div>
          <span>Daily workflow</span>
          <h2>Deliverables</h2>
        </div>
        <CalendarDays size={20} />
      </div>
      <div className="deliverables-list">
        {deliverables.map((item) => (
          <div className="deliverable-row" key={`${item.time}-${item.name}`}>
            <time>{item.time}</time>
            <div>
              <strong>{item.name}</strong>
              <span>{item.purpose}</span>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function ExportPanel() {
  const exports = [
    { label: 'Latest Snapshot', href: `${API_BASE_URL}/api/export/latest.csv` },
    { label: 'History', href: `${API_BASE_URL}/api/export/history.csv` },
    { label: 'Forecasts', href: `${API_BASE_URL}/api/export/forecasts.csv` },
    { label: 'Signals', href: `${API_BASE_URL}/api/export/signals.csv` },
    { label: 'Accuracy', href: `${API_BASE_URL}/api/export/accuracy.csv` }
  ];

  return (
    <section className="export-panel">
      <div className="section-heading compact">
        <div>
          <span>Data export</span>
          <h2>CSV Downloads</h2>
        </div>
        <Database size={20} />
      </div>
      <div className="export-list">
        {exports.map((item) => (
          <a href={item.href} key={item.label}>
            {item.label}
          </a>
        ))}
      </div>
    </section>
  );
}

function EvidenceDrawer({ detail, onClose }) {
  if (!detail) return null;
  const rows = detail.evidence || [];
  return (
    <div className="drawer-backdrop" role="presentation" onClick={onClose}>
      <aside className="evidence-drawer" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
        <div className="drawer-heading">
          <div>
            <span>Source drill-down</span>
            <h2>{detail.title}</h2>
          </div>
          <button type="button" onClick={onClose} title="Close">
            <X size={18} />
          </button>
        </div>
        <div className="evidence-list">
          {rows.map((item, index) => (
            <article key={`${item.source}-${index}`}>
              <strong>{item.source || 'Source'}</strong>
              <h3>{item.title || item.headline || 'No headline text available.'}</h3>
              {item.snippet && <p>{item.snippet}</p>}
              <span>{item.status || item.impact || 'Live scan'}</span>
              {item.url && (
                <a href={item.url} target="_blank" rel="noreferrer">
                  Open article/source <ExternalLink size={14} />
                </a>
              )}
            </article>
          ))}
          {!rows.length && <p>No source rows were returned for this item yet.</p>}
        </div>
      </aside>
    </div>
  );
}

function App() {
  const [activeNote, setActiveNote] = useState('morning');
  const [lastAction, setLastAction] = useState('Ready');
  const [intelligence, setIntelligence] = useState(fallbackIntelligence);
  const [apiStatus, setApiStatus] = useState('Using local fallback data');
  const [sourceDetail, setSourceDetail] = useState(null);
  const [filteredQuote, setFilteredQuote] = useState(null);

  function inspectSources(title, evidence) {
    setSourceDetail({ title, evidence });
  }

  useEffect(() => {
    let isMounted = true;

    async function loadIntelligence() {
      try {
        const response = await fetch(API_URL);
        if (!response.ok) throw new Error(`API returned ${response.status}`);
        const payload = await response.json();
        if (!isMounted) return;
        setIntelligence({
          ...fallbackIntelligence,
          ...payload,
          signals: payload.signals || fallbackIntelligence.signals,
          notes: payload.notes || fallbackIntelligence.notes,
          sourceHealth: payload.sourceHealth || fallbackIntelligence.sourceHealth,
          deliveryChannels: (payload.deliveryChannels || fallbackIntelligence.deliveryChannels).map((channel) => ({
            ...channel,
            icon: deliveryIcons[channel.label] || Send
          }))
        });
        setApiStatus('Live API connected');
        setLastAction(`Backend intelligence loaded ${payload.marketState?.lastUpdated || ''}`.trim());
      } catch (error) {
        if (!isMounted) return;
        setApiStatus('Backend offline: using fallback data');
        setLastAction('Fallback intelligence active');
      }
    }

    loadIntelligence();

    return () => {
      isMounted = false;
    };
  }, []);

  async function refreshIntelligence() {
    setLastAction('Refreshing backend intelligence...');
    try {
      const response = await fetch(REFRESH_URL, { method: 'POST' });
      if (!response.ok) throw new Error(`API returned ${response.status}`);
      const payload = await response.json();
      setIntelligence({
        ...fallbackIntelligence,
        ...payload,
        signals: payload.signals || fallbackIntelligence.signals,
        notes: payload.notes || fallbackIntelligence.notes,
        sourceHealth: payload.sourceHealth || fallbackIntelligence.sourceHealth,
        deliveryChannels: (payload.deliveryChannels || fallbackIntelligence.deliveryChannels).map((channel) => ({
          ...channel,
          icon: deliveryIcons[channel.label] || Send
        }))
      });
      setApiStatus('Live API connected');
      setLastAction(`Backend intelligence refreshed ${payload.marketState?.lastUpdated || ''}`.trim());
    } catch (error) {
      setApiStatus('Backend offline: using fallback data');
      setLastAction('Refresh failed; fallback intelligence remains active');
    }
  }

  const currentMarket = intelligence.marketState;
  const displayedMarket = {
    ...currentMarket,
    interbankRate: filteredQuote?.midRate || currentMarket.interbankRate,
    quoteBuying: filteredQuote?.buying || currentMarket.quoteBuying,
    quoteSelling: filteredQuote?.selling || currentMarket.quoteSelling,
    quoteProviderRows: filteredQuote?.rowCount || currentMarket.quoteProviderRows
  };
  const currentSignals = intelligence.signals;
  const currentProbability = intelligence.probability;
  const currentNotes = intelligence.notes;
  const currentEvents = intelligence.events;
  const currentAlerts = intelligence.alerts;
  const currentSourceHealth = intelligence.sourceHealth;
  const currentFlowReadings = intelligence.flowReadings;
  const currentDirectionEngine = intelligence.directionEngine;
  const currentForecast = intelligence.forecast;
  const currentRegime = intelligence.regime;
  const currentDealerSignal = intelligence.dealerSignal;
  const currentAccuracy = intelligence.accuracyTracker;

  const cediScore = useMemo(
    () =>
      currentSignals.reduce((total, item) => {
        const value = Number(item.value);
        return Number.isNaN(value) ? total : total + value;
      }, 0),
    [currentSignals]
  );

  const activeNoteData = currentNotes[activeNote] || currentNotes.morning;

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand-lockup">
          <div className="brand-mark">
            <CircleDollarSign size={26} />
          </div>
          <div>
            <h1>USD/GHS Intelligence Agent</h1>
            <span>Ghana FX analyst workspace</span>
          </div>
        </div>
        <div className="topbar-actions">
          <button
            title="Refresh market intelligence"
            onClick={refreshIntelligence}
          >
            <RefreshCw size={18} />
            Refresh
          </button>
          <button className="icon-button" title="Alerts" onClick={() => setLastAction('3 active alerts reviewed')}>
            <Bell size={18} />
          </button>
        </div>
      </header>

      <section className="hero-grid">
        <div className="market-hero">
          <div className="hero-meta">
            <span className="live-pill">
              <Radio size={14} />
              Live monitor
            </span>
            <span>
              <Clock3 size={14} />
              Updated {displayedMarket.lastUpdated}
            </span>
          </div>
          <div className="rate-row">
            <div>
              <span>{displayedMarket.pair} filtered MidRate</span>
              <strong>{displayedMarket.interbankRate.toFixed(2)}</strong>
            </div>
            <div className="move-badge positive">
              <TrendingDown size={18} />
              {displayedMarket.dailyMove}%
            </div>
          </div>
          <div className="hero-outlook">
            <div>
              <span>Outlook</span>
              <h2>{displayedMarket.outlook}</h2>
              <p>{filteredQuote?.rowCount ? `${filteredQuote.rowCount} selected provider rows` : displayedMarket.cediView}</p>
            </div>
            <div className="confidence-ring">
              <svg viewBox="0 0 120 120" aria-hidden="true">
                <circle cx="60" cy="60" r="48" />
                <circle
                  className="progress"
                  cx="60"
                  cy="60"
                  r="48"
                  style={{ strokeDashoffset: 302 - (302 * displayedMarket.confidence) / 100 }}
                />
              </svg>
              <div>
                <strong>{displayedMarket.confidence}%</strong>
                <span>confidence</span>
              </div>
            </div>
          </div>
          <div className="hero-footer">
            <div>
              <span>Expected range</span>
              <strong>{displayedMarket.expectedRange}</strong>
            </div>
            <div>
              <span>Demand pressure</span>
              <strong>{displayedMarket.demandPressure}</strong>
            </div>
            <div>
              <span>Liquidity</span>
              <strong>{displayedMarket.liquidity}</strong>
            </div>
            <div>
              <span>Net cedi score</span>
              <strong>+{cediScore}</strong>
            </div>
          </div>
        </div>

        <aside className="command-panel">
          <div className="section-heading compact">
            <div>
              <span>Agent stack</span>
              <h2>Monitoring Tools</h2>
            </div>
            <Cpu size={21} />
          </div>
          <div className="tool-list">
            {sources.map((source) => (
              <div className="tool-row" key={source}>
                <Zap size={15} />
                <span>{source}</span>
                <ChevronRight size={15} />
              </div>
            ))}
          </div>
          <div className="agent-status">
            <Search size={17} />
            <span>{apiStatus} - {lastAction}</span>
          </div>
        </aside>
      </section>

      <section className="metric-grid">
        <MetricCard label="Previous close" value={displayedMarket.previousClose.toFixed(2)} meta={displayedMarket.moveBasis || "Yesterday's interbank reference"} trend="down" />
        <MetricCard label="7-day move" value={`${currentMarket.weeklyMove}%`} meta="Cedi strengthened over the week" trend="down" />
        <MetricCard label="Supply score" value="74 / 100" meta="BoG, gold, and normal demand support" trend="up" />
        <MetricCard label="Risk score" value="38 / 100" meta="Fed and fiscal headlines are watch items" trend="flat" />
      </section>

      <BogAnalysisCard analysis={currentMarket.bogAnalysis} onInspect={inspectSources} />

      <QuoteTable market={currentMarket} onFilteredRateChange={setFilteredQuote} />

      <DirectionEnginePanel engine={currentDirectionEngine} onInspect={inspectSources} />

      <section className="ops-grid">
        <SourceHealthTable sourceHealth={currentSourceHealth} onInspect={inspectSources} />
        <AlertsPanel alerts={currentAlerts} onInspect={inspectSources} />
        <FlowPanel flowReadings={currentFlowReadings} onInspect={inspectSources} />
      </section>

      <section className="forecast-grid">
        <ForecastPanel forecast={currentForecast} onInspect={inspectSources} />
        <RegimePanel regime={currentRegime} dealerSignal={currentDealerSignal} />
        <AccuracyPanel accuracyTracker={currentAccuracy} />
      </section>

      <section className="content-grid">
        <div>
          <div className="section-heading">
            <div>
              <span>Driver model</span>
              <h2>Market Signal Board</h2>
            </div>
            <Globe2 size={22} />
          </div>
          <div className="signal-grid">
            {currentSignals.map((item) => (
              <SignalCard item={item} key={item.title} onInspect={inspectSources} />
            ))}
          </div>
          <div className="signal-ops-grid">
            <ExportPanel />
            <ConfigPanel intelligence={intelligence} />
          </div>
        </div>

        <aside className="right-rail">
          <section className="probability-card">
            <div className="section-heading compact">
              <div>
                <span>Next session</span>
                <h2>Probability Outlook</h2>
              </div>
              <TrendingUp size={20} />
            </div>
            {currentProbability.map((item) => (
              <ProbabilityBar item={item} key={item.label} />
            ))}
          </section>

          <section className="events-card">
            <div className="section-heading compact">
              <div>
                <span>Today</span>
                <h2>Event Radar</h2>
              </div>
              <CalendarDays size={20} />
            </div>
            <div className="timeline">
              {currentEvents.map((event) => (
                <div className={`timeline-row ${event.tone}`} key={`${event.time}-${event.title}`}>
                  <time>{event.time}</time>
                  <div>
                    <strong>{event.title}</strong>
                    <span>{event.tag}</span>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </aside>
      </section>

      <section className="note-workbench">
        <div className="note-tabs" role="tablist" aria-label="Market note type">
          {Object.keys(currentNotes).map((key) => (
            <button
              className={activeNote === key ? 'active' : ''}
              key={key}
              onClick={() => setActiveNote(key)}
              type="button"
            >
              {currentNotes[key].title}
            </button>
          ))}
        </div>
        <NotePanel note={activeNoteData} onInspect={inspectSources} />
      </section>
      <EvidenceDrawer detail={sourceDetail} onClose={() => setSourceDetail(null)} />
    </main>
  );
}

createRoot(document.getElementById('root')).render(<App />);

