import { ASSETS, LOVELACE_ASSET_ID, requireAsset } from "../domain/assets";
import type { QuoteRequest } from "../domain/routes";
import type { QuoteAdapter, QuoteAdapterFailure, QuoteAdapterResult, QuoteAdapterSuccess } from "./types";
import { EXECUTABLE_NETWORK, LIVE_QUOTE_NETWORK } from "../config/networks";

const minAsset = ASSETS.find((asset) => asset.symbol === "MIN")!;

const venueProfiles = [
  {
    id: "mock-minswap-direct",
    venue: "Minswap",
    label: "Minswap direct",
    liquidity: 1.0,
    feePct: 0.003,
    batcherFeeAda: 2,
    confidencePct: 97,
  },
  {
    id: "mock-sundae-direct",
    venue: "SundaeSwap",
    label: "Sundae direct",
    liquidity: 0.58,
    feePct: 0.003,
    batcherFeeAda: 2.5,
    confidencePct: 91,
  },
  {
    id: "mock-muesli-direct",
    venue: "MuesliSwap",
    label: "Muesli direct",
    liquidity: 0.42,
    feePct: 0.004,
    batcherFeeAda: 1.9,
    confidencePct: 88,
  },
];

function successBase(request: QuoteRequest, now: Date) {
  return {
    ok: true as const,
    adapterId: mockAdapter.id,
    adapterName: mockAdapter.displayName,
    quoteMode: mockAdapter.quoteMode,
    network: request.network,
    inputAssetId: request.inputAssetId,
    outputAssetId: request.outputAssetId,
    quoteTimestamp: now.toISOString(),
    expiresAt: new Date(now.getTime() + 45_000).toISOString(),
    maxAgeMs: 45_000,
    executable: false,
  };
}

function unsupported(request: QuoteRequest): QuoteAdapterFailure {
  return {
    ok: false,
    adapterId: mockAdapter.id,
    adapterName: mockAdapter.displayName,
    quoteMode: mockAdapter.quoteMode,
    network: request.network,
    inputAssetId: request.inputAssetId,
    outputAssetId: request.outputAssetId,
    routeId: "mock-unsupported-pair",
    label: "Mock unsupported pair",
    reason: "unsupported_pair",
    message: "Mock adapter currently supports ADA input routes only.",
  };
}

