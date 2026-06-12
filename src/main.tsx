import React from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  ArrowDownUp,
  CheckCircle2,
  ChevronDown,
  CircleDollarSign,
  ExternalLink,
  Info,
  Loader2,
  Route,
  ShieldCheck,
  Wallet,
  Zap,
} from "lucide-react";
import {
  BLOCKFROST_PROJECT_ID,
  EXECUTABLE_NETWORK,
  EXPLORER_URLS,
  LIVE_QUOTE_NETWORK,
} from "./config/networks";
import { minswapLiveReadOnlyAdapter } from "./adapters/minswapLiveAdapter";
import { dexHunterReadOnlyAdapter } from "./adapters/dexHunterLiveAdapter";
import { steelswapReadOnlyAdapter } from "./adapters/steelswapLiveAdapter";
import { cardexscanReadOnlyAdapter } from "./adapters/cardexscanLiveAdapter";
import { saturnSwapReadOnlyAdapter } from "./adapters/saturnSwapLiveAdapter";
import { minswapV2DirectPoolAdapter } from "./adapters/minswapV2DirectPoolAdapter";
import { sundaeSwapV3DirectPoolAdapter } from "./adapters/sundaeSwapV3DirectPoolAdapter";
import { computeClearRouteAggregation } from "./adapters/aggregatorAdapter";
import { mockAdapter } from "./adapters/mockAdapter";
import {
  normalizeAdapterFailure,
  normalizeAdapterSuccess,
  type QuoteAdapterResult,
} from "./adapters/types";
import {
  buildTxRequestFromQuote,
  buildUnsignedTx,
} from "./adapters/minswapBuildTx";
import { ASSETS, assetBySymbol, requireAsset } from "./domain/assets";
import { decideRoutes } from "./domain/quoteEngine";
import {
  REJECTION_LABELS,
  type AdapterFailureCandidate,
  type QuoteRequest,
} from "./domain/routes";
import {
  comparePreviewToRefreshedRoute,
  createTransactionPreview,
  type PreviewWalletContext,
  type TransactionPreview,
} from "./domain/transactions";

import {
  connectWallet,
  discoverWallets,
  type Cip30WalletProvider,
  type Cip30WalletApi,
  type WalletContext,
} from "./wallet/cip30";
import { useSwapExecution } from "./hooks/useSwapExecution";
import { useLiveQuotes } from "./hooks/useLiveQuotes";
import { useWalletReconnect } from "./hooks/useWalletReconnect";
import { usePreferences } from "./hooks/usePreferences";
import { useTxPersistence } from "./utils/txPersistence";
import { mark, observeWebVitals } from "./utils/perf";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { NetworkStatusBanner, type NetworkStatus } from "./components/NetworkStatus";
import "./styles.css";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 20_000, retry: 0, refetchOnWindowFocus: false },
  },
});

const LIVE_ADAPTERS = [
  minswapLiveReadOnlyAdapter,
  dexHunterReadOnlyAdapter,
  steelswapReadOnlyAdapter,
  cardexscanReadOnlyAdapter,
  saturnSwapReadOnlyAdapter,
  minswapV2DirectPoolAdapter,
  sundaeSwapV3DirectPoolAdapter,
];

const selectableSymbols = ["ADA", "SNEK", "MIN", "HOSKY"];

function formatNumber(value: number, maximumFractionDigits = 2) {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits,
    minimumFractionDigits: 0,
  }).format(value);
}

function formatAda(value: number) {
  return `${formatNumber(value, 3)} ADA`;
}

function symbolForAsset(assetId: string) {
  return requireAsset(assetId).symbol;
}

function nextSymbol(current: string, disallowed: string) {
  const choices = selectableSymbols.filter((symbol) => symbol !== disallowed);
  const index = choices.indexOf(current);
  return choices[(index + 1) % choices.length] ?? choices[0];
}

type AdapterHealthEntry = {
  adapterId: string;
  adapterName: string;
  status: "available" | "stale" | "failed";
  message: string;
};

function computeAdapterHealth(
  results: QuoteAdapterResult[],
): AdapterHealthEntry[] {
  const map = new Map<string, AdapterHealthEntry>();
  for (const result of results) {
    const existing = map.get(result.adapterId);
    if (result.ok) {
      if (!existing || existing.status === "failed") {
        map.set(result.adapterId, {
          adapterId: result.adapterId,
          adapterName: result.adapterName,
          status: "available",
          message: "Quote available",
        });
      }
    } else {
      map.set(result.adapterId, {
        adapterId: result.adapterId,
        adapterName: result.adapterName,
        status: "failed",
        message: result.message,
      });
    }
  }
  return Array.from(map.values());
}

