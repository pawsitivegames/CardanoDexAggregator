import { FIRST_LIVE_PAIR } from "../config/networks";
import { createAggregatorLiveAdapter } from "./aggregatorLiveAdapter";

export const sundaeSwapLiveReadOnlyAdapter = createAggregatorLiveAdapter({
  id: "sundaeswap-live-readonly",
  displayName: "SundaeSwap live",
  protocol: "SundaeSwapV3",
  pair: {
    inputAssetId: FIRST_LIVE_PAIR.inputAssetId,
    outputAssetId: FIRST_LIVE_PAIR.outputAssetId,
  },
});
