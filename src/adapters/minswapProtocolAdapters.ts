import { FIRST_LIVE_PAIR } from "../config/networks";
import { createAggregatorLiveAdapter } from "./aggregatorLiveAdapter";

const adaSnekPair = {
  inputAssetId: FIRST_LIVE_PAIR.inputAssetId,
  outputAssetId: FIRST_LIVE_PAIR.outputAssetId,
};

export const wingRidersLiveReadOnlyAdapter = createAggregatorLiveAdapter({
  id: "wingriders-live-readonly",
  displayName: "WingRiders via Minswap",
  protocol: "WingRiders",
  pair: adaSnekPair,
});

export const wingRidersV2LiveReadOnlyAdapter = createAggregatorLiveAdapter({
  id: "wingriders-v2-live-readonly",
  displayName: "WingRiders V2 via Minswap",
  protocol: "WingRidersV2",
  pair: adaSnekPair,
});

export const vyFinanceLiveReadOnlyAdapter = createAggregatorLiveAdapter({
  id: "vyfinance-live-readonly",
  displayName: "VyFinance via Minswap",
  protocol: "VyFinance",
  pair: adaSnekPair,
});
