import { requireAsset } from "./assets";
import { totalFeesAda, type FeeBreakdown } from "./fees";
import type {
  AdapterFailureCandidate,
  EvaluatedRoute,
  QuoteMode,
  QuoteRequest,
  RejectedRoute,
  RouteCandidate,
  RouteDecision,
  RejectionReason,
} from "./routes";
import { validateQuoteRequest } from "./validation";

export type DecideRoutesOptions = {
  improvementBufferPct?: number;
  requireExecutable?: boolean;
  now?: Date;
};

export function totalNonDexFeesAda(fees: FeeBreakdown): number {
  return fees.batcherFeeAda + fees.networkFeeAda + fees.aggregatorFeeAda + fees.minAdaRequirement;
}

/**
 * Compute net output after subtracting non-dex fees.
 *
 * Converts fees to output units via the input asset's exchange rate.
 * For live quotes, uses the trade's actual price (grossOutput / amountIn)
 * rather than the mock price for fee conversion.
 */
export function computeNetOutput(
  grossOutput: number,
  fees: FeeBreakdown,
  request?: Pick<QuoteRequest, "amountIn" | "inputAssetId"> & { quoteMode?: string; outputAssetId?: string },
): number {
  if (request && request.amountIn > 0) {
    const inputAsset = requireAsset(request.inputAssetId);
    const isLive = request.quoteMode === "live";
    const price = isLive && grossOutput > 0
      ? grossOutput / request.amountIn
      : inputAsset.mockPriceAda;
    const inputAdaValue = request.amountIn * price;
    if (inputAdaValue > 0) {
      const feeFraction = totalNonDexFeesAda(fees) / inputAdaValue;
      return grossOutput * Math.max(0, 1 - feeFraction);
    }
  }
  return grossOutput - totalNonDexFeesAda(fees);
}

export function netOutputForCandidate(
  candidate: RouteCandidate,
  request?: Pick<QuoteRequest, "amountIn" | "inputAssetId">,
): number {
  return computeNetOutput(candidate.grossOutput, candidate.fees, {
    amountIn: request?.amountIn ?? 0,
    inputAssetId: request?.inputAssetId ?? "lovelace",
    quoteMode: candidate.source.quoteMode,
  });
}

function quoteModeForDecision(candidates: RouteCandidate[], failures: AdapterFailureCandidate[]): QuoteMode {
  if ([...candidates, ...failures].some((entry) => entry.source.quoteMode === "live")) return "live";
  if ([...candidates, ...failures].some((entry) => entry.source.quoteMode === "fixture")) return "fixture";
  return "mock";
}

function isStale(candidate: RouteCandidate, now: Date): boolean {
  const quoteTime = Date.parse(candidate.quoteTimestamp);
  if (!Number.isFinite(quoteTime)) return true;
  if (candidate.expiresAt && Date.parse(candidate.expiresAt) <= now.getTime()) return true;
  if (candidate.maxAgeMs !== undefined && now.getTime() - quoteTime > candidate.maxAgeMs) return true;
  return false;
}

function reject(candidate: RouteCandidate, reason: RejectionReason, message: string, request: QuoteRequest): EvaluatedRoute {
  return {
    ...candidate,
    netOutput: netOutputForCandidate(candidate, request),
    totalFeesAda: totalFeesAda(candidate.fees),
    status: "rejected",
    rejectionReason: reason,
    rejectionMessage: message,
  };
}

