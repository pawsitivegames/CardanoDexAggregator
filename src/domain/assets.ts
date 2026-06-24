export type AssetId = string;

export type AssetMetadata = {
  id: AssetId;
  symbol: string;
  name: string;
  decimals: number;
  mockPriceAda: number;
};

export const LOVELACE_ASSET_ID = "lovelace";

export const ASSETS: AssetMetadata[] = [
  {
    id: LOVELACE_ASSET_ID,
    symbol: "ADA",
    name: "Cardano",
    decimals: 6,
    mockPriceAda: 1,
  },
  {
    id: "279c909f348e533da5808898f87f9a14bb2c3dfbbacccd631d927a3f534e454b",
    symbol: "SNEK",
    name: "Snek",
    decimals: 0,
    mockPriceAda: 0.002133176409662351,
  },
  {
    id: "29d222ce763455e3d7a09a665ce554f00ac89d2e99a1a83d267170c64d494e",
    symbol: "MIN",
    name: "Minswap",
    decimals: 6,
    mockPriceAda: 0.018786268639637727,
  },
  {
    id: "c48cbb3d5e57ed56e276bc45f99ab39abe94e6cd7ac39fb402da47ad0014df105553444d",
    symbol: "USDM",
    name: "USDM",
    decimals: 6,
    mockPriceAda: 2,
  },
  {
    id: "f66d78b4a3cb3d37afa0ec36461e51ecbde00f26c8f0a68f94b69880069555344",
    symbol: "iUSD",
    name: "iUSD",
    decimals: 6,
    mockPriceAda: 2.04,
  },
  {
    id: "1d7f33bd23d85e1a25d87d86fac4f199c3197a2f7afeb662a0f34e1e776f726c646d6f62696c65746f6b656e",
    symbol: "WMT",
    name: "World Mobile Token",
    decimals: 6,
    mockPriceAda: 0.15625,
  },
  {
    id: "asset1hoskyclearrouteplaceholder",
    symbol: "HOSKY",
    name: "Hosky",
    decimals: 0,
    mockPriceAda: 0.000000029,
  },
];

export function getAsset(assetId: AssetId): AssetMetadata | undefined {
  return ASSETS.find((asset) => asset.id === assetId);
}

export function requireAsset(assetId: AssetId): AssetMetadata {
  const asset = getAsset(assetId);
  if (!asset) {
    throw new Error(`Unknown asset ID ${assetId}`);
  }
  return asset;
}

export function assetBySymbol(symbol: string): AssetMetadata | undefined {
  return ASSETS.find((asset) => asset.symbol === symbol);
}