export const mockAdapter: QuoteAdapter = {
  id: "mock-cardano-routes",
  displayName: "Mock Cardano route simulator",
  quoteMode: "mock",
  getQuotes(request: QuoteRequest, now = new Date()): QuoteAdapterResult[] {
    if (request.network === LIVE_QUOTE_NETWORK) {
      return [];
    }

    if (request.inputAssetId !== LOVELACE_ASSET_ID) {
      return [unsupported(request)];
    }

    const input = requireAsset(request.inputAssetId);
    const output = requireAsset(request.outputAssetId);
    const amountInAdaValue = request.amountIn * input.mockPriceAda;

    const directRoutes: QuoteAdapterSuccess[] = venueProfiles.map((profile) => {
      const tradeSizePenalty = Math.min(0.055, amountInAdaValue / (360_000 * profile.liquidity));
      const grossOutput = (amountInAdaValue * (1 - profile.feePct - tradeSizePenalty)) / output.mockPriceAda;

      return {
        ...successBase(request, now),
        routeId: profile.id,
        label: profile.label,
        grossOutput,
        feeBreakdown: {
          dexFeeAda: amountInAdaValue * profile.feePct,
          batcherFeeAda: profile.batcherFeeAda,
          networkFeeAda: 0.23,
          aggregatorFeeAda: 0,
          minAdaRequirement: 0,
        },
        routeHops: [
          {
            venue: profile.venue,
            inputAssetId: request.inputAssetId,
            outputAssetId: request.outputAssetId,
          },
        ],
        liquidityAda: 360_000 * profile.liquidity,
        priceImpactPct: tradeSizePenalty * 100,
        confidencePct: profile.confidencePct,
        note:
          profile.venue === "Minswap"
            ? "Baseline direct route. Aggregation must beat this after fees."
            : "Useful only when its pool depth beats the baseline route.",
      };
    });

    const splitBenefit =
      amountInAdaValue > 10_000 ? 0.008 : amountInAdaValue > 1_000 ? 0.004 : 0.001;
    const routeComplexityPenalty = amountInAdaValue < 2_500 ? 0.002 : 0.0008;
    const aggregated: QuoteAdapterSuccess = {
      ...successBase(request, now),
      routeId: "mock-aggregated-split",
      label: "Aggregated split",
      grossOutput: (amountInAdaValue * (1 + splitBenefit - routeComplexityPenalty)) / output.mockPriceAda,
      feeBreakdown: {
        dexFeeAda: amountInAdaValue * 0.0042,
        batcherFeeAda: 3.5,
        networkFeeAda: 0.4,
        aggregatorFeeAda: Math.max(0.5, amountInAdaValue * 0.0008),
        minAdaRequirement: 0,
      },
      routeHops: [
        {
          venue: "Minswap",
          inputAssetId: request.inputAssetId,
          outputAssetId: minAsset.id,
        },
        {
          venue: "SundaeSwap",
          inputAssetId: minAsset.id,
          outputAssetId: request.outputAssetId,
        },
      ],
      liquidityAda: 250_000,
      priceImpactPct: Math.max(0.12, 0.42 - amountInAdaValue / 100_000),
      confidencePct: amountInAdaValue > 10_000 ? 93 : 84,
      note: "Only selected if split execution beats every direct DEX on net received.",
    };

    const simulatedFailure: QuoteAdapterFailure = {
      ok: false,
      adapterId: "mock-failing-source",
      adapterName: "Mock failing venue",
      quoteMode: "mock",
      network: request.network,
      inputAssetId: request.inputAssetId,
      outputAssetId: request.outputAssetId,
      routeId: "mock-failed-source",
      label: "Mock failed source",
      reason: "failed_source",
      message: "Simulated adapter failure for failure-normalization coverage.",
    };

    const isExecutableNetwork = request.network === EXECUTABLE_NETWORK;

    if (isExecutableNetwork) {
      const minswapExecutable: QuoteAdapterSuccess = {
        ...successBase(request, now),
        routeId: "mock-preprod-minswap-executable",
        label: "Minswap (preprod executable)",
        grossOutput: (amountInAdaValue * (1 - 0.0028)) / output.mockPriceAda,
        feeBreakdown: {
          dexFeeAda: amountInAdaValue * 0.0028,
          batcherFeeAda: 1.5,
          networkFeeAda: 0.18,
          aggregatorFeeAda: 0,
          minAdaRequirement: 0,
        },
        routeHops: [
          {
            venue: "Minswap",
            inputAssetId: request.inputAssetId,
            outputAssetId: request.outputAssetId,
          },
        ],
        liquidityAda: 360_000,
        priceImpactPct: Math.min(4.5, (amountInAdaValue / 360_000) * 100),
        confidencePct: 95,
        executable: true,
        note: `Executable Minswap V2 route on ${EXECUTABLE_NETWORK}. Simulates Minswap Aggregator API.`,
      };

      const dexhunterExecutable: QuoteAdapterSuccess = {
        ...successBase(request, now),
        routeId: "mock-preprod-dexhunter-executable",
        label: "DexHunter (preprod executable)",
        grossOutput: (amountInAdaValue * (1 - 0.0028)) / output.mockPriceAda,
        feeBreakdown: {
          dexFeeAda: amountInAdaValue * 0.0028,
          batcherFeeAda: 1.2,
          networkFeeAda: 0.18,
          aggregatorFeeAda: 0,
          minAdaRequirement: 0,
        },
        routeHops: [
          { venue: "Minswap", inputAssetId: request.inputAssetId, outputAssetId: request.outputAssetId },
        ],
        liquidityAda: 420_000,
        priceImpactPct: Math.min(4.5, (amountInAdaValue / 420_000) * 100),
        confidencePct: 93,
        executable: true,
        note: `Executable DexHunter route on ${EXECUTABLE_NETWORK}. 75% of Cardano swap volume.`,
      };

      const steelswapExecutable: QuoteAdapterSuccess = {
        ...successBase(request, now),
        routeId: "mock-preprod-steelswap-executable",
        label: "Steelswap (preprod executable)",
        grossOutput: (amountInAdaValue * (1 - 0.0022)) / output.mockPriceAda,
        feeBreakdown: {
          dexFeeAda: 0,
          batcherFeeAda: 0,
          networkFeeAda: 0.15,
          aggregatorFeeAda: 0,
          minAdaRequirement: 0,
        },
        routeHops: [
          { venue: "SundaeSwap", inputAssetId: request.inputAssetId, outputAssetId: request.outputAssetId },
        ],
        liquidityAda: 310_000,
        priceImpactPct: Math.min(3.5, (amountInAdaValue / 310_000) * 100),
        confidencePct: 90,
        executable: true,
        note: `Executable Steelswap route on ${EXECUTABLE_NETWORK}. Zero fees for single-DEX swaps.`,
      };

      const cardexscanExecutable: QuoteAdapterSuccess = {
        ...successBase(request, now),
        routeId: "mock-preprod-cardexscan-executable",
        label: "Cardexscan (preprod executable)",
        grossOutput: (amountInAdaValue * (1 - 0.003)) / output.mockPriceAda,
        feeBreakdown: {
          dexFeeAda: 0,
          batcherFeeAda: 1.5,
          networkFeeAda: 0.18,
          aggregatorFeeAda: 0.4,
          minAdaRequirement: 0,
        },
        routeHops: [
          { venue: "ShadowBook", inputAssetId: request.inputAssetId, outputAssetId: request.outputAssetId },
        ],
        liquidityAda: 280_000,
        priceImpactPct: Math.min(4.5, (amountInAdaValue / 280_000) * 100),
        confidencePct: 87,
        executable: true,
        note: `Executable Cardexscan route on ${EXECUTABLE_NETWORK}. P2P marketplace + AMM routing.`,
      };

      const saturnswapExecutable: QuoteAdapterSuccess = {
        ...successBase(request, now),
        routeId: "mock-preprod-saturnswap-executable",
        label: "SaturnSwap (preprod executable)",
        grossOutput: (amountInAdaValue * (1 - 0.0018)) / output.mockPriceAda,
        feeBreakdown: {
          dexFeeAda: amountInAdaValue * 0.0018,
          batcherFeeAda: 0,
          networkFeeAda: 0.15,
          aggregatorFeeAda: 0,
          minAdaRequirement: 0,
        },
        routeHops: [
          { venue: "SaturnSwap", inputAssetId: request.inputAssetId, outputAssetId: request.outputAssetId },
        ],
        liquidityAda: 500_000,
        priceImpactPct: Math.min(3, (amountInAdaValue / 500_000) * 100),
        confidencePct: 96,
        executable: true,
        note: `Executable SaturnSwap route on ${EXECUTABLE_NETWORK}. CLOB model — no batcher, instant swaps.`,
      };

      return [
        ...directRoutes,
        aggregated,
        minswapExecutable,
        dexhunterExecutable,
        steelswapExecutable,
        cardexscanExecutable,
        saturnswapExecutable,
        simulatedFailure,
      ];
    }

    return [...directRoutes, aggregated, simulatedFailure];
  },
};