function buildDecision(
  request: QuoteRequest,
  liveResults: QuoteAdapterResult[],
  improvementBufferPct?: number,
) {
  const adapterResults = [
    ...mockAdapter.getQuotes(request),
    ...liveResults,
  ];
  const candidates = adapterResults
    .filter((result) => result.ok)
    .map(normalizeAdapterSuccess);
  const failures: AdapterFailureCandidate[] = adapterResults
    .filter((result) => !result.ok)
    .map(normalizeAdapterFailure);

  return decideRoutes(request, candidates, failures, { improvementBufferPct });
}

function formatAssetQuantity(assetId: string, quantity: bigint) {
  const asset = requireAsset(assetId);
  const divisor = 10 ** asset.decimals;
  return `${formatNumber(Number(quantity) / divisor, asset.decimals > 0 ? 6 : 0)} ${asset.symbol}`;
}

function walletSummary(context: WalletContext) {
  if (context.status === "connected") {
    return `${context.wallet.name} / ${context.networkName}`;
  }
  if (context.status === "error") {
    return context.message;
  }
  return context.wallets.length > 0
    ? "Wallets available"
    : "No CIP-30 wallets found";
}

function toPreviewWalletContext(
  context: WalletContext,
): PreviewWalletContext {
  if (context.status === "connected") {
    return {
      status: "connected",
      walletName: context.wallet.name,
      networkName: context.networkName,
      networkId: context.networkId,
      inputBalance: context.inputBalance,
      blockers: context.blockers,
      address: context.address,
    };
  }
  if (context.status === "error") {
    return { status: "error", blockers: [context.message] };
  }
  return {
    status: "disconnected",
    blockers: context.blocker ? [context.blocker] : [],
  };
}

function computeNetworkStatus(
  results: QuoteAdapterResult[],
  isLoading: boolean,
  isError: boolean,
): NetworkStatus {
  if (!navigator.onLine) return "offline";
  if (isError && results.length === 0) return "error";
  if (isLoading) return "healthy";
  const ok = results.filter((r) => r.ok).length;
  if (ok === 0 && results.length > 0) return "error";
  if (ok < results.length) return "degraded";
  return "healthy";
}

function liveStatusText(
  isLoading: boolean,
  isError: boolean,
  hasData: boolean,
) {
  if (isLoading) return "Loading live quotes";
  if (isError && !hasData) return "Failed to load live quotes";
  if (hasData) return "Live quotes ready";
  return "Live quotes not requested yet";
}

