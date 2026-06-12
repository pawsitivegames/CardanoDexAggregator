import type { AssetId } from "../domain/assets";
import type { FeeBreakdown } from "../domain/fees";
import type { QuoteMode, QuoteRequest, RejectionReason, RouteCandidate, RouteHop } from "../domain/routes";

export type QuoteAdapterSuccess = {
  ok: true;
  adapterId: string;
  adapterName: string;
  quoteMode: QuoteMode;
  network: QuoteRequest["network"];
  inputAssetId: AssetId;
  outputAssetId: AssetId;
  routeId: string;
  label: string;
  grossOutput: number;
  feeBreakdown: FeeBreakdown;
  routeHops: RouteHop[];
  quoteTimestamp: string;
  expiresAt?: string;
  maxAgeMs?: number;
  executable: boolean;
  liquidityAda?: number;
  priceImpactPct: number;
  confidencePct: number;
  note: string;
  poolReserveIn?: number;
  poolReserveOut?: number;
  poolFeeBps?: number;
};

export type QuoteAdapterFailure = {
  ok: false;
  adapterId: string;
  adapterName: string;
  quoteMode: QuoteMode;
  network: QuoteRequest["network"];
  inputAssetId: AssetId;
  outputAssetId: AssetId;
  routeId: string;
  label: string;
  reason: RejectionReason;
  message: string;
};

export type QuoteAdapterResult = QuoteAdapterSuccess | QuoteAdapterFailure;

export type QuoteAdapter = {
  id: string;
  displayName: string;
  quoteMode: QuoteMode;
  getQuotes: (request: QuoteRequest, now?: Date) => QuoteAdapterResult[];
};

export function normalizeAdapterFailure(result: QuoteAdapterFailure): {
  id: string;
  label: string;
  source: {
    adapterId: string;
    adapterName: string;
    quoteMode: QuoteMode;
  };
  network: QuoteRequest["network"];
  inputAssetId: AssetId;
  outputAssetId: AssetId;
  reason: RejectionReason;
  message: string;
} {
  return {
    id: result.routeId,
    label: result.label,
    source: {
      adapterId: result.adapterId,
      adapterName: result.adapterName,
      quoteMode: result.quoteMode,
    },
    network: result.network,
    inputAssetId: result.inputAssetId,
    outputAssetId: result.outputAssetId,
    reason: result.reason,
    message: result.message,
  };
}

export function normalizeAdapterSuccess(result: QuoteAdapterSuccess): RouteCandidate {
  return {
    id: result.routeId,
    label: result.label,
    source: {
      adapterId: result.adapterId,
      adapterName: result.adapterName,
      quoteMode: result.quoteMode,
    },
    network: result.network,
    inputAssetId: result.inputAssetId,
    outputAssetId: result.outputAssetId,
    grossOutput: result.grossOutput,
    fees: result.feeBreakdown,
    hops: result.routeHops,
    quoteTimestamp: result.quoteTimestamp,
    expiresAt: result.expiresAt,
    maxAgeMs: result.maxAgeMs,
    executable: result.executable,
    liquidityAda: result.liquidityAda,
    priceImpactPct: result.priceImpactPct,
    confidencePct: result.confidencePct,
    note: result.note,
  };
}
