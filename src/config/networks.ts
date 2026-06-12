import { LOVELACE_ASSET_ID } from "../domain/assets";

export const MINSWAP_AGGREGATOR_BASE_URL = "https://agg-api.minswap.org/aggregator";
export const MINSWAP_AGGREGATOR_PREPROD_BASE_URL = "https://testnet-preprod.minswap.org/aggregator";
export const MINSWAP_POOL_BASE_URL = "https://api-mainnet-prod.minswap.org";
export const DEXHUNTER_BASE_URL = "https://api-us.dexhunterv3.app";
export const STEELSWAP_BASE_URL = "https://yoroi.steelswap.io";
export const CARDEXSCAN_BASE_URL = "https://cardexscan.com/api/cds";
export const SATURNSWAP_BASE_URL = "https://saturnswap.io/api/defi";
export const LIVE_QUOTE_NETWORK = "mainnet" as const;
export const EXECUTABLE_NETWORK = "preprod" as const;
export const LIVE_QUOTE_MAX_AGE_MS = 30_000;
export const LIVE_QUOTE_TIMEOUT_MS = 8_000;
export const TX_POLL_INTERVAL_MS = 5_000;
export const TX_POLL_TIMEOUT_MS = 120_000;
export const BLOCKFROST_PROJECT_ID: string = import.meta.env.VITE_BLOCKFROST_PROJECT_ID ?? "";
export const DEXHUNTER_PARTNER_ID: string = import.meta.env.VITE_DEXHUNTER_PARTNER_ID ?? "";
export const STEELSWAP_PARTNER: string = import.meta.env.VITE_STEELSWAP_PARTNER ?? "clearroute-aggregator";
export const CARDEXSCAN_API_KEY: string = import.meta.env.VITE_CARDEXSCAN_API_KEY ?? "";
export const SATURN_API_KEY: string = import.meta.env.VITE_SATURN_API_KEY ?? "";

export const FIRST_LIVE_PAIR = {
  inputAssetId: LOVELACE_ASSET_ID,
  outputAssetId: "279c909f348e533da5808898f87f9a14bb2c3dfbbacccd631d927a3f534e454b",
  protocol: "MinswapV2",
} as const;

export const BLOCKFROST_BASE_URLS: Record<string, string> = {
  preprod: "https://cardano-preprod.blockfrost.io/api/v0",
  preview: "https://cardano-preview.blockfrost.io/api/v0",
  mainnet: "https://cardano-mainnet.blockfrost.io/api/v0",
};

export const EXPLORER_URLS: Record<string, string> = {
  preprod: "https://preprod.cardanoscan.io/transaction",
  preview: "https://preview.cardanoscan.io/transaction",
  mainnet: "https://cardanoscan.io/transaction",
};
