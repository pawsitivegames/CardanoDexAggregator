import type { QuoteAdapterResult, QuoteAdapterSuccess, QuoteAdapterFailure } from "./types";
import type { QuoteRequest } from "../domain/routes";

/**
 * Validates that a QuoteAdapterSuccess has all required fields in expected ranges.
 * Returns validation errors as a human-readable string array.
 * Empty array means the result is valid.
 */
export function validateAdapterSuccess(
  result: QuoteAdapterSuccess,
  request: QuoteRequest,
): string[] {
  const errors: string[] = [];

  if (!result.ok) errors.push("ok must be true for success results");
  if (!result.adapterId) errors.push("adapterId is required");
  if (!result.adapterName) errors.push("adapterName is required");
  if (result.inputAssetId !== request.inputAssetId)
    errors.push(`inputAssetId mismatch: expected ${request.inputAssetId}, got ${result.inputAssetId}`);
  if (result.outputAssetId !== request.outputAssetId)
    errors.push(`outputAssetId mismatch: expected ${request.outputAssetId}, got ${result.outputAssetId}`);

  // Numeric validations
  if (typeof result.grossOutput !== "number" || !Number.isFinite(result.grossOutput))
    errors.push("grossOutput must be a finite number");
  if (result.grossOutput < 0)
    errors.push(`grossOutput must be non-negative, got ${result.grossOutput}`);

  if (typeof result.priceImpactPct !== "number" || !Number.isFinite(result.priceImpactPct))
    errors.push("priceImpactPct must be a finite number");
  if (result.priceImpactPct < 0 || result.priceImpactPct > 100)
    errors.push(`priceImpactPct out of range: ${result.priceImpactPct}`);

  if (typeof result.confidencePct !== "number" || !Number.isFinite(result.confidencePct))
    errors.push("confidencePct must be a finite number");

  // Fee breakdown validations
  const f = result.feeBreakdown;
  if (!f) {
    errors.push("feeBreakdown is required");
  } else {
    if (typeof f.dexFeeAda !== "number" || !Number.isFinite(f.dexFeeAda) || f.dexFeeAda < 0)
      errors.push("feeBreakdown.dexFeeAda must be a non-negative finite number");
    if (typeof f.batcherFeeAda !== "number" || !Number.isFinite(f.batcherFeeAda) || f.batcherFeeAda < 0)
      errors.push("feeBreakdown.batcherFeeAda must be a non-negative finite number");
    if (typeof f.networkFeeAda !== "number" || !Number.isFinite(f.networkFeeAda) || f.networkFeeAda < 0)
      errors.push("feeBreakdown.networkFeeAda must be a non-negative finite number");
    if (typeof f.aggregatorFeeAda !== "number" || !Number.isFinite(f.aggregatorFeeAda) || f.aggregatorFeeAda < 0)
      errors.push("feeBreakdown.aggregatorFeeAda must be a non-negative finite number");
    if (typeof f.minAdaRequirement !== "number" || !Number.isFinite(f.minAdaRequirement) || f.minAdaRequirement < 0)
      errors.push("feeBreakdown.minAdaRequirement must be a non-negative finite number");
  }

  // Route hops validation
  if (!Array.isArray(result.routeHops) || result.routeHops.length === 0)
    errors.push("routeHops must be a non-empty array");

  // Timestamp validation
  if (!result.quoteTimestamp) errors.push("quoteTimestamp is required");

  return errors;
}

/**
 * Validates that a QuoteAdapterFailure has required fields.
 */
export function validateAdapterFailure(
  result: QuoteAdapterFailure,
): string[] {
  const errors: string[] = [];

  if (result.ok !== false) errors.push("ok must be false for failure results");
  if (!result.adapterId) errors.push("adapterId is required");
  if (!result.reason) errors.push("reason is required");
  if (!result.message) errors.push("message is required");

  return errors;
}

/**
 * Validates an adapter result (success or failure).
 * Returns validation errors or an empty array if valid.
 * Logs warnings to console in development mode.
 */
export function validateAdapterResult(
  result: QuoteAdapterResult,
  request: QuoteRequest,
): string[] {
  if (result.ok) {
    return validateAdapterSuccess(result, request);
  }
  return validateAdapterFailure(result);
}

/**
 * Batch-validates all adapter results and logs a summary.
 * Returns the count of invalid results.
 */
export function validateAllAdapterResults(
  results: QuoteAdapterResult[],
  request: QuoteRequest,
): number {
  let invalidCount = 0;
  for (const result of results) {
    const errors = validateAdapterResult(result, request);
    if (errors.length > 0) {
      invalidCount++;
      if (import.meta.env.DEV) {
        console.warn(
          `[validation] ${result.adapterId} result has ${errors.length} issue(s):`,
          errors,
        );
      }
    }
  }
  return invalidCount;
}