export function decideRoutes(
  request: QuoteRequest,
  candidates: RouteCandidate[],
  failures: AdapterFailureCandidate[] = [],
  options: DecideRoutesOptions = {},
): RouteDecision {
  const now = options.now ?? new Date();
  const decisionTimestamp = now.toISOString();
  const validationFailures = validateQuoteRequest(request);
  const failedRoutes: RejectedRoute[] = failures.map((failure) => ({
    ...failure,
    status: "rejected",
    rejectionReason: failure.reason,
    rejectionMessage: failure.message,
  }));

  if (validationFailures.length > 0) {
    return {
      request,
      status: "invalid",
      candidateRoutes: [],
      rejectedRoutes: [
        ...failedRoutes,
        ...validationFailures.map((failure, index) => ({
          id: `invalid-request-${index}`,
          label: "Invalid request",
          source: { adapterId: "request", adapterName: "Request validation", quoteMode: "mock" as const },
          network: request.network,
          inputAssetId: request.inputAssetId,
          outputAssetId: request.outputAssetId,
          reason: failure.reason,
          message: failure.message,
          status: "rejected" as const,
          rejectionReason: failure.reason,
          rejectionMessage: failure.message,
        })),
      ],
      warnings: validationFailures.map((failure) => failure.message),
      quoteMode: quoteModeForDecision(candidates, failures),
      decisionTimestamp,
    };
  }

  const rejected: RejectedRoute[] = [...failedRoutes];
  const viable: EvaluatedRoute[] = [];

  for (const candidate of candidates) {
    if (candidate.inputAssetId !== request.inputAssetId || candidate.outputAssetId !== request.outputAssetId) {
      rejected.push(reject(candidate, "unsupported_pair", "Route does not match the requested asset pair.", request));
      continue;
    }

    if (candidate.network !== request.network) {
      rejected.push(reject(candidate, "unsupported_pair", "Route is for a different network.", request));
      continue;
    }

    if (isStale(candidate, now)) {
      rejected.push(reject(candidate, "stale_quote", "Quote is stale or expired.", request));
      continue;
    }

    if (candidate.liquidityAda !== undefined && candidate.liquidityAda < request.amountIn) {
      rejected.push(reject(candidate, "insufficient_liquidity", "Route does not have enough simulated liquidity.", request));
      continue;
    }

    if (candidate.priceImpactPct > 5) {
      rejected.push(reject(candidate, "excessive_price_impact", "Price impact exceeds the configured safety limit.", request));
      continue;
    }

    if (options.requireExecutable === true && !candidate.executable) {
      rejected.push(reject(candidate, "non_executable_route", "Read-only routes cannot enter signing flow.", request));
      continue;
    }

    viable.push({
      ...candidate,
      netOutput: netOutputForCandidate(candidate, request),
      totalFeesAda: totalFeesAda(candidate.fees),
      status: "available",
    });
  }

  const sorted = [...viable].sort((a, b) => {
    const outputDelta = b.netOutput - a.netOutput;
    if (Math.abs(outputDelta) > 0.000001) return outputDelta;
    return a.id.localeCompare(b.id);
  });

  const selected = sorted[0];
  if (!selected) {
    return {
      request,
      status: "no_route",
      candidateRoutes: [],
      rejectedRoutes: rejected,
      warnings: ["No executable fresh route is available for this request."],
      quoteMode: quoteModeForDecision(candidates, failures),
      decisionTimestamp,
    };
  }

  const directBaseline = sorted.find((route) => route.hops.length === 1);
  const improvementBufferPct = options.improvementBufferPct ?? 0.15;
  let selectedRoute: EvaluatedRoute = { ...selected, status: "selected" };

  if (selectedRoute.hops.length > 1 && directBaseline && selectedRoute.id !== directBaseline.id) {
    const requiredOutput = directBaseline.netOutput * (1 + improvementBufferPct / 100);
    if (selectedRoute.netOutput < requiredOutput) {
      rejected.push({
        ...selectedRoute,
        status: "rejected",
        rejectionReason: "below_improvement_buffer",
        rejectionMessage: "Complex route does not beat the direct baseline by the improvement buffer.",
      });
      selectedRoute = { ...directBaseline, status: "selected" };
    }
  }

  for (const route of sorted) {
    if (route.id === selectedRoute.id) continue;
    if (rejected.some((rejectedRoute) => rejectedRoute.id === route.id)) continue;
    rejected.push({
      ...route,
      status: "rejected",
      rejectionReason: "worse_net_output",
      rejectionMessage: "Route returns less net output than the selected route.",
    });
  }

  return {
    request,
    status: "valid",
    selectedRoute,
    candidateRoutes: [
      selectedRoute,
      ...sorted.filter((route) => route.id !== selectedRoute.id),
    ],
    rejectedRoutes: rejected,
    warnings: candidates.some((candidate) => candidate.source.quoteMode === "mock")
      ? ["Mock quote simulation only. No wallet signing, transaction building, or mainnet execution is enabled."]
      : [],
    quoteMode: quoteModeForDecision(candidates, failures),
    decisionTimestamp,
  };
}
