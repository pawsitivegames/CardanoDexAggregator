import { useQuery } from "@tanstack/react-query";
import type { QuoteRequest } from "../domain/routes";
import type { QuoteAdapterResult } from "../adapters/types";
import { validateAllAdapterResults } from "../adapters/adapterValidation";

type AdapterLike = {
  getQuotes: (request: QuoteRequest, now?: Date) => Promise<QuoteAdapterResult[]>;
};

export function useLiveQuotes(
  request: QuoteRequest,
  adapters: AdapterLike[],
) {
  return useQuery({
    queryKey: [
      "liveQuotes",
      request.inputAssetId,
      request.outputAssetId,
      request.amountIn,
      request.slippageTolerancePct,
      request.network,
    ],
    queryFn: async ({ signal }): Promise<QuoteAdapterResult[]> => {
      const settled = await Promise.allSettled(
        adapters.map((adapter) => adapter.getQuotes(request, new Date())),
      );
      const results: QuoteAdapterResult[] = [];
      for (const result of settled) {
        if (result.status === "fulfilled") {
          results.push(...result.value);
        }
      }
      validateAllAdapterResults(results, request);
      return results;
    },
    staleTime: 20_000,
    gcTime: 60_000,
    retry: 0,
    refetchOnWindowFocus: false,
  });
}
