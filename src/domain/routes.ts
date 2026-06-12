import type { AssetId } from "./assets";
import type { FeeBreakdown } from "./fees";

export type QuoteMode = "mock" | "fixture" | "live";
export type RouteStatus = "selected" | "available" | "rejected";
export type DecisionStatus = "valid" | "invalid" | "no_route";

export type RejectionReason =
  | "invalid_request"
  | "worse_net_output"
  | "stale_quote"
  | "failed_source"
  | "unsupported_pair"
  | "insufficient_liquidity"
  | "excessive_price_impact"
  | "below_improvement_buffer"
  | "non_executable_route";

export const REJECTION_LABELS: Record<RejectionReason, string> = {
  invalid_request: "Invalid request",
  worse_net_output: "Worse net output",
  stale_quote: "Stale quote",
  failed_source: "Failed source",
  unsupported_pair: "Unsupported pair",
  insufficient_liquidity: "Insufficient liquidity",
  excessive_price_impact: "Excessive price impact",
  below_improvement_buffer: "Below improvement buffer",
  non_executable_route: "Non-executable",
};

export type QuoteRequest = {
  inputAssetId: AssetId;
  outputAssetId: AssetId;
  amountIn: number;
  slippageTolerancePct: number;
  network: "preview" | "preprod" | "mainnet";
};

export type RouteHop = {
  venue: string;
  inputAssetId: AssetId;
  outputAssetId: AssetId;
};

export type CandidateSource = {
  adapterId: string;
  adapterName: string;
  quoteMode: QuoteMode;
};

export type RouteCandidate = {
  id: string;
  label: string;
  source: CandidateSource;
  network: QuoteRequest["network"];
  inputAssetId: AssetId;
  outputAssetId: AssetId;
  grossOutput: number;
  netOutput?: number;
  fees: FeeBreakdown;
  hops: RouteHop[];
  quoteTimestamp: string;
  expiresAt?: string;
  maxAgeMs?: number;
  executable: boolean;
  liquidityAda?: number;
  priceImpactPct: number;
  confidencePct: number;
  note: string;
};

export type AdapterFailureCandidate = {
  id: string;
  label: string;
  source: CandidateSource;
  network: QuoteRequest["network"];
  inputAssetId: AssetId;
  outputAssetId: AssetId;
  reason: RejectionReason;
  message: string;
};

export type EvaluatedRoute = RouteCandidate & {
  netOutput: number;
  totalFeesAda: number;
  status: RouteStatus;
  rejectionReason?: RejectionReason;
  rejectionMessage?: string;
};

export type RejectedRoute =
  | EvaluatedRoute
  | (AdapterFailureCandidate & {
      status: "rejected";
      rejectionReason: RejectionReason;
      rejectionMessage: string;
    });

export type RouteDecision = {
  request: QuoteRequest;
  status: DecisionStatus;
  selectedRoute?: EvaluatedRoute;
  rejectedRoutes: RejectedRoute[];
  candidateRoutes: EvaluatedRoute[];
  warnings: string[];
  quoteMode: QuoteMode;
  decisionTimestamp: string;
};
