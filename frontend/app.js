const { useState, useEffect, useRef, useMemo } = React;

const INSTITUTIONS = [
  "All",
  "Chase",
  "Capital One",
  "Bank of America",
  "Wells Fargo",
  "Vanguard",
  "Fidelity",
  "Charles Schwab",
  "HealthEquity",
];

const CATEGORIES = [
  "Dining & Restaurants",
  "Groceries",
  "Shopping",
  "Travel & Transit",
  "Housing",
  "Home & Utilities",
  "Automotive & Gas",
  "Subscriptions",
  "Health & Fitness",
  "Entertainment",
  "Income",
  "Transfer / Payment",
  "Uncategorized",
];

const INSTITUTION_BADGES = {
  "Chase": "bg-blue-500/15 text-blue-400 border-blue-500/30",
  "Capital One": "bg-red-500/15 text-red-400 border-red-500/30",
  "Bank of America": "bg-rose-500/15 text-rose-400 border-rose-500/30",
  "Wells Fargo": "bg-amber-500/15 text-amber-400 border-amber-500/30",
  "Vanguard": "bg-red-600/15 text-red-300 border-red-600/30",
  "Fidelity": "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  "Charles Schwab": "bg-sky-500/15 text-sky-400 border-sky-500/30",
  "HealthEquity": "bg-purple-500/15 text-purple-400 border-purple-500/30",
};

const CHART_COLORS = [
  "#6366f1", "#10b981", "#f59e0b", "#ec4899", "#3b82f6",
  "#8b5cf6", "#14b8a6", "#f97316", "#ef4444", "#06b6d4",
];

const CATEGORY_COLOR_MAP = {
  "Shopping": "#6366f1",
  "Dining & Restaurants": "#f59e0b",
  "Travel & Transit": "#ec4899",
  "Groceries": "#10b981",
  "Automotive & Gas": "#3b82f6",
  "Home & Utilities": "#14b8a6",
  "Subscriptions": "#8b5cf6",
  "Health & Fitness": "#06b6d4",
  "Entertainment": "#f97316",
  "Housing": "#64748b",
  "Uncategorized": "#94a3b8",
};

function getCategoryColor(cat, idx = 0) {
  return CATEGORY_COLOR_MAP[cat] || CHART_COLORS[idx % CHART_COLORS.length];
}

// Global privacy mode (Monarch-style "hide amounts" for screen sharing).
// Set by <App /> on every render so all formatters + chart tick callbacks respect it.
let PRIVACY_MODE = false;

function fmtCurrency(num, showSign = false) {
  if (PRIVACY_MODE) return "$•••••";
  const n = Number(num);
  if (isNaN(n)) return "$0.00";
  const absStr = Math.abs(n).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  if (showSign && n > 0) return `+$${absStr}`;
  if (n < 0) return `-$${absStr}`;
  return `$${absStr}`;
}

function fmtCompact(num) {
  if (PRIVACY_MODE) return "$•••";
  const n = Number(num);
  if (isNaN(n)) return "$0";
  const sign = n < 0 ? "-" : "";
  const abs = Math.abs(n);
  if (abs >= 1000000) {
    return `${sign}$${(abs / 1000000).toFixed(2)}M`;
  }
  if (abs >= 1000) {
    return `${sign}$${(abs / 1000).toFixed(1)}k`;
  }
  return `${sign}$${abs.toFixed(0)}`;
}

function fmtMonthLabel(ym) {
  if (!ym) return "";
  const [y, m] = String(ym).split("-").map(Number);
  if (!y || !m) return ym;
  return new Date(y, m - 1, 1).toLocaleString("en-US", { month: "short", year: "numeric" });
}

// Geometric vector icon set (Kubera / Linear aesthetic)
function BentoIcon({ name, className = "w-4 h-4" }) {
  const props = {
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "1.9",
    strokeLinecap: "round",
    strokeLinejoin: "round",
    className,
    "aria-hidden": "true",
  };
  switch (name) {
    case "wallet":
      return (
        <svg {...props}>
          <path d="M19 7V5a2 2 0 0 0-2-2H5a2 2 0 0 0 0 4h14a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5" />
          <path d="M16 14h2" />
        </svg>
      );
    case "trending":
      return (
        <svg {...props}>
          <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" />
          <polyline points="16 7 22 7 22 13" />
        </svg>
      );
    case "shield":
      return (
        <svg {...props}>
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
          <path d="m9 12 2 2 4-4" />
        </svg>
      );
    case "home":
      return (
        <svg {...props}>
          <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
          <polyline points="9 22 9 12 15 12 15 22" />
        </svg>
      );
    case "layers":
      return (
        <svg {...props}>
          <polygon points="12 2 2 7 12 12 22 7 12 2" />
          <polyline points="2 17 12 22 22 17" />
          <polyline points="2 12 12 17 22 12" />
        </svg>
      );
    case "pie":
      return (
        <svg {...props}>
          <path d="M21.21 15.89A10 10 0 1 1 8 2.83" />
          <path d="M22 12A10 10 0 0 0 12 2v10z" />
        </svg>
      );
    case "target":
      return (
        <svg {...props}>
          <circle cx="12" cy="12" r="10" />
          <circle cx="12" cy="12" r="6" />
          <circle cx="12" cy="12" r="2" />
        </svg>
      );
    case "alert":
      return (
        <svg {...props}>
          <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
          <line x1="12" y1="9" x2="12" y2="13" />
          <line x1="12" y1="17" x2="12.01" y2="17" />
        </svg>
      );
    case "sparkles":
      return (
        <svg {...props}>
          <path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3L12 3Z" />
        </svg>
      );
    default:
      return (
        <svg {...props}>
          <rect x="3" y="3" width="7" height="9" rx="1" />
          <rect x="14" y="3" width="7" height="5" rx="1" />
          <rect x="14" y="12" width="7" height="9" rx="1" />
          <rect x="3" y="16" width="7" height="5" rx="1" />
        </svg>
      );
  }
}

// High-craft currency display with muted decimal cents & tabular numerals
function MoneyHero({ value, showSign = false, className = "" }) {
  if (PRIVACY_MODE) {
    return <span className={`font-mono tabular-nums ${className}`}>$•••,•••</span>;
  }
  const n = Number(value || 0);
  const sign = n < 0 ? "-" : showSign && n > 0 ? "+" : "";
  const absStr = Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const parts = absStr.split(".");
  return (
    <span className={`font-mono tabular-nums ${className}`}>
      {sign}${parts[0]}
      <span className="cents-muted">.{parts[1]}</span>
    </span>
  );
}

// Word-sized, axis-free trend line for KPI cards (Tufte sparkline pattern).
function Sparkline({ values = [], color = "#6366f1", height = 36, highlightIndex = null, fill = true }) {
  const pts = values.map((v) => Number(v) || 0);
  if (pts.length < 2) return <div style={{ height }} />;
  const w = 100;
  const min = Math.min(...pts);
  const max = Math.max(...pts);
  const range = max - min || 1;
  const pad = 3;
  const xy = pts.map((v, i) => [
    (i / (pts.length - 1)) * w,
    pad + (1 - (v - min) / range) * (height - pad * 2),
  ]);
  const line = xy.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(" ");
  const area = `0,${height} ${line} ${w},${height}`;
  const hi = highlightIndex !== null && highlightIndex >= 0 && highlightIndex < xy.length ? xy[highlightIndex] : xy[xy.length - 1];
  const zeroY = min < 0 && max > 0 ? pad + (1 - (0 - min) / range) * (height - pad * 2) : null;
  return (
    <svg viewBox={`0 0 ${w} ${height}`} preserveAspectRatio="none" style={{ width: "100%", height }} aria-hidden="true">
      {zeroY !== null && (
        <line x1="0" x2={w} y1={zeroY} y2={zeroY} stroke="currentColor" strokeOpacity="0.25" strokeDasharray="2 2" vectorEffect="non-scaling-stroke" />
      )}
      {fill && <polygon points={area} fill={color} fillOpacity="0.12" />}
      <polyline points={line} fill="none" stroke={color} strokeWidth="1.8" vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={hi[0]} cy={hi[1]} r="2.6" fill={color} />
    </svg>
  );
}

// Reusable interactive Chart.js component with click, pointer hover & zero-flicker in-place updates
function ChartCanvas({ type, data, options, height = 260, onElementClick, isDark }) {
  const canvasRef = useRef(null);
  const chartRef = useRef(null);
  const prevTypeRef = useRef(type);
  const clickHandlerRef = useRef(onElementClick);
  const hoverHandlerRef = useRef(options?.onHover);

  useEffect(() => {
    clickHandlerRef.current = onElementClick;
    hoverHandlerRef.current = options?.onHover;
  }, [onElementClick, options?.onHover]);

  const dataKey = JSON.stringify(data);

  useEffect(() => {
    if (!canvasRef.current) return;
    const mergedOptions = {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 180 },
      ...options,
      onHover: (event, elements) => {
        if (event?.native?.target) {
          event.native.target.style.cursor =
            clickHandlerRef.current && elements && elements.length > 0 ? "pointer" : "default";
        }
        if (hoverHandlerRef.current) hoverHandlerRef.current(event, elements);
      },
      onClick: (event) => {
        if (!clickHandlerRef.current || !chartRef.current) return;
        const chart = chartRef.current;
        let pts = chart.getElementsAtEventForMode(event, "nearest", { intersect: true }, true);
        let clickedDirectly = true;
        if (!pts || pts.length === 0) {
          pts = chart.getElementsAtEventForMode(event, "index", { intersect: false }, true);
          clickedDirectly = false;
        }
        if (pts && pts.length > 0) {
          const first = pts[0];
          const dsIdx = first.datasetIndex;
          const idx = first.index;
          const label = chart.data.labels?.[idx];
          const datasetLabel = chart.data.datasets?.[dsIdx]?.label;
          const value = chart.data.datasets?.[dsIdx]?.data?.[idx];
          clickHandlerRef.current({
            index: idx,
            datasetIndex: dsIdx,
            label,
            datasetLabel,
            value,
            clickedDirectly,
          });
        }
      },
    };

    if (chartRef.current && prevTypeRef.current === type) {
      chartRef.current.data = data;
      chartRef.current.options = mergedOptions;
      chartRef.current.update("none");
      return;
    }

    if (chartRef.current) {
      chartRef.current.destroy();
      chartRef.current = null;
    }
    const existing = typeof Chart !== "undefined" && Chart.getChart ? Chart.getChart(canvasRef.current) : null;
    if (existing) {
      existing.destroy();
    }
    const ctx = canvasRef.current.getContext("2d");
    prevTypeRef.current = type;
    chartRef.current = new Chart(ctx, {
      type,
      data,
      options: mergedOptions,
    });
  }, [type, dataKey, isDark, PRIVACY_MODE]);

  useEffect(() => {
    return () => {
      if (chartRef.current) {
        chartRef.current.destroy();
        chartRef.current = null;
      }
    };
  }, []);

  return (
    <div style={{ height: `${height}px`, position: "relative" }}>
      <canvas ref={canvasRef} />
    </div>
  );
}

// GitHub-style calendar heatmap of daily spending (click a day to filter).
function SpendingCalendarHeatmap({ ym, dailySeries = [], valueFor, selectedDate, onSelectDate, isDark }) {
  if (!ym || dailySeries.length === 0) return null;
  const [y, m] = ym.split("-").map(Number);
  const firstDow = new Date(y, m - 1, 1).getDay();
  const vals = dailySeries.map((d) => Number(valueFor(d)) || 0);
  const max = Math.max(...vals, 1);
  const cells = [];
  for (let i = 0; i < firstDow; i++) cells.push(null);
  dailySeries.forEach((d, i) => cells.push({ ...d, v: vals[i] }));

  let wkndSum = 0, wkndDays = 0, wkdySum = 0, wkdyDays = 0;
  dailySeries.forEach((d, i) => {
    const dow = new Date(y, m - 1, d.day).getDay();
    if (dow === 0 || dow === 6) { wkndSum += vals[i]; wkndDays++; } else { wkdySum += vals[i]; wkdyDays++; }
  });
  const wkndAvg = wkndDays ? wkndSum / wkndDays : 0;
  const wkdyAvg = wkdyDays ? wkdySum / wkdyDays : 0;
  const noSpendDays = vals.filter((v) => v === 0).length;
  const ratio = wkdyAvg > 0 ? wkndAvg / wkdyAvg : 0;

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-7 gap-1 text-[9px] text-center text-slate-400 font-semibold">
        {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => <div key={i}>{d}</div>)}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {cells.map((c, i) => {
          if (!c) return <div key={`e${i}`} />;
          const intensity = c.v > 0 ? 0.15 + 0.85 * Math.sqrt(c.v / max) : 0;
          const isSel = selectedDate === c.date;
          return (
            <button
              key={c.date}
              onClick={() => onSelectDate(isSel ? null : c.date)}
              title={`${c.date}: ${fmtCurrency(c.v)}${c.top_merchant ? ` • Top: ${c.top_merchant}` : ""} (${c.tx_count} txns)`}
              className={`aspect-square rounded-md text-[9px] font-bold flex items-center justify-center transition hover:scale-110 ${
                isSel ? "ring-2 ring-emerald-400" : ""
              }`}
              style={{
                backgroundColor: c.v > 0 ? `rgba(99, 102, 241, ${intensity.toFixed(2)})` : isDark ? "rgba(51,65,85,0.25)" : "rgba(226,232,240,0.7)",
                color: intensity > 0.55 ? "#ffffff" : isDark ? "#94a3b8" : "#475569",
              }}
            >
              {c.day}
            </button>
          );
        })}
      </div>
      <div className="flex flex-wrap justify-between gap-1 text-[10px] text-slate-400 pt-1">
        <span>🟢 <strong className="text-emerald-400">{noSpendDays}</strong> no-spend days</span>
        <span>
          Weekend avg <strong className="text-indigo-300">{fmtCompact(wkndAvg)}</strong>/day
          {ratio > 0 && <> ({ratio >= 1 ? `${ratio.toFixed(1)}× weekdays` : `${(1 / ratio).toFixed(1)}× less than weekdays`})</>}
        </span>
      </div>
    </div>
  );
}

// Ctrl/Cmd+K command palette: keyboard-first navigation & actions.
function CommandPalette({ open, onClose, commands, isDark }) {
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef(null);

  useEffect(() => {
    if (open) {
      setQuery("");
      setCursor(0);
      setTimeout(() => inputRef.current?.focus(), 20);
    }
  }, [open]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return commands.slice(0, 40);
    const tokens = q.split(/\s+/);
    return commands
      .map((c) => {
        const hay = `${c.group} ${c.label} ${c.hint || ""} ${c.keywords || ""}`.toLowerCase();
        if (!tokens.every((t) => hay.includes(t))) return null;
        const score = (c.label.toLowerCase().startsWith(tokens[0]) ? 0 : 1) + (c.label.toLowerCase().includes(q) ? 0 : 1);
        return { c, score };
      })
      .filter(Boolean)
      .sort((a, b) => a.score - b.score)
      .slice(0, 40)
      .map((r) => r.c);
  }, [query, commands]);

  if (!open) return null;

  const run = (cmd) => {
    if (!cmd) return;
    onClose();
    setTimeout(() => cmd.run(), 0);
  };

  const onKeyDown = (e) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setCursor((c) => Math.min(results.length - 1, c + 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setCursor((c) => Math.max(0, c - 1)); }
    else if (e.key === "Enter") { e.preventDefault(); run(results[cursor]); }
    else if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); onClose(); }
  };

  let lastGroup = null;
  return (
    <div
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      className="fixed inset-0 z-[60] bg-black/50 backdrop-blur-sm flex items-start justify-center pt-[12vh] px-4"
    >
      <div className={`w-full max-w-xl rounded-2xl border shadow-2xl overflow-hidden ${isDark ? "bg-slate-900 border-slate-700" : "bg-white border-slate-200"}`}>
        <div className={`flex items-center gap-2 px-4 py-3 border-b ${isDark ? "border-slate-800" : "border-slate-200"}`}>
          <span className="text-slate-400">⌘</span>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => { setQuery(e.target.value); setCursor(0); }}
            onKeyDown={onKeyDown}
            placeholder="Jump to a tab, month, category, merchant, or action…"
            className={`flex-1 bg-transparent text-sm focus:outline-none ${isDark ? "text-white placeholder-slate-500" : "text-slate-900 placeholder-slate-400"}`}
          />
          <kbd className="text-[10px] px-1.5 py-0.5 rounded border border-slate-600 text-slate-400">Esc</kbd>
        </div>
        <div className="max-h-[50vh] overflow-y-auto py-1">
          {results.length === 0 && <div className="px-4 py-6 text-center text-xs text-slate-400">No matches for “{query}”</div>}
          {results.map((cmd, i) => {
            const showGroup = cmd.group !== lastGroup;
            lastGroup = cmd.group;
            const active = i === cursor;
            return (
              <React.Fragment key={`${cmd.group}-${cmd.label}-${i}`}>
                {showGroup && <div className="px-4 pt-2 pb-1 text-[10px] font-bold uppercase tracking-wider text-slate-500">{cmd.group}</div>}
                <button
                  onMouseEnter={() => setCursor(i)}
                  onClick={() => run(cmd)}
                  className={`w-full px-4 py-2 flex items-center justify-between text-left text-xs transition ${
                    active ? (isDark ? "bg-indigo-600/30 text-white" : "bg-indigo-50 text-indigo-900") : isDark ? "text-slate-300" : "text-slate-700"
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <span className="w-5 text-center">{cmd.icon || "›"}</span>
                    <span className="font-semibold">{cmd.label}</span>
                    {cmd.hint && <span className="text-slate-500">{cmd.hint}</span>}
                  </span>
                  {cmd.shortcut && <kbd className="text-[10px] px-1.5 py-0.5 rounded border border-slate-600 text-slate-400">{cmd.shortcut}</kbd>}
                </button>
              </React.Fragment>
            );
          })}
        </div>
        <div className={`px-4 py-2 border-t text-[10px] text-slate-500 flex flex-wrap gap-3 ${isDark ? "border-slate-800" : "border-slate-200"}`}>
          <span><kbd>↑↓</kbd> navigate</span>
          <span><kbd>Enter</kbd> run</span>
          <span><kbd>1–7</kbd> tabs</span>
          <span><kbd>[ ]</kbd> prev/next month</span>
          <span><kbd>H</kbd> hide amounts</span>
          <span><kbd>/</kbd> or <kbd>Ctrl K</kbd> open</span>
        </div>
      </div>
    </div>
  );
}

function App() {
  // Theme state: dark / light
  const [isDark, setIsDark] = useState(() => {
    const saved = localStorage.getItem("finpulse_theme");
    return saved ? saved === "dark" : true;
  });

  const [activeTab, setActiveTab] = useState(() => {
    const p = window.location.pathname || "";
    const s = window.location.search || "";
    return p === "/kitchen" || s.includes("kitchen") ? "kitchen" : "overview";
  });
  const [kitchenSubTab, setKitchenSubTab] = useState("labs");
  const [privacyMode, setPrivacyMode] = useState(() => localStorage.getItem("finpulse_privacy") === "1");
  PRIVACY_MODE = privacyMode;
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [dailyViewMode, setDailyViewMode] = useState("calendar"); // "calendar" | "bars"
  const [sankeyMode, setSankeyMode] = useState("month"); // "month" | "avg12"
  const [selectedMonth, setSelectedMonth] = useState("");
  const [selectedInstitution, setSelectedInstitution] = useState("All");
  const [dashboard, setDashboard] = useState(null);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState(null);

  // Universal Right-Hand Context Inspector state (click any item to inspect; click again to unclick/close)
  const [inspector, setInspector] = useState(null); // { key, type: 'networth'|'cashflow'|'month'|'category'|'cards', month?, category?, group?, driver?, txFilter? }
  const [inspectorTxFilter, setInspectorTxFilter] = useState("all"); // "all" | "income" | "housing" | "lifestyle" | "principal"
  const [nwChartMode, setNwChartMode] = useState("overview"); // "overview" | "balance_sheet" | "table"
  const [nwSelectedDriver, setNwSelectedDriver] = useState("all"); // "all" | "income" | "market" | "redemption" | "home"
  const [netPartnerMode, setNetPartnerMode] = useState(true); // Adjusts Housing by partner housing reimbursement share
  const [showExtraPrincipalOnGraph, setShowExtraPrincipalOnGraph] = useState(true); // Shows extra principal prepayments

  // Category drill-down side panel
  const [drillCategory, setDrillCategory] = useState(null);
  const [drillData, setDrillData] = useState(null);
  const [drillLoading, setDrillLoading] = useState(false);

  // Interactive Monthly Spending Explorer & Month Deep-Dive Inspector
  const [explorerChartMode, setExplorerChartMode] = useState("cashflow"); // "cashflow" | "stacked" | "income" | "total"
  const [excludeHousingOnGraph, setExcludeHousingOnGraph] = useState(false);
  const [inspectedMonth, setInspectedMonth] = useState("");
  const [monthDetail, setMonthDetail] = useState(null);
  const [monthDetailLoading, setMonthDetailLoading] = useState(false);
  const [monthInspectorOpen, setMonthInspectorOpen] = useState(false);
  const [monthCategoryFilter, setMonthCategoryFilter] = useState(null);
  const [monthMerchantFilter, setMonthMerchantFilter] = useState(null);
  const [monthDayFilter, setMonthDayFilter] = useState(null);
  const [monthAccountFilter, setMonthAccountFilter] = useState(null);
  const [monthTxSort, setMonthTxSort] = useState("amount"); // "amount" | "date"
  const [monthTxSearch, setMonthTxSearch] = useState("");
  const monthInspectorRef = useRef(null);

  // Settings & Data Drawer
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Retirement Planner State
  const [retirementData, setRetirementData] = useState(null);
  const [retirementLoading, setRetirementLoading] = useState(false);
  const [retirementInputs, setRetirementInputs] = useState(null);
  const [savingRetirement, setSavingRetirement] = useState(false);

  // Mortgage & Tax Paydown Tracker State
  const [mortgageData, setMortgageData] = useState(null);
  const [mortgageLoading, setMortgageLoading] = useState(false);
  const [mortgageInputs, setMortgageInputs] = useState(null);
  const [savingMortgage, setSavingMortgage] = useState(false);
  const [syncingMortgageSheet, setSyncingMortgageSheet] = useState(false);
  const [mortgageScheduleTab, setMortgageScheduleTab] = useState("active_575"); // "active_575" | "prev_65" | "annual"
  const [mortgageScheduleShowAll, setMortgageScheduleShowAll] = useState(false);
  const [editingExcessYm, setEditingExcessYm] = useState(null);
  const [editingExcessVal, setEditingExcessVal] = useState("");

  // Needs vs. Excess & Spending Reflection State
  const [reflectionsData, setReflectionsData] = useState(null);
  const [reflectionBucketFilter, setReflectionBucketFilter] = useState("all_non_need"); // "all_non_need" | "questionable" | "worth_it" | "cut_back" | "need"
  const [editingReflectionMerch, setEditingReflectionMerch] = useState(null);
  const [reflectionDraft, setReflectionDraft] = useState({ bucket: "questionable", feeling: "", why_bought: "", monthly_target: "" });

  // Sub-views & Cross-Dimensional Matrix / Transactions Explorer state
  const [expandedMatrixCats, setExpandedMatrixCats] = useState(
    () => new Set(["Housing", "Shopping", "Dining & Restaurants", "Travel & Transit"])
  );
  const [transactions, setTransactions] = useState([]);
  const [txSearch, setTxSearch] = useState("");
  const [txCategoryFilter, setTxCategoryFilter] = useState("All");
  const [txScopeMonth, setTxScopeMonth] = useState("all"); // "all" | "selected"
  const [txTypeFilter, setTxTypeFilter] = useState("All"); // "All" | "expense" | "income" | "transfer"
  const [txAccountFilter, setTxAccountFilter] = useState("All");
  const [txSizeFilter, setTxSizeFilter] = useState("all"); // "all" | "major" | "everyday"
  const [txGroupBy, setTxGroupBy] = useState("none"); // "none" | "merchant" | "category" | "account" | "month"
  const [txExpandedGroup, setTxExpandedGroup] = useState(null);
  const [txPage, setTxPage] = useState(1);
  const [txPageSize, setTxPageSize] = useState(60);
  const [editingTxId, setEditingTxId] = useState(null);
  const [rules, setRules] = useState([]);
  const [syncStatus, setSyncStatus] = useState(null);
  const [syncingPrices, setSyncingPrices] = useState(false);
  const [syncingAll, setSyncingAll] = useState(false);

  // Client-side response caches for zero-wait tab & month navigation
  const dashboardCacheRef = useRef(new Map());
  const monthDetailCacheRef = useRef(new Map());
  const categoryDetailCacheRef = useRef(new Map());
  const txAllCacheRef = useRef(null);
  const prewarmStartedRef = useRef(false);
  const invalidateCaches = () => {
    dashboardCacheRef.current.clear();
    monthDetailCacheRef.current.clear();
    categoryDetailCacheRef.current.clear();
    txAllCacheRef.current = null;
  };

  // Modals & form state
  const [showHoldingModal, setShowHoldingModal] = useState(false);
  const [newHolding, setNewHolding] = useState({ account_id: "", symbol: "", name: "", shares: "", current_price: "", cost_basis_total: "" });
  const [editingBudgetCat, setEditingBudgetCat] = useState(null);
  const [editingBudgetVal, setEditingBudgetVal] = useState("");
  const [newRule, setNewRule] = useState({ keyword: "", merchant_name: "", category: "Shopping", tx_type: "expense" });
  const [newTx, setNewTx] = useState({ account_id: "", tx_date: "", description: "", amount: "", category: "Dining & Restaurants", tx_type: "expense" });
  const [newAccount, setNewAccount] = useState({ name: "", institution: "Chase", account_type: "credit_card", balance: "", credit_limit: "" });
  const [simplefinToken, setSimplefinToken] = useState("");
  const [tellerToken, setTellerToken] = useState("");
  const [tellerAppId, setTellerAppId] = useState("");
  const [uploadInstitution, setUploadInstitution] = useState("Auto-Detect");
  const [simMonthlySpendDelta, setSimMonthlySpendDelta] = useState(-3661); // Default: Skip unnecessary major buys (-$43.9k/yr)
  const [simAnnualMajorAllowance, setSimAnnualMajorAllowance] = useState(12000); // $1,000/mo planned major buy sinking fund
  const [simIncomeScenario, setSimIncomeScenario] = useState("baseline"); // baseline | conservative | unvested_only | bull | coast
  const [simMarketReturnPct, setSimMarketReturnPct] = useState(7.0);
  const [includeWaMillionaireTax, setIncludeWaMillionaireTax] = useState(true); // WA SB 6346 (9.9% > $1M AGI eff. Jan 2028)
  const [homeValuationMode, setHomeValuationMode] = useState("secular_inflation"); // "secular_inflation" ($1.625M) | "comps_cooling" ($1.475M)
  const [selectedTripTab, setSelectedTripTab] = useState("primary"); // "primary" | "airbnb" | "upcoming"
  const [majorProjectFilter, setMajorProjectFilter] = useState("All");
  const [newPlannedBuy, setNewPlannedBuy] = useState({
    name: "",
    category: "Home & Upgrades",
    estimated_cost: "",
    target_ym: "2027-03",
    priority: "medium",
    notes: "",
  });

  // Apply theme to document
  useEffect(() => {
    if (isDark) {
      document.documentElement.classList.add("dark");
      document.documentElement.classList.remove("light");
      localStorage.setItem("finpulse_theme", "dark");
    } else {
      document.documentElement.classList.add("light");
      document.documentElement.classList.remove("dark");
      localStorage.setItem("finpulse_theme", "light");
    }
  }, [isDark]);

  // Global keydown listeners (Escape to dismiss drawers and modals)
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === "Escape") {
        setPaletteOpen(false);
        setInspector(null);
        setDrawerOpen(false);
        setDrillCategory(null);
        setDrillData(null);
        setShowHoldingModal(false);
        setEditingBudgetCat(null);
        setEditingReflectionMerch(null);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  useEffect(() => {
    localStorage.setItem("finpulse_privacy", privacyMode ? "1" : "0");
  }, [privacyMode]);

  // Keyboard-first shortcuts (Ctrl/Cmd+K or / palette, 1-7 tabs, [ ] months, H hide amounts)
  const shortcutRef = useRef({});
  useEffect(() => {
    const TAB_IDS = ["overview", "mortgage", "spending", "investments", "retirement", "excess", "transactions"];
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((o) => !o);
        return;
      }
      const tag = (e.target?.tagName || "").toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select" || e.target?.isContentEditable) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === "/") { e.preventDefault(); setPaletteOpen(true); return; }
      if (/^[1-7]$/.test(e.key)) { setActiveTab(TAB_IDS[Number(e.key) - 1]); return; }
      if (e.key === "[") { shortcutRef.current.stepMonth?.(1); return; }
      if (e.key === "]") { shortcutRef.current.stepMonth?.(-1); return; }
      if (e.key.toLowerCase() === "h") { setPrivacyMode((p) => !p); return; }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const showToast = (msg, type = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4500);
  };

  const fetchMonthDetail = async (ym, inst = selectedInstitution, forceFresh = false) => {
    if (!ym) return;
    const cKey = `${ym}|${inst || "All"}`;
    const cached = !forceFresh && monthDetailCacheRef.current.get(cKey);
    if (cached) {
      setMonthDetail(cached);
      return;
    }
    setMonthDetailLoading(true);
    try {
      const params = new URLSearchParams();
      if (inst && inst !== "All") params.set("institution", inst);
      const res = await fetch(`/api/month-detail/${encodeURIComponent(ym)}?${params.toString()}`);
      const json = await res.json();
      monthDetailCacheRef.current.set(cKey, json);
      setMonthDetail(json);
    } catch (e) {
      console.error(e);
    } finally {
      setMonthDetailLoading(false);
    }
  };

  // Universal Right-Hand Inspector toggle (click an item to inspect; click the same item again to unclick/close)
  const toggleInspector = (nextObj) => {
    if (!nextObj) {
      setInspector(null);
      return;
    }
    if (inspector && inspector.key === nextObj.key) {
      setInspector(null);
      return;
    }
    setInspector(nextObj);
    if (nextObj.txFilter) {
      setInspectorTxFilter(nextObj.txFilter);
    } else if (nextObj.type === "cashflow") {
      setInspectorTxFilter("all");
    }
    const targetYm = nextObj.month || inspectedMonth || selectedMonth;
    if (targetYm) {
      setInspectedMonth(targetYm);
      fetchMonthDetail(targetYm, selectedInstitution);
    }
    if (nextObj.category !== undefined) {
      setMonthCategoryFilter(nextObj.category);
    }
    if (nextObj.merchant !== undefined) {
      setMonthMerchantFilter(nextObj.merchant);
    }
    if (nextObj.day !== undefined) {
      setMonthDayFilter(nextObj.day);
    }
    if (nextObj.accountId !== undefined) {
      setMonthAccountFilter(nextObj.accountId);
    }
    if (nextObj.type === "category" && nextObj.category) {
      const catKey = `${nextObj.category}|${targetYm || ""}|${selectedInstitution || "All"}`;
      const cachedCat = categoryDetailCacheRef.current.get(catKey);
      if (cachedCat) {
        setDrillData(cachedCat);
        setDrillLoading(false);
      } else {
        setDrillLoading(true);
        const params = new URLSearchParams();
        if (targetYm) params.set("month", targetYm);
        if (selectedInstitution !== "All") params.set("institution", selectedInstitution);
        fetch(`/api/category/${encodeURIComponent(nextObj.category)}?${params.toString()}`)
          .then((r) => r.json())
          .then((json) => {
            categoryDetailCacheRef.current.set(catKey, json);
            setDrillData(json);
          })
          .catch((err) => console.error(err))
          .finally(() => setDrillLoading(false));
      }
    }
  };

  const handleInsightAction = (item) => {
    if (!item) return;
    if (item.link?.category) {
      fetchCategoryDetail(item.link.category);
    } else if (item.link?.inspector) {
      toggleInspector({
        key: `insight-${item.id}`,
        type: item.link.inspector,
        month: selectedMonth,
        category: item.link.category || null,
      });
    } else {
      toggleInspector({
        key: `insight-${item.id}`,
        type: "cashflow",
        month: selectedMonth,
      });
    }
  };

  const openMonthInspector = (ym, opts = {}) => {
    if (!ym) return;
    const targetMonth = ym;
    const cat = opts.category !== undefined ? opts.category : null;
    const key = opts.key || `month-${targetMonth}-${cat || "all"}`;
    if (inspector && inspector.key === key && !opts.forceOpen) {
      setInspector(null);
      return;
    }
    setInspectedMonth(targetMonth);
    if (opts.syncGlobalMonth) {
      setSelectedMonth(targetMonth);
    }
    setMonthCategoryFilter(cat);
    setMonthMerchantFilter(opts.merchant !== undefined ? opts.merchant : null);
    setMonthDayFilter(opts.day !== undefined ? opts.day : null);
    setMonthAccountFilter(opts.accountId !== undefined ? opts.accountId : null);
    setInspector({
      key,
      type: opts.inspectorType || "cashflow",
      month: targetMonth,
      category: cat,
      txFilter: opts.txFilter || (cat === "Housing" ? "housing" : cat ? "lifestyle" : "all"),
    });
    if (opts.txFilter) {
      setInspectorTxFilter(opts.txFilter);
    }
    fetchMonthDetail(targetMonth, selectedInstitution);
  };

  const fetchDashboard = async (month = selectedMonth, inst = selectedInstitution, forceFresh = false) => {
    const instKey = inst || "All";
    const reqKey = `${month || "latest"}|${instKey}`;
    if (!forceFresh) {
      const cached = dashboardCacheRef.current.get(reqKey);
      if (cached) {
        setDashboard(cached);
        const resolvedM = month || cached.selected_month;
        if (!month && cached.selected_month) {
          setSelectedMonth(cached.selected_month);
        }
        if (resolvedM) {
          setInspectedMonth(resolvedM);
          if (cached.month_detail) {
            monthDetailCacheRef.current.set(`${resolvedM}|${instKey}`, cached.month_detail);
            setMonthDetail(cached.month_detail);
          } else {
            fetchMonthDetail(resolvedM, instKey);
          }
        }
        setLoading(false);
        return;
      }
    }
    try {
      const params = new URLSearchParams();
      if (month) params.set("month", month);
      if (inst && inst !== "All") params.set("institution", inst);
      const res = await fetch(`/api/dashboard?${params.toString()}`);
      const json = await res.json();
      dashboardCacheRef.current.set(reqKey, json);
      if (json.selected_month) {
        dashboardCacheRef.current.set(`${json.selected_month}|${instKey}`, json);
      }
      setDashboard(json);
      const resolvedMonth = month || json.selected_month;
      if (resolvedMonth) {
        setInspectedMonth(resolvedMonth);
        if (json.month_detail) {
          monthDetailCacheRef.current.set(`${resolvedMonth}|${instKey}`, json.month_detail);
          setMonthDetail(json.month_detail);
        } else {
          fetchMonthDetail(resolvedMonth, instKey);
        }
      }
      if (!month && json.selected_month) {
        setSelectedMonth(json.selected_month);
      }
      setLoading(false);
    } catch (err) {
      console.error(err);
      setLoading(false);
    }
  };

  const fetchCategoryDetail = async (categoryName) => {
    if (!categoryName) return;
    const key = `cat-${categoryName}-${selectedMonth}`;
    if (inspector && inspector.key === key) {
      setInspector(null);
      return;
    }
    const catKey = `${categoryName}|${selectedMonth || ""}|${selectedInstitution || "All"}`;
    const cachedCat = categoryDetailCacheRef.current.get(catKey);
    setInspector({
      key,
      type: "category",
      category: categoryName,
      month: selectedMonth,
    });
    if (cachedCat) {
      setDrillData(cachedCat);
      setDrillLoading(false);
      return;
    }
    setDrillLoading(true);
    try {
      const params = new URLSearchParams();
      if (selectedMonth) params.set("month", selectedMonth);
      if (selectedInstitution !== "All") params.set("institution", selectedInstitution);
      const res = await fetch(`/api/category/${encodeURIComponent(categoryName)}?${params.toString()}`);
      const json = await res.json();
      categoryDetailCacheRef.current.set(catKey, json);
      setDrillData(json);
    } catch (e) {
      console.error(e);
    } finally {
      setDrillLoading(false);
    }
  };

  const fetchRetirement = async () => {
    setRetirementLoading(true);
    try {
      const res = await fetch("/api/retirement");
      const json = await res.json();
      setRetirementData(json.result);
      setRetirementInputs(json.inputs);
    } catch (e) {
      console.error(e);
    } finally {
      setRetirementLoading(false);
    }
  };

  const previewTimerRef = useRef(null);
  const handleRetirementPreview = (newInputs) => {
    setRetirementInputs(newInputs);
    if (previewTimerRef.current) {
      clearTimeout(previewTimerRef.current);
    }
    previewTimerRef.current = setTimeout(async () => {
      const payload = { ...newInputs };
      for (const [k, v] of Object.entries(payload)) {
        if (v === "") payload[k] = 0;
      }
      try {
        const res = await fetch("/api/retirement/preview", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const json = await res.json();
        if (json.result) {
          setRetirementData(json.result);
        }
      } catch (e) {
        console.error(e);
      }
    }, 300);
  };

  const handleSaveRetirement = async () => {
    if (!retirementInputs) return;
    setSavingRetirement(true);
    try {
      const res = await fetch("/api/retirement", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(retirementInputs),
      });
      const json = await res.json();
      setRetirementData(json.result);
      showToast("Saved customized retirement parameters!");
    } catch (e) {
      showToast("Failed to save retirement plan", "error");
    } finally {
      setSavingRetirement(false);
    }
  };

  const handleResetRetirement = async () => {
    try {
      const res = await fetch("/api/retirement/reset", { method: "POST" });
      const json = await res.json();
      setRetirementData(json.result);
      setRetirementInputs(json.inputs);
      showToast("Reset retirement inputs to financial database defaults.");
    } catch (e) {
      showToast("Reset failed", "error");
    }
  };

  // Mortgage & Tax Tracker API handlers
  const fetchMortgage = async () => {
    setMortgageLoading(true);
    try {
      const res = await fetch("/api/mortgage");
      const json = await res.json();
      setMortgageData(json);
      setMortgageInputs(json.inputs);
    } catch (e) {
      console.error(e);
    } finally {
      setMortgageLoading(false);
    }
  };

  const mortgagePreviewTimerRef = useRef(null);
  const handleMortgagePreview = (newInputs) => {
    setMortgageInputs(newInputs);
    if (mortgagePreviewTimerRef.current) {
      clearTimeout(mortgagePreviewTimerRef.current);
    }
    mortgagePreviewTimerRef.current = setTimeout(async () => {
      const payload = { ...newInputs };
      for (const [k, v] of Object.entries(payload)) {
        if (v === "") payload[k] = 0;
      }
      try {
        const res = await fetch("/api/mortgage/preview", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const json = await res.json();
        if (json.active_plan) {
          setMortgageData(json);
        }
      } catch (e) {
        console.error(e);
      }
    }, 220);
  };

  const handleSaveMortgage = async (overrideInputs = null) => {
    const payload = overrideInputs || mortgageInputs;
    if (!payload) return;
    setSavingMortgage(true);
    try {
      const res = await fetch("/api/mortgage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (json.result) {
        setMortgageData(json.result);
        setMortgageInputs(json.result.inputs);
      }
      showToast("Saved Mortgage & Tax Paydown strategy!");
    } catch (e) {
      showToast("Failed to save mortgage strategy", "error");
    } finally {
      setSavingMortgage(false);
    }
  };

  const handleResetMortgage = async () => {
    try {
      const res = await fetch("/api/mortgage/reset", { method: "POST" });
      const json = await res.json();
      if (json.result) {
        setMortgageData(json.result);
        setMortgageInputs(json.result.inputs);
      }
      showToast("Reset mortgage model to baseline defaults!");
    } catch (e) {
      showToast("Failed to reset mortgage inputs", "error");
    }
  };

  const handleSyncMortgageSheet = async () => {
    setSyncingMortgageSheet(true);
    try {
      const res = await fetch("/api/mortgage/sync-gsheets", { method: "POST" });
      const json = await res.json();
      if (json.status === "ok" && json.result) {
        setMortgageData(json.result);
        setMortgageInputs(json.result.inputs);
        showToast(`Synced ${json.synced_months_count || 0} months of excess payments from linked spreadsheet!`);
      } else {
        showToast(json.error || "Could not sync from spreadsheet", "error");
      }
    } catch (e) {
      showToast("Spreadsheet sync error", "error");
    } finally {
      setSyncingMortgageSheet(false);
    }
  };

  const fetchTransactions = async (forceFresh = false) => {
    if (!forceFresh && txAllCacheRef.current) {
      setTransactions((prev) => (prev === txAllCacheRef.current ? prev : txAllCacheRef.current));
      return;
    }
    const res = await fetch("/api/transactions?limit=1500");
    const json = await res.json();
    const list = json.transactions || [];
    txAllCacheRef.current = list;
    setTransactions(list);
  };

  const fetchRules = async () => {
    const res = await fetch("/api/rules");
    const json = await res.json();
    setRules(json.rules || []);
  };

  const fetchSyncStatus = async () => {
    const res = await fetch("/api/sync/status");
    const json = await res.json();
    setSyncStatus(json);
    if (json.teller_app_id && !tellerAppId) {
      setTellerAppId(json.teller_app_id);
    }
  };

  const fetchReflections = async () => {
    try {
      const res = await fetch("/api/reflections");
      const json = await res.json();
      setReflectionsData(json);
    } catch (e) {
      console.error(e);
    }
  };

  const handleSaveReflection = async (merchant, updates) => {
    try {
      const res = await fetch("/api/reflections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ merchant, ...updates }),
      });
      const json = await res.json();
      setReflectionsData(json);
      setEditingReflectionMerch(null);
      showToast(`Saved your spending reflection for ${merchant}!`);
    } catch (e) {
      showToast("Could not save reflection", "error");
    }
  };

  const handleSaveMajorVerdict = async (txId, verdict, projectGroup = "") => {
    try {
      await fetch("/api/major-verdict", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tx_id: txId, verdict, project_group: projectGroup }),
      });
      await fetchReflections();
      showToast("Updated major purchase classification!");
    } catch (e) {
      showToast("Failed to update major purchase", "error");
    }
  };

  const handleAddPlannedPurchase = async (e) => {
    e.preventDefault();
    if (!newPlannedBuy.name || !newPlannedBuy.estimated_cost) return;
    try {
      await fetch("/api/planned-purchases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...newPlannedBuy,
          estimated_cost: parseFloat(newPlannedBuy.estimated_cost || 0),
        }),
      });
      setNewPlannedBuy({
        name: "",
        category: "Home & Upgrades",
        estimated_cost: "",
        target_ym: "2027-03",
        priority: "medium",
        notes: "",
      });
      await fetchReflections();
      showToast("Added to your Major Purchase Plan!");
    } catch (e) {
      showToast("Failed to save planned purchase", "error");
    }
  };

  const handleDeletePlannedPurchase = async (id) => {
    try {
      await fetch(`/api/planned-purchases?id=${id}`, { method: "DELETE" });
      await fetchReflections();
      showToast("Removed planned purchase");
    } catch (e) {
      showToast("Failed to remove planned purchase", "error");
    }
  };

  useEffect(() => {
    fetchDashboard(selectedMonth, selectedInstitution);
  }, [selectedMonth, selectedInstitution]);

  // Background idle pre-warm of sibling heavy tabs so tab switches feel instant (0ms)
  useEffect(() => {
    if (!dashboard || prewarmStartedRef.current) return;
    prewarmStartedRef.current = true;
    const t = setTimeout(() => {
      if (!mortgageData) fetchMortgage();
      if (!reflectionsData) fetchReflections();
      if (!retirementData) fetchRetirement();
      if (!txAllCacheRef.current) fetchTransactions();
    }, 180);
    return () => clearTimeout(t);
  }, [dashboard]);

  useEffect(() => {
    if (activeTab === "transactions") {
      fetchTransactions();
      if (rules.length === 0) fetchRules();
    } else if (activeTab === "retirement" && !retirementData) {
      fetchRetirement();
    } else if (activeTab === "mortgage" && !mortgageData) {
      fetchMortgage();
    } else if (activeTab === "excess" && !reflectionsData) {
      fetchReflections();
    }
    if (drawerOpen) {
      fetchSyncStatus();
    }
  }, [activeTab, drawerOpen, selectedMonth, selectedInstitution]);

  const handleSyncAll = async () => {
    setSyncingAll(true);
    try {
      const res = await fetch("/api/sync/all", { method: "POST" });
      const json = await res.json();
      const s = json.summary || {};
      showToast(
        `Synced ${s.teller_accounts + s.simplefin_accounts} accounts, ${s.new_transactions} new txns, and ${s.market_prices} live stock prices!`
      );
      invalidateCaches();
      fetchDashboard(selectedMonth, selectedInstitution, true);
      if (drawerOpen) fetchSyncStatus();
    } catch (e) {
      showToast("Sync error", "error");
    } finally {
      setSyncingAll(false);
    }
  };

  const handleSyncMarketPrices = async () => {
    setSyncingPrices(true);
    try {
      const res = await fetch("/api/sync/market-prices", { method: "POST" });
      const json = await res.json();
      const cnt = json.result?.updated || 0;
      showToast(`Updated live market prices for ${cnt} holdings via Yahoo Finance!`);
      invalidateCaches();
      fetchDashboard(selectedMonth, selectedInstitution, true);
    } catch (e) {
      showToast("Could not reach Yahoo Finance API", "error");
    } finally {
      setSyncingPrices(false);
    }
  };

  const handleSaveBudget = async (category) => {
    await fetch("/api/budgets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ category, monthly_limit: parseFloat(editingBudgetVal || 0) }),
    });
    setEditingBudgetCat(null);
    showToast(`Updated monthly budget for ${category}`);
    invalidateCaches();
    fetchDashboard(selectedMonth, selectedInstitution, true);
  };

  const handleUpdateTxCategory = async (tx, newCat, createRule = false) => {
    await fetch(`/api/transactions/${tx.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ category: newCat, merchant: tx.merchant, create_rule: createRule }),
    });
    showToast(createRule ? `Categorized & saved auto-rule for "${tx.merchant}"` : `Updated category to ${newCat}`);
    invalidateCaches();
    fetchTransactions(true);
    fetchDashboard(selectedMonth, selectedInstitution, true);
    if (inspectedMonth) fetchMonthDetail(inspectedMonth, selectedInstitution, true);
    if (createRule) fetchRules();
  };

  const handleAddRule = async (e) => {
    e.preventDefault();
    if (!newRule.keyword) return;
    const res = await fetch("/api/rules", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(newRule),
    });
    const json = await res.json();
    setNewRule({ keyword: "", merchant_name: "", category: "Shopping", tx_type: "expense" });
    showToast(`Rule saved! Recategorized ${json.transactions_updated} matching transactions.`);
    invalidateCaches();
    fetchRules();
    fetchTransactions(true);
    fetchDashboard(selectedMonth, selectedInstitution, true);
  };

  const handleDeleteRule = async (id) => {
    await fetch(`/api/rules/${id}`, { method: "DELETE" });
    fetchRules();
    showToast("Rule removed.");
  };

  const handleFileUpload = async (e) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    const formData = new FormData();
    for (let i = 0; i < files.length; i++) {
      formData.append("files", files[i]);
    }
    formData.append("institution", uploadInstitution);
    const res = await fetch("/api/import/upload", { method: "POST", body: formData });
    const json = await res.json();
    if (json.results) {
      const totalImp = json.results.reduce((a, b) => a + (b.imported || 0), 0);
      const totalSkip = json.results.reduce((a, b) => a + (b.skipped || 0), 0);
      showToast(`Imported ${totalImp} records (${totalSkip} duplicates skipped)!`);
      invalidateCaches();
      fetchDashboard(selectedMonth, selectedInstitution, true);
      if (drawerOpen) fetchSyncStatus();
    }
    e.target.value = "";
  };

  const handleScanDownloads = async () => {
    const res = await fetch("/api/import/scan-downloads", { method: "POST" });
    const json = await res.json();
    const totalImp = (json.results || []).reduce((a, b) => a + (b.imported || 0), 0);
    showToast(`Scanned Windows Downloads folder: imported ${totalImp} records!`);
    invalidateCaches();
    fetchDashboard(selectedMonth, selectedInstitution, true);
    if (drawerOpen) fetchSyncStatus();
  };

  const handleAddTransaction = async (e) => {
    e.preventDefault();
    if (!newTx.account_id || !newTx.description || !newTx.amount) return;
    await fetch("/api/transactions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(newTx),
    });
    setNewTx({ ...newTx, description: "", amount: "" });
    showToast("Transaction added!");
    invalidateCaches();
    fetchTransactions(true);
    fetchDashboard(selectedMonth, selectedInstitution, true);
  };

  const handleAddHolding = async (e) => {
    e.preventDefault();
    if (!newHolding.account_id || !newHolding.symbol || !newHolding.shares) return;
    await fetch("/api/holdings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(newHolding),
    });
    setNewHolding({ account_id: "", symbol: "", name: "", shares: "", current_price: "", cost_basis_total: "" });
    setShowHoldingModal(false);
    showToast("Investment holding saved!");
    invalidateCaches();
    fetchDashboard(selectedMonth, selectedInstitution, true);
  };

  const handleAddAccount = async (e) => {
    e.preventDefault();
    if (!newAccount.name) return;
    await fetch("/api/accounts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(newAccount),
    });
    setNewAccount({ name: "", institution: "Chase", account_type: "credit_card", balance: "", credit_limit: "" });
    showToast("Account added!");
    invalidateCaches();
    fetchDashboard(selectedMonth, selectedInstitution, true);
  };

  const handleDeleteTransaction = async (txId) => {
    if (!window.confirm("Are you sure you want to delete this transaction?")) return;
    try {
      await fetch(`/api/transactions/${txId}`, { method: "DELETE" });
      showToast("Transaction deleted");
      invalidateCaches();
      fetchTransactions(true);
      fetchDashboard(selectedMonth, selectedInstitution, true);
      if (inspectedMonth) fetchMonthDetail(inspectedMonth, selectedInstitution, true);
    } catch (e) {
      showToast("Failed to delete transaction", "error");
    }
  };

  const handleMonthStep = (direction) => {
    if (!dashboard || !dashboard.available_months) return;
    const months = dashboard.available_months;
    const currentIdx = months.indexOf(selectedMonth);
    if (currentIdx === -1) return;
    const newIdx = currentIdx + direction; // +1 for older month, -1 for newer month
    if (newIdx >= 0 && newIdx < months.length) {
      setSelectedMonth(months[newIdx]);
    }
  };
  shortcutRef.current.stepMonth = handleMonthStep;

  if (loading || !dashboard) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950 text-slate-200">
        <div className="text-center space-y-3">
          <div className="w-10 h-10 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto"></div>
          <p className="text-sm font-medium text-slate-400">Loading FinPulse Intelligence Engine...</p>
        </div>
      </div>
    );
  }

  const {
    meta,
    ui_profile: uiProfile = {},
    net_worth,
    kpis,
    cashflow,
    monthly_spending_explorer,
    spending,
    recurring,
    anomalies,
    duplicates,
    investments,
    insights,
    accounts,
    available_months,
  } = dashboard;

  const partnerName = uiProfile.partner_name || "Partner";
  const payrollLabel = uiProfile.payroll_label || "Primary Payroll";
  const partnerIncomeLabel = uiProfile.partner_income_label || `${partnerName} Housing Share`;
  const partnerExpected = Number(uiProfile.partner_expected_total || 0);
  const partnerMortExp = Number(uiProfile.partner_expected_mortgage || 0);
  const partnerHoaExp = Number(uiProfile.partner_expected_hoa || 0);
  const homeShort = uiProfile.home_address_short || "Primary Residence";
  const homeFull = uiProfile.home_address || net_worth.home_address || "Primary Residence";
  const homeNeighborhood = uiProfile.neighborhood || "Residential Neighborhood";
  const rsuSym = uiProfile.rsu_symbol || "RSU";
  const rsuCompanyLabel = uiProfile.rsu_company_label || "Employer Equity";
  const employerShort = uiProfile.employer_short || uiProfile.employer_name || "Employer";
  const extraFrom = uiProfile.extra_principal_account_label || "Brokerage Account";
  const extraMerch = uiProfile.extra_principal_merchant || "Extra Mortgage Principal";
  const secularHomeCfg = Number(uiProfile.secular_home_value || net_worth.home_value || 0);
  const compsHomeCfg = Number(uiProfile.comps_home_value || net_worth.home_value_comps || secularHomeCfg);
  const gw = uiProfile.gain_weights || { equity_awards_pct: 0.20, retirement_401k_pct: 0.40, brokerage_hsa_pct: 0.40 };
  const isWaTax = Boolean(uiProfile.wa_state_tax_context);

  const currentMonthIdx = available_months.indexOf(selectedMonth);
  const canGoPrev = currentMonthIdx < available_months.length - 1;
  const canGoNext = currentMonthIdx > 0;

  // Interactive Monthly Spending & Cash Flow Explorer Data
  const explorerRawMonths = monthly_spending_explorer?.months || [];
  const explorerMonths = explorerRawMonths.filter((m) => m.total_spend > 0 || m.income > 0);
  const explorerCategories = (monthly_spending_explorer?.categories_order || []).filter(
    (c) => !(excludeHousingOnGraph && c === "Housing")
  );

  const getAdjustedMonthSpend = (m) => {
    if (!m) return 0;
    if (excludeHousingOnGraph) return Number(m.ex_housing_spend || 0);
    if (netPartnerMode) return Number(m.spend_net_partner || m.total_spend || 0);
    return Number(m.total_spend || 0);
  };

  const explorerChartData = (() => {
    const labels = explorerMonths.map((m) => m.label || m.month);
    if (explorerChartMode === "stacked") {
      const ds = explorerCategories.map((cat, idx) => ({
        label: cat === "Housing" && netPartnerMode ? `Housing (Net of ${partnerName})` : cat,
        rawCategory: cat,
        data: explorerMonths.map((m) => {
          const rawVal = Number(m.by_category?.[cat] || 0);
          if (cat === "Housing" && netPartnerMode) {
            return Number(m.net_housing_spend !== undefined ? m.net_housing_spend : Math.max(0, rawVal - partnerExpected));
          }
          return rawVal;
        }),
        backgroundColor: getCategoryColor(cat, idx),
        borderRadius: 3,
        stack: "spend",
      }));
      if (showExtraPrincipalOnGraph) {
        ds.push({
          label: "Extra Mortgage Principal",
          rawCategory: "Housing",
          data: explorerMonths.map((m) => Number(m.fidelity_extra_principal || 0)),
          backgroundColor: "#a855f7",
          borderRadius: 3,
          stack: "spend",
        });
      }
      return { labels, datasets: ds };
    }
    if (explorerChartMode === "income") {
      return {
        labels,
        datasets: [
          {
            label: payrollLabel,
            data: explorerMonths.map((m) => Number(m.income_breakdown?.payroll || 0)),
            backgroundColor: "#10b981",
            borderRadius: 4,
            stack: "inc",
          },
          {
            label: partnerIncomeLabel,
            data: explorerMonths.map((m) => Number(m.income_breakdown?.partner_reimbursement || 0)),
            backgroundColor: "#06b6d4",
            borderRadius: 4,
            stack: "inc",
          },
          {
            label: "Other Peer Transfers",
            data: explorerMonths.map((m) => Number(m.income_breakdown?.other_transfers || 0)),
            backgroundColor: "#6366f1",
            borderRadius: 4,
            stack: "inc",
          },
          {
            label: "Dividends, Interest & Rewards",
            data: explorerMonths.map(
              (m) =>
                Number(m.income_breakdown?.dividends_interest || 0) +
                Number(m.income_breakdown?.other_income || 0)
            ),
            backgroundColor: "#f59e0b",
            borderRadius: 4,
            stack: "inc",
          },
        ],
      };
    }
    if (explorerChartMode === "total") {
      const ds = [
        {
          label: excludeHousingOnGraph
            ? "Lifestyle Spend (Ex-Housing)"
            : netPartnerMode
            ? `Monthly Spend (Net of ${partnerName})`
            : "Gross Monthly Spend",
          data: explorerMonths.map((m) => getAdjustedMonthSpend(m)),
          backgroundColor: explorerMonths.map((m) =>
            m.month === (inspectedMonth || selectedMonth) ? "#10b981" : "#6366f1"
          ),
          borderRadius: 6,
          stack: "tot",
        },
      ];
      if (showExtraPrincipalOnGraph) {
        ds.push({
          label: "Extra Mortgage Principal",
          data: explorerMonths.map((m) => Number(m.fidelity_extra_principal || 0)),
          backgroundColor: "#a855f7",
          borderRadius: 6,
          stack: "tot",
        });
      }
      // Benchmark overlays: 3-month rolling average + 12-month mean (context for every bar)
      const spendVals = explorerMonths.map((m) => getAdjustedMonthSpend(m));
      if (spendVals.length >= 3) {
        const rolling = spendVals.map((_, i) => {
          if (i < 2) return null;
          return Math.round((spendVals[i] + spendVals[i - 1] + spendVals[i - 2]) / 3);
        });
        const mean = spendVals.reduce((a, b) => a + b, 0) / spendVals.length;
        ds.push({
          type: "line",
          label: "3-Mo Rolling Avg",
          data: rolling,
          borderColor: "#f59e0b",
          backgroundColor: "#f59e0b",
          borderWidth: 2.5,
          pointRadius: 2,
          tension: 0.35,
          fill: false,
          stack: "bench-roll",
          order: -1,
        });
        ds.push({
          type: "line",
          label: `12-Mo Mean (${fmtCompact(mean)})`,
          data: spendVals.map(() => Math.round(mean)),
          borderColor: isDark ? "#94a3b8" : "#64748b",
          backgroundColor: "transparent",
          borderDash: [6, 5],
          borderWidth: 1.5,
          pointRadius: 0,
          fill: false,
          stack: "bench-mean",
          order: -2,
        });
      }
      return { labels, datasets: ds };
    }
    // Default: "cashflow" (Income vs. Spending vs. Extra Principal vs. Net Cash Flow)
    const datasets = [
      {
        label: `Total Income (Payroll + ${partnerName})`,
        data: explorerMonths.map((m) => m.income),
        backgroundColor: "#10b981",
        borderRadius: 5,
      },
      {
        label: excludeHousingOnGraph
          ? "Spending (Ex-Housing)"
          : netPartnerMode
          ? `Spending (Net of ${partnerName})`
          : "Gross Spending",
        data: explorerMonths.map((m) => getAdjustedMonthSpend(m)),
        backgroundColor: "#6366f1",
        borderRadius: 5,
      },
    ];
    if (showExtraPrincipalOnGraph) {
      datasets.push({
        label: "Extra Principal Paydown",
        data: explorerMonths.map((m) => Number(m.fidelity_extra_principal || 0)),
        backgroundColor: "#a855f7",
        borderRadius: 5,
      });
    }
    datasets.push({
      label: "Operating Net Cash Flow",
      data: explorerMonths.map((m) => Number(m.net_savings || 0)),
      backgroundColor: "#38bdf8",
      borderRadius: 5,
    });
    return { labels, datasets };
  })();

  const handleExplorerChartClick = ({ index, datasetLabel, clickedDirectly }) => {
    const targetObj = explorerMonths[index];
    if (!targetObj) return;
    const clickedYm = targetObj.month;
    if (explorerChartMode === "stacked" && clickedDirectly && datasetLabel) {
      const cleanCat = datasetLabel.startsWith("Housing")
        ? "Housing"
        : datasetLabel.includes("Extra Principal")
        ? "Housing"
        : datasetLabel;
      const key = `explorer-${clickedYm}-${cleanCat}`;
      openMonthInspector(clickedYm, {
        key,
        inspectorType: "cashflow",
        category: cleanCat,
        txFilter: datasetLabel.includes("Extra Principal") ? "principal" : cleanCat === "Housing" ? "housing" : "lifestyle",
      });
    } else if (explorerChartMode === "income") {
      openMonthInspector(clickedYm, {
        key: `explorer-inc-${clickedYm}`,
        inspectorType: "cashflow",
        category: null,
        txFilter: "income",
      });
    } else {
      openMonthInspector(clickedYm, {
        key: `explorer-${clickedYm}-all`,
        inspectorType: "cashflow",
        category: null,
        txFilter: "all",
      });
    }
  };

  // Net Worth History Series, Sub-Curve Attribution & Chart Data (using profile-driven comps)
  const rawNwMonthly = net_worth.history?.monthly || [];
  const nwMonthly = (() => {
    const compsByYm = uiProfile.comps_home_value_by_ym || {};
    let cInc = 0, cRet = 0, cMkt = 0, cRed = 0, cDebt = 0, cHomeSec = 0, cHomeComps = 0, cNwSec = 0, cNwComps = 0;
    return rawNwMonthly.map((m, idx) => {
      if (m.cum_income_saved !== undefined && m.cum_income_saved !== null) {
        return m;
      }
      const prev = idx > 0 ? rawNwMonthly[idx - 1] : m;
      const cashV = Number(m.cash || 0), invV = Number(m.investments || 0), debtV = Number(m.debt || 0);
      const nwSec = Number(m.net_worth_secular || m.net_worth || 0);
      const homeSec = Number(m.home_value_secular || m.home_value || Math.max(0, nwSec + debtV - cashV - invV));
      const homeComps = Number(m.home_value_comps || compsByYm[m.month] || compsHomeCfg || homeSec);
      const nwComps = Number(m.net_worth_comps || (cashV + invV + homeComps - debtV));
      const prevCash = Number(prev.cash || 0), prevInv = Number(prev.investments || 0), prevDebt = Number(prev.debt || 0);
      const prevNwSec = Number(prev.net_worth_secular || prev.net_worth || nwSec);
      const prevHomeSec = Number(prev.home_value_secular || prev.home_value || Math.max(0, prevNwSec + prevDebt - prevCash - prevInv));
      const prevHomeComps = Number(prev.home_value_comps || compsByYm[prev.month] || homeComps);
      const prevNwComps = Number(prev.net_worth_comps || (prevCash + prevInv + prevHomeComps - prevDebt));
      let incMom = 0, retMom = 0, mktMom = 0, debtPayMom = 0, redMom = 0, hSecMom = 0, hCompsMom = 0, nwSecMom = 0, nwCompsMom = 0;
      let fidExMom = 0, schedPrinMom = 0;
      if (idx > 0) {
        nwSecMom = nwSec - prevNwSec;
        nwCompsMom = nwComps - prevNwComps;
        debtPayMom = prevDebt - debtV;
        redMom = -debtPayMom;
        const extraP = Number(m.extra_principal_paid || 0);
        fidExMom = extraP > 0 ? Math.min(extraP, Math.max(0, debtPayMom)) : 0;
        schedPrinMom = debtPayMom - fidExMom;
        const grossLiq = (cashV - prevCash) + (invV - prevInv) + debtPayMom;
        retMom = incMom + redMom;
        mktMom = grossLiq - incMom;
        hSecMom = homeSec - prevHomeSec;
        hCompsMom = homeComps - prevHomeComps;
        cInc += incMom; cRet += retMom; cMkt += mktMom; cRed += redMom; cDebt += debtPayMom;
        cHomeSec += hSecMom; cHomeComps += hCompsMom; cNwSec += nwSecMom; cNwComps += nwCompsMom;
      }
      return {
        ...m,
        net_worth_secular: nwSec,
        net_worth_comps: nwComps,
        home_value_secular: homeSec,
        home_value_comps: homeComps,
        home_equity_secular: Math.max(0, homeSec - debtV),
        home_equity_comps: Math.max(0, homeComps - debtV),
        mom_diff_secular: nwSecMom,
        mom_diff_comps: nwCompsMom,
        income_saved_mom: incMom,
        income_retained_liquid_mom: retMom,
        vested_rsu_net_mom: 0,
        retirement_401k_contrib_mom: 0,
        net_cash_savings_mom: 0,
        market_growth_mom: mktMom,
        equity_awards_gain_mom: mktMom * Number(gw.equity_awards_pct || 0.2),
        retirement_401k_gain_mom: mktMom * Number(gw.retirement_401k_pct || 0.4),
        brokerage_hsa_gain_mom: mktMom * Number(gw.brokerage_hsa_pct || 0.4),
        portfolio_redemption_mom: redMom,
        debt_paydown_mom: debtPayMom,
        extra_principal_mom: fidExMom,
        scheduled_principal_mom: schedPrinMom,
        home_price_secular_mom: hSecMom,
        home_price_comps_mom: hCompsMom,
        cum_nw_change_secular: cNwSec,
        cum_nw_change_comps: cNwComps,
        cum_income_saved: cInc,
        cum_income_retained_liquid: cRet,
        cum_market_growth: cMkt,
        cum_portfolio_redemptions: cRed,
        cum_debt_paydown: cDebt,
        cum_home_price_secular: cHomeSec,
        cum_home_price_comps: cHomeComps,
        cum_home_equity_gain_secular: cDebt + cHomeSec,
        cum_home_equity_gain_comps: cDebt + cHomeComps,
      };
    });
  })();
  const nwSubcurveSummary = net_worth.history?.subcurve_summary || {};
  const nwFirst = nwMonthly[0] || {};
  const nwLatest = nwMonthly[nwMonthly.length - 1] || {};
  const momMonths = nwMonthly.slice(1);
  const momIntervals = Math.max(1, momMonths.length);
  const isCompsHomeMode = homeValuationMode === "comps_cooling";
  const activeNwTotal = isCompsHomeMode
    ? Number(net_worth.total_net_worth_comps || nwLatest.net_worth_comps || net_worth.total || 0)
    : Number(net_worth.total || nwLatest.net_worth_secular || 0);
  const startNwTotal = isCompsHomeMode
    ? Number(nwFirst.net_worth_comps || nwFirst.net_worth || activeNwTotal)
    : Number(nwFirst.net_worth_secular || nwFirst.net_worth || activeNwTotal);
  const nw12mDiff = activeNwTotal - startNwTotal;
  const nw12mPct = startNwTotal ? ((nw12mDiff / Math.abs(startNwTotal)) * 100).toFixed(1) : "0.0";
  const nwAvgMom = nw12mDiff / momIntervals;

  const totalIncSaved = Number(
    nwSubcurveSummary.total_income_saved ?? nwLatest.cum_income_saved ?? 0
  );
  const totalMktGrowth = Number(
    nwSubcurveSummary.total_market_growth ?? nwLatest.cum_market_growth ?? 0
  );
  const totalDebtPaydown = Number(
    nwSubcurveSummary.total_debt_paydown ?? nwLatest.cum_debt_paydown ?? 0
  );
  const totalHomePrice = Number(
    isCompsHomeMode
      ? (nwSubcurveSummary.total_home_price_comps ?? nwLatest.cum_home_price_comps ?? 0)
      : (nwSubcurveSummary.total_home_price_secular ?? nwLatest.cum_home_price_secular ?? 0)
  );
  const totalRsuNet = momMonths.reduce((s, m) => s + Number(m.vested_rsu_net_mom || 0), 0);
  const total401k = momMonths.reduce((s, m) => s + Number(m.retirement_401k_contrib_mom || 0), 0);
  const totalCashSaved = totalIncSaved - totalRsuNet - total401k;

  const bestMomRow = momMonths.reduce((best, m) => {
    const v = Number(isCompsHomeMode ? m.mom_diff_comps : m.mom_diff_secular || 0);
    const bv = best ? Number(isCompsHomeMode ? best.mom_diff_comps : best.mom_diff_secular || 0) : -Infinity;
    return v > bv ? m : best;
  }, momMonths[0] || null);
  const bestMomVal = bestMomRow
    ? Number(isCompsHomeMode ? bestMomRow.mom_diff_comps : bestMomRow.mom_diff_secular || 0)
    : 0;
  const latestMomVal = Number(isCompsHomeMode ? nwLatest?.mom_diff_comps : nwLatest?.mom_diff_secular || 0);

  const nwCumSeriesTotal = nwMonthly.map((m) =>
    Number(isCompsHomeMode ? m.net_worth_comps || m.net_worth : m.net_worth_secular || m.net_worth || 0)
  );
  const nwCumSeriesWithMkt = nwMonthly.map(
    (m) => Math.round((startNwTotal + Number(m.cum_income_saved || 0) + Number(m.cum_market_growth || 0)) * 100) / 100
  );
  const nwCumSeriesEarned = nwMonthly.map(
    (m) => Math.round((startNwTotal + Number(m.cum_income_saved || 0)) * 100) / 100
  );
  const nwCumVals = [...nwCumSeriesTotal, ...nwCumSeriesWithMkt, ...nwCumSeriesEarned, startNwTotal].filter((v) =>
    Number.isFinite(v)
  );
  const nwCumSuggestedMin = nwCumVals.length
    ? Math.floor((Math.min(...nwCumVals) - 60000) / 100000) * 100000
    : 0;

  const nwCumulativeSummaryChartData = {
    labels: nwMonthly.map((m) => m.label || m.month),
    datasets: [
      {
        label: "Total Net Worth",
        data: nwCumSeriesTotal,
        borderColor: "#10b981",
        backgroundColor: "rgba(16, 185, 129, 0.11)",
        fill: true,
        borderWidth: 3.2,
        tension: 0.3,
        pointRadius: 4,
        pointHoverRadius: 6.5,
        pointBackgroundColor: "#10b981",
      },
      {
        label: "Start + Earned + Market",
        data: nwCumSeriesWithMkt,
        borderColor: "#a855f7",
        backgroundColor: "transparent",
        borderWidth: 2.2,
        tension: 0.3,
        pointRadius: 2.5,
      },
      {
        label: "Start + Earned & RSUs Only",
        data: nwCumSeriesEarned,
        borderColor: "#38bdf8",
        backgroundColor: "transparent",
        borderWidth: 2.2,
        borderDash: [5, 3],
        tension: 0.3,
        pointRadius: 2.5,
      },
      {
        label: `${nwFirst.label || "Nov '25"} Baseline`,
        data: nwMonthly.map(() => startNwTotal),
        borderColor: "#64748b",
        backgroundColor: "transparent",
        borderWidth: 1.4,
        borderDash: [3, 4],
        pointRadius: 0,
        pointHoverRadius: 0,
      },
    ],
  };

  const nwMonthlyChangeChartData = {
    labels: momMonths.map((m) => m.label || m.month),
    datasets: [
      {
        type: "line",
        label: "Net Monthly Change",
        stack: "net_line",
        order: -1,
        data: momMonths.map((m) => Number(isCompsHomeMode ? m.mom_diff_comps : m.mom_diff_secular || 0)),
        borderColor: "#10b981",
        backgroundColor: "#10b981",
        borderWidth: 2.4,
        pointRadius: 4,
        pointHoverRadius: 6,
        tension: 0.25,
        fill: false,
      },
      {
        label: "Earned & RSUs",
        stack: "drivers",
        data: momMonths.map((m) => Number(m.income_saved_mom || 0)),
        backgroundColor: "#38bdf8",
        borderRadius: 3,
      },
      {
        label: "Market Gain / Loss",
        stack: "drivers",
        data: momMonths.map((m) => Number(m.market_growth_mom || 0)),
        backgroundColor: "#a855f7",
        borderRadius: 3,
      },
      {
        label: "Home Value Δ",
        stack: "drivers",
        data: momMonths.map((m) =>
          Number(isCompsHomeMode ? m.home_price_comps_mom : m.home_price_secular_mom || 0)
        ),
        backgroundColor: isCompsHomeMode ? "#f43f5e" : "#6366f1",
        borderRadius: 3,
      },
    ],
  };

  const nwBalanceSheetChartData = {
    labels: nwMonthly.map((m) => m.label || m.month),
    datasets: [
      {
        type: "line",
        label: "Total Net Worth",
        stack: "nw_line",
        order: -1,
        data: nwCumSeriesTotal,
        borderColor: "#10b981",
        backgroundColor: "#10b981",
        borderWidth: 3,
        pointRadius: 3.5,
        tension: 0.28,
        fill: false,
      },
      {
        label: "Liquid Investments",
        stack: "bs",
        data: nwMonthly.map((m) => Number(m.investments || 0)),
        backgroundColor: "#6366f1",
        borderRadius: 3,
      },
      {
        label: isCompsHomeMode ? "Home Value (Comps)" : "Home Value (Trend)",
        stack: "bs",
        data: nwMonthly.map((m) =>
          Number(isCompsHomeMode ? m.home_value_comps || compsHomeCfg : m.home_value_secular || m.home_value || secularHomeCfg)
        ),
        backgroundColor: "#a855f7",
        borderRadius: 3,
      },
      {
        label: "Liquid Cash",
        stack: "bs",
        data: nwMonthly.map((m) => Number(m.cash || 0)),
        backgroundColor: "#0ea5e9",
        borderRadius: 3,
      },
      {
        label: "Mortgage & Card Debt",
        stack: "bs",
        data: nwMonthly.map((m) => -Math.abs(Number(m.debt || 0))),
        backgroundColor: "#f43f5e",
        borderRadius: 3,
      },
    ],
  };

  const renderNetWorthBreakdownSection = () => {
    const assetGroups = net_worth.asset_groups || [];
    const liabilityGroups = net_worth.liability_groups || [];
    const ms = net_worth.mortgage_summary || {};
    const isNwInspected = inspector?.type === "networth";
    const activeAssetsTotal = isCompsHomeMode
      ? Number(net_worth.cash || 0) +
        Number(net_worth.investments || 0) +
        Number(net_worth.home_value_comps || compsHomeCfg)
      : Number(net_worth.assets || 0);

    return (
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Left 8 Cols: Overall Net Worth Summary & Monthly Gains */}
        <div className="lg:col-span-8 card-panel rounded-2xl p-5 flex flex-col justify-between">
          <div>
            {/* Compact Header + Only 2 Controls */}
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="text-[11px] font-bold uppercase tracking-wider text-emerald-400">
                  Overall Net Worth Summary &amp; Wealth Drivers
                </div>
                <div className="flex flex-wrap items-center gap-2.5 mt-1">
                  <h2 className="text-lg font-extrabold text-white font-mono">
                    {fmtCurrency(startNwTotal)} → {fmtCurrency(activeNwTotal)}
                  </h2>
                  <span className="badge bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 font-mono">
                    {nw12mDiff >= 0 ? "+" : ""}{fmtCurrency(nw12mDiff)} ({nw12mDiff >= 0 ? "+" : ""}{nw12mPct}%)
                  </span>
                </div>
                <p className="text-xs text-slate-400 mt-0.5">
                  {nwFirst.label || "Start"} → {nwLatest.label || "Latest"} · Avg{" "}
                  <strong className={nwAvgMom >= 0 ? "text-emerald-400 font-mono" : "text-rose-400 font-mono"}>
                    {nwAvgMom >= 0 ? "+" : ""}{fmtCompact(nwAvgMom)}/mo
                  </strong>{" "}
                  gain over {momIntervals} months
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={() =>
                    setHomeValuationMode(isCompsHomeMode ? "secular_inflation" : "comps_cooling")
                  }
                  className={`px-2.5 py-1.5 rounded-xl text-[11px] font-bold border transition ${
                    isCompsHomeMode
                      ? "bg-amber-500/15 border-amber-500/40 text-amber-300"
                      : "bg-indigo-500/15 border-indigo-500/40 text-indigo-300"
                  }`}
                  title={`Switch home value between Trend (${fmtCompact(secularHomeCfg)}) and Local Comps (${fmtCompact(compsHomeCfg)})`}
                >
                  {isCompsHomeMode ? `Home: ${fmtCompact(compsHomeCfg)} Comps` : `Home: ${fmtCompact(secularHomeCfg)} Trend`}
                </button>

                <div className="flex items-center bg-slate-950 p-1 rounded-xl border border-slate-800">
                  {[
                    { id: "overview", label: "Overview" },
                    { id: "balance_sheet", label: "Assets vs. Debt" },
                    { id: "table", label: "Monthly Table" },
                  ].map((m) => (
                    <button
                      key={m.id}
                      onClick={() => setNwChartMode(m.id)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition ${
                        nwChartMode === m.id
                          ? "bg-indigo-600 text-white shadow"
                          : "text-slate-400 hover:text-slate-200"
                      }`}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* 4-Column 12-Month Wealth Bridge Strip */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 my-3.5">
              <div className="surface-inset rounded-xl p-3 border-l-4 border-l-slate-500">
                <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  {nwFirst.label || "Nov 2025"} Start
                </div>
                <div className="text-base font-extrabold font-mono text-white mt-0.5">
                  {fmtCompact(startNwTotal)}
                </div>
                <div className="text-[10px] text-slate-400 mt-0.5">Starting baseline</div>
              </div>

              <div
                onClick={() =>
                  toggleInspector({
                    key: "nw-bridge-income",
                    type: "networth",
                    driver: "income",
                    month: nwLatest.month,
                  })
                }
                className="surface-inset rounded-xl p-3 border-l-4 border-l-sky-400 cursor-pointer hover:border-sky-400 transition"
                title="Click to inspect Income, Vested RSUs & 401(k) contributions"
              >
                <div className="flex items-center justify-between gap-1 text-[10px] font-bold uppercase tracking-wider text-sky-400">
                  <span>+ Earned &amp; RSUs</span>
                  <span className="font-mono text-slate-400">
                    {totalIncSaved >= 0 ? "+" : ""}{fmtCompact(totalIncSaved / momIntervals)}/mo
                  </span>
                </div>
                <div className="text-base font-extrabold font-mono text-sky-300 mt-0.5">
                  {totalIncSaved >= 0 ? "+" : ""}{fmtCompact(totalIncSaved)}
                </div>
                <div className="text-[10px] text-slate-400 mt-0.5 truncate">
                  RSUs +{fmtCompact(totalRsuNet)} · 401k +{fmtCompact(total401k)} · Cash {totalCashSaved >= 0 ? "+" : ""}{fmtCompact(totalCashSaved)}
                </div>
              </div>

              <div
                onClick={() =>
                  toggleInspector({
                    key: "nw-bridge-market",
                    type: "networth",
                    driver: "market",
                    month: nwLatest.month,
                  })
                }
                className="surface-inset rounded-xl p-3 border-l-4 border-l-purple-400 cursor-pointer hover:border-purple-400 transition"
                title="Click to inspect portfolio market appreciation"
              >
                <div className="flex items-center justify-between gap-1 text-[10px] font-bold uppercase tracking-wider text-purple-400">
                  <span>+ Market Gains</span>
                  <span className="font-mono text-slate-400">
                    {totalMktGrowth >= 0 ? "+" : ""}{fmtCompact(totalMktGrowth / momIntervals)}/mo
                  </span>
                </div>
                <div className={`text-base font-extrabold font-mono mt-0.5 ${totalMktGrowth >= 0 ? "text-purple-300" : "text-rose-400"}`}>
                  {totalMktGrowth >= 0 ? "+" : ""}{fmtCompact(totalMktGrowth)}
                </div>
                <div className="text-[10px] text-slate-400 mt-0.5 truncate">
                  Appreciation &amp; dividends
                </div>
              </div>

              <div
                onClick={() =>
                  toggleInspector({
                    key: "nw-bridge-home",
                    type: "networth",
                    driver: "home",
                    month: nwLatest.month,
                  })
                }
                className={`surface-inset rounded-xl p-3 border-l-4 cursor-pointer transition ${
                  isCompsHomeMode
                    ? "border-l-rose-400 hover:border-rose-400"
                    : "border-l-indigo-400 hover:border-indigo-400"
                }`}
                title="Click to inspect home value & mortgage principal paydown"
              >
                <div className="flex items-center justify-between gap-1 text-[10px] font-bold uppercase tracking-wider text-indigo-300">
                  <span>{totalHomePrice >= 0 ? "+" : "−"} Home &amp; Equity</span>
                </div>
                <div className={`text-base font-extrabold font-mono mt-0.5 ${totalHomePrice >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                  {totalHomePrice >= 0 ? "+" : ""}{fmtCompact(totalHomePrice)}
                </div>
                <div className="text-[10px] text-slate-400 mt-0.5 truncate">
                  +{fmtCompact(totalDebtPaydown)} debt paid from liquid
                </div>
              </div>
            </div>

            {/* Chart / Table Views */}
            {nwChartMode === "overview" && (
              <div className="space-y-4">
                {/* Panel A: Overall Cumulative Net Worth Trajectory (starts at real NW, never $0) */}
                <div>
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-slate-300">
                      Cumulative Net Worth &amp; Source of Gains ({nwFirst.label || "Nov 2025"} → {nwLatest.label || "Oct 2026"})
                    </span>
                    <span className="text-[10px] text-slate-400">
                      Starts at real {fmtCompact(startNwTotal)} baseline · click any point to inspect
                    </span>
                  </div>
                  <ChartCanvas
                    type="line"
                    height={235}
                    isDark={isDark}
                    data={nwCumulativeSummaryChartData}
                    onElementClick={({ index }) => {
                      const m = nwMonthly[index];
                      if (m) {
                        setInspector({
                          key: `nw-month-${m.month}`,
                          type: "networth",
                          month: m.month,
                          driver: "all",
                        });
                      }
                    }}
                    options={{
                      scales: {
                        x: {
                          ticks: { color: isDark ? "#cbd5e1" : "#334155", font: { size: 11, weight: "600" } },
                          grid: { color: isDark ? "rgba(51,65,85,0.2)" : "rgba(226,232,240,0.8)" },
                        },
                        y: {
                          suggestedMin: nwCumSuggestedMin,
                          ticks: {
                            color: isDark ? "#94a3b8" : "#475569",
                            callback: (v) => fmtCompact(v),
                          },
                          grid: { color: isDark ? "rgba(51,65,85,0.25)" : "rgba(226,232,240,0.8)" },
                        },
                      },
                      plugins: {
                        legend: {
                          position: "bottom",
                          labels: { color: isDark ? "#cbd5e1" : "#334155", font: { size: 10.5 }, boxWidth: 11, padding: 10 },
                        },
                        tooltip: {
                          callbacks: {
                            afterTitle: (items) => {
                              const idx = items?.[0]?.dataIndex;
                              const m = nwMonthly[idx];
                              if (!m || idx === 0) return "";
                              const mom = Number(isCompsHomeMode ? m.mom_diff_comps : m.mom_diff_secular || 0);
                              return `MoM Change: ${mom >= 0 ? "+" : ""}${fmtCurrency(mom)}`;
                            },
                            label: (ctx) => {
                              const raw = Number(ctx.raw || 0);
                              return ` ${ctx.dataset.label}: ${fmtCurrency(raw)}`;
                            },
                          },
                        },
                      },
                    }}
                  />
                </div>

                {/* Panel B: Synchronized Month-by-Month Net Worth Change */}
                <div className="pt-3.5 border-t border-slate-800/80">
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-slate-300">
                      Month-by-Month Net Worth Change ({momMonths[0]?.label || "Dec 2025"} → {nwLatest.label || "Oct 2026"})
                    </span>
                    <span className="text-[10px] font-mono text-slate-400">
                      Peak: <strong className="text-emerald-400">{bestMomRow?.label || "—"} (+{fmtCompact(bestMomVal)})</strong>
                      {" · "}Latest:{" "}
                      <strong className={latestMomVal >= 0 ? "text-emerald-400" : "text-rose-400"}>
                        {latestMomVal >= 0 ? "+" : ""}{fmtCompact(latestMomVal)}
                      </strong>
                    </span>
                  </div>
                  <ChartCanvas
                    type="bar"
                    height={165}
                    isDark={isDark}
                    data={nwMonthlyChangeChartData}
                    onElementClick={({ index }) => {
                      const m = momMonths[index];
                      if (m) {
                        setInspector({
                          key: `nw-month-${m.month}`,
                          type: "networth",
                          month: m.month,
                          driver: "all",
                        });
                      }
                    }}
                    options={{
                      scales: {
                        x: {
                          stacked: true,
                          ticks: { color: isDark ? "#cbd5e1" : "#334155", font: { size: 10.5, weight: "600" } },
                          grid: { color: isDark ? "rgba(51,65,85,0.2)" : "rgba(226,232,240,0.8)" },
                        },
                        y: {
                          stacked: true,
                          ticks: {
                            color: isDark ? "#94a3b8" : "#475569",
                            callback: (v) => fmtCompact(v),
                          },
                          grid: { color: isDark ? "rgba(51,65,85,0.25)" : "rgba(226,232,240,0.8)" },
                        },
                      },
                      plugins: {
                        legend: {
                          position: "bottom",
                          labels: { color: isDark ? "#cbd5e1" : "#334155", font: { size: 10.5 }, boxWidth: 11, padding: 8 },
                        },
                        tooltip: {
                          callbacks: {
                            label: (ctx) => {
                              const raw = Number(ctx.raw || 0);
                              return ` ${ctx.dataset.label}: ${raw >= 0 ? "+" : ""}${fmtCurrency(raw)}`;
                            },
                          },
                        },
                      },
                    }}
                  />
                </div>
              </div>
            )}

            {nwChartMode === "balance_sheet" && (
              <div>
                <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-300">
                    Balance Sheet Composition: Assets vs. Shrinking Debt ({nwFirst.label || "Nov 2025"} → {nwLatest.label || "Oct 2026"})
                  </span>
                  <span className="text-[10px] font-mono text-slate-400">
                    Debt reduced by -{fmtCompact(totalDebtPaydown)} via Principal Paydowns
                  </span>
                </div>
                <ChartCanvas
                  type="bar"
                  height={355}
                  isDark={isDark}
                  data={nwBalanceSheetChartData}
                  onElementClick={({ index }) => {
                    const m = nwMonthly[index];
                    if (m) {
                      setInspector({
                        key: `nw-month-${m.month}`,
                        type: "networth",
                        month: m.month,
                        driver: "all",
                      });
                    }
                  }}
                  options={{
                    scales: {
                      x: {
                        stacked: true,
                        ticks: { color: isDark ? "#cbd5e1" : "#334155", font: { size: 11, weight: "600" } },
                        grid: { color: isDark ? "rgba(51,65,85,0.2)" : "rgba(226,232,240,0.8)" },
                      },
                      y: {
                        stacked: true,
                        ticks: {
                          color: isDark ? "#94a3b8" : "#475569",
                          callback: (v) => fmtCompact(v),
                        },
                        grid: { color: isDark ? "rgba(51,65,85,0.25)" : "rgba(226,232,240,0.8)" },
                      },
                    },
                    plugins: {
                      legend: {
                        position: "bottom",
                        labels: { color: isDark ? "#cbd5e1" : "#334155", font: { size: 10.5 }, boxWidth: 11, padding: 10 },
                      },
                      tooltip: {
                        callbacks: {
                          label: (ctx) => {
                            const raw = Number(ctx.raw || 0);
                            return ` ${ctx.dataset.label}: ${fmtCurrency(raw)}`;
                          },
                        },
                      },
                    },
                  }}
                />
              </div>
            )}

            {nwChartMode === "table" && (
              <div className="overflow-x-auto border border-slate-800 rounded-xl">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-slate-800 text-[10px] uppercase text-slate-400">
                      <th className="py-2.5 px-3">Month</th>
                      <th className="py-2.5 px-2.5 text-right">Net Worth</th>
                      <th className="py-2.5 px-2.5 text-right">MoM Δ</th>
                      <th className="py-2.5 px-2.5 text-right text-sky-400">Earned &amp; RSUs</th>
                      <th className="py-2.5 px-2.5 text-right text-purple-400">Market Gain/Loss</th>
                      <th className="py-2.5 px-2.5 text-right text-indigo-300">Home Value Δ</th>
                      <th className="py-2.5 px-3 text-right text-teal-400">Debt Paid (Transfer)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/70 font-mono">
                    {nwMonthly.map((m, idx) => {
                      const nwV = Number(isCompsHomeMode ? m.net_worth_comps || m.net_worth : m.net_worth_secular || m.net_worth || 0);
                      const momV = Number(isCompsHomeMode ? m.mom_diff_comps : m.mom_diff_secular || 0);
                      const incV = Number(m.income_saved_mom || 0);
                      const mktV = Number(m.market_growth_mom || 0);
                      const homeV = Number(isCompsHomeMode ? m.home_price_comps_mom : m.home_price_secular_mom || 0);
                      const debtV = Number(m.debt_paydown_mom || 0);
                      const isRowSel = inspector?.type === "networth" && inspector?.month === m.month;
                      return (
                        <tr
                          key={m.month}
                          onClick={() =>
                            setInspector({
                              key: `nw-month-${m.month}`,
                              type: "networth",
                              month: m.month,
                              driver: "all",
                            })
                          }
                          className={`cursor-pointer transition ${
                            isRowSel ? "bg-indigo-950/50" : "hover:bg-slate-900/60"
                          }`}
                        >
                          <td className="py-2 px-3 font-sans font-bold text-white whitespace-nowrap">
                            {m.label || m.month}
                            {idx === 0 && <span className="ml-1.5 text-[10px] font-normal text-slate-400">(Start)</span>}
                          </td>
                          <td className="py-2 px-2.5 text-right font-bold text-white">{fmtCurrency(nwV)}</td>
                          <td className={`py-2 px-2.5 text-right font-bold ${idx === 0 ? "text-slate-500" : momV >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                            {idx === 0 ? "—" : `${momV >= 0 ? "+" : ""}${fmtCurrency(momV)}`}
                          </td>
                          <td className="py-2 px-2.5 text-right text-sky-300">
                            {idx === 0 ? "—" : `${incV >= 0 ? "+" : ""}${fmtCurrency(incV)}`}
                          </td>
                          <td className={`py-2 px-2.5 text-right ${idx === 0 ? "text-slate-500" : mktV >= 0 ? "text-purple-300" : "text-rose-400"}`}>
                            {idx === 0 ? "—" : `${mktV >= 0 ? "+" : ""}${fmtCurrency(mktV)}`}
                          </td>
                          <td className={`py-2 px-2.5 text-right ${idx === 0 ? "text-slate-500" : homeV >= 0 ? "text-indigo-300" : "text-rose-400"}`}>
                            {idx === 0 ? "—" : `${homeV >= 0 ? "+" : ""}${fmtCurrency(homeV)}`}
                          </td>
                          <td className="py-2 px-3 text-right text-teal-300">
                            {idx === 0 ? "—" : `${debtV >= 0 ? "+" : ""}${fmtCurrency(debtV)}`}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-slate-700 bg-slate-900/70 font-mono font-extrabold text-xs">
                      <td className="py-2.5 px-3 font-sans text-white">12-Month Net Change</td>
                      <td className="py-2.5 px-2.5 text-right text-white">{fmtCurrency(activeNwTotal)}</td>
                      <td className={`py-2.5 px-2.5 text-right ${nw12mDiff >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                        {nw12mDiff >= 0 ? "+" : ""}{fmtCurrency(nw12mDiff)}
                      </td>
                      <td className="py-2.5 px-2.5 text-right text-sky-300">+{fmtCurrency(totalIncSaved)}</td>
                      <td className={`py-2.5 px-2.5 text-right ${totalMktGrowth >= 0 ? "text-purple-300" : "text-rose-400"}`}>
                        {totalMktGrowth >= 0 ? "+" : ""}{fmtCurrency(totalMktGrowth)}
                      </td>
                      <td className={`py-2.5 px-2.5 text-right ${totalHomePrice >= 0 ? "text-indigo-300" : "text-rose-400"}`}>
                        {totalHomePrice >= 0 ? "+" : ""}{fmtCurrency(totalHomePrice)}
                      </td>
                      <td className="py-2.5 px-3 text-right text-teal-300">+{fmtCurrency(totalDebtPaydown)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* Right 4 Cols: Interactive Balance Sheet Breakdown (Assets vs Liabilities + Mortgage Paydown) */}
        <div className="lg:col-span-4 card-panel rounded-2xl p-5 flex flex-col justify-between space-y-4">
          <div>
            <div className="flex items-center justify-between mb-2">
              <div>
                <span className="text-[11px] font-bold uppercase tracking-wider text-indigo-400">
                  🏦 Balance Sheet Breakdown
                </span>
                <h2 className="text-base font-bold text-white">
                  What Makes Up Your {fmtCompact(activeNwTotal)} Net Worth
                </h2>
              </div>
              <button
                onClick={() => toggleInspector({ key: "nw-main", type: "networth", driver: "all", month: nwLatest.month })}
                className={`px-2.5 py-1 rounded-lg text-xs font-semibold border transition ${
                  isNwInspected
                    ? "bg-indigo-600 text-white border-indigo-500"
                    : "bg-slate-900 border-slate-700 text-indigo-300 hover:border-indigo-500"
                }`}
              >
                {isNwInspected ? "Inspecting ✓" : "Inspect All →"}
              </button>
            </div>

            {/* Stacked Proportion Bar of Assets */}
            <div className="space-y-1.5 mb-3">
              <div className="flex justify-between text-xs">
                <span className="text-slate-400 font-medium">
                  Total Assets: <strong className="text-emerald-400 font-mono">{fmtCurrency(activeAssetsTotal)}</strong>
                </span>
                <span className="text-slate-400 font-medium">
                  Liabilities: <strong className="text-rose-400 font-mono">-{fmtCurrency(net_worth.liabilities || (net_worth.mortgage_debt + net_worth.credit_card_debt))}</strong>
                </span>
              </div>
              <div className="w-full h-2.5 rounded-full bg-slate-800 overflow-hidden flex gap-0.5">
                {assetGroups.map((g) => (
                  <div
                    key={g.id}
                    style={{ width: `${Math.max(2, g.share_pct)}%`, backgroundColor: g.color }}
                    title={`${g.label}: ${fmtCurrency(g.total)} (${g.share_pct}%)`}
                  />
                ))}
              </div>
            </div>

            {/* Clickable Asset Groups */}
            <div className="space-y-2">
              {assetGroups.map((g) => {
                const gKey = `nw-group-${g.id}`;
                const isSelected = inspector?.key === gKey;
                const mappedDriver =
                  g.id === "real_estate"
                    ? "home"
                    : g.id === "equity_awards" || g.id === "liquid_cash"
                    ? "income"
                    : "market";
                const displayGroupTotal =
                  g.id === "real_estate" && isCompsHomeMode ? Number(net_worth.home_value_comps || compsHomeCfg) : g.total;
                return (
                  <div
                    key={g.id}
                    onClick={() => {
                      toggleInspector({ key: gKey, type: "networth", group: g.id, driver: mappedDriver, month: nwLatest.month });
                    }}
                    className={`p-2.5 rounded-xl border transition cursor-pointer flex items-center justify-between gap-2 ${
                      isSelected
                        ? "bg-indigo-950/60 border-indigo-500 ring-1 ring-indigo-500/40"
                        : "bg-slate-950/60 border-slate-800 hover:border-indigo-500/40"
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: g.color }} />
                      <div className="min-w-0">
                        <div className="text-xs font-bold text-white truncate">
                          {g.id === "real_estate"
                            ? `Primary Residence (${isCompsHomeMode ? "Comps $1.475M" : "Trend $1.625M"})`
                            : g.label}
                        </div>
                        <div className="text-[10px] text-slate-400 truncate">
                          {g.accounts.map((a) => a.institution).filter((v, i, a) => a.indexOf(v) === i).join(" • ")} ({g.accounts.length} {g.accounts.length === 1 ? "acct" : "accts"})
                        </div>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-xs font-bold font-mono text-white">{fmtCurrency(displayGroupTotal)}</div>
                      <div className="text-[10px] text-slate-400 font-mono">{g.share_pct}% of assets</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Liabilities & Fidelity Mortgage Paydown Highlight */}
          <div className="pt-3 border-t border-slate-800 space-y-2">
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
              Liabilities &amp; Fidelity Mortgage Paydown
            </div>
            {liabilityGroups.map((g) => {
              const gKey = `nw-group-${g.id}`;
              const isSelected = inspector?.key === gKey;
              return (
                <div
                  key={g.id}
                  onClick={() => {
                    toggleInspector({
                      key: gKey,
                      type: g.id === "credit_cards" ? "cards" : "networth",
                      group: g.id,
                      driver: "redemption",
                      month: nwLatest.month,
                    });
                  }}
                  className={`p-2.5 rounded-xl border transition cursor-pointer flex items-center justify-between gap-2 ${
                    isSelected
                      ? "bg-indigo-950/60 border-indigo-500 ring-1 ring-indigo-500/40"
                      : "bg-slate-950/60 border-slate-800 hover:border-indigo-500/40"
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: g.color }} />
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-white truncate">{g.label}</div>
                      <div className="text-[10px] text-slate-400 truncate">
                        {g.id === "mortgage"
                          ? `Orig ${fmtCompact(ms.original_loan)} • Paid off ${fmtCompact(ms.total_principal_paid)} (${ms.paid_down_pct}%) • ${fmtCompact(ms.ytd_fidelity_extra_principal)} via Fidelity extra principal`
                          : `${net_worth.card_count} cards • ${net_worth.cc_utilization_pct}% of ${fmtCompact(net_worth.credit_card_limit)} limit`}
                      </div>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-xs font-bold font-mono text-rose-400">-{fmtCurrency(g.total)}</div>
                    <div className="text-[10px] text-indigo-400 font-semibold">Inspect →</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  };

  const renderMonthlySpendingExplorer = () => {
    const activeYm = inspectedMonth || selectedMonth;

    return (
      <div className="card-panel rounded-2xl p-5 border border-indigo-500/30">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <span>📊 Interactive Monthly Income, Cash Flow & Spending Explorer</span>
              </h2>
              <span className="badge bg-indigo-500/15 text-indigo-400 border border-indigo-500/30">
                Click any bar or month to inspect on the right →
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Compare monthly income sources ({payrollLabel} + {partnerName} share), baseline housing, extra principal prepayments, and lifestyle spending
            </p>
          </div>

          {/* Interactive Toggles: Partner Share, Hide Housing, Extra Principal, Chart Mode */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => setNetPartnerMode(!netPartnerMode)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition flex items-center gap-1.5 ${
                netPartnerMode
                  ? "bg-emerald-500/15 border-emerald-500/50 text-emerald-400"
                  : "bg-slate-900 border-slate-700 text-slate-300 hover:border-slate-600"
              }`}
              title={`Subtract ${partnerName}'s ${fmtCurrency(partnerExpected)}/mo housing reimbursement from gross housing`}
            >
              <span>{netPartnerMode ? `Net of ${partnerName} (-${fmtCompact(partnerExpected)}/mo)` : "Gross Housing"}</span>
            </button>

            <button
              onClick={() => setExcludeHousingOnGraph(!excludeHousingOnGraph)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition flex items-center gap-1.5 ${
                excludeHousingOnGraph
                  ? "bg-amber-500/20 border-amber-500/50 text-amber-400"
                  : "bg-slate-900 border-slate-700 text-slate-300 hover:border-slate-600"
              }`}
              title="Hide Mortgage P&I and HOA so lifestyle categories stand out clearly"
            >
              <span>{excludeHousingOnGraph ? "Lifestyle Only (Ex-Housing)" : "Hide Base Housing"}</span>
            </button>

            <button
              onClick={() => setShowExtraPrincipalOnGraph(!showExtraPrincipalOnGraph)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition flex items-center gap-1.5 ${
                showExtraPrincipalOnGraph
                  ? "bg-purple-500/20 border-purple-500/50 text-purple-300"
                  : "bg-slate-900 border-slate-700 text-slate-300 hover:border-slate-600"
              }`}
              title={`Show extra mortgage principal prepayments funded from ${extraFrom}`}
            >
              <span>{showExtraPrincipalOnGraph ? "+ Extra Principal" : "Show Extra Principal"}</span>
            </button>

            <div className="flex items-center bg-slate-950 p-1 rounded-xl border border-slate-800">
              {[
                { id: "cashflow", label: "Income vs Spend" },
                { id: "income", label: "Income Sources" },
                { id: "stacked", label: "Stacked Categories" },
                { id: "total", label: "Total Outflow" },
              ].map((m) => (
                <button
                  key={m.id}
                  onClick={() => setExplorerChartMode(m.id)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition ${
                    explorerChartMode === m.id
                      ? "bg-indigo-600 text-white shadow"
                      : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Interactive Monthly Bar Chart */}
        <ChartCanvas
          type="bar"
          height={290}
          isDark={isDark}
          data={explorerChartData}
          onElementClick={handleExplorerChartClick}
          options={{
            scales: {
              x: {
                stacked: explorerChartMode === "stacked" || explorerChartMode === "income" || explorerChartMode === "total",
                ticks: { color: isDark ? "#cbd5e1" : "#334155", font: { weight: "bold", size: 11 } },
                grid: { color: isDark ? "rgba(51,65,85,0.2)" : "rgba(226,232,240,0.8)" },
              },
              y: {
                stacked: explorerChartMode === "stacked" || explorerChartMode === "income" || explorerChartMode === "total",
                ticks: {
                  color: isDark ? "#94a3b8" : "#475569",
                  callback: (v) => fmtCompact(v),
                },
                grid: { color: isDark ? "rgba(51,65,85,0.25)" : "rgba(226,232,240,0.8)" },
              },
            },
            plugins: {
              legend: {
                position: "bottom",
                labels: {
                  color: isDark ? "#cbd5e1" : "#334155",
                  font: { size: 11 },
                  boxWidth: 12,
                  padding: 12,
                },
              },
              tooltip: {
                callbacks: {
                  label: (ctx) => {
                    const val = Number(ctx.raw || 0);
                    return ` ${ctx.dataset.label}: ${fmtCurrency(val)}`;
                  },
                },
              },
            },
          }}
        />

        {/* Clickable Month Pills Strip (Opens/Toggles Right-Hand Inspector) */}
        <div className="mt-4 pt-3 border-t border-slate-800/80 flex items-center justify-between gap-2 overflow-x-auto pb-1">
          <div className="flex items-center gap-2">
            {explorerMonths.map((m) => {
              const pillKey = `explorer-${m.month}-all`;
              const isSelected =
                (inspector?.month === m.month && inspector?.type === "cashflow") ||
                (!inspector && m.month === activeYm);
              const displayAmt =
                explorerChartMode === "income" ? m.income : getAdjustedMonthSpend(m);
              return (
                <button
                  key={m.month}
                  onClick={() => {
                    setSelectedMonth(m.month);
                    openMonthInspector(m.month, {
                      key: pillKey,
                      inspectorType: "cashflow",
                      category: null,
                      txFilter: explorerChartMode === "income" ? "income" : "all",
                    });
                  }}
                  className={`px-3 py-2 rounded-xl border text-left transition shrink-0 ${
                    isSelected
                      ? "bg-indigo-600/20 border-indigo-500 text-white ring-1 ring-indigo-500/50 shadow"
                      : "bg-slate-900/80 border-slate-800 text-slate-300 hover:border-indigo-500/40"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-bold text-indigo-400">{m.label}</span>
                    <span className="text-[10px] text-emerald-400 font-mono">+{fmtCompact(m.income)}</span>
                  </div>
                  <div className="text-xs font-bold font-mono text-white mt-0.5">
                    {explorerChartMode === "income" ? fmtCurrency(m.income) : `-${fmtCompact(displayAmt)}`}
                  </div>
                  {m.fidelity_extra_principal > 0 && showExtraPrincipalOnGraph && (
                    <div className="text-[9px] text-purple-400 font-mono">
                      +{fmtCompact(m.fidelity_extra_principal)} Extra Prin.
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    );
  };

  const renderCrossDimensionalMatrix = () => {
    if (!explorerMonths.length || !explorerCategories.length) return null;
    const catTopMerchantsMap = monthly_spending_explorer?.category_top_merchants || {};

    const toggleMatrixCat = (cat) => {
      setExpandedMatrixCats((prev) => {
        const next = new Set(prev);
        if (next.has(cat)) next.delete(cat);
        else next.add(cat);
        return next;
      });
    };

    const getCatMonthVal = (cat, m) => {
      const rawVal = Number(m.by_category?.[cat] || 0);
      if (cat === "Housing" && netPartnerMode) {
        return Number(
          m.net_housing_spend !== undefined ? m.net_housing_spend : Math.max(0, rawVal - partnerExpected)
        );
      }
      return rawVal;
    };

    const summaryRows = [
      {
        id: "inflows",
        label: `Inflows (Payroll + ${partnerName})`,
        tone: "text-emerald-400",
        getVal: (m) => Number(m.income || 0),
        txFilter: "income",
        category: null,
      },
      {
        id: "housing",
        label: netPartnerMode ? `Housing (Net of ${partnerName})` : "Housing (Gross)",
        tone: "text-amber-300",
        getVal: (m) =>
          netPartnerMode
            ? Number(
                m.net_housing_spend !== undefined
                  ? m.net_housing_spend
                  : Math.max(0, Number(m.by_category?.Housing || 0) - partnerExpected)
              )
            : Number(m.by_category?.Housing || m.housing_spend || 0),
        txFilter: "housing",
        category: "Housing",
      },
      {
        id: "lifestyle",
        label: "Lifestyle (Ex-Housing)",
        tone: "text-sky-300",
        getVal: (m) => Number(m.ex_housing_spend || 0),
        txFilter: "lifestyle",
        category: null,
      },
      {
        id: "principal",
        label: "Extra Mortgage Principal",
        tone: "text-purple-400",
        getVal: (m) => Number(m.fidelity_extra_principal || 0),
        txFilter: "principal",
        category: null,
      },
    ];

    return (
      <div className="card-panel rounded-2xl p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <span>🎛️ 12-Month Category × Top Merchant Matrix</span>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-500/15 text-indigo-400 border border-indigo-500/30">
                1-Click Cross-Filter
              </span>
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Expand any category (▸) to compare its top merchants month-by-month. Click any cell to inspect matching charges on the right, or click a category name for its 12M trend.
            </p>
          </div>
          <div className="flex items-center gap-2 text-[11px]">
            <button
              onClick={() => setExpandedMatrixCats(new Set(explorerCategories))}
              className="px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-700 hover:border-indigo-500 text-slate-300 font-semibold transition cursor-pointer"
            >
              Expand All
            </button>
            <button
              onClick={() =>
                setExpandedMatrixCats(
                  new Set(["Housing", "Shopping", "Dining & Restaurants", "Travel & Transit"])
                )
              }
              className="px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-700 hover:border-slate-500 text-slate-300 font-semibold transition cursor-pointer"
            >
              Collapse Top 4
            </button>
            <button
              onClick={() => setExpandedMatrixCats(new Set())}
              className="px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-700 hover:border-slate-500 text-slate-400 font-semibold transition cursor-pointer"
            >
              Collapse All
            </button>
          </div>
        </div>

        <div className="overflow-x-auto rounded-xl border border-slate-800">
          <table className="w-full border-collapse text-[11px]">
            <thead>
              <tr className="border-b border-slate-800 text-slate-400 uppercase text-[10px]">
                <th
                  className="py-2.5 px-3 text-left sticky left-0 z-10 border-r border-slate-800 min-w-[220px]"
                  style={{ backgroundColor: "var(--bg-card)" }}
                >
                  Category / Top Merchant
                </th>
                {explorerMonths.map((m) => {
                  const isAct = m.month === selectedMonth;
                  return (
                    <th key={m.month} className="py-2 px-1.5 text-right min-w-[74px]">
                      <button
                        onClick={() => {
                          setSelectedMonth(m.month);
                          openMonthInspector(m.month, {
                            key: `mx-hdr-${m.month}`,
                            inspectorType: "cashflow",
                            txFilter: "all",
                            forceOpen: true,
                          });
                        }}
                        className={`px-1.5 py-1 rounded font-bold transition cursor-pointer ${
                          isAct
                            ? "bg-indigo-600 text-white"
                            : "text-slate-300 hover:text-indigo-400 hover:bg-slate-800/60"
                        }`}
                        title={`Select ${fmtMonthLabel(m.month)} and open Cash Flow Inspector`}
                      >
                        {m.label || fmtMonthLabel(m.month)}
                      </button>
                    </th>
                  );
                })}
                <th className="py-2.5 px-2.5 text-right border-l border-slate-800 min-w-[82px]">12M Total</th>
                <th className="py-2.5 px-2.5 text-right min-w-[74px]">12M Avg</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {/* Top Household Cash Flow Summary Rows */}
              {summaryRows.map((row) => {
                const vals = explorerMonths.map((m) => row.getVal(m));
                const total12m = vals.reduce((s, v) => s + v, 0);
                const avg12m = vals.length ? total12m / vals.length : 0;
                return (
                  <tr key={row.id} className="bg-slate-900/45 hover:bg-slate-800/40 font-semibold">
                    <td
                      className={`py-2 px-3 sticky left-0 z-10 border-r border-slate-800 ${row.tone}`}
                      style={{ backgroundColor: "var(--bg-card)" }}
                    >
                      {row.label}
                    </td>
                    {explorerMonths.map((m, idx) => {
                      const val = vals[idx];
                      return (
                        <td
                          key={m.month}
                          onClick={() =>
                            openMonthInspector(m.month, {
                              key: `mx-sum-${row.id}-${m.month}`,
                              category: row.category,
                              inspectorType: "cashflow",
                              txFilter: row.txFilter,
                              forceOpen: true,
                            })
                          }
                          className={`py-2 px-2 text-right font-mono cursor-pointer hover:underline ${
                            val > 0 ? row.tone : "text-slate-600"
                          } ${m.month === selectedMonth ? "ring-1 ring-inset ring-indigo-500/30" : ""}`}
                          title={`Inspect ${row.label} in ${fmtMonthLabel(m.month)}`}
                        >
                          {val > 0 ? fmtCompact(val) : "—"}
                        </td>
                      );
                    })}
                    <td className={`py-2 px-2.5 text-right font-mono border-l border-slate-800 ${row.tone}`}>
                      {fmtCompact(total12m)}
                    </td>
                    <td className="py-2 px-2.5 text-right font-mono text-slate-300">
                      {fmtCompact(avg12m)}
                    </td>
                  </tr>
                );
              })}

              {/* Expandable Expense Categories + Top Merchants Sub-Rows */}
              {explorerCategories.map((cat, cIdx) => {
                const isExp = expandedMatrixCats.has(cat);
                const merchList = catTopMerchantsMap[cat] || [];
                const catVals = explorerMonths.map((m) => getCatMonthVal(cat, m));
                const catMax = Math.max(0, ...catVals);
                const catTotal12m = catVals.reduce((s, v) => s + v, 0);
                const catAvg12m = catVals.length ? catTotal12m / catVals.length : 0;

                return (
                  <React.Fragment key={cat}>
                    <tr className="hover:bg-slate-800/40 transition">
                      <td
                        className="py-2 px-3 sticky left-0 z-10 border-r border-slate-800"
                        style={{ backgroundColor: "var(--bg-card)" }}
                      >
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => toggleMatrixCat(cat)}
                            className="w-5 h-5 rounded bg-slate-800 hover:bg-indigo-600 text-slate-300 hover:text-white flex items-center justify-center text-[10px] font-bold shrink-0 cursor-pointer transition"
                            title={isExp ? `Collapse ${cat} merchants` : `Expand top ${merchList.length} merchants in ${cat}`}
                          >
                            {isExp ? "▾" : "▸"}
                          </button>
                          <span
                            className="w-2 h-2 rounded-full shrink-0"
                            style={{ backgroundColor: getCategoryColor(cat, cIdx) }}
                          />
                          <button
                            onClick={() => fetchCategoryDetail(cat)}
                            className="font-bold text-white hover:text-indigo-400 text-left truncate cursor-pointer"
                            title={`Inspect ${cat} 12-month trend & merchants`}
                          >
                            {cat === "Housing" && netPartnerMode ? "Housing (Net)" : cat}
                          </button>
                          {merchList.length > 0 && (
                            <span className="text-[9px] text-slate-500 font-mono">
                              ({merchList.length})
                            </span>
                          )}
                        </div>
                      </td>
                      {explorerMonths.map((m, mIdx) => {
                        const val = catVals[mIdx];
                        const ratio = catMax > 0 ? Math.min(1, val / catMax) : 0;
                        return (
                          <td
                            key={m.month}
                            onClick={() =>
                              openMonthInspector(m.month, {
                                key: `mx-${cat}-${m.month}`,
                                category: cat,
                                inspectorType: "cashflow",
                                txFilter: "all",
                                forceOpen: true,
                              })
                            }
                            style={{
                              backgroundColor:
                                val > 0
                                  ? `rgba(99, 102, 241, ${(0.06 + ratio * 0.28).toFixed(2)})`
                                  : undefined,
                            }}
                            className={`py-2 px-2 text-right font-mono cursor-pointer transition hover:ring-1 hover:ring-inset hover:ring-indigo-400 ${
                              val > 0 ? "text-slate-100 font-semibold" : "text-slate-600"
                            } ${m.month === selectedMonth ? "ring-1 ring-inset ring-indigo-500/40" : ""}`}
                            title={`${cat} · ${fmtMonthLabel(m.month)}: ${fmtCurrency(val)} (Click to inspect)`}
                          >
                            {val > 0 ? fmtCompact(val) : "—"}
                          </td>
                        );
                      })}
                      <td className="py-2 px-2.5 text-right font-mono font-bold text-white border-l border-slate-800">
                        {fmtCompact(catTotal12m)}
                      </td>
                      <td className="py-2 px-2.5 text-right font-mono text-slate-400">
                        {fmtCompact(catAvg12m)}
                      </td>
                    </tr>

                    {isExp &&
                      merchList.map((merch) => {
                        const mVals = explorerMonths.map((m) =>
                          Number(merch.by_month?.[m.month] || 0)
                        );
                        const mMax = Math.max(0, ...mVals);
                        return (
                          <tr
                            key={`${cat}-${merch.merchant}`}
                            className="bg-slate-950/50 hover:bg-slate-800/35 text-[10px]"
                          >
                            <td
                              className="py-1.5 pl-9 pr-3 sticky left-0 z-10 border-r border-slate-800 text-slate-300"
                              style={{ backgroundColor: "var(--bg-card)" }}
                            >
                              <button
                                onClick={() =>
                                  openMonthInspector(selectedMonth, {
                                    key: `mx-merch-row-${cat}-${merch.merchant}-${selectedMonth}`,
                                    category: cat,
                                    merchant: merch.merchant,
                                    inspectorType: "cashflow",
                                    txFilter: "all",
                                    forceOpen: true,
                                  })
                                }
                                className="hover:text-indigo-400 text-left flex items-center gap-1.5 w-full cursor-pointer"
                                title={`Filter ${fmtMonthLabel(selectedMonth)} ledger to ${merch.merchant}`}
                              >
                                <span className="text-slate-500">↳</span>
                                <span className="truncate font-medium">{merch.merchant}</span>
                                <span className="text-[9px] text-slate-500 font-mono shrink-0">
                                  ({merch.count_12m}x)
                                </span>
                              </button>
                            </td>
                            {explorerMonths.map((m, idx) => {
                              const mv = mVals[idx];
                              const mRatio = mMax > 0 ? Math.min(1, mv / mMax) : 0;
                              return (
                                <td
                                  key={m.month}
                                  onClick={() =>
                                    openMonthInspector(m.month, {
                                      key: `mx-m-${cat}-${merch.merchant}-${m.month}`,
                                      category: cat,
                                      merchant: merch.merchant,
                                      inspectorType: "cashflow",
                                      txFilter: "all",
                                      forceOpen: true,
                                    })
                                  }
                                  style={{
                                    backgroundColor:
                                      mv > 0
                                        ? `rgba(16, 185, 129, ${(0.05 + mRatio * 0.22).toFixed(2)})`
                                        : undefined,
                                  }}
                                  className={`py-1.5 px-2 text-right font-mono cursor-pointer hover:ring-1 hover:ring-inset hover:ring-emerald-400 ${
                                    mv > 0 ? "text-emerald-300" : "text-slate-700"
                                  }`}
                                  title={`${merch.merchant} in ${fmtMonthLabel(m.month)}: ${fmtCurrency(mv)}`}
                                >
                                  {mv > 0 ? fmtCompact(mv) : "·"}
                                </td>
                              );
                            })}
                            <td className="py-1.5 px-2.5 text-right font-mono text-slate-300 border-l border-slate-800">
                              {fmtCompact(merch.total_12m)}
                            </td>
                            <td className="py-1.5 px-2.5 text-right font-mono text-slate-500">
                              {fmtCompact(merch.avg_12m)}
                            </td>
                          </tr>
                        );
                      })}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  // Chart datasets
  const cashflowChartData = {
    labels: cashflow.map((m) => m.label || m.month),
    datasets: [
      {
        label: "Income",
        data: cashflow.map((m) => m.income),
        backgroundColor: "#10b981",
        borderRadius: 5,
      },
      {
        label: netPartnerMode ? `Spending (Net of ${partnerName})` : "Gross Spending",
        data: cashflow.map((m) => (netPartnerMode ? m.spending_net_partner || m.spending : m.spending)),
        backgroundColor: "#6366f1",
        borderRadius: 5,
      },
      {
        label: "Extra Mortgage Principal",
        data: cashflow.map((m) => m.fidelity_extra_principal || 0),
        backgroundColor: "#a855f7",
        borderRadius: 5,
      },
    ],
  };

  const categoryDonutData = {
    labels: (spending.categories || []).slice(0, 8).map((c) => c.category),
    datasets: [
      {
        data: (spending.categories || []).slice(0, 8).map((c) =>
          c.category === "Housing" && netPartnerMode ? Number(kpis.net_housing_spend || c.spend) : c.spend
        ),
        backgroundColor: CHART_COLORS,
        borderWidth: 1,
        borderColor: isDark ? "#0f172a" : "#ffffff",
      },
    ],
  };

  const allocationChartData = {
    labels: (investments.asset_allocation || []).map((a) => a.asset_class),
    datasets: [
      {
        data: (investments.asset_allocation || []).map((a) => a.value),
        backgroundColor: ["#6366f1", "#10b981", "#f59e0b", "#06b6d4", "#ec4899", "#8b5cf6"],
        borderWidth: 1,
        borderColor: isDark ? "#0f172a" : "#ffffff",
      },
    ],
  };

  const curHb = spending.housing_breakdown || {};
  const curIb = spending.income_breakdown || {};

  // ==================== DERIVED: KPI SPARKLINE SERIES ====================
  const cfIdx = cashflow.findIndex((m) => m.month === selectedMonth);
  const nwIdx = nwMonthly.findIndex((m) => m.month === selectedMonth);
  const sparkNetWorth = nwMonthly.map((m) => Number(isCompsHomeMode ? m.net_worth_comps || m.net_worth : m.net_worth_secular || m.net_worth || 0));
  const sparkCashFlow = cashflow.map((m) => Number(m.net_savings || 0));
  const sparkSpend = cashflow.map((m) => Number(netPartnerMode ? m.spending_net_partner ?? m.spending : m.spending) || 0);
  const sparkCash = nwMonthly.map((m) => Number(m.cash || 0));

  // ==================== DERIVED: FINANCIAL INDEPENDENCE PROGRESS ====================
  const fullCfMonths = cashflow.filter((m) => !m.is_partial).slice(-12);
  const avgMonthlyNetSpend = fullCfMonths.length
    ? fullCfMonths.reduce((a, m) => a + Number(m.spending_net_partner ?? m.spending ?? 0), 0) / fullCfMonths.length
    : 0;
  const annualNetSpend = avgMonthlyNetSpend * 12;
  const investableAssets = Number(net_worth.investments || 0);
  const fiNumber = annualNetSpend * 25; // 4% safe-withdrawal rule
  const fiPct = fiNumber > 0 ? (investableAssets / fiNumber) * 100 : 0;
  const fiPctWithRsu = fiNumber > 0 ? ((investableAssets + Number(net_worth.unvested_rsu_net_tax || 0)) / fiNumber) * 100 : 0;
  const passiveMonthly = (investableAssets * 0.04) / 12;
  const yearsCovered = annualNetSpend > 0 ? investableAssets / annualNetSpend : 0;
  const fiGap = Math.max(0, fiNumber - investableAssets);
  const monthlyRsuNet = Number(net_worth.monthly_rsu_vest_net || 0);
  const avgMonthlyCashSaved = fullCfMonths.length ? fullCfMonths.reduce((a, m) => a + Number(m.net_savings || 0), 0) / fullCfMonths.length : 0;
  const monthlyWealthAdds = Math.max(0, avgMonthlyCashSaved) + monthlyRsuNet;
  const monthsToFi = (() => {
    if (fiGap <= 0) return 0;
    if (monthlyWealthAdds <= 0) return null;
    let bal = investableAssets, m = 0;
    const r = 0.06 / 12; // conservative 6% nominal growth
    while (bal < fiNumber && m < 600) { bal = bal * (1 + r) + monthlyWealthAdds; m++; }
    return m >= 600 ? null : m;
  })();

  // ==================== DERIVED: "MONTH IN REVIEW" NARRATIVE (Data Storytelling) ====================
  const nwSel = nwIdx >= 0 ? nwMonthly[nwIdx] : null;
  const topAttr = (spending.attribution || [])[0];
  const overBudget = (insights || []).filter((i) => String(i.id || "").startsWith("budget-over"));
  const storyBullets = [];
  if (kpis.spend_avg_3m) {
    const pct = Number(kpis.spend_vs_avg_pct || 0);
    storyBullets.push({
      icon: pct <= 0 ? "🟢" : "🔴",
      tone: pct <= 0 ? "good" : "bad",
      text: (
        <>
          You spent <strong>{fmtCurrency(kpis.spending)}</strong> gross
          {kpis.spend_net_partner ? <> (<strong>{fmtCompact(kpis.spend_net_partner)}</strong> net of {partnerName})</> : null}, which is{" "}
          <strong className={pct <= 0 ? "text-emerald-400" : "text-rose-400"}>{Math.abs(pct)}% {pct <= 0 ? "below" : "above"}</strong> your 3-month gross average of {fmtCompact(kpis.spend_avg_3m)}.
        </>
      ),
      action: () => openMonthInspector(selectedMonth, { key: `story-spend-${selectedMonth}`, inspectorType: "cashflow", txFilter: "all", forceOpen: true }),
    });
  }
  if (topAttr && Math.abs(Number(topAttr.diff || 0)) > 50) {
    // Only name a merchant driver if it moved in the same direction as the category
    const d0 = (topAttr.drivers || []).find((d) => Math.sign(Number(d.diff || 0)) === Math.sign(Number(topAttr.diff)));
    storyBullets.push({
      icon: topAttr.diff > 0 ? "📈" : "📉",
      tone: topAttr.diff > 0 ? "bad" : "good",
      text: (
        <>
          <strong>{topAttr.category}</strong> {topAttr.diff > 0 ? "rose" : "fell"} the most vs. your 3-month baseline (
          <strong className={topAttr.diff > 0 ? "text-rose-400" : "text-emerald-400"}>{topAttr.diff > 0 ? "+" : "−"}{fmtCompact(Math.abs(topAttr.diff))}</strong>)
          {d0 ? <>, mostly from <strong>{d0.merchant}</strong> ({d0.diff > 0 ? "+" : "−"}{fmtCompact(Math.abs(d0.diff))})</> : null}.
        </>
      ),
      action: () => fetchCategoryDetail(topAttr.category),
    });
  }
  if (nwSel && nwSel.mom_diff !== undefined) {
    const up = Number(nwSel.mom_diff) >= 0;
    storyBullets.push({
      icon: up ? "💹" : "⚠️",
      tone: up ? "good" : "bad",
      text: (
        <>
          Net worth {up ? "grew" : "fell"} <strong className={up ? "text-emerald-400" : "text-rose-400"}>{fmtCurrency(nwSel.mom_diff, true)}</strong> ({nwSel.mom_pct}%)
          {nwSel.inv_diff ? <> — investments {fmtCompact(nwSel.inv_diff)}, debt paydown {fmtCompact(Math.abs(nwSel.debt_diff || 0))}</> : null}.
        </>
      ),
      action: () => toggleInspector({ key: `nw-month-${selectedMonth}`, type: "networth", month: selectedMonth }),
    });
  }
  storyBullets.push({
    icon: kpis.net_savings >= 0 ? "💰" : "💸",
    tone: kpis.net_savings >= 0 ? "good" : "neutral",
    text: (
      <>
        Cash flow was <strong className={kpis.net_savings >= 0 ? "text-emerald-400" : "text-rose-400"}>{fmtCurrency(kpis.net_savings, true)}</strong> ({kpis.savings_rate_pct}% savings rate)
        {monthlyRsuNet > 0 ? <> — but RSU vests add ~<strong className="text-indigo-300">{fmtCompact(monthlyRsuNet)}/mo</strong> net stock that never hits checking.</> : "."}
      </>
    ),
    action: () => toggleInspector({ key: `cf-kpi-${selectedMonth}`, type: "cashflow", month: selectedMonth, txFilter: "all" }),
  });
  if ((anomalies || []).length > 0) {
    const a0 = anomalies[0];
    storyBullets.push({
      icon: "🕵️",
      tone: "bad",
      text: (
        <>
          Unusual charge: <strong>{a0.merchant}</strong> {fmtCurrency(a0.amount)} on {a0.tx_date} ({a0.reason}).
        </>
      ),
      action: () => openMonthInspector(selectedMonth, { key: `story-anom-${a0.id}`, merchant: a0.merchant, inspectorType: "cashflow", txFilter: "all", forceOpen: true }),
    });
  }
  if (overBudget.length > 0) {
    storyBullets.push({
      icon: "🎯",
      tone: "bad",
      text: (
        <>
          <strong>{overBudget.length}</strong> {overBudget.length === 1 ? "category is" : "categories are"} over budget: {overBudget.slice(0, 3).map((i) => i.link?.category || i.title).join(", ")}.
        </>
      ),
      action: () => setActiveTab("spending"),
    });
  }
  const storyScore = storyBullets.reduce((a, b) => a + (b.tone === "good" ? 1 : b.tone === "bad" ? -1 : 0), 0);
  const storyHeadline =
    storyScore >= 2 ? "A strong month — keep the momentum." : storyScore <= -2 ? "A few things need your attention this month." : "A mixed month — here's what moved.";

  // ==================== DERIVED: CASH FLOW SANKEY (Monarch-style) ====================
  const sankey = (() => {
    let sources = [];
    let cats = [];
    if (sankeyMode === "avg12") {
      const ms = explorerRawMonths.filter((m) => m.total_spend > 0 || m.income > 0).slice(-12);
      const n = ms.length || 1;
      const ibSum = { payroll: 0, partner_reimbursement: 0, other_transfers: 0, other: 0 };
      const catSum = {};
      ms.forEach((m) => {
        const ib = m.income_breakdown || {};
        ibSum.payroll += Number(ib.payroll || 0);
        ibSum.partner_reimbursement += Number(ib.partner_reimbursement || 0);
        ibSum.other_transfers += Number(ib.other_transfers || 0);
        ibSum.other += Number(ib.dividends_interest || 0) + Number(ib.other_income || 0);
        Object.entries(m.by_category || {}).forEach(([c, v]) => { catSum[c] = (catSum[c] || 0) + Number(v || 0); });
      });
      sources = [
        { label: payrollLabel, amount: ibSum.payroll / n },
        { label: partnerIncomeLabel, amount: ibSum.partner_reimbursement / n },
        { label: "Other Peer Transfers", amount: ibSum.other_transfers / n },
        { label: "Dividends, Interest & Other", amount: ibSum.other / n },
      ];
      cats = Object.entries(catSum).map(([c, v]) => ({ label: c, amount: v / n }));
    } else {
      sources = (curIb.sources || []).map((s) => ({ label: s.label, amount: Number(s.amount || 0) }));
      cats = (spending.categories || []).map((c) => ({ label: c.category, amount: Number(c.spend || 0) }));
    }
    sources = sources.filter((s) => s.amount > 1);
    cats = cats.filter((c) => c.amount > 1).sort((a, b) => b.amount - a.amount);
    const income = sources.reduce((a, s) => a + s.amount, 0);
    const spend = cats.reduce((a, c) => a + c.amount, 0);
    const threshold = spend * 0.025;
    const big = cats.filter((c) => c.amount >= threshold);
    const otherAmt = cats.filter((c) => c.amount < threshold).reduce((a, c) => a + c.amount, 0);
    if (otherAmt > 1) big.push({ label: "Other", amount: otherAmt });

    const nodeColor = {};
    const labels = {};
    const priority = {};
    const flows = [];
    const MID = "mid:Cash In";
    labels[MID] = `Total Inflows ${fmtCompact(Math.max(income, spend))}`;
    nodeColor[MID] = "#6366f1";
    sources.forEach((s, i) => {
      const k = `src:${s.label}`;
      labels[k] = `${s.label} ${fmtCompact(s.amount)}`;
      nodeColor[k] = ["#10b981", "#06b6d4", "#6366f1", "#f59e0b"][i % 4];
      priority[k] = i;
      flows.push({ from: k, to: MID, flow: Math.round(s.amount) });
    });
    if (spend > income + 1) {
      const k = "src:Drawn from Savings";
      labels[k] = `Drawn from Savings ${fmtCompact(spend - income)}`;
      nodeColor[k] = "#f43f5e";
      priority[k] = 99;
      flows.push({ from: k, to: MID, flow: Math.round(spend - income) });
    }
    big.forEach((c, i) => {
      const k = `cat:${c.label}`;
      const pct = Math.max(income, spend) > 0 ? Math.round((c.amount / Math.max(income, spend)) * 100) : 0;
      labels[k] = `${c.label} ${fmtCompact(c.amount)} · ${pct}%`;
      nodeColor[k] = c.label === "Other" ? "#94a3b8" : getCategoryColor(c.label, i);
      priority[k] = i;
      flows.push({ from: MID, to: k, flow: Math.round(c.amount) });
    });
    if (income > spend + 1) {
      const k = "save:Saved";
      labels[k] = `Saved ${fmtCompact(income - spend)} · ${Math.round(((income - spend) / income) * 100)}%`;
      nodeColor[k] = "#38bdf8";
      priority[k] = -1;
      flows.push({ from: MID, to: k, flow: Math.round(income - spend) });
    }
    return { flows, labels, nodeColor, priority, income, spend, catCount: big.length };
  })();

  const sankeyChartData = {
    datasets: [
      {
        label: "Cash Flow",
        data: sankey.flows,
        colorFrom: (c) => sankey.nodeColor[c.dataset.data[c.dataIndex]?.from] || "#6366f1",
        colorTo: (c) => sankey.nodeColor[c.dataset.data[c.dataIndex]?.to] || "#6366f1",
        colorMode: "gradient",
        labels: sankey.labels,
        priority: sankey.priority,
        size: "max",
        nodeWidth: 14,
        nodePadding: 16,
        borderWidth: 0,
        color: isDark ? "#e2e8f0" : "#1e293b",
        font: { size: 11, weight: "bold" },
      },
    ],
  };

  const handleSankeyClick = ({ value }) => {
    if (!value) return;
    const to = String(value.to || "");
    const from = String(value.from || "");
    if (to.startsWith("cat:")) {
      const cat = to.slice(4);
      if (sankeyMode === "avg12" && cat !== "Other") {
        fetchCategoryDetail(cat);
      } else {
        openMonthInspector(selectedMonth, {
          key: `sankey-${selectedMonth}-${cat}`,
          inspectorType: "cashflow",
          category: cat === "Other" ? null : cat,
          txFilter: cat === "Housing" ? "housing" : cat === "Other" ? "lifestyle" : "lifestyle",
        });
      }
    } else if (from.startsWith("src:") || to.startsWith("save:")) {
      openMonthInspector(selectedMonth, { key: `sankey-inc-${selectedMonth}`, inspectorType: "cashflow", txFilter: "income" });
    }
  };

  // ==================== COMMAND PALETTE REGISTRY ====================
  const TAB_DEFS = [
    { id: "overview", label: "Overview", icon: "📊" },
    { id: "mortgage", label: "Home & Mortgage", icon: "🏡" },
    { id: "spending", label: "Spending & Budgets", icon: "💳" },
    { id: "investments", label: "Investments", icon: "📈" },
    { id: "retirement", label: "Retirement & FIRE", icon: "🏖️" },
    { id: "excess", label: "Needs vs. Excess", icon: "⚖️" },
    { id: "transactions", label: "Transactions", icon: "🧾" },
    { id: "kitchen", label: "Fuel, Labs & Kitchen (Sister)", icon: "🥗" },
  ];
  const paletteCommands = [
    ...TAB_DEFS.map((t, i) => ({ group: "Go to tab", icon: t.icon, label: t.label, shortcut: String(i + 1), run: () => setActiveTab(t.id) })),
    { group: "Actions", icon: privacyMode ? "👁️" : "🙈", label: privacyMode ? "Show amounts" : "Hide amounts (privacy mode)", shortcut: "H", keywords: "privacy blur mask", run: () => setPrivacyMode((p) => !p) },
    { group: "Actions", icon: isDark ? "☀️" : "🌙", label: isDark ? "Switch to light mode" : "Switch to dark mode", keywords: "theme", run: () => setIsDark((d) => !d) },
    { group: "Actions", icon: "🔄", label: "Sync live prices & linked accounts", keywords: "refresh", run: () => handleSyncAll() },
    { group: "Actions", icon: "📥", label: "Import statements / settings", keywords: "upload pdf csv", run: () => setDrawerOpen(true) },
    { group: "Actions", icon: "🏠", label: netPartnerMode ? `Show gross housing (ignore ${partnerName} offset)` : `Show housing net of ${partnerName}`, keywords: "partner housing offset", run: () => setNetPartnerMode((v) => !v) },
    { group: "Actions", icon: "🧮", label: `Inspect ${fmtMonthLabel(selectedMonth)} cash flow math`, run: () => toggleInspector({ key: `cf-kpi-${selectedMonth}`, type: "cashflow", month: selectedMonth, txFilter: "all" }) },
    { group: "Actions", icon: "🏦", label: "Inspect balance sheet & net worth", run: () => toggleInspector({ key: "nw-main", type: "networth" }) },
    ...available_months.map((m) => ({ group: "Months", icon: "📅", label: fmtMonthLabel(m), hint: m === selectedMonth ? "(active)" : "", keywords: m, run: () => setSelectedMonth(m) })),
    ...(spending.categories || []).map((c) => ({ group: "Categories", icon: "🏷️", label: c.category, hint: fmtCompact(c.spend), keywords: "category inspect", run: () => fetchCategoryDetail(c.category) })),
    ...(spending.top_merchants || []).map((m) => ({
      group: "Merchants",
      icon: "🏪",
      label: m.merchant,
      hint: `${fmtCompact(m.spend)} · ${m.category}`,
      keywords: "merchant store",
      run: () => openMonthInspector(selectedMonth, { key: `merch-${selectedMonth}-${m.merchant}`, merchant: m.merchant, inspectorType: "cashflow", txFilter: "all", forceOpen: true }),
    })),
    ...(insights || []).slice(0, 12).map((i) => ({
      group: "Insights",
      icon: i.severity === "high" ? "🔴" : i.severity === "positive" ? "🟢" : "🟡",
      label: i.title,
      keywords: i.detail,
      run: () => (i.link?.category ? fetchCategoryDetail(i.link.category) : toggleInspector({ key: `insight-${i.id}`, type: i.link?.inspector || "cashflow", month: selectedMonth })),
    })),
  ];

  return (
    <div className={`min-h-screen flex flex-col ${isDark ? "bg-[#070b14] text-slate-100" : "bg-[#f4f6fb] text-slate-900"}`}>
      {/* Toast Notification */}
      {toast && (
        <div className={`fixed bottom-5 left-5 z-50 px-4 py-3 rounded-xl shadow-2xl border text-xs font-semibold flex items-center gap-2.5 transition-all ${
          toast.type === "error"
            ? "bg-rose-950/95 border-rose-700 text-rose-200"
            : isDark
            ? "bg-indigo-950/95 border-indigo-600 text-indigo-100"
            : "bg-white border-indigo-300 text-indigo-900 shadow-lg"
        }`}>
          <span>{toast.type === "error" ? "⚠️" : "✓"}</span>
          <span>{toast.msg}</span>
        </div>
      )}

      {/* Top Application Header — Clean Hierarchy, No Leading Bank Clutter */}
      <header className={`sticky top-0 z-40 border-b backdrop-blur-md px-6 py-2.5 ${
        isDark ? "bg-slate-900/90 border-slate-800" : "bg-white/95 border-slate-200 shadow-sm"
      }`}>
        <div className="max-w-[1600px] mx-auto flex flex-wrap items-center justify-between gap-3">
          {/* Logo & Live Net Worth Pill */}
          <div className="flex items-center gap-3">
            <div
              onClick={() => setActiveTab("overview")}
              className="w-8 h-8 rounded-xl bg-gradient-to-br from-indigo-500 to-emerald-500 flex items-center justify-center font-extrabold text-white shadow-md shadow-indigo-500/20 text-sm cursor-pointer"
            >
              FP
            </div>
            <div className="flex items-center gap-2.5">
              <span
                onClick={() => setActiveTab("overview")}
                className="font-extrabold text-base tracking-tight cursor-pointer"
              >
                FinPulse
              </span>
              <button
                onClick={() => toggleInspector({ key: "nw-main", type: "networth" })}
                className="text-[11px] font-mono font-bold px-2.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 hover:border-emerald-400 transition"
                title={`Realized Net Worth today (${isCompsHomeMode ? `Comps ${fmtCompact(compsHomeCfg)}` : `Trend ${fmtCompact(secularHomeCfg)}`}; excludes unvested equity). Click to inspect!`}
              >
                Realized NW {fmtCompact(activeNwTotal)}
              </button>
              {/* Sister Dashboard Switcher Pill */}
              <div className="flex items-center rounded-full p-0.5 border border-slate-700/80 bg-slate-950/90 text-[11px] font-bold">
                <button
                  onClick={() => {
                    setActiveTab("overview");
                    try { window.history.replaceState(null, "", "/"); } catch (e) {}
                  }}
                  className={`px-2.5 py-0.5 rounded-full transition ${
                    activeTab !== "kitchen"
                      ? "bg-indigo-600 text-white shadow"
                      : "text-slate-400 hover:text-white"
                  }`}
                  title="Wealth, Cash Flow, Mortgage & FIRE Workspaces"
                >
                  Wealth
                </button>
                <button
                  onClick={() => {
                    setActiveTab("kitchen");
                    try { window.history.replaceState(null, "", "/kitchen"); } catch (e) {}
                  }}
                  className={`px-2.5 py-0.5 rounded-full transition ${
                    activeTab === "kitchen"
                      ? "bg-emerald-600 text-white shadow"
                      : "text-emerald-400 hover:text-emerald-300"
                  }`}
                  title="Sister Dashboard: Biomarker Labs, Modular Meal Prep, Training Macros & Kitchen ROI"
                >
                  Fuel &amp; Labs
                </button>
              </div>
            </div>
          </div>

          {/* Primary 4-Workspace Navigation (or Sister Dashboard Sub-Tabs when in Fuel & Labs Mode) */}
          {activeTab === "kitchen" ? (
            <nav className={`flex items-center gap-1 p-1 rounded-xl border ${
              isDark ? "bg-emerald-950/40 border-emerald-700/50" : "bg-emerald-50 border-emerald-200"
            }`}>
              {[
                { id: "labs", label: "Biomarker Labs" },
                { id: "meals", label: "Modular Batch Prep" },
                { id: "macros", label: "Training Macros & Cafe" },
                { id: "groceries", label: "Grocery Routing" },
                { id: "roi", label: "Takeout vs. Home ROI" },
              ].map((st) => (
                <button
                  key={st.id}
                  onClick={() => setKitchenSubTab(st.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                    kitchenSubTab === st.id
                      ? "bg-emerald-600 text-white shadow-sm"
                      : "text-slate-400 hover:text-white hover:bg-slate-800/50"
                  }`}
                >
                  {st.label}
                </button>
              ))}
            </nav>
          ) : (() => {
            const activeWorkspace =
              ["spending", "excess", "transactions"].includes(activeTab)
                ? "spending"
                : ["investments", "mortgage"].includes(activeTab)
                ? "investments"
                : activeTab === "retirement"
                ? "retirement"
                : "overview";
            const WORKSPACE_TABS = [
              { id: "overview", label: "Command Center", icon: "grid" },
              { id: "spending", label: "Cash Flow & Matrix", icon: "layers" },
              { id: "investments", label: "Investments & Property", icon: "pie" },
              { id: "retirement", label: "Planning & Scenarios", icon: "target" },
            ];
            return (
              <nav className={`bento-pill-nav border ${
                isDark ? "bg-slate-950/85 border-slate-800" : "bg-slate-100 border-slate-200"
              }`}>
                {WORKSPACE_TABS.map((tab) => {
                  const isActive = activeWorkspace === tab.id;
                  return (
                    <button
                      key={tab.id}
                      onClick={() => {
                        setActiveTab(tab.id);
                        try {
                          window.history.replaceState(null, "", "/");
                        } catch (e) {}
                      }}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
                        isActive
                          ? "bg-indigo-600 text-white shadow-sm"
                          : "text-slate-400 hover:text-white hover:bg-slate-800/50"
                      }`}
                    >
                      <BentoIcon name={tab.icon} className="w-3.5 h-3.5" />
                      <span>{tab.label}</span>
                    </button>
                  );
                })}
              </nav>
            );
          })()}

          {/* Right Controls: Period Stepper, Subtle Scope Filter, Inspector Button, Light/Dark Toggle */}
          <div className="flex items-center gap-2">
            {/* Month Stepper */}
            <div className="flex items-center border rounded-xl overflow-hidden bg-slate-950 border-slate-800">
              <button
                onClick={() => handleMonthStep(1)}
                disabled={!canGoPrev}
                className="px-2 py-1 text-xs text-slate-400 hover:text-indigo-400 disabled:opacity-30 border-r border-slate-800"
                title="Older Month"
              >
                ‹
              </button>
              <select
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                className="bg-transparent text-xs font-bold text-indigo-400 px-2 py-1 focus:outline-none cursor-pointer font-mono"
                title="Active Statement Month"
              >
                {available_months.map((m) => (
                  <option key={m} value={m} className="bg-slate-900 text-white">
                    {fmtMonthLabel(m)}
                  </option>
                ))}
              </select>
              <button
                onClick={() => handleMonthStep(-1)}
                disabled={!canGoNext}
                className="px-2 py-1 text-xs text-slate-400 hover:text-indigo-400 disabled:opacity-30 border-l border-slate-800"
                title="Newer Month"
              >
                ›
              </button>
            </div>

            {/* Secondary Account Scope Filter */}
            <select
              value={selectedInstitution}
              onChange={(e) => setSelectedInstitution(e.target.value)}
              className="px-2.5 py-1 rounded-xl border bg-slate-950 border-slate-800 text-xs font-medium text-slate-300 focus:outline-none cursor-pointer"
              title="Filter by Financial Institution (Default: All)"
            >
              {INSTITUTIONS.map((inst) => (
                <option key={inst} value={inst}>
                  {inst === "All" ? "All Institutions" : inst}
                </option>
              ))}
            </select>

            {/* Command Palette Trigger (Ctrl/Cmd+K) */}
            <button
              onClick={() => setPaletteOpen(true)}
              className={`px-2.5 py-1.5 rounded-xl border text-xs font-semibold flex items-center gap-2 transition ${
                isDark ? "bg-slate-900 border-slate-800 text-slate-400 hover:border-indigo-500/50" : "bg-white border-slate-200 text-slate-500 hover:border-indigo-400"
              }`}
              title="Search & jump anywhere (Ctrl+K or /)"
            >
              <span>🔍</span>
              <span className="hidden lg:inline">Search</span>
              <kbd className="hidden lg:inline text-[10px] px-1 rounded border border-slate-600 text-slate-500">Ctrl K</kbd>
            </button>

            {/* Privacy Mode (hide all dollar amounts for screen sharing) */}
            <button
              onClick={() => setPrivacyMode((p) => !p)}
              className={`px-2.5 py-1.5 rounded-xl border text-xs font-bold transition ${
                privacyMode
                  ? "bg-amber-500/20 border-amber-500/50 text-amber-300"
                  : isDark ? "bg-slate-900 border-slate-800 text-slate-300 hover:border-indigo-500/50" : "bg-white border-slate-200 text-slate-600 hover:border-indigo-400"
              }`}
              title={privacyMode ? "Show amounts (H)" : "Hide all amounts for screen sharing (H)"}
            >
              {privacyMode ? "🙈" : "👁️"}
            </button>

            {/* Right-Hand Inspector Toggle Button */}
            <button
              onClick={() =>
                inspector
                  ? setInspector(null)
                  : toggleInspector({ key: `cf-kpi-${selectedMonth}`, type: "cashflow", month: selectedMonth })
              }
              className={`px-2.5 py-1.5 rounded-xl border text-xs font-bold transition flex items-center gap-1.5 ${
                inspector
                  ? "bg-indigo-600 text-white border-indigo-500 shadow-sm"
                  : "bg-slate-900 border-slate-800 text-slate-300 hover:border-indigo-500/50"
              }`}
              title="Toggle Right-Hand Context Inspector Panel (or press Esc)"
            >
              <span>{inspector ? "✕ Close Inspector" : "◫ Inspector"}</span>
            </button>

            {/* Quick Sync Button */}
            <button
              onClick={handleSyncAll}
              disabled={syncingAll}
              className="px-2.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow flex items-center gap-1 transition disabled:opacity-50"
              title="Sync live stock prices & linked bank accounts"
            >
              <span>{syncingAll ? "⏳" : "🔄"}</span>
              <span className="hidden xl:inline">{syncingAll ? "Syncing..." : "Sync"}</span>
            </button>

            {/* Crisp Light / Dark Mode Toggle */}
            <button
              onClick={() => setIsDark(!isDark)}
              className="px-2.5 py-1.5 rounded-xl border bg-slate-900 border-slate-800 text-xs font-bold flex items-center gap-1.5 hover:border-indigo-500/50 transition"
              title={isDark ? "Switch to Crisp Light Mode" : "Switch to Dark Mode"}
            >
              <span>{isDark ? "☀️" : "🌙"}</span>
              <span className="hidden sm:inline text-slate-200">{isDark ? "Light" : "Dark"}</span>
            </button>

            {/* Settings & Import Drawer Trigger */}
            <button
              onClick={() => setDrawerOpen(true)}
              className="p-1.5 rounded-xl border bg-slate-900 border-slate-800 text-slate-300 hover:border-indigo-500/50 text-sm transition"
              title="Data Import & Settings Drawer"
            >
              ⚙️
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Area — Shifts smoothly when Right-Hand Context Inspector is open */}
      <main
        className={`flex-1 max-w-[1600px] w-full mx-auto px-6 py-6 space-y-6 transition-all duration-200 ${
          inspector ? "xl:pr-[520px]" : ""
        }`}
      >
        {/* Global Lens & Household Vital Strip (1-click cross-view controls) */}
        {activeTab !== "kitchen" && (
          <div className="space-y-2">
            {/* Contextual Workspace Sub-Navigation Strip */}
            {["spending", "excess", "transactions"].includes(activeTab) && (
              <div className="flex flex-wrap items-center justify-between gap-2 px-1">
                <div className="inline-flex items-center gap-1 p-1 rounded-xl border border-slate-800/80 bg-slate-950/60">
                  {[
                    { id: "spending", label: "Cash Flow & 12M Matrix" },
                    { id: "excess", label: "Spend Audit, Reflections & Trips" },
                    { id: "transactions", label: "Transactions Pivot & Ledger" },
                  ].map((sub) => (
                    <button
                      key={sub.id}
                      onClick={() => setActiveTab(sub.id)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                        activeTab === sub.id
                          ? "bg-indigo-600 text-white shadow-sm"
                          : "text-slate-400 hover:text-white"
                      }`}
                    >
                      {sub.label}
                    </button>
                  ))}
                </div>
                <span className="text-[11px] text-slate-400">
                  Workspace: <strong className="text-slate-200">Cash Flow &amp; Matrix</strong>
                </span>
              </div>
            )}
            {["investments", "mortgage"].includes(activeTab) && (
              <div className="flex flex-wrap items-center justify-between gap-2 px-1">
                <div className="inline-flex items-center gap-1 p-1 rounded-xl border border-slate-800/80 bg-slate-950/60">
                  {[
                    { id: "investments", label: "Portfolio & Asset Allocation" },
                    { id: "mortgage", label: "Real Estate, IRS $750k Cap & 10-Yr Allocator" },
                  ].map((sub) => (
                    <button
                      key={sub.id}
                      onClick={() => setActiveTab(sub.id)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                        activeTab === sub.id
                          ? "bg-indigo-600 text-white shadow-sm"
                          : "text-slate-400 hover:text-white"
                      }`}
                    >
                      {sub.label}
                    </button>
                  ))}
                </div>
                <span className="text-[11px] text-slate-400">
                  Workspace: <strong className="text-slate-200">Investments &amp; Property</strong>
                </span>
              </div>
            )}

            <div className="card-panel rounded-2xl px-4 py-2.5 flex flex-wrap items-center justify-between gap-2.5 border border-slate-800/80">
              {/* Global Modeling Lenses */}
              <div className="flex flex-wrap items-center gap-2 text-[11px]">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mr-1">
                  Lenses:
                </span>
                {partnerExpected > 0 && (
                  <button
                    onClick={() => setNetPartnerMode((v) => !v)}
                    className={`px-2.5 py-1 rounded-lg border font-semibold transition cursor-pointer ${
                      netPartnerMode
                        ? "bg-emerald-500/15 border-emerald-500/40 text-emerald-400"
                        : "bg-slate-900 border-slate-700 text-slate-300 hover:border-slate-500"
                    }`}
                    title={`Toggle all charts & spending totals between Net of ${partnerName}'s ${fmtCurrency(partnerExpected)}/mo share and Gross household outflows`}
                  >
                    {netPartnerMode ? `Net of ${partnerName} (−${fmtCompact(partnerExpected)}/mo)` : "Gross Housing"}
                  </button>
                )}
                <button
                  onClick={() =>
                    setHomeValuationMode(isCompsHomeMode ? "secular_inflation" : "comps_cooling")
                  }
                  className={`px-2.5 py-1 rounded-lg border font-semibold transition cursor-pointer ${
                    isCompsHomeMode
                      ? "bg-rose-500/15 border-rose-500/40 text-rose-400"
                      : "bg-indigo-500/15 border-indigo-500/40 text-indigo-400"
                  }`}
                  title="Toggle Primary Residence valuation across Command Center, Header NW, and Balance Sheet"
                >
                  {isCompsHomeMode ? `Home: Comps (${fmtCompact(compsHomeCfg)})` : `Home: Trend (${fmtCompact(secularHomeCfg)})`}
                </button>
              </div>

              {/* Instant Household Vital Jump Chips */}
              <div className="flex flex-wrap items-center gap-2 text-[11px]">
                <button
                  onClick={() => toggleInspector({ key: "vital-cards", type: "cards" })}
                  className={`px-2.5 py-1 rounded-lg border transition cursor-pointer flex items-center gap-1.5 ${
                    inspector?.type === "cards"
                      ? "bg-sky-500/20 border-sky-400 text-sky-300 font-bold"
                      : "bg-slate-900/80 border-slate-700 text-slate-300 hover:border-sky-500/50"
                  }`}
                  title="Checking cash + liquid money-market funds; click to open Cards & Liquidity Runway Inspector"
                >
                  <span className="text-sky-400">Cash + MMF</span>
                  <strong className="font-mono text-white">
                    {fmtCompact(net_worth.liquid_cash_with_mmf || net_worth.cash)}
                  </strong>
                  <span className="text-slate-400 font-mono">
                    ({net_worth.runway_with_mmf_months || "—"}m)
                  </span>
                </button>

                {Number(net_worth.mortgage_debt || 0) > 750000 && (
                  <button
                    onClick={() => setActiveTab("mortgage")}
                    className={`px-2.5 py-1 rounded-lg border transition cursor-pointer ${
                      activeTab === "mortgage"
                        ? "bg-amber-500/20 border-amber-400 text-amber-300 font-bold"
                        : "bg-slate-900/80 border-slate-700 text-amber-300 hover:border-amber-500/50"
                    }`}
                    title="Principal above IRS Pub 936 $750k cap receives no federal tax deduction"
                  >
                    {`Mortgage ${fmtCompact(Number(net_worth.mortgage_debt || 0) - 750000)} > $750k Cap →`}
                  </button>
                )}

                {Number(net_worth.monthly_rsu_vest_net || 0) > 0 && (
                  <button
                    onClick={() => setActiveTab("retirement")}
                    className={`px-2.5 py-1 rounded-lg border transition cursor-pointer ${
                      activeTab === "retirement"
                        ? "bg-purple-500/20 border-purple-400 text-purple-300 font-bold"
                        : "bg-slate-900/80 border-slate-700 text-purple-300 hover:border-purple-500/50"
                    }`}
                    title={`Unvested ${rsuSym} equity vesting pace net of tax withholding`}
                  >
                    Unvested {rsuSym} +{fmtCompact(net_worth.monthly_rsu_vest_net)}/mo net
                  </button>
                )}

                <button
                  onClick={() => {
                    setTxScopeMonth("all");
                    setActiveTab("transactions");
                  }}
                  className={`px-2.5 py-1 rounded-lg border transition cursor-pointer ${
                    activeTab === "transactions"
                      ? "bg-indigo-500/20 border-indigo-400 text-indigo-300 font-bold"
                      : "bg-slate-900/80 border-slate-700 text-slate-200 hover:border-indigo-400"
                  }`}
                  title="Search and pivot across all household transactions"
                >
                  Search All Txns
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ==================== WORKSPACE 1: BENTO COMMAND CENTER (OVERVIEW) ==================== */}
        {activeTab === "overview" && (
          <div className="space-y-6">
            {/* Asymmetric Bento Command Grid: 2x2 Hero Net Position + Stacked Flow & Liquidity + 1x2 Priority Queue */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-stretch">
              {/* HERO 2x2: Realized Net Worth & Property Comps */}
              <div
                onClick={() => toggleInspector({ key: "nw-main", type: "networth" })}
                className={`lg:col-span-5 bento-hero inspectable-card rounded-2xl p-6 flex flex-col justify-between ${
                  inspector?.type === "networth" ? "inspectable-active" : ""
                }`}
              >
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 text-indigo-400">
                      <BentoIcon name="wallet" className="w-4 h-4" />
                      <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                        Total Realized Net Worth
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setHomeValuationMode(isCompsHomeMode ? "secular_inflation" : "comps_cooling");
                        }}
                        className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-slate-800/80 border border-slate-700 text-slate-300 hover:border-indigo-400 transition"
                        title="Toggle Property Comps vs. Trend Valuation"
                      >
                        {isCompsHomeMode ? "Comps View" : "Trend View"}
                      </button>
                      <span className="badge bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 font-mono">
                        {nw12mDiff >= 0 ? "+" : ""}{nw12mPct}% YoY
                      </span>
                    </div>
                  </div>

                  <div className="text-3xl sm:text-4xl font-extrabold tracking-tight mt-2 text-white">
                    <MoneyHero value={activeNwTotal} />
                  </div>

                  <div className="mt-3 text-emerald-500" title="12-month realized net worth trajectory">
                    <Sparkline values={sparkNetWorth} color="#10b981" height={54} highlightIndex={nwIdx} />
                  </div>
                </div>

                <div className="mt-4 pt-3.5 border-t border-slate-800/70 space-y-1.5 text-xs text-slate-400">
                  <div className="flex justify-between">
                    <span>Liquid Portfolio + Cash (Ex-Home):</span>
                    <strong className="text-emerald-400 font-mono">{fmtCompact(net_worth.liquid_net_worth)}</strong>
                  </div>
                  <div className="flex justify-between">
                    <span>Home Equity ({homeShort}):</span>
                    <strong className="text-purple-400 font-mono">
                      +{fmtCompact(isCompsHomeMode ? net_worth.home_equity_comps : net_worth.home_equity)} ({fmtCompact(isCompsHomeMode ? net_worth.home_value_comps : net_worth.home_value)} - {fmtCompact(net_worth.mortgage_debt)})
                    </strong>
                  </div>
                  {Number(net_worth.unvested_rsu_gross || 0) > 0 && (
                    <div className="flex justify-between pt-0.5 text-[11px] text-indigo-300">
                      <span>Incoming Unvested {rsuSym} (Excl.):</span>
                      <strong className="font-mono">+{fmtCompact(net_worth.unvested_rsu_gross)} gross</strong>
                    </div>
                  )}
                  <div className="pt-1.5 text-[11px] font-semibold text-indigo-400 flex items-center justify-between">
                    <span>{inspector?.type === "networth" ? "✓ Inspecting Balance Sheet" : "Inspect Home + Balance Sheet"}</span>
                    <span>→</span>
                  </div>
                </div>
              </div>

              {/* MIDDLE COLUMN: Stacked 1x1 Operating Cash Flow + 1x1 Liquidity Runway */}
              <div className="lg:col-span-4 flex flex-col gap-4">
                {/* Partner-Adjusted Burn & Operating Cash Flow */}
                <div
                  onClick={() =>
                    toggleInspector({
                      key: `cf-kpi-${selectedMonth}`,
                      type: "cashflow",
                      month: selectedMonth,
                      txFilter: "all",
                    })
                  }
                  className={`card-panel inspectable-card rounded-2xl p-4 flex-1 flex flex-col justify-between ${
                    inspector?.key === `cf-kpi-${selectedMonth}` || inspector?.key === `sp-kpi-${selectedMonth}` ? "inspectable-active" : ""
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5 text-sky-400">
                        <BentoIcon name="trending" className="w-3.5 h-3.5" />
                        <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                          {fmtMonthLabel(selectedMonth)} Cash Flow &amp; Burn
                        </span>
                      </div>
                      <span className="badge bg-indigo-500/15 text-indigo-400 border border-indigo-500/30 font-mono">
                        In: {fmtCompact(kpis.income)}
                      </span>
                    </div>
                    <div className="flex items-baseline justify-between gap-2 mt-1.5">
                      <div>
                        <div className="text-[10px] text-slate-400">Net Spend ({netPartnerMode ? `Net of ${partnerName}` : "Gross"})</div>
                        <div className="text-xl font-extrabold text-white">
                          <MoneyHero value={netPartnerMode ? (kpis.spend_net_partner || kpis.spending) : kpis.spending} />
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-[10px] text-slate-400">Operating Net</div>
                        <div className={`text-sm font-bold font-mono ${kpis.net_savings >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                          {fmtCurrency(kpis.net_savings, true)}
                        </div>
                      </div>
                    </div>
                    <div className="mt-1.5">
                      <Sparkline values={sparkSpend} color="#818cf8" height={28} highlightIndex={cfIdx} />
                    </div>
                  </div>
                  <div className="mt-2 pt-2 border-t border-slate-800/70 flex items-center justify-between text-[11px] text-slate-400">
                    <span>Net Housing: <strong className="font-mono text-slate-200">{fmtCompact(kpis.net_housing_spend)}</strong> · Lifestyle <strong className="font-mono text-indigo-400">{fmtCompact(kpis.ex_housing_spend)}</strong></span>
                    <span className="text-indigo-400 font-semibold">Math →</span>
                  </div>
                </div>

                {/* Liquid Runway & Revolving Credit */}
                <div
                  onClick={() => toggleInspector({ key: "cards-main", type: "cards" })}
                  className={`card-panel inspectable-card rounded-2xl p-4 flex-1 flex flex-col justify-between ${
                    inspector?.type === "cards" ? "inspectable-active" : ""
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5 text-amber-400">
                        <BentoIcon name="shield" className="w-3.5 h-3.5" />
                        <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                          Liquid Runway &amp; Credit
                        </span>
                      </div>
                      <span className="badge bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 font-mono">
                        {net_worth.runway_with_mmf_months || net_worth.runway_months || "—"} mo Runway
                      </span>
                    </div>
                    <div className="flex items-baseline justify-between gap-2 mt-1.5">
                      <div>
                        <div className="text-[10px] text-slate-400">Cash + Money Market</div>
                        <div className="text-xl font-extrabold text-white">
                          <MoneyHero value={net_worth.liquid_cash_with_mmf || net_worth.cash} />
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-[10px] text-slate-400">{net_worth.card_count} Cards Float</div>
                        <div className="text-sm font-bold font-mono text-slate-200">
                          {fmtCompact(net_worth.credit_card_debt)} <span className="text-xs text-slate-400">({net_worth.cc_utilization_pct || 0}%)</span>
                        </div>
                      </div>
                    </div>
                    <div className="mt-1.5">
                      <Sparkline values={sparkCash} color="#f59e0b" height={28} highlightIndex={nwIdx} />
                    </div>
                  </div>
                  <div className="mt-2 pt-2 border-t border-slate-800/70 flex items-center justify-between text-[11px] text-slate-400">
                    <span>Checking {fmtCompact(net_worth.cash)} + MMF {fmtCompact(net_worth.mmf_cash || 0)}</span>
                    <span className="text-indigo-400 font-semibold">Cards →</span>
                  </div>
                </div>
              </div>

              {/* RIGHT 1x2: Linear-Style Priority Action Queue */}
              <div className="lg:col-span-3 card-panel rounded-2xl p-4 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-1.5">
                      <BentoIcon name="sparkles" className="w-3.5 h-3.5 text-indigo-400" />
                      <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                        Priority Queue
                      </span>
                    </div>
                    <span className="badge bg-indigo-500/15 text-indigo-300 font-mono">
                      {insights.length} Signals
                    </span>
                  </div>
                  <div className="space-y-2">
                    {insights.slice(0, 4).map((ins) => {
                      const dotCls =
                        ins.severity === "high"
                          ? "bg-rose-400"
                          : ins.severity === "medium"
                          ? "bg-amber-400"
                          : "bg-emerald-400";
                      return (
                        <button
                          key={ins.id}
                          onClick={() => handleInsightAction(ins)}
                          className="w-full text-left p-2.5 rounded-xl bg-slate-950/60 hover:bg-slate-900 border border-slate-800/80 hover:border-indigo-500/50 transition group"
                        >
                          <div className="flex items-start gap-2">
                            <span className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${dotCls}`} />
                            <div className="min-w-0 flex-1">
                              <div className="text-xs font-semibold text-white group-hover:text-indigo-300 truncate">
                                {ins.title}
                              </div>
                              <div className="text-[10.5px] text-slate-400 line-clamp-2 mt-0.5 leading-snug">
                                {ins.detail}
                              </div>
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
                <button
                  onClick={() => setActiveTab("spending")}
                  className="mt-3 pt-2.5 border-t border-slate-800/70 w-full flex items-center justify-between text-[11px] font-semibold text-indigo-400 hover:text-indigo-300"
                >
                  <span>Explore Cash Flow &amp; Matrix</span>
                  <span>→</span>
                </button>
              </div>
            </div>

            {/* Data Story: Month in Review (inverted pyramid) + Financial Independence Progress */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              <div className="lg:col-span-8 card-panel rounded-2xl p-5 border border-indigo-500/25">
                <div className="flex flex-wrap items-start justify-between gap-2 mb-3">
                  <div>
                    <span className="text-[11px] font-bold uppercase tracking-wider text-indigo-400">
                      📰 {fmtMonthLabel(selectedMonth)} in Review
                    </span>
                    <h2 className="text-base font-bold text-white">{storyHeadline}</h2>
                  </div>
                  <span className="text-[11px] text-slate-400">Auto-written from your data · click any line to drill in</span>
                </div>
                <div className="space-y-1.5">
                  {storyBullets.map((b, i) => (
                    <button
                      key={i}
                      onClick={b.action}
                      className={`w-full text-left px-3 py-2 rounded-xl border text-xs leading-relaxed flex items-start gap-2.5 transition group ${
                        b.tone === "good"
                          ? "border-emerald-500/20 hover:border-emerald-400/60 bg-emerald-500/5"
                          : b.tone === "bad"
                          ? "border-rose-500/20 hover:border-rose-400/60 bg-rose-500/5"
                          : "border-slate-700/50 hover:border-indigo-400/60"
                      }`}
                    >
                      <span className="shrink-0">{b.icon}</span>
                      <span className="flex-1 text-slate-300">{b.text}</span>
                      <span className="shrink-0 text-indigo-400 opacity-0 group-hover:opacity-100 transition">→</span>
                    </button>
                  ))}
                </div>
              </div>

              <div
                onClick={() => setActiveTab("retirement")}
                className="lg:col-span-4 card-panel inspectable-card rounded-2xl p-5 cursor-pointer"
                title={`4% rule: FI number = 25 × trailing-12-month spending (net of ${partnerName}). Click to open the full Retirement & FIRE model.`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">🏁 Financial Independence Progress</span>
                  <span className="badge bg-indigo-500/15 text-indigo-300 border border-indigo-500/30 font-mono">4% rule</span>
                </div>
                <div className="flex items-center gap-4 mt-3">
                  {(() => {
                    const r = 34, circ = 2 * Math.PI * r;
                    const p = Math.min(100, fiPct);
                    const pR = Math.min(100, fiPctWithRsu);
                    return (
                      <svg width="88" height="88" viewBox="0 0 88 88" className="shrink-0 -rotate-90">
                        <circle cx="44" cy="44" r={r} fill="none" stroke={isDark ? "rgba(51,65,85,0.5)" : "rgba(226,232,240,1)"} strokeWidth="9" />
                        <circle cx="44" cy="44" r={r} fill="none" stroke="#6366f1" strokeOpacity="0.35" strokeWidth="9" strokeDasharray={`${(pR / 100) * circ} ${circ}`} strokeLinecap="round" />
                        <circle cx="44" cy="44" r={r} fill="none" stroke="#10b981" strokeWidth="9" strokeDasharray={`${(p / 100) * circ} ${circ}`} strokeLinecap="round" />
                      </svg>
                    );
                  })()}
                  <div className="min-w-0">
                    <div className="text-3xl font-extrabold font-mono text-emerald-400">{fiPct.toFixed(0)}%</div>
                    <div className="text-[11px] text-slate-400">
                      of FI number <strong className="text-slate-200 font-mono">{fmtCompact(fiNumber)}</strong>
                    </div>
                    <div className="text-[11px] text-indigo-300">{fiPctWithRsu.toFixed(0)}% incl. unvested RSUs (after tax)</div>
                  </div>
                </div>
                <div className="mt-3 pt-3 border-t border-slate-800/70 space-y-1 text-xs text-slate-400">
                  <div className="flex justify-between">
                    <span>Portfolio could fund today (4%):</span>
                    <strong className="text-emerald-400 font-mono">{fmtCompact(passiveMonthly)}/mo</strong>
                  </div>
                  <div className="flex justify-between">
                    <span>vs. avg spend ({netPartnerMode ? `net of ${partnerName}` : "gross"}):</span>
                    <strong className="text-slate-200 font-mono">{fmtCompact(avgMonthlyNetSpend)}/mo</strong>
                  </div>
                  <div className="flex justify-between">
                    <span>Years of expenses covered:</span>
                    <strong className="text-slate-200 font-mono">{yearsCovered.toFixed(1)} yrs</strong>
                  </div>
                  <div className="flex justify-between">
                    <span>Est. time to FI (cash + RSU adds, 6%):</span>
                    <strong className="text-indigo-300 font-mono">
                      {monthsToFi === 0 ? "Reached 🎉" : monthsToFi === null ? "—" : `~${(monthsToFi / 12).toFixed(1)} yrs`}
                    </strong>
                  </div>
                </div>
              </div>
            </div>

            {/* Plain-English Household Checking Cash vs. True Wealth Equation */}
            <div className="card-panel rounded-2xl p-4 border border-slate-800/80 space-y-2.5 text-xs">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  🧮 Why Checking Looks Lean While Net Worth Soars — {fmtMonthLabel(selectedMonth)}
                </span>
                <button
                  onClick={() =>
                    openMonthInspector(selectedMonth, {
                      key: `eq-cf-${selectedMonth}`,
                      inspectorType: "cashflow",
                      txFilter: "all",
                      forceOpen: true,
                    })
                  }
                  className="text-[11px] font-semibold text-indigo-400 hover:text-indigo-300 cursor-pointer"
                >
                  Inspect Full Math →
                </button>
              </div>
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-2.5">
                <div className="px-3.5 py-2.5 rounded-xl bg-slate-900/60 border border-slate-800 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-1.5 text-slate-300">
                    <span className="font-bold text-sky-400 uppercase text-[10px]">1. Checking Flow:</span>
                    <span className="font-mono text-emerald-400">+{fmtCompact(kpis.income)}</span>
                    <span className="text-slate-400">inflows</span>
                    <span className="text-slate-500">−</span>
                    <span className="font-mono text-amber-300">{fmtCompact(kpis.housing_spend)}</span>
                    <span className="text-slate-400">
                      gross housing
                      {netPartnerMode ? ` (${fmtCompact(kpis.net_housing_spend)} net)` : ""}
                    </span>
                    <span className="text-slate-500">−</span>
                    <span className="font-mono text-indigo-300">{fmtCompact(kpis.ex_housing_spend)}</span>
                    <span className="text-slate-400">lifestyle</span>
                  </div>
                  <div className="font-mono font-bold">
                    <span className="text-slate-500 mr-1">=</span>
                    <span className={kpis.net_savings >= 0 ? "text-emerald-400" : "text-rose-400"}>
                      {fmtCurrency(kpis.net_savings, true)} Operating
                    </span>
                  </div>
                </div>

                <div className="px-3.5 py-2.5 rounded-xl bg-slate-900/60 border border-slate-800 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-1.5 text-slate-300">
                    <span className="font-bold text-purple-400 uppercase text-[10px]">2. True Wealth Built:</span>
                    <span className={`font-mono ${kpis.net_savings >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                      {fmtCompact(kpis.net_savings)}
                    </span>
                    <span className="text-slate-400">operating</span>
                    <span className="text-slate-500">+</span>
                    <span className="font-mono text-purple-400">
                      {fmtCompact(kpis.fidelity_extra_principal || 0)}
                    </span>
                    <span className="text-slate-400">Fidelity prin.</span>
                    <span className="text-slate-500">+</span>
                    <span className="font-mono text-emerald-400">
                      {fmtCompact(net_worth.monthly_rsu_vest_net || 49809)}
                    </span>
                    <span className="text-slate-400">net RSUs</span>
                  </div>
                  <div className="font-mono font-bold">
                    <span className="text-slate-500 mr-1">=</span>
                    <span className="text-emerald-400">
                      {fmtCurrency(
                        Number(kpis.net_savings || 0) +
                          Number(kpis.fidelity_extra_principal || 0) +
                          Number(net_worth.monthly_rsu_vest_net || 49809),
                        true
                      )}{" "}
                      Wealth
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Section 1: Net Worth Month-to-Month Trajectory & Balance Sheet Breakdown */}
            {renderNetWorthBreakdownSection()}

            {/* Section 2: Interactive Monthly Income, Cash Flow & Spending Explorer */}
            {renderMonthlySpendingExplorer()}

            {/* Section 2a: 12-Month Category × Top Merchant Cross-Dimensional Matrix */}
            {renderCrossDimensionalMatrix()}

            {/* Section 2b: Where Did the Money Go? — Interactive Cash Flow Sankey */}
            <div className="card-panel rounded-2xl p-5">
              <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
                <div>
                  <span className="text-[11px] font-bold uppercase tracking-wider text-indigo-400">🌊 Where did the money go?</span>
                  <h2 className="text-base font-bold text-white">
                    Cash Flow Map — {sankeyMode === "avg12" ? "12-Month Average" : fmtMonthLabel(selectedMonth)}
                  </h2>
                  <p className="text-xs text-slate-400">
                    Band width = dollars. Income sources flow into your cash pool, then out to categories{sankey.income > sankey.spend ? " and savings" : " (red band = drawn from savings)"}. Click any band to inspect its transactions.
                  </p>
                </div>
                <div className={`flex items-center p-1 rounded-xl border ${isDark ? "bg-slate-950 border-slate-800" : "bg-slate-100 border-slate-200"}`}>
                  {[
                    { id: "month", label: "Selected Month" },
                    { id: "avg12", label: "12-Mo Average" },
                  ].map((m) => (
                    <button
                      key={m.id}
                      onClick={() => setSankeyMode(m.id)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition ${
                        sankeyMode === m.id ? "bg-indigo-600 text-white shadow" : "text-slate-400 hover:text-slate-200"
                      }`}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
              </div>
              {sankey.flows.length > 1 && typeof Chart !== "undefined" && Chart.registry?.controllers?.get?.("sankey") ? (
                <ChartCanvas
                  type="sankey"
                  height={Math.max(320, 34 * Math.max(sankey.catCount, 4))}
                  isDark={isDark}
                  data={sankeyChartData}
                  onElementClick={handleSankeyClick}
                  options={{
                    plugins: {
                      legend: { display: false },
                      tooltip: {
                        callbacks: {
                          label: (ctx) => {
                            const d = ctx.raw || {};
                            const nm = (k) => String(k || "").split(":").slice(1).join(":");
                            return ` ${nm(d.from)} → ${nm(d.to)}: ${fmtCurrency(d.flow)}`;
                          },
                        },
                      },
                    },
                  }}
                />
              ) : (
                <div className="py-10 text-center text-xs text-slate-400">Cash flow map unavailable (no flows or Sankey plugin not loaded).</div>
              )}
            </div>

            {/* Section 3: Cash Flow & Housing Math Waterfall + Needs Attention & Insights */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* Left 7 Cols: Selected Month Cash Flow, Partner Offset & Extra Mortgage Principal */}
              <div className="lg:col-span-7 card-panel rounded-2xl p-5 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-800">
                  <div>
                    <span className="text-[11px] font-bold uppercase tracking-wider text-indigo-400">
                      Complete Monthly Cash Flow &amp; Housing Equation ({selectedMonth})
                    </span>
                    <h2 className="text-base font-bold text-white">
                      Income Inflows vs. Housing ({partnerName} Offset + Extra Principal) &amp; Lifestyle
                    </h2>
                  </div>
                  <button
                    onClick={() =>
                      toggleInspector({
                        key: `cf-waterfall-${selectedMonth}`,
                        type: "cashflow",
                        month: selectedMonth,
                        txFilter: "all",
                      })
                    }
                    className="px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold shadow-sm transition"
                  >
                    Open Full Ledger in Right Bar →
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Column A: Income Side */}
                  <div className="p-4 rounded-xl bg-slate-950/70 border border-slate-800 space-y-2.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold uppercase tracking-wider text-emerald-400">
                        1. Total Cash Inflows ({selectedMonth})
                      </span>
                      <span className="text-sm font-extrabold font-mono text-emerald-400">
                        +{fmtCurrency(kpis.income)}
                      </span>
                    </div>
                    <div className="space-y-2 pt-1">
                      {(curIb.sources || []).map((s) => (
                        <div
                          key={s.kind}
                          onClick={() =>
                            toggleInspector({
                              key: `cf-inc-${s.kind}-${selectedMonth}`,
                              type: "cashflow",
                              month: selectedMonth,
                              txFilter: "income",
                            })
                          }
                          className="p-2.5 rounded-lg bg-slate-900/90 border border-slate-800/80 hover:border-emerald-500/40 cursor-pointer transition flex items-center justify-between text-xs"
                        >
                          <div>
                            <div className="font-bold text-white">{s.label}</div>
                            <div className="text-[10px] text-slate-400">
                              {s.kind === "partner"
                                ? `${partnerName}'s ${fmtCurrency(partnerMortExp)} mortgage + ${fmtCurrency(partnerHoaExp)} HOA share`
                                : s.kind === "payroll"
                                ? `${employerShort} direct deposit`
                                : `${s.share_pct}% of monthly inflows`}
                            </div>
                          </div>
                          <div className="text-right font-mono font-bold text-emerald-400">
                            +{fmtCurrency(s.amount)}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Column B: Housing, Partner Offset & Extra Principal */}
                  <div className="p-4 rounded-xl bg-slate-950/70 border border-slate-800 space-y-2.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold uppercase tracking-wider text-indigo-400">
                        2. Housing &amp; Mortgage Math
                      </span>
                      <span className="badge bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 font-mono">
                        Net: {fmtCurrency(curHb.net_housing || 0)}/mo
                      </span>
                    </div>

                    <div className="space-y-1.5 text-xs pt-1">
                      <div className="flex justify-between py-1 border-b border-slate-800/70">
                        <span className="text-slate-300">Monthly Mortgage P&amp;I:</span>
                        <span className="font-mono font-bold text-white">{fmtCurrency(curHb.mortgage_pi || uiProfile.monthly_pi || 0)}</span>
                      </div>
                      <div className="flex justify-between py-1 border-b border-slate-800/70">
                        <span className="text-slate-300">HOA Dues (Regular):</span>
                        <span className="font-mono font-bold text-white">{fmtCurrency(curHb.hoa_regular || uiProfile.monthly_hoa || 0)}</span>
                      </div>
                      {curHb.hoa_special_assessment > 0 && (
                        <div className="flex justify-between py-1 border-b border-slate-800/70">
                          <span className="text-amber-400">HOA Special Assessment:</span>
                          <span className="font-mono font-bold text-amber-400">{fmtCurrency(curHb.hoa_special_assessment)}</span>
                        </div>
                      )}
                      {partnerExpected > 0 && (
                        <div className="flex justify-between py-1 border-b border-slate-800/70">
                          <span className="text-emerald-400 font-medium">
                            Less {partnerName} Share ({fmtCurrency(partnerMortExp)} + {fmtCurrency(partnerHoaExp)}):
                          </span>
                          <span className="font-mono font-bold text-emerald-400">
                            -{fmtCurrency(curHb.partner_expected_total ?? partnerExpected)}
                          </span>
                        </div>
                      )}
                      <div className="flex justify-between py-1.5 px-2 rounded-lg bg-indigo-500/10 border border-indigo-500/30">
                        <span className="font-bold text-white">= Net Baseline Housing:</span>
                        <span className="font-mono font-extrabold text-indigo-400">
                          {fmtCurrency(curHb.net_housing || 0)}
                        </span>
                      </div>
                      <div
                        onClick={() =>
                          toggleInspector({
                            key: `cf-prin-${selectedMonth}`,
                            type: "cashflow",
                            month: selectedMonth,
                            txFilter: "principal",
                          })
                        }
                        className="flex justify-between py-1.5 px-2 rounded-lg bg-purple-500/10 border border-purple-500/30 cursor-pointer hover:border-purple-400 transition"
                        title={`Click to inspect all extra mortgage principal prepayments (${extraFrom})`}
                      >
                        <span className="font-semibold text-purple-300">
                          + Extra Principal ({selectedMonth} / YTD):
                        </span>
                        <span className="font-mono font-bold text-purple-300">
                          {fmtCurrency(curHb.fidelity_extra_principal || 0)} / {fmtCompact(curHb.ytd_fidelity_extra_principal || 0)}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Right 5 Cols: Ranked Insights & Action Feed (Click any insight to open Right-Hand Inspector) */}
              <div className="lg:col-span-5 card-panel rounded-2xl p-5 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <h2 className="text-sm font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2">
                      <span>⚡ Needs Attention & Insights ({insights.length})</span>
                    </h2>
                    <span className="text-[11px] text-slate-400">Click any item to inspect →</span>
                  </div>

                  <div className="space-y-2.5 max-h-[330px] overflow-y-auto pr-1">
                    {insights.slice(0, 7).map((item) => {
                      const isHigh = item.severity === "high";
                      const isPos = item.severity === "positive";
                      const insKey = `insight-${item.id}`;
                      const isSelected = inspector?.key === insKey;
                      return (
                        <div
                          key={item.id}
                          onClick={() => handleInsightAction(item)}
                          className={`p-3 rounded-xl border transition cursor-pointer flex items-start justify-between gap-3 ${
                            isSelected
                              ? "border-indigo-500 ring-1 ring-indigo-500/40 bg-indigo-950/30"
                              : isHigh
                              ? "bg-rose-950/20 border-rose-800/40 hover:border-rose-600"
                              : isPos
                              ? "bg-emerald-950/20 border-emerald-800/40 hover:border-emerald-600"
                              : "bg-slate-900/80 border-slate-800 hover:border-indigo-500/50"
                          }`}
                        >
                          <div className="space-y-0.5">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-xs font-bold text-white">{item.title}</span>
                              <span className={`badge ${
                                isHigh ? "bg-rose-500/20 text-rose-400" : isPos ? "bg-emerald-500/20 text-emerald-400" : "bg-amber-500/20 text-amber-400"
                              }`}>
                                {item.severity}
                              </span>
                            </div>
                            <p className="text-xs text-slate-400 leading-relaxed">{item.detail}</p>
                          </div>
                          <span className="text-indigo-400 text-xs shrink-0 font-bold">
                            {isSelected ? "✕" : "→"}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ==================== TAB 2: SPENDING & BUDGET MATRIX ==================== */}
        {activeTab === "spending" && (
          <div className="space-y-6">
            {/* Sister Dashboard Bridge Banner */}
            <div className="card-panel rounded-2xl p-4 border border-emerald-500/30 bg-gradient-to-r from-emerald-950/40 via-slate-900 to-indigo-950/40 flex flex-wrap items-center justify-between gap-3">
              <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <span className="badge bg-emerald-500/20 text-emerald-300">SISTER DASHBOARD</span>
                  <span className="text-xs font-bold text-white">
                    Delivery &amp; Restaurant Spend vs. Modular Home Prep &amp; Biomarker Labs
                  </span>
                </div>
                <p className="text-[11px] text-slate-300">
                  Compare clinical biomarker panels, 10-minute weeknight kitchen prep systems, training macro targets, grocery routing, and dining ROI.
                </p>
              </div>
              <button
                onClick={() => {
                  setActiveTab("kitchen");
                  try { window.history.replaceState(null, "", "/kitchen"); } catch (e) {}
                }}
                className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-xs font-bold text-white shadow shrink-0 transition"
              >
                🥗 Open Fuel, Labs &amp; Kitchen Sister Dashboard →
              </button>
            </div>
            {/* Interactive Monthly Spending Graph & Click-to-Inspect Deep-Dive */}
            {renderMonthlySpendingExplorer()}

            {/* 12-Month Category × Top Merchant Cross-Dimensional Matrix */}
            {renderCrossDimensionalMatrix()}

            {/* Monthly Pacing & Forecast Banner */}
            <div className="card-panel rounded-2xl p-5">
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 divide-y sm:divide-y-0 sm:divide-x divide-slate-800">
                <div className="space-y-1">
                  <div className="text-[11px] font-bold text-slate-400 uppercase">Current Spend to Date</div>
                  <div className="text-xl font-bold">{fmtCurrency(spending.pace.spend_to_date)}</div>
                  <div className="text-xs text-slate-400">
                    {meta.period.days_elapsed} of {meta.period.days_in_month} days ({meta.period.pct_of_month_elapsed}%)
                  </div>
                </div>

                <div className="sm:pl-4 space-y-1">
                  <div className="text-[11px] font-bold text-slate-400 uppercase">Projected Month-End</div>
                  <div className="text-xl font-bold text-indigo-400">{fmtCurrency(spending.pace.forecast)}</div>
                  <div className="text-xs text-slate-400">
                    Run-rate: {fmtCurrency(spending.pace.daily_avg)} / day
                  </div>
                </div>

                <div className="sm:pl-4 space-y-1">
                  <div className="text-[11px] font-bold text-slate-400 uppercase">Total Monthly Budget</div>
                  <div className="text-xl font-bold">{fmtCurrency(spending.pace.total_budget)}</div>
                  <div className="text-xs text-slate-400">
                    {spending.pace.budget_used_pct || 0}% allocated
                  </div>
                </div>

                <div className="sm:pl-4 space-y-1">
                  <div className="text-[11px] font-bold text-slate-400 uppercase">Fixed vs Discretionary</div>
                  <div className="text-xl font-bold">{fmtCompact(spending.totals.fixed)} <span className="text-xs text-slate-400 font-normal">({spending.totals.fixed_pct}%)</span></div>
                  <div className="text-xs text-slate-400">
                    Discretionary: {fmtCompact(spending.totals.discretionary)}
                  </div>
                </div>
              </div>
            </div>

            {/* Change Attribution / Drivers Waterfall */}
            <div className="card-panel rounded-2xl p-5">
              <div className="mb-4">
                <h3 className="text-sm font-bold uppercase tracking-wider text-slate-400">
                  Spending Change Attribution (vs 3-Month Baseline)
                </h3>
                <p className="text-xs text-slate-400">Identifies which categories and merchants caused spending to shift</p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                {spending.attribution.slice(0, 4).map((att) => {
                  const isUp = att.diff > 0;
                  const topD = att.drivers && att.drivers[0];
                  return (
                    <div
                      key={att.category}
                      onClick={() => fetchCategoryDetail(att.category)}
                      className="p-3.5 rounded-xl border border-slate-800 bg-slate-900/60 dark:bg-slate-900/60 hover:border-indigo-500 cursor-pointer transition space-y-1.5"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-xs">{att.category}</span>
                        <span className={`badge ${isUp ? "bg-rose-500/15 text-rose-400" : "bg-emerald-500/15 text-emerald-400"}`}>
                          {isUp ? "▲" : "▼"} {fmtCurrency(att.diff, true)}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-400">
                        {topD ? (
                          <>Driven by <strong className="text-slate-200">{topD.merchant}</strong> ({topD.diff > 0 ? `+${fmtCurrency(topD.diff)}` : fmtCurrency(topD.diff)})</>
                        ) : (
                          <>Broad category shift</>
                        )}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Month-over-Month Category Spending & Budget Table */}
            <div className="card-panel rounded-2xl p-5 overflow-x-auto">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-sm font-bold uppercase tracking-wider text-slate-400">
                    Category Spending & Budget Targets ({selectedMonth})
                  </h3>
                  <p className="text-xs text-slate-400">
                    Click any category to open its full 12-month trajectory drawer. Click any budget to adjust.
                  </p>
                </div>
              </div>

              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-400 uppercase text-[10px]">
                    <th className="py-2.5 px-3">Category</th>
                    <th className="py-2.5 px-3 text-right">Spend</th>
                    <th className="py-2.5 px-3 text-right">Prior Month</th>
                    <th className="py-2.5 px-3 text-right">MoM Change</th>
                    <th className="py-2.5 px-3 text-right">3M Baseline</th>
                    <th className="py-2.5 px-3">Top Merchant Driver</th>
                    <th className="py-2.5 px-3">Monthly Budget</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {spending.categories.map((cat) => {
                    const isUp = cat.mom_diff > 0;
                    return (
                      <tr
                        key={cat.category}
                        onClick={() => fetchCategoryDetail(cat.category)}
                        className="hover:bg-slate-800/30 cursor-pointer transition"
                      >
                        <td className="py-3 px-3 font-semibold">
                          <div className="flex items-center gap-2">
                            <span>{cat.category}</span>
                            {cat.is_fixed && (
                              <span className="text-[9px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400">Fixed</span>
                            )}
                          </div>
                        </td>
                        <td className="py-3 px-3 text-right font-bold">{fmtCurrency(cat.spend)}</td>
                        <td className="py-3 px-3 text-right text-slate-400">{fmtCurrency(cat.prev_spend)}</td>
                        <td className="py-3 px-3 text-right">
                          <span className={`badge ${
                            isUp ? "bg-rose-500/15 text-rose-400" : cat.mom_diff < 0 ? "bg-emerald-500/15 text-emerald-400" : "bg-slate-800 text-slate-400"
                          }`}>
                            {isUp ? "▲" : cat.mom_diff < 0 ? "▼" : "•"} {fmtCurrency(cat.mom_diff, true)}
                          </span>
                        </td>
                        <td className="py-3 px-3 text-right text-slate-400">{fmtCurrency(cat.avg_3m_spend)}</td>
                        <td className="py-3 px-3 text-slate-300">
                          {cat.top_driver ? (
                            <span>
                              <strong className="text-slate-100">{cat.top_driver.merchant}</strong>{" "}
                              <span className="text-rose-400">(+{fmtCurrency(cat.top_driver.diff)})</span>
                            </span>
                          ) : (
                            <span className="text-slate-500">—</span>
                          )}
                        </td>
                        <td className="py-3 px-3 w-56" onClick={(e) => e.stopPropagation()}>
                          {editingBudgetCat === cat.category ? (
                            <div className="flex items-center gap-1.5">
                              <input
                                type="number"
                                value={editingBudgetVal}
                                onChange={(e) => setEditingBudgetVal(e.target.value)}
                                className="w-24 px-2 py-1 rounded bg-slate-950 border border-indigo-500 text-white text-xs"
                                autoFocus
                              />
                              <button
                                onClick={() => handleSaveBudget(cat.category)}
                                className="px-2 py-1 rounded bg-indigo-600 text-white text-[10px] font-semibold"
                              >
                                Save
                              </button>
                            </div>
                          ) : (
                            <div
                              onClick={() => {
                                setEditingBudgetCat(cat.category);
                                setEditingBudgetVal(cat.budget);
                              }}
                              className="space-y-1 group"
                              title="Click to edit budget"
                            >
                              <div className="flex justify-between text-[11px]">
                                <span className="text-slate-400 group-hover:text-indigo-400">
                                  {cat.budget > 0 ? fmtCurrency(cat.budget) : "Set Target ✎"}
                                </span>
                                {cat.budget > 0 && (
                                  <span className={cat.budget_pct > 100 ? "text-rose-400 font-bold" : "text-slate-300"}>
                                    {cat.budget_pct}%
                                  </span>
                                )}
                              </div>
                              {cat.budget > 0 && (
                                <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                                  <div
                                    className={`h-full rounded-full ${
                                      cat.budget_pct > 100 ? "bg-rose-500" : cat.budget_pct > 85 ? "bg-amber-500" : "bg-emerald-500"
                                    }`}
                                    style={{ width: `${Math.min(100, cat.budget_pct)}%` }}
                                  />
                                </div>
                              )}
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Recurring Subscriptions Box */}
            <div className="card-panel rounded-2xl p-5">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h3 className="text-sm font-bold uppercase tracking-wider text-slate-400">
                    Detected Recurring Subscriptions & Fixed Bills
                  </h3>
                  <p className="text-xs text-slate-400">
                    Total active: <strong className="text-white">{recurring.active_count} subscriptions</strong> ({fmtCurrency(recurring.monthly_total)}/mo • {fmtCurrency(recurring.annual_total)}/yr)
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {recurring.items.map((sub, idx) => (
                  <div key={idx} className="p-3 rounded-xl border border-slate-800 bg-slate-900/70 flex items-center justify-between text-xs">
                    <div>
                      <div className="font-semibold text-white">{sub.merchant}</div>
                      <div className="text-[10px] text-slate-400">
                        {sub.cadence} • {sub.category}
                        {sub.price_change && (
                          <span className="text-rose-400 ml-1">
                            (up +{sub.price_change.pct}%)
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-bold text-white">{fmtCurrency(sub.amount)}</div>
                      <div className="text-[10px] text-slate-400">{fmtCurrency(sub.annual_cost)}/yr</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ==================== TAB 3: INVESTMENTS & WEALTH ==================== */}
        {activeTab === "investments" && (
          <div className="space-y-6">
            {/* Portfolio Header Stats */}
            <div className="card-panel rounded-2xl p-5 flex flex-wrap items-center justify-between gap-4">
              <div>
                <h2 className="text-base font-bold">
                  Investment Portfolio &amp; Property Equity
                </h2>
                <p className="text-xs text-slate-400">
                  Track vested equities, retirement/HSA accounts, {homeFull}, and House vs. Stock Market returns
                </p>
              </div>
              <div className="flex items-center gap-2.5">
                <button
                  onClick={() => setActiveTab("mortgage")}
                  className="px-3.5 py-2 rounded-xl bg-purple-600/20 hover:bg-purple-600/30 border border-purple-500/40 text-purple-300 text-xs font-bold transition"
                >
                  🏡 Open Home &amp; Mortgage Tab →
                </button>
                <button
                  onClick={handleSyncMarketPrices}
                  disabled={syncingPrices}
                  className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-bold shadow flex items-center gap-2 transition"
                >
                  <span>{syncingPrices ? "⏳ Syncing..." : "⚡ Sync Live Market Prices"}</span>
                </button>
                <button
                  onClick={() => setShowHoldingModal(true)}
                  className="px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition"
                >
                  + Add Position
                </button>
              </div>
            </div>

            {/* Investment KPIs (5 Cards including Primary Residence Home Equity with 2-Mode Valuation Toggle) */}
            {(() => {
              const hi = investments.home_investment || {};
              const isCompsMode = homeValuationMode === "comps_cooling";
              const activeHomeVal = isCompsMode ? (hi.estimated_value_comps || compsHomeCfg) : (hi.estimated_value_secular || secularHomeCfg);
              const activeHomeEq = isCompsMode ? (hi.market_equity_comps || 0) : (hi.market_equity || 0);
              const activeHomeApprec = isCompsMode ? (hi.appreciation_comps_dollars ?? 0) : (hi.appreciation_dollars ?? 0);
              const activeHomeApprecPct = isCompsMode ? (hi.appreciation_comps_pct ?? 0) : (hi.appreciation_pct ?? 0);
              const activeCombinedEq = (investments.total_value || 0) + activeHomeEq;
              const activeCombinedGross = (investments.total_value || 0) + activeHomeVal;
              const vViews = hi.valuation_views || {};
              const activeViewObj = vViews[homeValuationMode] || vViews.comps_cooling || {};
              const activeStrats = activeViewObj.ten_year_strategies || hi.ten_year_allocation_comparison || {};
              const compsRows = hi.local_market_comps || [];
              const waTax = hi.wa_tax_regime || {};
              const hvmDetails = hi.house_vs_market || {};

              return (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
                    <div className="card-panel rounded-2xl p-4 border-l-4 border-l-emerald-500">
                      <div className="text-[11px] font-bold text-emerald-400 uppercase">Total Portfolio + Home Equity</div>
                      <div className="text-xl font-extrabold mt-1.5 font-mono text-white">
                        {fmtCurrency(activeCombinedEq)}
                      </div>
                      <div className="text-[11px] text-slate-400 mt-1.5">
                        Gross Assets: <strong>{fmtCompact(activeCombinedGross)}</strong> (-{fmtCompact(hi.current_mortgage || net_worth.mortgage_debt || 0)} Mtg)
                      </div>
                    </div>

                    <div className="card-panel rounded-2xl p-4">
                      <div className="text-[11px] font-bold text-slate-400 uppercase">Financial Securities (Vested)</div>
                      <div className="text-xl font-bold mt-1.5 font-mono">{fmtCurrency(investments.total_value)}</div>
                      <div className="text-[11px] text-slate-400 mt-1.5">
                        Cost Basis: {fmtCompact(investments.total_cost_basis)} • Gain:{" "}
                        <strong className="text-emerald-400">{fmtCompact(investments.total_gain_dollars)} (+{investments.total_gain_pct}%)</strong>
                      </div>
                    </div>

                    <div className="card-panel rounded-2xl p-4 border border-purple-500/30 bg-purple-950/15">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-bold text-purple-300 uppercase">Home Equity ({isCompsMode ? "Comps" : "Trend"})</span>
                        <span className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded ${activeHomeApprec >= 0 ? "bg-emerald-500/20 text-emerald-300" : "bg-rose-500/20 text-rose-300"}`}>
                          {activeHomeApprec >= 0 ? `+${activeHomeApprecPct}%` : `${activeHomeApprecPct}%`}
                        </span>
                      </div>
                      <div className="text-xl font-extrabold mt-1.5 font-mono text-purple-300">
                        {fmtCurrency(activeHomeEq)}
                      </div>
                      <div className="text-[11px] text-slate-300 mt-1.5">
                        Est. <strong>{fmtCompact(activeHomeVal)}</strong> (Cost Basis {fmtCompact(hi.cost_basis_equity || 0)}) - <strong>{fmtCompact(hi.current_mortgage || 0)}</strong> Mtg
                      </div>
                    </div>

                    <div className="card-panel rounded-2xl p-4">
                      <div className="text-[11px] font-bold text-slate-400 uppercase">Combined Unrealized Gain</div>
                      <div className="text-xl font-bold mt-1.5 font-mono text-emerald-400">
                        +{fmtCurrency((investments.total_gain_dollars || 0) + activeHomeApprec)}
                      </div>
                      <div className="text-[11px] text-slate-400 mt-1.5">
                        +{fmtCompact(investments.total_gain_dollars)} Stocks •{" "}
                        <span className={activeHomeApprec >= 0 ? "text-emerald-400 font-semibold" : "text-rose-400 font-semibold"}>
                          {activeHomeApprec >= 0 ? `+${fmtCompact(activeHomeApprec)}` : fmtCompact(activeHomeApprec)} Home
                        </span>
                      </div>
                    </div>

                    <div className="card-panel rounded-2xl p-4 border border-indigo-500/40 bg-indigo-950/20">
                      <div className="text-[11px] font-bold text-indigo-300 uppercase">Incoming Unvested {rsuSym} (Excl.)</div>
                      <div className="text-xl font-bold mt-1.5 font-mono text-indigo-300">
                        +{fmtCurrency(investments.unvested_rsu_value || 0)}
                      </div>
                      <div className="text-[11px] text-slate-300 mt-1.5">
                        <strong>+{fmtCompact(investments.unvested_rsu_net_value || 0)} net</strong> after withholding
                      </div>
                    </div>
                  </div>

                  {/* Primary Residence Real Estate, 2-Mode Valuation Comps & 10-Year Allocation Strategies */}
                  <div className="card-panel rounded-2xl p-5 border border-purple-500/30 bg-gradient-to-r from-purple-950/25 via-slate-900 to-indigo-950/25 space-y-5">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="badge bg-purple-500/20 text-purple-300 border border-purple-500/40">
                            Real Estate Valuation &amp; 10-Yr Allocation Strategies
                          </span>
                          <span className="badge bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-mono">
                            {hi.address || homeFull}
                          </span>
                          {isWaTax && (
                            <span className="badge bg-amber-500/20 text-amber-300 border border-amber-500/40 font-mono">
                              WA 2028 9.9% Tax Modeled
                            </span>
                          )}
                        </div>
                        <h3 className="text-base font-bold text-white mt-1.5">
                          Property Valuation (Comps vs. Trend) &amp; 10-Year House vs. Stock Market Comparison
                        </h3>
                        <p className="text-xs text-slate-300 mt-0.5">
                          Bought <strong>{hi.purchase_date || ""} for {fmtCurrency(hi.purchase_price || 0)}</strong> ({fmtCompact(hi.initial_down_payment || 0)} down + {fmtCompact(hi.principal_paid_down || 0)} principal paid = <strong>{fmtCurrency(hi.cost_basis_equity || 0)} equity basis</strong>). Compare <strong>View A: Local Comps ({fmtCurrency(hi.estimated_value_comps || compsHomeCfg)})</strong> vs. <strong>View B: Long-Term Trend ({fmtCurrency(hi.estimated_value_secular || secularHomeCfg)})</strong>.
                        </p>
                      </div>

                      {/* 2-Mode Home Valuation Toggle */}
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="flex items-center bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs">
                          <button
                            onClick={() => setHomeValuationMode("comps_cooling")}
                            className={`px-3 py-1.5 rounded-lg font-bold transition ${
                              isCompsMode
                                ? "bg-rose-600 text-white shadow"
                                : "text-slate-400 hover:text-white"
                            }`}
                          >
                            📉 {hi.valuation_views?.comps_cooling?.short_label || `Local Comps (${fmtCompact(compsHomeCfg)})`}
                          </button>
                          <button
                            onClick={() => setHomeValuationMode("secular_inflation")}
                            className={`px-3 py-1.5 rounded-lg font-bold transition ${
                              !isCompsMode
                                ? "bg-emerald-600 text-white shadow"
                                : "text-slate-400 hover:text-white"
                            }`}
                          >
                            📈 {hi.valuation_views?.secular_inflation?.short_label || `Inflation Trend (${fmtCompact(secularHomeCfg)})`}
                          </button>
                        </div>
                        <button
                          onClick={() => setActiveTab("mortgage")}
                          className="px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold shadow transition"
                        >
                          Open Full Home &amp; Mortgage Tab →
                        </button>
                      </div>
                    </div>

                    {/* Two-Column Critical Valuation Evidence: Explanation + Local Comps Table */}
                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 text-xs">
                      <div className="lg:col-span-5 p-4 rounded-xl bg-slate-950/90 border border-slate-800 space-y-2.5">
                        <div className="flex items-center justify-between">
                          <span className="font-bold uppercase tracking-wider text-purple-300">
                            {activeViewObj.label || "Active Valuation Model"}
                          </span>
                          <span className={`font-mono font-bold px-2 py-0.5 rounded ${isCompsMode ? "bg-rose-500/20 text-rose-300" : "bg-emerald-500/20 text-emerald-300"}`}>
                            Est. {fmtCurrency(activeHomeVal)}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-300 leading-relaxed">
                          {activeViewObj.rationale}
                        </p>
                        <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-800/80 font-mono text-[11px]">
                          <div>
                            <span className="text-slate-400 block font-sans">Cash Invested (Basis):</span>
                            <strong className="text-white">$740,000 ($470k + $270k)</strong>
                          </div>
                          <div>
                            <span className="text-slate-400 block font-sans">Market Equity Today:</span>
                            <strong className={isCompsMode ? "text-rose-300" : "text-emerald-400"}>
                              {fmtCurrency(activeHomeEq)} ({activeHomeApprec >= 0 ? `+$${(activeHomeApprec/1000).toFixed(0)}k` : `-$${Math.abs(activeHomeApprec/1000).toFixed(0)}k`} vs basis)
                            </strong>
                          </div>
                          <div>
                            <span className="text-slate-400 block font-sans">5-Yr Projected Value:</span>
                            <strong className="text-slate-200">{fmtCurrency(activeViewObj.projected_home_value_5yr || 1628519)}</strong>
                          </div>
                          <div>
                            <span className="text-slate-400 block font-sans">10-Yr Projected Value:</span>
                            <strong className="text-indigo-300">{fmtCurrency(activeViewObj.projected_home_value_10yr || 1798017)}</strong>
                          </div>
                        </div>
                      </div>

                      {/* Local Comparable Sales & Assessment Table */}
                      <div className="lg:col-span-7 p-4 rounded-xl bg-slate-950/90 border border-slate-800 overflow-x-auto">
                        <div className="flex items-center justify-between mb-2">
                          <span className="font-bold uppercase tracking-wider text-slate-300">
                            {hi.neighborhood || homeNeighborhood} — Comparable Sales &amp; Valuations
                          </span>
                        </div>
                        <table className="w-full text-left border-collapse text-[11px] font-mono">
                          <thead>
                            <tr className="border-b border-slate-800 text-[10px] uppercase text-slate-400 font-sans">
                              <th className="py-1.5 px-2">Property / Source</th>
                              <th className="py-1.5 px-2">Date / Ref</th>
                              <th className="py-1.5 px-2">Specs</th>
                              <th className="py-1.5 px-2 text-right">Value / Price</th>
                              <th className="py-1.5 px-2 text-right">$/SqFt</th>
                              <th className="py-1.5 px-2 text-right">vs. Purchase</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-800/60">
                            {compsRows.map((c, idx) => (
                              <tr key={idx} className={idx === 1 ? "bg-rose-950/25" : idx === 0 ? "bg-indigo-950/25" : ""}>
                                <td className="py-1.5 px-2 font-sans font-semibold text-white">{c.address}</td>
                                <td className="py-1.5 px-2 text-slate-300">{c.date}</td>
                                <td className="py-1.5 px-2 font-sans text-slate-400">{c.specs}</td>
                                <td className="py-1.5 px-2 text-right font-bold text-white">{fmtCurrency(c.price)}</td>
                                <td className="py-1.5 px-2 text-right text-slate-300">${c.price_per_sqft}/sf</td>
                                <td className={`py-1.5 px-2 text-right font-bold ${c.delta_vs_purchase_pct < 0 ? "text-rose-400" : "text-slate-400"}`}>
                                  {c.delta_vs_purchase_pct === 0 ? "Baseline" : `${c.delta_vs_purchase_pct}%`}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    {/* 3 Return Hurdle Cards (IRS $750k Cap vs. Equities vs. State Tax Context) */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
                      <div className="p-4 rounded-xl bg-slate-950/85 border border-emerald-500/40 space-y-1.5">
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] font-bold uppercase text-emerald-400">
                            1. Principal Above $750k IRS Cap
                          </span>
                          <span className="badge bg-emerald-500/20 text-emerald-300 font-mono">
                            {Number(hvmDetails.unbenefited_mortgage_above_750k || 0) > 0 ? "House Wins" : "All Deductible"}
                          </span>
                        </div>
                        <div className="text-lg font-extrabold font-mono text-white">
                          {(hvmDetails.rate_above_750k_after_tax_pct || 0).toFixed(2)}% Guaranteed After-Tax
                        </div>
                        <div className="text-[11px] text-slate-300 leading-relaxed">
                          Under IRS Pub 936, mortgage debt above <strong>$750,000</strong> gets <strong>0% federal tax deduction</strong> ({fmtCompact(hvmDetails.unbenefited_mortgage_above_750k || 0)} currently above cap). Paying down debt above $750k earns your full note rate after tax (<strong>{(hvmDetails.rate_above_750k_pretax_stock_equiv_pct || 0).toFixed(2)}% pre-tax stock equiv.</strong>).
                        </div>
                      </div>

                      <div className="p-4 rounded-xl bg-slate-950/85 border border-indigo-500/40 space-y-1.5">
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] font-bold uppercase text-indigo-400">
                            2. Dollars Below $750,000 ($750k → $0)
                          </span>
                          <span className="badge bg-indigo-500/20 text-indigo-300 font-mono">Stock Market Hurdle</span>
                        </div>
                        <div className="text-lg font-extrabold font-mono text-white">
                          {(hvmDetails.expected_stock_after_tax_pct || 6.8).toFixed(2)}% Stocks vs. {(hvmDetails.rate_below_750k_after_tax_pct || 0).toFixed(2)}% House
                        </div>
                        <div className="text-[11px] text-slate-300 leading-relaxed">
                          Below <strong>$750,000</strong>, deductible interest lowers effective mortgage cost to <strong>{(hvmDetails.rate_below_750k_after_tax_pct || 0).toFixed(2)}% after tax</strong> vs. <strong>{(hvmDetails.expected_stock_after_tax_pct || 6.8).toFixed(2)}% expected after-tax stock return</strong> (+{(hvmDetails.stock_edge_below_750k_after_tax_pct || 0).toFixed(2)}%/yr spread + full liquidity).
                        </div>
                      </div>

                      <div className="p-4 rounded-xl bg-slate-950/85 border border-amber-500/40 space-y-1.5">
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] font-bold uppercase text-amber-400">
                            3. {waTax.statute ? waTax.statute.slice(0, 32) : "State & Capital Gains Regime"}
                          </span>
                          <span className="badge bg-amber-500/20 text-amber-300 font-mono">{waTax.effective_date || "Current"}</span>
                        </div>
                        <div className="text-lg font-extrabold font-mono text-amber-300">
                          {waTax.combined_top_ordinary_rate_2028_plus_pct || waTax.combined_top_ordinary_rate_pre_2028_pct || 24}% Modeled Top Rate
                        </div>
                        <div className="text-[11px] text-slate-300 leading-relaxed">
                          {waTax.mortgage_deduction_rule || "Compare after-tax equity returns against deductible mortgage interest under federal & state brackets."}
                        </div>
                      </div>
                    </div>

                    {/* Full 10-Year Capital Allocation Strategy Comparison Table inside Investments Tab */}
                    {activeStrats.all_house && (
                      <div className="p-4 rounded-xl bg-slate-950/95 border border-emerald-500/30 space-y-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div>
                            <h4 className="text-xs font-bold uppercase tracking-wider text-white">
                              10-Year Capital Allocation Test ({isCompsMode ? `View A: Comps ${fmtCompact(hi.estimated_value_comps || compsHomeCfg)}` : `View B: Trend ${fmtCompact(hi.estimated_value_secular || secularHomeCfg)}`})
                            </h4>
                            <p className="text-[11px] text-slate-400">
                              You capture 100% of home appreciation (<strong>{fmtCurrency(activeStrats.hybrid_750k?.ending_home_value || 0)}</strong> in {isCompsMode ? "Comps View" : "Trend View"}) under <strong>all 4 strategies</strong> — compare keeping scheduled P&amp;I vs. recasting vs. investing excess cash in liquid markets:
                            </p>
                          </div>
                          <span className="badge bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-mono">
                            $750k Cap Strategies Beat 100% House by +{fmtCompact((activeStrats.hybrid_750k_no_recast?.total_combined_net_wealth || 3069493) - (activeStrats.all_house?.total_combined_net_wealth || 2973415))} to +{fmtCompact((activeStrats.hybrid_750k?.total_combined_net_wealth || 3114856) - (activeStrats.all_house?.total_combined_net_wealth || 2973415))}
                          </span>
                        </div>

                        <div className="overflow-x-auto">
                          <table className="w-full text-left border-collapse text-xs">
                            <thead>
                              <tr className="border-b border-slate-800 text-slate-400 uppercase text-[10px]">
                                <th className="py-2 px-2.5">Capital Allocation Strategy</th>
                                <th className="py-2 px-2 text-right">Monthly P&amp;I</th>
                                <th className="py-2 px-2 text-right">10-Yr Gross Int.</th>
                                <th className="py-2 px-2 text-right">IRS Tax Saved</th>
                                <th className="py-2 px-2 text-right">Net After-Tax Int.</th>
                                <th className="py-2 px-2 text-right">Yr-10 Mortgage</th>
                                <th className="py-2 px-2 text-right">Yr-10 Home Equity</th>
                                <th className="py-2 px-2 text-right">Yr-10 Stock Port.</th>
                                <th className="py-2 px-2 text-right">10-Yr Total Wealth</th>
                                <th className="py-2 px-2 text-right">vs. 100% House</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-800/60 font-mono">
                              {[
                                {
                                  id: "all_house",
                                  name: "A. 100% House First (Pay Mortgage to $0 in ~4.4 Yrs, Then Invest in Stocks)",
                                  badge: "Lowest Interest • Debt-Free Fastest",
                                  badgeCls: "bg-purple-500/20 text-purple-300",
                                  d: activeStrats.all_house,
                                },
                                {
                                  id: "hybrid_750k_no_recast",
                                  name: "B1. $750k Cap — Keep $8,171/mo P&I (No Recast / No Refi, Invest $6.8k/mo in Stocks)",
                                  badge: "★ Best Balance: 99% Paid Off + Saves $73k Int. vs Recast",
                                  badgeCls: "bg-sky-500/20 text-sky-300 border border-sky-500/40",
                                  d: activeStrats.hybrid_750k_no_recast || activeStrats.hybrid_750k,
                                },
                                {
                                  id: "hybrid_750k",
                                  name: "B2. $750k Cap + Recast P&I to $6,411/mo (Keep 5.75% Rate — Not a Refi; Invest Freed $1,760/mo)",
                                  badge: "★ Max Wealth Winner (+Pays $73k More Gross Int.)",
                                  badgeCls: "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40",
                                  d: activeStrats.hybrid_750k,
                                },
                                {
                                  id: "all_market",
                                  name: "C. 100% Stock Market ($0 Extra Principal; Keep $810k Loan & Invest All $60k + $6.8k/mo)",
                                  badge: "Max Market Leverage (Loses Tax Shield >$750k)",
                                  badgeCls: "bg-indigo-500/20 text-indigo-300",
                                  d: activeStrats.all_market,
                                },
                              ].map((row) => {
                                const diffVsHouse =
                                  (row.d?.total_combined_net_wealth || 0) -
                                  (activeStrats.all_house?.total_combined_net_wealth || 0);
                                const grossInt = Number(row.d?.cumulative_interest_paid_10yr || 0);
                                const taxSav = Number(row.d?.cumulative_tax_saved_10yr || 0);
                                const netInt = Number(row.d?.net_after_tax_interest_10yr ?? (grossInt - taxSav));
                                return (
                                  <tr
                                    key={row.id}
                                    className={
                                      row.id === "hybrid_750k"
                                        ? "bg-emerald-950/20 hover:bg-emerald-950/30"
                                        : row.id === "hybrid_750k_no_recast"
                                        ? "bg-sky-950/20 hover:bg-sky-950/30"
                                        : "hover:bg-slate-900/60"
                                    }
                                  >
                                    <td className="py-2.5 px-2.5 font-sans">
                                      <div className="font-bold text-white">{row.name}</div>
                                      <span className={`inline-block mt-0.5 text-[10px] px-2 py-0.5 rounded font-semibold ${row.badgeCls}`}>
                                        {row.badge}
                                      </span>
                                    </td>
                                    <td className="py-2.5 px-2 text-right text-slate-300">
                                      {fmtCurrency(row.d?.monthly_req_pmt || eq.scheduled_monthly_pmt || 0)}
                                    </td>
                                    <td className="py-2.5 px-2 text-right text-amber-300">
                                      {fmtCurrency(grossInt)}
                                    </td>
                                    <td className="py-2.5 px-2 text-right text-emerald-400">
                                      -{fmtCurrency(taxSav)}
                                    </td>
                                    <td className="py-2.5 px-2 text-right text-rose-300 font-bold">
                                      {fmtCurrency(netInt)}
                                    </td>
                                    <td className="py-2.5 px-2 text-right text-rose-400">
                                      {fmtCurrency(row.d?.ending_mortgage || 0)}
                                    </td>
                                    <td className="py-2.5 px-2 text-right text-purple-300 font-bold">
                                      {fmtCurrency(row.d?.ending_home_equity || 0)}
                                    </td>
                                    <td className="py-2.5 px-2 text-right text-indigo-300 font-bold">
                                      {fmtCurrency(row.d?.ending_stock_portfolio || 0)}
                                    </td>
                                    <td className="py-2.5 px-2 text-right text-white font-extrabold text-sm">
                                      {fmtCurrency(row.d?.total_combined_net_wealth || 0)}
                                    </td>
                                    <td className="py-2.5 px-2 text-right">
                                      <span
                                        className={`font-bold ${
                                          diffVsHouse > 0
                                            ? "text-emerald-400"
                                            : diffVsHouse < 0
                                            ? "text-rose-400"
                                            : "text-slate-400"
                                        }`}
                                      >
                                        {diffVsHouse === 0 ? "Baseline" : `${diffVsHouse > 0 ? "+" : ""}${fmtCurrency(diffVsHouse)}`}
                                      </span>
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>

                        {(() => {
                          const sB1 = activeStrats.hybrid_750k_no_recast || {};
                          const sB2 = activeStrats.hybrid_750k || {};
                          const sA = activeStrats.all_house || {};
                          const capK = fmtCompact(Number(hi.mortgage_debt_cap || 750000));
                          const diffB1vA = Number(sB1.total_combined_net_wealth || 0) - Number(sA.total_combined_net_wealth || 0);
                          const diffB2vB1 = Number(sB2.total_combined_net_wealth || 0) - Number(sB1.total_combined_net_wealth || 0);
                          const extraGrossInt = Number(sB2.cumulative_interest_paid_10yr || 0) - Number(sB1.cumulative_interest_paid_10yr || 0);
                          const keepPmt = Number(sB1.monthly_req_pmt || eq?.scheduled_monthly_pmt || 0);
                          const recPmt = Number(sB2.monthly_req_pmt || keepPmt);
                          return (
                            <div className="p-3 rounded-xl bg-slate-900/90 border border-slate-800 grid grid-cols-1 md:grid-cols-2 gap-3 text-[11px] text-slate-300">
                              <div>
                                <div className="font-bold text-sky-300 mb-0.5">
                                  1. Is paying down to {capK} a Refinance? No — Keep Your Existing Rate!
                                </div>
                                <p className="text-slate-400 leading-relaxed">
                                  In <strong>B1</strong> you keep your existing loan and required payment ({fmtCurrency(keepPmt)}/mo). In <strong>B2</strong>, a <strong>Loan Recast</strong> re-amortizes the remaining balance over the remaining term at your <em>existing note rate</em> (no closing costs or new loan), dropping required P&amp;I to {fmtCurrency(recPmt)}/mo when extra principal has moved the balance ahead of schedule.
                                </p>
                              </div>
                              <div>
                                <div className="font-bold text-amber-300 mb-0.5">
                                  2. Recasting (B2) Tradeoff: {extraGrossInt >= 0 ? "+" : ""}{fmtCompact(extraGrossInt)} 10-Yr Gross Interest vs. Liquidity
                                </div>
                                <p className="text-slate-400 leading-relaxed">
                                  Lowering the required payment to {fmtCurrency(recPmt)}/mo (<strong>B2</strong>) slows principal paydown ({fmtCompact(sB2.ending_mortgage || 0)} left at Yr 10 vs. {fmtCompact(sB1.ending_mortgage || 0)} in <strong>B1</strong>), costing <strong>{fmtCurrency(sB2.cumulative_interest_paid_10yr || 0)} gross interest</strong> vs. <strong>{fmtCurrency(sB1.cumulative_interest_paid_10yr || 0)} in B1</strong>. B2 {diffB2vB1 >= 0 ? "leads" : "trails"} B1 by {diffB2vB1 >= 0 ? "+" : ""}{fmtCompact(diffB2vB1)} if the freed cash compounds in equities, while <strong>B1 (No Recast)</strong> {diffB1vA >= 0 ? "beats" : "trails"} 100% House by <strong>{diffB1vA >= 0 ? "+" : ""}{fmtCurrency(diffB1vA)}</strong>.
                                </p>
                              </div>
                            </div>
                          );
                        })()}
                      </div>
                    )}
                  </div>
                </>
              );
            })()}

            {/* Asset Allocation & Brokerage Distribution */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              <div className="lg:col-span-6 card-panel rounded-2xl p-5">
                <h3 className="text-sm font-bold uppercase tracking-wider text-slate-400 mb-3">Asset Allocation Breakdown</h3>
                <ChartCanvas
                  type="doughnut"
                  height={250}
                  data={allocationChartData}
                  options={{
                    cutout: "62%",
                    plugins: { legend: { position: "right", labels: { color: isDark ? "#cbd5e1" : "#334155" } } },
                  }}
                />
              </div>

              <div className="lg:col-span-6 card-panel rounded-2xl p-5">
                <h3 className="text-sm font-bold uppercase tracking-wider text-slate-400 mb-3">Brokerage Accounts</h3>
                <div className="space-y-3">
                  {investments.accounts.map((acc) => (
                    <div key={acc.account_id} className="p-3.5 rounded-xl border border-slate-800 bg-slate-900/60 flex items-center justify-between text-xs">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${INSTITUTION_BADGES[acc.institution] || "bg-slate-800"}`}>
                            {acc.institution}
                          </span>
                          <span className="font-semibold text-white">{acc.account_name}</span>
                        </div>
                        <div className="text-[11px] text-slate-400 mt-1">
                          {acc.positions} positions • Bucket: <span className="uppercase text-indigo-400">{acc.tax_bucket}</span>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-bold text-white text-sm">{fmtCurrency(acc.value)}</div>
                        <div className={`text-[11px] ${acc.gain >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                          {fmtCurrency(acc.gain, true)} ({acc.gain_pct}%)
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Holdings Table */}
            <div className="card-panel rounded-2xl p-5 overflow-x-auto">
              <h3 className="text-sm font-bold uppercase tracking-wider text-slate-400 mb-4">
                All Positions Across Accounts ({investments.holdings.length})
              </h3>
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-400 uppercase text-[10px]">
                    <th className="py-2.5 px-3">Brokerage</th>
                    <th className="py-2.5 px-3">Symbol</th>
                    <th className="py-2.5 px-3">Description</th>
                    <th className="py-2.5 px-3">Asset Class</th>
                    <th className="py-2.5 px-3 text-right">Shares</th>
                    <th className="py-2.5 px-3 text-right">Price</th>
                    <th className="py-2.5 px-3 text-right">Market Value</th>
                    <th className="py-2.5 px-3 text-right">Gain ($ / %)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {investments.holdings.length === 0 ? (
                    <tr>
                      <td colSpan="8" className="py-8 text-center text-xs text-slate-400">
                        No investment holdings recorded for this institution filter.
                      </td>
                    </tr>
                  ) : (
                    investments.holdings.map((h) => (
                      <tr key={h.id} className="hover:bg-slate-800/30">
                        <td className="py-2.5 px-3">
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${INSTITUTION_BADGES[h.institution] || "bg-slate-800"}`}>
                            {h.institution}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 font-bold text-indigo-400">{h.symbol}</td>
                        <td className="py-2.5 px-3 text-slate-200">{h.name}</td>
                        <td className="py-2.5 px-3 text-slate-400">{h.asset_class}</td>
                        <td className="py-2.5 px-3 text-right">{h.shares.toLocaleString()}</td>
                        <td className="py-2.5 px-3 text-right">
                          {fmtCurrency(h.current_price)}
                          {h.day_change_pct !== 0 && (
                            <span className={`ml-1 text-[10px] ${h.day_change_pct > 0 ? "text-emerald-400" : "text-rose-400"}`}>
                              ({h.day_change_pct > 0 ? `+${h.day_change_pct}%` : `${h.day_change_pct}%`})
                            </span>
                          )}
                        </td>
                        <td className="py-2.5 px-3 text-right font-bold text-white">{fmtCurrency(h.current_value)}</td>
                        <td className="py-2.5 px-3 text-right">
                          <span className={`font-semibold ${h.gain_dollars >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                            {fmtCurrency(h.gain_dollars, true)} ({h.gain_pct >= 0 ? `+${h.gain_pct}%` : `${h.gain_pct}%`})
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ==================== TAB 4: RETIREMENT & TAX PLANNER ==================== */}
        {activeTab === "retirement" && (
          <div className="space-y-6">
            {!retirementData ? (
              <div className="card-panel rounded-2xl p-12 text-center space-y-3">
                <div className="w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto"></div>
                <p className="text-xs text-slate-400">Computing 2026 tax brackets, deductions, and Monte Carlo projections...</p>
              </div>
            ) : (
              <>
                {/* Executive Readiness Scorecard */}
                <div className="card-panel rounded-2xl p-6 bg-gradient-to-br from-indigo-950/40 via-slate-900 to-emerald-950/20 border-indigo-500/40">
                  <div className="flex flex-wrap items-center justify-between gap-4">
                    <div>
                      <span className="badge bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                        Age {retirementData.inputs.age} • RSU-Powered FIRE & Monte Carlo Simulation
                      </span>
                      <h2 className="text-xl font-bold mt-2 flex items-center gap-2">
                        <span>Projected Nest Egg at Age {retirementData.inputs.retirement_age}:</span>
                        <span className="text-emerald-400">{fmtCompact(retirementData.summary.nest_egg_at_retirement_real)}</span>
                        <span className="text-xs text-slate-400 font-normal">(Today's Purchasing Power)</span>
                      </h2>
                      <p className="text-xs text-slate-400 mt-1">
                        Currently <strong>Age {retirementData.inputs.age}</strong> ({retirementData.summary.years_to_retirement} years to target retirement at Age {retirementData.inputs.retirement_age}), supporting <strong>{fmtCurrency(retirementData.summary.sustainable_spending_real)}/yr</strong> ({fmtCurrency(retirementData.summary.monthly_income_at_retirement_real)}/mo) across {retirementData.summary.years_in_retirement} retirement years.
                      </p>
                    </div>

                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <div className="text-[10px] uppercase font-bold text-slate-400">Monte Carlo Success</div>
                        <div className={`text-2xl font-bold ${retirementData.monte_carlo.success_pct >= 80 ? "text-emerald-400" : "text-amber-400"}`}>
                          {retirementData.monte_carlo.success_pct}%
                        </div>
                        <div className="text-[10px] text-slate-400">
                          {retirementData.summary.on_track ? "✓ On Track (≥80%)" : "At Risk (<80%)"}
                        </div>
                      </div>

                      {retirementData.earliest_retirement_age && (
                        <div className="text-right border-l border-slate-800 pl-4">
                          <div className="text-[10px] uppercase font-bold text-slate-400">Earliest FIRE Age</div>
                          <div className="text-2xl font-bold text-indigo-400">
                            Age {retirementData.earliest_retirement_age}
                          </div>
                          <div className="text-[10px] text-slate-400">With ≥80% confidence</div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Employer RSU Grant History & Unvested Pipeline Model */}
                {retirementData.rsu_model && retirementData.rsu_model.enabled !== false && (() => {
                  const rm = retirementData.rsu_model;
                  const ticker = rm.ticker || rsuSym;
                  const unvVal = Number(rm.unvested_balance || 0);
                  const unvSh = Number(rm.unvested_shares || 0);
                  const px = Number(rm.stock_price || rm.price || 0);
                  const moNetEst = Number(rm.current_monthly_net_shares || 0) * px;
                  return (
                  <div className="card-panel rounded-2xl p-5 border border-indigo-500/30">
                    <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
                      <div>
                        <h3 className="text-sm font-bold uppercase tracking-wider text-indigo-400">
                          {rm.title || `${ticker} RSU Vesting Pipeline & Refresher Model`}
                        </h3>
                        <p className="text-xs text-slate-400">
                          Models {rm.active_grants?.length || 0} active unvested grants ({fmtCompact(unvVal)} / {unvSh.toLocaleString()} sh) + annual refreshers (less {rm.rsu_tax_withholding_pct}% sell-to-cover tax withholding)
                        </p>
                      </div>
                      <span className="badge bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                        +{fmtCurrency(rm.yr1_vest_net)} Net Vested Stock in Year 1
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-4 text-xs">
                      <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800">
                        <div className="text-slate-400">Unvested RSU Pipeline ({rm.active_grants?.length || 0} Grants)</div>
                        <div className="text-base font-bold text-white mt-0.5">{fmtCurrency(unvVal)}</div>
                        <div className="text-[11px] text-indigo-400">{unvSh.toLocaleString()} {ticker} sh @ ${px}</div>
                      </div>
                      <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800">
                        <div className="text-slate-400">Modeled Annual RSU Grant</div>
                        <div className="text-base font-bold text-emerald-400 mt-0.5">{fmtCurrency(rm.annual_rsu_grant)}/yr</div>
                        <div className="text-[11px] text-slate-400">Future annual refresher input</div>
                      </div>
                      <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800">
                        <div className="text-slate-400">Current Monthly Vesting Pace</div>
                        <div className="text-base font-bold text-white mt-0.5">{rm.current_monthly_vest_shares} sh/mo gross</div>
                        <div className="text-[11px] text-emerald-400">→ {rm.current_monthly_net_shares} net sh/mo (~{fmtCompact(moNetEst)}/mo)</div>
                      </div>
                      <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800">
                        <div className="text-slate-400">Already Vested Award Shares Held</div>
                        <div className="text-base font-bold text-white mt-0.5">{fmtCurrency(rm.vested_award_value)}</div>
                        <div className="text-[11px] text-slate-400">{(rm.vested_award_shares || 0).toLocaleString()} net {ticker} sh retained</div>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 text-xs">
                      <div className="lg:col-span-5 p-3.5 rounded-xl bg-slate-900/60 border border-slate-800">
                        <div className="font-bold text-slate-300 mb-2">Historical Annual Grants</div>
                        <table className="w-full text-left">
                          <thead>
                            <tr className="border-b border-slate-800 text-[10px] uppercase text-slate-400">
                              <th className="py-1.5">Year</th>
                              <th className="py-1.5">Shares</th>
                              <th className="py-1.5 text-right">Value @ ${px}</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-800/60">
                            {(rm.historical_grants_by_year || []).map((g) => (
                              <tr key={g.year}>
                                <td className="py-2 font-bold text-white">{g.year} <span className="text-[10px] font-normal text-slate-400">({g.grants_count} grants)</span></td>
                                <td className="py-2 text-indigo-400 font-semibold">{g.shares_granted.toLocaleString()} sh</td>
                                <td className="py-2 text-right font-mono text-emerald-400">{fmtCurrency(g.value_at_current_price)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>

                      <div className="lg:col-span-7 p-3.5 rounded-xl bg-slate-900/60 border border-slate-800 overflow-x-auto">
                        <div className="font-bold text-slate-300 mb-2">Active Unvested Equity Grants</div>
                        <table className="w-full text-left">
                          <thead>
                            <tr className="border-b border-slate-800 text-[10px] uppercase text-slate-400">
                              <th className="py-1.5">Grant Date</th>
                              <th className="py-1.5">ID</th>
                              <th className="py-1.5 text-right">Unvested</th>
                              <th className="py-1.5 text-right">Market Value</th>
                              <th className="py-1.5 pl-3">Vesting Schedule</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-800/60">
                            {(rm.active_grants || []).map((ag) => (
                              <tr key={ag.grant_id}>
                                <td className="py-1.5 text-slate-300">{ag.grant_date}</td>
                                <td className="py-1.5 font-mono text-indigo-400">{ag.grant_id}</td>
                                <td className="py-1.5 text-right font-semibold text-white">{ag.unvested.toLocaleString()} sh</td>
                                <td className="py-1.5 text-right font-mono text-emerald-400">{fmtCurrency(ag.unvested_value)}</td>
                                <td className="py-1.5 pl-3 text-[11px] text-slate-400">{ag.schedule}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                  );
                })()}

                {/* 401(k) Savings Plan & Mega Backdoor Roth Model */}
                {retirementData.k401_model && retirementData.k401_model.enabled !== false && (() => {
                  const km = retirementData.k401_model;
                  return (
                  <div className="card-panel rounded-2xl p-5 border border-emerald-500/30 space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <h3 className="text-sm font-bold uppercase tracking-wider text-emerald-400">
                          {km.plan_name || "401(k) Savings Plan"} ({km.account_number || ""}) &amp; Mega Backdoor Roth
                        </h3>
                        <p className="text-xs text-slate-400">
                          Statement progression through {km.as_of}: <strong>{fmtCurrency(km.ending_balance)}</strong> closing balance
                        </p>
                      </div>
                      <span className="badge bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-mono">
                        YTD Added: +{fmtCurrency(km.ytd_total_contributions)} (+{fmtCurrency(km.ytd_market_gain)} Market)
                      </span>
                    </div>

                    {/* 4 Key KPI Tiles */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
                      <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800">
                        <div className="text-slate-400">Latest Closing Balance</div>
                        <div className="text-base font-bold font-mono text-white mt-0.5">
                          {fmtCurrency(km.ending_balance)}
                        </div>
                        <div className="text-[11px] text-emerald-400">
                          {fmtCurrency(km.pretax_total)} Pre-Tax • {fmtCurrency(km.roth_in_plan_total)} Roth In-Plan
                        </div>
                      </div>
                      <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800">
                        <div className="text-slate-400">YTD Pre-Tax + Employer Match</div>
                        <div className="text-base font-bold font-mono text-indigo-400 mt-0.5">
                          {fmtCurrency(km.ytd_employee_pretax + km.ytd_employer_match)}
                        </div>
                        <div className="text-[11px] text-slate-400">
                          {fmtCurrency(km.ytd_employee_pretax)} Employee + {fmtCurrency(km.ytd_employer_match)} Match
                        </div>
                      </div>
                      <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800">
                        <div className="text-slate-400">YTD Mega Backdoor Roth</div>
                        <div className="text-base font-bold font-mono text-emerald-400 mt-0.5">
                          {fmtCurrency(km.ytd_aftertax_mega_backdoor)} YTD
                        </div>
                        <div className="text-[11px] text-slate-400">
                          In-Plan Conversion ({fmtCurrency(km.annualized_mega_backdoor)}/yr pace)
                        </div>
                      </div>
                      <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800">
                        <div className="text-slate-400">Prior Roth In-Plan Rollout</div>
                        <div className="text-base font-bold font-mono text-amber-300 mt-0.5">
                          {fmtCurrency(km.ytd_roth_rollout_q1)}
                        </div>
                        <div className="text-[11px] text-slate-400">
                          {km.ytd_roth_rollout_note || "In-plan Roth conversion transfer"}
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 text-xs">
                      {/* Left: Quarterly Statement Progression + Trust Holdings */}
                      <div className="lg:col-span-6 space-y-3">
                        <div className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800 overflow-x-auto">
                          <div className="font-bold text-slate-300 mb-2">Quarterly Statement Progression</div>
                          <table className="w-full text-left font-mono text-[11px]">
                            <thead>
                              <tr className="border-b border-slate-800 text-[10px] uppercase text-slate-400 font-sans">
                                <th className="py-1.5">Quarter</th>
                                <th className="py-1.5 text-right">Begin Bal</th>
                                <th className="py-1.5 text-right">Contrib</th>
                                <th className="py-1.5 text-right">Match</th>
                                <th className="py-1.5 text-right">Market</th>
                                <th className="py-1.5 text-right">Roll/Other</th>
                                <th className="py-1.5 text-right">End Bal</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-800/60">
                              {(km.quarters || []).map((q) => (
                                <tr key={q.quarter}>
                                  <td className="py-1.5 font-sans font-bold text-white">{q.quarter}</td>
                                  <td className="py-1.5 text-right text-slate-300">{fmtCompact(q.beginning_balance)}</td>
                                  <td className="py-1.5 text-right text-indigo-300">+{fmtCompact(q.employee_contributions)}</td>
                                  <td className="py-1.5 text-right text-emerald-400">+{fmtCompact(q.employer_contributions)}</td>
                                  <td className={`py-1.5 text-right ${q.market_gain_loss >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                                    {q.market_gain_loss >= 0 ? `+${fmtCompact(q.market_gain_loss)}` : fmtCompact(q.market_gain_loss)}
                                  </td>
                                  <td className="py-1.5 text-right text-amber-300">
                                    {Math.abs(q.other_transactions) > 10 ? fmtCompact(q.other_transactions) : "—"}
                                  </td>
                                  <td className="py-1.5 text-right font-bold text-white">{fmtCurrency(q.ending_balance)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>

                        <div className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800 overflow-x-auto">
                          <div className="font-bold text-slate-300 mb-2">Plan Fund Holdings</div>
                          <table className="w-full text-left font-mono text-[11px]">
                            <thead>
                              <tr className="border-b border-slate-800 text-[10px] uppercase text-slate-400 font-sans">
                                <th className="py-1.5">Fund</th>
                                <th className="py-1.5 text-right">YTD Open</th>
                                <th className="py-1.5 text-right">YTD Contrib</th>
                                <th className="py-1.5 text-right">YTD Market</th>
                                <th className="py-1.5 text-right">Closing</th>
                                <th className="py-1.5 text-right">Weight</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-800/60">
                              {(km.funds || []).map((f) => (
                                <tr key={f.symbol}>
                                  <td className="py-1.5 font-sans">
                                    <strong className="text-indigo-400 font-mono">{f.symbol}</strong>{" "}
                                    <span className="text-slate-200">{f.name}</span>
                                  </td>
                                  <td className="py-1.5 text-right text-slate-300">{fmtCompact(f.ytd_begin)}</td>
                                  <td className="py-1.5 text-right text-indigo-300">+{fmtCompact(f.ytd_contrib)}</td>
                                  <td className="py-1.5 text-right text-emerald-400">+{fmtCompact(f.ytd_market)}</td>
                                  <td className="py-1.5 text-right font-bold text-white">{fmtCurrency(f.q3_end)}</td>
                                  <td className="py-1.5 text-right text-slate-300">{f.weight_pct}%</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>

                      {/* Right: Contribution Sources & Tax Bucket Breakdown */}
                      <div className="lg:col-span-6 p-3.5 rounded-xl bg-slate-900/60 border border-slate-800 overflow-x-auto flex flex-col justify-between">
                        <div>
                          <div className="font-bold text-slate-300 mb-2">Source Activity &amp; Tax Bucket Breakdown ({km.as_of})</div>
                          <table className="w-full text-left font-mono text-[11px]">
                            <thead>
                              <tr className="border-b border-slate-800 text-[10px] uppercase text-slate-400 font-sans">
                                <th className="py-1.5">Source Bucket</th>
                                <th className="py-1.5">Tax Treatment</th>
                                <th className="py-1.5 text-right">Qtr Contrib</th>
                                <th className="py-1.5 text-right">YTD Contrib</th>
                                <th className="py-1.5 text-right">Closing</th>
                                <th className="py-1.5 text-right">Share</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-800/60">
                              {(km.sources || []).map((s) => (
                                <tr key={s.source}>
                                  <td className="py-2 font-sans font-semibold text-white">{s.source}</td>
                                  <td className="py-2 font-sans">
                                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                      s.tax_bucket.includes("Roth")
                                        ? "bg-emerald-500/20 text-emerald-300"
                                        : s.tax_bucket.includes("Mega")
                                        ? "bg-amber-500/20 text-amber-300"
                                        : "bg-indigo-500/20 text-indigo-300"
                                    }`}>
                                      {s.tax_bucket}
                                    </span>
                                  </td>
                                  <td className="py-2 text-right text-slate-300">
                                    {s.q3_contrib > 0 ? `+${fmtCurrency(s.q3_contrib)}` : "—"}
                                  </td>
                                  <td className="py-2 text-right text-indigo-300">
                                    {s.ytd_contrib > 0 ? `+${fmtCurrency(s.ytd_contrib)}` : "—"}
                                  </td>
                                  <td className="py-2 text-right font-bold text-white">{fmtCurrency(s.close)}</td>
                                  <td className="py-2 text-right text-slate-400">{s.share_pct}%</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                        <div className="mt-3 p-2.5 rounded-xl bg-slate-950/80 border border-slate-800 text-[11px] text-slate-300">
                          <strong>Mega Backdoor Roth Summary:</strong> {fmtCurrency(km.ytd_aftertax_mega_backdoor)} YTD after-tax converted into{" "}
                          <strong>Roth In-Plan ({fmtCurrency(km.roth_in_plan_total)})</strong>; {km.ytd_roth_rollout_note || "eligible for external Roth IRA rollover"}.
                        </div>
                      </div>
                    </div>
                  </div>
                  );
                })()}

                {/* Paycheck & Tax Breakdown (2026 Rules) */}
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                  {/* Interactive Paycheck Breakdown */}
                  <div className="lg:col-span-7 card-panel rounded-2xl p-5">
                    <div className="flex items-center justify-between mb-4">
                      <div>
                        <h3 className="text-sm font-bold uppercase tracking-wider text-slate-400">
                          Salary & Take-Home Pay Analysis (2026 Tax Rules)
                        </h3>
                        <p className="text-xs text-slate-400">
                          Federal standard deduction, 2026 brackets, FICA wage caps & state tax
                        </p>
                      </div>
                      <div className="text-right">
                        <span className="text-xs font-bold text-slate-300">
                          Effective Tax Rate: <strong className="text-indigo-400">{retirementData.paycheck.effective_tax_rate_pct}%</strong>
                        </span>
                        <div className="text-[10px] text-slate-400">
                          Marginal: {retirementData.paycheck.marginal_combined_pct}%
                        </div>
                      </div>
                    </div>

                    <div className="space-y-2 text-xs">
                      {retirementData.paycheck.waterfall.map((step, i) => (
                        <div key={i} className="flex items-center justify-between py-1.5 border-b border-slate-800/60">
                          <span className={step.type === "total" ? "font-bold text-white text-sm" : "text-slate-400"}>
                            {step.label}
                          </span>
                          <span className={`font-mono font-semibold ${
                            step.type === "total"
                              ? "text-white text-sm"
                              : step.type === "deduction"
                              ? "text-indigo-400"
                              : "text-rose-400"
                          }`}>
                            {fmtCurrency(step.amount)}
                          </span>
                        </div>
                      ))}
                    </div>

                    <div className="mt-4 pt-3 border-t border-slate-800 flex justify-between text-xs text-slate-400">
                      <span>Monthly Net Take-Home: <strong className="text-emerald-400 text-sm">{fmtCurrency(retirementData.paycheck.net_pay_monthly)}</strong></span>
                      <span>Total Savings Rate: <strong className="text-indigo-400 text-sm">{retirementData.paycheck.savings_rate_pct}%</strong></span>
                    </div>
                  </div>

                  {/* What-If Levers */}
                  <div className="lg:col-span-5 card-panel rounded-2xl p-5 flex flex-col justify-between">
                    <div>
                      <h3 className="text-sm font-bold uppercase tracking-wider text-slate-400 mb-1">
                        ⚡ Quick What-If Scenarios
                      </h3>
                      <p className="text-xs text-slate-400 mb-4">
                        Test adjustments and see their immediate impact on probability of success
                      </p>

                      <div className="space-y-2.5">
                        {retirementData.levers.map((lever) => (
                          <button
                            type="button"
                            key={lever.id}
                            onClick={() => {
                              if (lever.diff) {
                                handleRetirementPreview({
                                  ...(retirementInputs || retirementData.inputs),
                                  ...lever.diff,
                                });
                              }
                            }}
                            className="w-full text-left p-3 rounded-xl border border-slate-800 bg-slate-900/70 hover:border-indigo-500/60 hover:bg-slate-800/60 flex items-center justify-between text-xs cursor-pointer transition group"
                            title="Click to simulate this scenario immediately across Monte Carlo & FIRE timelines"
                          >
                            <div>
                              <div className="font-semibold text-white group-hover:text-indigo-300 transition">
                                {lever.label}
                              </div>
                              <div className="text-[10px] text-indigo-400 font-semibold mt-0.5">
                                Apply scenario →
                              </div>
                            </div>
                            <div className="text-right shrink-0 ml-2">
                              <span className={`badge ${lever.success_delta_pts >= 0 ? "bg-emerald-500/20 text-emerald-400" : "bg-rose-500/20 text-rose-400"}`}>
                                {lever.success_delta_pts >= 0 ? `+${lever.success_delta_pts}%` : `${lever.success_delta_pts}%`} success
                              </span>
                              <div className="text-[10px] text-slate-400 mt-0.5 font-mono">
                                {lever.nest_egg_real_delta >= 0 ? `+${fmtCompact(lever.nest_egg_real_delta)}` : fmtCompact(lever.nest_egg_real_delta)} nest egg
                              </div>
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Monte Carlo Percentile Bands Chart */}
                <div className="card-panel rounded-2xl p-5">
                  <div className="mb-4">
                    <h3 className="text-sm font-bold uppercase tracking-wider text-slate-400">
                      Monte Carlo Portfolio Wealth Bands (Today's Real Purchasing Power)
                    </h3>
                    <p className="text-xs text-slate-400">
                      500 randomized market return sequences showing 10th, 50th (median), and 90th percentiles
                    </p>
                  </div>

                  <ChartCanvas
                    type="line"
                    height={280}
                    data={{
                      labels: retirementData.monte_carlo.bands.map((b) => `Age ${b.age}`),
                      datasets: [
                        {
                          label: "90th Percentile (Optimistic)",
                          data: retirementData.monte_carlo.bands.map((b) => b.p90),
                          borderColor: "rgba(16, 185, 129, 0.4)",
                          backgroundColor: "transparent",
                          borderDash: [4, 4],
                          pointRadius: 0,
                        },
                        {
                          label: "50th Percentile (Median)",
                          data: retirementData.monte_carlo.bands.map((b) => b.p50),
                          borderColor: "#6366f1",
                          backgroundColor: "rgba(99, 102, 241, 0.15)",
                          fill: true,
                          pointRadius: 0,
                          borderWidth: 2.5,
                        },
                        {
                          label: "10th Percentile (Pessimistic)",
                          data: retirementData.monte_carlo.bands.map((b) => b.p10),
                          borderColor: "rgba(244, 63, 94, 0.6)",
                          backgroundColor: "transparent",
                          borderDash: [4, 4],
                          pointRadius: 0,
                        },
                      ],
                    }}
                    options={{
                      scales: {
                        x: { ticks: { color: isDark ? "#94a3b8" : "#64748b" }, grid: { color: isDark ? "rgba(51,65,85,0.25)" : "rgba(226,232,240,0.8)" } },
                        y: { ticks: { color: isDark ? "#94a3b8" : "#64748b", callback: (v) => fmtCompact(v) }, grid: { color: isDark ? "rgba(51,65,85,0.25)" : "rgba(226,232,240,0.8)" } },
                      },
                      plugins: { legend: { labels: { color: isDark ? "#cbd5e1" : "#334155" } } },
                    }}
                  />
                </div>

                {/* Interactive Parameter Tuner */}
                <div className="card-panel rounded-2xl p-5">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h3 className="text-sm font-bold uppercase tracking-wider text-slate-400">
                        Adjust Retirement Assumptions & Sliders
                      </h3>
                      <p className="text-xs text-slate-400">Tweak numbers and watch forecasts update in real-time</p>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={handleResetRetirement}
                        className="px-3 py-1.5 rounded-lg border border-slate-700 hover:bg-slate-800 text-xs text-slate-300 font-semibold"
                      >
                        Reset Defaults
                      </button>
                      <button
                        onClick={handleSaveRetirement}
                        disabled={savingRetirement}
                        className="px-3.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold shadow"
                      >
                        {savingRetirement ? "Saving..." : "Save Custom Plan"}
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
                    <div>
                      <label className="block text-slate-400 mb-1 font-semibold">Current Age</label>
                      <input
                        type="number"
                        value={retirementInputs.age === undefined ? "" : retirementInputs.age}
                        onChange={(e) => handleRetirementPreview({ ...retirementInputs, age: e.target.value === "" ? "" : parseInt(e.target.value) })}
                        className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white"
                      />
                    </div>
                    <div>
                      <label className="block text-slate-400 mb-1 font-semibold">Target Retirement Age</label>
                      <input
                        type="number"
                        value={retirementInputs.retirement_age === undefined ? "" : retirementInputs.retirement_age}
                        onChange={(e) => handleRetirementPreview({ ...retirementInputs, retirement_age: e.target.value === "" ? "" : parseInt(e.target.value) })}
                        className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white font-bold text-indigo-400"
                      />
                    </div>
                    <div>
                      <label className="block text-slate-400 mb-1 font-semibold">Gross Annual Base Salary ($)</label>
                      <input
                        type="number"
                        step="1000"
                        value={retirementInputs.gross_salary === undefined ? "" : retirementInputs.gross_salary}
                        onChange={(e) => handleRetirementPreview({ ...retirementInputs, gross_salary: e.target.value === "" ? "" : parseFloat(e.target.value) })}
                        className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white font-bold"
                      />
                    </div>
                    <div>
                      <label className="block text-indigo-400 mb-1 font-semibold">Annual New RSU Grant ($/yr)</label>
                      <input
                        type="number"
                        step="10000"
                        value={retirementInputs.annual_rsu_grant === undefined ? "" : retirementInputs.annual_rsu_grant}
                        onChange={(e) => handleRetirementPreview({ ...retirementInputs, annual_rsu_grant: e.target.value === "" ? "" : parseFloat(e.target.value) })}
                        className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-indigo-500/50 text-emerald-400 font-bold"
                      />
                    </div>
                    <div>
                      <label className="block text-indigo-400 mb-1 font-semibold">Unvested RSU Pipeline ($)</label>
                      <input
                        type="number"
                        step="10000"
                        value={retirementInputs.unvested_rsu_balance === undefined ? "" : retirementInputs.unvested_rsu_balance}
                        onChange={(e) => handleRetirementPreview({ ...retirementInputs, unvested_rsu_balance: e.target.value === "" ? "" : parseFloat(e.target.value) })}
                        className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-indigo-500/50 text-white font-bold"
                      />
                    </div>
                    <div>
                      <label className="block text-slate-400 mb-1 font-semibold">Retirement Annual Spend ($ today's)</label>
                      <input
                        type="number"
                        step="1000"
                        value={retirementInputs.retirement_spending === undefined ? "" : retirementInputs.retirement_spending}
                        onChange={(e) => handleRetirementPreview({ ...retirementInputs, retirement_spending: e.target.value === "" ? "" : parseFloat(e.target.value) })}
                        className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white"
                      />
                    </div>
                    <div>
                      <label className="block text-slate-400 mb-1 font-semibold">Pre-Tax 401(k) Contribution (%)</label>
                      <input
                        type="number"
                        step="0.5"
                        value={retirementInputs.pretax_401k_pct === undefined ? "" : retirementInputs.pretax_401k_pct}
                        onChange={(e) => handleRetirementPreview({ ...retirementInputs, pretax_401k_pct: e.target.value === "" ? "" : parseFloat(e.target.value) })}
                        className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white"
                      />
                    </div>
                    <div>
                      <label className="block text-slate-400 mb-1 font-semibold">Roth 401(k) Contribution (%)</label>
                      <input
                        type="number"
                        step="0.5"
                        value={retirementInputs.roth_401k_pct === undefined ? "" : retirementInputs.roth_401k_pct}
                        onChange={(e) => handleRetirementPreview({ ...retirementInputs, roth_401k_pct: e.target.value === "" ? "" : parseFloat(e.target.value) })}
                        className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white"
                      />
                    </div>
                    <div>
                      <label className="block text-emerald-400 mb-1 font-semibold">Mega Backdoor Roth 401(k) ($/yr)</label>
                      <input
                        type="number"
                        step="1000"
                        value={retirementInputs.aftertax_401k_annual === undefined ? "" : retirementInputs.aftertax_401k_annual}
                        onChange={(e) => handleRetirementPreview({ ...retirementInputs, aftertax_401k_annual: e.target.value === "" ? "" : parseFloat(e.target.value) })}
                        className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-emerald-500/50 text-emerald-400 font-bold"
                      />
                    </div>
                    <div>
                      <label className="block text-slate-400 mb-1 font-semibold">Pre-Retirement Return (%)</label>
                      <input
                        type="number"
                        step="0.1"
                        value={retirementInputs.return_pre_pct === undefined ? "" : retirementInputs.return_pre_pct}
                        onChange={(e) => handleRetirementPreview({ ...retirementInputs, return_pre_pct: e.target.value === "" ? "" : parseFloat(e.target.value) })}
                        className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white"
                      />
                    </div>
                    <div>
                      <label className="block text-slate-400 mb-1 font-semibold">Inflation Assumption (%)</label>
                      <input
                        type="number"
                        step="0.1"
                        value={retirementInputs.inflation_pct === undefined ? "" : retirementInputs.inflation_pct}
                        onChange={(e) => handleRetirementPreview({ ...retirementInputs, inflation_pct: e.target.value === "" ? "" : parseFloat(e.target.value) })}
                        className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white"
                      />
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {/* ==================== TAB 5: ACTIVITY & RULES ==================== */}
        {activeTab === "transactions" && (() => {
          const searchUpper = String(txSearch || "").trim().toUpperCase();
          const filteredTxs = (transactions || []).filter((t) => {
            if (txScopeMonth === "selected" && !String(t.tx_date || "").startsWith(selectedMonth)) {
              return false;
            }
            if (selectedInstitution !== "All" && t.institution !== selectedInstitution) {
              return false;
            }
            if (txCategoryFilter !== "All" && t.category !== txCategoryFilter) {
              return false;
            }
            if (txTypeFilter !== "All" && t.tx_type !== txTypeFilter) {
              return false;
            }
            if (txAccountFilter !== "All" && String(t.account_id) !== String(txAccountFilter)) {
              return false;
            }
            const absAmt = Math.abs(Number(t.amount || 0));
            if (txSizeFilter === "major" && absAmt < 450) return false;
            if (txSizeFilter === "everyday" && absAmt >= 450) return false;
            if (searchUpper) {
              const hay = `${t.merchant || ""} ${t.description || ""} ${t.category || ""} ${t.account_name || ""} ${t.institution || ""}`.toUpperCase();
              if (!hay.includes(searchUpper)) return false;
            }
            return true;
          });

          const expenseTxs = filteredTxs.filter((t) => t.tx_type === "expense");
          const incomeTxs = filteredTxs.filter((t) => t.tx_type === "income");
          const transferTxs = filteredTxs.filter((t) => t.tx_type === "transfer");
          const expenseSum = expenseTxs.reduce((s, t) => s + Math.abs(Number(t.amount || 0)), 0);
          const incomeSum = incomeTxs.reduce((s, t) => s + Math.abs(Number(t.amount || 0)), 0);
          const transferSum = transferTxs.reduce((s, t) => s + Math.abs(Number(t.amount || 0)), 0);
          const avgExpense = expenseTxs.length ? expenseSum / expenseTxs.length : 0;
          const largestExpense = expenseTxs.reduce(
            (mx, t) => Math.max(mx, Math.abs(Number(t.amount || 0))),
            0
          );

          const hasActiveTxFilters =
            txScopeMonth !== "all" ||
            txCategoryFilter !== "All" ||
            txTypeFilter !== "All" ||
            txAccountFilter !== "All" ||
            txSizeFilter !== "all" ||
            Boolean(searchUpper);

          const groupedRows = (() => {
            if (txGroupBy === "none") return [];
            const map = new Map();
            for (const t of filteredTxs) {
              let key = "";
              let label = "";
              if (txGroupBy === "merchant") {
                key = t.merchant || "Unknown";
                label = key;
              } else if (txGroupBy === "category") {
                key = t.category || "Other";
                label = key;
              } else if (txGroupBy === "account") {
                key = String(t.account_id || "");
                label = `${t.institution || ""} · ${t.account_name || "Account"}`;
              } else if (txGroupBy === "month") {
                key = String(t.tx_date || "").slice(0, 7);
                label = fmtMonthLabel(key);
              }
              if (!map.has(key)) {
                map.set(key, { key, label, txs: [], count: 0, totalAbs: 0 });
              }
              const slot = map.get(key);
              slot.txs.push(t);
              slot.count += 1;
              slot.totalAbs += Math.abs(Number(t.amount || 0));
            }
            const list = Array.from(map.values()).map((g) => ({
              ...g,
              avgAbs: g.count ? g.totalAbs / g.count : 0,
            }));
            if (txGroupBy === "month") {
              list.sort((a, b) => (b.key > a.key ? 1 : -1));
            } else {
              list.sort((a, b) => b.totalAbs - a.totalAbs);
            }
            return list;
          })();
          const grandGroupedAbs = groupedRows.reduce((s, g) => s + g.totalAbs, 0);
          const totalTxPages = Math.max(1, Math.ceil(filteredTxs.length / txPageSize));
          const safeTxPage = Math.min(txPage, totalTxPages);
          const txStartIdx = (safeTxPage - 1) * txPageSize;
          const visibleFlatTxs = filteredTxs.slice(txStartIdx, txStartIdx + txPageSize);

          return (
          <div className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* Smart Auto-Categorization Rule Builder */}
              <div className="lg:col-span-5 card-panel rounded-2xl p-5">
                <h2 className="text-sm font-bold uppercase tracking-wider text-slate-400 mb-1">🧠 Smart Auto-Categorization Rules</h2>
                <p className="text-xs text-slate-400 mb-4">
                  Define a keyword rule (e.g. "WHOLEFDS" → Groceries) to automatically organize all current & future statements
                </p>
                <form onSubmit={handleAddRule} className="grid grid-cols-2 gap-2.5 text-xs mb-4">
                  <div>
                    <label className="block text-slate-400 mb-1">Statement Keyword</label>
                    <input
                      type="text"
                      placeholder="e.g. SWEETGREEN"
                      value={newRule.keyword}
                      onChange={(e) => setNewRule({ ...newRule, keyword: e.target.value })}
                      className="w-full px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-white"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-slate-400 mb-1">Clean Merchant Name</label>
                    <input
                      type="text"
                      placeholder="e.g. Sweetgreen"
                      value={newRule.merchant_name}
                      onChange={(e) => setNewRule({ ...newRule, merchant_name: e.target.value })}
                      className="w-full px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-400 mb-1">Target Category</label>
                    <select
                      value={newRule.category}
                      onChange={(e) => setNewRule({ ...newRule, category: e.target.value })}
                      className="w-full px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-white"
                    >
                      {CATEGORIES.map((c) => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                  </div>
                  <div className="flex items-end">
                    <button
                      type="submit"
                      className="w-full py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-semibold"
                    >
                      + Save & Run Rule
                    </button>
                  </div>
                </form>

                <div className="max-h-52 overflow-y-auto divide-y divide-slate-800 text-xs border-t border-slate-800 pt-2">
                  {rules.slice(0, 30).map((r) => (
                    <div key={r.id} className="py-1.5 flex items-center justify-between">
                      <div>
                        <span className="font-mono text-[11px] px-1.5 py-0.5 rounded bg-slate-800 text-indigo-400">{r.keyword}</span>
                        <span className="mx-1.5 text-slate-500">→</span>
                        <span className="font-semibold text-slate-200">{r.merchant_name}</span>
                        <span className="ml-2 text-[10px] text-emerald-400">({r.category})</span>
                      </div>
                      <button
                        onClick={() => handleDeleteRule(r.id)}
                        className="text-slate-500 hover:text-rose-400 px-1"
                        title="Delete rule"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Search, Multi-Dimensional Facets & Quick Add */}
                    <div className="lg:col-span-7 card-panel rounded-2xl p-5 space-y-4">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <h2 className="text-sm font-bold uppercase tracking-wider text-slate-400">
                            Filter, Pivot &amp; Manual Add
                          </h2>
                          <p className="text-xs text-slate-400">
                            Slice across 12 months by account, type, charge size, category or merchant with instant pivot grouping
                          </p>
                        </div>
                        {hasActiveTxFilters && (
                          <button
                            type="button"
                            onClick={() => {
                              setTxScopeMonth("all");
                              setTxCategoryFilter("All");
                              setTxTypeFilter("All");
                              setTxAccountFilter("All");
                              setTxSizeFilter("all");
                              setTxSearch("");
                            }}
                            className="text-[11px] font-bold text-rose-400 hover:text-rose-300 underline cursor-pointer"
                          >
                            Reset All Filters ✕
                          </button>
                        )}
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-4 gap-2.5 text-xs">
                        <input
                          type="text"
                          placeholder="🔍 Search merchant, note, category..."
                          value={txSearch}
                          onChange={(e) => setTxSearch(e.target.value)}
                          className="sm:col-span-2 px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-white"
                        />
                        <select
                          value={txCategoryFilter}
                          onChange={(e) => setTxCategoryFilter(e.target.value)}
                          className="px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-white"
                        >
                          <option value="All">All Categories</option>
                          {CATEGORIES.map((c) => (
                            <option key={c} value={c}>{c}</option>
                          ))}
                        </select>
                        <select
                          value={txAccountFilter}
                          onChange={(e) => setTxAccountFilter(e.target.value)}
                          className="px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-white"
                        >
                          <option value="All">All Accounts</option>
                          {accounts.map((a) => (
                            <option key={a.id} value={String(a.id)}>
                              {a.institution} · {a.name}
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* 1-Click Facet Pills */}
                      <div className="flex flex-wrap items-center gap-3 text-[11px]">
                        <div className="flex items-center gap-1 bg-slate-900/80 p-1 rounded-lg border border-slate-800">
                          {[
                            { id: "all", label: "All 12M" },
                            { id: "selected", label: fmtMonthLabel(selectedMonth) },
                          ].map((s) => (
                            <button
                              type="button"
                              key={s.id}
                              onClick={() => setTxScopeMonth(s.id)}
                              className={`px-2 py-0.5 rounded font-semibold cursor-pointer transition ${
                                txScopeMonth === s.id
                                  ? "bg-indigo-600 text-white"
                                  : "text-slate-400 hover:text-white"
                              }`}
                            >
                              {s.label}
                            </button>
                          ))}
                        </div>

                        <div className="flex items-center gap-1 bg-slate-900/80 p-1 rounded-lg border border-slate-800">
                          {[
                            { id: "All", label: "All Types" },
                            { id: "expense", label: "Expenses" },
                            { id: "income", label: "Inflows" },
                            { id: "transfer", label: "Transfers / Prin." },
                          ].map((tp) => (
                            <button
                              type="button"
                              key={tp.id}
                              onClick={() => setTxTypeFilter(tp.id)}
                              className={`px-2 py-0.5 rounded font-semibold cursor-pointer transition ${
                                txTypeFilter === tp.id
                                  ? "bg-emerald-600 text-white"
                                  : "text-slate-400 hover:text-white"
                              }`}
                            >
                              {tp.label}
                            </button>
                          ))}
                        </div>

                        <div className="flex items-center gap-1 bg-slate-900/80 p-1 rounded-lg border border-slate-800">
                          {[
                            { id: "all", label: "All Sizes" },
                            { id: "major", label: "Major (≥ $450)" },
                            { id: "everyday", label: "Everyday (< $450)" },
                          ].map((sz) => (
                            <button
                              type="button"
                              key={sz.id}
                              onClick={() => setTxSizeFilter(sz.id)}
                              className={`px-2 py-0.5 rounded font-semibold cursor-pointer transition ${
                                txSizeFilter === sz.id
                                  ? "bg-amber-600 text-white"
                                  : "text-slate-400 hover:text-white"
                              }`}
                            >
                              {sz.label}
                            </button>
                          ))}
                        </div>
                      </div>

                      <form onSubmit={handleAddTransaction} className="p-3 rounded-xl bg-slate-900/70 border border-slate-800 grid grid-cols-1 sm:grid-cols-5 gap-2 text-xs">
                        <select
                          value={newTx.account_id}
                          onChange={(e) => setNewTx({ ...newTx, account_id: e.target.value })}
                          className="px-2 py-1.5 rounded bg-slate-950 border border-slate-700 text-white"
                          required
                        >
                          <option value="">Account...</option>
                          {accounts.map((a) => (
                            <option key={a.id} value={a.id}>{a.institution} - {a.name}</option>
                          ))}
                        </select>
                        <input
                          type="date"
                          value={newTx.tx_date}
                          onChange={(e) => setNewTx({ ...newTx, tx_date: e.target.value })}
                          className="px-2 py-1.5 rounded bg-slate-950 border border-slate-700 text-white"
                        />
                        <input
                          type="text"
                          placeholder="Merchant Description"
                          value={newTx.description}
                          onChange={(e) => setNewTx({ ...newTx, description: e.target.value })}
                          className="px-2 py-1.5 rounded bg-slate-950 border border-slate-700 text-white"
                          required
                        />
                        <input
                          type="number"
                          step="0.01"
                          placeholder="Amount ($)"
                          value={newTx.amount}
                          onChange={(e) => setNewTx({ ...newTx, amount: e.target.value })}
                          className="px-2 py-1.5 rounded bg-slate-950 border border-slate-700 text-white"
                          required
                        />
                        <button type="submit" className="px-3 py-1.5 rounded bg-emerald-600 hover:bg-emerald-500 text-white font-semibold">
                          + Add Tx
                        </button>
                      </form>
                    </div>
                  </div>

                  {/* Live Filtered Summary Strip */}
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                    <div className="card-panel rounded-xl p-3">
                      <div className="text-[10px] uppercase font-bold text-slate-400">Matching Txns</div>
                      <div className="text-lg font-extrabold font-mono text-white mt-0.5">{filteredTxs.length}</div>
                    </div>
                    <div className="card-panel rounded-xl p-3">
                      <div className="text-[10px] uppercase font-bold text-slate-400">Expenses Sum</div>
                      <div className="text-lg font-extrabold font-mono text-rose-400 mt-0.5">{fmtCurrency(expenseSum)}</div>
                    </div>
                    <div className="card-panel rounded-xl p-3">
                      <div className="text-[10px] uppercase font-bold text-slate-400">Inflows Sum</div>
                      <div className="text-lg font-extrabold font-mono text-emerald-400 mt-0.5">+{fmtCurrency(incomeSum)}</div>
                    </div>
                    <div className="card-panel rounded-xl p-3">
                      <div className="text-[10px] uppercase font-bold text-slate-400">Transfers / Prin.</div>
                      <div className="text-lg font-extrabold font-mono text-purple-400 mt-0.5">{fmtCurrency(transferSum)}</div>
                    </div>
                    <div className="card-panel rounded-xl p-3">
                      <div className="text-[10px] uppercase font-bold text-slate-400">Avg Expense</div>
                      <div className="text-lg font-extrabold font-mono text-sky-400 mt-0.5">{fmtCurrency(avgExpense)}</div>
                    </div>
                    <div className="card-panel rounded-xl p-3">
                      <div className="text-[10px] uppercase font-bold text-slate-400">Largest Charge</div>
                      <div className="text-lg font-extrabold font-mono text-amber-400 mt-0.5">{fmtCurrency(largestExpense)}</div>
                    </div>
                  </div>

                  {/* Transactions Table / Interactive Pivot */}
                  <div className="card-panel rounded-2xl p-5 overflow-x-auto">
                    <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                      <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                        {txGroupBy === "none"
                          ? filteredTxs.length === 0
                            ? "0 Matching Transactions"
                            : `Showing ${txStartIdx + 1}–${Math.min(txStartIdx + txPageSize, filteredTxs.length)} of ${filteredTxs.length} Matching Transactions`
                          : `${groupedRows.length} Groups across ${filteredTxs.length} Matching Transactions`}
                      </h3>
                      <div className="flex flex-wrap items-center gap-1 bg-slate-900/80 p-1 rounded-xl border border-slate-800 text-[11px]">
                        <span className="text-[10px] uppercase font-bold text-slate-500 px-2">Group By:</span>
                        {[
                          { id: "none", label: "Flat List" },
                          { id: "merchant", label: "Merchant" },
                          { id: "category", label: "Category" },
                          { id: "account", label: "Account" },
                          { id: "month", label: "Month" },
                        ].map((g) => (
                          <button
                            type="button"
                            key={g.id}
                            onClick={() => {
                              setTxGroupBy(g.id);
                              setTxExpandedGroup(null);
                            }}
                            className={`px-2.5 py-1 rounded-lg font-semibold cursor-pointer transition ${
                              txGroupBy === g.id
                                ? "bg-indigo-600 text-white"
                                : "text-slate-400 hover:text-white"
                            }`}
                          >
                            {g.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {txGroupBy !== "none" ? (
                      <table className="w-full text-left border-collapse text-xs">
                        <thead>
                          <tr className="border-b border-slate-800 text-slate-400 uppercase text-[10px]">
                            <th className="py-2.5 px-3">Group ({txGroupBy})</th>
                            <th className="py-2.5 px-3 text-right">Txns</th>
                            <th className="py-2.5 px-3 text-right">Share</th>
                            <th className="py-2.5 px-3 text-right">Avg / Tx</th>
                            <th className="py-2.5 px-3 text-right">Total</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/60">
                          {groupedRows.length === 0 ? (
                            <tr>
                              <td colSpan="5" className="py-8 text-center text-xs text-slate-400">
                                No transactions match your current filters.
                              </td>
                            </tr>
                          ) : (
                            groupedRows.map((g) => {
                              const isExpanded = txExpandedGroup === g.key;
                              const sharePct = grandGroupedAbs > 0 ? ((g.totalAbs / grandGroupedAbs) * 100).toFixed(1) : "0.0";
                              return (
                                <React.Fragment key={g.key}>
                                  <tr
                                    onClick={() => setTxExpandedGroup(isExpanded ? null : g.key)}
                                    className="hover:bg-slate-800/40 cursor-pointer transition"
                                  >
                                    <td className="py-2.5 px-3 font-bold text-white flex items-center gap-2">
                                      <span className="text-indigo-400">{isExpanded ? "▾" : "▸"}</span>
                                      <span>{g.label}</span>
                                    </td>
                                    <td className="py-2.5 px-3 text-right font-mono text-slate-300">{g.count}</td>
                                    <td className="py-2.5 px-3 text-right font-mono text-slate-400">{sharePct}%</td>
                                    <td className="py-2.5 px-3 text-right font-mono text-slate-300">{fmtCurrency(g.avgAbs)}</td>
                                    <td className="py-2.5 px-3 text-right font-mono font-bold text-white">{fmtCurrency(g.totalAbs)}</td>
                                  </tr>
                                  {isExpanded && (
                                    <tr>
                                      <td colSpan="5" className="bg-slate-950/60 px-6 py-3">
                                        <div className="max-h-72 overflow-y-auto divide-y divide-slate-800/60">
                                          {g.txs.slice(0, 60).map((t) => (
                                            <div key={t.id} className="py-2 flex flex-wrap items-center justify-between gap-2 text-[11px]">
                                              <div className="flex items-center gap-2 min-w-0">
                                                <span className="text-slate-400 font-mono shrink-0">{t.tx_date}</span>
                                                <span className="font-semibold text-white truncate">{t.merchant}</span>
                                                <span className="text-slate-500 truncate">
                                                  {t.institution} · {t.account_name}
                                                </span>
                                              </div>
                                              <div className="flex items-center gap-3 shrink-0">
                                                {editingTxId === t.id ? (
                                                  <select
                                                    autoFocus
                                                    value={t.category}
                                                    onBlur={() => setEditingTxId(null)}
                                                    onChange={(e) => {
                                                      const newCat = e.target.value;
                                                      setEditingTxId(null);
                                                      handleUpdateTxCategory(t, newCat, false);
                                                    }}
                                                    onClick={(e) => e.stopPropagation()}
                                                    className="px-1.5 py-0.5 rounded bg-slate-900 border border-indigo-500 text-indigo-300 text-[10px] font-semibold"
                                                  >
                                                    {CATEGORIES.map((c) => (
                                                      <option key={c} value={c}>{c}</option>
                                                    ))}
                                                  </select>
                                                ) : (
                                                  <button
                                                    type="button"
                                                    onClick={(e) => {
                                                      e.stopPropagation();
                                                      setEditingTxId(t.id);
                                                    }}
                                                    className="px-1.5 py-0.5 rounded bg-slate-900 border border-slate-700 hover:border-indigo-500 text-indigo-300 text-[10px] font-semibold cursor-pointer"
                                                    title="Click to recategorize"
                                                  >
                                                    {t.category} ✎
                                                  </button>
                                                )}
                                                <span className={`font-mono font-bold ${t.tx_type === "income" ? "text-emerald-400" : "text-white"}`}>
                                                  {t.tx_type === "income" ? `+${fmtCurrency(Math.abs(t.amount))}` : fmtCurrency(t.amount)}
                                                </span>
                                              </div>
                                            </div>
                                          ))}
                                        </div>
                                      </td>
                                    </tr>
                                  )}
                                </React.Fragment>
                              );
                            })
                          )}
                        </tbody>
                      </table>
                    ) : (
                      <table className="w-full text-left border-collapse text-xs">
                        <thead>
                          <tr className="border-b border-slate-800 text-slate-400 uppercase text-[10px]">
                            <th className="py-2.5 px-3">Date</th>
                            <th className="py-2.5 px-3">Account</th>
                            <th className="py-2.5 px-3">Merchant</th>
                            <th className="py-2.5 px-3">Raw Description</th>
                            <th className="py-2.5 px-3">Category</th>
                            <th className="py-2.5 px-3 text-right">Amount</th>
                            <th className="py-2.5 px-3 text-right">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/60">
                          {visibleFlatTxs.length === 0 ? (
                            <tr>
                              <td colSpan="7" className="py-8 text-center text-xs text-slate-400">
                                No transactions match your current search or facet filters.
                              </td>
                            </tr>
                          ) : (
                            visibleFlatTxs.map((t) => (
                              <tr key={t.id} className="hover:bg-slate-800/30">
                                <td className="py-2.5 px-3 text-slate-400 whitespace-nowrap">{t.tx_date}</td>
                                <td className="py-2.5 px-3 whitespace-nowrap">
                                  <button
                                    type="button"
                                    onClick={() => setTxAccountFilter(String(t.account_id))}
                                    className="text-left hover:underline cursor-pointer"
                                    title={`Filter to ${t.institution} · ${t.account_name}`}
                                  >
                                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded border mr-1.5 ${INSTITUTION_BADGES[t.institution] || "bg-slate-800"}`}>
                                      {t.institution}
                                    </span>
                                    <span className="text-slate-400">{t.account_name}</span>
                                  </button>
                                </td>
                                <td className="py-2.5 px-3 font-semibold text-white">
                                  <button
                                    type="button"
                                    onClick={() => setTxSearch(t.merchant)}
                                    className="hover:text-indigo-400 text-left cursor-pointer"
                                    title={`Filter to ${t.merchant}`}
                                  >
                                    {t.merchant}
                                  </button>
                                </td>
                                <td className="py-2.5 px-3 text-slate-400 font-mono text-[11px]">{t.description}</td>
                                <td className="py-2.5 px-3">
                                  {editingTxId === t.id ? (
                                    <select
                                      autoFocus
                                      value={t.category}
                                      onBlur={() => setEditingTxId(null)}
                                      onChange={(e) => {
                                        const newCat = e.target.value;
                                        setEditingTxId(null);
                                        const makeRule = window.confirm(`Update category to "${newCat}"?\n\nClick OK to also create an automatic rule for "${t.merchant}".`);
                                        handleUpdateTxCategory(t, newCat, makeRule);
                                      }}
                                      className="px-2 py-1 rounded bg-slate-900 border border-indigo-500 text-indigo-400 text-xs font-semibold cursor-pointer"
                                    >
                                      {CATEGORIES.map((c) => (
                                        <option key={c} value={c}>{c}</option>
                                      ))}
                                    </select>
                                  ) : (
                                    <button
                                      type="button"
                                      onClick={() => setEditingTxId(t.id)}
                                      className="px-2 py-0.5 rounded bg-slate-900 border border-slate-700 hover:border-indigo-500 text-indigo-400 text-xs font-semibold cursor-pointer transition"
                                      title="Click to recategorize"
                                    >
                                      {t.category} ✎
                                    </button>
                                  )}
                                </td>
                                <td className={`py-2.5 px-3 text-right font-bold whitespace-nowrap ${
                                  t.tx_type === "income" ? "text-emerald-400" : "text-white"
                                }`}>
                                  {t.tx_type === "income" ? `+${fmtCurrency(Math.abs(t.amount))}` : fmtCurrency(t.amount)}
                                </td>
                                <td className="py-2.5 px-3 text-right">
                                  <button
                                    onClick={() => handleDeleteTransaction(t.id)}
                                    className="text-slate-500 hover:text-rose-400 p-1 transition"
                                    title="Delete transaction"
                                  >
                                    🗑️
                                  </button>
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    )}
                    {txGroupBy === "none" && filteredTxs.length > txPageSize && (
                      <div className="mt-4 pt-3 border-t border-slate-800 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-400">
                        <div className="flex items-center gap-2">
                          <span>Rows per page:</span>
                          {[60, 150].map((sz) => (
                            <button
                              type="button"
                              key={sz}
                              onClick={() => {
                                setTxPageSize(sz);
                                setTxPage(1);
                              }}
                              className={`px-2 py-0.5 rounded border font-mono cursor-pointer ${
                                txPageSize === sz
                                  ? "bg-indigo-600 border-indigo-500 text-white"
                                  : "bg-slate-900 border-slate-700 text-slate-300"
                              }`}
                            >
                              {sz}
                            </button>
                          ))}
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            disabled={safeTxPage <= 1}
                            onClick={() => setTxPage(Math.max(1, safeTxPage - 1))}
                            className="px-2.5 py-1 rounded bg-slate-900 border border-slate-700 disabled:opacity-40 text-white font-semibold cursor-pointer"
                          >
                            ← Prev
                          </button>
                          <span className="font-mono">
                            Page {safeTxPage} / {totalTxPages}
                          </span>
                          <button
                            type="button"
                            disabled={safeTxPage >= totalTxPages}
                            onClick={() => setTxPage(Math.min(totalTxPages, safeTxPage + 1))}
                            className="px-2.5 py-1 rounded bg-slate-900 border border-slate-700 disabled:opacity-40 text-white font-semibold cursor-pointer"
                          >
                            Next →
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
          </div>
          );
        })()}

        {/* ==================== TAB: NEEDS VS. EXCESS, MAJOR PURCHASES & NEXT-$1M SIMULATOR ==================== */}
        {activeTab === "excess" && (
          <div className="space-y-6">
            {!reflectionsData ? (
              <div className="card-panel rounded-2xl p-12 text-center text-xs text-slate-400">
                Loading Needs vs. Excess, Major Purchase Planner &amp; Wealth Milestone Simulator...
              </div>
            ) : (
              (() => {
                const st = reflectionsData.spending_tiers || {};
                const mSeries = reflectionsData.monthly_breakdown || [];
                const majList = reflectionsData.major_purchases || [];
                const majProjects = reflectionsData.major_projects || [];
                const plannedBuys = reflectionsData.planned_purchases || [];

                // 1. Spending Decomposition Numbers (Net of partner housing share vs Gross)
                const necMonthly = netPartnerMode
                  ? Number(st.necessary_net_monthly || 0)
                  : Number(st.necessary_gross_monthly || 0);
                const necAnnual = netPartnerMode
                  ? Number(st.necessary_net_annual || 0)
                  : Number(st.necessary_gross_annual || 0);
                const everyDiscMonthly = Number(st.everyday_discretionary_monthly || 0);
                const everyDiscAnnual = Number(st.everyday_discretionary_annual || 0);
                const noMajorMonthly = necMonthly + everyDiscMonthly;
                const noMajorAnnual = necAnnual + everyDiscAnnual;
                const majDiscAnnual = Number(st.major_discretionary_annual || 0);
                const majDiscMonthly = Number(st.major_discretionary_monthly || 0);
                const majForcedAnnual = Number(st.major_forced_annual || 0);
                const majForcedMonthly = Number(st.major_forced_monthly || 0);
                const actualAnnual = netPartnerMode
                  ? Number(st.actual_total_net_annual || 0)
                  : Number(st.actual_total_gross_annual || 0);
                const actualMonthly = netPartnerMode
                  ? Number(st.actual_total_net_monthly || 0)
                  : Number(st.actual_total_gross_monthly || 0);
                const fixedHousingGrossMo = Number(uiProfile.monthly_pi || 0) + Number(uiProfile.monthly_hoa || 0);
                const fixedHousingNetMo = Math.max(0, fixedHousingGrossMo - partnerExpected);

                // 2. Stacked 12-Month Chart: Necessary vs Everyday Discretionary vs Major Buys
                const monthlyTierChartData = {
                  labels: mSeries.map((m) => m.ym),
                  datasets: [
                    {
                      label: netPartnerMode
                        ? "1. Necessary Baseline (Fixed Housing Net + Utils + Subs + Groceries + Gas + Normal Ent)"
                        : "1. Necessary Baseline (Gross Housing + Utils + Subs + Groceries + Gas + Normal Ent)",
                      data: mSeries.map((m) => (netPartnerMode ? m.necessary_total_net : m.necessary_total_gross)),
                      backgroundColor: "#10b981",
                      stack: "spend",
                      borderRadius: 3,
                    },
                    {
                      label: "2. Everyday Discretionary (Dining Out & Routine <$450 Shopping/Travel)",
                      data: mSeries.map((m) => m.everyday_discretionary),
                      backgroundColor: "#6366f1",
                      stack: "spend",
                      borderRadius: 3,
                    },
                    {
                      label: "3. Major Discretionary Buys (≥$450 Big Purchases & Upgrades)",
                      data: mSeries.map((m) => m.major_discretionary),
                      backgroundColor: "#f59e0b",
                      stack: "spend",
                      borderRadius: 3,
                    },
                    {
                      label: "4. Forced Statutory / Tax / Special Assessments",
                      data: mSeries.map((m) => m.major_forced),
                      backgroundColor: "#a855f7",
                      stack: "spend",
                      borderRadius: 3,
                    },
                  ],
                };

                // 3. Multi-Year Realized Net Worth & Next-$1M Milestone Simulator
                // Starts from REALIZED Net Worth today — unvested RSUs are excluded from Realized NW
                // and modeled as future vesting income over time!
                const startRealizedNW = Number(
                  homeValuationMode === "comps_cooling"
                    ? (net_worth.total_net_worth_comps || net_worth.total || 0)
                    : (net_worth.total || 0)
                );
                const startUnvestedGross = Number(net_worth.unvested_rsu_gross || 0);
                const rsuTaxRate = Number(uiProfile.default_tax_rate_rsu_withholding || 0.35);
                const hasSignificantRsu = startUnvestedGross > 50000;
                const baseCashTakeHomeAnd401k = hasSignificantRsu ? 194500 : Math.max(85000, actualAnnual * 1.15);
                const annualRefresherBase = hasSignificantRsu ? 600000 : 12000;
                const rMkt = Number(simMarketReturnPct || 7.0) / 100.0;

                const simulateWealthPath = (annualSpend, incomeMode) => {
                  let nw = startRealizedNW;
                  let unvPool = incomeMode === "coast" ? 0 : startUnvestedGross;
                  const rsuMult =
                    incomeMode === "conservative"
                      ? 0.75
                      : incomeMode === "bull"
                      ? 1.25
                      : incomeMode === "unvested_only"
                      ? 1.0
                      : incomeMode === "coast"
                      ? 0.0
                      : 1.0;
                  const newGrantBase =
                    incomeMode === "unvested_only" || incomeMode === "coast" ? 0 : annualRefresherBase * rsuMult;

                  if (incomeMode === "conservative" || incomeMode === "bull") {
                    unvPool = unvPool * rsuMult;
                  }

                  const path = [{ yearOffset: 0, year: 2026, age: 29, nw: Math.round(nw), rsuNetInflow: 0, waTaxPaid: 0, annualSaved: 0 }];
                  for (let t = 1; t <= 16; t++) {
                    const calYr = 2026 + t;
                    const salGrowth = Math.pow(1.025, t - 1);
                    const cashComp =
                      incomeMode === "coast" ? (baseCashTakeHomeAnd401k * 0.7) * salGrowth : baseCashTakeHomeAnd401k * salGrowth;
                    const estGrossBaseSalary = (incomeMode === "coast" ? 175000 : 275000) * salGrowth;

                    // Unvested RSU pool vests 55% per year + receives annual refresher (if applicable)
                    unvPool = unvPool * (1 + rMkt) + newGrantBase * salGrowth;
                    const vestGross = unvPool * 0.55;
                    unvPool = Math.max(0, unvPool - vestGross);
                    const vestNetFed = vestGross * (1 - rsuTaxRate);

                    // Optional high-earner surtax modeling when regional tax context applies
                    const estHouseholdAgi = estGrossBaseSalary + vestGross;
                    const waTaxThreshold = 1000000 * Math.pow(1.02, Math.max(0, calYr - 2028));
                    const waMillionaireTax =
                      isWaTax && includeWaMillionaireTax && calYr >= 2028 && estHouseholdAgi > waTaxThreshold
                        ? (estHouseholdAgi - waTaxThreshold) * 0.099
                        : 0;

                    const vestNet = Math.max(0, vestNetFed - waMillionaireTax);
                    const totalAfterTaxInflow = cashComp + vestNet;
                    const infSpend = annualSpend * Math.pow(1.02, t - 1);
                    const netAnnualSaved = totalAfterTaxInflow - infSpend;

                    nw = nw * (1 + rMkt) + netAnnualSaved;
                    path.push({
                      yearOffset: t,
                      year: calYr,
                      age: 29 + t,
                      nw: Math.round(nw),
                      rsuNetInflow: Math.round(vestNet),
                      waTaxPaid: Math.round(waMillionaireTax),
                      totalInflow: Math.round(totalAfterTaxInflow),
                      annualSpend: Math.round(infSpend),
                      annualSaved: Math.round(netAnnualSaved),
                      remainingUnvestedGross: Math.round(unvPool),
                    });
                  }
                  return path;
                };

                // Simulated annual spend = Actual Annual Spend + (simMonthlySpendDelta * 12) + simAnnualMajorAllowance
                // Note: if simMonthlySpendDelta is negative (cutting major/excess spend), simAnnualMajorAllowance adds back your planned big-buy budget
                const adjustedAnnualSpend = Math.max(
                  60000,
                  actualAnnual + Number(simMonthlySpendDelta || 0) * 12 + Number(simAnnualMajorAllowance || 0)
                );
                const adjustedMonthlySpend = adjustedAnnualSpend / 12.0;
                const annualSavingsVsActual = actualAnnual - adjustedAnnualSpend;

                const baselineActualPath = simulateWealthPath(actualAnnual, "baseline");
                const activeSimPath = simulateWealthPath(adjustedAnnualSpend, simIncomeScenario);
                const conservativeSimPath = simulateWealthPath(adjustedAnnualSpend, "conservative");
                const unvestedOnlySimPath = simulateWealthPath(adjustedAnnualSpend, "unvested_only");

                // Helper to find exact fractional year & calendar month when a path crosses a target Net Worth milestone
                const findMilestoneCrossing = (path, targetNW) => {
                  if (path[0].nw >= targetNW) {
                    return { reached: true, yearsFromNow: 0, yearLabel: "Already Reached", age: 29 };
                  }
                  for (let i = 1; i < path.length; i++) {
                    const prev = path[i - 1];
                    const curr = path[i];
                    if (curr.nw >= targetNW) {
                      const frac = (targetNW - prev.nw) / Math.max(1, curr.nw - prev.nw);
                      const exactYears = prev.yearOffset + frac;
                      const calYear = Math.floor(2026.83 + exactYears);
                      const calMonthIdx = Math.min(11, Math.max(0, Math.floor(((2026.83 + exactYears) - calYear) * 12)));
                      const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
                      return {
                        reached: true,
                        yearsFromNow: exactYears,
                        yearLabel: `${monthNames[calMonthIdx]} ${calYear}`,
                        age: (29 + exactYears).toFixed(1),
                      };
                    }
                  }
                  return { reached: false, yearsFromNow: null, yearLabel: "> 16 yrs", age: "45+" };
                };

                const milestonesList = [3500000, 4000000, 5000000, 6000000, 7500000, 10000000].map((target) => {
                  const baseHit = findMilestoneCrossing(baselineActualPath, target);
                  const activeHit = findMilestoneCrossing(activeSimPath, target);
                  const consHit = findMilestoneCrossing(conservativeSimPath, target);
                  const unvOnlyHit = findMilestoneCrossing(unvestedOnlySimPath, target);
                  const monthsSaved =
                    baseHit.reached && activeHit.reached
                      ? Math.round((baseHit.yearsFromNow - activeHit.yearsFromNow) * 12)
                      : null;
                  return {
                    target,
                    label: `$${(target / 1000000).toFixed(target === 3500000 || target === 7500000 ? 1 : 0)}M Realized NW`,
                    neededFromToday: Math.max(0, target - startRealizedNW),
                    baseHit,
                    activeHit,
                    consHit,
                    unvOnlyHit,
                    monthsSaved,
                  };
                });

                // 25x Annual Spend FI Target comparison
                const fiTargetActual = actualAnnual * 25;
                const fiTargetAdjusted = adjustedAnnualSpend * 25;
                const fiHitActual = findMilestoneCrossing(baselineActualPath, fiTargetActual);
                const fiHitAdjusted = findMilestoneCrossing(activeSimPath, fiTargetAdjusted);
                const fiMonthsEarlier =
                  fiHitActual.reached && fiHitAdjusted.reached
                    ? Math.round((fiHitActual.yearsFromNow - fiHitAdjusted.yearsFromNow) * 12)
                    : 0;

                const nwDeltaYr3 = activeSimPath[3].nw - baselineActualPath[3].nw;
                const nwDeltaYr5 = activeSimPath[5].nw - baselineActualPath[5].nw;
                const nwDeltaYr10 = activeSimPath[10].nw - baselineActualPath[10].nw;

                const wealthChartData = {
                  labels: activeSimPath.slice(0, 11).map((p) => `${p.year} (Age ${p.age})`),
                  datasets: [
                    {
                      label: `Your Adjusted Plan (${fmtCompact(adjustedAnnualSpend)}/yr • ${simIncomeScenario.toUpperCase()})`,
                      data: activeSimPath.slice(0, 11).map((p) => p.nw),
                      borderColor: "#10b981",
                      backgroundColor: "rgba(16, 185, 129, 0.14)",
                      borderWidth: 3,
                      fill: true,
                      tension: 0.25,
                    },
                    {
                      label: `Actual 12M Spend Trajectory (${fmtCompact(actualAnnual)}/yr • Baseline Income)`,
                      data: baselineActualPath.slice(0, 11).map((p) => p.nw),
                      borderColor: "#6366f1",
                      backgroundColor: "transparent",
                      borderWidth: 2,
                      borderDash: [5, 4],
                      tension: 0.25,
                    },
                    {
                      label: `Conservative Income (-25% ${rsuSym} / Equity Pullback)`,
                      data: conservativeSimPath.slice(0, 11).map((p) => p.nw),
                      borderColor: "#f59e0b",
                      backgroundColor: "transparent",
                      borderWidth: 2,
                      borderDash: [3, 3],
                      tension: 0.25,
                    },
                    {
                      label: "Existing Unvested RSUs Only ($0 Future Refreshers)",
                      data: unvestedOnlySimPath.slice(0, 11).map((p) => p.nw),
                      borderColor: "#f43f5e",
                      backgroundColor: "transparent",
                      borderWidth: 1.8,
                      borderDash: [6, 4],
                      tension: 0.25,
                    },
                  ],
                };

                // Sinking fund calculation for Planned Major Purchases
                const monthlyMajorAllowance = Math.max(250, Number(simAnnualMajorAllowance || 12000) / 12.0);
                let cumulativePlannedCost = 0;

                return (
                  <>
                    {/* ==================== SECTION 1: NECESSARY VS. EVERYDAY VS. MAJOR PURCHASES DECOMPOSITION ==================== */}
                    <div className="card-panel rounded-2xl p-5 border border-indigo-500/40 bg-gradient-to-r from-indigo-950/50 via-slate-900 to-emerald-950/30">
                      <div className="flex flex-wrap items-center justify-between gap-4">
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="badge bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                              ⚖️ Necessary vs. Unnecessary Major Buys
                            </span>
                            <span className="badge bg-indigo-500/20 text-indigo-300 border border-indigo-500/40 font-mono">
                              Realized NW: {fmtCompact(startRealizedNW)} (+{fmtCompact(startUnvestedGross)} Unvested RSU Income Pipeline)
                            </span>
                          </div>
                          <h1 className="text-xl font-extrabold text-white mt-2">
                            ⚖️ Monthly &amp; Annual Spending Architecture, Major Purchase Planner &amp; Next-$1M Simulator
                          </h1>
                          <p className="text-xs text-slate-300 mt-1">
                            Separating your <strong>Fixed &amp; Necessary Living</strong> (Housing, Utilities, Subscriptions, Groceries, Gas &amp; normal Entertainment) from <strong>Everyday Discretionary</strong> and <strong>Major One-Off Purchases (≥$450)</strong> — and modeling how spending adjustments &amp; RSU income variations change when you hit each extra <strong>$1,000,000</strong>.
                          </p>
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => setNetPartnerMode(!netPartnerMode)}
                            className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition ${
                              netPartnerMode
                                ? "bg-emerald-600 text-white border-emerald-400 shadow"
                                : "bg-slate-900 text-slate-300 border-slate-700"
                            }`}
                          >
                            {netPartnerMode ? `✓ Net of ${partnerName} (-${fmtCompact(partnerExpected)}/mo)` : "Showing Gross Housing"}
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Top 4 Spending Tier KPI Cards */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                      {/* Tier 1: Fixed & Necessary Living */}
                      <div className="card-panel rounded-2xl p-5 border-l-4 border-l-emerald-500">
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] font-bold uppercase text-emerald-400">
                            1. Necessary Living Baseline
                          </span>
                          <span className="badge bg-emerald-500/15 text-emerald-300 font-mono">Fixed + Core</span>
                        </div>
                        <div className="text-2xl font-extrabold font-mono text-white mt-1.5">
                          {fmtCurrency(necMonthly)}<span className="text-xs text-slate-400 font-normal">/mo</span>
                        </div>
                        <div className="text-xs font-mono font-bold text-emerald-400 mt-0.5">
                          {fmtCurrency(necAnnual)}/yr
                        </div>
                        <div className="mt-2.5 pt-2 border-t border-slate-800/80 text-[11px] text-slate-400 space-y-0.5">
                          <div>• Fixed Housing ({netPartnerMode ? `Net ${fmtCurrency(fixedHousingNetMo)}/mo` : `Gross ${fmtCurrency(fixedHousingGrossMo)}/mo`})</div>
                          <div>• Utilities, Insurance, Subscriptions, Groceries &amp; Transit</div>
                          <div>• Routine Living Baseline: {fmtCurrency(Math.max(0, necMonthly - (netPartnerMode ? fixedHousingNetMo : fixedHousingGrossMo)))}/mo</div>
                        </div>
                      </div>

                      {/* Tier 2: Spend WITHOUT Major Purchases */}
                      <div className="card-panel rounded-2xl p-5 border-l-4 border-l-indigo-500">
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] font-bold uppercase text-indigo-400">
                            2. Spend Without Major Buys
                          </span>
                          <span className="badge bg-indigo-500/20 text-indigo-300 font-mono">Clean Run-Rate</span>
                        </div>
                        <div className="text-2xl font-extrabold font-mono text-white mt-1.5">
                          {fmtCurrency(noMajorMonthly)}<span className="text-xs text-slate-400 font-normal">/mo</span>
                        </div>
                        <div className="text-xs font-mono font-bold text-indigo-300 mt-0.5">
                          {fmtCurrency(noMajorAnnual)}/yr
                        </div>
                        <div className="mt-2.5 pt-2 border-t border-slate-800/80 text-[11px] text-slate-400 space-y-0.5">
                          <div>• Necessary Living: <strong>{fmtCurrency(necMonthly)}/mo</strong></div>
                          <div>• + Everyday Dining &amp; Routine Shopping: <strong>+{fmtCurrency(everyDiscMonthly)}/mo</strong></div>
                          <div className="text-emerald-400 font-semibold">
                            Saves +{fmtCurrency(actualAnnual - noMajorAnnual)}/yr vs. actual!
                          </div>
                        </div>
                      </div>

                      {/* Tier 3: Major One-Off Purchases (>= $450) */}
                      <div className="card-panel rounded-2xl p-5 border-l-4 border-l-amber-500">
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] font-bold uppercase text-amber-400">
                            3. Major Purchases (≥$450)
                          </span>
                          <span className="badge bg-amber-500/20 text-amber-300 font-mono">{majList.length} Big Items</span>
                        </div>
                        <div className="text-2xl font-extrabold font-mono text-amber-300 mt-1.5">
                          {fmtCurrency(majDiscMonthly + majForcedMonthly)}<span className="text-xs text-slate-400 font-normal">/mo</span>
                        </div>
                        <div className="text-xs font-mono font-bold text-white mt-0.5">
                          {fmtCurrency(majDiscAnnual + majForcedAnnual)}/yr total
                        </div>
                        <div className="mt-2.5 pt-2 border-t border-slate-800/80 text-[11px] text-slate-400 space-y-0.5">
                          <div>• Discretionary Big Buys: <strong className="text-amber-300">{fmtCurrency(majDiscAnnual)}/yr</strong> ({fmtCurrency(majDiscMonthly)}/mo)</div>
                          <div>• Forced HOA Special / IRS Tax: <strong className="text-purple-300">{fmtCurrency(majForcedAnnual)}/yr</strong></div>
                        </div>
                      </div>

                      {/* Tier 4: Actual 12M Total Spending */}
                      <div className="card-panel rounded-2xl p-5 border-l-4 border-l-rose-500">
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] font-bold uppercase text-rose-400">
                            4. Actual 12M Total Spend
                          </span>
                          <span className="badge bg-rose-500/20 text-rose-300 font-mono">All-In 12M</span>
                        </div>
                        <div className="text-2xl font-extrabold font-mono text-white mt-1.5">
                          {fmtCurrency(actualMonthly)}<span className="text-xs text-slate-400 font-normal">/mo</span>
                        </div>
                        <div className="text-xs font-mono font-bold text-rose-300 mt-0.5">
                          {fmtCurrency(actualAnnual)}/yr
                        </div>
                        <div className="mt-2.5 pt-2 border-t border-slate-800/80 text-[11px] text-slate-400 space-y-0.5">
                          <div>• <strong>{Math.round((noMajorAnnual / actualAnnual) * 100)}%</strong> is baseline + normal living</div>
                          <div>• <strong>{Math.round(((majDiscAnnual + majForcedAnnual) / actualAnnual) * 100)}%</strong> came from major one-off spikes</div>
                        </div>
                      </div>
                    </div>

                    {/* Month-by-Month Stacked Chart & Table: Necessary vs. Everyday vs. Major Buys */}
                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                      <div className="lg:col-span-7 card-panel rounded-2xl p-5">
                        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                          <div>
                            <h3 className="text-sm font-bold uppercase tracking-wider text-slate-300">
                              📊 Month-by-Month Spending: Necessary Baseline vs. Major Purchase Spikes
                            </h3>
                            <p className="text-xs text-slate-400">
                              Notice how your green + indigo baseline stays steady around <strong>{fmtCompact(noMajorMonthly)}/mo</strong> — almost all monthly variance comes from amber/purple major items!
                            </p>
                          </div>
                        </div>
                        <ChartCanvas
                          type="bar"
                          height={290}
                          isDark={isDark}
                          data={monthlyTierChartData}
                          options={{
                            scales: {
                              x: {
                                stacked: true,
                                ticks: { color: isDark ? "#94a3b8" : "#64748b" },
                                grid: { color: isDark ? "rgba(51,65,85,0.25)" : "rgba(226,232,240,0.8)" },
                              },
                              y: {
                                stacked: true,
                                ticks: { color: isDark ? "#94a3b8" : "#64748b", callback: (v) => fmtCompact(v) },
                                grid: { color: isDark ? "rgba(51,65,85,0.25)" : "rgba(226,232,240,0.8)" },
                              },
                            },
                            plugins: {
                              legend: { labels: { color: isDark ? "#cbd5e1" : "#334155", boxWidth: 12, font: { size: 11 } } },
                            },
                          }}
                        />
                      </div>

                      {/* Month-by-Month Table showing "With Major" vs "Without Major" */}
                      <div className="lg:col-span-5 card-panel rounded-2xl p-5 overflow-x-auto">
                        <h3 className="text-sm font-bold uppercase tracking-wider text-slate-300 mb-1">
                          🗓️ Monthly Spend: Actual vs. Without Major Buys
                        </h3>
                        <p className="text-xs text-slate-400 mb-3">
                          Click any month to see which major items drove that month's spike
                        </p>
                        <div className="max-h-[300px] overflow-y-auto">
                          <table className="w-full text-left border-collapse text-xs font-mono">
                            <thead className="sticky top-0 bg-slate-900 border-b border-slate-800 text-[10px] uppercase text-slate-400 font-sans">
                              <tr>
                                <th className="py-2 px-2">Month</th>
                                <th className="py-2 px-2 text-right">Necessary</th>
                                <th className="py-2 px-2 text-right">No-Major Spend</th>
                                <th className="py-2 px-2 text-right">Major Buys</th>
                                <th className="py-2 px-2 text-right">Actual Total</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-800/60">
                              {[...mSeries].reverse().map((m) => {
                                const nec = netPartnerMode ? m.necessary_total_net : m.necessary_total_gross;
                                const noMaj = netPartnerMode ? m.spend_without_major_buys_net : m.spend_without_major_buys_gross;
                                const majTot = m.major_discretionary + m.major_forced;
                                const actTot = netPartnerMode ? m.total_net_partner : m.total_gross;
                                return (
                                  <tr key={m.ym} className="hover:bg-slate-800/40">
                                    <td className="py-2 px-2 font-sans font-bold text-indigo-400">{m.ym}</td>
                                    <td className="py-2 px-2 text-right text-emerald-400">{fmtCompact(nec)}</td>
                                    <td className="py-2 px-2 text-right font-bold text-white">{fmtCompact(noMaj)}</td>
                                    <td className={`py-2 px-2 text-right ${majTot > 0 ? "text-amber-300 font-bold" : "text-slate-500"}`}>
                                      {majTot > 0 ? `+${fmtCompact(majTot)}` : "—"}
                                    </td>
                                    <td className="py-2 px-2 text-right font-bold text-slate-200">{fmtCompact(actTot)}</td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </div>

                    {/* ==================== SECTION 2: NEXT-$1M WEALTH MILESTONE, SPENDING ADJUSTMENT & INCOME VARIATION SIMULATOR ==================== */}
                    <div className="card-panel rounded-2xl p-5 border border-emerald-500/40 space-y-5">
                      <div className="flex flex-wrap items-start justify-between gap-4">
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <h2 className="text-base font-bold text-white">
                              🚀 When Do I Hit Another Million? — Spending Adjustment &amp; Income Simulator
                            </h2>
                            <span className="badge bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-mono">
                              Starts @ {fmtCompact(startRealizedNW)} Realized NW (+Unvested RSUs as Income)
                            </span>
                            {isWaTax && (
                              <button
                                onClick={() => setIncludeWaMillionaireTax(!includeWaMillionaireTax)}
                                className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border transition ${
                                  includeWaMillionaireTax
                                    ? "bg-amber-500/20 border-amber-400 text-amber-200"
                                    : "bg-slate-900 border-slate-700 text-slate-400 hover:text-white"
                                }`}
                                title="Toggle regional high-income surtax (> $1,000,000 AGI starting 2028)"
                              >
                                {includeWaMillionaireTax
                                  ? `🏛️ High-AGI Surtax (> $1M): ON (-${fmtCompact(activeSimPath[2]?.waTaxPaid || 0)}/yr in 2028+)`
                                  : "🏛️ High-AGI Surtax: OFF"}
                              </button>
                            )}
                          </div>
                          <p className="text-xs text-slate-400 mt-1">
                            Starts from your <strong>Realized Net Worth today ({fmtCurrency(startRealizedNW)})</strong> — your <strong>{fmtCurrency(startUnvestedGross)}</strong> of unvested equity awards are modeled as <strong>incoming annual income</strong> (+{fmtCompact(startUnvestedGross * (1 - rsuTaxRate))} net after {Math.round(rsuTaxRate * 1000) / 10}% tax withholding{isWaTax && includeWaMillionaireTax ? ", plus 9.9% surtax above $1M AGI starting 2028" : ""}).
                          </p>
                        </div>

                        {/* Quick Spending Strategy Presets */}
                        <div className="flex flex-wrap gap-1.5 text-xs">
                          {[
                            {
                              label: `Actual 12M Spend (${fmtCompact(actualAnnual)}/yr)`,
                              apply: () => {
                                setSimMonthlySpendDelta(0);
                                setSimAnnualMajorAllowance(0);
                              },
                              active: simMonthlySpendDelta === 0 && simAnnualMajorAllowance === 0,
                            },
                            {
                              label: "Skip Unnecessary Major Buys (+$12k/yr Planned Big-Buy Fund)",
                              apply: () => {
                                setSimMonthlySpendDelta(-Math.round(majDiscMonthly));
                                setSimAnnualMajorAllowance(12000);
                              },
                              active:
                                Math.abs(simMonthlySpendDelta + Math.round(majDiscMonthly)) < 100 &&
                                simAnnualMajorAllowance === 12000,
                            },
                            {
                              label: `Zero Discretionary Major Buys (${fmtCompact(noMajorAnnual)}/yr Clean Baseline)`,
                              apply: () => {
                                setSimMonthlySpendDelta(-Math.round(majDiscMonthly + majForcedMonthly));
                                setSimAnnualMajorAllowance(0);
                              },
                              active:
                                Math.abs(simMonthlySpendDelta + Math.round(majDiscMonthly + majForcedMonthly)) < 150 &&
                                simAnnualMajorAllowance === 0,
                            },
                            {
                              label: `Lean Living Target (${fmtCompact(Math.round(noMajorAnnual * 0.85))}/yr)`,
                              apply: () => {
                                const leanTgt = Math.round(noMajorAnnual * 0.85);
                                setSimMonthlySpendDelta(-Math.round((actualAnnual - leanTgt) / 12));
                                setSimAnnualMajorAllowance(0);
                              },
                              active: Math.abs(adjustedAnnualSpend - Math.round(noMajorAnnual * 0.85)) < 1500,
                            },
                          ].map((p, idx) => (
                            <button
                              key={idx}
                              onClick={p.apply}
                              className={`px-2.5 py-1.5 rounded-xl font-semibold border transition ${
                                p.active
                                  ? "bg-emerald-600 border-emerald-400 text-white shadow"
                                  : "bg-slate-900 border-slate-800 text-slate-300 hover:border-emerald-500/50"
                              }`}
                            >
                              {p.label}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* 4 Interactive Sliders / Controls */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
                        {/* Control 1: Monthly Spending Adjustment */}
                        <div className="p-3.5 rounded-xl bg-slate-950/80 border border-slate-800">
                          <div className="flex justify-between items-center mb-1">
                            <span className="font-bold text-slate-300">1. Monthly Spend Adjustment</span>
                            <span className={`font-mono font-bold ${simMonthlySpendDelta <= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                              {simMonthlySpendDelta > 0 ? `+${fmtCurrency(simMonthlySpendDelta)}/mo` : `${fmtCurrency(simMonthlySpendDelta)}/mo`}
                            </span>
                          </div>
                          <input
                            type="range"
                            min="-6500"
                            max="3000"
                            step="100"
                            value={simMonthlySpendDelta}
                            onChange={(e) => setSimMonthlySpendDelta(parseInt(e.target.value, 10))}
                            className="w-full accent-emerald-500 cursor-pointer my-1.5"
                          />
                          <div className="text-[11px] text-slate-400 flex justify-between">
                            <span>Cut -$6.5k/mo</span>
                            <span>Actual ($0)</span>
                            <span>+$3k/mo</span>
                          </div>
                        </div>

                        {/* Control 2: Planned Annual Major Purchase Budget */}
                        <div className="p-3.5 rounded-xl bg-slate-950/80 border border-slate-800">
                          <div className="flex justify-between items-center mb-1">
                            <span className="font-bold text-slate-300">2. Planned Big-Buy Budget / Yr</span>
                            <span className="font-mono font-bold text-amber-300">
                              {fmtCurrency(simAnnualMajorAllowance)}/yr ({fmtCurrency(simAnnualMajorAllowance / 12)}/mo)
                            </span>
                          </div>
                          <input
                            type="range"
                            min="0"
                            max="48000"
                            step="1200"
                            value={simAnnualMajorAllowance}
                            onChange={(e) => setSimAnnualMajorAllowance(parseInt(e.target.value, 10))}
                            className="w-full accent-amber-500 cursor-pointer my-1.5"
                          />
                          <div className="text-[11px] text-slate-400 flex justify-between">
                            <span>$0/yr</span>
                            <span>$12k/yr ($1k/mo)</span>
                            <span>$48k/yr</span>
                          </div>
                        </div>

                        {/* Control 3: Projected Income & RSU Variation */}
                        <div className="p-3.5 rounded-xl bg-slate-950/80 border border-slate-800">
                          <div className="flex justify-between items-center mb-1">
                            <span className="font-bold text-slate-300">3. Projected Income / RSU Variation</span>
                          </div>
                          <select
                            value={simIncomeScenario}
                            onChange={(e) => setSimIncomeScenario(e.target.value)}
                            className="w-full px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-white font-semibold my-1"
                          >
                            <option value="baseline">Baseline (Salary + Unvested + Annual Refreshers)</option>
                            <option value="conservative">Conservative (-25% {rsuSym} &amp; Refresher Pullback)</option>
                            <option value="unvested_only">Unvested Only (Collect Existing Unvested, $0 Future Grants)</option>
                            <option value="bull">Strong Bull (+25% {rsuSym} / Equity Trajectory)</option>
                            <option value="coast">Walk-Away Stress Test ($0 Unvested RSUs, Base Pay Only)</option>
                          </select>
                          <div className="text-[10px] text-slate-400">
                            Yr 1 Total After-Tax Inflow: <strong className="text-indigo-300 font-mono">{fmtCurrency(activeSimPath[1]?.totalInflow || 0)}/yr</strong>
                          </div>
                        </div>

                        {/* Control 4: Market Return Assumption */}
                        <div className="p-3.5 rounded-xl bg-slate-950/80 border border-slate-800">
                          <div className="flex justify-between items-center mb-1">
                            <span className="font-bold text-slate-300">4. Expected Annual Return</span>
                            <span className="font-mono font-bold text-indigo-400">{simMarketReturnPct.toFixed(1)}%/yr</span>
                          </div>
                          <input
                            type="range"
                            min="4.0"
                            max="11.0"
                            step="0.5"
                            value={simMarketReturnPct}
                            onChange={(e) => setSimMarketReturnPct(parseFloat(e.target.value))}
                            className="w-full accent-indigo-500 cursor-pointer my-1.5"
                          />
                          <div className="text-[11px] text-slate-400 flex justify-between">
                            <span>4.0% Conservative</span>
                            <span>7.0% Real</span>
                            <span>11.0% Nominal</span>
                          </div>
                        </div>
                      </div>

                      {/* Impact Summary Banner */}
                      <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-xs">
                        <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800">
                          <div className="text-[10px] font-bold uppercase text-slate-400">Simulated Annual Spend</div>
                          <div className="text-lg font-extrabold font-mono text-white mt-0.5">
                            {fmtCurrency(adjustedAnnualSpend)}/yr
                          </div>
                          <div className={`text-[11px] font-mono font-semibold ${annualSavingsVsActual >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                            {fmtCurrency(adjustedMonthlySpend)}/mo ({annualSavingsVsActual >= 0 ? `Saves +${fmtCurrency(annualSavingsVsActual)}/yr` : `+${fmtCurrency(-annualSavingsVsActual)}/yr more`})
                          </div>
                        </div>

                        <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800">
                          <div className="text-[10px] font-bold uppercase text-slate-400">Extra Wealth in 3 &amp; 5 Years</div>
                          <div className={`text-lg font-extrabold font-mono mt-0.5 ${nwDeltaYr5 >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                            5Y: {nwDeltaYr5 >= 0 ? `+${fmtCompact(nwDeltaYr5)}` : fmtCompact(nwDeltaYr5)}
                          </div>
                          <div className="text-[11px] text-slate-300 font-mono">
                            3Y: {nwDeltaYr3 >= 0 ? `+${fmtCompact(nwDeltaYr3)}` : fmtCompact(nwDeltaYr3)} • 10Y: {nwDeltaYr10 >= 0 ? `+${fmtCompact(nwDeltaYr10)}` : fmtCompact(nwDeltaYr10)}
                          </div>
                        </div>

                        <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800">
                          <div className="text-[10px] font-bold uppercase text-slate-400">Next Million ($2.0M Realized NW)</div>
                          <div className="text-lg font-extrabold font-mono text-indigo-300 mt-0.5">
                            {milestonesList[0].activeHit.yearLabel} (Age {milestonesList[0].activeHit.age})
                          </div>
                          <div className="text-[11px] text-slate-400">
                            Need <strong>+{fmtCompact(milestonesList[0].neededFromToday)}</strong> from today's $1.36M
                          </div>
                        </div>

                        <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800">
                          <div className="text-[10px] font-bold uppercase text-slate-400">25x FI / Retirement Readiness</div>
                          <div className="text-lg font-extrabold font-mono text-emerald-400 mt-0.5">
                            {fiHitAdjusted.yearLabel} (Age {fiHitAdjusted.age})
                          </div>
                          <div className="text-[11px] text-emerald-300">
                            {fiMonthsEarlier > 0
                              ? `⚡ Retires ${fiMonthsEarlier} mos (${(fiMonthsEarlier / 12).toFixed(1)} yrs) earlier!`
                              : `25x Target: ${fmtCompact(fiTargetAdjusted)}`}
                          </div>
                        </div>
                      </div>

                      {/* Chart + Milestone Table Grid */}
                      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                        <div className="lg:col-span-6">
                          <div className="text-xs font-bold uppercase tracking-wider text-slate-300 mb-2">
                            📈 Realized Net Worth Trajectory Across Income &amp; Spending Scenarios (10-Yr View)
                          </div>
                          <ChartCanvas
                            type="line"
                            height={280}
                            isDark={isDark}
                            data={wealthChartData}
                            options={{
                              scales: {
                                x: {
                                  ticks: { color: isDark ? "#94a3b8" : "#64748b" },
                                  grid: { color: isDark ? "rgba(51,65,85,0.25)" : "rgba(226,232,240,0.8)" },
                                },
                                y: {
                                  ticks: { color: isDark ? "#94a3b8" : "#64748b", callback: (v) => fmtCompact(v) },
                                  grid: { color: isDark ? "rgba(51,65,85,0.25)" : "rgba(226,232,240,0.8)" },
                                },
                              },
                              plugins: {
                                legend: { labels: { color: isDark ? "#cbd5e1" : "#334155", boxWidth: 12, font: { size: 11 } } },
                              },
                            }}
                          />
                        </div>

                        <div className="lg:col-span-6 overflow-x-auto">
                          <div className="text-xs font-bold uppercase tracking-wider text-slate-300 mb-2">
                            🏆 When Do You Hit Each Million? (Realized Net Worth Milestones)
                          </div>
                          <table className="w-full text-left border-collapse text-xs font-mono">
                            <thead>
                              <tr className="border-b border-slate-800 text-[10px] uppercase text-slate-400 font-sans">
                                <th className="py-2 px-2">Milestone</th>
                                <th className="py-2 px-2 text-right">Actual Spend</th>
                                <th className="py-2 px-2 text-right">Your Adjusted Plan</th>
                                <th className="py-2 px-2 text-right">Time Saved</th>
                                <th className="py-2 px-2 text-right">-25% RSU Bear</th>
                                <th className="py-2 px-2 text-right">Unvested Only</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-800/60">
                              {milestonesList.map((m) => (
                                <tr key={m.target} className="hover:bg-slate-800/30">
                                  <td className="py-2.5 px-2 font-sans font-bold text-white">
                                    {m.label}
                                    <span className="block text-[10px] text-slate-400 font-normal">
                                      +{fmtCompact(m.neededFromToday)} from today
                                    </span>
                                  </td>
                                  <td className="py-2.5 px-2 text-right text-slate-300">
                                    {m.baseHit.yearLabel}
                                    <span className="block text-[10px] text-slate-500">Age {m.baseHit.age}</span>
                                  </td>
                                  <td className="py-2.5 px-2 text-right font-bold text-emerald-400">
                                    {m.activeHit.yearLabel}
                                    <span className="block text-[10px] text-emerald-300/80">Age {m.activeHit.age}</span>
                                  </td>
                                  <td className="py-2.5 px-2 text-right">
                                    {m.monthsSaved !== null && m.monthsSaved > 0 ? (
                                      <span className="badge bg-emerald-500/20 text-emerald-300">
                                        {m.monthsSaved} mos sooner
                                      </span>
                                    ) : m.monthsSaved !== null && m.monthsSaved < 0 ? (
                                      <span className="badge bg-rose-500/20 text-rose-300">
                                        {-m.monthsSaved} mos later
                                      </span>
                                    ) : (
                                      <span className="text-slate-500">—</span>
                                    )}
                                  </td>
                                  <td className="py-2.5 px-2 text-right text-amber-300">
                                    {m.consHit.yearLabel}
                                    <span className="block text-[10px] text-slate-500">Age {m.consHit.age}</span>
                                  </td>
                                  <td className="py-2.5 px-2 text-right text-rose-300">
                                    {m.unvOnlyHit.yearLabel}
                                    <span className="block text-[10px] text-slate-500">Age {m.unvOnlyHit.age}</span>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </div>

                    {/* ==================== SECTION 3: MAJOR PURCHASES TRACKER & "WHEN CAN I BUY BIGGER THINGS?" PLANNER ==================== */}
                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                      {/* Left Column: Future Major Purchase Planner & Affordability Gate */}
                      <div className="lg:col-span-5 card-panel rounded-2xl p-5 border border-amber-500/30 space-y-4">
                        <div>
                          <div className="flex items-center justify-between">
                            <h3 className="text-sm font-bold uppercase tracking-wider text-amber-300">
                              🗓️ Major Purchase Planner — When Can I Buy Bigger Things?
                            </h3>
                            <span className="badge bg-amber-500/20 text-amber-300 font-mono">
                              Budget: {fmtCurrency(monthlyMajorAllowance)}/mo
                            </span>
                          </div>
                          <p className="text-xs text-slate-400 mt-1">
                            Queue up future big purchases below. Based on your <strong>{fmtCurrency(simAnnualMajorAllowance)}/yr ({fmtCurrency(monthlyMajorAllowance)}/mo)</strong> big-buy sinking fund and monthly free cash flow, see exactly when each item is green-lit!
                          </p>
                        </div>

                        {/* Add Planned Purchase Form */}
                        <form onSubmit={handleAddPlannedPurchase} className="p-3 rounded-xl bg-slate-950/90 border border-slate-800 space-y-2.5 text-xs">
                          <div className="font-bold text-slate-300">+ Add Future Major Purchase to Plan</div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            <input
                              type="text"
                              placeholder="Item / Project Name (e.g. Espresso Machine, Ski Trip)"
                              value={newPlannedBuy.name}
                              onChange={(e) => setNewPlannedBuy({ ...newPlannedBuy, name: e.target.value })}
                              className="px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-white"
                              required
                            />
                            <input
                              type="number"
                              step="100"
                              placeholder="Estimated Cost ($)"
                              value={newPlannedBuy.estimated_cost}
                              onChange={(e) => setNewPlannedBuy({ ...newPlannedBuy, estimated_cost: e.target.value })}
                              className="px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-white font-mono"
                              required
                            />
                            <input
                              type="month"
                              value={newPlannedBuy.target_ym}
                              onChange={(e) => setNewPlannedBuy({ ...newPlannedBuy, target_ym: e.target.value })}
                              className="px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-white font-mono"
                            />
                            <div className="flex gap-2">
                              <input
                                type="text"
                                placeholder="Notes / Trigger rule..."
                                value={newPlannedBuy.notes}
                                onChange={(e) => setNewPlannedBuy({ ...newPlannedBuy, notes: e.target.value })}
                                className="flex-1 px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-white"
                              />
                              <button
                                type="submit"
                                className="px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-white font-bold shrink-0"
                              >
                                + Plan
                              </button>
                            </div>
                          </div>
                        </form>

                        {/* Planned Purchases Queue */}
                        <div className="space-y-2.5 max-h-[420px] overflow-y-auto pr-1 text-xs">
                          {plannedBuys.map((pb) => {
                            const cost = Number(pb.estimated_cost || 0);
                            const isMortgageLump = cost >= 30000;
                            if (!isMortgageLump) {
                              cumulativePlannedCost += cost;
                            }
                            const monthsOfAllowance = isMortgageLump
                              ? (cost / 49809.23).toFixed(1)
                              : (cumulativePlannedCost / monthlyMajorAllowance).toFixed(1);
                            return (
                              <div key={pb.id} className="p-3.5 rounded-xl bg-slate-950/90 border border-slate-800 space-y-1.5">
                                <div className="flex items-start justify-between gap-2">
                                  <div>
                                    <div className="flex items-center gap-2">
                                      <span className="font-bold text-white text-sm">{pb.name}</span>
                                      <span className="badge bg-indigo-500/20 text-indigo-300 font-mono">
                                        Target: {pb.target_ym}
                                      </span>
                                    </div>
                                    {pb.notes && <p className="text-[11px] text-slate-400 mt-0.5">{pb.notes}</p>}
                                  </div>
                                  <div className="flex items-center gap-2 shrink-0">
                                    <span className="text-sm font-extrabold font-mono text-amber-300">
                                      {fmtCurrency(cost)}
                                    </span>
                                    <button
                                      onClick={() => handleDeletePlannedPurchase(pb.id)}
                                      className="text-slate-500 hover:text-rose-400 px-1"
                                      title="Remove planned purchase"
                                    >
                                      ✕
                                    </button>
                                  </div>
                                </div>
                                <div className="flex flex-wrap items-center justify-between gap-2 pt-1.5 border-t border-slate-800/70 text-[11px]">
                                  {isMortgageLump ? (
                                    <span className="text-emerald-400 font-semibold">
                                      ✓ Funded by ~{monthsOfAllowance} mos of net {rsuSym} RSU vests ({fmtCompact(net_worth.monthly_rsu_vest_net || 0)}/mo net) or taxable brokerage
                                    </span>
                                  ) : (
                                    <span className="text-emerald-400 font-semibold">
                                      ✓ Covered after {monthsOfAllowance} mos of your {fmtCurrency(monthlyMajorAllowance)}/mo Major-Buy Sinking Fund
                                    </span>
                                  )}
                                  <span className="text-slate-400 font-mono">
                                    10-Yr Compounding Cost: {fmtCompact(cost * Math.pow(1 + rMkt, 10))}
                                  </span>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      {/* Right Column: Historical Major Purchases Log (>= $450) & Project Breakdown */}
                      <div className="lg:col-span-7 card-panel rounded-2xl p-5 space-y-4">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div>
                            <h3 className="text-sm font-bold uppercase tracking-wider text-slate-300">
                              🏷️ Major Purchases You Bought (Last 12M ≥ $450) — By Project &amp; Verdict
                            </h3>
                            <p className="text-xs text-slate-400">
                              Classify major one-off purchases as <strong>✅ Worth It</strong>, <strong>✂️ Skip Next Time</strong>, or <strong>🏠 Forced Need</strong>
                            </p>
                          </div>
                        </div>

                        {/* Project Group Filter Pills */}
                        <div className="flex flex-wrap gap-1.5 text-xs">
                          <button
                            onClick={() => setMajorProjectFilter("All")}
                            className={`px-2.5 py-1 rounded-xl font-semibold border transition ${
                              majorProjectFilter === "All"
                                ? "bg-indigo-600 border-indigo-400 text-white"
                                : "bg-slate-900 border-slate-800 text-slate-300 hover:text-white"
                            }`}
                          >
                            All Major Buys ({majList.length})
                          </button>
                          {majProjects.map((pg) => (
                            <button
                              key={pg.project}
                              onClick={() => setMajorProjectFilter(pg.project)}
                              className={`px-2.5 py-1 rounded-xl font-semibold border transition ${
                                majorProjectFilter === pg.project
                                  ? "bg-indigo-600 border-indigo-400 text-white"
                                  : "bg-slate-900 border-slate-800 text-slate-300 hover:text-white"
                              }`}
                            >
                              {pg.project} ({fmtCompact(pg.total)})
                            </button>
                          ))}
                        </div>

                        {/* Major Transactions List */}
                        <div className="space-y-2 max-h-[420px] overflow-y-auto pr-1 text-xs">
                          {majList
                            .filter((item) => majorProjectFilter === "All" || item.project_group === majorProjectFilter)
                            .map((item) => (
                              <div
                                key={item.id}
                                className="p-3 rounded-xl bg-slate-950/90 border border-slate-800 flex flex-wrap items-center justify-between gap-3"
                              >
                                <div className="max-w-xl">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <span className="font-mono text-slate-400">{item.tx_date}</span>
                                    <span className="font-bold text-white text-sm">{item.merchant}</span>
                                    <span className="text-[10px] px-2 py-0.5 rounded bg-slate-800 text-indigo-300 font-semibold">
                                      {item.project_group}
                                    </span>
                                  </div>
                                  <div className="text-[11px] text-slate-400 mt-0.5 font-mono">{item.description}</div>
                                  {item.notes && (
                                    <div className="text-[11px] text-amber-300/90 italic mt-1 bg-amber-950/30 border border-amber-500/20 px-2 py-0.5 rounded">
                                      💬 Your Note: &ldquo;{item.notes}&rdquo;
                                    </div>
                                  )}
                                </div>

                                <div className="flex items-center gap-3">
                                  <div className="text-right font-mono">
                                    <div className="text-sm font-extrabold text-amber-300">{fmtCurrency(item.amount)}</div>
                                  </div>

                                  <div className="flex items-center gap-1 bg-slate-900 p-1 rounded-xl border border-slate-800 text-[11px]">
                                    {[
                                      { id: "worth_it", label: "✅ Worth It", cls: "bg-emerald-600 text-white" },
                                      { id: "skip_next_time", label: "✂️ Skip Next Time", cls: "bg-rose-600 text-white" },
                                      { id: "forced_need", label: "🏠 Forced", cls: "bg-purple-600 text-white" },
                                    ].map((b) => (
                                      <button
                                        key={b.id}
                                        onClick={() => handleSaveMajorVerdict(item.id, b.id, item.project_group)}
                                        className={`px-2 py-1 rounded-lg font-semibold transition ${
                                          item.verdict === b.id ? b.cls : "text-slate-400 hover:text-white"
                                        }`}
                                      >
                                        {b.label}
                                      </button>
                                    ))}
                                  </div>
                                </div>
                              </div>
                            ))}
                        </div>
                      </div>
                    </div>

                    {/* ==================== SECTION 3B: TRIP & AIRBNB COST RECONSTRUCTOR + REFLECTION INSIGHTS ==================== */}
                    {reflectionsData.trips_analysis && (
                      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                        {/* Left 7 Cols: Trip & Short-Term Lodging Cost Reconstructor */}
                        {(() => {
                          const tripsObj = reflectionsData.trips_analysis || {};
                          const pt = tripsObj.primary_trip || {};
                          const ab = tripsObj.airbnb_trips || {};
                          const ut = tripsObj.upcoming_trip || {};
                          const activeTabKey = selectedTripTab || "primary";
                          return (
                        <div className="lg:col-span-7 card-panel rounded-2xl p-5 border border-cyan-500/30 space-y-4">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div>
                              <span className="text-[11px] font-bold uppercase tracking-wider text-cyan-400">
                                ✈️ Trip &amp; Lodging Cost Reconstructor
                              </span>
                              <h3 className="text-base font-bold text-white mt-0.5">
                                Major Trips, Short-Term Stays &amp; Upcoming Bookings
                              </h3>
                            </div>
                            <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs">
                              {[
                                { id: "primary", label: `✈️ ${pt.tab_label || "Primary Trip"} (${fmtCompact(pt.core_trip_total_ex_art || 0)} Core)` },
                                { id: "airbnb", label: `🏡 Lodging (${fmtCurrency(ab.total_airbnb_lodging || 0)})` },
                                { id: "upcoming", label: `🗓️ ${ut.tab_label || "Upcoming"} (${fmtCurrency(ut.prepaid_total_with_airbnb || 0)})` },
                              ].map((t) => (
                                <button
                                  key={t.id}
                                  onClick={() => setSelectedTripTab(t.id)}
                                  className={`px-2.5 py-1 rounded-lg font-bold transition ${
                                    activeTabKey === t.id
                                      ? "bg-cyan-600 text-white shadow"
                                      : "text-slate-400 hover:text-white"
                                  }`}
                                >
                                  {t.label}
                                </button>
                              ))}
                            </div>
                          </div>

                          {activeTabKey === "primary" && (
                            <div className="space-y-3 text-xs">
                              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                <div className="p-3 rounded-xl bg-slate-950/90 border border-emerald-500/30">
                                  <div className="text-[10px] font-bold uppercase text-emerald-400">Core Trip (Ex-Galleries)</div>
                                  <div className="text-lg font-extrabold font-mono text-white mt-0.5">{fmtCurrency(pt.core_trip_total_ex_art || 0)}</div>
                                  <div className="text-[10px] text-slate-400">{pt.title || "Primary trip spend"}</div>
                                </div>
                                <div className="p-3 rounded-xl bg-slate-950/90 border border-rose-500/30">
                                  <div className="text-[10px] font-bold uppercase text-rose-400">Art &amp; Discretionary Add-ons</div>
                                  <div className="text-lg font-extrabold font-mono text-rose-300 mt-0.5">+{fmtCurrency(pt.art_and_galleries_total || 0)}</div>
                                  <div className="text-[10px] text-slate-400">Non-core discretionary extras</div>
                                </div>
                                <div className="p-3 rounded-xl bg-slate-950/90 border border-cyan-500/30">
                                  <div className="text-[10px] font-bold uppercase text-cyan-300">Grand Total Trip Spend</div>
                                  <div className="text-lg font-extrabold font-mono text-cyan-300 mt-0.5">{fmtCurrency(pt.grand_total_with_art || 0)}</div>
                                  <div className="text-[10px] text-slate-400">{pt.dates || ""}</div>
                                </div>
                              </div>
                              <div className="p-3 rounded-xl bg-indigo-950/30 border border-indigo-500/30 text-[11px] text-slate-200 space-y-1">
                                {pt.airbnb_note && <div><strong>🏨 Lodging Note:</strong> {pt.airbnb_note}</div>}
                                {pt.flights_note && <div><strong>✈️ Flights Note:</strong> {pt.flights_note}</div>}
                              </div>
                              <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
                                {(pt.buckets || []).map((b, i) => (
                                  <div key={i} className="p-3 rounded-xl bg-slate-950/85 border border-slate-800 space-y-1.5">
                                    <div className="flex items-center justify-between font-bold text-white">
                                      <span>{b.category}</span>
                                      <span className="font-mono text-cyan-300">{fmtCurrency(b.amount)}</span>
                                    </div>
                                    <div className="space-y-1 pl-2 border-l border-slate-800 text-[11px]">
                                      {(b.items || []).map((it, j) => (
                                        <div key={j} className="flex flex-wrap items-center justify-between gap-2 text-slate-300">
                                          <div>
                                            <span className="font-mono text-slate-400 mr-1.5">{it.date}:</span>
                                            <strong className="text-white">{it.merchant}</strong>
                                            {it.note && <span className="text-slate-400 ml-1.5">— {it.note}</span>}
                                          </div>
                                          <span className="font-mono font-bold text-amber-300">{fmtCurrency(it.amount)}</span>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {activeTabKey === "airbnb" && (
                            <div className="space-y-3 text-xs">
                              <div className="p-3 rounded-xl bg-slate-950/90 border border-cyan-500/30 flex items-center justify-between">
                                <div>
                                  <div className="font-bold text-white">{ab.title || "Total Short-Term Lodging Charges"}</div>
                                  <div className="text-[11px] text-slate-400">{(ab.bookings || []).length} bookings matched across trailing 12 months</div>
                                </div>
                                <div className="text-xl font-extrabold font-mono text-cyan-300">{fmtCurrency(ab.total_airbnb_lodging || 0)}</div>
                              </div>
                              {(ab.bookings || []).map((bk, idx) => (
                                <div key={idx} className="p-3.5 rounded-xl bg-slate-950/90 border border-slate-800 space-y-1.5">
                                  <div className="flex flex-wrap items-center justify-between gap-2">
                                    <div>
                                      <span className="badge bg-indigo-500/20 text-indigo-300 font-mono mr-2">{bk.charge_date} • {bk.code}</span>
                                      <strong className="text-white text-sm">{bk.trip_name}</strong>
                                    </div>
                                    <div className="text-right font-mono">
                                      <span className="text-slate-400 text-[11px] mr-2">Lodging: {fmtCurrency(bk.airbnb_amount)}</span>
                                      <strong className="text-emerald-400 text-sm">Total Trip: {fmtCurrency(bk.total_trip_cost)}</strong>
                                    </div>
                                  </div>
                                  <p className="text-[11px] text-slate-300 leading-relaxed">{bk.details}</p>
                                </div>
                              ))}
                            </div>
                          )}

                          {activeTabKey === "upcoming" && (
                            <div className="space-y-3 text-xs">
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <div className="p-3 rounded-xl bg-slate-950/90 border border-cyan-500/30">
                                  <div className="text-[10px] font-bold uppercase text-cyan-300">{ut.title || "Upcoming Pre-Paid Total"}</div>
                                  <div className="text-lg font-extrabold font-mono text-white mt-0.5">{fmtCurrency(ut.prepaid_total_with_airbnb || 0)}</div>
                                  <div className="text-[10px] text-slate-400">{ut.status || "Booked advance reservations"}</div>
                                </div>
                                <div className="p-3 rounded-xl bg-slate-950/90 border border-amber-500/30">
                                  <div className="text-[10px] font-bold uppercase text-amber-300">On-Destination / Direct Pre-Charges</div>
                                  <div className="text-lg font-extrabold font-mono text-amber-300 mt-0.5">{fmtCurrency(ut.prepaid_savoy_only || 0)}</div>
                                  <div className="text-[10px] text-slate-400">Non-lodging advance deposits</div>
                                </div>
                              </div>
                              <div className="space-y-2">
                                {(ut.items || []).map((it, idx) => (
                                  <div key={idx} className="p-3 rounded-xl bg-slate-950/85 border border-slate-800 flex items-center justify-between gap-2">
                                    <div>
                                      <div className="font-bold text-white">
                                        <span className="font-mono text-indigo-300 mr-2">{it.date}</span>
                                        {it.merchant}
                                      </div>
                                      <div className="text-[11px] text-slate-400 mt-0.5">{it.note}</div>
                                    </div>
                                    <div className="font-mono font-extrabold text-amber-300 text-sm">{fmtCurrency(it.amount)}</div>
                                  </div>
                                ))}
                              </div>
                              {ut.airline_ticket_audit && (
                                <div className="p-3 rounded-xl bg-amber-950/30 border border-amber-500/30 text-[11px] text-slate-200 leading-relaxed">
                                  <strong className="text-amber-300">✈️ Ticket Routing Audit:</strong> {ut.airline_ticket_audit}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                          );
                        })()}

                        {/* Right 5 Cols: Personalized Takeaways from Your Saved Reflection Notes */}
                        {reflectionsData.user_reflection_insights && (
                          <div className="lg:col-span-5 card-panel rounded-2xl p-5 border border-emerald-500/30 space-y-3">
                            <div className="flex items-center justify-between">
                              <div>
                                <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-400">
                                  💡 Insights From Your Reflection Notes
                                </span>
                                <h3 className="text-base font-bold text-white mt-0.5">
                                  What Your Own Regret Notes Say You Could Skip (+{fmtCurrency(reflectionsData.user_reflection_insights.actionable_annual_regret_savings)}/yr)
                                </h3>
                              </div>
                            </div>

                            <div className="space-y-2.5 max-h-[430px] overflow-y-auto pr-1 text-xs">
                              {(reflectionsData.user_reflection_insights.highlights || []).map((hl, idx) => (
                                <div key={idx} className="p-3 rounded-xl bg-slate-950/90 border border-slate-800 space-y-1.5">
                                  <div className="flex items-center justify-between gap-2">
                                    <span className="font-bold text-white">{hl.title}</span>
                                    <span className={`badge font-mono ${hl.verdict === "cut_back" ? "bg-rose-500/20 text-rose-300" : "bg-amber-500/20 text-amber-300"}`}>
                                      {fmtCurrency(hl.amount)}
                                    </span>
                                  </div>
                                  <p className="text-[11px] text-slate-300 leading-relaxed">{hl.summary}</p>
                                  <div className="text-[11px] text-emerald-300 font-semibold bg-emerald-950/30 border border-emerald-500/20 px-2.5 py-1 rounded">
                                    ✓ {hl.rule}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {/* ==================== SECTION 4: MANUAL MERCHANT CLASSIFICATION & REFLECTION AUDIT ==================== */}
                    <div className="card-panel rounded-2xl p-5 space-y-4">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <h2 className="text-base font-bold text-white">
                            ⚖️ All Merchants Classification — Tag Any Merchant as Need, Worth It, or Cut Back
                          </h2>
                          <p className="text-xs text-slate-400">
                            Tag any merchant as <strong>✅ Worth It</strong> (`{fmtCompact(reflectionsData.totals.worth_it)}`), <strong>✂️ Cut Back / Regret</strong> (`{fmtCompact(reflectionsData.totals.cut_back)}`), <strong>🤔 Questionable</strong> (`{fmtCompact(reflectionsData.totals.questionable)}`), or <strong>🏠 Need</strong> (`{fmtCompact(reflectionsData.totals.need)}`).
                          </p>
                        </div>
                        <div className="flex flex-wrap gap-1.5 text-xs">
                          {[
                            { id: "all_non_need", label: "All Discretionary / Excess" },
                            { id: "questionable", label: "🤔 Questionable" },
                            { id: "worth_it", label: "✅ Worth It" },
                            { id: "cut_back", label: "✂️ Cut Back" },
                            { id: "need", label: "🏠 Essential Needs" },
                          ].map((b) => (
                            <button
                              key={b.id}
                              onClick={() => setReflectionBucketFilter(b.id)}
                              className={`px-3 py-1.5 rounded-xl font-semibold border transition ${
                                reflectionBucketFilter === b.id
                                  ? "bg-indigo-600 border-indigo-400 text-white"
                                  : "bg-slate-900 border-slate-800 text-slate-400 hover:text-white"
                              }`}
                            >
                              {b.label}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="space-y-2.5">
                        {reflectionsData.merchants
                          .filter((m) =>
                            reflectionBucketFilter === "all_non_need"
                              ? m.bucket !== "need"
                              : m.bucket === reflectionBucketFilter
                          )
                          .slice(0, 60)
                          .map((m) => {
                            const isEditing = editingReflectionMerch === m.merchant;
                            return (
                              <div
                                key={m.merchant}
                                className="p-4 rounded-xl bg-slate-950/90 border border-slate-800 space-y-3"
                              >
                                <div className="flex flex-wrap items-center justify-between gap-3">
                                  <div>
                                    <div className="flex items-center gap-2">
                                      <span className="text-sm font-bold text-white">{m.merchant}</span>
                                      <span className="text-[10px] px-2 py-0.5 rounded bg-slate-800 text-slate-300">
                                        {m.category}
                                      </span>
                                      <span className="text-xs text-slate-400">
                                        {m.tx_count} {m.tx_count === 1 ? "charge" : "charges"} ({m.first_date} → {m.last_date})
                                      </span>
                                    </div>
                                    {(m.why_bought || m.feeling) && (
                                      <div className="mt-1.5 text-xs text-indigo-300 bg-indigo-950/40 border border-indigo-800/40 rounded-lg px-3 py-1.5">
                                        {m.why_bought && <div><strong>Why:</strong> {m.why_bought}</div>}
                                        {m.feeling && <div><strong>How I Felt:</strong> {m.feeling}</div>}
                                      </div>
                                    )}
                                  </div>

                                  <div className="flex flex-wrap items-center gap-3">
                                    <div className="text-right">
                                      <div className="text-sm font-bold text-white">{fmtCurrency(m.total_spend)}</div>
                                      <div className="text-[10px] text-slate-400">
                                        ~{fmtCurrency(m.monthly_avg)}/mo avg
                                      </div>
                                    </div>

                                    {/* 1-Click Verdict Buttons */}
                                    <div className="flex items-center gap-1 bg-slate-900 p-1 rounded-xl border border-slate-800 text-[11px]">
                                      {[
                                        { id: "worth_it", label: "✅ Worth It", activeCls: "bg-emerald-600 text-white" },
                                        { id: "questionable", label: "🤔 Mixed", activeCls: "bg-amber-600 text-white" },
                                        { id: "cut_back", label: "✂️ Cut Back", activeCls: "bg-rose-600 text-white" },
                                        { id: "need", label: "🏠 Need", activeCls: "bg-slate-600 text-white" },
                                      ].map((btn) => (
                                        <button
                                          key={btn.id}
                                          onClick={() => handleSaveReflection(m.merchant, { bucket: btn.id })}
                                          className={`px-2.5 py-1 rounded-lg font-semibold transition ${
                                            m.bucket === btn.id ? btn.activeCls : "text-slate-400 hover:text-white"
                                          }`}
                                        >
                                          {btn.label}
                                        </button>
                                      ))}
                                      <button
                                        onClick={() => {
                                          if (isEditing) {
                                            setEditingReflectionMerch(null);
                                          } else {
                                            setEditingReflectionMerch(m.merchant);
                                            setReflectionDraft({
                                              bucket: m.bucket,
                                              why_bought: m.why_bought || "",
                                              feeling: m.feeling || "",
                                              monthly_target: m.monthly_target !== null && m.monthly_target !== undefined ? m.monthly_target : "",
                                            });
                                          }
                                        }}
                                        className="px-2 py-1 rounded-lg text-indigo-400 hover:bg-slate-800 font-semibold"
                                      >
                                        ✎ Note
                                      </button>
                                    </div>
                                  </div>
                                </div>

                                {isEditing && (
                                  <div className="pt-2 border-t border-slate-800 grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs">
                                    <input
                                      type="text"
                                      placeholder="Why did I buy this? (e.g. Home gym project, convenience...)"
                                      value={reflectionDraft.why_bought}
                                      onChange={(e) => setReflectionDraft({ ...reflectionDraft, why_bought: e.target.value })}
                                      className="px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-white"
                                    />
                                    <input
                                      type="text"
                                      placeholder="How do I feel about it now? (e.g. Love it, or ordering too often)"
                                      value={reflectionDraft.feeling}
                                      onChange={(e) => setReflectionDraft({ ...reflectionDraft, feeling: e.target.value })}
                                      className="px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-white"
                                    />
                                    <div className="flex gap-2">
                                      <input
                                        type="number"
                                        placeholder="Target $/mo (optional)"
                                        value={reflectionDraft.monthly_target}
                                        onChange={(e) => setReflectionDraft({ ...reflectionDraft, monthly_target: e.target.value })}
                                        className="flex-1 px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-white"
                                      />
                                      <button
                                        onClick={() =>
                                          handleSaveReflection(m.merchant, {
                                            bucket: reflectionDraft.bucket,
                                            why_bought: reflectionDraft.why_bought,
                                            feeling: reflectionDraft.feeling,
                                            monthly_target:
                                              reflectionDraft.monthly_target !== ""
                                                ? parseFloat(reflectionDraft.monthly_target)
                                                : null,
                                          })
                                        }
                                        className="px-3.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-bold"
                                      >
                                        Save
                                      </button>
                                    </div>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                      </div>
                    </div>
                  </>
                );
              })()
            )}
          </div>
        )}

        {/* ==================== TAB: MORTGAGE & TAX PAYDOWN TRACKER (REAL TRACKER 5.75% & 6.5%) ==================== */}
        {activeTab === "mortgage" && (
          <div className="space-y-6">
            {mortgageLoading || !mortgageData || !mortgageInputs ? (
              <div className="card-panel rounded-2xl p-12 text-center text-xs text-slate-400">
                Loading Mortgage &amp; IRS $750k Tax Deduction Engine...
              </div>
            ) : (
              (() => {
                const eq = mortgageData.equity_progress || {};
                const activeSum = mortgageData.active_plan?.summary || {};
                const baseSum = mortgageData.real_tracker_baseline?.summary || {};
                const prev65Sum = mortgageData.real_tracker_65?.summary || {};
                const currSnap = mortgageData.active_plan?.current_snapshot || {};
                const pmtRed = mortgageData.payment_reduction || {};
                const scenarios = mortgageData.scenarios_comparison || [];
                const eqGuide = mortgageData.equations_guide || [];
                const activeRows = mortgageData.active_plan?.schedule || [];
                const prev65Rows = mortgageData.real_tracker_65?.schedule || [];
                const annualRows = mortgageData.active_plan?.annual_summary || [];
                const notes575 = mortgageData.actual_excess_notes_575 || {};
                const notes65 = mortgageData.actual_excess_notes_65 || {};

                // Build year-end balance chart across the key scenarios
                const chartYears = [];
                for (let y = 2025; y <= 2049; y++) {
                  chartYears.push(String(y));
                }
                const getYearEndBal = (sched, yr) => {
                  if (!sched || sched.length === 0) return 0;
                  const firstYr = parseInt(sched[0].ym.slice(0, 4), 10);
                  if ( parseInt(yr, 10) < firstYr ) return null;
                  const matches = sched.filter((r) => r.ym.startsWith(yr));
                  if (matches.length === 0) return 0;
                  return matches[matches.length - 1].end_balance;
                };

                const balanceChartData = {
                  labels: chartYears,
                  datasets: [
                    {
                      label: "Your Active What-If Plan (5.75%)",
                      data: chartYears.map((yr) => getYearEndBal(activeRows, yr)),
                      borderColor: "#10b981",
                      backgroundColor: "rgba(16, 185, 129, 0.14)",
                      borderWidth: 3,
                      fill: true,
                      tension: 0.25,
                      pointRadius: 3,
                    },
                    {
                      label: "Real Tracker 5.75% ($0 Future Excess)",
                      data: chartYears.map((yr) => getYearEndBal(mortgageData.real_tracker_baseline?.schedule, yr)),
                      borderColor: "#6366f1",
                      backgroundColor: "transparent",
                      borderWidth: 2,
                      borderDash: [5, 4],
                      tension: 0.25,
                      pointRadius: 2,
                    },
                    {
                      label: "Pay -$60k to $750k IRS Cap & Coast",
                      data: chartYears.map((yr) => getYearEndBal(mortgageData.pay_to_750k_plan?.schedule, yr)),
                      borderColor: "#38bdf8",
                      backgroundColor: "transparent",
                      borderWidth: 2,
                      tension: 0.25,
                      pointRadius: 2,
                    },
                    {
                      label: "Real Tracker Plan 5.75% (+$6.8k/mo)",
                      data: chartYears.map((yr) => getYearEndBal(mortgageData.plan_6800_excess?.schedule, yr)),
                      borderColor: "#a855f7",
                      backgroundColor: "transparent",
                      borderWidth: 2,
                      borderDash: [3, 3],
                      tension: 0.25,
                      pointRadius: 2,
                    },
                    {
                      label: "Real Tracker 6.5% (Previous 30-Yr Tab)",
                      data: chartYears.map((yr) => getYearEndBal(prev65Rows, yr)),
                      borderColor: "#f43f5e",
                      backgroundColor: "transparent",
                      borderWidth: 1.8,
                      borderDash: [6, 4],
                      tension: 0.25,
                      pointRadius: 1.5,
                    },
                    {
                      label: `IRS $${((mortgageInputs.mortgage_debt_cap || 750000) / 1000).toFixed(0)}k Tax Deduction Ceiling`,
                      data: chartYears.map(() => Number(mortgageInputs.mortgage_debt_cap || 750000)),
                      borderColor: "#f59e0b",
                      backgroundColor: "transparent",
                      borderWidth: 2,
                      borderDash: [8, 4],
                      pointRadius: 0,
                    },
                  ],
                };

                const annualTaxChartData = {
                  labels: annualRows.map((a) => a.year),
                  datasets: [
                    {
                      label: "Deductible Interest (≤ $750k Cap)",
                      data: annualRows.map((a) => a.deductible_interest),
                      backgroundColor: "#6366f1",
                      borderRadius: 4,
                      stack: "interest",
                    },
                    {
                      label: "Unbenefited Interest (> $750k Cap — $0 Tax Benefit!)",
                      data: annualRows.map((a) => a.non_deductible_interest),
                      backgroundColor: "#f43f5e",
                      borderRadius: 4,
                      stack: "interest",
                    },
                    {
                      label: `IRS Tax Savings (${mortgageInputs.marginal_tax_rate_pct}% Bracket)`,
                      data: annualRows.map((a) => a.true_tax_saved),
                      backgroundColor: "#10b981",
                      borderRadius: 4,
                      stack: "tax_saved",
                    },
                  ],
                };

                const applyPreset = (presetOverrides) => {
                  const next = {
                    ...mortgageInputs,
                    custom_future_overrides: {},
                    ...presetOverrides,
                  };
                  handleMortgagePreview(next);
                };

                const displayed575Rows = mortgageScheduleShowAll ? activeRows : activeRows.slice(0, 36);
                const displayed65Rows = mortgageScheduleShowAll ? prev65Rows : prev65Rows.slice(0, 36);

                const hvm = mortgageData.house_vs_market_analysis || {};
                const alloc10 = hvm.ten_year_allocation_comparison || {};

                return (
                  <>
                    {/* Top Banner: Primary Residence & Amortization Tracker Sync */}
                    <div className="card-panel rounded-2xl p-5 border border-indigo-500/40 bg-gradient-to-r from-indigo-950/60 via-slate-900/90 to-emerald-950/40">
                      <div className="flex flex-wrap items-center justify-between gap-4">
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="badge bg-purple-500/20 text-purple-300 border border-purple-500/40 font-mono">
                              📍 {eq.home_address || homeFull}
                            </span>
                            <span className="badge bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-mono">
                              Bought {fmtCompact(eq.purchase_price || 0)} • Est. {fmtCompact(eq.estimated_home_value || 0)} ({(eq.appreciation_pct || 0) >= 0 ? `+${eq.appreciation_pct || 0}%` : `${eq.appreciation_pct || 0}%`})
                            </span>
                            <span className="badge bg-indigo-500/20 text-indigo-300 border border-indigo-500/40 font-mono">
                              {mortgageInputs?.term_years || 15}-Yr @ {mortgageInputs?.rate_pct || 5.75}% vs. Prior {mortgageInputs?.prev_term_years || 30}-Yr @ {mortgageInputs?.prev_rate_pct || 6.5}%
                            </span>
                            <span className="badge bg-amber-500/20 text-amber-300 border border-amber-500/40 font-mono">
                              IRS Pub 936 {fmtCompact(mortgageInputs?.mortgage_debt_cap || 750000)} Debt Cap Active
                            </span>
                          </div>
                          <h1 className="text-xl font-extrabold text-white mt-2">
                            🏡 Home Valuation, House vs. Stock Market Return &amp; Mortgage Tax Optimizer
                          </h1>
                          <p className="text-xs text-slate-300 mt-1">
                            <strong>{eq.home_address || homeFull}</strong>{eq.property_specs ? ` (${eq.property_specs})` : ""}
                            {mortgageData.meta?.real_tracker_url && (
                              <>
                                {" "}— synced with{" "}
                                <a
                                  href={mortgageData.meta.real_tracker_url}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="text-indigo-400 underline hover:text-indigo-300 font-semibold"
                                >
                                  Active Loan Tracker ↗
                                </a>
                                {mortgageData.meta?.real_tracker_65_url && (
                                  <>
                                    {" "}and{" "}
                                    <a
                                      href={mortgageData.meta.real_tracker_65_url}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="text-indigo-400 underline hover:text-indigo-300 font-semibold"
                                    >
                                      Prior Loan Baseline ↗
                                    </a>
                                  </>
                                )}
                              </>
                            )}
                            . Compare extra mortgage principal vs. stock investing and optimize the {fmtCompact(mortgageInputs?.mortgage_debt_cap || 750000)} IRS interest deduction cap.
                          </p>
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                          {mortgageData.meta?.real_tracker_url && (
                            <button
                              onClick={handleSyncMortgageSheet}
                              disabled={syncingMortgageSheet}
                              className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow flex items-center gap-1.5 transition disabled:opacity-50"
                              title="Pull latest excess principal schedule from external spreadsheet sync"
                            >
                              <span>{syncingMortgageSheet ? "⏳" : "🔄"}</span>
                              <span>{syncingMortgageSheet ? "Syncing Sheet..." : "Sync External Tracker"}</span>
                            </button>
                          )}
                          <button
                            onClick={handleResetMortgage}
                            className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-semibold transition"
                          >
                            Reset to Defaults
                          </button>
                          <button
                            onClick={() => handleSaveMortgage()}
                            disabled={savingMortgage}
                            className="px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold shadow transition"
                          >
                            {savingMortgage ? "Saving..." : "💾 Save Strategy"}
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* ==================== PROPERTY VALUATION & HOUSE VS. STOCK MARKET ALLOCATOR ==================== */}
                    <div className="card-panel rounded-2xl p-5 border border-purple-500/40 bg-gradient-to-br from-purple-950/20 via-slate-900 to-indigo-950/25 space-y-5">
                      <div className="flex flex-wrap items-center justify-between gap-4">
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-[11px] font-bold uppercase tracking-wider text-purple-300">
                              🏡 Primary Residence Valuation (2 Market Views) &amp; Return vs. Stock Market
                            </span>
                            {hvm.neighborhood && (
                              <span className="badge bg-purple-500/20 text-purple-300 border border-purple-500/40 font-mono">
                                {hvm.neighborhood}
                              </span>
                            )}
                            {isWaTax && (
                              <span className="badge bg-amber-500/20 text-amber-300 border border-amber-500/40 font-mono">
                                WA 2028 9.9% Tax Integrated
                              </span>
                            )}
                          </div>
                          <h2 className="text-base font-bold text-white mt-0.5">
                            {hvm.address || homeFull} — Bought at {fmtCurrency(eq.purchase_price || 0)} • Est. Worth {fmtCurrency(hvm.estimated_home_value || 0)} Today
                          </h2>
                          <p className="text-xs text-slate-300 mt-0.5">
                            {hvm.active_valuation_view?.rationale || uiProfile.comps_note || "Compare local market comparable valuations against long-term trend appreciation and equity returns."}
                          </p>
                        </div>

                        {/* Interactive Home Valuation Mode Switcher & Market Return Controls */}
                        {(() => {
                          const midThreshold = (compsHomeCfg + secularHomeCfg) / 2.0;
                          const isCompsActive = Number(mortgageInputs.estimated_home_value || compsHomeCfg) <= midThreshold;
                          return (
                        <div className="flex flex-wrap items-center gap-3 text-xs bg-slate-950/80 p-2.5 rounded-xl border border-slate-800">
                          <div className="flex items-center gap-1 bg-slate-900 p-1 rounded-lg border border-slate-800">
                            <button
                              onClick={() => {
                                setHomeValuationMode("comps_cooling");
                                handleMortgagePreview({
                                  ...mortgageInputs,
                                  valuation_mode: "comps_cooling",
                                  estimated_home_value: compsHomeCfg,
                                  annual_home_appreciation_pct: 2.0,
                                });
                              }}
                              className={`px-2.5 py-1 rounded font-bold transition ${
                                isCompsActive
                                  ? "bg-rose-600 text-white shadow"
                                  : "text-slate-400 hover:text-white"
                              }`}
                            >
                              📉 View A: Local Comps ({fmtCompact(compsHomeCfg)} / 2.0%)
                            </button>
                            <button
                              onClick={() => {
                                setHomeValuationMode("secular_inflation");
                                handleMortgagePreview({
                                  ...mortgageInputs,
                                  valuation_mode: "secular_inflation",
                                  estimated_home_value: secularHomeCfg,
                                  annual_home_appreciation_pct: 3.5,
                                });
                              }}
                              className={`px-2.5 py-1 rounded font-bold transition ${
                                !isCompsActive
                                  ? "bg-emerald-600 text-white shadow"
                                  : "text-slate-400 hover:text-white"
                              }`}
                            >
                              📈 View B: Inflation Trend ({fmtCompact(secularHomeCfg)} / 3.5%)
                            </button>
                          </div>
                          <div>
                            <label className="block text-[10px] text-slate-400 uppercase font-bold">Est. Home Value ($)</label>
                            <input
                              type="number"
                              step="5000"
                              value={mortgageInputs.estimated_home_value ?? compsHomeCfg}
                              onChange={(e) =>
                                handleMortgagePreview({
                                  ...mortgageInputs,
                                  estimated_home_value: parseFloat(e.target.value || compsHomeCfg),
                                })
                              }
                              className="w-28 px-2 py-1 rounded bg-slate-900 border border-purple-500/50 text-purple-300 font-mono font-bold"
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] text-slate-400 uppercase font-bold">Home Apprec. (%/yr)</label>
                            <input
                              type="number"
                              step="0.25"
                              value={mortgageInputs.annual_home_appreciation_pct ?? 2.0}
                              onChange={(e) =>
                                handleMortgagePreview({
                                  ...mortgageInputs,
                                  annual_home_appreciation_pct: parseFloat(e.target.value || 2.0),
                                })
                              }
                              className="w-20 px-2 py-1 rounded bg-slate-900 border border-slate-700 text-white font-mono font-bold"
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] text-slate-400 uppercase font-bold">Stock Return (%/yr)</label>
                            <input
                              type="number"
                              step="0.5"
                              value={mortgageInputs.expected_stock_return_pct ?? 8.0}
                              onChange={(e) =>
                                handleMortgagePreview({
                                  ...mortgageInputs,
                                  expected_stock_return_pct: parseFloat(e.target.value || 8.0),
                                })
                              }
                              className="w-20 px-2 py-1 rounded bg-slate-900 border border-emerald-500/50 text-emerald-400 font-mono font-bold"
                            />
                          </div>
                        </div>
                          );
                        })()}
                      </div>

                      {/* 4 Home Equity & Appreciation Summary Boxes */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
                        <div className="p-3.5 rounded-xl bg-slate-950/85 border border-slate-800 space-y-1">
                          <div className="text-[10px] font-bold uppercase text-slate-400">1. Purchase &amp; Estimated Value</div>
                          <div className="text-lg font-extrabold font-mono text-white">
                            {fmtCurrency(hvm.estimated_home_value || 0)}
                          </div>
                          <div className={`text-[11px] font-mono ${(hvm.unrealized_appreciation ?? 0) >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                            {(hvm.unrealized_appreciation ?? 0) >= 0 ? `+${fmtCurrency(hvm.unrealized_appreciation)}` : fmtCurrency(hvm.unrealized_appreciation ?? 0)} ({(hvm.appreciation_pct ?? 0) >= 0 ? `+${hvm.appreciation_pct}%` : `${hvm.appreciation_pct ?? 0}%`}) vs. {fmtCompact(eq.purchase_price || 0)} Purchase
                          </div>
                          <div className="text-[10px] text-slate-400">
                            10-Yr Projected Value (@ {hvm.annual_appreciation_rate_pct ?? 2.0}%/yr): <strong className="text-slate-200 font-mono">{fmtCompact(hvm.projected_home_value_10yr || 0)}</strong>
                          </div>
                        </div>

                        <div className="p-3.5 rounded-xl bg-slate-950/85 border border-purple-500/40 space-y-1">
                          <div className="text-[10px] font-bold uppercase text-purple-300">2. Market Home Equity (Today)</div>
                          <div className="text-lg font-extrabold font-mono text-purple-300">
                            {fmtCurrency(hvm.market_home_equity || 815000)}
                          </div>
                          <div className="text-[11px] text-slate-300 font-mono">
                            {hvm.market_equity_pct || 50.15}% Equity Ownership • {hvm.ltv_pct || 49.85}% LTV
                          </div>
                          <div className="text-[10px] text-slate-400">
                            Cost-Basis Equity: <strong>{fmtCompact(hvm.cost_basis_equity || 740000)}</strong> ($470k down + $270k paid off)
                          </div>
                        </div>

                        <div className="p-3.5 rounded-xl bg-slate-950/85 border border-emerald-500/40 space-y-1">
                          <div className="text-[10px] font-bold uppercase text-emerald-400">
                            3. Next $60k into House ($810k → $750k)
                          </div>
                          <div className="text-lg font-extrabold font-mono text-emerald-400">
                            {hvm.tier1_above_750k?.guaranteed_after_tax_return_pct || 5.75}% After-Tax Return
                          </div>
                          <div className="text-[11px] text-slate-200 font-semibold">
                            = {hvm.tier1_above_750k?.pretax_stock_equivalent_pct || 7.08}% Pre-Tax Stock Return
                          </div>
                          <div className="text-[10px] text-slate-400">
                            Top $60k gets $0 IRS tax deduction → <strong>🏡 House wins risk-free!</strong>
                          </div>
                        </div>

                        <div className="p-3.5 rounded-xl bg-slate-950/85 border border-indigo-500/40 space-y-1">
                          <div className="text-[10px] font-bold uppercase text-indigo-400">
                            4. Paying House Below $750k ($750k → $0)
                          </div>
                          <div className="text-lg font-extrabold font-mono text-amber-300">
                            Only {hvm.tier2_below_750k?.guaranteed_after_tax_return_pct || 3.62}% After-Tax Return
                          </div>
                          <div className="text-[11px] text-indigo-300 font-semibold">
                            vs. {hvm.tier2_below_750k?.expected_stock_after_tax_pct || 6.50}% After-Tax in Stocks (+{hvm.tier2_below_750k?.stock_annual_after_tax_spread_pct || 2.88}%/yr)
                          </div>
                          <div className="text-[10px] text-slate-400">
                            Below $750k you lose the 37% tax shield → <strong>📈 Stock market wins!</strong>
                          </div>
                        </div>
                      </div>

                      {/* 10-Year Side-by-Side Capital Allocation Comparison Table: Put Money in House vs. Stock Market */}
                      {alloc10.all_house && (
                        <div className="p-4 rounded-xl bg-slate-950/90 border border-slate-800 space-y-3">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div>
                              <h3 className="text-xs font-bold uppercase tracking-wider text-white">
                                ⚖️ 10-Year Capital Allocation Test: Putting Extra Money in Your House vs. The Stock Market
                              </h3>
                              <p className="text-[11px] text-slate-400">
                                Modeling a <strong>$60,000 lump sum + {fmtCurrency(alloc10.monthly_excess_modeled || 0)}/mo excess cash flow</strong> over 10 years (including 100% of {fmtCompact(alloc10.hybrid_750k?.ending_home_value || alloc10.all_house?.ending_home_value || 0)} projected 10-yr home value — compare <strong>No Recast [B1]</strong> vs. <strong>Recast [B2]</strong> below).
                              </p>
                            </div>
                            <span className="badge bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-mono">
                              Cap Strategies Build {Number(alloc10.no_recast_wealth_advantage_vs_all_house || 0) >= 0 ? "+" : ""}{fmtCompact(alloc10.no_recast_wealth_advantage_vs_all_house || 0)} (B1) to {Number(alloc10.hybrid_wealth_advantage_vs_all_house || 0) >= 0 ? "+" : ""}{fmtCompact(alloc10.hybrid_wealth_advantage_vs_all_house || 0)} (B2) vs. 100% House
                            </span>
                          </div>

                          <div className="overflow-x-auto">
                            <table className="w-full text-left border-collapse text-xs">
                              <thead>
                                <tr className="border-b border-slate-800 text-slate-400 uppercase text-[10px]">
                                  <th className="py-2 px-2.5">Allocation Strategy</th>
                                  <th className="py-2 px-2 text-right">Monthly P&amp;I</th>
                                  <th className="py-2 px-2 text-right">10-Yr Gross Int.</th>
                                  <th className="py-2 px-2 text-right">IRS Tax Saved</th>
                                  <th className="py-2 px-2 text-right">Net After-Tax Int.</th>
                                  <th className="py-2 px-2 text-right">Yr-10 Mortgage</th>
                                  <th className="py-2 px-2 text-right">Yr-10 Home Equity</th>
                                  <th className="py-2 px-2 text-right">Yr-10 Stock Port.</th>
                                  <th className="py-2 px-2 text-right">10-Yr Total Wealth</th>
                                  <th className="py-2 px-2 text-right">vs. 100% House</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-800/60 font-mono">
                                {[
                                  {
                                    id: "all_house",
                                    name: "A. 100% House First (Pay Mortgage to $0 Fastest, Then Invest in Stocks)",
                                    badge: "Lowest Interest • Debt-Free Fastest",
                                    badgeCls: "bg-purple-500/20 text-purple-300",
                                    d: alloc10.all_house,
                                  },
                                  {
                                    id: "hybrid_750k_no_recast",
                                    name: `B1. ${fmtCompact(mortgageInputs?.mortgage_debt_cap || 750000)} Cap — Keep ${fmtCurrency(alloc10.hybrid_750k_no_recast?.monthly_req_pmt || pmtRed.curr_575_scheduled_pmt || 0)}/mo P&I (No Recast)`,
                                    badge: "★ Best Balance: Lowest After-Tax Debt Drag",
                                    badgeCls: "bg-sky-500/20 text-sky-300 border border-sky-500/40",
                                    d: alloc10.hybrid_750k_no_recast || alloc10.hybrid_750k,
                                  },
                                  {
                                    id: "hybrid_750k",
                                    name: `B2. ${fmtCompact(mortgageInputs?.mortgage_debt_cap || 750000)} Cap + Recast P&I to ${fmtCurrency(alloc10.hybrid_750k?.monthly_req_pmt || 0)}/mo (Keep Existing Rate)`,
                                    badge: "★ Max Wealth Winner (Frees Cash Flow for Equities)",
                                    badgeCls: "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40",
                                    d: alloc10.hybrid_750k,
                                  },
                                  {
                                    id: "all_market",
                                    name: "C. 100% Stock Market ($0 Extra Mortgage Principal; Invest All Excess)",
                                    badge: "Max Market Leverage",
                                    badgeCls: "bg-indigo-500/20 text-indigo-300",
                                    d: alloc10.all_market,
                                  },
                                ].map((row) => {
                                  const diffVsHouse =
                                    (row.d?.total_combined_net_wealth || 0) -
                                    (alloc10.all_house?.total_combined_net_wealth || 0);
                                  const grossInt = Number(row.d?.cumulative_interest_paid_10yr || 0);
                                  const taxSav = Number(row.d?.cumulative_tax_saved_10yr || 0);
                                  const netInt = Number(row.d?.net_after_tax_interest_10yr ?? (grossInt - taxSav));
                                  return (
                                    <tr
                                      key={row.id}
                                      className={
                                        row.id === "hybrid_750k"
                                          ? "bg-emerald-950/20 hover:bg-emerald-950/30"
                                          : row.id === "hybrid_750k_no_recast"
                                          ? "bg-sky-950/20 hover:bg-sky-950/30"
                                          : "hover:bg-slate-900/60"
                                      }
                                    >
                                      <td className="py-2.5 px-2.5 font-sans">
                                        <div className="font-bold text-white">{row.name}</div>
                                        <span className={`inline-block mt-0.5 text-[10px] px-2 py-0.5 rounded font-semibold ${row.badgeCls}`}>
                                          {row.badge}
                                        </span>
                                      </td>
                                      <td className="py-2.5 px-2 text-right text-slate-300">
                                        {fmtCurrency(row.d?.monthly_req_pmt || eq.scheduled_monthly_pmt || 0)}
                                      </td>
                                      <td className="py-2.5 px-2 text-right text-amber-300">
                                        {fmtCurrency(grossInt)}
                                      </td>
                                      <td className="py-2.5 px-2 text-right text-emerald-400">
                                        -{fmtCurrency(taxSav)}
                                      </td>
                                      <td className="py-2.5 px-2 text-right text-rose-300 font-bold">
                                        {fmtCurrency(netInt)}
                                      </td>
                                      <td className="py-2.5 px-2 text-right text-rose-400">
                                        {fmtCurrency(row.d?.ending_mortgage || 0)}
                                      </td>
                                      <td className="py-2.5 px-2 text-right text-purple-300 font-bold">
                                        {fmtCurrency(row.d?.ending_home_equity || 0)}
                                      </td>
                                      <td className="py-2.5 px-2 text-right text-indigo-300 font-bold">
                                        {fmtCurrency(row.d?.ending_stock_portfolio || 0)}
                                      </td>
                                      <td className="py-2.5 px-2 text-right text-white font-extrabold text-sm">
                                        {fmtCurrency(row.d?.total_combined_net_wealth || 0)}
                                      </td>
                                      <td className="py-2.5 px-2 text-right">
                                        <span
                                          className={`font-bold ${
                                            diffVsHouse > 0
                                              ? "text-emerald-400"
                                              : diffVsHouse < 0
                                              ? "text-rose-400"
                                              : "text-slate-400"
                                          }`}
                                        >
                                          {diffVsHouse === 0 ? "Baseline" : `${diffVsHouse > 0 ? "+" : ""}${fmtCurrency(diffVsHouse)}`}
                                        </span>
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>

                          {(() => {
                            const sB1 = alloc10.hybrid_750k_no_recast || {};
                            const sB2 = alloc10.hybrid_750k || {};
                            const sA = alloc10.all_house || {};
                            const capK = fmtCompact(Number(mortgageInputs?.mortgage_debt_cap || 750000));
                            const diffB1vA = Number(sB1.total_combined_net_wealth || 0) - Number(sA.total_combined_net_wealth || 0);
                            const diffB2vB1 = Number(sB2.total_combined_net_wealth || 0) - Number(sB1.total_combined_net_wealth || 0);
                            const extraGrossInt = Number(sB2.cumulative_interest_paid_10yr || 0) - Number(sB1.cumulative_interest_paid_10yr || 0);
                            const keepPmt = Number(sB1.monthly_req_pmt || pmtRed.curr_575_scheduled_pmt || 0);
                            const recPmt = Number(sB2.monthly_req_pmt || keepPmt);
                            return (
                              <div className="p-3 rounded-xl bg-slate-900/90 border border-slate-800 grid grid-cols-1 md:grid-cols-2 gap-3 text-[11px] text-slate-300">
                                <div>
                                  <div className="font-bold text-sky-300 mb-0.5">
                                    💡 1. Refinance vs. Recast at {capK}: Keep Your Existing Rate!
                                  </div>
                                  <p className="text-slate-400 leading-relaxed">
                                    Keep your existing <strong>{mortgageInputs?.rate_pct || 5.75}%</strong> note rather than refinancing at higher market rates. In <strong>Strategy B1</strong>, you keep paying {fmtCurrency(keepPmt)}/mo. In <strong>Strategy B2</strong>, a <strong>Loan Recast</strong> re-amortizes the remaining balance across the remaining {pmtRed.remaining_months || 172} months at your <em>existing rate</em> (no closing costs or new loan), lowering required P&amp;I to {fmtCurrency(recPmt)}/mo.
                                  </p>
                                </div>
                                <div>
                                  <div className="font-bold text-amber-300 mb-0.5">
                                    💡 2. Recasting (B2) Interest vs. Investment Spread ({extraGrossInt >= 0 ? "+" : ""}{fmtCompact(extraGrossInt)} 10-Yr Gross Int.)
                                  </div>
                                  <p className="text-slate-400 leading-relaxed">
                                    Lowering required P&amp;I to {fmtCurrency(recPmt)}/mo (<strong>B2</strong>) slows principal paydown ({fmtCompact(sB2.ending_mortgage || 0)} left at Yr 10 vs. {fmtCompact(sB1.ending_mortgage || 0)} in <strong>B1</strong>), costing <strong>{fmtCurrency(sB2.cumulative_interest_paid_10yr || 0)} gross interest</strong> vs. <strong>{fmtCurrency(sB1.cumulative_interest_paid_10yr || 0)} in B1</strong>. B2 {diffB2vB1 >= 0 ? "leads" : "trails"} B1 by {diffB2vB1 >= 0 ? "+" : ""}{fmtCompact(diffB2vB1)} if the freed monthly cash compounds in equities, while <strong>B1 (No Recast)</strong> {diffB1vA >= 0 ? "beats" : "trails"} Strategy A by <strong>{diffB1vA >= 0 ? "+" : ""}{fmtCurrency(diffB1vA)}</strong>.
                                  </p>
                                </div>
                              </div>
                            );
                          })()}
                        </div>
                      )}
                    </div>

                    {/* Top 4 Executive KPI Cards */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                      {/* KPI 1: Current Principal & Paydown Progress */}
                      <div className="card-panel rounded-2xl p-5 border-l-4 border-l-indigo-500">
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] font-bold uppercase text-slate-400">
                            Current Balance ({mortgageInputs?.current_ym || "Current"})
                          </span>
                          <span className="badge bg-indigo-500/20 text-indigo-300 font-mono">
                            Period {baseSum.current_period || "—"} of {(mortgageInputs?.term_years || 15) * 12}
                          </span>
                        </div>
                        <div className="text-2xl font-extrabold font-mono text-white mt-1.5">
                          {fmtCurrency(eq.current_balance)}
                        </div>
                        <div className="mt-2.5 pt-2.5 border-t border-slate-800/80 space-y-1 text-xs text-slate-400">
                          <div className="flex justify-between">
                            <span>Total Principal Paid:</span>
                            <strong className="text-emerald-400 font-mono">
                              -{fmtCurrency(eq.total_principal_paid_to_date)}
                            </strong>
                          </div>
                          <div className="flex justify-between text-[11px]">
                            <span>• Prior Loan ({fmtCompact(mortgageInputs?.prev_loan_amount || 0)} → {fmtCompact(mortgageInputs?.loan_amount || 0)}):</span>
                            <span className="font-mono text-slate-300">-{fmtCurrency(eq.paid_on_65_loan)}</span>
                          </div>
                          <div className="flex justify-between text-[11px]">
                            <span>• Active Loan ({fmtCompact(mortgageInputs?.loan_amount || 0)} → {fmtCompact(eq.current_balance)}):</span>
                            <span className="font-mono text-slate-300">-{fmtCurrency(eq.paid_on_575_loan)}</span>
                          </div>
                          <div className="flex justify-between pt-1">
                            <span>Market Equity ({fmtCompact(eq.estimated_home_value || 0)} Est.):</span>
                            <strong className="text-purple-300 font-mono">
                              {fmtCurrency(eq.market_home_equity || 0)} ({eq.market_equity_pct || 0}%)
                            </strong>
                          </div>
                        </div>
                      </div>

                      {/* KPI 2: The $750,000 IRS Tax Cap Alert */}
                      <div className="card-panel rounded-2xl p-5 border-l-4 border-l-amber-500">
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] font-bold uppercase text-amber-400">
                            IRS $750k Tax Cap Gap
                          </span>
                          <span className="badge bg-amber-500/20 text-amber-300 font-mono">
                            {currSnap.deductible_ratio_pct || 92.6}% Deductible
                          </span>
                        </div>
                        <div className="text-2xl font-extrabold font-mono text-amber-300 mt-1.5">
                          {fmtCurrency(eq.distance_to_750k_cap)} <span className="text-xs font-normal text-slate-400">over $750k</span>
                        </div>
                        <div className="mt-2.5 pt-2.5 border-t border-slate-800/80 space-y-1 text-xs text-slate-400">
                          <div className="flex justify-between">
                            <span>Nov 2026 Interest ({fmtCurrency(currSnap.interest)}):</span>
                            <span className="font-mono text-slate-200">
                              {fmtCurrency(currSnap.deductible_interest)} ded.
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span>Unbenefited Interest (&gt;$750k):</span>
                            <strong className="text-rose-400 font-mono">
                              {fmtCurrency(currSnap.non_deductible_interest)}/mo ($0 tax help)
                            </strong>
                          </div>
                          <div className="flex justify-between">
                            <span>Return on Next $60k Paydown:</span>
                            <strong className="text-emerald-400 font-mono">
                              5.75% After-Tax!
                            </strong>
                          </div>
                          <div className="flex justify-between">
                            <span>Crosses ≤ $750k Cap in:</span>
                            <strong className="text-amber-300 font-mono">
                              {activeSum.crossed_750k_ym || "2028-01"} (Period {activeSum.crossed_750k_period})
                            </strong>
                          </div>
                        </div>
                      </div>

                      {/* KPI 3: Lifetime Interest & Tax Savings */}
                      <div className="card-panel rounded-2xl p-5 border-l-4 border-l-emerald-500">
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] font-bold uppercase text-emerald-400">
                            Interest Saved vs. 30-Yr 6.5%
                          </span>
                          <span className="badge bg-emerald-500/20 text-emerald-300 font-mono">
                            Cell F5
                          </span>
                        </div>
                        <div className="text-2xl font-extrabold font-mono text-emerald-400 mt-1.5">
                          {fmtCurrency(activeSum.interest_saved_vs_orig)}
                        </div>
                        <div className="mt-2.5 pt-2.5 border-t border-slate-800/80 space-y-1 text-xs text-slate-400">
                          <div className="flex justify-between">
                            <span>Orig 30-Yr 6.5% Interest (F4):</span>
                            <span className="font-mono text-slate-300">{fmtCurrency(activeSum.orig_total_interest)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span>Active Plan Nominal Interest (F3):</span>
                            <strong className="text-white font-mono">{fmtCurrency(activeSum.total_interest)}</strong>
                          </div>
                          <div className="flex justify-between">
                            <span>IRS Tax Saved (Capped @ $750k):</span>
                            <strong className="text-emerald-400 font-mono">-{fmtCurrency(activeSum.total_true_tax_saved)}</strong>
                          </div>
                          <div className="flex justify-between">
                            <span>True Net After-Tax Interest:</span>
                            <strong className="text-indigo-300 font-mono">{fmtCurrency(activeSum.total_net_after_tax_interest)}</strong>
                          </div>
                        </div>
                      </div>

                      {/* KPI 4: Payoff Timeline & Monthly Cash Flow */}
                      <div className="card-panel rounded-2xl p-5 border-l-4 border-l-cyan-500">
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] font-bold uppercase text-cyan-400">
                            Projected Payoff Date
                          </span>
                          <span className="badge bg-cyan-500/20 text-cyan-300 font-mono">
                            -{activeSum.years_saved_vs_term} Yrs vs 15-Yr
                          </span>
                        </div>
                        <div className="text-2xl font-extrabold font-mono text-white mt-1.5">
                          {activeSum.payoff_date} <span className="text-xs font-normal text-slate-400">({activeSum.payoff_period} mos)</span>
                        </div>
                        <div className="mt-2.5 pt-2.5 border-t border-slate-800/80 space-y-1 text-xs text-slate-400">
                          <div className="flex justify-between">
                            <span>Remaining Time from Today:</span>
                            <strong className="text-cyan-300 font-mono">
                              {activeSum.remaining_months_from_now} mos ({activeSum.remaining_years_from_now} yrs)
                            </strong>
                          </div>
                          <div className="flex justify-between">
                            <span>Nov 2026 P&amp;I ($8,171.24):</span>
                            <span className="font-mono text-slate-200">
                              {fmtCurrency(currSnap.principal)} P / {fmtCurrency(currSnap.interest)} I
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span>Next 12M Interest (Col N):</span>
                            <span className="font-mono text-amber-300">{fmtCurrency(activeSum.current_forward_12m_interest)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span>Next 12M IRS Tax Refund:</span>
                            <strong className="text-emerald-400 font-mono">+{fmtCurrency(activeSum.current_forward_12m_tax_saved)}</strong>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Interactive What-If Paydown & Tax Controls */}
                    <div className="card-panel rounded-2xl p-5 border border-indigo-500/30 space-y-4">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <h2 className="text-base font-bold text-white flex items-center gap-2">
                            <span>🎛️ Interactive Paydown &amp; Tax Deduction Simulator</span>
                            {(mortgageInputs.future_monthly_excess > 0 ||
                              mortgageInputs.one_time_lump_sum > 0 ||
                              Object.keys(mortgageInputs.custom_future_overrides || {}).length > 0) && (
                              <span className="badge bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                                Custom What-If Active: Saving {fmtCurrency(baseSum.total_interest - activeSum.total_interest)} extra interest &amp; {baseSum.payoff_period - activeSum.payoff_period} extra months!
                              </span>
                            )}
                          </h2>
                          <p className="text-xs text-slate-400">
                            Test ongoing monthly extra payments, a one-time lump sum (e.g., $60,000 to hit the $750k IRS tax cap immediately), or stopping excess payments once your loan reaches $750,000.
                          </p>
                        </div>

                        {/* 1-Click Strategy Presets */}
                        <div className="flex flex-wrap gap-1.5 text-xs">
                          {[
                            {
                              label: "📊 Current Sheet ($0 Future Excess)",
                              apply: () => applyPreset({ future_monthly_excess: 0, one_time_lump_sum: 0, stop_excess_at_balance: 0 }),
                              isActive:
                                Number(mortgageInputs.future_monthly_excess || 0) === 0 &&
                                Number(mortgageInputs.one_time_lump_sum || 0) === 0,
                            },
                            {
                              label: "🎯 Pay -$60k to $750k IRS Cap Now & Coast",
                              apply: () =>
                                applyPreset({
                                  future_monthly_excess: 0,
                                  one_time_lump_sum: 60000,
                                  lump_sum_ym: "2026-11",
                                  stop_excess_at_balance: 750000,
                                }),
                              isActive:
                                Number(mortgageInputs.one_time_lump_sum || 0) === 60000 &&
                                Number(mortgageInputs.future_monthly_excess || 0) === 0,
                            },
                            {
                              label: "⚡ +$5,000/mo Until $750k Cap, Then Stop",
                              apply: () =>
                                applyPreset({
                                  future_monthly_excess: 5000,
                                  one_time_lump_sum: 0,
                                  stop_excess_at_balance: 750000,
                                }),
                              isActive:
                                Number(mortgageInputs.future_monthly_excess || 0) === 5000 &&
                                Number(mortgageInputs.stop_excess_at_balance || 0) === 750000,
                            },
                            {
                              label: "🚀 +$5,800/mo (Oct 2026 Pace)",
                              apply: () =>
                                applyPreset({
                                  future_monthly_excess: 5800,
                                  one_time_lump_sum: 0,
                                  stop_excess_at_balance: 0,
                                }),
                              isActive:
                                Number(mortgageInputs.future_monthly_excess || 0) === 5800 &&
                                Number(mortgageInputs.stop_excess_at_balance || 0) === 0,
                            },
                            {
                              label: "🔥 +$6,800/mo (Plan 5.75% Tab)",
                              apply: () =>
                                applyPreset({
                                  future_monthly_excess: 6800,
                                  one_time_lump_sum: 0,
                                  stop_excess_at_balance: 0,
                                }),
                              isActive:
                                Number(mortgageInputs.future_monthly_excess || 0) === 6800 &&
                                Number(mortgageInputs.stop_excess_at_balance || 0) === 0,
                            },
                            {
                              label: "💎 +$10,000/mo All-Out",
                              apply: () =>
                                applyPreset({
                                  future_monthly_excess: 10000,
                                  one_time_lump_sum: 0,
                                  stop_excess_at_balance: 0,
                                }),
                              isActive:
                                Number(mortgageInputs.future_monthly_excess || 0) === 10000 &&
                                Number(mortgageInputs.stop_excess_at_balance || 0) === 0,
                            },
                          ].map((p, idx) => (
                            <button
                              key={idx}
                              onClick={p.apply}
                              className={`px-2.5 py-1.5 rounded-xl font-semibold border transition ${
                                p.isActive
                                  ? "bg-indigo-600 border-indigo-400 text-white shadow"
                                  : "bg-slate-900 border-slate-800 text-slate-300 hover:border-indigo-500/50 hover:text-white"
                              }`}
                            >
                              {p.label}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Sliders & Parameter Inputs Grid */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-4 pt-2 border-t border-slate-800/80 text-xs">
                        {/* 1. Ongoing Monthly Excess */}
                        <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-800">
                          <div className="flex justify-between items-center mb-1">
                            <label className="text-slate-300 font-bold">Future Excess / Mo ($)</label>
                            <span className="font-mono font-bold text-emerald-400">
                              {fmtCurrency(mortgageInputs.future_monthly_excess || 0)}/mo
                            </span>
                          </div>
                          <input
                            type="number"
                            step="250"
                            min="0"
                            value={mortgageInputs.future_monthly_excess === undefined ? "" : mortgageInputs.future_monthly_excess}
                            onChange={(e) =>
                              handleMortgagePreview({
                                ...mortgageInputs,
                                future_monthly_excess: e.target.value === "" ? "" : parseFloat(e.target.value),
                              })
                            }
                            className="w-full px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-white font-mono font-bold mb-1.5"
                          />
                          <input
                            type="range"
                            min="0"
                            max="15000"
                            step="200"
                            value={Number(mortgageInputs.future_monthly_excess || 0)}
                            onChange={(e) =>
                              handleMortgagePreview({
                                ...mortgageInputs,
                                future_monthly_excess: parseFloat(e.target.value),
                              })
                            }
                            className="w-full accent-indigo-500 cursor-pointer"
                          />
                        </div>

                        {/* 2. One-Time Lump Sum */}
                        <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-800">
                          <div className="flex justify-between items-center mb-1">
                            <label className="text-slate-300 font-bold">One-Time Lump Sum ($)</label>
                            <button
                              onClick={() =>
                                handleMortgagePreview({
                                  ...mortgageInputs,
                                  one_time_lump_sum: 60000,
                                  lump_sum_ym: "2026-11",
                                })
                              }
                              className="text-[10px] text-amber-300 underline hover:text-amber-200 font-semibold"
                              title="Set $60,000 to drop $810k -> $750k immediately"
                            >
                              Set $60k (Hit $750k)
                            </button>
                          </div>
                          <input
                            type="number"
                            step="5000"
                            min="0"
                            value={mortgageInputs.one_time_lump_sum === undefined ? "" : mortgageInputs.one_time_lump_sum}
                            onChange={(e) =>
                              handleMortgagePreview({
                                ...mortgageInputs,
                                one_time_lump_sum: e.target.value === "" ? "" : parseFloat(e.target.value),
                              })
                            }
                            className="w-full px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-white font-mono font-bold mb-1.5"
                          />
                          <input
                            type="range"
                            min="0"
                            max="310000"
                            step="5000"
                            value={Number(mortgageInputs.one_time_lump_sum || 0)}
                            onChange={(e) =>
                              handleMortgagePreview({
                                ...mortgageInputs,
                                one_time_lump_sum: parseFloat(e.target.value),
                              })
                            }
                            className="w-full accent-amber-500 cursor-pointer"
                          />
                        </div>

                        {/* 3. Stop Excess Payments at Target Balance */}
                        <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-800">
                          <div className="flex justify-between items-center mb-1">
                            <label className="text-slate-300 font-bold">Stop Excess At Balance</label>
                          </div>
                          <select
                            value={Number(mortgageInputs.stop_excess_at_balance || 0)}
                            onChange={(e) =>
                              handleMortgagePreview({
                                ...mortgageInputs,
                                stop_excess_at_balance: parseFloat(e.target.value),
                              })
                            }
                            className="w-full px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-white font-semibold mb-1.5"
                          >
                            <option value={0}>Keep Paying Until $0 Payoff</option>
                            <option value={750000}>Stop @ $750,000 (IRS Tax Cap)</option>
                            <option value={700000}>Stop @ $700,000 Balance</option>
                            <option value={600000}>Stop @ $600,000 Balance</option>
                            <option value={500000}>Stop @ $500,000 Balance</option>
                          </select>
                          <div className="text-[10px] text-slate-400">
                            Below $750k, 100% of interest is deductible (3.62% after-tax rate).
                          </div>
                        </div>

                        {/* 4. Marginal Federal Tax Bracket */}
                        <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-800">
                          <div className="flex justify-between items-center mb-1">
                            <label className="text-slate-300 font-bold">Marginal Tax Rate (%)</label>
                            <span className="font-mono text-indigo-400 font-bold">
                              {mortgageInputs.marginal_tax_rate_pct}%
                            </span>
                          </div>
                          <select
                            value={Number(mortgageInputs.marginal_tax_rate_pct || 37)}
                            onChange={(e) =>
                              handleMortgagePreview({
                                ...mortgageInputs,
                                marginal_tax_rate_pct: parseFloat(e.target.value),
                              })
                            }
                            className="w-full px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-white font-semibold mb-1.5"
                          >
                            <option value={37}>37.0% (Real Tracker Col P)</option>
                            <option value={35}>35.0% Federal Bracket</option>
                            <option value={32}>32.0% Federal Bracket</option>
                            <option value={24}>24.0% Federal Bracket</option>
                            <option value={40.8}>40.8% (37% + 3.8% NIIT)</option>
                          </select>
                          <div className="text-[10px] text-slate-400">
                            Below $750k: {(5.75 * (1 - Number(mortgageInputs.marginal_tax_rate_pct || 37) / 100)).toFixed(2)}% effective rate
                          </div>
                        </div>

                        {/* 5. IRS Debt Deduction Cap */}
                        <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-800">
                          <div className="flex justify-between items-center mb-1">
                            <label className="text-slate-300 font-bold">IRS Debt Cap ($)</label>
                          </div>
                          <select
                            value={Number(mortgageInputs.mortgage_debt_cap || 750000)}
                            onChange={(e) =>
                              handleMortgagePreview({
                                ...mortgageInputs,
                                mortgage_debt_cap: parseFloat(e.target.value),
                              })
                            }
                            className="w-full px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-white font-semibold mb-1.5"
                          >
                            <option value={750000}>$750,000 (TCJA / Current Law)</option>
                            <option value={1000000}>$1,000,000 (Pre-2018 Cap)</option>
                            <option value={9999999}>Uncapped (Match Naive Col P)</option>
                          </select>
                          <div className="text-[10px] text-slate-400">
                            Portion above cap gets 0% tax deduction.
                          </div>
                        </div>

                        {/* 6. Standard Deduction vs. Raw Marginal Tax Toggle */}
                        <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-800">
                          <div className="flex justify-between items-center mb-1">
                            <label className="text-slate-300 font-bold">Tax Deduction Mode</label>
                          </div>
                          <select
                            value={mortgageInputs.include_standard_deduction_floor ? String(mortgageInputs.standard_deduction_override || 16100) : "none"}
                            onChange={(e) => {
                              const val = e.target.value;
                              if (val === "none") {
                                handleMortgagePreview({
                                  ...mortgageInputs,
                                  include_standard_deduction_floor: false,
                                });
                              } else {
                                handleMortgagePreview({
                                  ...mortgageInputs,
                                  include_standard_deduction_floor: true,
                                  standard_deduction_override: parseFloat(val),
                                });
                              }
                            }}
                            className="w-full px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-white font-semibold mb-1.5"
                          >
                            <option value="none">Direct 37% on Deductible Int (Sheet Col P)</option>
                            <option value="16100">Single ($16.1k Std Floor + $10k SALT)</option>
                            <option value="21900">Home Goal Sheet ($21.9k Std Floor)</option>
                            <option value="32200">Married Joint ($32.2k Std Floor + $10k SALT)</option>
                          </select>
                          <div className="text-[10px] text-slate-400">
                            Compare raw marginal vs. above-Standard-Deduction benefit.
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* ==================== SECTION: HOW PAYING DOWN REDUCES MONTHLY PAYMENTS (RECAST vs. KEEP $8,171.24) ==================== */}
                    <div className="card-panel rounded-2xl p-5 border border-emerald-500/30 space-y-4">
                      <div className="flex flex-wrap items-start justify-between gap-4">
                        <div>
                          <div className="flex items-center gap-2">
                            <h2 className="text-base font-bold text-white">
                              📉 How Paying Down Principal Reduces Your Monthly Payments &amp; Interest Burden
                            </h2>
                            <span className="badge bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                              Recast / Re-Amortize vs. Fixed $8,171.24/mo
                            </span>
                          </div>
                          <p className="text-xs text-slate-400 mt-1">
                            Paying down principal helps your monthly budget in <strong>two ways</strong>: (1) You can request a <strong>Mortgage Recast</strong> (re-amortizing your lower balance over the remaining {pmtRed.remaining_months} months at 5.75% to permanently drop your required monthly payment), or (2) Keep paying <strong>$8,171.24/mo</strong> so less money burns on interest each month and more goes straight into your home equity.
                          </p>
                        </div>
                      </div>

                      {/* 3 Highlight Insight Cards on Payment Reduction */}
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
                        <div className="p-4 rounded-xl bg-slate-950/90 border border-indigo-500/40">
                          <div className="text-[10px] font-bold uppercase text-indigo-400">
                            1. What Prior Paydowns Already Unlocked Today ({fmtCompact(eq.current_balance)})
                          </div>
                          {(() => {
                            const curT = (pmtRed.tiers || [])[1] || (pmtRed.tiers || [])[0] || {};
                            const basePmt = Number(pmtRed.curr_575_scheduled_pmt || eq.scheduled_monthly_pmt || 0);
                            const recPmt = Number(curT.recast_pmt_remaining_term || basePmt);
                            const savMo = Number(curT.recast_monthly_savings_vs_8171 || 0);
                            return (
                              <>
                                <div className="text-lg font-extrabold text-white mt-1 font-mono">
                                  {fmtCurrency(basePmt)}/mo → <span className="text-emerald-400">{fmtCurrency(recPmt)}/mo</span>
                                </div>
                                <p className="text-slate-300 mt-1.5 leading-relaxed">
                                  With balance paid down from <strong>{fmtCompact(mortgageInputs?.loan_amount || 0)} to {fmtCompact(eq.current_balance)}</strong>, recasting over the remaining {pmtRed.remaining_months || 172} months cuts required P&amp;I by{" "}
                                  <strong className="text-emerald-400">-{fmtCurrency(savMo)}/mo (-{fmtCompact(savMo * 12)}/yr)</strong>.
                                </p>
                              </>
                            );
                          })()}
                        </div>

                        <div className="p-4 rounded-xl bg-slate-950/90 border border-amber-500/40">
                          {(() => {
                            const capT = (pmtRed.tiers || []).find((x) => x.id === "irs_cap_750k") || (pmtRed.tiers || [])[1] || {};
                            const basePmt = Number(pmtRed.curr_575_scheduled_pmt || 0);
                            const capRecPmt = Number(capT.recast_pmt_remaining_term || basePmt);
                            const capSav = Number(capT.recast_monthly_savings_vs_8171 || 0);
                            const gap = Number(capT.extra_needed_now || 0);
                            return (
                              <>
                                <div className="text-[10px] font-bold uppercase text-amber-400">
                                  2. At the {fmtCompact(mortgageInputs?.mortgage_debt_cap || 750000)} IRS Tax Cap ({gap > 0 ? `-${fmtCompact(gap)} More` : "Reached"})
                                </div>
                                <div className="text-lg font-extrabold text-white mt-1 font-mono">
                                  {fmtCurrency(basePmt)}/mo → <span className="text-amber-300">{fmtCurrency(capRecPmt)}/mo</span>
                                </div>
                                <p className="text-slate-300 mt-1.5 leading-relaxed">
                                  {gap > 0 ? (
                                    <>Paying down <strong>{fmtCurrency(gap)}</strong> to the IRS cap eliminates non-deductible interest and allows a recast to <strong className="text-amber-300">{fmtCurrency(capRecPmt)}/mo</strong> (-{fmtCurrency(capSav)}/mo).</>
                                  ) : (
                                    <>100% of current mortgage interest is already below the <strong>{fmtCompact(mortgageInputs?.mortgage_debt_cap || 750000)} IRS Pub 936 limit</strong>.</>
                                  )}
                                </p>
                              </>
                            );
                          })()}
                        </div>

                        <div className="p-4 rounded-xl bg-slate-950/90 border border-emerald-500/40">
                          {(() => {
                            const t0 = (pmtRed.tiers || [])[0] || {};
                            const t1 = (pmtRed.tiers || [])[1] || t0;
                            const t2 = (pmtRed.tiers || [])[2] || t1;
                            return (
                              <>
                                <div className="text-[10px] font-bold uppercase text-emerald-400">
                                  3. Monthly Interest Burn Trajectory
                                </div>
                                <div className="text-lg font-extrabold text-white mt-1 font-mono">
                                  {fmtCompact(t0.monthly_interest || 0)}/mo → <span className="text-emerald-400">{fmtCompact(t1.monthly_interest || 0)}/mo</span> → <span className="text-cyan-300">{fmtCompact(t2.monthly_interest || 0)}/mo</span>
                                </div>
                                <p className="text-slate-300 mt-1.5 leading-relaxed">
                                  Monthly interest dropped from <strong>{fmtCurrency(t0.monthly_interest || 0)}/mo</strong> at loan start to <strong>{fmtCurrency(t1.monthly_interest || 0)}/mo</strong> today, shifting more of each scheduled payment directly into home equity.
                                </p>
                              </>
                            );
                          })()}
                        </div>
                      </div>

                      {/* Milestone Table: Payment Reduction & Tax Comparison Across Balance Levels */}
                      <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse text-xs">
                          <thead>
                            <tr className="border-b border-slate-800 text-[10px] uppercase text-slate-400">
                              <th className="py-2.5 px-3">Balance Milestone</th>
                              <th className="py-2.5 px-3 text-right">Extra Cash Needed</th>
                              <th className="py-2.5 px-3 text-right">Recasted P&amp;I ({pmtRed.remaining_months || 172}m)</th>
                              <th className="py-2.5 px-3 text-right">Pmt Drop vs Current</th>
                              <th className="py-2.5 px-3 text-right">vs Prior Loan ({fmtCompact(pmtRed.prev_65_scheduled_pmt || 0)})</th>
                              <th className="py-2.5 px-3 text-right">Gross Interest / Mo</th>
                              <th className="py-2.5 px-3 text-right">Unbenefited (&gt;Cap)</th>
                              <th className="py-2.5 px-3 text-right">IRS Tax Saved / Mo</th>
                              <th className="py-2.5 px-3 text-right">After-Tax Rate</th>
                              <th className="py-2.5 px-3 text-right">All-In Recast (+Tax/HOA)</th>
                              <th className="py-2.5 px-3 text-right">Your Share (Net Partner)</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-800/60 font-mono">
                            {(pmtRed.tiers || []).map((t) => {
                              const isCurrent = t.id === "current_bal";
                              const isCap = t.id === "irs_cap_750k";
                              const isCustom = t.id === "custom_lump";
                              return (
                                <tr
                                  key={t.id}
                                  className={
                                    isCurrent
                                      ? "bg-indigo-950/50 border-l-2 border-l-indigo-400"
                                      : isCap
                                      ? "bg-amber-950/40 border-l-2 border-l-amber-400"
                                      : isCustom
                                      ? "bg-emerald-950/40 border-l-2 border-l-emerald-400"
                                      : "hover:bg-slate-800/30"
                                  }
                                >
                                  <td className="py-2.5 px-3 font-sans font-bold text-white whitespace-nowrap">
                                    {t.label}
                                    {isCurrent && (
                                      <span className="ml-1.5 badge bg-indigo-500/20 text-indigo-300">Today</span>
                                    )}
                                    {isCap && (
                                      <span className="ml-1.5 badge bg-amber-500/20 text-amber-300">IRS Sweet Spot</span>
                                    )}
                                  </td>
                                  <td className="py-2.5 px-3 text-right text-slate-300">
                                    {t.extra_needed_now > 0 ? fmtCurrency(t.extra_needed_now) : "—"}
                                  </td>
                                  <td className="py-2.5 px-3 text-right font-bold text-emerald-400">
                                    {fmtCurrency(t.recast_pmt_remaining_term)}/mo
                                  </td>
                                  <td className="py-2.5 px-3 text-right font-bold text-emerald-300">
                                    {t.recast_monthly_savings_vs_8171 > 0
                                      ? `-${fmtCurrency(t.recast_monthly_savings_vs_8171)}/mo`
                                      : "$0.00"}
                                  </td>
                                  <td
                                    className={`py-2.5 px-3 text-right font-semibold ${
                                      t.recast_diff_vs_old_6826 <= 0 ? "text-emerald-400" : "text-amber-300"
                                    }`}
                                  >
                                    {t.recast_diff_vs_old_6826 > 0
                                      ? `+${fmtCurrency(t.recast_diff_vs_old_6826)}`
                                      : fmtCurrency(t.recast_diff_vs_old_6826)}
                                  </td>
                                  <td className="py-2.5 px-3 text-right text-white">
                                    {fmtCurrency(t.monthly_interest)}
                                  </td>
                                  <td
                                    className={`py-2.5 px-3 text-right font-semibold ${
                                      t.non_deductible_interest > 0 ? "text-rose-400" : "text-emerald-400"
                                    }`}
                                  >
                                    {t.non_deductible_interest > 0
                                      ? `${fmtCurrency(t.non_deductible_interest)} ($0 tax)`
                                      : "$0.00 (100% ded.)"}
                                  </td>
                                  <td className="py-2.5 px-3 text-right font-bold text-indigo-300">
                                    +{fmtCurrency(t.monthly_mortgage_tax_saved)}/mo
                                  </td>
                                  <td className="py-2.5 px-3 text-right font-bold text-cyan-300">
                                    {t.true_after_tax_rate_pct.toFixed(2)}%
                                    <span className="block text-[10px] text-slate-400 font-normal">
                                      Top $1: {t.marginal_return_on_paydown_pct.toFixed(2)}%
                                    </span>
                                  </td>
                                  <td className="py-2.5 px-3 text-right text-slate-200">
                                    {fmtCurrency(t.all_in_monthly_recast_pmt)}/mo
                                  </td>
                                  <td className="py-2.5 px-3 text-right font-bold text-white">
                                    {fmtCurrency(t.owner_share_recast_pmt)}/mo
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                      <div className="text-[11px] text-slate-400 flex flex-wrap justify-between gap-2 pt-1">
                        <span>
                          * <strong>All-In Monthly Housing</strong> includes Recasted P&amp;I + Property Tax (<strong>{fmtCurrency(pmtRed.property_tax_monthly)}/mo</strong>) + HOA (<strong>{fmtCurrency(pmtRed.hoa_monthly)}/mo</strong>) + Insurance (<strong>{fmtCurrency(pmtRed.insurance_monthly)}/mo</strong>) = <strong>+{fmtCurrency(pmtRed.fixed_escrow_hoa_monthly)}/mo</strong> fixed escrow/HOA.
                        </span>
                        <span>
                          * <strong>Your Share</strong> subtracts partner contribution (<strong>{fmtCurrency(pmtRed.partner_contribution_monthly)}/mo</strong>). Keeping current P&amp;I equals <strong>{fmtCurrency((pmtRed.curr_575_scheduled_pmt || 0) + (pmtRed.fixed_escrow_hoa_monthly || 0))}/mo</strong> all-in (<strong>{fmtCurrency((pmtRed.curr_575_scheduled_pmt || 0) + (pmtRed.fixed_escrow_hoa_monthly || 0) - (pmtRed.partner_contribution_monthly || 0))}/mo</strong> net).
                        </span>
                      </div>
                    </div>

                    {/* ==================== CHARTS: BALANCE TRAJECTORY & ANNUAL TAX DEDUCTIONS ==================== */}
                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                      {/* Chart 1: Loan Balance Trajectory vs $750k Cap */}
                      <div className="lg:col-span-7 card-panel rounded-2xl p-5">
                        <div className="mb-3">
                          <h3 className="text-sm font-bold uppercase tracking-wider text-slate-300">
                            📉 Principal Balance Trajectory &amp; IRS $750,000 Tax Deduction Ceiling
                          </h3>
                          <p className="text-xs text-slate-400">
                            Compare your 6.5% 30-Yr tab, 5.75% 15-Yr baseline, $750k Cap stop strategy, and your active What-If plan against the amber $750k IRS threshold
                          </p>
                        </div>
                        <ChartCanvas
                          type="line"
                          height={290}
                          isDark={isDark}
                          data={balanceChartData}
                          options={{
                            scales: {
                              x: {
                                ticks: { color: isDark ? "#94a3b8" : "#64748b" },
                                grid: { color: isDark ? "rgba(51,65,85,0.25)" : "rgba(226,232,240,0.8)" },
                              },
                              y: {
                                ticks: {
                                  color: isDark ? "#94a3b8" : "#64748b",
                                  callback: (v) => fmtCompact(v),
                                },
                                grid: { color: isDark ? "rgba(51,65,85,0.25)" : "rgba(226,232,240,0.8)" },
                              },
                            },
                            plugins: {
                              legend: {
                                labels: { color: isDark ? "#cbd5e1" : "#334155", boxWidth: 12, font: { size: 11 } },
                              },
                            },
                          }}
                        />
                      </div>

                      {/* Chart 2: Annual Deductible vs Unbenefited Interest & Tax Refund */}
                      <div className="lg:col-span-5 card-panel rounded-2xl p-5">
                        <div className="mb-3">
                          <h3 className="text-sm font-bold uppercase tracking-wider text-slate-300">
                            🏛️ Annual Interest: Deductible (≤$750k) vs. Unbenefited (&gt;$750k) &amp; Tax Saved
                          </h3>
                          <p className="text-xs text-slate-400">
                            Red bars show interest above the $750k cap that gets $0 tax benefit; green bars show your annual IRS tax reduction
                          </p>
                        </div>
                        <ChartCanvas
                          type="bar"
                          height={290}
                          isDark={isDark}
                          data={annualTaxChartData}
                          options={{
                            scales: {
                              x: {
                                ticks: { color: isDark ? "#94a3b8" : "#64748b" },
                                grid: { color: isDark ? "rgba(51,65,85,0.25)" : "rgba(226,232,240,0.8)" },
                              },
                              y: {
                                ticks: {
                                  color: isDark ? "#94a3b8" : "#64748b",
                                  callback: (v) => fmtCompact(v),
                                },
                                grid: { color: isDark ? "rgba(51,65,85,0.25)" : "rgba(226,232,240,0.8)" },
                              },
                            },
                            plugins: {
                              legend: {
                                labels: { color: isDark ? "#cbd5e1" : "#334155", boxWidth: 12, font: { size: 11 } },
                              },
                            },
                          }}
                        />
                      </div>
                    </div>

                    {/* ==================== SCENARIO COMPARISON TABLE & SPREADSHEET EQUATIONS AUDIT ==================== */}
                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                      {/* Multi-Scenario Comparison Table */}
                      <div className="lg:col-span-7 card-panel rounded-2xl p-5 overflow-x-auto">
                        <h3 className="text-sm font-bold uppercase tracking-wider text-slate-300 mb-1">
                          ⚖️ Side-by-Side Comparison: 6.5% vs. 5.75% vs. Tax-Optimal Paydown Plans
                        </h3>
                        <p className="text-xs text-slate-400 mb-3">
                          Comparing nominal interest, IRS $750k-capped tax deductions, and true net after-tax interest cost across your tabs
                        </p>
                        <table className="w-full text-left border-collapse text-xs">
                          <thead>
                            <tr className="border-b border-slate-800 text-[10px] uppercase text-slate-400">
                              <th className="py-2 px-2.5">Scenario / Tab</th>
                              <th className="py-2 px-2.5 text-right">Base P&amp;I</th>
                              <th className="py-2 px-2.5 text-right">Hits ≤$750k</th>
                              <th className="py-2 px-2.5 text-right">Payoff Date</th>
                              <th className="py-2 px-2.5 text-right">Gross Interest (F3)</th>
                              <th className="py-2 px-2.5 text-right">Saved vs 30Y (F5)</th>
                              <th className="py-2 px-2.5 text-right">IRS Tax Saved</th>
                              <th className="py-2 px-2.5 text-right">Net After-Tax Int</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-800/60 font-mono">
                            {scenarios.map((s) => {
                              const isCustom = s.id === "active_custom";
                              const isCurr = s.id === "real_tracker_575";
                              const isOpt = s.id === "pay_to_750k_cap";
                              return (
                                <tr
                                  key={s.id}
                                  className={
                                    isCustom
                                      ? "bg-emerald-950/40 border-l-2 border-l-emerald-400"
                                      : isCurr
                                      ? "bg-indigo-950/40 border-l-2 border-l-indigo-400"
                                      : isOpt
                                      ? "bg-amber-950/30 border-l-2 border-l-amber-400"
                                      : "hover:bg-slate-800/30"
                                  }
                                >
                                  <td className="py-2.5 px-2.5 font-sans font-bold text-white">
                                    {s.name}
                                  </td>
                                  <td className="py-2.5 px-2.5 text-right text-slate-300">
                                    {fmtCurrency(s.monthly_pmt)}
                                  </td>
                                  <td className="py-2.5 px-2.5 text-right text-amber-300">
                                    {s.crossed_750k_ym || "—"}
                                  </td>
                                  <td className="py-2.5 px-2.5 text-right font-bold text-white">
                                    {s.payoff_date}
                                    <span className="block text-[10px] text-slate-400 font-normal">
                                      {s.total_months} mos ({(s.total_months / 12).toFixed(1)}y)
                                    </span>
                                  </td>
                                  <td className="py-2.5 px-2.5 text-right text-slate-200">
                                    {fmtCurrency(s.total_interest)}
                                  </td>
                                  <td className="py-2.5 px-2.5 text-right font-bold text-emerald-400">
                                    {s.interest_saved_vs_orig > 0 ? `+${fmtCurrency(s.interest_saved_vs_orig)}` : "—"}
                                  </td>
                                  <td className="py-2.5 px-2.5 text-right text-indigo-300 font-semibold">
                                    -{fmtCurrency(s.total_true_tax_saved)}
                                  </td>
                                  <td className="py-2.5 px-2.5 text-right font-bold text-cyan-300">
                                    {fmtCurrency(s.total_net_after_tax_interest)}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>

                      {/* Spreadsheet Equations & Formula Decoder */}
                      <div className="lg:col-span-5 card-panel rounded-2xl p-5 space-y-3">
                        <div>
                          <h3 className="text-sm font-bold uppercase tracking-wider text-slate-300">
                            🧮 Amortization Equations &amp; Tax Formula Audit
                          </h3>
                          <p className="text-xs text-slate-400">
                            How every formula in <em>Real Tracker</em> and <em>Real Tracker 6.5%</em> works — plus the $750k IRS cap correction for Column P &amp; Q
                          </p>
                        </div>

                        <div className="space-y-2.5 max-h-[380px] overflow-y-auto pr-1 text-xs">
                          {eqGuide.map((eqItem, i) => (
                            <div key={i} className="p-3 rounded-xl bg-slate-950/90 border border-slate-800 space-y-1.5">
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <span className="font-bold text-indigo-300">{eqItem.cell}</span>
                                <code className="text-[11px] px-2 py-0.5 rounded bg-slate-900 text-amber-300 border border-slate-800 font-mono">
                                  {eqItem.formula}
                                </code>
                              </div>
                              <div className="grid grid-cols-2 gap-2 text-[11px] pt-1">
                                <div className="px-2 py-1 rounded bg-indigo-950/40 border border-indigo-800/40 text-slate-200">
                                  <strong className="text-indigo-300">5.75% Tab:</strong> {eqItem.real_tracker_val}
                                </div>
                                <div className="px-2 py-1 rounded bg-rose-950/30 border border-rose-800/40 text-slate-200">
                                  <strong className="text-rose-300">6.5% Tab:</strong> {eqItem.real_tracker_65_val}
                                </div>
                              </div>
                              <p className="text-[11px] text-slate-400 leading-relaxed">{eqItem.explanation}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* ==================== INTERACTIVE SCHEDULE & EXCESS PAYMENT EDITOR ==================== */}
                    <div className="card-panel rounded-2xl p-5 space-y-4">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <h2 className="text-base font-bold text-white">
                            📅 Full Amortization &amp; Tax Deduction Schedule (Click Any Month's Excess Payment to Edit)
                          </h2>
                          <p className="text-xs text-slate-400">
                            Exact replica of your <strong>Real Tracker (5.75%)</strong> and <strong>Real Tracker 6.5%</strong> tables, upgraded with IRS $750k-capped deductible interest, tax savings, and inline <strong>Column G (Excess Pmt)</strong> editing.
                          </p>
                        </div>

                        <div className="flex flex-wrap items-center gap-2 text-xs">
                          {[
                            { id: "active_575", label: "🏠 Real Tracker 5.75% (Active Plan)" },
                            { id: "prev_65", label: "📜 Real Tracker 6.5% (Previous 30-Yr)" },
                            { id: "annual", label: "📊 Annual Tax & Principal Rollup" },
                          ].map((t) => (
                            <button
                              key={t.id}
                              onClick={() => setMortgageScheduleTab(t.id)}
                              className={`px-3 py-1.5 rounded-xl font-semibold border transition ${
                                mortgageScheduleTab === t.id
                                  ? "bg-indigo-600 border-indigo-400 text-white shadow"
                                  : "bg-slate-900 border-slate-800 text-slate-300 hover:text-white"
                              }`}
                            >
                              {t.label}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Schedule View 1: Active 5.75% Real Tracker */}
                      {mortgageScheduleTab === "active_575" && (
                        <>
                          <div className="overflow-x-auto max-h-[540px] overflow-y-auto border border-slate-800 rounded-xl">
                            <table className="w-full text-left border-collapse text-xs">
                              <thead className="sticky top-0 z-10 bg-slate-900 border-b border-slate-800 text-[10px] uppercase text-slate-400">
                                <tr>
                                  <th className="py-2.5 px-2.5">#</th>
                                  <th className="py-2.5 px-2.5">Date</th>
                                  <th className="py-2.5 px-2.5 text-right">Begin Bal (Col C)</th>
                                  <th className="py-2.5 px-2.5 text-right">Pmt (Col D)</th>
                                  <th className="py-2.5 px-2.5 text-right">Principal (Col E)</th>
                                  <th className="py-2.5 px-2.5 text-right">Interest (Col F)</th>
                                  <th className="py-2.5 px-2.5 text-right">Excess Pmt (Col G) ✎</th>
                                  <th className="py-2.5 px-2.5 text-right">End Bal (Col H)</th>
                                  <th className="py-2.5 px-2.5 text-right">Cum Int (Col K)</th>
                                  <th className="py-2.5 px-2.5 text-right">Fwd 12M Int (Col N)</th>
                                  <th className="py-2.5 px-2.5 text-right">Deductible Int (≤$750k)</th>
                                  <th className="py-2.5 px-2.5 text-right">Unbenefited (&gt;$750k)</th>
                                  <th className="py-2.5 px-2.5 text-right">IRS Tax Saved</th>
                                  <th className="py-2.5 px-2.5 text-right">True Rate (vs Col Q)</th>
                                  <th className="py-2.5 px-2.5">Sheet Note</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-800/60 font-mono">
                                {displayed575Rows.map((r) => {
                                  const noteObj = notes575[r.ym];
                                  const isEditingRow = editingExcessYm === r.ym;
                                  const isCrossMonth = r.ym === activeSum.crossed_750k_ym;
                                  return (
                                    <tr
                                      key={r.period}
                                      className={
                                        r.is_current_month
                                          ? "bg-indigo-950/60 border-l-4 border-l-indigo-400"
                                          : isCrossMonth
                                          ? "bg-amber-950/40 border-l-4 border-l-amber-400"
                                          : r.is_historical
                                          ? "bg-slate-900/40"
                                          : "hover:bg-slate-800/30"
                                      }
                                    >
                                      <td className="py-2 px-2.5 text-slate-400">{r.period}</td>
                                      <td className="py-2 px-2.5 whitespace-nowrap font-sans font-semibold text-white">
                                        {r.date}
                                        {r.is_current_month && (
                                          <span className="ml-1.5 badge bg-indigo-500/30 text-indigo-200">Now</span>
                                        )}
                                        {isCrossMonth && (
                                          <span className="ml-1.5 badge bg-amber-500/30 text-amber-200">≤$750k Cap!</span>
                                        )}
                                      </td>
                                      <td className="py-2 px-2.5 text-right text-slate-200">
                                        {fmtCurrency(r.begin_balance)}
                                      </td>
                                      <td className="py-2 px-2.5 text-right text-slate-300">
                                        {fmtCurrency(r.payment)}
                                      </td>
                                      <td className="py-2 px-2.5 text-right text-emerald-400">
                                        {fmtCurrency(r.principal)}
                                      </td>
                                      <td className="py-2 px-2.5 text-right text-amber-300">
                                        {fmtCurrency(r.interest)}
                                      </td>
                                      <td className="py-2 px-2.5 text-right">
                                        {isEditingRow ? (
                                          <div className="flex items-center justify-end gap-1">
                                            <input
                                              type="number"
                                              step="100"
                                              value={editingExcessVal}
                                              onChange={(e) => setEditingExcessVal(e.target.value)}
                                              className="w-24 px-1.5 py-0.5 rounded bg-slate-950 border border-indigo-400 text-white text-right text-xs"
                                              autoFocus
                                            />
                                            <button
                                              onClick={() => {
                                                const val = parseFloat(editingExcessVal || 0);
                                                if (r.is_historical) {
                                                  const nextHist = {
                                                    ...(mortgageInputs.historical_excess_575 || {}),
                                                    [r.ym]: val,
                                                  };
                                                  handleMortgagePreview({
                                                    ...mortgageInputs,
                                                    historical_excess_575: nextHist,
                                                  });
                                                } else {
                                                  const nextCustom = {
                                                    ...(mortgageInputs.custom_future_overrides || {}),
                                                    [r.ym]: val,
                                                  };
                                                  handleMortgagePreview({
                                                    ...mortgageInputs,
                                                    custom_future_overrides: nextCustom,
                                                  });
                                                }
                                                setEditingExcessYm(null);
                                              }}
                                              className="px-1.5 py-0.5 rounded bg-emerald-600 text-white text-[10px] font-sans font-bold"
                                            >
                                              ✓
                                            </button>
                                            <button
                                              onClick={() => setEditingExcessYm(null)}
                                              className="px-1 py-0.5 text-slate-400 hover:text-white text-[10px]"
                                            >
                                              ✕
                                            </button>
                                          </div>
                                        ) : (
                                          <button
                                            onClick={() => {
                                              setEditingExcessYm(r.ym);
                                              setEditingExcessVal(String(r.actual_excess_applied || 0));
                                            }}
                                            className={`px-2 py-0.5 rounded hover:bg-slate-800 transition ${
                                              r.actual_excess_applied > 0
                                                ? "text-emerald-300 font-bold bg-emerald-950/50 border border-emerald-700/40"
                                                : "text-slate-500"
                                            }`}
                                            title="Click to edit Excess Principal Payment for this month"
                                          >
                                            {r.actual_excess_applied > 0 ? `+${fmtCurrency(r.actual_excess_applied)}` : "$0.00"} ✎
                                          </button>
                                        )}
                                      </td>
                                      <td className="py-2 px-2.5 text-right font-bold text-white">
                                        {fmtCurrency(r.end_balance)}
                                      </td>
                                      <td className="py-2 px-2.5 text-right text-slate-400">
                                        {fmtCurrency(r.total_interest)}
                                      </td>
                                      <td className="py-2 px-2.5 text-right text-slate-300">
                                        {fmtCurrency(r.forward_12m_interest)}
                                      </td>
                                      <td className="py-2 px-2.5 text-right text-indigo-300">
                                        {fmtCurrency(r.deductible_interest)}
                                      </td>
                                      <td
                                        className={`py-2 px-2.5 text-right ${
                                          r.non_deductible_interest > 0 ? "text-rose-400 font-bold" : "text-slate-500"
                                        }`}
                                      >
                                        {r.non_deductible_interest > 0 ? fmtCurrency(r.non_deductible_interest) : "$0.00"}
                                      </td>
                                      <td className="py-2 px-2.5 text-right text-emerald-400 font-semibold">
                                        +{fmtCurrency(r.true_tax_saved)}
                                      </td>
                                      <td className="py-2 px-2.5 text-right text-cyan-300">
                                        {r.true_after_tax_rate_pct.toFixed(2)}%
                                        {r.above_750k_cap && (
                                          <span className="block text-[9px] text-amber-300">
                                            (Sheet Q: {r.naive_after_tax_rate_pct.toFixed(2)}%)
                                          </span>
                                        )}
                                      </td>
                                      <td className="py-2 px-2.5 font-sans text-[11px] text-slate-400 max-w-[200px] truncate" title={noteObj?.note || ""}>
                                        {noteObj?.note || (r.above_750k_cap ? `$${((r.unbenefited_balance || 0) / 1000).toFixed(1)}k over $750k cap` : "100% tax-deductible")}
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                          <div className="flex items-center justify-between text-xs pt-1">
                            <span className="text-slate-400">
                              Showing {displayed575Rows.length} of {activeRows.length} periods (Payoff at Period {activeSum.payoff_period}: {activeSum.payoff_date})
                            </span>
                            {activeRows.length > 36 && (
                              <button
                                onClick={() => setMortgageScheduleShowAll(!mortgageScheduleShowAll)}
                                className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-indigo-300 font-semibold border border-slate-700"
                              >
                                {mortgageScheduleShowAll ? "Show First 36 Months" : `Show All ${activeRows.length} Months`}
                              </button>
                            )}
                          </div>
                        </>
                      )}

                      {/* Schedule View 2: Previous 6.5% Real Tracker */}
                      {mortgageScheduleTab === "prev_65" && (
                        <>
                          <div className="p-3 rounded-xl bg-rose-950/30 border border-rose-800/40 text-xs text-slate-200 flex flex-wrap items-center justify-between gap-2">
                            <span>
                              <strong>Prior Loan Baseline ({mortgageInputs?.prev_term_years || 30}-Year {fmtCompact(mortgageInputs?.prev_loan_amount || 0)} @ {mortgageInputs?.prev_rate_pct || 6.5}%):</strong> Excess principal payments{" "}
                              <strong className="text-emerald-400">{fmtCurrency(prev65Sum.total_excess_principal)}</strong> (+{" "}
                              {fmtCurrency(Math.max(0, (eq.paid_on_65_loan || 0) - prev65Sum.total_excess_principal))} scheduled principal = <strong>{fmtCurrency(eq.paid_on_65_loan || 0)} total paydown</strong>) reduced balance to{" "}
                              <strong>{fmtCurrency(mortgageInputs?.loan_amount || 0)}</strong> prior to refinancing.
                            </span>
                            <span className="font-mono text-rose-300 font-bold">
                              Prior P&amp;I: {fmtCurrency(prev65Sum.scheduled_monthly_pmt)}/mo • Total Interest if Kept: {fmtCurrency(prev65Sum.total_interest)}
                            </span>
                          </div>
                          <div className="overflow-x-auto max-h-[500px] overflow-y-auto border border-slate-800 rounded-xl">
                            <table className="w-full text-left border-collapse text-xs">
                              <thead className="sticky top-0 z-10 bg-slate-900 border-b border-slate-800 text-[10px] uppercase text-slate-400">
                                <tr>
                                  <th className="py-2.5 px-2.5">#</th>
                                  <th className="py-2.5 px-2.5">Date</th>
                                  <th className="py-2.5 px-2.5 text-right">Begin Bal</th>
                                  <th className="py-2.5 px-2.5 text-right">Pmt ({fmtCurrency(prev65Sum.scheduled_monthly_pmt)})</th>
                                  <th className="py-2.5 px-2.5 text-right">Principal</th>
                                  <th className="py-2.5 px-2.5 text-right">Interest</th>
                                  <th className="py-2.5 px-2.5 text-right">Excess Pmt (Col G)</th>
                                  <th className="py-2.5 px-2.5 text-right">End Bal</th>
                                  <th className="py-2.5 px-2.5 text-right">Deductible Int (≤$750k)</th>
                                  <th className="py-2.5 px-2.5 text-right">Unbenefited (&gt;$750k)</th>
                                  <th className="py-2.5 px-2.5 text-right">IRS Tax Saved</th>
                                  <th className="py-2.5 px-2.5">Sheet Note</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-800/60 font-mono">
                                {displayed65Rows.map((r) => {
                                  const noteObj = notes65[r.ym];
                                  return (
                                    <tr key={r.period} className={r.period <= 8 ? "bg-indigo-950/30" : "hover:bg-slate-800/30"}>
                                      <td className="py-2 px-2.5 text-slate-400">{r.period}</td>
                                      <td className="py-2 px-2.5 font-sans font-semibold text-white">
                                        {r.date}
                                        {r.period === 8 && (
                                          <span className="ml-1.5 badge bg-emerald-500/20 text-emerald-300">Refi @ $984k</span>
                                        )}
                                      </td>
                                      <td className="py-2 px-2.5 text-right text-slate-200">{fmtCurrency(r.begin_balance)}</td>
                                      <td className="py-2 px-2.5 text-right text-slate-300">{fmtCurrency(r.payment)}</td>
                                      <td className="py-2 px-2.5 text-right text-emerald-400">{fmtCurrency(r.principal)}</td>
                                      <td className="py-2 px-2.5 text-right text-amber-300">{fmtCurrency(r.interest)}</td>
                                      <td className="py-2 px-2.5 text-right font-bold text-emerald-300">
                                        {r.actual_excess_applied > 0 ? `+${fmtCurrency(r.actual_excess_applied)}` : "$0.00"}
                                      </td>
                                      <td className="py-2 px-2.5 text-right font-bold text-white">{fmtCurrency(r.end_balance)}</td>
                                      <td className="py-2 px-2.5 text-right text-indigo-300">{fmtCurrency(r.deductible_interest)}</td>
                                      <td className="py-2 px-2.5 text-right text-rose-400">
                                        {r.non_deductible_interest > 0 ? fmtCurrency(r.non_deductible_interest) : "$0.00"}
                                      </td>
                                      <td className="py-2 px-2.5 text-right text-emerald-400">+{fmtCurrency(r.true_tax_saved)}</td>
                                      <td className="py-2 px-2.5 font-sans text-[11px] text-slate-400">{noteObj?.note || ""}</td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                          <div className="flex items-center justify-between text-xs pt-1">
                            <span className="text-slate-400">
                              Showing {displayed65Rows.length} of {prev65Rows.length} periods
                            </span>
                            {prev65Rows.length > 36 && (
                              <button
                                onClick={() => setMortgageScheduleShowAll(!mortgageScheduleShowAll)}
                                className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-indigo-300 font-semibold border border-slate-700"
                              >
                                {mortgageScheduleShowAll ? "Show First 36 Months" : `Show All ${prev65Rows.length} Months`}
                              </button>
                            )}
                          </div>
                        </>
                      )}

                      {/* Schedule View 3: Annual Tax & Principal Rollup */}
                      {mortgageScheduleTab === "annual" && (
                        <div className="overflow-x-auto border border-slate-800 rounded-xl">
                          <table className="w-full text-left border-collapse text-xs">
                            <thead className="bg-slate-900 border-b border-slate-800 text-[10px] uppercase text-slate-400">
                              <tr>
                                <th className="py-2.5 px-3">Year</th>
                                <th className="py-2.5 px-3 text-right">Mos</th>
                                <th className="py-2.5 px-3 text-right">Start Balance</th>
                                <th className="py-2.5 px-3 text-right">Scheduled Princ</th>
                                <th className="py-2.5 px-3 text-right">Excess Princ</th>
                                <th className="py-2.5 px-3 text-right">End Balance</th>
                                <th className="py-2.5 px-3 text-right">Gross Interest</th>
                                <th className="py-2.5 px-3 text-right">Deductible (≤$750k)</th>
                                <th className="py-2.5 px-3 text-right">Unbenefited (&gt;$750k)</th>
                                <th className="py-2.5 px-3 text-right">IRS Tax Saved</th>
                                <th className="py-2.5 px-3 text-right">Net After-Tax Interest</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-800/60 font-mono">
                              {annualRows.map((yr) => (
                                <tr key={yr.year} className="hover:bg-slate-800/30">
                                  <td className="py-2.5 px-3 font-sans font-bold text-white">{yr.year}</td>
                                  <td className="py-2.5 px-3 text-right text-slate-400">{yr.months_count}</td>
                                  <td className="py-2.5 px-3 text-right text-slate-200">{fmtCurrency(yr.start_balance)}</td>
                                  <td className="py-2.5 px-3 text-right text-emerald-400">{fmtCurrency(yr.scheduled_principal)}</td>
                                  <td className="py-2.5 px-3 text-right font-bold text-emerald-300">
                                    {yr.excess_principal > 0 ? `+${fmtCurrency(yr.excess_principal)}` : "$0.00"}
                                  </td>
                                  <td className="py-2.5 px-3 text-right font-bold text-white">{fmtCurrency(yr.end_balance)}</td>
                                  <td className="py-2.5 px-3 text-right text-amber-300">{fmtCurrency(yr.interest_paid)}</td>
                                  <td className="py-2.5 px-3 text-right text-indigo-300">{fmtCurrency(yr.deductible_interest)}</td>
                                  <td
                                    className={`py-2.5 px-3 text-right ${
                                      yr.non_deductible_interest > 0 ? "text-rose-400 font-bold" : "text-slate-500"
                                    }`}
                                  >
                                    {yr.non_deductible_interest > 0 ? fmtCurrency(yr.non_deductible_interest) : "$0.00"}
                                  </td>
                                  <td className="py-2.5 px-3 text-right font-bold text-emerald-400">
                                    +{fmtCurrency(yr.true_tax_saved)}
                                  </td>
                                  <td className="py-2.5 px-3 text-right font-bold text-cyan-300">
                                    {fmtCurrency(yr.net_interest_after_tax)}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  </>
                );
              })()
            )}
          </div>
        )}

        {/* ==================== SISTER DASHBOARD: FUEL, BLOOD LABS & KITCHEN ROI ==================== */}
        {activeTab === "kitchen" && window.NutritionKitchenDashboard && (
          <window.NutritionKitchenDashboard
            activeSubTab={kitchenSubTab}
            setActiveSubTab={setKitchenSubTab}
            isDark={isDark}
            ChartCanvas={ChartCanvas}
            fmtCurrency={fmtCurrency}
            fmtCompact={fmtCompact}
            showToast={showToast}
            onSwitchToFinance={() => {
              setActiveTab("overview");
              try { window.history.replaceState(null, "", "/"); } catch (e) {}
            }}
          />
        )}
      </main>

      {/* ==================== UNIVERSAL RIGHT-HAND CONTEXT INSPECTOR DRAWER ==================== */}
      {inspector && (
        <aside className="fixed top-[55px] right-0 bottom-0 z-30 w-full sm:w-[460px] xl:w-[505px] inspector-drawer overflow-y-auto p-5 space-y-5 transition-all">
          {/* Sticky Inspector Header & Quick Mode Switcher */}
          <div className="space-y-3 pb-3 border-b border-slate-800">
            <div className="flex items-center justify-between gap-2">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-400">
                  Right-Hand Context Inspector • Click Item Again or ✕ to Unselect
                </span>
                <h2 className="text-base font-extrabold text-white">
                  {inspector.type === "networth" && "Balance Sheet, Mortgage & Net Worth Trajectory"}
                  {inspector.type === "cashflow" &&
                    `${monthDetail?.label || inspector.month || selectedMonth} Income, Cash Flow & Spending Math`}
                  {inspector.type === "category" && `${inspector.category} — 12-Month Category Deep-Dive`}
                  {inspector.type === "cards" && "Credit Cards, Utilization & Liquidity Runway"}
                </h2>
              </div>
              <button
                onClick={() => setInspector(null)}
                className="px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold shrink-0"
                title="Unselect / Close Inspector (Esc)"
              >
                ✕ Unselect
              </button>
            </div>

            {/* Quick Mode Switcher inside Inspector */}
            <div className="grid grid-cols-4 gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800 text-[11px] font-semibold">
              {[
                { id: "networth", label: "🏦 Net Worth" },
                { id: "cashflow", label: "🧮 Cash Flow" },
                { id: "category", label: "📂 Category" },
                { id: "cards", label: "💳 Cards" },
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => {
                    if (tab.id === "category") {
                      const targetCat = inspector.category || monthCategoryFilter || "Housing";
                      if (!drillData || drillData.category !== targetCat) {
                        fetchCategoryDetail(targetCat);
                      } else {
                        setInspector({
                          ...inspector,
                          key: `switch-${tab.id}-${targetCat}`,
                          type: tab.id,
                          category: targetCat,
                          month: inspector.month || selectedMonth,
                        });
                      }
                    } else {
                      setInspector({
                        ...inspector,
                        key: `switch-${tab.id}`,
                        type: tab.id,
                        month: inspector.month || selectedMonth,
                      });
                    }
                  }}
                  className={`py-1.5 px-2 rounded-lg transition text-center ${
                    inspector.type === tab.id
                      ? "bg-indigo-600 text-white shadow"
                      : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {/* ==================== MODE 1: NET WORTH & SUB-CURVE ATTRIBUTION INSPECTOR ==================== */}
          {inspector.type === "networth" && (() => {
            const activeDriver = inspector.driver || "all";
            const inspectedMonthObj =
              nwMonthly.find((m) => m.month === inspector.month) || nwLatest;
            const inspectedIdx = nwMonthly.findIndex((m) => m.month === inspectedMonthObj?.month);
            const isBaselineMonth = inspectedIdx <= 0;

            return (
              <div className="space-y-4 text-xs">
                {/* Interactive Sub-Curve Driver Selector Bar inside Inspector */}
                <div className="p-3 rounded-2xl bg-slate-950 border border-indigo-500/40 space-y-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-400">
                      🔍 Sub-Curve Breakdown Inspector
                    </span>
                    <button
                      onClick={() =>
                        setHomeValuationMode(isCompsHomeMode ? "secular_inflation" : "comps_cooling")
                      }
                      className="text-[10px] font-mono font-bold text-amber-300 hover:underline"
                    >
                      {isCompsHomeMode ? "View A: Comps ($1.475M)" : "View B: Secular ($1.625M)"} ⇄
                    </button>
                  </div>
                  <div className="grid grid-cols-5 gap-1 bg-slate-900 p-1 rounded-xl border border-slate-800 text-[10px] font-bold">
                    {[
                      { id: "all", label: "All Curves" },
                      { id: "income", label: "💵 Income" },
                      { id: "market", label: "📈 Market" },
                      { id: "redemption", label: "🔄 Redemp." },
                      { id: "home", label: "🏡 Home" },
                    ].map((dTab) => (
                      <button
                        key={dTab.id}
                        onClick={() => {
                          setInspector({ ...inspector, driver: dTab.id });
                        }}
                        className={`py-1.5 px-1 rounded-lg transition text-center ${
                          activeDriver === dTab.id
                            ? "bg-indigo-600 text-white shadow"
                            : "text-slate-400 hover:text-white"
                        }`}
                      >
                        {dTab.label}
                      </button>
                    ))}
                  </div>

                  {/* Month Selector Strip inside Net Worth Inspector */}
                  <div className="flex items-center gap-1 overflow-x-auto pb-1 pt-0.5">
                    {nwMonthly.map((m) => {
                      const isSelM = inspectedMonthObj?.month === m.month;
                      return (
                        <button
                          key={m.month}
                          onClick={() => setInspector({ ...inspector, month: m.month })}
                          className={`px-2 py-1 rounded-lg font-mono text-[10px] font-bold border shrink-0 transition ${
                            isSelM
                              ? "bg-emerald-600/30 text-emerald-300 border-emerald-500"
                              : "bg-slate-900 border-slate-800 text-slate-400 hover:text-white"
                          }`}
                        >
                          {m.label || m.month}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Selected Driver Deep-Dive Breakdown Card */}
                <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-400">
                        {isBaselineMonth
                          ? `12-Month Cumulative Sub-Curve Attribution (${nwFirst.label} → ${nwLatest.label})`
                          : `${inspectedMonthObj.label} Month-over-Month + Cumulative Attribution`}
                      </span>
                      <h3 className="text-sm font-extrabold text-white mt-0.5">
                        {activeDriver === "income" && "💵 Sub-Curve 1: Income, Vested RSUs & 401(k) Saved"}
                        {activeDriver === "market" && "📈 Sub-Curve 2: Market Growth & Portfolio Improvement"}
                        {activeDriver === "redemption" && "🔄 Sub-Curve 3: Portfolio Redemptions → Mortgage Paydown"}
                        {activeDriver === "home" && "🏡 Sub-Curve 4: Home Price & Equity Valuation"}
                        {activeDriver === "all" && `🧮 Complete 5-Sub-Curve Wealth Waterfall (${inspectedMonthObj.label})`}
                      </h3>
                    </div>
                    <span className="badge bg-indigo-500/20 text-indigo-300 border border-indigo-500/40 font-mono">
                      {fmtCurrency(
                        isCompsHomeMode
                          ? inspectedMonthObj.net_worth_comps || inspectedMonthObj.net_worth
                          : inspectedMonthObj.net_worth_secular || inspectedMonthObj.net_worth
                      )}
                    </span>
                  </div>

                  {/* Waterfall Rows for All or Specific Driver */}
                  <div className="space-y-2 text-[11px]">
                    {/* 1. Income, Vested RSUs & 401(k) Net Saved */}
                    {(activeDriver === "all" || activeDriver === "income") && (
                      <div
                        onClick={() => {
                                                    setInspector({ ...inspector, driver: "income" });
                        }}
                        className={`p-3 rounded-xl border cursor-pointer transition ${
                          activeDriver === "income"
                            ? "bg-sky-950/40 border-sky-500/60"
                            : "bg-slate-900/90 border-slate-800 hover:border-sky-500/40"
                        }`}
                      >
                        <div className="flex items-center justify-between font-bold">
                          <span className="text-sky-400">1. 💵 Income, Vested RSUs &amp; 401(k) Net Saved</span>
                          <span className="font-mono text-sky-300">
                            {!isBaselineMonth && (
                              <span className="mr-2 text-white">
                                {inspectedMonthObj.income_saved_mom >= 0 ? "+" : ""}
                                {fmtCurrency(inspectedMonthObj.income_saved_mom)} MoM
                              </span>
                            )}
                            <span className="text-[10px] text-sky-400">
                              (12M: +{fmtCompact(totalIncSaved)})
                            </span>
                          </span>
                        </div>
                        <div className="mt-2 space-y-1 pl-3 border-l-2 border-sky-500/40 text-[10.5px] text-slate-300">
                          <div className="flex justify-between">
                            <span>Vested {rsuSym} RSUs (Net After Tax):</span>
                            <span className="font-mono text-emerald-400">
                              +{fmtCurrency(inspectedMonthObj.vested_rsu_net_mom || 0)} (12M: +{fmtCompact(totalRsuNet)})
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span>401(k) Employee + {employerShort} Match:</span>
                            <span className="font-mono text-emerald-400">
                              +{fmtCurrency(inspectedMonthObj.retirement_401k_contrib_mom || 0)} (12M: +{fmtCompact(total401k)})
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span>{payrollLabel} Direct Deposits:</span>
                            <span className="font-mono text-emerald-300">
                              +{fmtCurrency(inspectedMonthObj.payroll_income_mom || 0)}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span>{partnerIncomeLabel}:</span>
                            <span className="font-mono text-cyan-300">
                              +{fmtCurrency(inspectedMonthObj.partner_income_mom || 0)}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span>− Living &amp; Baseline Housing Spend (Ex-Principal):</span>
                            <span className="font-mono text-rose-400">
                              -{fmtCurrency(inspectedMonthObj.living_spend_mom || 0)}
                            </span>
                          </div>
                          <div className="flex justify-between pt-1 border-t border-slate-800 font-bold text-teal-300">
                            <span>= Net Liquid Income Retained (After Principal Redemptions):</span>
                            <span className="font-mono">
                              {inspectedMonthObj.income_retained_liquid_mom >= 0 ? "+" : ""}
                              {fmtCurrency(inspectedMonthObj.income_retained_liquid_mom || 0)} (12M: +{fmtCompact(nwSubcurveSummary.total_income_retained_liquid || 0)})
                            </span>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* 2. Market Growth & Improvement */}
                    {(activeDriver === "all" || activeDriver === "market") && (
                      <div
                        onClick={() => {
                          setInspector({ ...inspector, driver: "market" });
                        }}
                        className={`p-3 rounded-xl border cursor-pointer transition ${
                          activeDriver === "market"
                            ? "bg-purple-950/40 border-purple-500/60"
                            : "bg-slate-900/90 border-slate-800 hover:border-purple-500/40"
                        }`}
                      >
                        <div className="flex items-center justify-between font-bold">
                          <span className="text-purple-400">2. 📈 Market Growth &amp; Portfolio Improvement</span>
                          <span className="font-mono text-purple-300">
                            {!isBaselineMonth && (
                              <span className="mr-2 text-white">
                                {inspectedMonthObj.market_growth_mom >= 0 ? "+" : ""}
                                {fmtCurrency(inspectedMonthObj.market_growth_mom)} MoM
                              </span>
                            )}
                            <span className="text-[10px] text-purple-400">
                              (12M: +{fmtCompact(totalMktGrowth)})
                            </span>
                          </span>
                        </div>
                        <div className="mt-2 space-y-1 pl-3 border-l-2 border-purple-500/40 text-[10.5px] text-slate-300">
                          <div className="flex justify-between">
                            <span>{rsuCompanyLabel} Appreciation (~{Math.round((gw.equity_awards_pct || 0.2) * 100)}%):</span>
                            <span className="font-mono text-indigo-300">
                              {(inspectedMonthObj.equity_awards_gain_mom || 0) >= 0 ? "+" : ""}
                              {fmtCurrency(inspectedMonthObj.equity_awards_gain_mom || 0)} (12M: +{fmtCompact(totalMktGrowth * (gw.equity_awards_pct || 0.2))})
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span>401(k) &amp; Roth Index Fund Gains (~{Math.round((gw.retirement_401k_pct || 0.4) * 100)}%):</span>
                            <span className="font-mono text-emerald-300">
                              {(inspectedMonthObj.retirement_401k_gain_mom || 0) >= 0 ? "+" : ""}
                              {fmtCurrency(inspectedMonthObj.retirement_401k_gain_mom || 0)} (12M: +{fmtCompact(totalMktGrowth * (gw.retirement_401k_pct || 0.4))})
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span>Taxable Brokerage &amp; HSA Gains (~{Math.round((gw.brokerage_hsa_pct || 0.4) * 100)}%):</span>
                            <span className="font-mono text-cyan-300">
                              {(inspectedMonthObj.brokerage_hsa_gain_mom || 0) >= 0 ? "+" : ""}
                              {fmtCurrency(inspectedMonthObj.brokerage_hsa_gain_mom || 0)} (12M: +{fmtCompact(totalMktGrowth * (gw.brokerage_hsa_pct || 0.4))})
                            </span>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* 3. Portfolio Redemptions & Mortgage Debt Paydown */}
                    {(activeDriver === "all" || activeDriver === "redemption") && (
                      <div
                        onClick={() => {
                          setInspector({ ...inspector, driver: "redemption" });
                        }}
                        className={`p-3 rounded-xl border cursor-pointer transition ${
                          activeDriver === "redemption"
                            ? "bg-teal-950/40 border-teal-500/60"
                            : "bg-slate-900/90 border-slate-800 hover:border-teal-500/40"
                        }`}
                      >
                        <div className="flex items-center justify-between font-bold">
                          <span className="text-teal-400">3. 🔄 Portfolio Redemptions → Mortgage Paydown</span>
                          <span className="font-mono text-teal-300">
                            {!isBaselineMonth && (
                              <span className="mr-2 text-white">
                                ±{fmtCurrency(Math.abs(inspectedMonthObj.debt_paydown_mom || 0))} MoM
                              </span>
                            )}
                            <span className="text-[10px] text-teal-400">
                              (12M: ±{fmtCompact(nwSubcurveSummary.total_debt_paydown || 0)})
                            </span>
                          </span>
                        </div>
                        <div className="mt-2 space-y-1 pl-3 border-l-2 border-teal-500/40 text-[10.5px] text-slate-300">
                          <div className="flex justify-between">
                            <span>🟠 Liquid Brokerage &amp; Cash Redeemed (Outflow):</span>
                            <span className="font-mono text-amber-400">
                              {fmtCurrency(inspectedMonthObj.portfolio_redemption_mom || 0)} (12M: -{fmtCompact(Math.abs(nwSubcurveSummary.total_portfolio_redemptions || 0))})
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span>🩵 Mortgage &amp; Debt Redeemed (+Home Equity):</span>
                            <span className="font-mono text-teal-300">
                              +{fmtCurrency(inspectedMonthObj.debt_paydown_mom || 0)} (12M: +{fmtCompact(nwSubcurveSummary.total_debt_paydown || 0)})
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span>• {extraFrom} Extra Principal Prepayments:</span>
                            <span className="font-mono text-purple-300">
                              +{fmtCurrency(inspectedMonthObj.extra_principal_mom || 0)} ({fmtCompact(net_worth.mortgage_summary?.ytd_fidelity_extra_principal || 0)} YTD)
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span>• Scheduled Monthly P&amp;I Principal &amp; Card Paydown:</span>
                            <span className="font-mono text-slate-300">
                              +{fmtCurrency(inspectedMonthObj.scheduled_principal_mom || 0)}
                            </span>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* 4. Home Price Valuation & Equity */}
                    {(activeDriver === "all" || activeDriver === "home") && (
                      <div
                        onClick={() => {
                          setInspector({ ...inspector, driver: "home" });
                        }}
                        className={`p-3 rounded-xl border cursor-pointer transition ${
                          activeDriver === "home"
                            ? "bg-rose-950/30 border-rose-500/60"
                            : "bg-slate-900/90 border-slate-800 hover:border-rose-500/40"
                        }`}
                      >
                        <div className="flex items-center justify-between font-bold">
                          <span className={isCompsHomeMode ? "text-rose-400" : "text-indigo-400"}>
                            4. 🏡 Home Price Valuation ({homeShort})
                          </span>
                          <span className="font-mono text-white">
                            {!isBaselineMonth && (
                              <span className="mr-2">
                                {(isCompsHomeMode
                                  ? inspectedMonthObj.home_price_comps_mom
                                  : inspectedMonthObj.home_price_secular_mom) >= 0
                                  ? "+"
                                  : ""}
                                {fmtCurrency(
                                  isCompsHomeMode
                                    ? inspectedMonthObj.home_price_comps_mom
                                    : inspectedMonthObj.home_price_secular_mom
                                )}{" "}
                                MoM
                              </span>
                            )}
                            <span className="text-[10px] text-slate-400">
                              (12M: {(nwSubcurveSummary[isCompsHomeMode ? "total_home_price_comps" : "total_home_price_secular"] || 0) >= 0 ? "+" : ""}{fmtCompact(nwSubcurveSummary[isCompsHomeMode ? "total_home_price_comps" : "total_home_price_secular"] || 0)})
                            </span>
                          </span>
                        </div>
                        <div className="mt-2 space-y-1 pl-3 border-l-2 border-indigo-500/40 text-[10.5px] text-slate-300">
                          <div className="flex justify-between">
                            <span>View A — Local Market Comps:</span>
                            <span className="font-mono text-rose-400">
                              {fmtCurrency(inspectedMonthObj.home_value_comps || compsHomeCfg)}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span>View B — Long-Term Appreciation Trend:</span>
                            <span className="font-mono text-indigo-300">
                              {fmtCurrency(inspectedMonthObj.home_value_secular || secularHomeCfg)}
                            </span>
                          </div>
                          <div className="flex justify-between pt-1 border-t border-slate-800 font-bold text-emerald-400">
                            <span>= Net Home Equity ({isCompsHomeMode ? "Comps" : "Secular"} − Debt):</span>
                            <span className="font-mono">
                              {fmtCurrency(
                                isCompsHomeMode
                                  ? inspectedMonthObj.home_equity_comps
                                  : inspectedMonthObj.home_equity_secular
                              )}
                            </span>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Month-by-Month 5-Sub-Curve Attribution Ledger Table */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                      12-Month Sub-Curve Attribution Table (Click any month)
                    </h3>
                    <span className="text-[10px] font-mono text-slate-400">
                      {isCompsHomeMode ? "Comps ($1.475M)" : "Secular ($1.625M)"}
                    </span>
                  </div>
                  <div className="border border-slate-800 rounded-xl overflow-x-auto bg-slate-950">
                    <table className="w-full text-left border-collapse text-[10.5px]">
                      <thead className="bg-slate-900 text-slate-400 uppercase text-[9.5px]">
                        <tr>
                          <th className="py-2 px-2">Month</th>
                          <th className="py-2 px-2 text-right">Net Worth</th>
                          <th className="py-2 px-2 text-right">MoM Δ</th>
                          <th className="py-2 px-2 text-right text-sky-400">💵 Income</th>
                          <th className="py-2 px-2 text-right text-purple-400">📈 Market</th>
                          <th className="py-2 px-2 text-right text-teal-400">🔄 Debt Paid</th>
                          <th className="py-2 px-2 text-right text-amber-400">🏡 Home Δ</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/70 font-mono">
                        {[...nwMonthly].reverse().map((m) => {
                          const momV = Number(
                            isCompsHomeMode ? m.mom_diff_comps : m.mom_diff_secular || m.mom_diff || 0
                          );
                          const nwV = Number(
                            isCompsHomeMode ? m.net_worth_comps || m.net_worth : m.net_worth_secular || m.net_worth || 0
                          );
                          const homeMom = Number(
                            isCompsHomeMode ? m.home_price_comps_mom : m.home_price_secular_mom || 0
                          );
                          const isUp = momV >= 0;
                          const isRowSel = inspectedMonthObj?.month === m.month;
                          return (
                            <tr
                              key={m.month}
                              onClick={() => setInspector({ ...inspector, month: m.month })}
                              className={`cursor-pointer transition ${
                                isRowSel ? "bg-indigo-950/60" : "hover:bg-slate-900/80"
                              }`}
                            >
                              <td className="py-1.5 px-2 font-sans font-bold text-indigo-400 whitespace-nowrap">
                                {m.label || m.month}
                              </td>
                              <td className="py-1.5 px-2 text-right font-bold text-white">
                                {fmtCompact(nwV)}
                              </td>
                              <td
                                className={`py-1.5 px-2 text-right font-semibold ${
                                  isUp ? "text-emerald-400" : "text-rose-400"
                                }`}
                              >
                                {momV ? `${isUp ? "+" : ""}${fmtCompact(momV)}` : "—"}
                              </td>
                              <td className="py-1.5 px-2 text-right text-sky-300">
                                {m.income_saved_mom
                                  ? `${m.income_saved_mom >= 0 ? "+" : ""}${fmtCompact(m.income_saved_mom)}`
                                  : "—"}
                              </td>
                              <td
                                className={`py-1.5 px-2 text-right ${
                                  Number(m.market_growth_mom || 0) >= 0 ? "text-purple-300" : "text-rose-400"
                                }`}
                              >
                                {m.market_growth_mom
                                  ? `${m.market_growth_mom >= 0 ? "+" : ""}${fmtCompact(m.market_growth_mom)}`
                                  : "—"}
                              </td>
                              <td className="py-1.5 px-2 text-right text-teal-300">
                                {m.debt_paydown_mom ? `+${fmtCompact(m.debt_paydown_mom)}` : "—"}
                              </td>
                              <td
                                className={`py-1.5 px-2 text-right ${
                                  homeMom >= 0 ? "text-indigo-300" : "text-rose-400"
                                }`}
                              >
                                {homeMom ? `${homeMom >= 0 ? "+" : ""}${fmtCompact(homeMom)}` : "—"}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Summary Equation Banner */}
                <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold uppercase text-slate-400">
                      Realized Net Worth Equation (Walk-Away Today)
                    </span>
                    <span className="badge bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 font-mono">
                      Liquid NW: {fmtCompact(net_worth.liquid_net_worth)}
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 pt-1 text-center">
                    <div className="p-2 rounded-xl bg-slate-900 border border-slate-800">
                      <div className="text-[10px] text-slate-400">Realized Assets</div>
                      <div className="text-sm font-extrabold font-mono text-emerald-400 mt-0.5">
                        {fmtCompact(isCompsHomeMode ? net_worth.assets - 150000 : net_worth.assets)}
                      </div>
                    </div>
                    <div className="p-2 rounded-xl bg-slate-900 border border-slate-800">
                      <div className="text-[10px] text-slate-400">Total Debt</div>
                      <div className="text-sm font-extrabold font-mono text-rose-400 mt-0.5">
                        -{fmtCompact((net_worth.mortgage_debt || 0) + (net_worth.credit_card_debt || 0))}
                      </div>
                    </div>
                    <div className="p-2 rounded-xl bg-indigo-500/15 border border-indigo-500/40">
                      <div className="text-[10px] text-indigo-300 font-bold">= Realized NW</div>
                      <div className="text-sm font-extrabold font-mono text-white mt-0.5">
                        {fmtCompact(activeNwTotal)}
                      </div>
                    </div>
                  </div>

                  {/* Unvested Schwab RSU Income Pipeline Callout */}
                  {net_worth.unvested_rsu_gross > 0 && (
                    <div className="p-3 rounded-xl bg-indigo-950/30 border border-indigo-500/30 space-y-1 text-[11px]">
                      <div className="flex items-center justify-between font-bold text-indigo-300">
                        <span>⏳ Unvested {rsuSym} RSUs (Excluded from Realized NW)</span>
                        <span className="font-mono">+{fmtCurrency(net_worth.unvested_rsu_gross)} gross</span>
                      </div>
                      <p className="text-slate-400 leading-relaxed">
                        Only already-vested {rsuSym} equity shares are counted in Realized Net Worth above. Your <strong>{net_worth.unvested_rsu_shares} unvested {rsuSym} shares</strong> are modeled as future incoming compensation (<strong>+{fmtCurrency(net_worth.unvested_rsu_net_tax)} net</strong> after withholding, vesting at <strong>+{fmtCompact(net_worth.monthly_rsu_vest_net)}/mo net</strong>).
                      </p>
                    </div>
                  )}
                </div>

                {/* Mortgage & Extra Principal Paydown Card */}
                {net_worth.mortgage_summary && (
                  <div className="p-4 rounded-2xl bg-slate-950 border border-purple-500/40 space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="text-[10px] font-bold uppercase tracking-wider text-purple-400">
                          🏠 Mortgage &amp; Extra Principal Paydown
                        </span>
                        <h3 className="text-sm font-bold text-white">
                          Primary Mortgage — Drafted via {extraFrom}
                        </h3>
                      </div>
                      <span className="badge bg-purple-500/20 text-purple-300 border border-purple-500/40 font-mono">
                        {net_worth.mortgage_summary.paid_down_pct}% Paid Off
                      </span>
                    </div>

                    <div className="w-full h-2.5 bg-slate-800 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full"
                        style={{ width: `${Math.min(100, net_worth.mortgage_summary.paid_down_pct)}%` }}
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800">
                        <div className="text-[10px] text-slate-400">Original Loan / Current Bal</div>
                        <div className="font-mono font-bold text-white mt-0.5">
                          {fmtCompact(net_worth.mortgage_summary.original_loan)} → {fmtCompact(net_worth.mortgage_summary.current_balance)}
                        </div>
                      </div>
                      <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800">
                        <div className="text-[10px] text-purple-300">YTD Extra Principal</div>
                        <div className="font-mono font-bold text-purple-300 mt-0.5">
                          +{fmtCurrency(net_worth.mortgage_summary.ytd_fidelity_extra_principal)}
                        </div>
                      </div>
                    </div>

                    {/* List of Extra Principal Prepayments */}
                    <div>
                      <div className="text-[10px] font-bold uppercase text-slate-400 mb-1.5">
                        Extra Principal Prepayments ({(net_worth.mortgage_summary.extra_principal_txs || []).length})
                      </div>
                      <div className="max-h-40 overflow-y-auto divide-y divide-slate-800/70 border border-slate-800 rounded-xl bg-slate-900/60 px-2.5">
                        {(net_worth.mortgage_summary.extra_principal_txs || []).map((tx) => (
                          <div key={tx.id} className="py-1.5 flex items-center justify-between text-[11px]">
                            <div>
                              <span className="font-mono text-slate-400 mr-2">{tx.tx_date}</span>
                              <span className="font-semibold text-white">{extraMerch}</span>
                            </div>
                            <span className="font-mono font-bold text-purple-300">+{fmtCurrency(tx.amount)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {/* Asset Groups & Individual Accounts */}
                <div className="space-y-2.5">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                    Asset Breakdown by Account ({accounts.filter((a) => a.account_type !== "credit_card" && a.account_type !== "mortgage").length} Accounts)
                  </h3>
                  {(net_worth.asset_groups || []).map((g) => (
                    <div
                      key={g.id}
                      className={`p-3 rounded-xl border space-y-2 ${
                        inspector.group === g.id
                          ? "bg-indigo-950/40 border-indigo-500"
                          : "bg-slate-950 border-slate-800"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: g.color }} />
                          <span className="font-bold text-white">{g.label}</span>
                        </div>
                        <span className="font-mono font-bold text-emerald-400">
                          {fmtCurrency(g.total)} ({g.share_pct}%)
                        </span>
                      </div>
                      <div className="space-y-1 pl-4 border-l border-slate-800">
                        {g.accounts.map((acc) => (
                          <div
                            key={acc.id}
                            onClick={() =>
                              openMonthInspector(selectedMonth, {
                                key: `nw-acc-${acc.id}`,
                                accountId: acc.id,
                                inspectorType: "cashflow",
                                txFilter: "all",
                                forceOpen: true,
                              })
                            }
                            className="flex items-center justify-between text-[11px] py-1 px-1.5 rounded hover:bg-slate-800/60 cursor-pointer transition group"
                            title={`Click to filter ${fmtMonthLabel(selectedMonth)} ledger to ${acc.institution} ${acc.name}`}
                          >
                            <span className="text-slate-300 group-hover:text-indigo-300">
                              <strong className="text-white">{acc.institution}</strong> — {acc.name}
                            </span>
                            <span className="font-mono font-semibold text-slate-200">{fmtCurrency(acc.balance)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}

          {/* ==================== MODE 2: CASH FLOW, INCOME & SPENDING MATH INSPECTOR ==================== */}
          {inspector.type === "cashflow" && (
            <div className="space-y-4 text-xs">
              {/* Month Selector Strip inside Inspector */}
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
                {available_months.slice(0, 12).map((ym) => {
                  const active = (monthDetail?.month || inspectedMonth || selectedMonth) === ym;
                  return (
                    <button
                      key={ym}
                      onClick={() => {
                        setInspectedMonth(ym);
                        setSelectedMonth(ym);
                        fetchMonthDetail(ym, selectedInstitution);
                      }}
                      className={`px-2.5 py-1 rounded-lg font-mono text-[11px] font-bold border shrink-0 transition ${
                        active
                          ? "bg-indigo-600 text-white border-indigo-500"
                          : "bg-slate-950 border-slate-800 text-slate-400 hover:text-white"
                      }`}
                    >
                      {ym}
                    </button>
                  );
                })}
              </div>

              {monthDetailLoading || !monthDetail ? (
                <div className="py-12 text-center text-slate-400">Loading month breakdown...</div>
              ) : (
                <>
                  {/* Step-by-Step Cash Flow Waterfall Math Card */}
                  <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-2.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-400">
                        🧮 {monthDetail.label} Complete Cash Flow Equation
                      </span>
                      <span className="font-mono text-[11px] font-bold text-slate-400">
                        Click any row to filter ledger ↓
                      </span>
                    </div>

                    {/* 1. Inflows */}
                    <div
                      onClick={() => setInspectorTxFilter(inspectorTxFilter === "income" ? "all" : "income")}
                      className={`p-2.5 rounded-xl border cursor-pointer transition ${
                        inspectorTxFilter === "income"
                          ? "bg-emerald-950/40 border-emerald-500"
                          : "bg-slate-900 border-slate-800 hover:border-emerald-500/40"
                      }`}
                    >
                      <div className="flex items-center justify-between font-bold">
                        <span className="text-emerald-400">+ 1. Total Cash Inflows ({monthDetail.kpis.income_tx_count || 0} deposits)</span>
                        <span className="font-mono text-sm text-emerald-400">+{fmtCurrency(monthDetail.kpis.income)}</span>
                      </div>
                      <div className="mt-1.5 space-y-1 pl-3 border-l-2 border-emerald-500/40 text-[11px]">
                        {(monthDetail.income_breakdown?.sources || []).map((s) => (
                          <div key={s.kind} className="flex justify-between text-slate-300">
                            <span>{s.label}:</span>
                            <span className="font-mono font-semibold text-emerald-300">+{fmtCurrency(s.amount)}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* 2. Baseline Housing & Partner Offset */}
                    <div
                      onClick={() => setInspectorTxFilter(inspectorTxFilter === "housing" ? "all" : "housing")}
                      className={`p-2.5 rounded-xl border cursor-pointer transition ${
                        inspectorTxFilter === "housing"
                          ? "bg-indigo-950/40 border-indigo-500"
                          : "bg-slate-900 border-slate-800 hover:border-emerald-500/40"
                      }`}
                    >
                      <div className="flex items-center justify-between font-bold">
                        <span className="text-white">− 2. Gross Housing (Mortgage P&I + HOA)</span>
                        <span className="font-mono text-sm text-rose-400">-{fmtCurrency(monthDetail.kpis.housing_spend)}</span>
                      </div>
                      <div className="mt-1.5 space-y-1 pl-3 border-l-2 border-indigo-500/40 text-[11px]">
                        <div className="flex justify-between text-slate-300">
                          <span>Scheduled Monthly Mortgage / Housing:</span>
                          <span className="font-mono">{fmtCurrency(monthDetail.housing_breakdown?.mortgage_pi || 0)}</span>
                        </div>
                        <div className="flex justify-between text-slate-300">
                          <span>HOA Dues (Regular):</span>
                          <span className="font-mono">{fmtCurrency(monthDetail.housing_breakdown?.hoa_regular || 0)}</span>
                        </div>
                        {monthDetail.housing_breakdown?.hoa_special_assessment > 0 && (
                          <div className="flex justify-between text-amber-300">
                            <span>HOA Special Assessment:</span>
                            <span className="font-mono">{fmtCurrency(monthDetail.housing_breakdown.hoa_special_assessment)}</span>
                          </div>
                        )}
                        <div className="flex justify-between text-emerald-400 font-semibold pt-0.5 border-t border-slate-800">
                          <span>{partnerName} Share (Mortgage + HOA Offset):</span>
                          <span className="font-mono">-{fmtCurrency(monthDetail.housing_breakdown?.partner_expected_total ?? partnerExpected)}</span>
                        </div>
                        <div className="flex justify-between text-indigo-300 font-bold">
                          <span>= Your Net Baseline Housing Out-of-Pocket:</span>
                          <span className="font-mono">{fmtCurrency(monthDetail.kpis.net_housing_spend)}</span>
                        </div>
                      </div>
                    </div>

                    {/* 3. Non-Housing Lifestyle Spend */}
                    <div
                      onClick={() => setInspectorTxFilter(inspectorTxFilter === "lifestyle" ? "all" : "lifestyle")}
                      className={`p-2.5 rounded-xl border cursor-pointer transition flex items-center justify-between ${
                        inspectorTxFilter === "lifestyle"
                          ? "bg-amber-950/40 border-amber-500"
                          : "bg-slate-900 border-slate-800 hover:border-amber-500/40"
                      }`}
                    >
                      <div>
                        <div className="font-bold text-white">− 3. Non-Housing Lifestyle Spend</div>
                        <div className="text-[10px] text-slate-400">
                          Groceries, Dining, Shopping, Travel, Utilities & Subscriptions
                        </div>
                      </div>
                      <span className="font-mono text-sm font-bold text-rose-400">
                        -{fmtCurrency(monthDetail.kpis.ex_housing_spend)}
                      </span>
                    </div>

                    {/* 4. Operating Net Savings */}
                    <div className="p-2.5 rounded-xl bg-indigo-500/10 border border-indigo-500/30 flex items-center justify-between">
                      <div>
                        <div className="font-bold text-white">= Operating Net Cash Flow (Before Extra Principal)</div>
                        <div className="text-[10px] text-slate-400">
                          Total Inflows ({fmtCompact(monthDetail.kpis.income)}) − Gross Expenses ({fmtCompact(monthDetail.kpis.total_spend)})
                        </div>
                      </div>
                      <span className={`font-mono text-sm font-extrabold ${monthDetail.kpis.net_savings >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                        {fmtCurrency(monthDetail.kpis.net_savings, true)}
                      </span>
                    </div>

                    {/* 5. Extra Mortgage Principal Prepayment */}
                    {monthDetail.kpis.fidelity_extra_principal > 0 && (
                      <div
                        onClick={() => setInspectorTxFilter(inspectorTxFilter === "principal" ? "all" : "principal")}
                        className={`p-2.5 rounded-xl border cursor-pointer transition flex items-center justify-between ${
                          inspectorTxFilter === "principal"
                            ? "bg-purple-950/50 border-purple-400"
                            : "bg-purple-500/10 border-purple-500/30 hover:border-purple-400"
                        }`}
                      >
                        <div>
                          <div className="font-bold text-purple-300">
                            ⚡ 4. Extra Mortgage Principal Prepayment
                          </div>
                          <div className="text-[10px] text-slate-400">
                            Drafted from {extraFrom} (Builds Home Equity)
                          </div>
                        </div>
                        <span className="font-mono text-sm font-bold text-purple-300">
                          -{fmtCurrency(monthDetail.kpis.fidelity_extra_principal)}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Category Breakdown Bars inside Inspector (Click any category to filter transactions below) */}
                  <div className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                        Spending Categories in {monthDetail.label} (Click to Filter)
                      </span>
                      {monthCategoryFilter && (
                        <button
                          onClick={() => setMonthCategoryFilter(null)}
                          className="text-[11px] text-indigo-400 font-bold hover:underline"
                        >
                          Clear ({monthCategoryFilter}) ✕
                        </button>
                      )}
                    </div>
                    <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                      {(monthDetail.categories || []).map((c, i) => {
                        const isSel = monthCategoryFilter === c.category;
                        const displayVal =
                          c.category === "Housing" && netPartnerMode
                            ? monthDetail.kpis.net_housing_spend
                            : c.spend;
                        return (
                          <div
                            key={c.category}
                            onClick={() => {
                              setMonthCategoryFilter(isSel ? null : c.category);
                              setInspectorTxFilter("all");
                            }}
                            className={`p-2 rounded-xl border cursor-pointer transition flex items-center justify-between ${
                              isSel
                                ? "bg-indigo-950/60 border-indigo-500"
                                : "bg-slate-900 border-slate-800 hover:border-slate-600"
                            }`}
                          >
                            <div className="flex items-center gap-2">
                              <span
                                className="w-2.5 h-2.5 rounded-full"
                                style={{ backgroundColor: getCategoryColor(c.category, i) }}
                              />
                              <span className="font-bold text-white">
                                {c.category === "Housing" && netPartnerMode
                                  ? `Housing (Net of ${partnerName})`
                                  : c.category}
                              </span>
                              <span className="text-[10px] text-slate-400">({c.tx_count})</span>
                            </div>
                            <span className="font-mono font-bold text-white">{fmtCurrency(displayVal)}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Daily Spending Calendar Heatmap (click a day to filter the ledger) */}
                  <div className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                        📅 {monthDetail.label} Spending Calendar{monthCategoryFilter ? ` · ${monthCategoryFilter}` : " · Ex-Housing"}
                      </span>
                      {(monthDayFilter || monthMerchantFilter) && (
                        <button
                          onClick={() => { setMonthDayFilter(null); setMonthMerchantFilter(null); }}
                          className="text-[11px] text-emerald-400 font-bold hover:underline"
                        >
                          Clear {monthDayFilter || monthMerchantFilter} ✕
                        </button>
                      )}
                    </div>
                    <SpendingCalendarHeatmap
                      ym={monthDetail.month}
                      dailySeries={monthDetail.daily_series || []}
                      valueFor={(d) => (monthCategoryFilter ? Number(d.categories?.[monthCategoryFilter] || 0) : Number(d.ex_housing_spend || 0))}
                      selectedDate={monthDayFilter}
                      onSelectDate={(dt) => { setMonthDayFilter(dt); setInspectorTxFilter("all"); }}
                      isDark={isDark}
                    />
                  </div>

                  {/* Unified Income + Expense + Extra Principal Transaction Ledger for the Month */}
                  {(() => {
                    const filteredInspectorTxs = (monthDetail.transactions || [])
                      .filter((t) => {
                        const descU = String(t.description || "").toUpperCase();
                        const isExtraPrin =
                          descU.includes("ADDITIONAL PRINCIPAL PREPAYMENT") ||
                          descU.includes("1 TIME DFT");
                        if (inspectorTxFilter === "income") return t.tx_type === "income";
                        if (inspectorTxFilter === "housing")
                          return t.category === "Housing" || isExtraPrin;
                        if (inspectorTxFilter === "principal") return isExtraPrin;
                        if (inspectorTxFilter === "lifestyle")
                          return t.tx_type === "expense" && t.category !== "Housing";
                        // "all": show income, expenses, and extra principal prepayments
                        return t.tx_type === "income" || t.tx_type === "expense" || isExtraPrin;
                      })
                      .filter((t) => {
                        if (monthCategoryFilter && t.tx_type === "expense" && t.category !== monthCategoryFilter)
                          return false;
                        if (monthDayFilter && t.tx_date !== monthDayFilter) return false;
                        if (monthMerchantFilter && t.merchant !== monthMerchantFilter) return false;
                        if (monthAccountFilter && Number(t.account_id) !== Number(monthAccountFilter))
                          return false;
                        if (monthTxSearch) {
                          const q = monthTxSearch.toUpperCase();
                          return (
                            String(t.merchant || "").toUpperCase().includes(q) ||
                            String(t.description || "").toUpperCase().includes(q) ||
                            String(t.category || "").toUpperCase().includes(q) ||
                            String(t.account_name || "").toUpperCase().includes(q)
                          );
                        }
                        return true;
                      });

                    const filteredInspectorSum = filteredInspectorTxs.reduce(
                      (s, t) => s + Math.abs(Number(t.amount || 0)),
                      0
                    );
                    const activeAcctObj = monthAccountFilter
                      ? (accounts || []).find((a) => Number(a.id) === Number(monthAccountFilter))
                      : null;
                    const hasAnyCrossFilter = Boolean(
                      monthCategoryFilter || monthMerchantFilter || monthDayFilter || monthAccountFilter
                    );

                    return (
                      <div className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800 space-y-2.5">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                            {monthDetail.label} Ledger ({filteredInspectorTxs.length} ·{" "}
                            <span className="text-indigo-300 font-mono">
                              {fmtCurrency(filteredInspectorSum)}
                            </span>
                            )
                          </span>
                          <div className="flex flex-wrap gap-1">
                            {[
                              { id: "all", label: "All" },
                              { id: "income", label: "Income" },
                              { id: "housing", label: "Housing" },
                              { id: "principal", label: "Extra Principal" },
                              { id: "lifestyle", label: "Lifestyle" },
                            ].map((f) => (
                              <button
                                key={f.id}
                                onClick={() => setInspectorTxFilter(f.id)}
                                className={`px-2 py-0.5 rounded-lg text-[10px] font-bold transition ${
                                  inspectorTxFilter === f.id
                                    ? "bg-indigo-600 text-white"
                                    : "bg-slate-900 text-slate-400 hover:text-white"
                                }`}
                              >
                                {f.label}
                              </button>
                            ))}
                          </div>
                        </div>

                        {hasAnyCrossFilter && (
                          <div className="flex flex-wrap items-center gap-1.5 text-[10px]">
                            {monthCategoryFilter && (
                              <button
                                onClick={() => setMonthCategoryFilter(null)}
                                className="px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/40 font-semibold hover:bg-indigo-500/30 cursor-pointer"
                              >
                                Category: {monthCategoryFilter} ✕
                              </button>
                            )}
                            {monthMerchantFilter && (
                              <button
                                onClick={() => setMonthMerchantFilter(null)}
                                className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-semibold hover:bg-emerald-500/30 cursor-pointer"
                              >
                                Merchant: {monthMerchantFilter} ✕
                              </button>
                            )}
                            {monthDayFilter && (
                              <button
                                onClick={() => setMonthDayFilter(null)}
                                className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40 font-semibold hover:bg-amber-500/30 cursor-pointer"
                              >
                                Date: {monthDayFilter} ✕
                              </button>
                            )}
                            {monthAccountFilter && (
                              <button
                                onClick={() => setMonthAccountFilter(null)}
                                className="px-2 py-0.5 rounded-full bg-sky-500/20 text-sky-300 border border-sky-500/40 font-semibold hover:bg-sky-500/30 cursor-pointer"
                              >
                                Account: {activeAcctObj ? `${activeAcctObj.institution} ${activeAcctObj.name}` : `#${monthAccountFilter}`} ✕
                              </button>
                            )}
                            <button
                              onClick={() => {
                                setMonthCategoryFilter(null);
                                setMonthMerchantFilter(null);
                                setMonthDayFilter(null);
                                setMonthAccountFilter(null);
                              }}
                              className="text-slate-400 hover:text-rose-400 underline ml-1 cursor-pointer"
                            >
                              Reset all
                            </button>
                          </div>
                        )}

                        <input
                          type="text"
                          placeholder={`Search ${monthDetail.label} income or expenses...`}
                          value={monthTxSearch}
                          onChange={(e) => setMonthTxSearch(e.target.value)}
                          className="w-full px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-700 text-xs text-white"
                        />

                        <div className="max-h-72 overflow-y-auto divide-y divide-slate-800/70">
                          {filteredInspectorTxs.length === 0 ? (
                            <div className="py-6 text-center text-[11px] text-slate-400">
                              No matching transactions for the active Inspector filters.
                            </div>
                          ) : (
                            filteredInspectorTxs.map((t) => {
                              const isInc = t.tx_type === "income";
                              const isPrin = t.tx_type === "transfer";
                              return (
                                <div key={t.id} className="py-2 flex items-center justify-between gap-2">
                                  <div className="min-w-0">
                                    <div className="flex flex-wrap items-center gap-1.5">
                                      <button
                                        type="button"
                                        onClick={() =>
                                          setMonthMerchantFilter(
                                            monthMerchantFilter === t.merchant ? null : t.merchant
                                          )
                                        }
                                        className="font-bold text-white hover:text-indigo-400 truncate text-left cursor-pointer"
                                        title={`Filter ledger to ${t.merchant}`}
                                      >
                                        {t.merchant}
                                      </button>
                                      {isInc || isPrin ? (
                                        <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-800 text-slate-300">
                                          {isInc ? "Income" : "Extra Principal"}
                                        </span>
                                      ) : (
                                        <select
                                          value={t.category}
                                          onChange={(e) => handleUpdateTxCategory(t, e.target.value, false)}
                                          className="text-[10px] px-1.5 py-0.5 rounded bg-slate-900 border border-slate-700 text-indigo-300 font-semibold cursor-pointer"
                                          title="Recategorize immediately"
                                        >
                                          {CATEGORIES.map((c) => (
                                            <option key={c} value={c}>{c}</option>
                                          ))}
                                        </select>
                                      )}
                                    </div>
                                    <div className="text-[10px] text-slate-400 truncate flex items-center gap-1 mt-0.5">
                                      <span>{t.tx_date} •</span>
                                      <button
                                        type="button"
                                        onClick={() =>
                                          setMonthAccountFilter(
                                            Number(monthAccountFilter) === Number(t.account_id)
                                              ? null
                                              : t.account_id
                                          )
                                        }
                                        className="hover:text-sky-400 hover:underline truncate cursor-pointer"
                                        title={`Filter ledger to ${t.institution} (${t.account_name})`}
                                      >
                                        {t.institution} ({t.account_name})
                                      </button>
                                    </div>
                                  </div>
                                  <div
                                    className={`font-mono font-bold shrink-0 ${
                                      isInc
                                        ? "text-emerald-400"
                                        : isPrin
                                        ? "text-purple-300"
                                        : "text-white"
                                    }`}
                                  >
                                    {isInc ? `+${fmtCurrency(Math.abs(t.amount))}` : fmtCurrency(Math.abs(t.amount))}
                                  </div>
                                </div>
                              );
                            })
                          )}
                        </div>
                      </div>
                    );
                  })()}
                </>
              )}
            </div>
          )}

          {/* ==================== MODE 3: CATEGORY 12-MONTH INSPECTOR ==================== */}
          {inspector.type === "category" && (
            <div className="space-y-4 text-xs">
              {/* Category Quick Picker */}
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
                {(spending.categories || []).map((c) => (
                  <button
                    key={c.category}
                    onClick={() => fetchCategoryDetail(c.category)}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border shrink-0 transition ${
                      inspector.category === c.category
                        ? "bg-indigo-600 text-white border-indigo-500"
                        : "bg-slate-950 border-slate-800 text-slate-400 hover:text-white"
                    }`}
                  >
                    {c.category}
                  </button>
                ))}
              </div>

              {drillLoading || !drillData ? (
                <div className="py-12 text-center text-slate-400">Loading historical category data...</div>
              ) : (
                <>
                  {/* Special Housing & Partner Offset Card when inspecting Housing */}
                  {drillData.category === "Housing" && drillData.housing_breakdown && (
                    <div className="p-3.5 rounded-2xl bg-slate-950 border border-indigo-500/40 space-y-2">
                      <div className="text-[10px] font-bold uppercase tracking-wider text-indigo-400">
                        🏠 Housing, {partnerName} Offset &amp; Extra Principal Breakdown
                      </div>
                      <div className="space-y-1 text-[11px]">
                        <div className="flex justify-between">
                          <span className="text-slate-300">Monthly Mortgage P&amp;I / Housing:</span>
                          <span className="font-mono font-bold text-white">
                            {fmtCurrency(drillData.housing_breakdown.mortgage_pi)}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-300">HOA Dues (Regular):</span>
                          <span className="font-mono font-bold text-white">
                            {fmtCurrency(drillData.housing_breakdown.hoa_regular)}
                          </span>
                        </div>
                        <div className="flex justify-between text-emerald-400">
                          <span>Less {partnerName} Share:</span>
                          <span className="font-mono font-bold">
                            -{fmtCurrency(drillData.housing_breakdown.partner_expected_total ?? partnerExpected)}
                          </span>
                        </div>
                        <div className="flex justify-between pt-1 border-t border-slate-800 font-bold text-indigo-300">
                          <span>= Your Net Monthly Housing Cost:</span>
                          <span className="font-mono">{fmtCurrency(drillData.housing_breakdown.net_housing)}</span>
                        </div>
                        <div className="flex justify-between text-purple-300 pt-1">
                          <span>+ Extra Principal ({selectedMonth} / YTD):</span>
                          <span className="font-mono font-bold">
                            {fmtCurrency(drillData.housing_breakdown.fidelity_extra_principal)} /{" "}
                            {fmtCompact(drillData.housing_breakdown.ytd_fidelity_extra_principal)}
                          </span>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* 12-Month Trajectory Chart */}
                  <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="font-bold text-white">12-Month Trajectory</span>
                      <span className="text-slate-400 font-mono">12M Avg: {fmtCurrency(drillData.avg_12m)}</span>
                    </div>
                    <ChartCanvas
                      type="bar"
                      height={190}
                      isDark={isDark}
                      onElementClick={({ index }) => {
                        const clickedYm = drillData.history?.[index]?.month;
                        if (clickedYm) {
                          openMonthInspector(clickedYm, {
                            category: drillData.category,
                            inspectorType: "cashflow",
                          });
                        }
                      }}
                      data={{
                        labels: drillData.history.map((h) => h.label || h.month),
                        datasets: [
                          {
                            label: `${drillData.category} Spend`,
                            data: drillData.history.map((h) => h.spend),
                            backgroundColor: "#6366f1",
                            borderRadius: 5,
                          },
                        ],
                      }}
                      options={{
                        scales: {
                          x: { ticks: { color: "#94a3b8", font: { size: 10 } }, grid: { display: false } },
                          y: { ticks: { color: "#94a3b8", callback: (v) => fmtCompact(v) }, grid: { color: "rgba(51,65,85,0.25)" } },
                        },
                        plugins: { legend: { display: false } },
                      }}
                    />
                  </div>

                  {/* Top Merchants */}
                  <div className="space-y-2">
                    <h4 className="font-bold text-slate-400 uppercase text-[10px]">Top Merchants in {drillData.category}</h4>
                    {drillData.merchants.slice(0, 8).map((m, i) => (
                      <div key={i} className="p-2.5 rounded-xl bg-slate-950 border border-slate-800 flex justify-between items-center">
                        <div>
                          <div className="font-bold text-white">{m.merchant}</div>
                          <div className="text-[10px] text-slate-400">{m.count} txns • 3M avg: {fmtCurrency(m.avg_3m)}</div>
                        </div>
                        <div className="font-mono font-bold text-white">{fmtCurrency(m.spend)}</div>
                      </div>
                    ))}
                  </div>

                  {/* Month Transactions */}
                  <div className="space-y-2">
                    <h4 className="font-bold text-slate-400 uppercase text-[10px]">
                      {selectedMonth} Transactions ({drillData.transactions.length})
                    </h4>
                    <div className="divide-y divide-slate-800 border border-slate-800 rounded-xl bg-slate-950 px-3 max-h-60 overflow-y-auto">
                      {drillData.transactions.map((t) => (
                        <div key={t.id} className="py-2 flex justify-between items-center">
                          <div>
                            <div className="font-semibold text-white">{t.merchant}</div>
                            <div className="text-[10px] text-slate-400">{t.tx_date} • {t.account_name}</div>
                          </div>
                          <div className="font-mono font-bold text-white">{fmtCurrency(t.amount)}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

          {/* ==================== MODE 4: CARDS & LIQUIDITY RUNWAY INSPECTOR ==================== */}
          {inspector.type === "cards" && (
            <div className="space-y-4 text-xs">
              {/* Liquid Runway Math Card */}
              <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-400">
                    💧 Liquid Cash & Money-Market Runway
                  </span>
                  <span className="badge bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 font-mono">
                    {net_worth.runway_with_mmf_months || "3.4"} mo Cash+MMF
                  </span>
                </div>
                <div className="space-y-1.5 text-[11px]">
                  <div className="flex justify-between py-1 border-b border-slate-800">
                    <span className="text-slate-300">Immediate Checking &amp; Bank Cash:</span>
                    <span className="font-mono font-bold text-white">{fmtCurrency(net_worth.cash)}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-800">
                    <span className="text-slate-300">Money Market Settlement Reserves:</span>
                    <span className="font-mono font-bold text-emerald-400">{fmtCurrency(net_worth.mmf_cash || 0)}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-800 font-bold">
                    <span className="text-white">= Total Immediate Cash &amp; Money Market:</span>
                    <span className="font-mono text-emerald-400">
                      {fmtCurrency(net_worth.liquid_cash_with_mmf || net_worth.cash)}
                    </span>
                  </div>
                  <div className="flex justify-between py-1 text-slate-400">
                    <span>Plus {extraFrom}:</span>
                    <span className="font-mono font-semibold text-indigo-300">
                      {fmtCurrency((net_worth.asset_groups || []).find((g) => g.id === "taxable")?.total || 0)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Credit Cards Breakdown */}
              <div className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    Revolving Credit Cards ({net_worth.card_count} Cards • {net_worth.cc_utilization_pct}% Utilized)
                  </span>
                  <span className="font-mono font-bold text-white">
                    {fmtCurrency(net_worth.credit_card_debt)} / {fmtCompact(net_worth.credit_card_limit)}
                  </span>
                </div>
                {(net_worth.cards || []).map((c) => (
                  <div
                    key={c.id}
                    onClick={() =>
                      openMonthInspector(selectedMonth, {
                        key: `card-acc-${c.id}`,
                        accountId: c.id,
                        inspectorType: "cashflow",
                        txFilter: "all",
                        forceOpen: true,
                      })
                    }
                    className="p-3 rounded-xl bg-slate-950 border border-slate-800 hover:border-indigo-500/60 space-y-1.5 cursor-pointer transition"
                    title={`Click to inspect ${fmtMonthLabel(selectedMonth)} charges on ${c.name}`}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="font-bold text-white">{c.name}</span>
                        <span className="text-[10px] text-slate-400 ml-2">{c.institution}</span>
                      </div>
                      <span className="font-mono font-bold text-white">{fmtCurrency(c.balance)}</span>
                    </div>
                    <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${
                          (c.utilization_pct || 0) > 30 ? "bg-rose-500" : "bg-emerald-500"
                        }`}
                        style={{ width: `${Math.min(100, Math.max(2, c.utilization_pct || 0))}%` }}
                      />
                    </div>
                    <div className="flex justify-between text-[10px] text-slate-400 font-mono">
                      <span>Utilization: {c.utilization_pct || 0}%</span>
                      <span className="text-indigo-400">Limit {fmtCurrency(c.credit_limit)} · Inspect charges →</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </aside>
      )}

      {/* ==================== SLIDE-OVER SETTINGS & DATA DRAWER ==================== */}
      {drawerOpen && (
        <div
          onClick={(e) => {
            if (e.target === e.currentTarget) setDrawerOpen(false);
          }}
          className="fixed inset-0 z-50 overflow-hidden bg-black/60 backdrop-blur-sm flex justify-end transition-opacity"
        >
          <div className="w-full max-w-xl bg-slate-900 border-l border-slate-800 h-full overflow-y-auto p-6 space-y-6 shadow-2xl">
            <div className="flex items-center justify-between pb-4 border-b border-slate-800">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-400">Configuration</span>
                <h2 className="text-xl font-bold text-white">Data Connections & Settings</h2>
              </div>
              <button
                onClick={() => setDrawerOpen(false)}
                className="w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center justify-center font-bold"
              >
                ✕
              </button>
            </div>

            {/* Dropzone for PDF, CSV, OFX, QFX */}
            <div className="space-y-3">
              <h3 className="text-xs font-bold uppercase text-slate-300">Statement Importer (PDF, CSV, OFX, QFX)</h3>
              <label className="block border-2 border-dashed border-indigo-500/50 hover:border-indigo-400 rounded-xl p-6 text-center cursor-pointer bg-slate-950/60 hover:bg-slate-950 transition">
                <input
                  type="file"
                  multiple
                  accept=".pdf,.csv,.ofx,.qfx,.tsv"
                  onChange={handleFileUpload}
                  className="hidden"
                />
                <div className="text-2xl mb-1">📄</div>
                <div className="text-xs font-bold text-white">Click or Drop Statements Here</div>
                <div className="text-[10px] text-slate-400 mt-1">
                  Supports PDF statements & CSV exports from Chase, BoA, Capital One, Wells Fargo, Vanguard, Fidelity & Schwab
                </div>
              </label>

              <div className="flex flex-wrap gap-2 pt-1">
                <button
                  onClick={handleScanDownloads}
                  className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition"
                >
                  📥 1-Click Scan Windows Downloads
                </button>
                <button
                  onClick={async () => {
                    await fetch("/api/import/open-folder", { method: "POST" });
                    showToast("Opened imports folder in Windows Explorer");
                  }}
                  className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700"
                >
                  📁 Open imports/ Folder
                </button>
              </div>
            </div>

            {/* Automated Bank APIs */}
            <div className="space-y-3 pt-3 border-t border-slate-800 text-xs">
              <h3 className="text-xs font-bold uppercase text-slate-300">Live Bank APIs (Teller & SimpleFIN)</h3>
              <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
                <div className="font-semibold text-white">Teller Connect (Free Developer Tier)</div>
                <p className="text-[11px] text-slate-400">
                  Connect live bank checking & credit cards directly without uploading CSVs.
                </p>
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="app_..."
                    value={tellerAppId}
                    onChange={(e) => setTellerAppId(e.target.value)}
                    className="flex-1 px-2.5 py-1.5 rounded bg-slate-900 border border-slate-700 text-xs text-white"
                  />
                  <button
                    onClick={() => {
                      if (!tellerAppId) {
                        showToast("Enter your Teller App ID first", "error");
                        return;
                      }
                      const tc = window.TellerConnect?.setup({
                        applicationId: tellerAppId,
                        environment: "development",
                        onSuccess: async (enrollment) => {
                          const token = enrollment.accessToken;
                          const instName = enrollment.enrollment?.institution?.name || "Bank";
                          showToast(`Linked ${instName}!`);
                          await fetch("/api/sync/teller", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ access_token: token, institution: instName }),
                          });
                          invalidateCaches();
                          fetchDashboard();
                        },
                      });
                      tc?.open();
                    }}
                    className="px-3 py-1.5 rounded bg-indigo-600 hover:bg-indigo-500 text-white font-bold"
                  >
                    Launch Linker
                  </button>
                </div>
              </div>

              {/* SimpleFIN Bridge */}
              <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
                <div className="font-semibold text-white">SimpleFIN Bridge (50+ Banks & Credit Unions)</div>
                <p className="text-[11px] text-slate-400">
                  Paste your SimpleFIN Setup Token or Claim URL to sync all connected checking, savings, and loan accounts.
                </p>
                <div className="flex gap-2">
                  <input
                    type="password"
                    placeholder="SimpleFIN Setup Token or Claim URL..."
                    value={simplefinToken}
                    onChange={(e) => setSimplefinToken(e.target.value)}
                    className="flex-1 px-2.5 py-1.5 rounded bg-slate-900 border border-slate-700 text-xs text-white"
                  />
                  <button
                    onClick={async () => {
                      if (!simplefinToken) {
                        showToast("Enter SimpleFIN setup token first", "error");
                        return;
                      }
                      showToast("Claiming SimpleFIN token & syncing accounts...");
                      try {
                        const res = await fetch("/api/sync/simplefin", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ token: simplefinToken }),
                        });
                        const json = await res.json();
                        if (json.status === "ok") {
                          showToast(`Synced ${json.accounts_synced || 0} accounts via SimpleFIN!`);
                          setSimplefinToken("");
                          invalidateCaches();
                          fetchDashboard();
                        } else {
                          showToast(json.error || "SimpleFIN sync failed", "error");
                        }
                      } catch (e) {
                        showToast("Network error during SimpleFIN sync", "error");
                      }
                    }}
                    className="px-3 py-1.5 rounded bg-emerald-600 hover:bg-emerald-500 text-white font-bold"
                  >
                    Link SimpleFIN
                  </button>
                </div>
              </div>
            </div>

            {/* Manage Accounts Form */}
            <div className="space-y-3 pt-3 border-t border-slate-800 text-xs">
              <h3 className="text-xs font-bold uppercase text-slate-300">Add Custom Financial Account</h3>
              <form onSubmit={handleAddAccount} className="grid grid-cols-2 gap-2 text-xs">
                <input
                  type="text"
                  placeholder="Account Name (e.g. Sapphire Reserve)"
                  value={newAccount.name}
                  onChange={(e) => setNewAccount({ ...newAccount, name: e.target.value })}
                  className="col-span-2 px-3 py-1.5 rounded bg-slate-950 border border-slate-700 text-white"
                  required
                />
                <select
                  value={newAccount.institution}
                  onChange={(e) => setNewAccount({ ...newAccount, institution: e.target.value })}
                  className="px-3 py-1.5 rounded bg-slate-950 border border-slate-700 text-white"
                >
                  {INSTITUTIONS.filter((i) => i !== "All").map((i) => (
                    <option key={i} value={i}>{i}</option>
                  ))}
                </select>
                <select
                  value={newAccount.account_type}
                  onChange={(e) => setNewAccount({ ...newAccount, account_type: e.target.value })}
                  className="px-3 py-1.5 rounded bg-slate-950 border border-slate-700 text-white"
                >
                  <option value="credit_card">Credit Card</option>
                  <option value="checking">Checking</option>
                  <option value="savings">Savings</option>
                  <option value="investment">Investment / Brokerage</option>
                </select>
                <input
                  type="number"
                  step="any"
                  placeholder="Balance ($)"
                  value={newAccount.balance}
                  onChange={(e) => setNewAccount({ ...newAccount, balance: e.target.value })}
                  className="px-3 py-1.5 rounded bg-slate-950 border border-slate-700 text-white"
                />
                <input
                  type="number"
                  step="any"
                  placeholder="Credit Limit ($)"
                  value={newAccount.credit_limit}
                  onChange={(e) => setNewAccount({ ...newAccount, credit_limit: e.target.value })}
                  className="px-3 py-1.5 rounded bg-slate-950 border border-slate-700 text-white"
                />
                <button type="submit" className="col-span-2 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold">
                  + Add Account
                </button>
              </form>
            </div>

            {/* Demo Sample Data Controls */}
            <div className="pt-3 border-t border-slate-800 flex items-center justify-between text-xs">
              <div>
                <div className="font-bold text-white">Sample Demo Data</div>
                <div className="text-[11px] text-slate-400">Restore or clear demo transactions</div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={async () => {
                    await fetch("/api/demo/clear", { method: "POST" });
                    showToast("Cleared demo sample data.");
                    invalidateCaches();
                    fetchDashboard();
                  }}
                  className="px-3 py-1.5 rounded-lg bg-rose-900/60 hover:bg-rose-800 text-rose-200 border border-rose-700/50 font-semibold"
                >
                  Clear Demo
                </button>
                <button
                  onClick={async () => {
                    await fetch("/api/demo/reset", { method: "POST" });
                    showToast("Restored demo sample data.");
                    invalidateCaches();
                    fetchDashboard();
                  }}
                  className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold"
                >
                  Reset Demo
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ==================== ADD POSITION MODAL ==================== */}
      {showHoldingModal && (
        <div
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowHoldingModal(false);
          }}
          className="fixed inset-0 z-50 overflow-hidden bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
        >
          <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <h3 className="font-bold text-white">Add Investment Holding</h3>
              <button onClick={() => setShowHoldingModal(false)} className="text-slate-400 hover:text-white">✕</button>
            </div>

            <form onSubmit={handleAddHolding} className="grid grid-cols-2 gap-3 text-xs">
              <div className="col-span-2">
                <label className="block text-slate-400 mb-1">Brokerage Account</label>
                <select
                  value={newHolding.account_id}
                  onChange={(e) => setNewHolding({ ...newHolding, account_id: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-white"
                  required
                >
                  <option value="">Select Brokerage Account...</option>
                  {accounts.filter((a) => a.account_type === "investment").map((a) => (
                    <option key={a.id} value={a.id}>{a.institution} — {a.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-slate-400 mb-1">Ticker Symbol</label>
                <input
                  type="text"
                  placeholder="e.g. VTI, SCHD"
                  value={newHolding.symbol}
                  onChange={(e) => setNewHolding({ ...newHolding, symbol: e.target.value.toUpperCase() })}
                  className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-white"
                  required
                />
              </div>
              <div>
                <label className="block text-slate-400 mb-1">Security Name</label>
                <input
                  type="text"
                  placeholder="e.g. Vanguard Total Stock"
                  value={newHolding.name}
                  onChange={(e) => setNewHolding({ ...newHolding, name: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-white"
                />
              </div>
              <div>
                <label className="block text-slate-400 mb-1">Shares</label>
                <input
                  type="number"
                  step="any"
                  placeholder="100"
                  value={newHolding.shares}
                  onChange={(e) => setNewHolding({ ...newHolding, shares: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-white"
                  required
                />
              </div>
              <div>
                <label className="block text-slate-400 mb-1">Current Price ($)</label>
                <input
                  type="number"
                  step="any"
                  placeholder="285.50"
                  value={newHolding.current_price}
                  onChange={(e) => setNewHolding({ ...newHolding, current_price: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-white"
                  required
                />
              </div>
              <div className="col-span-2">
                <label className="block text-slate-400 mb-1">Total Cost Basis ($)</label>
                <input
                  type="number"
                  step="any"
                  placeholder="24000.00"
                  value={newHolding.cost_basis_total}
                  onChange={(e) => setNewHolding({ ...newHolding, cost_basis_total: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-white"
                  required
                />
              </div>
              <div className="col-span-2 pt-2">
                <button
                  type="submit"
                  className="w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold transition"
                >
                  Save Position
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ==================== COMMAND PALETTE (Ctrl/Cmd+K or /) ==================== */}
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} commands={paletteCommands} isDark={isDark} />
    </div>
  );
}

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(<App />);