function App() {
  // Phase 2: User preferences (D19) — must be first to initialize form state
  const [prefs, updatePrefs] = usePreferences();

  const [amount, setAmount] = React.useState(1_000);
  const [fromSymbol, setFromSymbol] = React.useState(prefs.inputSymbol ?? "ADA");
  const [toSymbol, setToSymbol] = React.useState(prefs.outputSymbol ?? "SNEK");
  const [slippage, setSlippage] = React.useState(
    prefs.slippageTolerance != null ? String(prefs.slippageTolerance) : "0.5",
  );
  const [improvementBuffer, setImprovementBuffer] = React.useState("0.15");
  const [selectedNetwork, setSelectedNetwork] = React.useState<
    "mainnet" | "preprod" | "preview"
  >(prefs.selectedNetwork ?? LIVE_QUOTE_NETWORK);
  const [walletProviders, setWalletProviders] = React.useState<
    Cip30WalletProvider[]
  >([]);
  const [walletContext, setWalletContext] = React.useState<WalletContext>({
    status: "disconnected",
    wallets: [],
  });
  const walletApiRef = React.useRef<Cip30WalletApi | null>(null);
  const approvedPreviewRef = React.useRef<TransactionPreview | null>(null);
  const quotesFetchedRef = React.useRef(false);

  // Phase 2: useReducer state machine (D1)
  const {
    state: execState,
    execute,
    reset,
    startBuild,
    startSign,
    startSubmit,
    txSubmitted,
    txTracking,
    txConfirmed,
    fail,
    expire,
    isExecutingRef,
  } = useSwapExecution();

  // Phase 2: Tx persistence (D19)
  const { persistTx } = useTxPersistence();

  const inputAsset = assetBySymbol(fromSymbol) ?? ASSETS[0];
  const outputAsset = assetBySymbol(toSymbol) ?? ASSETS[1];
  const effectiveNetwork =
    walletContext.status === "connected" && walletContext.networkId !== 1
      ? EXECUTABLE_NETWORK
      : selectedNetwork;

  const request: QuoteRequest = {
    inputAssetId: inputAsset.id,
    outputAssetId: outputAsset.id,
    amountIn: amount,
    slippageTolerancePct: Number(slippage),
    network: effectiveNetwork,
  };

  // Phase 2: React Query for live quotes (D2)
  const {
    data: liveResults = [],
    isLoading,
    isError,
    refetch,
  } = useLiveQuotes(request, LIVE_ADAPTERS);

  // Aggregate ClearRoute result on top of live results
  const aggregatedResult = React.useMemo(() => {
    if (liveResults.length === 0) return null;
    return computeClearRouteAggregation(request, liveResults, new Date());
  }, [request, liveResults]);

  const allResults = React.useMemo(() => {
    if (!aggregatedResult) return liveResults;
    return [...liveResults, aggregatedResult];
  }, [liveResults, aggregatedResult]);

  // Phase 2: Session persistence — wallet reconnect (D19)
  const { persistWalletKey } = useWalletReconnect(
    (globalThis as { cardano?: unknown }).cardano,
    (api, wallet, provider) => {
      walletApiRef.current = api;
      void handleWalletConnect(provider);
    },
  );

  const discoverAndSetWallets = React.useCallback(() => {
    const providers = discoverWallets(
      (globalThis as { cardano?: unknown }).cardano,
    );
    setWalletProviders(providers);
    setWalletContext((current) =>
      current.status === "disconnected"
        ? {
            status: "disconnected",
            wallets: providers.map(({ id, name, icon, apiVersion }) => ({
              id,
              name,
              icon,
              apiVersion,
            })),
            blocker:
              providers.length === 0
                ? "No CIP-30 wallets detected. Make sure your wallet extension is installed, unlocked, and on preprod testnet."
                : undefined,
          }
        : current,
    );
  }, []);

  React.useEffect(() => {
    discoverAndSetWallets();
    const onCardano = () => {
      globalThis.setTimeout(discoverAndSetWallets, 500);
    };
    globalThis.addEventListener("cardano", onCardano);
    const timeoutId = globalThis.setTimeout(discoverAndSetWallets, 1_000);
    return () => {
      globalThis.removeEventListener("cardano", onCardano);
      globalThis.clearTimeout(timeoutId);
    };
  }, [discoverAndSetWallets]);

  // Phase 3: Performance marks + PWA registration
  React.useEffect(() => {
    mark("app:mount");
    observeWebVitals();

    if ("serviceWorker" in navigator) {
      navigator.serviceWorker
        .register("/sw.js", { scope: "/" })
        .then((reg) => {
          if (import.meta.env.DEV) console.debug("[sw] registered", reg.scope);
        })
        .catch(() => {});
    }
  }, []);

  React.useEffect(() => {
    if (isLoading && !quotesFetchedRef.current) {
      mark("quotes:fetch-start");
      quotesFetchedRef.current = true;
    }
    if (!isLoading && liveResults.length > 0 && quotesFetchedRef.current) {
      mark("quotes:fetch-end");
      quotesFetchedRef.current = false;
    }
  }, [isLoading, liveResults.length]);

  async function handleWalletConnect(provider: Cip30WalletProvider) {
    const context = await connectWallet(provider, {
      inputAssetId: request.inputAssetId,
      amountIn: request.amountIn,
    });
    if (context.status === "connected") {
      walletApiRef.current = context.walletApi;
      persistWalletKey(provider.id);
    }
    setWalletContext(context);
  }

  // Phase 2: Swap execution effect — async side effects driven by execState.step
  React.useEffect(() => {
    if (execState.step !== "refreshing_quote") return;

    const runRefresh = async () => {
      const freshSettled = await Promise.allSettled(
        LIVE_ADAPTERS.map((a) => a.getQuotes(request, new Date())),
      );
      const freshResults: QuoteAdapterResult[] = [];
      for (const result of freshSettled) {
        if (result.status === "fulfilled") freshResults.push(...result.value);
      }
      const agg = computeClearRouteAggregation(
        request,
        freshResults,
        new Date(),
      );
      if (agg) freshResults.push(agg);
      const freshDecision = buildDecision(
        request,
        freshResults,
        Number(improvementBuffer),
      );

      const approvedPreview = approvedPreviewRef.current;
      if (!approvedPreview) {
        fail("No approved preview to compare against.");
        return;
      }

      const comparison = comparePreviewToRefreshedRoute(
        approvedPreview,
        freshDecision,
      );
      if (comparison.status === "blocked") {
        fail(comparison.reason);
        return;
      }
      startBuild();
    };
    void runRefresh();
  }, [execState.step]);

  React.useEffect(() => {
    if (execState.step !== "building_transaction") return;

    const runBuild = async () => {
      const isMock =
        !BLOCKFROST_PROJECT_ID || BLOCKFROST_PROJECT_ID.trim() === "";
      if (isMock) {
        await new Promise((r) => setTimeout(r, 800));
        startSign();
        return;
      }

      const sender =
        walletContext.status === "connected" ? walletContext.address : "";
      if (!sender) {
        fail("No wallet address available.");
        return;
      }

      const buildRequest = buildTxRequestFromQuote(request, sender);
      const buildResult = await buildUnsignedTx(buildRequest);
      if (!buildResult.ok) {
        fail(buildResult.error);
        return;
      }
      startSign();
    };
    void runBuild();
  }, [execState.step]);

  React.useEffect(() => {
    if (execState.step !== "signing") return;

    const runSign = async () => {
      const api = walletApiRef.current;
      const isMock =
        !BLOCKFROST_PROJECT_ID || BLOCKFROST_PROJECT_ID.trim() === "";
      if (isMock || !api) {
        await new Promise((r) => setTimeout(r, 1200));
        startSubmit();
        return;
      }
      // Real signing handled in the old flow — mock path for now
      startSubmit();
    };
    void runSign();
  }, [execState.step]);

  React.useEffect(() => {
    if (execState.step !== "submitting") return;

    const runSubmit = async () => {
      const isMock =
        !BLOCKFROST_PROJECT_ID || BLOCKFROST_PROJECT_ID.trim() === "";
      if (isMock) {
        await new Promise((r) => setTimeout(r, 600));
        const mockTxHash = Array.from({ length: 64 }, () =>
          Math.floor(Math.random() * 16).toString(16),
        ).join("");
        txSubmitted(mockTxHash);
        persistTx(mockTxHash, {
          inputSymbol: fromSymbol,
          outputSymbol: toSymbol,
          amountIn: amount,
          networkName: effectiveNetwork,
        });
        return;
      }
      txTracking("mock-tx-hash");
    };
    void runSubmit();
  }, [execState.step]);

  const decision = React.useMemo(
    () => buildDecision(request, liveResults, Number(improvementBuffer)),
    [request, liveResults, improvementBuffer],
  );

  const selected = decision.selectedRoute;
  const directBaseline = decision.candidateRoutes.find(
    (route) => route.hops.length === 1,
  );
  const deltaVsDirect =
    selected && directBaseline ? selected.netOutput - directBaseline.netOutput : 0;
  const outputSymbol = outputAsset.symbol;
  const transactionPreview = React.useMemo(
    () =>
      createTransactionPreview(decision, toPreviewWalletContext(walletContext)),
    [decision, walletContext],
  );

  const adapterHealth = React.useMemo(
    () => computeAdapterHealth(allResults),
    [allResults],
  );

  const networkStatus = computeNetworkStatus(liveResults, isLoading, isError);

  return (
    <ErrorBoundary
      fallback={
        <div className="shell">
          <p>Something went wrong. Please refresh the page.</p>
        </div>
      }
    >
      <main className="shell">
        <NetworkStatusBanner
          status={networkStatus}
          adapterCount={LIVE_ADAPTERS.length}
          healthyCount={adapterHealth.filter((h) => h.status === "available").length}
          onRetry={() => refetch()}
        />

        <header className="topbar">
          <div className="brand">
            <div className="brandMark">
              <Route size={20} />
            </div>
            <div>
              <strong>ClearRoute</strong>
              <span>
                {effectiveNetwork === EXECUTABLE_NETWORK
                  ? "Testnet mock swap demo"
                  : "Read-only Cardano route trust demo"}
              </span>
            </div>
          </div>
          <nav>
            <a href="#quote">Swap</a>
            <a href="#routes">Routes</a>
            <a href="#proof">Proof</a>
          </nav>
          <button
            className="walletButton"
            disabled
            title="Signing remains disabled"
          >
            <Wallet size={17} />
            {walletSummary(walletContext)}
          </button>
        </header>

        <section className="mockBanner" aria-label="Mock quote simulation">
          <strong>
            {effectiveNetwork === EXECUTABLE_NETWORK
              ? "Mock executable swap on preprod"
              : "Mock quote simulation + Minswap preprod executable swap"}
          </strong>
          <span>
            {execState.step === "confirmed"
              ? "Swap confirmed! Check the explorer link below."
              : execState.step === "submitted"
              ? "Swap submitted! Check the explorer link below."
              : effectiveNetwork === EXECUTABLE_NETWORK
              ? `Executable mock swaps on ${EXECUTABLE_NETWORK}. Mainnet remains locked.`
              : `Non-mainnet ${EXECUTABLE_NETWORK} swaps enabled. Mainnet remains locked.`}
          </span>
        </section>

        <section className="statusStrip">
          <div>
            <ShieldCheck size={18} />
            Best route is ranked by net output after known fees
          </div>
          <div>
            <Zap size={18} />
            Minswap live estimates enter through the same adapter contract
          </div>
          <div>
            <CircleDollarSign size={18} />
            Source mode and read-only/executable status stay visible
          </div>
        </section>

        <section className="grid">
          <aside className="panel swapPanel" id="quote">
            <div className="panelTitle">
              <h1>Swap quote</h1>
              <span>
                {decision.quoteMode} /{" "}
                {effectiveNetwork === EXECUTABLE_NETWORK
                  ? `${EXECUTABLE_NETWORK} (executable mock)`
                  : effectiveNetwork}
              </span>
            </div>
            <div className={`liveStatus ${isError ? "failed" : isLoading ? "loading" : "ready"}`}>
              <Info size={16} />
              <span>
                {liveStatusText(isLoading, isError, liveResults.length > 0)}
              </span>
            </div>

            {allResults.length > 0 ? (
              <div className="adapterHealth">
                {adapterHealth.map((entry) => (
                  <span
                    key={entry.adapterId}
                    className={`healthDot ${entry.status}`}
                    title={entry.message}
                  >
                    {entry.adapterName}
                  </span>
                ))}
                <span className="healthLabel">Live adapters</span>
              </div>
            ) : null}

            <label className="fieldLabel">You pay</label>
            <div className="amountBox">
              <input
                aria-label="Amount"
                min="1"
                type="number"
                value={amount}
                onChange={(event) => {
                const raw = event.target.value;
                const parsed = Number(raw);
                if (raw === "") {
                  setAmount(1);
                } else if (!Number.isNaN(parsed) && Number.isFinite(parsed) && parsed >= 1 && parsed <= 1_000_000_000) {
                  setAmount(parsed);
                }
              }}
              />
              <button
                className="tokenButton"
                onClick={() => {
                  const next = nextSymbol(fromSymbol, toSymbol);
                  setFromSymbol(next);
                  updatePrefs({ inputSymbol: next });
                }}
              >
                {fromSymbol}
                <ChevronDown size={16} />
              </button>
            </div>

            <div className="switchLine">
              <button
                aria-label="Switch token pair"
                onClick={() => {
                  const nextFrom = toSymbol;
                  const nextTo = fromSymbol;
                  setFromSymbol(nextFrom);
                  setToSymbol(nextTo);
                  updatePrefs({ inputSymbol: nextFrom, outputSymbol: nextTo });
                }}
              >
                <ArrowDownUp size={17} />
              </button>
            </div>

            <label className="fieldLabel">You receive</label>
            <div className="amountBox receive">
              <strong>
                {selected ? formatNumber(selected.netOutput, 2) : "No route"}
              </strong>
              <button
                className="tokenButton"
                onClick={() => {
                  const next = nextSymbol(toSymbol, fromSymbol);
                  setToSymbol(next);
                  updatePrefs({ outputSymbol: next });
                }}
              >
                {toSymbol}
                <ChevronDown size={16} />
              </button>
            </div>

            <label className="fieldLabel">Slippage tolerance</label>
            <div className="segments">
              {["0.3", "0.5", "1.0"].map((value) => (
                <button
                  className={value === slippage ? "active" : ""}
                  key={value}
                  onClick={() => { setSlippage(value); updatePrefs({ slippageTolerance: Number(value) }); }}
                >
                  {value}%
                </button>
              ))}
            </div>

            <label className="fieldLabel">Network</label>
            <div className="segments">
              {(["mainnet", "preprod", "preview"] as const).map((net) => (
                <button
                  className={net === selectedNetwork ? "active" : ""}
                  key={net}
                  onClick={() => {
                    setSelectedNetwork(net);
                    updatePrefs({ selectedNetwork: net });
                  }}
                >
                  {net}
                </button>
              ))}
            </div>

            <label className="fieldLabel">
              Improvement buffer: {Number(improvementBuffer).toFixed(2)}%
            </label>
            <input
              aria-label="Improvement buffer"
              type="range"
              min="0"
              max="2"
              step="0.05"
              value={improvementBuffer}
              onChange={(event) => setImprovementBuffer(event.target.value)}
              className="rangeInput"
            />

            <div className={selected ? "decision good" : "decision warn"}>
              {selected ? <CheckCircle2 size={18} /> : <Info size={18} />}
              <span>
                {selected
                  ? `${selected.label} is best after known fees. ${
                      deltaVsDirect < 0
                        ? `Aggregation loses ${formatNumber(Math.abs(deltaVsDirect), 2)} ${outputSymbol} vs direct.`
                        : `Decision timestamp ${new Date(decision.decisionTimestamp).toLocaleTimeString()}.`
                    }`
                  : decision.warnings[0] ?? "No route is available."}
              </span>
            </div>

            <div className="note" style={{ marginTop: 12 }}>
              <Info size={16} />
              <p>
                Cardano uses eUTxO — each swap consumes one or more UTxOs and
                creates new ones. Large swaps may require UTxO batching. The
                aggregator handles this automatically.
              </p>
            </div>

            <button className="primaryAction" disabled>
              {isLoading ? "Loading quote…" : "Review confirmation below"}
            </button>
          </aside>

          <section className="panel routesPanel" id="routes">
            <div className="panelTitle">
              <h2>Route comparison</h2>
              <span>Engine output, not React ranking</span>
            </div>

            <div className="table">
              <div className="row head">
                <span>Route</span>
                <span>Net received</span>
                <span>Fees</span>
                <span>Impact</span>
                <span>Status</span>
              </div>
              {decision.candidateRoutes.map((route) => (
                <button
                  className={`row routeRow ${route.status === "selected" ? "best" : ""}`}
                  key={route.id}
                >
                  <span>
                    <strong>{route.label}</strong>
                    <small>
                      {route.hops
                        .map(
                          (hop) =>
                            `${symbolForAsset(hop.inputAssetId)} -> ${symbolForAsset(hop.outputAssetId)}`,
                        )
                        .join(" / ")}
                    </small>
                    <small>
                      {route.source.adapterName} / {route.source.quoteMode}
                    </small>
                    <span
                      className={`execBadge ${route.executable ? "executable" : "readonly"}`}
                    >
                      {route.executable ? "Executable" : "Read-only"}
                    </span>
                  </span>
                  <span>
                    {formatNumber(route.netOutput, 2)} {outputSymbol}
                  </span>
                  <span>{formatAda(route.totalFeesAda)}</span>
                  <span>{formatNumber(route.priceImpactPct, 2)}%</span>
                  <span>
                    {route.status === "selected" ? "Best" : "Rejected"}
                  </span>
                </button>
              ))}
              {decision.rejectedRoutes.map((route) => (
                <button
                  className="row routeRow rejected"
                  key={`rejected-${route.id}`}
                >
                  <span>
                    <strong>{route.label}</strong>
                    <small>{route.rejectionMessage}</small>
                    <small>
                      {route.source.adapterName} / {route.source.quoteMode}
                    </small>
                  </span>
                  <span>
                    {"netOutput" in route
                      ? `${formatNumber(route.netOutput, 2)} ${outputSymbol}`
                      : "N/A"}
                  </span>
                  <span>
                    {"totalFeesAda" in route
                      ? formatAda(route.totalFeesAda)
                      : "N/A"}
                  </span>
                  <span>
                    {"priceImpactPct" in route
                      ? `${formatNumber(route.priceImpactPct, 2)}%`
                      : "N/A"}
                  </span>
                  <span>
                    {route.rejectionReason
                      ? (REJECTION_LABELS[route.rejectionReason] ??
                        route.rejectionReason)
                      : "Rejected"}
                  </span>
                </button>
              ))}
            </div>
          </section>

          <aside className="panel detailPanel" id="proof">
            <div className="panelTitle">
              <h2>Decision proof</h2>
              <span>{selected ? "Best route" : "Blocked"}</span>
            </div>

            <div className="metricHero">
              <span>Expected net</span>
              <strong>
                {selected
                  ? `${formatNumber(selected.netOutput, 2)} ${outputSymbol}`
                  : "No route"}
              </strong>
              <small>
                After DEX, batcher, network, aggregator, and deposit fee fields
              </small>
            </div>

            <dl className="metrics">
              <div>
                <dt>Selected venue</dt>
                <dd>{selected?.label ?? "None"}</dd>
              </div>
              <div>
                <dt>Quote source</dt>
                <dd>
                  {selected
                    ? `${selected.source.quoteMode} / ${selected.source.adapterName}`
                    : "None"}
                </dd>
              </div>
              <div>
                <dt>Total fees</dt>
                <dd>{selected ? formatAda(selected.totalFeesAda) : "N/A"}</dd>
              </div>
              <div>
                <dt>Min received</dt>
                <dd>
                  {selected
                    ? `${formatNumber(selected.netOutput * (1 - Number(slippage) / 100), 2)} ${outputSymbol}`
                    : "N/A"}
                </dd>
              </div>
              <div>
                <dt>Rejected routes</dt>
                <dd>{decision.rejectedRoutes.length}</dd>
              </div>
            </dl>

            <div className="note">
              <Info size={18} />
              <p>
                {selected && !selected.executable
                  ? "Selected route is read-only and cannot be executed. Switch to the preprod network and an executable route."
                  : selected?.note ??
                    "The request is blocked before preview. Wallet connection and transaction signing are intentionally absent."}
              </p>
            </div>

            <section
              className="confirmationPanel"
              aria-label="Swap confirmation"
            >
              <div className="panelTitle compact">
                <h2>Swap confirmation</h2>
                <span>{transactionPreview.status}</span>
              </div>
              <dl className="metrics walletMetrics">
                <div>
                  <dt>Route proof</dt>
                  <dd>{transactionPreview.selectedDex}</dd>
                </div>
                <div>
                  <dt>Expected output</dt>
                  <dd>
                    {formatNumber(transactionPreview.expectedOutput, 2)}{" "}
                    {outputSymbol}
                  </dd>
                </div>
                <div>
                  <dt>Minimum received</dt>
                  <dd>
                    {formatNumber(transactionPreview.minimumReceived, 2)}{" "}
                    {outputSymbol}
                  </dd>
                </div>
                <div>
                  <dt>Refresh gate</dt>
                  <dd>Required before build</dd>
                </div>
              </dl>
              <div
                className={
                  transactionPreview.status === "ready"
                    ? "decision good"
                    : "decision warn"
                }
              >
                <Info size={18} />
                <span>
                  {transactionPreview.status === "ready"
                    ? selected?.executable
                      ? "Preview proof is ready. Click 'Confirm and swap' to execute the mock swap flow."
                      : "Preview proof is ready. Select an executable route on preprod to enable the swap button."
                    : transactionPreview.blockers.join(" ")}
                </span>
              </div>
              {selected && !selected.executable ? (
                <div className="decision warn">
                  <Info size={18} />
                  <span>
                    Read-only route cannot be executed. Connect a wallet on
                    preprod and select an executable route.
                  </span>
                </div>
              ) : null}

              <button
                className="primaryAction"
                disabled={
                  transactionPreview.status !== "ready" ||
                  walletContext.status !== "connected" ||
                  isExecutingRef.current
                }
                onClick={() => {
                  if (execState.step === "preview_ready") {
                    approvedPreviewRef.current = transactionPreview;
                    execute();
                  } else if (
                    execState.step === "failed" ||
                    execState.step === "expired"
                  ) {
                    reset();
                  }
                }}
              >
                {execState.step === "refreshing_quote" ? (
                  <>
                    <Loader2 size={17} className="spin" /> Refreshing quote...
                  </>
                ) : execState.step === "building_transaction" ? (
                  <>
                    <Loader2 size={17} className="spin" /> Building
                    transaction...
                  </>
                ) : execState.step === "awaiting_signature" ||
                  execState.step === "signing" ? (
                  <>
                    <Loader2 size={17} className="spin" /> Awaiting wallet
                    signature...
                  </>
                ) : execState.step === "submitting" ? (
                  <>
                    <Loader2 size={17} className="spin" /> Submitting
                    transaction...
                  </>
                ) : execState.step === "tracking" ? (
                  <>
                    <Loader2 size={17} className="spin" /> Tracking tx{" "}
                    {execState.txHash.slice(0, 8)}...
                  </>
                ) : execState.step === "submitted" ? (
                  <>
                    <CheckCircle2 size={17} /> Swap submitted
                  </>
                ) : execState.step === "confirmed" ? (
                  <>
                    <CheckCircle2 size={17} /> Swap confirmed
                  </>
                ) : execState.step === "failed" ||
                  execState.step === "expired" ? (
                  "Retry swap"
                ) : (
                  "Confirm and swap"
                )}
              </button>

              {(execState.step === "submitted" ||
                execState.step === "confirmed") &&
              "txHash" in execState &&
              execState.txHash ? (
                <a
                  className="explorerLink"
                  href={`${EXPLORER_URLS[EXECUTABLE_NETWORK]}/${execState.txHash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <ExternalLink size={16} />
                  View on Cardanoscan (preprod)
                </a>
              ) : null}

              {(execState.step === "failed" ||
                execState.step === "expired") &&
              "error" in execState ? (
                <div className="decision warn">
                  <Info size={18} />
                  <span>
                    {execState.error}
                  </span>
                </div>
              ) : null}
            </section>

            <section className="walletPanel" aria-label="Wallet context">
              <div className="panelTitle compact">
                <h2>Wallet context</h2>
                <span>No signing</span>
              </div>
              {walletContext.status === "disconnected" ? (
                <>
                  <p className="walletHint">
                    {walletContext.blocker ??
                      "Connect a CIP-30 wallet to read network and balance only."}
                  </p>
                  {walletProviders.length === 0 ? (
                    <div className="walletList">
                      <button
                        className="secondaryAction"
                        onClick={discoverAndSetWallets}
                      >
                        <Wallet size={16} />
                        Refresh wallet list
                      </button>
                    </div>
                  ) : (
                    <div className="walletList">
                      {walletProviders.map((provider) => (
                        <button
                          className="secondaryAction"
                          key={provider.id}
                          onClick={() => {
                            void handleWalletConnect(provider);
                          }}
                        >
                          <Wallet size={16} />
                          {provider.name}
                        </button>
                      ))}
                    </div>
                  )}
                </>
              ) : null}

              {walletContext.status === "connected" ? (
                <>
                  <dl className="metrics walletMetrics">
                    <div>
                      <dt>Wallet</dt>
                      <dd>{walletContext.wallet.name}</dd>
                    </div>
                    <div>
                      <dt>Network</dt>
                      <dd>{walletContext.networkName}</dd>
                    </div>
                    <div>
                      <dt>Input balance</dt>
                      <dd>
                        {formatAssetQuantity(
                          request.inputAssetId,
                          walletContext.inputBalance,
                        )}
                      </dd>
                    </div>
                    <div>
                      <dt>Required</dt>
                      <dd>
                        {formatAssetQuantity(
                          request.inputAssetId,
                          walletContext.requiredInput,
                        )}
                      </dd>
                    </div>
                  </dl>
                  <div
                    className={
                      walletContext.blockers.length > 0
                        ? "decision warn"
                        : "decision good"
                    }
                  >
                    <Info size={18} />
                    <span>
                      {walletContext.blockers.length > 0
                        ? walletContext.blockers.join(" ")
                        : "Wallet network and input balance are sufficient for context. Signing is still unavailable."}
                    </span>
                  </div>
                  <p className="walletHint">
                    Note: Transaction execution targets {EXECUTABLE_NETWORK}{" "}
                    regardless of the wallet network shown above. CIP-30
                    wallets cannot distinguish preprod from preview testnets.
                  </p>
                  <button
                    className="secondaryAction"
                    onClick={() => {
                      setWalletContext({
                        status: "disconnected",
                        wallets: walletProviders.map(
                          ({ id, name, icon, apiVersion }) => ({
                            id,
                            name,
                            icon,
                            apiVersion,
                          }),
                        ),
                      });
                    }}
                  >
                    Disconnect
                  </button>
                </>
              ) : null}

              {walletContext.status === "error" ? (
                <>
                  <div className="decision warn">
                    <Info size={18} />
                    <span>{walletContext.message}</span>
                  </div>
                  <button
                    className="secondaryAction"
                    onClick={() => {
                      setWalletContext({
                        status: "disconnected",
                        wallets: walletProviders.map(
                          ({ id, name, icon, apiVersion }) => ({
                            id,
                            name,
                            icon,
                            apiVersion,
                          }),
                        ),
                      });
                    }}
                  >
                    Back to wallets
                  </button>
                </>
              ) : null}
            </section>
          </aside>
        </section>
      </main>
    </ErrorBoundary>
  );
}

createRoot(document.getElementById("root")!).render(
  <QueryClientProvider client={queryClient}>
    <App />
  </QueryClientProvider>,
);
