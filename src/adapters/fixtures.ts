import { ASSETS, LOVELACE_ASSET_ID } from "../domain/assets";
import type { QuoteRequest } from "../domain/routes";
import type { QuoteAdapterFailure, QuoteAdapterSuccess } from "./types";

const snek = ASSETS.find((asset) => asset.symbol === "SNEK")!;

export const fixtureRequest: QuoteRequest = {
  inputAssetId: LOVELACE_ASSET_ID,
  outputAssetId: snek.id,
  amountIn: 1_000,
  slippageTolerancePct: 0.5,
  network: "preview",
};

export const adapterSuccessFixture: QuoteAdapterSuccess = {
  ok: true,
  adapterId: "fixture-adapter",
  adapterName: "Fixture adapter",
  quoteMode: "fixture",
  network: "preview",
  inputAssetId: fixtureRequest.inputAssetId,
  outputAssetId: fixtureRequest.outputAssetId,
  routeId: "fixture-success",
  label: "Fixture success",
  grossOutput: 610_000,
  feeBreakdown: {
    dexFeeAda: 3,
    batcherFeeAda: 2,
    networkFeeAda: 0.2,
    aggregatorFeeAda: 0,
    minAdaRequirement: 0,
  },
  routeHops: [
    {
      venue: "FixtureSwap",
      inputAssetId: fixtureRequest.inputAssetId,
      outputAssetId: fixtureRequest.outputAssetId,
    },
  ],
  quoteTimestamp: "2026-06-11T12:00:00.000Z",
  expiresAt: "2026-06-11T12:01:00.000Z",
  executable: false,
  liquidityAda: 100_000,
  priceImpactPct: 0.2,
  confidencePct: 99,
  note: "Fixture success quote.",
};

export const adapterFailureFixture: QuoteAdapterFailure = {
  ok: false,
  adapterId: "fixture-adapter",
  adapterName: "Fixture adapter",
  quoteMode: "fixture",
  network: "preview",
  inputAssetId: fixtureRequest.inputAssetId,
  outputAssetId: fixtureRequest.outputAssetId,
  routeId: "fixture-failure",
  label: "Fixture failure",
  reason: "failed_source",
  message: "Fixture adapter failed closed.",
};
