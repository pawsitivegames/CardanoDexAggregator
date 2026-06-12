import { getAsset } from "./assets";
import type { QuoteRequest, RejectionReason } from "./routes";

export type ValidationFailure = {
  reason: RejectionReason;
  message: string;
};

export function validateQuoteRequest(request: QuoteRequest): ValidationFailure[] {
  const failures: ValidationFailure[] = [];

  if (!Number.isFinite(request.amountIn) || request.amountIn <= 0) {
    failures.push({
      reason: "invalid_request",
      message: "Input amount must be greater than zero.",
    });
  }

  if (request.inputAssetId === request.outputAssetId) {
    failures.push({
      reason: "invalid_request",
      message: "Input and output assets must be different.",
    });
  }

  if (!getAsset(request.inputAssetId)) {
    failures.push({
      reason: "invalid_request",
      message: "Input asset is not supported.",
    });
  }

  if (!getAsset(request.outputAssetId)) {
    failures.push({
      reason: "invalid_request",
      message: "Output asset is not supported.",
    });
  }

  if (!Number.isFinite(request.slippageTolerancePct) || request.slippageTolerancePct <= 0 || request.slippageTolerancePct > 100) {
    failures.push({
      reason: "invalid_request",
      message: "Slippage tolerance must be between 0 and 100 percent.",
    });
  }

  return failures;
}
