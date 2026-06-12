import { describe, expect, it } from "vitest";
import {
  validateAdapterSuccess,
  validateAdapterFailure,
  validateAdapterResult,
  validateAllAdapterResults,
} from "./adapterValidation";
import type { QuoteAdapterSuccess, QuoteAdapterFailure } from "./types";
import type { QuoteRequest } from "../domain/routes";

const baseRequest: QuoteRequest = {
  inputAssetId: "lovelace",
  outputAssetId: "279c909f348e533da5808898f87f9a14bb2c3dfbbacccd631d927a3f534e454b",
  amountIn: 1000,
  slippageTolerancePct: 0.5,
  network: "mainnet",
};

const validSuccess: QuoteAdapterSuccess = {
  ok: true,
  adapterId: "test-adapter",
  adapterName: "Test Adapter",
  quoteMode: "live",
  network: "mainnet",
  inputAssetId: baseRequest.inputAssetId,
  outputAssetId: baseRequest.outputAssetId,
  routeId: "test-route",
  label: "Test Route",
  grossOutput: 500_000,
  feeBreakdown: {
    dexFeeAda: 0,
    batcherFeeAda: 0,
    networkFeeAda: 0,
    aggregatorFeeAda: 0,
    minAdaRequirement: 2,
  },
  routeHops: [
    {
      venue: "Test DEX",
      inputAssetId: baseRequest.inputAssetId,
      outputAssetId: baseRequest.outputAssetId,
    },
  ],
  quoteTimestamp: new Date().toISOString(),
  executable: false,
  priceImpactPct: 0.5,
  confidencePct: 90,
  note: "Test",
};

const validFailure: QuoteAdapterFailure = {
  ok: false,
  adapterId: "test-adapter",
  adapterName: "Test Adapter",
  quoteMode: "live",
  network: "mainnet",
  inputAssetId: baseRequest.inputAssetId,
  outputAssetId: baseRequest.outputAssetId,
  routeId: "test-failure",
  label: "Test Failure",
  reason: "unsupported_pair",
  message: "Pair not supported",
};

describe("validateAdapterSuccess", () => {
  it("returns no errors for a valid success result", () => {
    expect(validateAdapterSuccess(validSuccess, baseRequest)).toEqual([]);
  });

  it("detects inputAssetId mismatch", () => {
    const result = { ...validSuccess, inputAssetId: "wrong" };
    const errors = validateAdapterSuccess(result, baseRequest);
    expect(errors).toContain("inputAssetId mismatch: expected lovelace, got wrong");
  });

  it("detects outputAssetId mismatch", () => {
    const result = { ...validSuccess, outputAssetId: "wrong" };
    const errors = validateAdapterSuccess(result, baseRequest);
    expect(errors.some((e) => e.includes("outputAssetId mismatch"))).toBe(true);
  });

  it("detects negative grossOutput", () => {
    const result = { ...validSuccess, grossOutput: -1 };
    const errors = validateAdapterSuccess(result, baseRequest);
    expect(errors.some((e) => e.includes("grossOutput must be non-negative"))).toBe(true);
  });

  it("detects NaN grossOutput", () => {
    const result = { ...validSuccess, grossOutput: NaN };
    const errors = validateAdapterSuccess(result, baseRequest);
    expect(errors.some((e) => e.includes("grossOutput must be a finite number"))).toBe(true);
  });

  it("detects out-of-range priceImpactPct", () => {
    const tooHigh = { ...validSuccess, priceImpactPct: 150 };
    const tooLow = { ...validSuccess, priceImpactPct: -5 };
    expect(validateAdapterSuccess(tooHigh, baseRequest).some((e) => e.includes("priceImpactPct out of range"))).toBe(true);
    expect(validateAdapterSuccess(tooLow, baseRequest).some((e) => e.includes("priceImpactPct out of range"))).toBe(true);
  });

  it("detects missing feeBreakdown", () => {
    const result = { ...validSuccess, feeBreakdown: undefined as unknown as QuoteAdapterSuccess["feeBreakdown"] };
    const errors = validateAdapterSuccess(result, baseRequest);
    expect(errors).toContain("feeBreakdown is required");
  });

  it("detects negative fee values", () => {
    const result = {
      ...validSuccess,
      feeBreakdown: { ...validSuccess.feeBreakdown, dexFeeAda: -1 },
    };
    const errors = validateAdapterSuccess(result, baseRequest);
    expect(errors.some((e) => e.includes("dexFeeAda must be a non-negative"))).toBe(true);
  });

  it("detects empty routeHops", () => {
    const result = { ...validSuccess, routeHops: [] };
    const errors = validateAdapterSuccess(result, baseRequest);
    expect(errors).toContain("routeHops must be a non-empty array");
  });

  it("detects missing quoteTimestamp", () => {
    const result = { ...validSuccess, quoteTimestamp: "" };
    const errors = validateAdapterSuccess(result, baseRequest);
    expect(errors).toContain("quoteTimestamp is required");
  });

  it("rejects a failure result passed to success validator", () => {
    const result = { ...validSuccess, ok: false as const } as unknown as QuoteAdapterSuccess;
    const errors = validateAdapterSuccess(result, baseRequest);
    expect(errors).toContain("ok must be true for success results");
  });
});

describe("validateAdapterFailure", () => {
  it("returns no errors for a valid failure result", () => {
    expect(validateAdapterFailure(validFailure)).toEqual([]);
  });

  it("detects missing reason", () => {
    const result = { ...validFailure, reason: "" as QuoteAdapterFailure["reason"] };
    const errors = validateAdapterFailure(result);
    expect(errors).toContain("reason is required");
  });

  it("detects missing message", () => {
    const result = { ...validFailure, message: "" };
    const errors = validateAdapterFailure(result);
    expect(errors).toContain("message is required");
  });

  it("detects wrong ok flag", () => {
    const result = { ...validFailure, ok: true as const } as unknown as QuoteAdapterFailure;
    const errors = validateAdapterFailure(result);
    expect(errors).toContain("ok must be false for failure results");
  });
});

describe("validateAdapterResult", () => {
  it("dispatches to success validator for ok:true results", () => {
    const errors = validateAdapterResult(validSuccess, baseRequest);
    expect(errors).toEqual([]);
  });

  it("dispatches to failure validator for ok:false results", () => {
    const errors = validateAdapterResult(validFailure, baseRequest);
    expect(errors).toEqual([]);
  });
});

describe("validateAllAdapterResults", () => {
  it("returns 0 for an empty array", () => {
    expect(validateAllAdapterResults([], baseRequest)).toBe(0);
  });

  it("returns 0 when all results are valid", () => {
    expect(validateAllAdapterResults([validSuccess, validSuccess], baseRequest)).toBe(0);
  });

  it("returns count of invalid results", () => {
    const invalid = { ...validSuccess, grossOutput: -1 };
    const results = [validSuccess, invalid, validFailure, invalid];
    expect(validateAllAdapterResults(results, baseRequest)).toBe(2);
  });
});
