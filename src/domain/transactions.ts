import { totalFeesAda } from "./fees";
import type { EvaluatedRoute, QuoteRequest, RouteDecision, RouteHop } from "./routes";

export type PreviewWalletContext = {
  status: "disconnected" | "connected" | "error";
  walletName?: string;
  networkName?: "mainnet" | "testnet";
  networkId?: number;
  inputBalance?: bigint;
  blockers?: string[];
  address?: string;
};

export type TransactionPreview = {
  status: "ready" | "blocked";
  blockers: string[];
  wallet: {
    name?: string;
    network?: string;
    networkId?: number;
  };
  network: QuoteRequest["network"];
  inputAssetId: string;
  inputAmount: number;
  outputAssetId: string;
  expectedOutput: number;
  minimumReceived: number;
  selectedDex: string;
  routeHops: RouteHop[];
  fullFeeBreakdown: EvaluatedRoute["fees"];
  totalFeesAda: number;
  slippageTolerancePct: number;
  quoteSource: string;
  quoteAgeMs: number;
  quoteExpiration?: string;
  executableRouteId: string;
  approvedAt: string;
};

export type PreviewComparison =
  | { status: "match" }
  | { status: "blocked"; reason: string };

export type ExecutionState =
  | { step: "preview_ready" }
  | { step: "refreshing_quote" }
  | { step: "building_transaction" }
  | { step: "awaiting_signature" }
  | { step: "signing" }
  | { step: "submitting"; txHash?: string }
  | { step: "submitted"; txHash: string; submittedAt: string }
  | { step: "tracking"; txHash: string; submittedAt: string }
  | { step: "confirmed"; txHash: string; blockHeight: number }
  | { step: "failed"; txHash?: string; error: string }
  | { step: "expired"; txHash?: string; error: string };

export function createTransactionPreview(
  decision: RouteDecision,
  wallet: PreviewWalletContext,
  now = new Date(),
): TransactionPreview {
  const route = decision.selectedRoute;
  const blockers: string[] = [];

  if (!route) {
    blockers.push("No selected route is available.");
  }

  if (route && !route.executable) {
    blockers.push("Selected route is read-only and cannot enter signing flow.");
  }

  if (decision.request.network !== "preview" && decision.request.network !== "preprod") {
    blockers.push("Executable swaps require a non-mainnet route.");
  }

  if (wallet.status !== "connected") {
    blockers.push("Connect a wallet before transaction preview.");
  }

  for (const blocker of wallet.blockers ?? []) {
    blockers.push(blocker);
  }

  const selected: EvaluatedRoute = route ?? {
    id: "no-route",
    label: "No route",
    network: decision.request.network,
    inputAssetId: decision.request.inputAssetId,
    outputAssetId: decision.request.outputAssetId,
    grossOutput: 0,
    hops: [],
    fees: {
      dexFeeAda: 0,
      batcherFeeAda: 0,
      networkFeeAda: 0,
      aggregatorFeeAda: 0,
      minAdaRequirement: 0,
    },
    totalFeesAda: 0,
    netOutput: 0,
    status: "rejected",
    source: { adapterId: "none", adapterName: "None", quoteMode: "mock" },
    quoteTimestamp: now.toISOString(),
    executable: false,
    priceImpactPct: 0,
    confidencePct: 0,
    note: "No route selected.",
  };

  const quoteTime = Date.parse(selected.quoteTimestamp);
  const quoteAgeMs = Number.isFinite(quoteTime) ? Math.max(0, now.getTime() - quoteTime) : Number.POSITIVE_INFINITY;

  return {
    status: blockers.length === 0 ? "ready" : "blocked",
    blockers,
    wallet: {
      name: wallet.walletName,
      network: wallet.networkName,
      networkId: wallet.networkId,
    },
    network: decision.request.network,
    inputAssetId: decision.request.inputAssetId,
    inputAmount: decision.request.amountIn,
    outputAssetId: decision.request.outputAssetId,
    expectedOutput: selected.netOutput,
    minimumReceived: selected.netOutput * (1 - decision.request.slippageTolerancePct / 100),
    selectedDex: selected.label,
    routeHops: selected.hops,
    fullFeeBreakdown: selected.fees,
    totalFeesAda: totalFeesAda(selected.fees),
    slippageTolerancePct: decision.request.slippageTolerancePct,
    quoteSource: `${selected.source.quoteMode} / ${selected.source.adapterName}`,
    quoteAgeMs,
    quoteExpiration: selected.expiresAt,
    executableRouteId: selected.id,
    approvedAt: now.toISOString(),
  };
}

export function comparePreviewToRefreshedRoute(
  preview: TransactionPreview,
  refreshedDecision: RouteDecision,
  now = new Date(),
): PreviewComparison {
  const refreshed = refreshedDecision.selectedRoute;
  if (!refreshed) {
    return { status: "blocked", reason: "Refresh did not return a selected route." };
  }

  if (preview.status !== "ready") {
    return { status: "blocked", reason: "Approved preview is blocked." };
  }

  if (refreshed.id !== preview.executableRouteId) {
    return { status: "blocked", reason: "Refreshed route ID differs from the approved preview." };
  }

  if (refreshed.inputAssetId !== preview.inputAssetId || refreshed.outputAssetId !== preview.outputAssetId) {
    return { status: "blocked", reason: "Refreshed route asset pair differs from the approved preview." };
  }

  if (refreshed.network !== preview.network) {
    return { status: "blocked", reason: "Refreshed route network differs from the approved preview." };
  }

  if (refreshed.expiresAt && Date.parse(refreshed.expiresAt) <= now.getTime()) {
    return { status: "blocked", reason: "Refreshed route is expired." };
  }

  if (refreshed.netOutput < preview.minimumReceived) {
    return { status: "blocked", reason: "Refreshed output is below the approved minimum received." };
  }

  return { status: "match" };
}
