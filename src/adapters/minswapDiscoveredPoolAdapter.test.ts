import { describe, expect, it } from "vitest";
import { dottedLpToken, minswapAssetUnit, minswapFeeTierToBps } from "./minswapDiscoveredPoolAdapter";

describe("minswapDiscoveredPoolAdapter helpers", () => {
  it("converts Minswap percent fee tiers to bps", () => {
    expect(minswapFeeTierToBps(0.3)).toBe(30);
    expect(minswapFeeTierToBps(1)).toBe(100);
  });

  it("formats concatenated LP tokens for the pool metrics endpoint", () => {
    const lp =
      "f5808c2c990d86da54bfc97d89cee6efa20cd8461616359478d96b4ceb1fa227ffc87df5e235dfbb0130d151f620cd585abb067ad50ea619dba0fc05";
    expect(dottedLpToken(lp)).toBe(
      "f5808c2c990d86da54bfc97d89cee6efa20cd8461616359478d96b4c.eb1fa227ffc87df5e235dfbb0130d151f620cd585abb067ad50ea619dba0fc05",
    );
  });

  it("normalizes Minswap asset units", () => {
    expect(minswapAssetUnit({ currency_symbol: "", token_name: "" })).toBe("lovelace");
    expect(minswapAssetUnit({ currency_symbol: "policy", token_name: "asset" })).toBe("policyasset");
  });
});
